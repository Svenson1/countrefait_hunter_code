import { BANKNOTES, referenceImagePath } from './data/banknotes.js';
import { UNKNOWN_NOTE_IMAGE } from './icons.js';
import { seededRandom } from './random.js';
import { state } from './state.js';

// Limits for the on-device photo check. Brightness is the mean grey level
// (0 to 255) of a small copy of the photo; sharpness is the variance of its
// Laplacian, which drops when a photo is blurred.
const TOO_DARK = 50;
const TOO_BRIGHT = 225;
const MIN_SHARPNESS = 14;
const QUALITY_SAMPLE_SIZE = 160;

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

// Draw an image onto a new canvas, scaled down so its longest side is at most maxSide.
export function scaleToCanvas(image, maxSide) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function checkPhotoQuality(image) {
  const canvas = scaleToCanvas(image, QUALITY_SAMPLE_SIZE);
  const { width, height } = canvas;
  const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;

  const grey = new Float32Array(width * height);
  let total = 0;
  for (let i = 0, p = 0; i < pixels.length; i += 4, p++) {
    grey[p] = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    total += grey[p];
  }
  const brightness = total / (width * height);

  let sum = 0;
  let sumOfSquares = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      const laplacian = 4 * grey[p] - grey[p - 1] - grey[p + 1] - grey[p - width] - grey[p + width];
      sum += laplacian;
      sumOfSquares += laplacian * laplacian;
      count++;
    }
  }
  const sharpness = count ? sumOfSquares / count - (sum / count) ** 2 : 0;

  let quality = 'ok';
  if (brightness < TOO_DARK) quality = 'dark';
  else if (brightness > TOO_BRIGHT) quality = 'bright';
  else if (sharpness < MIN_SHARPNESS) quality = 'blur';

  return {
    brightness: Math.round(brightness),
    sharpness: Math.round(sharpness),
    hash: averageHash(canvas),
    quality,
  };
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
 * Turn a picked file (or a data URL for sample photos) into a photo object with
 * a preview, a thumbnail and the quality check result. Throws if the file is
 * not an image the browser can open.
 */
export async function readPhoto(source, view, { sample = false } = {}) {
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
      ...checkPhotoQuality(image),
      width,
      height,
      uploadPx: Math.min(Math.max(width, height), UPLOAD_SIZE[state.settings.uploadQuality]),
      sample,
      kept: false,
    };
  } finally {
    if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
  }
}

/**
 * Draw a banknote for one photo view.
 *
 * As an illustration (photo: false) it goes in the capture sheet. As a photo it
 * gets a dark table, a shadow and sensor noise, and is used for the demo
 * "sample photos" and the example records. We only have the front of each
 * note, so the back view is a plain placeholder card.
 */
export function drawNote(value, view, { photo = false, width = 480, dark = false, seed = 7 } = {}) {
  const height = Math.round(width * (photo ? 0.75 : 0.62));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const random = seededRandom(seed);
  const note = referenceImages[value];

  if (photo) {
    const table = ctx.createLinearGradient(0, 0, width, height);
    table.addColorStop(0, '#3C4248');
    table.addColorStop(1, '#202428');
    ctx.fillStyle = table;
    ctx.fillRect(0, 0, width, height);
  }

  if (view === 'light') {
    const glow = ctx.createRadialGradient(width / 2, height * 0.45, width * 0.05, width / 2, height / 2, width * 0.7);
    glow.addColorStop(0, '#FFFBEA');
    glow.addColorStop(1, photo ? '#B8AD90' : 'rgba(255, 248, 225, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }

  if (!note) return canvas;

  // The serial close-up zooms in on the serial number at the top left.
  const noteWidth = width * (view === 'serial' ? 2.6 : 0.88);
  const noteHeight = (noteWidth * note.naturalHeight) / note.naturalWidth;
  const left = -noteWidth / 2;
  const top = -noteHeight / 2;

  ctx.save();
  ctx.translate(width / 2, height / 2);

  if (view === 'serial') {
    ctx.translate(noteWidth * 0.35, noteHeight * 0.27);
  } else if (photo) {
    ctx.rotate((random() - 0.5) * 0.1);
  }
  if (view === 'tilt') {
    ctx.transform(1, -0.07, 0.3, 0.78, 0, 0);
  }
  if (photo) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = width * 0.03;
    ctx.shadowOffsetY = width * 0.012;
  }
  if (view === 'light') {
    ctx.globalAlpha = 0.6;
  }

  if (view === 'back') {
    drawBackPlaceholder(ctx, left, top, noteWidth, noteHeight, width);
  } else {
    ctx.drawImage(note, left, top, noteWidth, noteHeight);
  }

  ctx.shadowColor = 'transparent';
  ctx.globalAlpha = 1;

  if (view === 'light') {
    // Brighter patch where the watermark sits.
    const watermark = ctx.createRadialGradient(-noteWidth * 0.3, 0, 1, -noteWidth * 0.3, 0, noteHeight * 0.42);
    watermark.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
    watermark.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = watermark;
    ctx.fillRect(left, top, noteWidth, noteHeight);
  }
  if (view === 'tilt') {
    // A diagonal sheen, like light catching the foil.
    const sheen = ctx.createLinearGradient(left, top, -left, -top);
    sheen.addColorStop(0.35, 'rgba(255, 255, 255, 0)');
    sheen.addColorStop(0.5, 'rgba(255, 255, 255, 0.35)');
    sheen.addColorStop(0.65, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(left, top, noteWidth, noteHeight);
  }
  ctx.restore();

  if (dark) {
    ctx.fillStyle = 'rgba(6, 8, 12, 0.78)';
    ctx.fillRect(0, 0, width, height);
  }
  if (photo) {
    addNoise(ctx, width, height, random);
  }
  return canvas;
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

// Picture shown in the capture sheet for a view. Unknown notes borrow the 50,000 note.
export function viewIllustration(note, view) {
  const value = note && !note.unlisted ? note.value : 50000;
  const key = `${value}-${view}`;
  if (!illustrationCache[key]) {
    try {
      const drawnView = view === 'extra' ? 'front' : view;
      illustrationCache[key] = drawNote(value, drawnView, { width: 400 }).toDataURL('image/png');
    } catch {
      illustrationCache[key] = UNKNOWN_NOTE_IMAGE;
    }
  }
  return illustrationCache[key];
}
