# Counterfeit banknote detector: web app (proof of concept)

A small web page that loads a CNN trained from scratch (`counterfeit_cnn.py`)
and classifies one photo, for example *counterfeit* vs. *genuine* banknote. The answer
includes the probability of the positive class. You can take the photo with the camera or
upload a file, on a laptop or a phone. Nothing is trained in the app.

## Project files

Run every command from the `ML_Modele_Classification` folder.

```
verify_dataset.py  ->  image_treatment_V2.py  ->  counterfeit_cnn.py  ->  app.py
check the data         prepare the images         train / threshold      web page
                                                   / test
```
`model.py` is used by both `counterfeit_cnn.py` and `app.py`; you never run it yourself.

| File | Purpose |
|---|---|
| `verify_dataset.py` | check and repair the downloaded dataset |
| `image_treatment_V2.py` | data preparation: inspection, resized cache, data loaders |
| `model.py` | the CNN architecture (`CounterfeitCNN`) |
| `counterfeit_cnn.py` | training, threshold selection, test evaluation, summary |
| `app.py` | Gradio web app (inference only, CPU) |
| `requirements.txt` | dependencies of the app |
| `runs/<run>/` | results of each training run (checkpoint, metrics) |

### `verify_dataset.py`: check and repair the dataset

Makes sure your copy of the Ugandan banknote dataset is complete and not corrupted. Run
it once after downloading the data, or when the training script says images are missing.

- Compares every file under `DATA_DIR` with the official Mendeley Data file list (name,
  size, SHA-256), and re-downloads only the missing or damaged files.
- Without internet, it rebuilds missing split files from `all_images`. It only does this
  after checking that the copies are byte-identical and that the counts match the data
  article.
- It never deletes anything. A damaged file is kept as `<name>.damaged`.

| Command | Effect |
|---|---|
| `python verify_dataset.py` | check and repair (online, offline as fallback) |
| `python verify_dataset.py --check` | only report, change nothing |
| `python verify_dataset.py --offline` | don't contact Mendeley; repair from `all_images` only |

Settings at the top of the file: `DATA_DIR`, the split folder names, `EXPECTED` (image counts).

### `image_treatment_V2.py`: prepare the images

`python image_treatment_V2.py` runs four steps:

1. Counts the images per split and class and compares them with the data article.
2. Reports image sizes and orientation per class. This detects capture-condition
   shortcuts: if the two classes were photographed differently, the model could learn that
   instead of the note.
3. Builds the **resized cache** (`..._resized/`): images rotated upright (EXIF), longest
   side <= 1024 px. This makes training much faster. The originals are never modified, and
   images already cached are skipped.
4. Creates the train / validation / test data loaders and checks one batch.

The training script imports this file to get the data loaders and transforms, so it must
stay in the same folder. There are no command-line options; edit the configuration block
at the top instead:

| Setting | Meaning |
|---|---|
| `DATA_DIR` | dataset location |
| `TRAIN_DIR`, `VAL_DIR`, `TEST_DIR` | names of the split folders |
| `CACHE_MAX_SIDE` | size of the cached copies (1024); only affects speed |
| `IMG_SIZE` | resolution seen by the model (384); `--img-size` overrides it |
| `BATCH_SIZE` | images per training step (32) |
| `RUN_INSPECTION` | `False` skips steps 1 and 2 after the first run |
| `CLASS_NAMES`, `EXPECTED` | classes and expected counts (change for a new dataset) |

### `model.py`: the network

Defines `CounterfeitCNN`: 4 blocks of Conv, BatchNorm, ReLU and MaxPool, then global average
pooling, dropout and one linear layer, about 0.39M parameters. It also defines the
`conv_block` helper. It is not run directly: the training script and the app both import
it. Don't edit it, because checkpoints only load into exactly this architecture. The size
of the network is set with training options (`--base-filters`, `--num-blocks`, `--dropout`).

### `counterfeit_cnn.py`: train, choose the threshold, evaluate

The script works in four modes:

**A. Train (default).**
```bash
python counterfeit_cnn.py
```
Trains on the training set and checks the validation set after every epoch. It saves the
epoch with the lowest validation loss as `runs/cnn_<size>px_seed<seed>/best_model.pt`, and
stops early when the validation loss no longer improves.

| Option | Default | Meaning |
|---|---|---|
| `--epochs` | 40 | maximum number of passes over the training data |
| `--patience` | 8 | stop after this many epochs without improvement |
| `--lr` | 0.001 | learning rate |
| `--weight-decay` | 0.01 | AdamW regularization (reduces overfitting) |
| `--base-filters` | 32 | filters in the first block (doubles at each block) |
| `--num-blocks` | 4 | number of convolution blocks |
| `--dropout` | 0.4 | dropout before the classifier |
| `--img-size` | 384 | input resolution (ablation: 224, 320, 384, 512) |
| `--seed` | 42 | random seed; train several seeds to see how stable the results are |
| `--positive-class` | counterfeit | the class to catch |
| `--output-dir` | `runs/cnn_<size>px_seed<seed>` | where results are saved |

