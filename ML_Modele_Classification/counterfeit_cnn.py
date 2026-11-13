"""Counterfeit detection - custom CNN, training and evaluation (step 5), version 2.

This script defines our own compact CNN (trained from scratch, no pretrained
weights), trains it on the existing data pipeline and reports metrics.

It REUSES the data-preparation script (`image_treatment_V2.py`, which must be
in the same folder) for all data handling:
configuration (DATA_DIR, split names, IMG_SIZE, BATCH_SIZE), the resized
cache, the augmentation and the DataLoaders. Nothing about the data
processing is duplicated here; only IMG_SIZE can be overridden with
--img-size for the resolution ablation.

Changes compared with version 1
-------------------------------
- Uses image_treatment_V2 (V1 stops at the first damaged image).
- Fix: the checkpoint is saved with plain values only, so it loads with the
  safe default of recent PyTorch versions (`--output-dir` used to crash the
  final report with "Unsupported global: PosixPath").
- Fix: --evaluate-test rebuilds the network and the input size from the
  checkpoint, so the test is always run with the trained architecture and
  IMG_SIZE (mismatching flags used to crash or, for IMG_SIZE, to give silently
  wrong results).
- ROC-AUC is reported in addition to recall, precision, F1 and the confusion
  matrix (as planned in the project brief).
- --img-size for the resolution ablation; the default output folder contains
  the size and the seed, e.g. runs/cnn_384px_seed42.
- Validation and test metrics are saved as JSON, and --summarize reports the
  mean and standard deviation over seeds for every configuration.
- The history is saved after every epoch (nothing lost if a run is stopped).
- A clear error if the validation or test set does not contain both classes
  (an incomplete download makes model selection meaningless).

Prerequisites
-------------
1. The data-preparation script is configured (DATA_DIR and split folder names).
2. The resized cache exists: run `python image_treatment_V2.py` once.

Usage
-----
    python counterfeit_cnn_V2.py                     # train, validate, save best model
    python counterfeit_cnn_V2.py --seed 1            # another seed (repeat 3-5 times)
    python counterfeit_cnn_V2.py --img-size 224      # resolution ablation (224, 320, 384, 512)
    python counterfeit_cnn_V2.py --summarize         # mean +- SD over seeds, per configuration
    python counterfeit_cnn_V2.py --choose-threshold --output-dir runs/cnn_384px_seed1
                                                     # pick the threshold on VALIDATION, store it in best_model.pt
    python counterfeit_cnn_V2.py --evaluate-test --output-dir runs/cnn_384px_seed1
                                                     # FINAL test evaluation (stored threshold)
    python counterfeit_cnn_V2.py --evaluate-test --threshold 0.39 --output-dir ...
                                                     # same, explicit threshold (from validation!)

The model itself (CounterfeitCNN, conv_block) is defined in model.py.
best_model.pt also stores positive_class, threshold, dataset and preprocess,
which the web app (app.py) reads.

Rules we follow
---------------
- The model is selected on the VALIDATION set (lowest validation loss).
- The test set is only used with --evaluate-test, once per final model, at the very end.
- The primary metric is the recall on the `counterfeit` class: a missed
  counterfeit costs more than a false alarm.

Outputs (in --output-dir, default runs/cnn_<size>px_seed<seed>)
-------------------------------------------------------------
    best_model.pt       weights of the epoch with the lowest validation loss
    history.csv         per-epoch losses and validation metrics
    curves.png          loss and recall curves (if matplotlib is installed)
    val_metrics.json    validation metrics of the selected model
    test_metrics.json   test metrics (only after --evaluate-test)
"""
import argparse
import csv
import json
import random
import statistics
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import math

import torch
from torch import nn
from torchvision import transforms

import image_treatment_V2 as cs  # data pipeline and configuration (must be in the same folder)
from model import CounterfeitCNN, conv_block  # noqa: F401  (CHANGED: model moved to model.py)

