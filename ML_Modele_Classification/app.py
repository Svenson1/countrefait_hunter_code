"""Counterfeit detection - minimal web app (proof of concept).

Upload a photo (or take one with the camera) and the app tells whether the
object belongs to the "positive" class (here: counterfeit banknote), with its
probability. No training happens here: the app only loads a checkpoint saved
by counterfeit_cnn.py.

Everything model-specific (architecture, input size, classes, positive class,
decision threshold, normalization, dataset name) is read from the checkpoint,
so a model retrained on another dataset loads without code changes.

Usage
-----
    python app.py                                    # local only, http://127.0.0.1:7860
    python app.py --host 0.0.0.0                     # reachable from a phone on the same Wi-Fi
    python app.py --share                            # temporary public HTTPS link (camera works on phones)
    python app.py --checkpoint runs/cnn_384px_seed42/best_model.pt
"""
import argparse
import io
import json
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import gradio as gr
import torch
import torch.nn.functional as F
from PIL import Image, ImageOps, UnidentifiedImageError
from torchvision import transforms

from model import CounterfeitCNN

HERE = Path(__file__).resolve().parent
ARCH_KEYS = ("base_filters", "num_blocks", "dropout")

# Defaults that reproduce the current data pipeline (image_treatment_V2.py).
# Only used for checkpoints saved before the "preprocess" field existed.
DEFAULT_PREPROCESS = {"cache_max_side": 1024, "mean": [0.485, 0.456, 0.406], "std": [0.229, 0.224, 0.225]}
CACHE_JPEG_QUALITY = 95  # quality used when the training cache was written

MAX_FILE_SIZE = "15mb"   # upload limit enforced by Gradio
MAX_PIXELS = 40_000_000  # refuse larger images (a 12 MP phone photo is 12_000_000)

# Set from the command line in main().
ARGS: argparse.Namespace


# ---- Model loading -----------------------------------------------------------
@dataclass
class Bundle:
    """A loaded model plus everything needed to use and describe it."""

    model: CounterfeitCNN
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
    return 0.5, "default (no tuned threshold found)"


@lru_cache(maxsize=4)
def load_bundle(path_str: str) -> Bundle:
    """Load a checkpoint on CPU and rebuild the model from its stored config.

    Args:
        path_str: Path to a best_model.pt saved by counterfeit_cnn.py.

    Raises:
        gr.Error: If the file is missing or is not a compatible checkpoint.
    """
    path = Path(path_str)
    if not path.is_file():
        raise gr.Error(f"Checkpoint not found: {path}")
    try:
        # weights_only=True: refuses arbitrary pickled code; our checkpoints only hold plain values.
        ck = torch.load(path, map_location="cpu", weights_only=True)
        # "config" since counterfeit_cnn V2; older checkpoints stored img_size + args.
        config = ck.get("config") or {"img_size": ck["img_size"], **{k: ck["args"][k] for k in ARCH_KEYS}}
        class_to_idx = ck["class_to_idx"]
        model = CounterfeitCNN(len(class_to_idx), **{k: config[k] for k in ARCH_KEYS})
        model.load_state_dict(ck["model_state"])
    except Exception as e:  # noqa: BLE001 - any failure is reported to the user in the page
        raise gr.Error(f"Cannot load {path.name} as a CounterfeitCNN checkpoint: {e}") from e
    model.eval()

    positive_class = ck.get("positive_class", ARGS.positive_class)
    if positive_class not in class_to_idx:
        raise gr.Error(f"Positive class {positive_class!r} is not among the classes {list(class_to_idx)}. "
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
        model=model, idx_to_class={i: c for c, i in class_to_idx.items()},
        positive_class=positive_class, positive_idx=class_to_idx[positive_class],
        threshold=threshold, threshold_source=threshold_source, img_size=img_size, preprocess=pre,
        dataset=ck.get("dataset") or ARGS.dataset_note or "not recorded in this checkpoint",
        epoch=ck.get("epoch"), transform=transform,
    )