**B. Choose the decision threshold (validation set only).**
```bash
python counterfeit_cnn.py --choose-threshold --target-recall 0.97 --output-dir runs/cnn_384px_seed42
```
Picks the highest threshold that still catches the target share of positives on the
validation set. It stores the threshold in `best_model.pt` and `threshold.json`, and prints
the ROC-AUC, a threshold table (recall, precision, false alarms) and the misclassified
images.

| Option | Default | Meaning |
|---|---|---|
| `--target-recall` | 0.95 | share of positives to catch on validation |
| `--max-errors` | 15 | how many misclassified images to list per type |

Aim slightly above your real goal (e.g. 0.97 for 95%): a threshold tuned on validation is
slightly optimistic.

**C. Final test (once, at the very end).**
```bash
python counterfeit_cnn.py --evaluate-test --output-dir runs/cnn_384px_seed42
```
Evaluates on the test set with the stored threshold and writes `test_metrics.json`.
`--threshold 0.39` overrides the stored value, but that value must come from validation.
Never tune anything using the test results.

**D. Summary over runs.**
```bash
python counterfeit_cnn.py --summarize
```
Prints the mean and standard deviation of recall, precision, F1, ROC-AUC and accuracy over
seeds, for each configuration. `--runs-dir` sets the folder to search (default `runs`).

### `app.py`: the web app

A web page where you upload or take a photo; it answers counterfeit or genuine with the
probability. It never trains anything. Details are in sections 2 and 3 below.

| Option | Effect |
|---|---|
| *(none)* | local only, http://127.0.0.1:7860 |
| `--checkpoint runs/X/best_model.pt` | model selected first (every `runs/*/best_model.pt` is in the dropdown) |
| `--host 0.0.0.0` | reachable from a phone on the same Wi-Fi (upload only) |
| `--share` | temporary public HTTPS link; the camera works on phones |
| `--port` | port (default 7860) |
| `--runs-dir` | folder searched for checkpoints (default `runs/`) |
| `--title "..."` | page title (useful after retraining on another object) |
| `--positive-class`, `--dataset-note` | only for old checkpoints that lack these fields |

### `requirements.txt`

The app's dependencies: CPU-only torch, torchvision, Pillow and Gradio. Install them with
`pip install -r requirements.txt`; see section 1 below.

### `runs/`: training results

One folder per training run, e.g. `runs/cnn_384px_seed42/`:

| File | Created by | Content |
|---|---|---|
| `best_model.pt` | training | checkpoint: weights, `config`, `class_to_idx`, `positive_class`, `threshold`, `dataset`, `preprocess` |
| `history.csv` | training | loss and metrics for every epoch |
| `curves.png` | training | loss and recall curves (needs matplotlib) |
| `val_metrics.json` | training | validation metrics of the best epoch |
| `threshold.json` | `--choose-threshold` | chosen threshold and its validation metrics |
| `test_metrics.json` | `--evaluate-test` | final test metrics |

## 1. Install

Python 3.10 or newer.

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

`requirements.txt` adds the PyTorch CPU index, so Linux gets the small CPU-only wheel
(about 200 MB instead of several GB with CUDA). If pip still picks a CUDA build, install
PyTorch first, explicitly:

```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
```

## 2. Run the app

From the `ML_Modele_Classification` folder:

```bash
python app.py                                             # http://127.0.0.1:7860
python app.py --checkpoint runs/cnn_384px_seed42/best_model.pt
```

Open the printed URL, pick a checkpoint in the dropdown (every `runs/*/best_model.pt` is
listed), take or upload a photo and click **Analyze**. Tick **Show Grad-CAM heatmap** to
see the regions that influenced the decision most (red).

Options: `--host`, `--port`, `--share`, `--runs-dir`, `--title`, and two fallbacks for
old checkpoints: `--positive-class` and `--dataset-note`. Run `python app.py --help`.

### What the app does with a photo

The preprocessing reproduces the validation pipeline exactly (checked: identical tensors):

1. Like the training cache (`image_treatment_V2.build_cache`), it applies the EXIF rotation
   (`ImageOps.exif_transpose`), shrinks the longest side to 1024 px (LANCZOS), converts to
   RGB, and re-encodes as JPEG with quality 95.
2. Like the validation transform, it resizes to `img_size x img_size`, applies `ToTensor`,
   and normalizes with the same mean and std. There is no augmentation.

The model returns `p = softmax(logits)[class_to_idx[positive_class]]`, and the verdict is
the positive class if `p >= threshold`. Otherwise the verdict is the most likely other class.

Uploads are limited to 15 MB and 40 megapixels. Corrupt or non-image files get a clear
error message.

## 3. Use it from a phone

Phone browsers only allow **live camera access on HTTPS pages** (or on `localhost`). This
decides which option you need:

| Option | Command | Camera button | Upload / phone camera app |
|---|---|---|---|
| Same Wi-Fi | `python app.py --host 0.0.0.0`, then open `http://<PC-IP>:7860` on the phone | ❌ blocked (plain HTTP) | ✅ the upload button can open the phone's camera app |
| Public link | `python app.py --share` | ✅ HTTPS | ✅ |
| Hugging Face Spaces | see below | ✅ HTTPS, permanent | ✅ |

