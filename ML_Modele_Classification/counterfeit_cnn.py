"""Counterfeit detection - custom CNN, training and evaluation (step 5).

This script defines our own compact CNN (trained from scratch, no pretrained
weights), trains it on the existing data pipeline and reports metrics.

It REUSES `counterfeit_starter.py` (same folder) for all data handling:
configuration (DATA_DIR, split names, IMG_SIZE, BATCH_SIZE), the resized
cache, the augmentation and the DataLoaders. Nothing about the data
processing is duplicated or changed here.

Prerequisites
-------------
1. `counterfeit_starter.py` is configured (DATA_DIR and split folder names).
2. The resized cache exists: run `python counterfeit_starter.py` once.

Usage
-----
    python counterfeit_cnn.py                    # train, validate, save best model
    python counterfeit_cnn.py --seed 1           # another seed (repeat 3-5 times)
    python counterfeit_cnn.py --evaluate-test    # FINAL evaluation on the test set

Rules we follow
---------------
- The model is selected on the VALIDATION set (lowest validation loss).
- The test set is only used with --evaluate-test, once, at the very end.
- The primary metric is the recall on the `counterfeit` class: a missed
  counterfeit costs more than a false alarm.

Outputs (in --output-dir, default runs/cnn_seed<seed>)
------------------------------------------------------
    best_model.pt   weights of the epoch with the lowest validation loss
    history.csv     per-epoch losses and validation metrics
    curves.png      loss and recall curves (if matplotlib is installed)
"""
import argparse
import csv
import random
import time
from collections import Counter
from pathlib import Path

import torch
from torch import nn

import image_treatment_V1 as cs  # data pipeline and configuration

device = cs.device
POSITIVE_CLASS = "counterfeit"  # the class we most want to catch


# ---- Reproducibility ---------------------------------------------------------
def set_seed(seed: int) -> None:
    """Seed Python and PyTorch RNGs (shuffling, augmentation, weight init).

    Note: bit-for-bit reproducibility is not guaranteed on Apple's MPS
    backend, so repeat runs with several seeds and report mean and std.

    Args:
        seed: Integer seed.
    """
    random.seed(seed)
    torch.manual_seed(seed)


# ---- Model -------------------------------------------------------------------
def conv_block(in_channels: int, out_channels: int) -> nn.Sequential:
    """Build one convolutional block: Conv -> BatchNorm -> ReLU -> MaxPool.

    - Conv2d (3x3, padding 1): learns `out_channels` local filters. The bias
      is disabled because BatchNorm already has a learnable shift.
    - BatchNorm2d: normalizes each channel; stabilizes and speeds up training.
    - ReLU: non-linearity, so stacked layers can learn complex functions.
    - MaxPool2d(2): halves height and width, keeping the strongest responses.

    Args:
        in_channels: Number of input channels (feature maps).
        out_channels: Number of filters, i.e. output channels.

    Returns:
        The block as an nn.Sequential.
    """
    return nn.Sequential(
        nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1, bias=False),
        nn.BatchNorm2d(out_channels),
        nn.ReLU(inplace=True),
        nn.MaxPool2d(2),
    )


