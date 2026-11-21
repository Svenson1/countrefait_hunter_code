import { CLOSE_UP_VIEWS } from './config.js';
import { BANKNOTES, referenceImagePath } from './data/banknotes.js';
import { UNKNOWN_NOTE_IMAGE } from './icons.js';
import { seededRandom } from './random.js';
import { state } from './state.js';

/*
 * Photo checks. They run on a small copy of a photo, or of the live camera
 * frame, split into a 12 × 12 grid of tiles.
 *
 * A tile belongs to the note when its colour differs from the background
 * (the median colour along the edge of the frame) or when it has the fine
 * detail of printing. That gives two numbers:
 *
 *   coverage    share of the frame the note fills, for the distance check
 *   brightness  mean grey level (0 to 255) of the note, or of the whole frame
 *               when no note is found, for the light check
 *
 * This works on a plain surface. A busy background (a patterned cloth) can
 * pass the distance check with the note far away.
 */
const SAMPLE_SIZE = 160;
const GRID = 12;
const TOO_DARK = 50;
const TOO_BRIGHT = 225;
const MIN_COVERAGE = 0.4;
const BACKGROUND_DIFFERENCE = 45;
const PRINT_DETAIL = 18;

const PREVIEW_SIZE = 560;
const THUMB_SIZE = 220;
const UPLOAD_SIZE = { standard: 1600, saver: 800 };

