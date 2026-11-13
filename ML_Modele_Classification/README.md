# Counterfeit Hunter: banknote checker with a CNN (proof of concept)

A phone-friendly web app (the **Counterfeit Hunter** interface) backed by a CNN trained from
scratch on photos of Ugandan banknotes. The user photographs a note (front, back and the four
edges), picks the denomination, and gets *Not a counterfeit* or *Might be counterfeit*. An
optional security-feature checklist can update that result. The front and back photos are
assessed by the trained model on a small Python server. Nothing is trained in the app.

## Project files

Run every command from the `ML_Modele_Classification` folder.

```
verify_dataset.py  ->  image_treatment_V2.py  ->  counterfeit_cnn.py  ->  app.py + web/
check the data         prepare the images         train / threshold      web app
                                                   / test
```
`model.py` is used by both `counterfeit_cnn.py` and `app.py`; you never run it yourself.

| File | Purpose |
|---|---|
| `verify_dataset.py` | check and repair the downloaded dataset |
| `image_treatment_V2.py` | data preparation: inspection, resized cache, data loaders |
| `model.py` | the CNN architecture (`CounterfeitCNN`) |
| `counterfeit_cnn.py` | training, threshold selection, test evaluation, summary |
| `app.py` | web server: serves `web/` and runs the model (CPU) |
| `web/` | the Counterfeit Hunter interface (HTML/CSS/JS, no build step) |
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

### `app.py`: the web server

Loads one checkpoint on CPU and serves the app. Details are in sections 2 and 3 below.

| Address | What it is |
|---|---|
| `/` | the Counterfeit Hunter app (files from `web/`) |
| `GET /api/model` | the loaded model: name, dataset, classes, positive class, threshold |
| `POST /api/classify` | photos in (`images`, multipart), probabilities and verdict out |

| Option | Effect |
|---|---|
| `--checkpoint runs/X/best_model.pt` | model to serve (default: the newest `runs/*/best_model.pt`) |
| `--host 0.0.0.0` | reachable from a phone on the same Wi-Fi |
| `--port` | port (default 8000) |
| `--ssl-certfile`, `--ssl-keyfile` | serve over HTTPS (live camera on phones) |
| `--runs-dir` | folder searched for the default checkpoint (default `runs/`) |
| `--positive-class`, `--dataset-note` | only for old checkpoints that lack these fields |

### `web/`: the interface

A copy of the **Counterfeit Hunter v1** prototype, connected to the real model. It has three
languages (English, Kiswahili, Suomi), a light and dark theme, a check history and an
admin section. What changed compared with the prototype:

| File | Change |
|---|---|
| `js/model.js` | `classify()` sends the front and back photos to `/api/classify` (it was simulated) |
| `js/images.js`, `js/camera.js` | each photo keeps its original file (or a full-size camera frame) for upload, instead of only the small preview |
| `js/flow.js` | the forced demo outcomes and the "sample photos" were removed |
| `js/ui/screens/settings.js` | the admin threshold slider was replaced by the model's threshold (read-only), and About shows the loaded model |
| `js/i18n/*.js` | texts for the real model and the privacy note |

The decision rule now comes from the checkpoint. The prototype's "95% sure it's genuine"
slider was an arbitrary number. The app now uses the threshold chosen on the validation set
for the target recall (`--choose-threshold`). The checklist step (`js/judgement.js`) is
unchanged: it receives that threshold on its usual "% genuine" scale.

### `requirements.txt`

The app's dependencies: CPU-only torch, torchvision, Pillow, FastAPI, uvicorn and
python-multipart. Install them with `pip install -r requirements.txt`; see section 1 below.

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
python app.py --checkpoint runs/cnn_seed42/best_model.pt --dataset-note "Ugandan banknotes (Azamuke et al., 2026)"
```

Open http://127.0.0.1:8000 and follow the app:

1. Take or choose the six photos (front, back, four edges).
2. Pick the note's value.
3. Read the result.
4. Optionally go through the security checklist.

Settings → Admin (demo PIN `1234`) shows the model's threshold and the dataset it was
trained on.

### What happens to the photos

- **Which photos are scored.** Only the **front and back** photos are sent to the model.
  The model was trained on photos of whole notes, so photos of the thin edges would mean
  nothing to it. The edge photos stay part of the check (quality checks, history, report).
- **Exact training preprocessing.** The app uploads the **original file** (or the
  full-size camera frame), not its 560 px preview, so the server can reproduce the
  validation preprocessing exactly (checked: identical tensors):
  1. Like the training cache (`image_treatment_V2.build_cache`), it applies the EXIF
     rotation, shrinks the longest side to 1024 px (LANCZOS), converts to RGB, and
     re-encodes as JPEG with quality 95.
  2. Like the validation transform, it resizes to `img_size x img_size`, applies
     `ToTensor`, and normalizes with the same mean and std. There is no augmentation.
- **Decision.** Each photo gets `P(counterfeit)`. The note is flagged *Might be
  counterfeit* when **any** face photo reaches the threshold stored in the checkpoint.
  Missing a counterfeit costs more than a false alarm.
- **Limits and errors.** Uploads are limited to 6 photos, 15 MB and 40 megapixels each.
  An unreadable photo leads to the app's "photos can't be used" screen, and an unreachable
  server to its "service not responding" screen.
- **Nothing is stored on the server.** The photos are processed in memory. The history
  stays in the phone's browser (`localStorage`).

## 3. Use it from a phone

Phone browsers only allow the **live camera viewfinder on HTTPS pages** (or on
`localhost`). Over plain HTTP the app automatically falls back to the phone's own camera app,
which works just as well for taking the photos.

| Option | Command | Live viewfinder | Phone camera app / gallery |
|---|---|---|---|
| Same Wi-Fi | `python app.py --host 0.0.0.0 --checkpoint …`, then open `http://<PC-IP>:8000` on the phone | ❌ (plain HTTP) | ✅ |
| Same Wi-Fi + HTTPS | add `--ssl-certfile cert.pem --ssl-keyfile key.pem`, open `https://<PC-IP>:8000` | ✅ after accepting the certificate warning | ✅ |