- **Same Wi-Fi.** Find the PC's IP with `hostname -I` (Linux) and allow port 7860 in the
  firewall if needed (e.g. `sudo ufw allow 7860`). On most phones, tapping the upload
  area still lets you choose "Camera", so this is often enough.
- **`--share`.** Gradio creates a temporary `https://xxxx.gradio.live` link.
  The link expires after a few days, and the model still runs on your PC. **Anyone who has
  the link can use the app**, so share it only with testers.
- **Hugging Face Spaces (free, permanent HTTPS).** Create a Space with the *Gradio* SDK
  and push `app.py`, `model.py`, `requirements.txt` and one `runs/<run>/best_model.pt`
  (about 1.5 MB, so no Git LFS is needed). The Space sets `GRADIO_SERVER_NAME`, which the
  app uses as its default host, so it starts without extra flags. The Space is public
  unless you make it private.

The webcam is not mirrored and asks for the phone's **rear** camera (`facingMode:
environment`). If the browser opens the front camera, switch with the camera selector.

## 4. Retrain on another dataset and load the new model

The app has no class name, input size or dataset name in its code. Everything comes from
the checkpoint: `model_state`, `class_to_idx`, `config` (`img_size`, `base_filters`,
`num_blocks`, `dropout`), `positive_class`, `threshold`, `dataset`, and `preprocess`
(cache size, mean and std).

1. Put the new data in the same layout (`splits/<train>/<class>/…`, etc.) and edit the
   configuration block of `image_treatment_V2.py`: `DATA_DIR`, split folder names,
   `CLASS_NAMES`, `EXPECTED`. Then run `python image_treatment_V2.py`.
2. Train and name the class you want to catch:
   ```bash
   python counterfeit_cnn.py --positive-class <class_folder_name> --output-dir runs/my_new_model
   ```
3. Choose the decision threshold **on the validation set**. It is stored in the checkpoint
   and in `threshold.json`:
   ```bash
   python counterfeit_cnn.py --choose-threshold --target-recall 0.95 --output-dir runs/my_new_model
   ```
4. At the very end, once only, evaluate on the **test** set with that threshold:
   ```bash
   python counterfeit_cnn.py --evaluate-test --output-dir runs/my_new_model
   # or an explicit value, which must also come from validation:
   python counterfeit_cnn.py --evaluate-test --threshold 0.39 --output-dir runs/my_new_model
   ```
5. Restart `python app.py`. The new run appears in the dropdown. Optionally change the
   title: `--title "Defect detector (PoC)"`.

The threshold is never chosen on the test set. Doing so would make the test metrics
optimistic and meaningless.

**Older checkpoints.** The app also loads checkpoints saved before these fields existed:

- `runs/cnn_seed42`, from training script V1, has no `config`. The app rebuilds it from
  `img_size` and `args`.
- If there is no `threshold` field, the app reads `threshold.json` next to the checkpoint
  (written by an older threshold script), and otherwise uses 0.5.
- For V2 checkpoints, `--choose-threshold` also adds the missing fields. For the V1
  checkpoint, pass `--dataset-note "Ugandan banknotes (Azamuke et al., 2026)"` to the app.

## 5. Test locally

```bash
python app.py
```

1. Open http://127.0.0.1:7860.
2. Upload a few photos from `data/.../splits/validation_set/{counterfeit,genuine}`. The
   verdict should match the folder for most of them (the validation recall is about 0.95
   for `cnn_seed42`).
3. Upload a non-image file renamed to `.jpg`. You should see "This file is not a valid
   or complete image".
4. Click **Analyze** without an image. You should see a request to add a photo.
5. Tick Grad-CAM and check that the hot regions lie on the note, not on the background.
6. From a phone, run `python app.py --share` and take a picture with the camera button.

Do **not** use test-set images to "try" thresholds or models. Keep them for the final
evaluation.

## 6. Known limitations

- **Only valid for the training distribution.** The model only knows the photographed
  Ugandan banknotes of the dataset (same phones, backgrounds, lighting). Other currencies,
  other objects, screenshots, or very different lighting give an answer, but that answer is
  meaningless. There is no "unknown object" class or out-of-distribution detection.
- **Background shortcut risk.** Global average pooling also averages the background.
  If the counterfeit and genuine photos were taken in different conditions, the model may
  partly rely on them. Grad-CAM helps to spot this.
- **Square resize.** Photos are stretched to a square, as in training. Framing the note
  the way the dataset does (note filling most of the image) gives the most reliable results.
- **Probabilities are not calibrated.** "87 %" is a model score, not a true probability.
- **Small dataset.** About 1,000 training images and one seed. Metrics vary between seeds
  (see `--summarize`).
- **Webcam quality.** Laptop webcams are much worse than the phone photos used in training,
  so uploading a real phone photo is more reliable.
- **Proof of concept.** There is no authentication, the app has no rate limiting, and
  `--share` links are public. Never use it to make real decisions about money.