class CounterfeitCNN(nn.Module):
    """Compact CNN for genuine vs. counterfeit classification.

    Architecture (default: 4 blocks, 32 base filters, input 3 x 384 x 384):

        Block 1: 3   -> 32  filters, output  32 x 192 x 192
        Block 2: 32  -> 64  filters, output  64 x  96 x  96
        Block 3: 64  -> 128 filters, output 128 x  48 x  48
        Block 4: 128 -> 256 filters, output 256 x  24 x  24
        Global average pooling       -> 256 values
        Dropout + Linear             -> 2 class scores (logits)

    Each block halves the spatial size and doubles the number of filters.
    With the defaults the model has about 0.39 million parameters.

    Args:
        num_classes: Number of output classes.
        base_filters: Filters in the first block (doubled at every block).
        num_blocks: Number of convolutional blocks.
        dropout: Probability of zeroing a feature before the classifier
            (training only).
    """

    def __init__(self, num_classes: int = 2, base_filters: int = 32,
                 num_blocks: int = 4, dropout: float = 0.4) -> None:
        super().__init__()
        channels = [3] + [base_filters * 2 ** i for i in range(num_blocks)]
        self.features = nn.Sequential(
            *[conv_block(channels[i], channels[i + 1]) for i in range(num_blocks)]
        )
        self.pool = nn.AdaptiveAvgPool2d(1)  # one value per feature map
        self.dropout = nn.Dropout(dropout)
        self.classifier = nn.Linear(channels[-1], num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Compute class scores.

        Args:
            x: Batch of images, shape (N, 3, H, W).

        Returns:
            Logits of shape (N, num_classes).
        """
        x = self.features(x)
        x = self.pool(x).flatten(1)
        x = self.dropout(x)
        return self.classifier(x)


def count_parameters(model: nn.Module) -> int:
    """Return the number of trainable parameters of a model."""
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


# ---- Training and evaluation -------------------------------------------------
def class_weights(train_loader, num_classes: int) -> torch.Tensor:
    """Compute inverse-frequency class weights from the training set.

    Rare classes get a larger weight in the loss. With balanced classes the
    weights are close to 1 and have almost no effect.

    Args:
        train_loader: Training DataLoader (its dataset must expose `targets`).
        num_classes: Number of classes.

    Returns:
        Float tensor of shape (num_classes,), indexed by class index.
    """
    counts = Counter(train_loader.dataset.targets)
    total = sum(counts.values())
    weights = [total / (num_classes * counts[c]) for c in range(num_classes)]
    return torch.tensor(weights, dtype=torch.float32)


def train_one_epoch(model, loader, criterion, optimizer) -> float:
    """Run one training epoch.

    Args:
        model: The network (switched to train mode).
        loader: Training DataLoader.
        criterion: Loss function.
        optimizer: Optimizer.

    Returns:
        Mean training loss over the epoch.
    """
    model.train()
    total_loss, n = 0.0, 0
    for images, labels in loader:
        images, labels = images.to(device), labels.to(device)
        optimizer.zero_grad(set_to_none=True)
        loss = criterion(model(images), labels)
        loss.backward()
        optimizer.step()
        total_loss += loss.item() * images.size(0)
        n += images.size(0)
    return total_loss / n


@torch.no_grad()
def evaluate(model, loader, criterion, positive_idx: int) -> dict:
    """Evaluate the model on a DataLoader.

    The "positive" class is the counterfeit class: a true positive is a
    counterfeit correctly flagged, a false negative is a counterfeit that
    slipped through (the costly error).

    Args:
        model: The network (switched to eval mode).
        loader: DataLoader to evaluate on (validation or test).
        criterion: Loss function.
        positive_idx: Label index of the counterfeit class.

    Returns:
        Dict with loss, accuracy, recall, precision, f1 (all for the
        counterfeit class except loss/accuracy) and tp, fp, fn, tn counts.
    """
    model.eval()
    total_loss, n = 0.0, 0
    tp = fp = fn = tn = 0
    for images, labels in loader:
        images, labels = images.to(device), labels.to(device)
        logits = model(images)
        total_loss += criterion(logits, labels).item() * images.size(0)
        n += images.size(0)
        pred_pos = logits.argmax(dim=1) == positive_idx
        true_pos = labels == positive_idx
        tp += (pred_pos & true_pos).sum().item()
        fp += (pred_pos & ~true_pos).sum().item()
        fn += (~pred_pos & true_pos).sum().item()
        tn += (~pred_pos & ~true_pos).sum().item()
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    return {
        "loss": total_loss / n, "accuracy": (tp + tn) / n,
        "recall": recall, "precision": precision, "f1": f1,
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
    }


def print_confusion(m: dict) -> None:
    """Print the confusion matrix (rows = truth, columns = prediction)."""
    print("                    pred counterfeit   pred genuine")
    print(f"  true counterfeit  {m['tp']:16d}   {m['fn']:12d}")
    print(f"  true genuine      {m['fp']:16d}   {m['tn']:12d}")


# ---- Reporting ---------------------------------------------------------------
def save_history(history: list, path: Path) -> None:
    """Write the per-epoch history to a CSV file."""
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(history[0].keys()))
        writer.writeheader()
        writer.writerows(history)


def plot_history(history: list, path: Path) -> None:
    """Save loss and recall curves as a PNG (skipped if matplotlib is missing)."""
    try:
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib not installed: skipping curves.png (pip install matplotlib)")
        return
    epochs = [h["epoch"] for h in history]
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 4))
    ax1.plot(epochs, [h["train_loss"] for h in history], label="train")
    ax1.plot(epochs, [h["val_loss"] for h in history], label="validation")
    ax1.set_xlabel("epoch")
    ax1.set_ylabel("loss")
    ax1.legend()
    ax2.plot(epochs, [h["val_recall"] for h in history])
    ax2.set_xlabel("epoch")
    ax2.set_ylabel("validation recall (counterfeit)")
    fig.tight_layout()
    fig.savefig(path, dpi=120)
    plt.close(fig)


# ---- Main --------------------------------------------------------------------
def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    p = argparse.ArgumentParser(description="Train the custom counterfeit-detection CNN.")
    p.add_argument("--epochs", type=int, default=40, help="maximum number of epochs")
    p.add_argument("--patience", type=int, default=8,
                   help="stop after this many epochs without validation-loss improvement")
    p.add_argument("--lr", type=float, default=1e-3, help="initial learning rate")
    p.add_argument("--weight-decay", type=float, default=1e-2, help="AdamW weight decay")
    p.add_argument("--base-filters", type=int, default=32, help="filters in the first block")
    p.add_argument("--num-blocks", type=int, default=4, help="number of conv blocks")
    p.add_argument("--dropout", type=float, default=0.4, help="dropout before the classifier")
    p.add_argument("--seed", type=int, default=42, help="random seed")
    p.add_argument("--output-dir", type=Path, default=None,
                   help="where to save outputs (default: runs/cnn_seed<seed>)")
    p.add_argument("--evaluate-test", action="store_true",
                   help="skip training; evaluate the saved best model on the TEST set")
    return p.parse_args()


def main() -> None:
    """Train (or evaluate) the custom CNN on the existing data pipeline."""
    args = parse_args()
    output_dir = args.output_dir or Path("runs") / f"cnn_seed{args.seed}"
    output_dir.mkdir(parents=True, exist_ok=True)
    set_seed(args.seed)
    print("Device:", device)

    # Data: exactly the pipeline defined in counterfeit_starter.py.
    cs.require_dir(cs.CACHE_DIR / "splits")  # fails clearly if the cache is missing
    (train_loader, val_loader, test_loader), class_to_idx = cs.make_loaders(cs.CACHE_DIR)
    positive_idx = class_to_idx[POSITIVE_CLASS]
    num_classes = len(class_to_idx)
    print("Class mapping:", class_to_idx)

    model = CounterfeitCNN(num_classes, args.base_filters, args.num_blocks, args.dropout).to(device)
    print(f"Model: {count_parameters(model):,} trainable parameters")

    weights = class_weights(train_loader, num_classes).to(device)
    criterion = nn.CrossEntropyLoss(weight=weights)
    checkpoint_path = output_dir / "best_model.pt"

    # ---- Final evaluation on the test set (use once, at the very end) -------
    if args.evaluate_test:
        checkpoint = torch.load(checkpoint_path, map_location=device)
        model.load_state_dict(checkpoint["model_state"])
        m = evaluate(model, test_loader, criterion, positive_idx)
        print("\nTEST SET RESULTS")
        print(f"  accuracy {m['accuracy']:.4f} | recall (counterfeit) {m['recall']:.4f} | "
              f"precision {m['precision']:.4f} | F1 {m['f1']:.4f}")
        print_confusion(m)
        return

    # Reference points for reading the results.
    val_counts = Counter(val_loader.dataset.targets)
    majority = max(val_counts.values()) / sum(val_counts.values())
    print(f"Reference: always predicting the majority class gives {majority:.3f} "
          "validation accuracy; the model must clearly beat it.")

    # Sanity check: one forward pass on a real batch.
    images, _ = next(iter(train_loader))
    with torch.no_grad():
        model.eval()
        print("Sanity check, output shape:", tuple(model(images.to(device)).shape))

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="min", factor=0.5, patience=3)

    history, best_val_loss, stale = [], float("inf"), 0
    for epoch in range(1, args.epochs + 1):
        start = time.time()
        train_loss = train_one_epoch(model, train_loader, criterion, optimizer)
        val = evaluate(model, val_loader, criterion, positive_idx)
        scheduler.step(val["loss"])
        lr = optimizer.param_groups[0]["lr"]
        history.append({
            "epoch": epoch, "train_loss": train_loss, "val_loss": val["loss"],
            "val_accuracy": val["accuracy"], "val_recall": val["recall"],
            "val_precision": val["precision"], "val_f1": val["f1"], "lr": lr,
        })
        print(f"epoch {epoch:3d} | train loss {train_loss:.4f} | val loss {val['loss']:.4f} | "
              f"val acc {val['accuracy']:.3f} | val recall {val['recall']:.3f} | "
              f"lr {lr:.1e} | {time.time() - start:.0f}s")

        if val["loss"] < best_val_loss:
            best_val_loss, stale = val["loss"], 0
            torch.save({
                "model_state": model.state_dict(), "class_to_idx": class_to_idx,
                "img_size": cs.IMG_SIZE, "epoch": epoch, "args": vars(args),
            }, checkpoint_path)
        else:
            stale += 1
            if stale >= args.patience:
                print(f"Early stopping: no validation-loss improvement for {args.patience} epochs.")
                break

    save_history(history, output_dir / "history.csv")
    plot_history(history, output_dir / "curves.png")

    # Report the validation metrics of the selected (best) model.
    checkpoint = torch.load(checkpoint_path, map_location=device)
    model.load_state_dict(checkpoint["model_state"])
    best = evaluate(model, val_loader, criterion, positive_idx)
    print(f"\nBest model: epoch {checkpoint['epoch']} (selected on validation loss)")
    print(f"  validation accuracy {best['accuracy']:.4f} | recall (counterfeit) "
          f"{best['recall']:.4f} | precision {best['precision']:.4f} | F1 {best['f1']:.4f}")
    print_confusion(best)
    print(f"\nSaved to {output_dir}. When all choices are final, run once with --evaluate-test.")


if __name__ == "__main__":
    main()