device = cs.device
POSITIVE_CLASS = "counterfeit"  # default of --positive-class (the class we most want to catch)
DEFAULT_THRESHOLD = 0.5  # stored in new checkpoints until --choose-threshold replaces it
ARCH_KEYS = ("base_filters", "num_blocks", "dropout")  # arguments that define the network


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
# CHANGED: CounterfeitCNN and conv_block now live in model.py (unchanged code),
# so the web app can rebuild the network without importing this pipeline.


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


def roc_auc(scores: list[float], labels: list[int]) -> float:
    """Area under the ROC curve, computed from ranks (no extra package needed).

    Equals the probability that a randomly chosen counterfeit receives a
    higher counterfeit score than a randomly chosen genuine note (ties count
    half). 0.5 is chance level, 1.0 a perfect ranking.

    Args:
        scores: Predicted probability of the positive class per image.
        labels: 1 for the positive class, 0 otherwise.

    Returns:
        The AUC, or NaN if one of the two classes is missing.
    """
    order = sorted(range(len(scores)), key=lambda i: scores[i])
    ranks = [0.0] * len(scores)
    i = 0
    while i < len(order):  # average ranks for tied scores
        j = i
        while j + 1 < len(order) and scores[order[j + 1]] == scores[order[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2 + 1
        i = j + 1
    n_pos = sum(labels)
    n_neg = len(labels) - n_pos
    if n_pos == 0 or n_neg == 0:
        return float("nan")
    rank_sum = sum(r for r, label in zip(ranks, labels) if label == 1)
    return (rank_sum - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg)


@torch.no_grad()
def evaluate(model, loader, criterion, positive_idx: int, threshold: float | None = None) -> dict:
    """Evaluate the model on a DataLoader.

    The "positive" class is the counterfeit class: a true positive is a
    counterfeit correctly flagged, a false negative is a counterfeit that
    slipped through (the costly error).

    Args:
        model: The network (switched to eval mode).
        loader: DataLoader to evaluate on (validation or test).
        criterion: Loss function.
        positive_idx: Label index of the counterfeit class.
        threshold: CHANGED. None (default, used during training) keeps the
            original argmax decision. A float predicts the positive class when
            P(positive) >= threshold (used by --evaluate-test).

    Returns:
        Dict with loss, accuracy, recall, precision, f1 (all for the
        counterfeit class except loss/accuracy), roc_auc and tp, fp, fn, tn counts.
    """
    model.eval()
    total_loss, n = 0.0, 0
    tp = fp = fn = tn = 0
    scores, truth = [], []
    for images, labels in loader:
        images, labels = images.to(device), labels.to(device)
        logits = model(images)
        total_loss += criterion(logits, labels).item() * images.size(0)
        n += images.size(0)
        prob_pos = torch.softmax(logits, dim=1)[:, positive_idx]
        if threshold is None:
            pred_pos = logits.argmax(dim=1) == positive_idx
        else:
            pred_pos = prob_pos >= threshold
        true_pos = labels == positive_idx
        tp += (pred_pos & true_pos).sum().item()
        fp += (pred_pos & ~true_pos).sum().item()
        fn += (~pred_pos & true_pos).sum().item()
        tn += (~pred_pos & ~true_pos).sum().item()
        scores += prob_pos.cpu().tolist()
        truth += true_pos.int().cpu().tolist()
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    return {
        "loss": total_loss / n, "accuracy": (tp + tn) / n,
        "recall": recall, "precision": precision, "f1": f1, "roc_auc": roc_auc(scores, truth),
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
    }


def print_metrics(title: str, m: dict) -> None:
    """Print the main metrics and the confusion matrix (rows = truth, columns = prediction)."""
    print(f"\n{title}")
    print(f"  accuracy {m['accuracy']:.4f} | recall (counterfeit) {m['recall']:.4f} | "
          f"precision {m['precision']:.4f} | F1 {m['f1']:.4f} | ROC-AUC {m['roc_auc']:.4f}")
    print("                    pred counterfeit   pred genuine")
    print(f"  true counterfeit  {m['tp']:16d}   {m['fn']:12d}")
    print(f"  true genuine      {m['fp']:16d}   {m['tn']:12d}")


def check_both_classes(name: str, loader, class_to_idx: dict) -> None:
    """Stop with a clear message if a split is unusable for evaluation.

    Two checks: the split uses the same class-to-index mapping as the training
    set (a missing class folder would shift the labels), and it contains
    images of every class.
    """
    if loader.dataset.class_to_idx != class_to_idx:
        sys.exit(f"The {name} set has the classes {loader.dataset.class_to_idx}, the training set "
                 f"{class_to_idx}. Check the class folders of the dataset.")
    counts = Counter(loader.dataset.targets)
    missing = [c for c, i in class_to_idx.items() if counts.get(i, 0) == 0]
    if missing:
        sys.exit(f"The {name} set contains no images of {missing}. The dataset is incomplete: "
                 "run verify_dataset.py and then the data-preparation script again.")


# ---- Decision threshold and checkpoint metadata (CHANGED: new section) -------
@torch.no_grad()
def positive_probs(model, loader, positive_idx: int) -> tuple[torch.Tensor, torch.Tensor]:
    """Return P(positive) per image and a boolean "is really positive" tensor."""
    model.eval()
    probs, labels = [], []
    for images, y in loader:
        probs.append(torch.softmax(model(images.to(device)), dim=1)[:, positive_idx].cpu())
        labels.append(y)
    return torch.cat(probs), torch.cat(labels) == positive_idx


def choose_threshold(probs: torch.Tensor, is_pos: torch.Tensor, target_recall: float) -> float:
    """Highest threshold that still reaches `target_recall` (fewest false alarms).

    To catch at least k = ceil(target * n_positives) positives, the threshold
    must not exceed the score of the k-th most suspicious positive image.
    Call this on VALIDATION predictions only, never on the test set.
    """
    pos_scores = torch.sort(probs[is_pos], descending=True).values
    k = min(max(math.ceil(target_recall * len(pos_scores)), 1), len(pos_scores))
    return pos_scores[k - 1].item()


def print_sweep(probs: torch.Tensor, is_pos: torch.Tensor, chosen: float) -> None:
    """Print recall, precision and false alarms for a grid of thresholds (plus the chosen one).

    Shows the trade-off: a lower threshold catches more positives but raises
    more false alarms.
    """
    print("\n  threshold | recall | precision | false-alarm rate | missed | false alarms")
    for t in sorted(set([round(0.05 * i, 2) for i in range(1, 20)] + [chosen])):
        pred = probs >= t
        tp, fp = (pred & is_pos).sum().item(), (pred & ~is_pos).sum().item()
        fn, tn = (~pred & is_pos).sum().item(), (~pred & ~is_pos).sum().item()
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        far = fp / (fp + tn) if (fp + tn) else 0.0
        mark = "  <-- chosen" if t == chosen else ""
        print(f"     {t:6.3f} | {recall:6.3f} | {precision:9.3f} | {far:16.3f} | {fn:6d} | {fp:12d}{mark}")


def print_errors(loader, probs: torch.Tensor, is_pos: torch.Tensor, threshold: float, limit: int) -> None:
    """List the misclassified images at `threshold`, so they can be inspected by eye.

    The loader must not shuffle, so predictions line up with loader.dataset.samples.
    """
    paths = [s[0] for s in loader.dataset.samples]
    pred = probs >= threshold
    for title, mask in (("Missed positives (false negatives)", ~pred & is_pos),
                        ("False alarms (false positives)", pred & ~is_pos)):
        idx = mask.nonzero().flatten().tolist()
        print(f"\n{title}: {len(idx)}")
        for i in idx[:limit]:
            print(f"  P(positive)={probs[i]:.3f}  {paths[i]}")
        if len(idx) > limit:
            print(f"  ... and {len(idx) - limit} more")


def preprocess_info(loader) -> dict:
    """Describe the evaluation preprocessing so that the web app can reproduce it.

    The normalization is read from the loader's own transform, so the
    checkpoint always matches what the data-preparation script really used.
    """
    norm = next(t for t in loader.dataset.transform.transforms if isinstance(t, transforms.Normalize))
    return {"cache_max_side": cs.CACHE_MAX_SIDE, "mean": [float(v) for v in norm.mean],
            "std": [float(v) for v in norm.std]}


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
    ax2.plot(epochs, [h["val_recall"] for h in history], label="recall (counterfeit)")
    ax2.plot(epochs, [h["val_auc"] for h in history], label="ROC-AUC")
    ax2.set_xlabel("epoch")
    ax2.set_ylabel("validation")
    ax2.legend()
    fig.tight_layout()
    fig.savefig(path, dpi=120)
    plt.close(fig)


def save_json(data: dict, path: Path) -> None:
    """Write a dict as indented JSON."""
    path.write_text(json.dumps(data, indent=2))


def summarize(runs_dir: Path) -> None:
    """Print mean and standard deviation over seeds for every configuration.

    Reads `val_metrics.json` (and `test_metrics.json` if present) of all runs
    below `runs_dir`; runs with the same IMG_SIZE and architecture form one
    configuration.
    """
    groups = defaultdict(list)
    for f in sorted(runs_dir.glob("*/val_metrics.json")):
        record = json.loads(f.read_text())
        test_file = f.with_name("test_metrics.json")
        record["test"] = json.loads(test_file.read_text())["metrics"] if test_file.exists() else None
        groups[json.dumps(record["config"], sort_keys=True)].append(record)
    if not groups:
        print(f"No finished runs found in {runs_dir}.")
        return

    def fmt(values: list[float]) -> str:
        if not values:
            return "-"
        sd = statistics.stdev(values) if len(values) > 1 else 0.0
        return f"{statistics.mean(values):.3f} ± {sd:.3f}"

    for key, records in groups.items():
        config = json.loads(key)
        seeds = sorted(r["seed"] for r in records)
        print(f"\nIMG_SIZE {config['img_size']} | blocks {config['num_blocks']} | base filters "
              f"{config['base_filters']} | dropout {config['dropout']} | seeds {seeds}")
        for split in ("val", "test"):
            ms = [r["metrics"] if split == "val" else r["test"] for r in records]
            ms = [m for m in ms if m]
            if not ms:
                print(f"  {split:4s}: not evaluated yet")
                continue
            print(f"  {split:4s} (n={len(ms)}): " + " | ".join(
                f"{k} {fmt([m[k] for m in ms])}" for k in ("recall", "precision", "f1", "roc_auc", "accuracy")))


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
    p.add_argument("--img-size", type=int, default=None,
                   help="input size (default: IMG_SIZE of the data-preparation script)")
    p.add_argument("--seed", type=int, default=42, help="random seed")
    p.add_argument("--output-dir", type=Path, default=None,
                   help="where to save outputs (default: runs/cnn_<size>px_seed<seed>)")
    p.add_argument("--runs-dir", type=Path, default=Path("runs"), help="folder searched by --summarize")
    p.add_argument("--evaluate-test", action="store_true",
                   help="skip training; evaluate the saved best model on the TEST set")
    # CHANGED: positive class, decision threshold
    p.add_argument("--positive-class", default=POSITIVE_CLASS,
                   help="class folder name treated as 'positive' (default: counterfeit)")
    p.add_argument("--threshold", type=float, default=None,
                   help="with --evaluate-test: predict positive when P(positive) >= this value "
                        "(default: the threshold stored in the checkpoint). Must come from the "
                        "VALIDATION set (see --choose-threshold), never from the test set")
    p.add_argument("--choose-threshold", action="store_true",
                   help="skip training; choose the threshold on the VALIDATION set for "
                        "--target-recall and store it in best_model.pt")
    p.add_argument("--target-recall", type=float, default=0.95,
                   help="recall of the positive class to reach with --choose-threshold")
    p.add_argument("--max-errors", type=int, default=15,
                   help="with --choose-threshold: how many misclassified images to list per type")
    p.add_argument("--summarize", action="store_true",
                   help="print mean and SD over seeds of all finished runs, then exit")
    return p.parse_args()


def main() -> None:
    """Train (or evaluate) the custom CNN on the existing data pipeline."""
    args = parse_args()
    if args.summarize:
        summarize(args.runs_dir)
        return
    if args.img_size:
        cs.IMG_SIZE = args.img_size  # make_loaders reads this value
    output_dir = args.output_dir or Path("runs") / f"cnn_{cs.IMG_SIZE}px_seed{args.seed}"
    output_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = output_dir / "best_model.pt"
    set_seed(args.seed)
    print("Device:", device)

    # ---- CHANGED: shared loading for --choose-threshold and --evaluate-test ---
    if args.evaluate_test or args.choose_threshold:
        if not checkpoint_path.exists():
            sys.exit(f"No trained model at {checkpoint_path}. Pass the same --seed and --img-size "
                     "(or --output-dir) that were used for training.")
        checkpoint = torch.load(checkpoint_path, map_location=device)
        config = checkpoint["config"]
        if args.img_size and args.img_size != config["img_size"]:
            print(f"Note: --img-size {args.img_size} ignored; the model was trained at {config['img_size']} px.")
        cs.IMG_SIZE = config["img_size"]  # evaluate at the trained input size
        (_, val_loader, test_loader), class_to_idx = cs.make_loaders(cs.CACHE_DIR)
        model = CounterfeitCNN(len(class_to_idx), **{k: config[k] for k in ARCH_KEYS}).to(device)
        model.load_state_dict(checkpoint["model_state"])
        positive_class = checkpoint.get("positive_class", args.positive_class)  # older checkpoints
        positive_idx = class_to_idx[positive_class]

        # ---- Choose the decision threshold on the VALIDATION set -------------
        if args.choose_threshold:
            check_both_classes("validation", val_loader, class_to_idx)
            probs, is_pos = positive_probs(model, val_loader, positive_idx)
            t = choose_threshold(probs, is_pos, args.target_recall)
            weights = class_weights(val_loader, len(class_to_idx)).to(device)  # only affects the loss
            m = evaluate(model, val_loader, nn.CrossEntropyLoss(weight=weights), positive_idx, threshold=t)
            print(f"\nValidation ROC-AUC: {m['roc_auc']:.4f}")
            print_sweep(probs, is_pos, t)
            print_metrics(f"VALIDATION at threshold {t:.4f} (target recall {args.target_recall:.2f})", m)
            print_errors(val_loader, probs, is_pos, t, args.max_errors)
            # Also fills the new fields of checkpoints saved before this version.
            checkpoint.update({"threshold": t, "target_recall": args.target_recall,
                               "positive_class": positive_class,
                               "dataset": checkpoint.get("dataset", cs.DATA_DIR.name),
                               "preprocess": checkpoint.get("preprocess", preprocess_info(val_loader))})
            torch.save(checkpoint, checkpoint_path)
            save_json({"threshold": t, "target_recall": args.target_recall, "positive_class": positive_class,
                       "validation": m}, output_dir / "threshold.json")
            print(f"\nStored threshold {t:.4f} in {checkpoint_path} (chosen on VALIDATION only).")
            return

        # ---- Final evaluation on the test set (use once, at the very end) ---
        check_both_classes("test", test_loader, class_to_idx)
        threshold = args.threshold if args.threshold is not None else checkpoint.get("threshold", DEFAULT_THRESHOLD)
        weights = class_weights(test_loader, len(class_to_idx)).to(device)  # only affects the reported loss
        m = evaluate(model, test_loader, nn.CrossEntropyLoss(weight=weights), positive_idx, threshold=threshold)
        print_metrics(f"TEST SET RESULTS ({output_dir}, trained epoch {checkpoint['epoch']}, "
                      f"threshold {threshold:.4f})", m)
        save_json({"config": config, "seed": checkpoint["seed"], "threshold": threshold, "metrics": m},
                  output_dir / "test_metrics.json")
        return

    # Data: exactly the pipeline defined in the data-preparation script.
    cs.require_dir(cs.CACHE_DIR / "splits")  # fails clearly if the cache is missing
    (train_loader, val_loader, test_loader), class_to_idx = cs.make_loaders(cs.CACHE_DIR)
    if args.positive_class not in class_to_idx:  # CHANGED: positive class from the CLI
        sys.exit(f"--positive-class {args.positive_class!r} is not one of the classes {list(class_to_idx)}.")
    positive_idx = class_to_idx[args.positive_class]
    num_classes = len(class_to_idx)
    print("Class mapping:", class_to_idx, "| input size:", cs.IMG_SIZE)
    check_both_classes("validation", val_loader, class_to_idx)

    config = {"img_size": cs.IMG_SIZE, "base_filters": args.base_filters,
              "num_blocks": args.num_blocks, "dropout": args.dropout}
    model = CounterfeitCNN(num_classes, args.base_filters, args.num_blocks, args.dropout).to(device)
    print(f"Model: {count_parameters(model):,} trainable parameters")

    weights = class_weights(train_loader, num_classes).to(device)
    criterion = nn.CrossEntropyLoss(weight=weights)

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
            "val_precision": val["precision"], "val_f1": val["f1"], "val_auc": val["roc_auc"], "lr": lr,
        })
        save_history(history, output_dir / "history.csv")  # kept up to date if the run is stopped
        print(f"epoch {epoch:3d} | train loss {train_loss:.4f} | val loss {val['loss']:.4f} | "
              f"val acc {val['accuracy']:.3f} | val recall {val['recall']:.3f} | "
              f"val AUC {val['roc_auc']:.3f} | lr {lr:.1e} | {time.time() - start:.0f}s")

        if val["loss"] < best_val_loss:
            best_val_loss, stale = val["loss"], 0
            torch.save({  # plain values only, so the default (safe) torch.load works
                "model_state": model.state_dict(), "class_to_idx": class_to_idx, "config": config,
                "seed": args.seed, "epoch": epoch,
                "args": {k: str(v) if isinstance(v, Path) else v for k, v in vars(args).items()},
                # CHANGED: everything the web app needs, so no class/dataset name is hard-coded there.
                "positive_class": args.positive_class, "threshold": DEFAULT_THRESHOLD,
                "dataset": cs.DATA_DIR.name, "preprocess": preprocess_info(val_loader),
            }, checkpoint_path)
        else:
            stale += 1
            if stale >= args.patience:
                print(f"Early stopping: no validation-loss improvement for {args.patience} epochs.")
                break

    plot_history(history, output_dir / "curves.png")

    # Report the validation metrics of the selected (best) model.
    checkpoint = torch.load(checkpoint_path, map_location=device)
    model.load_state_dict(checkpoint["model_state"])
    best = evaluate(model, val_loader, criterion, positive_idx)
    print_metrics(f"Best model: epoch {checkpoint['epoch']} (selected on validation loss) - VALIDATION", best)
    save_json({"config": config, "seed": args.seed, "best_epoch": checkpoint["epoch"], "metrics": best},
              output_dir / "val_metrics.json")
    print(f"\nSaved to {output_dir}. Next steps:\n"
          f"  python {Path(__file__).name} --choose-threshold --output-dir {output_dir}   # on VALIDATION\n"
          f"  python {Path(__file__).name} --evaluate-test --output-dir {output_dir}      # TEST, once, at the end")


if __name__ == "__main__":
    main()