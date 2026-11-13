"""Counterfeit Hunter - web app server (proof of concept).

Serves the Counterfeit Hunter interface (the `web/` folder, from the
"Counterfeit Hunter v1" prototype) and the trained CNN behind it:

    GET  /                 the app (static files from web/)
    GET  /api/model        which model is loaded (name, classes, threshold, ...)
    POST /api/classify     photos in, probabilities and verdict out

No training happens here. Everything model-specific (architecture, input
size, classes, positive class, decision threshold, normalization, dataset
name) is read from the checkpoint saved by counterfeit_cnn.py, so a retrained
checkpoint loads without code changes.

Usage
-----
    python app.py --checkpoint runs/cnn_seed42/best_model.pt   # http://127.0.0.1:8000
    python app.py --host 0.0.0.0                               # phones on the same Wi-Fi
    python app.py --host 0.0.0.0 --ssl-certfile cert.pem --ssl-keyfile key.pem   # HTTPS
"""
import argparse
import io
import json
import sys
from dataclasses import dataclass
from pathlib import Path

import torch
import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps, UnidentifiedImageError
from torchvision import transforms

from model import CounterfeitCNN

HERE = Path(__file__).resolve().parent
WEB_DIR = HERE / "web"
ARCH_KEYS = ("base_filters", "num_blocks", "dropout")

# Defaults that reproduce the current data pipeline (image_treatment_V2.py).
# Only used for checkpoints saved before the "preprocess" field existed.
DEFAULT_PREPROCESS = {"cache_max_side": 1024, "mean": [0.485, 0.456, 0.406], "std": [0.229, 0.224, 0.225]}
CACHE_JPEG_QUALITY = 95  # quality used when the training cache was written

MAX_FILES = 6                     # the app sends at most 6 photos per check
MAX_FILE_BYTES = 15 * 1024 * 1024  # 15 MB per photo
MAX_PIXELS = 40_000_000           # refuse larger images (a 12 MP phone photo is 12_000_000)


# ---- Model loading -----------------------------------------------------------
@dataclass
class Bundle:
    """The loaded model plus everything needed to use and describe it."""

    model: CounterfeitCNN
    name: str
    idx_to_class: dict[int, str]
    positive_class: str
    positive_idx: int
    threshold: float
    threshold_source: str
    img_size: int
    preprocess: dict
    dataset: str
    epoch: int | None
    transform: transforms.Compose


def read_threshold(checkpoint: dict, path: Path) -> tuple[float, str]:
    """Threshold from the checkpoint, else from threshold.json next to it, else 0.5."""
    if "threshold" in checkpoint:
        return float(checkpoint["threshold"]), "checkpoint"
    json_file = path.with_name("threshold.json")
    if json_file.exists():
        return float(json.loads(json_file.read_text())["threshold"]), "threshold.json"
    return 0.5, "default 0.5 (no tuned threshold found)"


def load_bundle(path: Path, positive_class: str, dataset_note: str | None) -> Bundle:
    """Load a checkpoint on CPU and rebuild the model from its stored config.

    Args:
        path: best_model.pt saved by counterfeit_cnn.py.
        positive_class: Fallback for old checkpoints without "positive_class".
        dataset_note: Fallback for old checkpoints without "dataset".
    """
    # weights_only=True refuses arbitrary pickled code; our checkpoints only hold plain values.
    ck = torch.load(path, map_location="cpu", weights_only=True)
    # "config" since counterfeit_cnn V2; older checkpoints stored img_size + args.
    config = ck.get("config") or {"img_size": ck["img_size"], **{k: ck["args"][k] for k in ARCH_KEYS}}
    class_to_idx = ck["class_to_idx"]
    model = CounterfeitCNN(len(class_to_idx), **{k: config[k] for k in ARCH_KEYS})
    model.load_state_dict(ck["model_state"])
    model.eval()

    positive_class = ck.get("positive_class", positive_class)
    if positive_class not in class_to_idx:
        sys.exit(f"Positive class {positive_class!r} is not among the classes {list(class_to_idx)}. "
                 "Pass --positive-class.")
    threshold, threshold_source = read_threshold(ck, path)
    pre = {**DEFAULT_PREPROCESS, **ck.get("preprocess", {})}
    img_size = int(config["img_size"])
    # Identical to eval_tf in image_treatment_V2.make_loaders (no augmentation).
    transform = transforms.Compose([
        transforms.Resize((img_size, img_size)),
        transforms.ToTensor(),
        transforms.Normalize(pre["mean"], pre["std"]),
    ])
    return Bundle(
        model=model, name=f"{path.parent.name} (epoch {ck.get('epoch')})",
        idx_to_class={i: c for c, i in class_to_idx.items()},
        positive_class=positive_class, positive_idx=class_to_idx[positive_class],
        threshold=threshold, threshold_source=threshold_source, img_size=img_size, preprocess=pre,
        dataset=ck.get("dataset") or dataset_note or "not recorded in this checkpoint",
        epoch=ck.get("epoch"), transform=transform,
    )


def default_checkpoint(runs_dir: Path) -> Path:
    """The most recently written runs/*/best_model.pt (used when --checkpoint is not given)."""
    found = sorted(runs_dir.glob("*/best_model.pt"), key=lambda p: p.stat().st_mtime)
    if not found:
        sys.exit(f"No checkpoint found in {runs_dir}/*/best_model.pt. Train a model or pass --checkpoint.")
    return found[-1]


# ---- Preprocessing -----------------------------------------------------------
class BadImage(ValueError):
    """The upload is not a usable image; the message is shown to the user."""


