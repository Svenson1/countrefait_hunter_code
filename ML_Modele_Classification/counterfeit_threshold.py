"""Counterfeit detection - decision threshold and ROC-AUC (step 6).

By default a classifier predicts "counterfeit" when P(counterfeit) >= 0.5,
which treats both kinds of error equally. Here a missed counterfeit (false
negative) is worse than a false alarm, so we choose a lower threshold that
reaches a TARGET RECALL on the validation set.

This script does NOT retrain anything. It loads the best model saved by
`counterfeit_cnn.py` and works on its predicted probabilities.

What it does
------------
1. Computes P(counterfeit) for every validation image.
2. Prints the ROC-AUC (threshold-independent ranking quality).
3. Prints a table of thresholds: recall, precision, false-alarm rate.
4. Chooses the HIGHEST threshold that still reaches the target recall on the
   validation set (fewest false alarms for that recall) and saves it in
   `threshold.json` next to the model.
5. Lists the misclassified validation images at the chosen threshold, so you
   can look at them.

With --evaluate-test it applies the saved threshold to the TEST set, once.

Prerequisites
-------------
- `counterfeit_starter.py` and `counterfeit_cnn.py` in the same folder.
- A trained run, e.g. runs/cnn_seed42/best_model.pt.

Usage
-----
    python counterfeit_threshold.py                          # choose threshold on validation
    python counterfeit_threshold.py --target-recall 0.97     # stricter target
    python counterfeit_threshold.py --run-dir runs/other     # another run
    python counterfeit_threshold.py --evaluate-test          # FINAL, once

Important
---------
- The threshold is tuned on the validation set, so it is slightly optimistic
  there: expect the test recall to be a bit lower than the target. Aiming a
  little above the real requirement gives a safety margin.
- Never choose or adjust the threshold using the test set.
"""
import argparse
import json
import math
from pathlib import Path

import torch

import image_treatment_V1 as cs
from counterfeit_cnn import POSITIVE_CLASS, CounterfeitCNN, print_confusion

device = cs.device


# ---- Model and predictions ---------------------------------------------------
def load_model(run_dir: Path, num_classes: int) -> CounterfeitCNN:
    """Rebuild the CNN from the checkpoint of a run and load its weights.

    The architecture hyperparameters (filters, blocks, dropout) are read from
    the checkpoint, so they always match the saved weights.

    Args:
        run_dir: Folder containing best_model.pt.
        num_classes: Number of output classes.

    Returns:
        The model in eval mode, on the compute device.
    """
    # weights_only=False: this is our own checkpoint (it also stores plain
    # Python metadata such as the training arguments).
    checkpoint = torch.load(run_dir / "best_model.pt", map_location=device, weights_only=False)
    a = checkpoint["args"]
    model = CounterfeitCNN(num_classes, a["base_filters"], a["num_blocks"], a["dropout"])
    model.load_state_dict(checkpoint["model_state"])
    print(f"Loaded {run_dir / 'best_model.pt'} (epoch {checkpoint['epoch']})")
    return model.to(device).eval()


@torch.no_grad()
def predict_probs(model, loader, positive_idx: int):
    """Compute P(counterfeit) for every image of a loader.

    The loader must not shuffle, so that predictions line up with
    `loader.dataset.samples` (true for the validation and test loaders).

    Args:
        model: Network in eval mode.
        loader: DataLoader to run on.
        positive_idx: Label index of the counterfeit class.

    Returns:
        (probs, is_pos): float tensor of P(counterfeit) and boolean tensor
        that is True where the image really is a counterfeit.
    """
    probs, labels = [], []
    for images, y in loader:
        logits = model(images.to(device))
        probs.append(torch.softmax(logits, dim=1)[:, positive_idx].cpu())
        labels.append(y)
    return torch.cat(probs), torch.cat(labels) == positive_idx


# ---- Metrics -----------------------------------------------------------------
def metrics_at(probs: torch.Tensor, is_pos: torch.Tensor, threshold: float) -> dict:
    """Compute classification metrics when predicting counterfeit at p >= threshold.

    Args:
        probs: P(counterfeit) per image.
        is_pos: True where the image is really a counterfeit.
        threshold: Decision threshold.

    Returns:
        Dict with threshold, recall, precision, false_alarm_rate, accuracy and
        the tp / fp / fn / tn counts.
    """
    pred = probs >= threshold
    tp = (pred & is_pos).sum().item()
    fp = (pred & ~is_pos).sum().item()
    fn = (~pred & is_pos).sum().item()
    tn = (~pred & ~is_pos).sum().item()
    return {
        "threshold": float(threshold),
        "recall": tp / (tp + fn) if (tp + fn) else 0.0,
        "precision": tp / (tp + fp) if (tp + fp) else 0.0,
        "false_alarm_rate": fp / (fp + tn) if (fp + tn) else 0.0,
        "accuracy": (tp + tn) / len(probs),
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
    }


def roc_auc(probs: torch.Tensor, is_pos: torch.Tensor) -> float:
    """Compute the ROC-AUC: P(random counterfeit scores above a random genuine).

    0.5 means no ranking ability, 1.0 means perfect separation. It does not
    depend on any threshold. Ties count for one half.

    Args:
        probs: P(counterfeit) per image.
        is_pos: True where the image is really a counterfeit.
    """
    pos, neg = probs[is_pos], probs[~is_pos]
    greater = (pos[:, None] > neg[None, :]).float().sum()
    ties = (pos[:, None] == neg[None, :]).float().sum()
    return ((greater + 0.5 * ties) / (len(pos) * len(neg))).item()