- **Same Wi-Fi.** Find the PC's IP with `hostname -I` (Linux) or `ipconfig getifaddr en0`
  (macOS). Allow port 8000 in the firewall if needed, e.g. `sudo ufw allow 8000`.
- **HTTPS with a self-signed certificate** (valid 30 days):
  ```bash
  openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 30 -subj "/CN=counterfeit-hunter"
  python app.py --host 0.0.0.0 --checkpoint runs/cnn_seed42/best_model.pt --ssl-certfile cert.pem --ssl-keyfile key.pem
  ```
  The phone warns that the certificate is not trusted. Continue anyway (it's your own
  server), and the live camera then usually works. Don't commit `key.pem`.
- **Public HTTPS link.** For testers outside your network, run a tunnel such as
  `cloudflared tunnel --url http://localhost:8000`, which prints a temporary `https://` link.
  Anyone with the link can use the app.

## 4. Retrain on another dataset and load the new model

The server has no class name, input size or dataset name in its code. Everything comes from
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
5. Restart `python app.py --checkpoint runs/my_new_model/best_model.pt`. The model,
   classes and threshold come from the checkpoint. The `web/` interface itself is made
   for banknotes (genuine vs. counterfeit, denominations, checklist). For another object
   you would adapt its texts and screens; the `/api/classify` endpoint is already generic
   (it returns the positive class and its probability).

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
python app.py --checkpoint runs/cnn_seed42/best_model.pt
```

1. Open http://127.0.0.1:8000 and start a check. Use photos from
   `data/.../splits/validation_set/{counterfeit,genuine}` for the front and back; any photo
   will do for the edges. The verdict should match the folder for most notes (validation
   recall is about 0.95 for `cnn_seed42`).
2. Use a photo of something else for the front: the app still answers. That's expected,
   see the limitations below.
3. Stop the server during the analysis to see the "service not responding" screen.
4. Test the API on its own:
   ```bash
   curl http://127.0.0.1:8000/api/model
   curl -F "images=@photo_front.jpg;filename=front.jpg" http://127.0.0.1:8000/api/classify
   ```
5. From a phone, use the same-Wi-Fi or HTTPS option of section 3.

Do **not** use test-set images to "try" thresholds or models. Keep them for the final
evaluation.

## 6. Known limitations

- **Only valid for the training distribution.** The model only knows the photographed
  Ugandan banknotes of the dataset (same phones, backgrounds, lighting). Other currencies,
  other objects, screenshots, or very different lighting give an answer, but that answer is
  meaningless. There is no "unknown object" class or out-of-distribution detection.
- **Background shortcut risk.** Global average pooling also averages the background.
  If the counterfeit and genuine photos were taken in different conditions, the model may
  partly rely on them. In this dataset the phone model is linked to the class (Cramér's V
  about 0.29), so balance or stratify by device before trusting any accuracy figure.
- **Square resize.** Photos are stretched to a square, as in training. Framing the note
  the way the dataset does (note filling most of the image) gives the most reliable results.
- **Probabilities are not calibrated.** "87 %" is a model score, not a true probability.
- **Small dataset.** About 1,000 training images and one seed. Metrics vary between seeds
  (see `--summarize`).
- **Two photos, one rule.** The threshold was chosen per photo, on validation. Flagging the
  note when either face reaches it catches more counterfeits than a single photo would, but
  also raises more false alarms than the validation numbers suggest.
- **Denomination and checklist are not used by the model.** The chosen value only drives
  the checklist; the checklist's weighting (`js/judgement.js`) comes from the prototype and
  is not validated.
- **Webcam quality.** Laptop webcams are much worse than the phone photos used in training,
  so a real phone photo is more reliable.
- **Proof of concept.** There is no authentication and no rate limiting, the admin PIN is a
  demo value checked in the browser, and tunnel links are public. Never use it to make real
  decisions about money.