# ---- Preprocessing -----------------------------------------------------------
def load_image(path: str, max_side: int) -> Image.Image:
    """Open an image exactly like the training/validation pipeline did.

    Training images went through two steps, reproduced here:
    1. the cache (image_treatment_V2.build_cache): EXIF rotation, longest side
       <= max_side with LANCZOS, RGB, saved as JPEG quality 95;
    2. the loader (torchvision ImageFolder): open the cached file, convert to RGB.
    The Resize / ToTensor / Normalize part is done by Bundle.transform.

    Raises:
        gr.Error: If the file is not a readable image or is too large.
    """
    try:
        with Image.open(path) as img:
            if img.width * img.height > MAX_PIXELS:
                raise gr.Error(f"Image too large ({img.width}x{img.height}). "
                               f"Maximum is {MAX_PIXELS / 1e6:.0f} megapixels.")
            img = ImageOps.exif_transpose(img)  # phone rotation metadata
            img.thumbnail((max_side, max_side), Image.LANCZOS)
            img = img.convert("RGB")
        buf = io.BytesIO()  # same JPEG re-encoding as the cached training images
        img.save(buf, format="JPEG", quality=CACHE_JPEG_QUALITY)
        buf.seek(0)
        return Image.open(buf).convert("RGB")
    except gr.Error:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as e:
        raise gr.Error("This file is not a valid or complete image (use JPEG or PNG).") from e


# ---- Grad-CAM (optional) -----------------------------------------------------
def grad_cam(bundle: Bundle, x: torch.Tensor, class_idx: int, image: Image.Image) -> Image.Image:
    """Overlay a Grad-CAM heatmap of `class_idx` on `image`.

    Uses the output of the last convolutional block (model.features). Red =
    regions that pushed the score of `class_idx` up. With global average
    pooling + one linear layer this is equivalent to the classic CAM.
    """
    store = {}
    hook = bundle.model.features.register_forward_hook(lambda m, i, o: store.__setitem__("act", o))
    try:
        with torch.enable_grad():
            logits = bundle.model(x)
            act = store["act"]
            (grads,) = torch.autograd.grad(logits[0, class_idx], act)
    finally:
        hook.remove()
    weights = grads.mean(dim=(2, 3), keepdim=True)  # one weight per feature map
    cam = F.relu((weights * act).sum(dim=1, keepdim=True)).detach()
    # The network saw a square (stretched) image, so a plain resize maps it back.
    cam = F.interpolate(cam, size=(image.height, image.width), mode="bilinear", align_corners=False)[0, 0]
    cam = cam / cam.max() if cam.max() > 0 else cam
    gray = Image.fromarray((cam * 255).byte().numpy(), mode="L")
    heat = ImageOps.colorize(gray, black="blue", mid="yellow", white="red")
    return Image.blend(image, heat, alpha=0.45)


# ---- Prediction --------------------------------------------------------------
def model_info(ckpt: str) -> str:
    """Markdown describing the loaded model (shown under the checkpoint selector)."""
    b = load_bundle(ckpt)
    classes = ", ".join(b.idx_to_class[i] for i in sorted(b.idx_to_class))
    return (f"**Trained on:** {b.dataset}  \n"
            f"**Classes:** {classes} | **positive class:** {b.positive_class} | "
            f"**threshold:** {b.threshold:.3f} ({b.threshold_source}) | "
            f"**input:** {b.img_size}x{b.img_size} px | **epoch:** {b.epoch}  \n"
            f"⚠️ Results are only meaningful for photos of the same kind of object as in this dataset. "
            f"For any other object the answer is not reliable. This is a proof of concept, not a "
            f"certified detector.")


def predict(image_path: str | None, ckpt: str, show_cam: bool):
    """Classify one image. Returns (verdict markdown, class probabilities, heatmap or None)."""
    if not image_path:
        raise gr.Error("Please upload a photo or take one with the camera first.")
    b = load_bundle(ckpt)
    image = load_image(image_path, b.preprocess["cache_max_side"])
    x = b.transform(image).unsqueeze(0)

    with torch.no_grad():
        probs = torch.softmax(b.model(x), dim=1)[0]
    p_pos = probs[b.positive_idx].item()
    if p_pos >= b.threshold:
        verdict_idx = b.positive_idx
    else:  # the most likely of the other classes (for two classes: simply the other one)
        others = probs.clone()
        others[b.positive_idx] = -1.0
        verdict_idx = int(others.argmax())
    verdict = b.idx_to_class[verdict_idx]

    icon = "🚩" if verdict_idx == b.positive_idx else "✅"
    text = (f"## {icon} {verdict.upper()}\n"
            f"P({b.positive_class}) = **{p_pos:.1%}** (decision threshold {b.threshold:.1%})\n\n"
            f"<sub>Model trained on: {b.dataset}. Not reliable for other objects.</sub>")
    scores = {b.idx_to_class[i]: float(p) for i, p in enumerate(probs)}
    heatmap = grad_cam(b, x, verdict_idx, image) if show_cam else None
    return text, scores, heatmap


