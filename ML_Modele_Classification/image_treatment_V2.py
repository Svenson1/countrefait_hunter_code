"""Counterfeit detection - data preparation (steps 1 to 4), version 2.

This script prepares everything needed before training a genuine/counterfeit
image classifier. It does NOT train a model yet.

What it does
------------
1. Inspects the dataset: number of images per split and per class, compared
   with the numbers reported in the data article.
2. Computes the distribution of raw image sizes and of the displayed
   orientation (after the phone's EXIF rotation) per class, to detect
   capture-condition shortcuts: if the two classes differ systematically, a
   model could learn that instead of the banknote itself.
3. Builds a resized copy of the splits on disk (the "cache"). Original files
   are never modified. Damaged files no longer stop the script: slightly
   truncated JPEGs are loaded as far as possible, unreadable files are
   skipped, and every affected file is listed at the end.
4. Creates the train / validation / test DataLoaders and checks one batch.

Changes compared with version 1
-------------------------------
- Hidden files (e.g. macOS "._" copies) are ignored.
- Step 1 also counts `all_images` and compares all counts with the article.
- Step 2 also reports portrait / landscape shares after EXIF rotation.
- Step 3 handles truncated or unreadable images and reports them.
- Cached files are written atomically (no half-written files after a crash).

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
    2. Run:  python image_treatment_V2.py
"""
import json
from collections import Counter
from pathlib import Path

import torch
from PIL import Image, ImageFile, ImageOps
from torch.utils.data import DataLoader
from torchvision import datasets, transforms

# ---- Configuration -----------------------------------------------------------
# Folder of the original dataset (the one that contains `all_images` and `splits`).
# Relative to the repository, so the code works wherever the repo is cloned:
#   <repo>/ML_Modele_Classification/image_treatment_V2.py
#   <repo>/data/Ugandan banknote image dataset for genuine and cou/labelled_ugandan_banknote_dataset_clean
REPO_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = (REPO_DIR / "data" / "Ugandan banknote image dataset for genuine and cou"
            / "labelled_ugandan_banknote_dataset_clean")  # <-- EDIT if your data lives elsewhere

# Resized copy of the splits, created next to DATA_DIR. Safe to delete at any time.
CACHE_DIR = DATA_DIR.parent / (DATA_DIR.name + "_resized")

# Names of the three split folders inside `splits/`. Adjust to the real names.
TRAIN_DIR, VAL_DIR, TEST_DIR = "train_set", "validation_set", "test_set"  # <-- EDIT: exact folder names

# Longest side (in pixels) of the cached copy. Only affects loading speed and
# disk usage; it is NOT the resolution seen by the model.
CACHE_MAX_SIDE = 1024

# Resolution seen by the model: every image is resized to IMG_SIZE x IMG_SIZE
# right before entering the network. This is the main experimental variable
# (detail vs. compute/memory). Planned ablation: 224, 320, 384, 512.
IMG_SIZE = 384

BATCH_SIZE = 32

# Steps 1-2 (counts and size statistics) are only needed to check the dataset.
# Set to False after the first run to skip them.
RUN_INSPECTION = True
IMG_EXTS = {".jpg", ".jpeg", ".png"}
CLASS_NAMES = ("counterfeit", "genuine")

# Image counts reported in the data article (Azamuke et al., 2026, Tables 1 and 3).
EXPECTED = {
    "all_images": {"counterfeit": 760, "genuine": 666},
    TRAIN_DIR: {"counterfeit": 532, "genuine": 466},
    VAL_DIR: {"counterfeit": 114, "genuine": 100},
    TEST_DIR: {"counterfeit": 114, "genuine": 100},
}

# Apple Silicon GPU (MPS) if available, otherwise CPU.
device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")


# ---- Helpers -----------------------------------------------------------------
def is_image_file(path: Path) -> bool:
    """True for image files, False for other files and hidden files.

    Hidden files such as macOS "._IMG_0001.jpg" copies carry an image extension
    but contain no image, so they are excluded.
    """
    return path.suffix.lower() in IMG_EXTS and not path.name.startswith(".")


