"""Counterfeit detection - starter script (steps 1 to 4).

This script prepares everything needed before training a genuine/counterfeit
image classifier. It does NOT train a model yet.

What it does
------------
1. Inspects the dataset: number of images per split and per class.
2. Computes the distribution of raw image sizes per class, to detect
   resolution-based shortcuts (if the two classes differ systematically in
   size, a model could learn that instead of the banknote itself).
3. Builds a resized copy of the splits on disk (the "cache"). Original files
   are never modified. This avoids decoding 12-megapixel JPEGs at every epoch.
4. Creates the train / validation / test DataLoaders and checks one batch.

Expected dataset layout
-----------------------
    <DATA_DIR>/
        all_images/{counterfeit, genuine}          # full corpus (stats only)
        splits/
            <TRAIN_DIR>/{counterfeit, genuine}
            <VAL_DIR>/{counterfeit, genuine}
            <TEST_DIR>/{counterfeit, genuine}

Never train on `all_images`: it contains the test images.

Requirements
------------
    pip install torch torchvision pillow

Usage
-----
    1. Edit the configuration block below (DATA_DIR and the split folder names).
    2. Run:  python counterfeit_starter.py
"""
from collections import Counter
from pathlib import Path

import torch
from PIL import Image, ImageOps
from torch.utils.data import DataLoader
from torchvision import datasets, transforms

# ---- Configuration -----------------------------------------------------------
# Folder of the original dataset (the one that contains `all_images` and `splits`).
DATA_DIR = Path("~/Downloads/<labelled_dataset_folder>").expanduser()

# Resized copy of the splits, created next to DATA_DIR. Safe to delete at any time.
CACHE_DIR = DATA_DIR.parent / (DATA_DIR.name + "_resized")

# Names of the three split folders inside `splits/`. Adjust to the real names.
TRAIN_DIR, VAL_DIR, TEST_DIR = "train_set", "validation_set", "test_set"

# Longest side (in pixels) of the cached copy. Only affects loading speed and
# disk usage; it is NOT the resolution seen by the model.
CACHE_MAX_SIDE = 1024

# Resolution seen by the model: every image is resized to IMG_SIZE x IMG_SIZE
# right before entering the network. This is the main experimental variable
# (detail vs. compute/memory). Planned ablation: 224, 320, 384, 512.
IMG_SIZE = 384

BATCH_SIZE = 32
IMG_EXTS = {".jpg", ".jpeg", ".png"}
CLASS_NAMES = ("counterfeit", "genuine")

# Apple Silicon GPU (MPS) if available, otherwise CPU.
device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")


# ---- Helpers -----------------------------------------------------------------
def list_images(folder: Path) -> list[Path]:
    """Return all image files found anywhere below `folder`.

    Args:
        folder: Directory to search recursively.

    Returns:
        List of paths whose extension is in IMG_EXTS (case-insensitive).
    """
    return [p for p in folder.rglob("*") if p.suffix.lower() in IMG_EXTS]


def require_dir(path: Path) -> Path:
    """Return `path` if it is an existing directory, else raise a helpful error.

    The error lists the folders actually present in the parent directory, so
    that a wrong split name can be fixed quickly in the configuration block.

    Args:
        path: Directory that must exist.

    Raises:
        FileNotFoundError: If `path` does not exist or is not a directory.
    """
    if path.is_dir():
        return path
    parent = path.parent
    found = sorted(d.name for d in parent.iterdir() if d.is_dir()) if parent.is_dir() else []
    raise FileNotFoundError(
        f"Folder not found: {path}\nFolders present in {parent}: {found}\n"
        "Adjust DATA_DIR / TRAIN_DIR / VAL_DIR / TEST_DIR in the configuration block."
    )


def count_per_class(split_dir: Path) -> dict[str, int]:
    """Count the images in each class folder of a split.

    Args:
        split_dir: Directory of one split (contains one folder per class).

    Returns:
        Mapping {class_name: number_of_images}.
    """
    return {
        d.name: len(list_images(d))
        for d in sorted(split_dir.iterdir())
        if d.is_dir()
    }


def size_stats(class_dir: Path) -> Counter:
    """Count how many images have each (width, height) in a class folder.

    Sizes are the raw stored sizes, i.e. before applying the EXIF rotation, so
    a portrait photo may appear as landscape here. Only the file header is
    read, which keeps this fast even for large images.

    Args:
        class_dir: Directory containing the images of one class.

    Returns:
        Counter mapping (width, height) to the number of images.
    """
    sizes = Counter()
    for p in list_images(class_dir):
        with Image.open(p) as img:
            sizes[img.size] += 1
    return sizes