# ---- User interface ----------------------------------------------------------
def pass_invalid_files_through(component: gr.Image) -> gr.Image:
    """Hand invalid files to predict() instead of failing inside Gradio.

    Gradio opens the upload itself before calling predict(); for a corrupt or
    non-image file it would show a generic error. Here the raw path is passed
    on, and load_image() reports a clear message. (Wrapping the method of this
    one instance avoids subclassing gr.Image, which makes Gradio write an
    app.pyi stub file next to app.py.)
    """
    original = component.preprocess

    def preprocess(payload):
        try:
            return original(payload)
        except Exception:  # noqa: BLE001
            return payload.path if payload is not None else None

    component.preprocess = preprocess
    return component


def list_checkpoints(runs_dir: Path, extra: Path | None) -> list[str]:
    """All runs/*/best_model.pt, plus the --checkpoint path if given."""
    found = [str(p) for p in sorted(runs_dir.glob("*/best_model.pt"))]
    if extra is not None and str(extra) not in found:
        found.insert(0, str(extra))
    return found


def build_ui(checkpoints: list[str]) -> gr.Blocks:
    """Create the Gradio page."""
    with gr.Blocks(title=ARGS.title) as demo:
        gr.Markdown(f"# {ARGS.title}\n"
                    "Take a photo of the object (flat, well lit, filling most of the frame) or upload one.")
        ckpt = gr.Dropdown(checkpoints, value=checkpoints[0], label="Model checkpoint")
        info = gr.Markdown(model_info(checkpoints[0]))
        with gr.Row():
            with gr.Column():
                image = pass_invalid_files_through(gr.Image(
                    sources=["webcam", "upload"], type="filepath", image_mode=None, format="png",
                    label="Photo",
                    # No mirroring (a mirrored banknote never occurs in training);
                    # prefer the rear camera on phones.
                    webcam_options=gr.WebcamOptions(mirror=False, constraints={"video": {
                        "facingMode": "environment", "width": {"ideal": 1920}, "height": {"ideal": 1440}}}),
                ))
                show_cam = gr.Checkbox(label="Show Grad-CAM heatmap", value=False)
                button = gr.Button("Analyze", variant="primary")
            with gr.Column():
                verdict = gr.Markdown()
                scores = gr.Label(label="Class probabilities")
                heatmap = gr.Image(label="Grad-CAM (red = most influential regions)", type="pil")

        ckpt.change(model_info, ckpt, info)
        button.click(predict, [image, ckpt, show_cam], [verdict, scores, heatmap])
    return demo


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    p = argparse.ArgumentParser(description="Web app for the counterfeit-detection CNN.")
    p.add_argument("--checkpoint", type=Path, default=None,
                   help="checkpoint to select first (default: first runs/*/best_model.pt)")
    p.add_argument("--runs-dir", type=Path, default=HERE / "runs", help="folder searched for checkpoints")
    # Defaults come from Gradio's own environment variables (set e.g. by Hugging Face Spaces).
    p.add_argument("--host", default=os.environ.get("GRADIO_SERVER_NAME", "127.0.0.1"),
                   help="use 0.0.0.0 to accept connections from other devices on the network")
    p.add_argument("--port", type=int, default=int(os.environ.get("GRADIO_SERVER_PORT", 7860)))
    p.add_argument("--title", default="Counterfeit detector (proof of concept)", help="page title")
    p.add_argument("--share", action="store_true", help="create a temporary public HTTPS link (gradio.live)")
    p.add_argument("--positive-class", default="counterfeit",
                   help="only for old checkpoints that do not store positive_class")
    p.add_argument("--dataset-note", default=None,
                   help="only for old checkpoints that do not store the dataset name")
    return p.parse_args()


def main() -> None:
    """Load the checkpoints list and start the web server."""
    global ARGS
    ARGS = parse_args()
    checkpoints = list_checkpoints(ARGS.runs_dir, ARGS.checkpoint)
    if not checkpoints:
        raise SystemExit(f"No checkpoint found in {ARGS.runs_dir}/*/best_model.pt. "
                         "Train a model or pass --checkpoint.")
    load_bundle(checkpoints[0])  # fail early if the default checkpoint is broken
    build_ui(checkpoints).launch(server_name=ARGS.host, server_port=ARGS.port, share=ARGS.share,
                                 max_file_size=MAX_FILE_SIZE)


if __name__ == "__main__":
    main()