def load_image(data: bytes, max_side: int) -> Image.Image:
    """Open an image exactly like the training/validation pipeline did.

    Training images went through two steps, reproduced here:
    1. the cache (image_treatment_V2.build_cache): EXIF rotation, longest side
       <= max_side with LANCZOS, RGB, saved as JPEG quality 95;
    2. the loader (torchvision ImageFolder): open the cached file, convert to RGB.
    The Resize / ToTensor / Normalize part is done by Bundle.transform.

    Raises:
        BadImage: If the data is not a readable image or is too large.
    """
    try:
        with Image.open(io.BytesIO(data)) as img:
            if img.width * img.height > MAX_PIXELS:
                raise BadImage(f"Image too large ({img.width}x{img.height}).")
            img = ImageOps.exif_transpose(img)  # phone rotation metadata
            img.thumbnail((max_side, max_side), Image.LANCZOS)
            img = img.convert("RGB")
        buf = io.BytesIO()  # same JPEG re-encoding as the cached training images
        img.save(buf, format="JPEG", quality=CACHE_JPEG_QUALITY)
        buf.seek(0)
        return Image.open(buf).convert("RGB")
    except BadImage:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as e:
        raise BadImage("Not a valid or complete image.") from e


# ---- Web API -----------------------------------------------------------------
def create_app(bundle: Bundle) -> FastAPI:
    """Build the FastAPI app around one loaded model."""
    app = FastAPI(title="Counterfeit Hunter", docs_url=None, redoc_url=None)

    @app.get("/api/model")
    def model_info() -> dict:
        """Describe the loaded model (shown in the app's settings)."""
        return {
            "name": bundle.name, "dataset": bundle.dataset,
            "classes": [bundle.idx_to_class[i] for i in sorted(bundle.idx_to_class)],
            "positive_class": bundle.positive_class, "threshold": bundle.threshold,
            "threshold_source": bundle.threshold_source, "img_size": bundle.img_size,
        }

    @app.post("/api/classify")
    def classify(images: list[UploadFile] = File(...)) -> dict:
        """Classify the uploaded photos of one object.

        Each photo is scored separately. The object is flagged as the positive
        class when ANY photo reaches the threshold (the highest P(positive) is
        used): missing a counterfeit costs more than a false alarm.

        A plain (non-async) function: FastAPI runs it in a worker thread, so
        inference does not block the server.
        """
        if not 1 <= len(images) <= MAX_FILES:
            raise HTTPException(400, f"Send between 1 and {MAX_FILES} images.")
        per_image = []
        for upload in images:
            data = upload.file.read(MAX_FILE_BYTES + 1)
            if len(data) > MAX_FILE_BYTES:
                raise HTTPException(413, f"{upload.filename}: larger than {MAX_FILE_BYTES // 2**20} MB.")
            try:
                image = load_image(data, bundle.preprocess["cache_max_side"])
            except BadImage as e:
                raise HTTPException(422, f"{upload.filename}: {e}") from e
            with torch.no_grad():
                probs = torch.softmax(bundle.model(bundle.transform(image).unsqueeze(0)), dim=1)[0]
            per_image.append({
                "name": Path(upload.filename or "image").stem,
                "p_positive": probs[bundle.positive_idx].item(),
                "probabilities": {bundle.idx_to_class[i]: p.item() for i, p in enumerate(probs)},
            })

        p_positive = max(item["p_positive"] for item in per_image)
        if p_positive >= bundle.threshold:
            label = bundle.positive_class
        else:  # the most likely other class, from the average over the photos
            mean = {c: sum(i["probabilities"][c] for i in per_image) / len(per_image)
                    for c in bundle.idx_to_class.values() if c != bundle.positive_class}
            label = max(mean, key=mean.get)
        return {
            "label": label, "positive_class": bundle.positive_class, "p_positive": p_positive,
            "threshold": bundle.threshold, "per_image": per_image, "model": bundle.name,
        }

    # The app itself. Mounted last so that /api/... routes take precedence.
    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
    return app


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    p = argparse.ArgumentParser(description="Counterfeit Hunter web app with the trained CNN.")
    p.add_argument("--checkpoint", type=Path, default=None,
                   help="checkpoint to serve (default: the newest runs/*/best_model.pt)")
    p.add_argument("--runs-dir", type=Path, default=HERE / "runs", help="folder searched for checkpoints")
    p.add_argument("--host", default="127.0.0.1",
                   help="use 0.0.0.0 to accept connections from other devices on the network")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--ssl-certfile", default=None, help="HTTPS certificate (enables the live camera on phones)")
    p.add_argument("--ssl-keyfile", default=None, help="HTTPS private key")
    p.add_argument("--positive-class", default="counterfeit",
                   help="only for old checkpoints that do not store positive_class")
    p.add_argument("--dataset-note", default=None,
                   help="only for old checkpoints that do not store the dataset name")
    return p.parse_args()


def main() -> None:
    """Load the model and start the web server."""
    args = parse_args()
    path = args.checkpoint or default_checkpoint(args.runs_dir)
    if not path.is_file():
        sys.exit(f"Checkpoint not found: {path}")
    bundle = load_bundle(path, args.positive_class, args.dataset_note)
    print(f"Model: {path} | classes {list(bundle.idx_to_class.values())} | positive class "
          f"{bundle.positive_class} | threshold {bundle.threshold:.3f} ({bundle.threshold_source})")
    uvicorn.run(create_app(bundle), host=args.host, port=args.port,
                ssl_certfile=args.ssl_certfile, ssl_keyfile=args.ssl_keyfile)


if __name__ == "__main__":
    main()