def list_images(folder: Path) -> list[Path]:
    """Return all image files found anywhere below `folder`, sorted by path.

    Args:
        folder: Directory to search recursively.

    Returns:
        Sorted list of image paths (see `is_image_file`).
    """
    return sorted(p for p in folder.rglob("*") if p.is_file() and is_image_file(p))


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
    return {d.name: len(list_images(d)) for d in sorted(split_dir.iterdir()) if d.is_dir()}


def displayed_size(path: Path) -> tuple[int, int]:
    """(width, height) as the photo is displayed, i.e. after the EXIF rotation.

    Phones often store the pixels in landscape and only set a rotation flag
    (EXIF tag 274). Orientations 5 to 8 mean a rotation by 90 degrees, so width
    and height are swapped. Only the file header is read.
    """
    with Image.open(path) as img:
        width, height = img.size
        orientation = img.getexif().get(274, 1)
    return (height, width) if orientation in (5, 6, 7, 8) else (width, height)


def size_stats(class_dir: Path) -> tuple[Counter, Counter]:
    """Raw size and displayed orientation statistics of one class folder.

    Args:
        class_dir: Directory containing the images of one class.

    Returns:
        (sizes, orientations): a Counter of raw stored (width, height) pairs,
        and a Counter of "portrait" / "landscape" / "square" after EXIF rotation.
    """
    sizes, orientations = Counter(), Counter()
    for p in list_images(class_dir):
        with Image.open(p) as img:  # lazy: only reads the file header
            sizes[img.size] += 1
        w, h = displayed_size(p)
        orientations["landscape" if w > h else "portrait" if h > w else "square"] += 1
    return sizes, orientations


def build_cache(src: Path, dst: Path, max_side: int) -> dict[str, list[Path]]:
    """Write a resized copy of `src` into `dst`, keeping the folder structure.

    Images already present in `dst` are skipped, so the function can be
    re-run safely. The phone's EXIF rotation is applied so that images are
    stored upright. Original files are never modified.

    Damaged files do not stop the run:
    - a truncated JPEG (end of the file missing) is loaded as far as possible;
      the missing part is filled with grey by Pillow, which is negligible when
      only a few bytes are missing, but the file is reported for a visual check;
    - a file that cannot be read at all is skipped and reported.

    Args:
        src: Source directory (e.g. the `splits` folder of the dataset).
        dst: Destination directory for the resized copy.
        max_side: Maximum size, in pixels, of the longest side of each image.
            Aspect ratio is preserved and images are never upscaled.

    Returns:
        {"truncated": [...], "unreadable": [...]} with the files affected in this run.
        All affected files (also from earlier runs) are kept in
        `dst/cache_problems.json` and printed at the end.
    """
    images = list_images(src)
    print(f"Caching {len(images)} images to {dst} (longest side <= {max_side}px)...")
    problems: dict[str, list[Path]] = {"truncated": [], "unreadable": []}

    def save_resized(p: Path, out: Path) -> None:
        with Image.open(p) as img:
            img = ImageOps.exif_transpose(img)  # apply phone rotation metadata
            img.thumbnail((max_side, max_side), Image.LANCZOS)
            tmp = out.with_name(out.stem + ".tmp" + out.suffix)
            img.convert("RGB").save(tmp, quality=95)
            tmp.replace(out)  # atomic: no half-written image under the final name

    for p in images:
        out = dst / p.relative_to(src)
        if out.exists():
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        try:
            save_resized(p, out)
        except OSError as error:
            if "truncated" in str(error):
                ImageFile.LOAD_TRUNCATED_IMAGES = True  # accept the incomplete file once ...
                try:
                    save_resized(p, out)
                    problems["truncated"].append(p)
                except OSError:
                    problems["unreadable"].append(p)
                finally:
                    ImageFile.LOAD_TRUNCATED_IMAGES = False  # ... and switch back to strict loading
            else:
                problems["unreadable"].append(p)

    # Keep a record across runs: files cached in an earlier run are skipped and would not be reported again.
    report = dst / "cache_problems.json"
    previous = json.loads(report.read_text()) if report.exists() else {"truncated": [], "unreadable": []}
    for kind, files in problems.items():
        previous[kind] = sorted(set(previous.get(kind, [])) | {str(p.relative_to(src)) for p in files})
    report.write_text(json.dumps(previous, indent=2))
    for kind, files in previous.items():
        if files:
            print(f"  {len(files)} {kind} file(s) - please check them visually:")
            for name in files:
                print(f"    {name}")
    if not any(previous.values()):
        print("  All images were read without problems.")
    return problems