const referenceImages = {};

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load image: ${src}`));
    image.src = src;
  });
}

export function loadReferenceImages() {
  return Promise.all(
    BANKNOTES.map(async (note) => {
      try {
        referenceImages[note.value] = await loadImage(referenceImagePath(note.value));
      } catch {
        // The app still works without the picture; only sample photos need it.
      }
    }),
  );
}

export function hasReferenceImage(value) {
  return Boolean(referenceImages[value]);
}

// Draw an image or video frame onto a new canvas, scaled so its longest side is at most maxSide.
export function scaleToCanvas(source, maxSide) {
  const width = source.videoWidth || source.naturalWidth || source.width;
  const height = source.videoHeight || source.naturalHeight || source.height;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Check light and distance for one view.
 * `light` is 'ok', 'dark' or 'bright'. `distance` is 'ok', 'far', or null for
 * edges, which are not checked. `quality` is the first problem found, or 'ok'.
 */
export function checkPhoto(source, view) {
  const canvas = scaleToCanvas(source, SAMPLE_SIZE);
  const { width, height } = canvas;
  const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  const { coverage, noteBrightness, frameBrightness } = findNote(pixels, width, height);

  const brightness = noteBrightness ?? frameBrightness;
  let light = 'ok';
  if (brightness < TOO_DARK) light = 'dark';
  else if (brightness > TOO_BRIGHT) light = 'bright';

  let distance = null;
  if (CLOSE_UP_VIEWS.includes(view)) {
    distance = coverage >= MIN_COVERAGE ? 'ok' : 'far';
  }

  let quality = 'ok';
  if (light !== 'ok') quality = light;
  else if (distance === 'far') quality = 'far';

  return {
    light,
    distance,
    quality,
    brightness: Math.round(brightness),
    coverage: Math.round(coverage * 100) / 100,
    hash: averageHash(canvas),
  };
}

function findNote(pixels, width, height) {
  const grey = (i) => 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];

  const border = [[], [], []];
  const addBorderPixel = (x, y) => {
    const i = (y * width + x) * 4;
    border[0].push(pixels[i]);
    border[1].push(pixels[i + 1]);
    border[2].push(pixels[i + 2]);
  };
  for (let x = 0; x < width; x++) {
    addBorderPixel(x, 0);
    addBorderPixel(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    addBorderPixel(0, y);
    addBorderPixel(width - 1, y);
  }
  const background = border.map(median);

  let noteTiles = 0;
  let noteGreySum = 0;
  let notePixelCount = 0;
  let frameGreySum = 0;

  for (let row = 0; row < GRID; row++) {
    const y0 = Math.floor((row * height) / GRID);
    const y1 = Math.floor(((row + 1) * height) / GRID);

    for (let col = 0; col < GRID; col++) {
      const x0 = Math.floor((col * width) / GRID);
      const x1 = Math.floor(((col + 1) * width) / GRID);

      let red = 0;
      let green = 0;
      let blue = 0;
      let sum = 0;
      let sumOfSquares = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          const value = grey(i);
          red += pixels[i];
          green += pixels[i + 1];
          blue += pixels[i + 2];
          sum += value;
          sumOfSquares += value * value;
          count++;
        }
      }
      if (!count) continue;

      frameGreySum += sum;
      const mean = sum / count;
      const detail = Math.sqrt(Math.max(0, sumOfSquares / count - mean * mean));
      const difference = Math.hypot(
        red / count - background[0],
        green / count - background[1],
        blue / count - background[2],
      );

      if (difference > BACKGROUND_DIFFERENCE || detail > PRINT_DETAIL) {
        noteTiles++;
        noteGreySum += sum;
        notePixelCount += count;
      }
    }
  }

  return {
    coverage: noteTiles / (GRID * GRID),
    noteBrightness: noteTiles >= 3 ? noteGreySum / notePixelCount : null,
    frameBrightness: frameGreySum / (width * height),
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// 64-bit "average hash": identical photos get the same hash, which keeps the
// simulated model consistent.
function averageHash(canvas) {
  const tiny = document.createElement('canvas');
  tiny.width = 8;
  tiny.height = 8;
  const context = tiny.getContext('2d');
  context.drawImage(canvas, 0, 0, 8, 8);
  const data = context.getImageData(0, 0, 8, 8).data;

  const values = [];
  for (let i = 0; i < 64; i++) {
    values.push(data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]);
  }
  const average = values.reduce((a, b) => a + b, 0) / 64;
  return values.map((v) => (v > average ? 1 : 0)).join('');
}

/**
 * Turn a picked file, or a data URL from the camera or the sample photos, into
 * a photo object with a preview, a thumbnail and the check results. Throws if
 * the file is not an image the browser can open.
 */
export async function readPhoto(source, view, { sample = false, sampleValue = null } = {}) {
  let url = source;
  let objectUrl = null;

  if (typeof source !== 'string') {
    if (source.type && !source.type.startsWith('image/')) {
      throw new Error('Not an image');
    }
    objectUrl = URL.createObjectURL(source);
    url = objectUrl;
  }

  try {
    const image = await loadImage(url);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    return {
      id: Math.random().toString(36).slice(2, 10),
      view,
      preview: scaleToCanvas(image, PREVIEW_SIZE).toDataURL('image/jpeg', 0.82),
      thumb: scaleToCanvas(image, THUMB_SIZE).toDataURL('image/jpeg', 0.72),
      ...checkPhoto(image, view),
      width,
      height,
      uploadPx: Math.min(Math.max(width, height), UPLOAD_SIZE[state.settings.uploadQuality]),
      // The original file (or the full-size camera frame) is what goes to the model:
      // the server must see the same pixels as the training pipeline, not the small preview.
      upload: source,
      sample,
      sampleValue,
      kept: false,
    };
  } finally {
    if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
  }
}

/**
 * Draw a banknote for one view.
 *
 * As an illustration (photo: false) it goes in the capture sheet, and the edge
 * views show the note tilted with the edge to photograph marked. As a photo it
 * gets a desk, a shadow and sensor noise, and is used for the demo "sample
 * photos" and the example records. We only have the front of each note, so the
 * back is a plain placeholder card.
 */
export function drawNote(value, view, { photo = false, width = 480, seed = 7 } = {}) {
  const height = Math.round(width * (photo ? 0.75 : 0.62));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const random = seededRandom(seed);
  const note = referenceImages[value];

  if (photo) drawDesk(ctx, width, height);
  if (!note) return canvas;

  ctx.save();
  ctx.translate(width / 2, height / 2);

  if (view === 'front' || view === 'back') {
    const noteWidth = width * (photo ? 0.94 : 0.88);
    const noteHeight = (noteWidth * note.naturalHeight) / note.naturalWidth;
    if (photo) {
      ctx.rotate((random() - 0.5) * 0.06);
      addShadow(ctx, width);
    }
    if (view === 'front') {
      ctx.drawImage(note, -noteWidth / 2, -noteHeight / 2, noteWidth, noteHeight);
    } else {
      drawBackPlaceholder(ctx, -noteWidth / 2, -noteHeight / 2, noteWidth, noteHeight, width);
    }
  } else {
    drawEdge(ctx, note, view, { width, height, photo });
  }

  ctx.restore();
  if (photo) addNoise(ctx, width, height, random);
  return canvas;
}

function drawDesk(ctx, width, height) {
  const desk = ctx.createLinearGradient(0, 0, width, height);
  desk.addColorStop(0, '#6A7077');
  desk.addColorStop(1, '#4B5056');
  ctx.fillStyle = desk;
  ctx.fillRect(0, 0, width, height);
}

function addShadow(ctx, width) {
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = width * 0.03;
  ctx.shadowOffsetY = width * 0.012;
}

// Seen edge-on a note is a thin strip, which is what the sample photos show.
// The illustration tilts the note instead and marks the edge to photograph.
// Rotating the canvas a quarter turn puts the top edge on the left or right.
function drawEdge(ctx, note, view, { width, height, photo }) {
  const vertical = view === 'left' || view === 'right';
  if (view === 'right') ctx.rotate(Math.PI / 2);
  if (view === 'left') ctx.rotate(-Math.PI / 2);

  const length = (vertical ? height : width) * 0.9;
  const aspect = note.naturalHeight / note.naturalWidth;

  if (photo) {
    const thickness = Math.max(3, length * 0.02);
    addShadow(ctx, width);
    ctx.drawImage(note, -length / 2, -thickness / 2, length, thickness);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(-length / 2, -thickness / 2, length, Math.max(1, thickness * 0.25));
    return;
  }

  const tiltedHeight = length * aspect * 0.35;
  ctx.globalAlpha = 0.85;
  ctx.drawImage(note, -length / 2, -tiltedHeight / 2, length, tiltedHeight);
  ctx.globalAlpha = 1;

  const edgeY = view === 'bottom' ? tiltedHeight / 2 : -tiltedHeight / 2;
  ctx.strokeStyle = '#F2A900';
  ctx.lineWidth = Math.max(3, width * 0.014);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-length / 2, edgeY);
  ctx.lineTo(length / 2, edgeY);
  ctx.stroke();
}

// Grey card with a dashed border and a "turn over" arrow.
function drawBackPlaceholder(ctx, left, top, w, h, canvasWidth) {
  ctx.fillStyle = '#9AA6B2';
  ctx.fillRect(left, top, w, h);
  ctx.shadowColor = 'transparent';

  const inset = canvasWidth * 0.03;
  ctx.strokeStyle = '#E6ECF2';
  ctx.lineWidth = canvasWidth * 0.01;
  ctx.setLineDash([canvasWidth * 0.025, canvasWidth * 0.02]);
  ctx.strokeRect(left + inset, top + inset, w - inset * 2, h - inset * 2);
  ctx.setLineDash([]);

  const radius = h * 0.2;
  const start = -0.4;
  const tipX = radius * Math.cos(start);
  const tipY = radius * Math.sin(start);
  ctx.lineWidth = canvasWidth * 0.012;
  ctx.beginPath();
  ctx.arc(0, 0, radius, start, Math.PI * 1.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tipX + canvasWidth * 0.025, tipY - canvasWidth * 0.03);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(tipX - canvasWidth * 0.035, tipY - canvasWidth * 0.005);
  ctx.stroke();
}

function addNoise(ctx, width, height, random) {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const amount = (random() - 0.5) * 18;
    data[i] += amount;
    data[i + 1] += amount;
    data[i + 2] += amount;
  }
  ctx.putImageData(image, 0, 0);
}

const illustrationCache = {};

// Picture shown in the capture sheet. Before the user has chosen a note we
// don't know which one it is, so the 50,000 note stands in.
export function viewIllustration(note, view) {
  const value = note && !note.unlisted ? note.value : 50000;
  const key = `${value}-${view}`;
  if (!illustrationCache[key]) {
    try {
      illustrationCache[key] = drawNote(value, view, { width: 400 }).toDataURL('image/png');
    } catch {
      illustrationCache[key] = UNKNOWN_NOTE_IMAGE;
    }
  }
  return illustrationCache[key];
}
