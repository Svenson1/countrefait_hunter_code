import { hasReferenceData, noteOf, photosOf } from './inspection.js';

// The server that runs the trained CNN (app.py). Empty = the server that serves this page.
const API_URL = '';

// Only these views go to the model: it was trained on photos of whole notes,
// so photos of the thin edges would be meaningless to it. The edge photos stay
// part of the check (light/distance checks, history, report).
export const MODEL_VIEWS = ['front', 'back'];

/*
 * Assess the photos of one banknote with the trained model.
 *
 * Resolves to
 *   { pGenuine, confidence, label, threshold, perPhoto, model, simulated, uploadPx, notes }
 * where label is 'counterfeit' ("Might be counterfeit") when the server's
 * decision rule flags the note, and 'genuine' ("Not a counterfeit") otherwise.
 *
 * The decision is made by the server with the threshold stored in the
 * checkpoint, chosen on the VALIDATION set for a target recall. A note is
 * flagged when ANY face photo reaches it. `threshold` is converted to the
 * app's scale (percent certainty that the note is genuine), so the
 * checklist step (judgement.js) keeps working unchanged.
 *
 * Resolves to { error: 'unreliable' } when the photos cannot be used, and
 * rejects with { code: 'service' } when the server is unavailable.
 */
export async function classify(inspection) {
  const photos = photosOf(inspection);
  const note = noteOf(inspection);
  const faces = photos.filter((photo) => MODEL_VIEWS.includes(photo.view));

  if (!faces.some((photo) => photo.quality === 'ok')) {
    return { error: 'unreliable' };
  }

  const form = new FormData();
  for (const photo of faces) {
    form.append('images', await toBlob(photo.upload), `${photo.view}.jpg`);
  }

  let response;
  try {
    response = await fetch(`${API_URL}/api/classify`, { method: 'POST', body: form });
  } catch {
    throw { code: 'service' };
  }
  if (response.status === 413 || response.status === 422) return { error: 'unreliable' };
  if (!response.ok) throw { code: 'service' };
  const result = await response.json();

  // The app thinks in "certainty that the note is genuine".
  const pGenuine = 1 - result.p_positive;
  const genuineThreshold = (1 - result.threshold) * 100;
  const scores = Object.fromEntries(result.per_image.map((item) => [item.name, 1 - item.p_positive]));

  const notes = [];
  if (!hasReferenceData(note)) notes.push('unsupported');
  if (faces.some((photo) => photo.quality !== 'ok')) notes.push('lowq');

  return {
    pGenuine,
    confidence: Math.round(pGenuine * 100) / 100,
    label: result.label === result.positive_class ? 'counterfeit' : 'genuine',
    threshold: genuineThreshold,
    perPhoto: photos.map((photo) => ({
      view: photo.view,
      quality: photo.quality,
      pGenuine: scores[photo.view] ?? null, // null = not assessed by the model (edges)
    })),
    model: result.model,
    simulated: false,
    uploadPx: Math.max(...faces.map((photo) => Math.max(photo.width, photo.height))),
    notes,
  };
}

// The photo's original file, or the data URL of a camera frame, as a Blob for upload.
async function toBlob(upload) {
  if (upload instanceof Blob) return upload;
  return (await fetch(upload)).blob();
}

// Describe the model on the server, for the settings screen. Null when the server can't be reached.
export async function fetchModelInfo() {
  try {
    const response = await fetch(`${API_URL}/api/model`);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}