def make_loaders(root: Path):
    """Create the train / validation / test DataLoaders.

    Train images get light augmentation (small rotations, brightness/contrast
    jitter). There is deliberately no horizontal flip: a mirrored banknote is
    an impossible object. Validation and test images are only resized and
    normalized. ImageNet statistics are used as a generic normalization for
    now; the training script may replace them with statistics of the training
    split, which is more natural for a CNN trained from scratch.

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

    def valid(path: str) -> bool:
        return is_image_file(Path(path))

    splits = root / "splits"
    train_ds = datasets.ImageFolder(require_dir(splits / TRAIN_DIR), transform=train_tf, is_valid_file=valid)
    val_ds = datasets.ImageFolder(require_dir(splits / VAL_DIR), transform=eval_tf, is_valid_file=valid)
    test_ds = datasets.ImageFolder(require_dir(splits / TEST_DIR), transform=eval_tf, is_valid_file=valid)

    # num_workers=0 avoids multiprocessing issues on macOS.
    loaders = (
        DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=0),
        DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=0),
        DataLoader(test_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=0),
    )
    return loaders, train_ds.class_to_idx


# ---- Main --------------------------------------------------------------------
def inspect_dataset() -> None:
    """Steps 1 and 2: print image counts and image-size statistics.

    Only needed once, to check the dataset (counts per split and class, and
    capture-condition shortcuts). Disable with RUN_INSPECTION = False afterwards.
    """
    # Step 1 - image counts per split and class, compared with the data article.
    print("\n[1] Images per split and class (expected numbers from the data article in brackets)")
    folders = {"all_images": DATA_DIR / "all_images"}
    folders.update({s: DATA_DIR / "splits" / s for s in (TRAIN_DIR, VAL_DIR, TEST_DIR)})
    split_total = 0
    for name, folder in folders.items():
        counts = count_per_class(require_dir(folder))
        expected = EXPECTED.get(name, {})
        cells = [f"{c}: {counts.get(c, 0)} ({expected.get(c, '?')})" for c in CLASS_NAMES]
        ok = all(counts.get(c, 0) == expected.get(c) for c in CLASS_NAMES)
        print(f"  {name:18s} {', '.join(cells)}  {'OK' if ok else '<-- differs'}")
        if name != "all_images":
            split_total += sum(counts.values())
    print(f"  total in the three splits: {split_total} (expected 1426)")

    # Step 2 - raw size distribution and displayed orientation per class.
    print("\n[2] Image sizes per class (a large difference between classes is a red flag)")
    for cls in CLASS_NAMES:
        sizes, orientations = size_stats(require_dir(DATA_DIR / "all_images" / cls))
        n = sum(sizes.values())
        shares = ", ".join(f"{k} {v / n:.0%}" for k, v in orientations.most_common())
        print(f"  {cls}: {n} images, {len(sizes)} distinct raw sizes; displayed orientation: {shares}")
        for (w, h), count in sizes.most_common(5):
            print(f"      {w}x{h}: {count}")


def main() -> None:
    """Run steps 1 to 4: inspect, compute size stats, build cache, load data."""
    print("Device:", device)

    if RUN_INSPECTION:
        inspect_dataset()

    # Step 3 - resized cache (images already cached are skipped).
    print("\n[3] Resized cache")
    build_cache(DATA_DIR / "splits", CACHE_DIR / "splits", CACHE_MAX_SIDE)

    # Step 4 - data loaders and sanity check on one batch.
    print("\n[4] Data loaders")
    (train_loader, val_loader, test_loader), class_to_idx = make_loaders(CACHE_DIR)
    print("  Class mapping:", class_to_idx)
    print(f"  Images: train={len(train_loader.dataset)}, val={len(val_loader.dataset)}, "
          f"test={len(test_loader.dataset)}")
    print(f"  Batches: train={len(train_loader)}, val={len(val_loader)}, test={len(test_loader)}")
    images, labels = next(iter(train_loader))
    print(f"  One train batch: images {tuple(images.shape)}, labels {tuple(labels.shape)}")


if __name__ == "__main__":
    main()