def build_cache(src: Path, dst: Path, max_side: int) -> None:
    """Write a resized copy of `src` into `dst`, keeping the folder structure.

    Images already present in `dst` are skipped, so the function can be
    re-run safely. The phone's EXIF rotation is applied so that images are
    stored upright. Original files are never modified.

    Args:
        src: Source directory (e.g. the `splits` folder of the dataset).
        dst: Destination directory for the resized copy.
        max_side: Maximum size, in pixels, of the longest side of each image.
            Aspect ratio is preserved and images are never upscaled.
    """
    images = list_images(src)
    print(f"Caching {len(images)} images to {dst} (longest side <= {max_side}px)...")
    for p in images:
        out = dst / p.relative_to(src)
        if out.exists():
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(p) as img:
            img = ImageOps.exif_transpose(img)  # apply phone rotation metadata
            img.thumbnail((max_side, max_side), Image.LANCZOS)
            img.convert("RGB").save(out, quality=95)


def make_loaders(root: Path):
    """Create the train / validation / test DataLoaders.

    Train images get light augmentation (small rotations, brightness/contrast
    jitter). There is deliberately no horizontal flip: a mirrored banknote is
    an impossible object. Validation and test images are only resized and
    normalized. Normalization uses ImageNet statistics because we plan to
    fine-tune ImageNet-pretrained backbones.

    Note: resizing to a square slightly stretches the note. The distortion is
    applied to every image, but it is a baseline simplification to revisit
    (short-side resize + crop, or padding).

    Args:
        root: Directory containing a `splits` folder with the three splits
            (normally CACHE_DIR).

    Returns:
        A tuple ((train_loader, val_loader, test_loader), class_to_idx) where
        class_to_idx maps class folder names to label indices.
    """
    mean, std = [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]

    train_tf = transforms.Compose([
        transforms.Resize((IMG_SIZE, IMG_SIZE)),
        transforms.RandomRotation(10),
        transforms.ColorJitter(brightness=0.2, contrast=0.2),
        transforms.ToTensor(),
        transforms.Normalize(mean, std),
    ])
    eval_tf = transforms.Compose([
        transforms.Resize((IMG_SIZE, IMG_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(mean, std),
    ])

    splits = root / "splits"
    train_ds = datasets.ImageFolder(require_dir(splits / TRAIN_DIR), transform=train_tf)
    val_ds = datasets.ImageFolder(require_dir(splits / VAL_DIR), transform=eval_tf)
    test_ds = datasets.ImageFolder(require_dir(splits / TEST_DIR), transform=eval_tf)

    # num_workers=0 avoids multiprocessing issues on macOS.
    loaders = (
        DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=0),
        DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=0),
        DataLoader(test_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=0),
    )
    return loaders, train_ds.class_to_idx


# ---- Main --------------------------------------------------------------------
def main() -> None:
    """Run steps 1 to 4: inspect, compute size stats, build cache, load data."""
    print("Device:", device)

    # Step 1 - image counts per split and class.
    print("\n[1] Images per split and class")
    for split in (TRAIN_DIR, VAL_DIR, TEST_DIR):
        split_dir = require_dir(DATA_DIR / "splits" / split)
        print(f"  {split:18s}", count_per_class(split_dir))

    # Step 2 - raw size distribution per class (shortcut detection).
    print("\n[2] Raw image sizes per class (a large difference between classes is a red flag)")
    for cls in CLASS_NAMES:
        sizes = size_stats(require_dir(DATA_DIR / "all_images" / cls))
        print(f"  {cls}: {sum(sizes.values())} images, {len(sizes)} distinct sizes")
        for (w, h), n in sizes.most_common(5):
            print(f"      {w}x{h}: {n}")

    # Step 3 - resized cache.
    print("\n[3] Resized cache")
    build_cache(DATA_DIR / "splits", CACHE_DIR / "splits", CACHE_MAX_SIDE)

    # Step 4 - data loaders and sanity check on one batch.
    print("\n[4] Data loaders")
    (train_loader, val_loader, test_loader), class_to_idx = make_loaders(CACHE_DIR)
    print("  Class mapping:", class_to_idx)
    print(
        f"  Batches: train={len(train_loader)}, "
        f"val={len(val_loader)}, test={len(test_loader)}"
    )
    images, labels = next(iter(train_loader))
    print(f"  One train batch: images {tuple(images.shape)}, labels {tuple(labels.shape)}")


if __name__ == "__main__":
    main()