def choose_threshold(probs: torch.Tensor, is_pos: torch.Tensor, target_recall: float) -> float:
    """Pick the highest threshold that reaches `target_recall` on this data.

    To catch at least k = ceil(target * n_counterfeits) counterfeits, the
    threshold must not exceed the score of the k-th most suspicious one.
    Taking exactly that score gives the fewest false alarms for the target.

    Args:
        probs: P(counterfeit) per image.
        is_pos: True where the image is really a counterfeit.
        target_recall: Wanted recall, between 0 and 1.

    Returns:
        The chosen threshold.
    """
    pos_scores = torch.sort(probs[is_pos], descending=True).values
    k = min(max(math.ceil(target_recall * len(pos_scores)), 1), len(pos_scores))
    return pos_scores[k - 1].item()


# ---- Reporting ---------------------------------------------------------------
def print_sweep(probs: torch.Tensor, is_pos: torch.Tensor, chosen: float) -> None:
    """Print recall / precision / false-alarm rate for a grid of thresholds."""
    print("\n  threshold | recall | precision | false alarms | missed | false alarms (count)")
    grid = [round(0.05 * i, 2) for i in range(1, 20)]
    for t in sorted(set(grid + [chosen])):
        m = metrics_at(probs, is_pos, t)
        mark = "  <-- chosen" if t == chosen else ""
        print(f"     {t:6.3f} | {m['recall']:6.3f} | {m['precision']:9.3f} | "
              f"{m['false_alarm_rate']:12.3f} | {m['fn']:6d} | {m['fp']:6d}{mark}")


def print_errors(loader, probs, is_pos, threshold: float, limit: int) -> None:
    """List misclassified images at a threshold (to inspect them by eye)."""
    paths = [s[0] for s in loader.dataset.samples]
    pred = probs >= threshold
    for title, mask in (("Missed counterfeits (false negatives)", ~pred & is_pos),
                        ("False alarms (genuine flagged as counterfeit)", pred & ~is_pos)):
        idx = mask.nonzero().flatten().tolist()
        print(f"\n{title}: {len(idx)}")
        for i in idx[:limit]:
            print(f"  P(counterfeit)={probs[i]:.3f}  {paths[i]}")
        if len(idx) > limit:
            print(f"  ... and {len(idx) - limit} more")


def show_metrics(name: str, m: dict) -> None:
    """Print one line of metrics and the confusion matrix."""
    print(f"\n{name} (threshold {m['threshold']:.3f})")
    print(f"  recall {m['recall']:.4f} | precision {m['precision']:.4f} | "
          f"false-alarm rate {m['false_alarm_rate']:.4f} | accuracy {m['accuracy']:.4f}")
    print_confusion(m)


# ---- Main --------------------------------------------------------------------
def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    p = argparse.ArgumentParser(description="Choose the decision threshold for counterfeit detection.")
    p.add_argument("--run-dir", type=Path, default=Path("runs/cnn_seed42"),
                   help="folder containing best_model.pt")
    p.add_argument("--target-recall", type=float, default=0.95,
                   help="recall to reach on the validation set (default 0.95)")
    p.add_argument("--max-errors", type=int, default=15,
                   help="how many misclassified images to list per type")
    p.add_argument("--evaluate-test", action="store_true",
                   help="apply the saved threshold to the TEST set (use once, at the end)")
    return p.parse_args()


def main() -> None:
    """Choose a threshold on validation, or apply it once on the test set."""
    args = parse_args()
    cs.require_dir(cs.CACHE_DIR / "splits")
    (_, val_loader, test_loader), class_to_idx = cs.make_loaders(cs.CACHE_DIR)
    positive_idx = class_to_idx[POSITIVE_CLASS]
    model = load_model(args.run_dir, len(class_to_idx))
    threshold_file = args.run_dir / "threshold.json"

    if args.evaluate_test:
        saved = json.loads(threshold_file.read_text())
        t = saved["threshold"]
        probs, is_pos = predict_probs(model, test_loader, positive_idx)
        print("\nTEST SET RESULTS (threshold fixed beforehand on validation)")
        print(f"ROC-AUC: {roc_auc(probs, is_pos):.4f}")
        show_metrics("Default threshold", metrics_at(probs, is_pos, 0.5))
        show_metrics("Chosen threshold", metrics_at(probs, is_pos, t))
        return

    probs, is_pos = predict_probs(model, val_loader, positive_idx)
    print(f"\nValidation: {int(is_pos.sum())} counterfeit, {int((~is_pos).sum())} genuine")
    print(f"ROC-AUC: {roc_auc(probs, is_pos):.4f}")
    show_metrics("Default threshold", metrics_at(probs, is_pos, 0.5))

    t = choose_threshold(probs, is_pos, args.target_recall)
    print_sweep(probs, is_pos, t)
    chosen = metrics_at(probs, is_pos, t)
    show_metrics(f"Chosen for target recall {args.target_recall:.2f}", chosen)
    print_errors(val_loader, probs, is_pos, t, args.max_errors)

    threshold_file.write_text(json.dumps({
        "threshold": t, "target_recall": args.target_recall,
        "validation": chosen, "positive_class": POSITIVE_CLASS,
    }, indent=2))
    print(f"\nSaved threshold to {threshold_file}. "
          "When everything is final, run once with --evaluate-test.")


if __name__ == "__main__":
    main()