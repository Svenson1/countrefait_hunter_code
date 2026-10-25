import { MODEL_VERSION, VIEWS } from './config.js';
import { countCoveredViews, hasReferenceData, noteOf, photosOf } from './inspection.js';
import { hashString, seededRandom } from './random.js';
import { state } from './state.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Genuine scores used when the administrator forces a demo result.
const FORCED_SCORES = { genuine: 0.92, counterfeit: 0.11, inconclusive: 0.6 };

/*
 * Assess the photos of one banknote.
 *
 * Resolves to
 *   { pGenuine, confidence, label, threshold, perPhoto, model, simulated, uploadPx, notes }
 * or to { error: 'unreliable' } when none of the photos can be used.
 * Rejects with { code: 'service' } when the assessment service is unavailable.
 *
 * This version simulates the model, because the Claude artifact preview blocks
 * requests to other servers. To connect the trained model, host the app
 * yourselves and replace the body with a call to its API, for example:
 *
 *   const form = new FormData();
 *   for (const photo of photos) {
 *     form.append('images', dataUrlToBlob(photo.preview), `${photo.view}.jpg`);
 *   }
 *   const response = await fetch(`${API_URL}/classify?denomination=${note.value}`, {
 *     method: 'POST',
 *     body: form,
 *   });
 *   if (!response.ok) throw { code: 'service' };
 *   const { p_genuine, per_image, model_version } = await response.json();
 *
 * Training data: the UGX banknote dataset on Mendeley Data. In that dataset the
 * phone model is linked to the class (Cramér's V about 0.29), so balance or
 * stratify by device before you trust any accuracy figure.
 */
export async function classify(inspection) {
  const photos = photosOf(inspection);
  const note = noteOf(inspection);
  const outcome = state.settings.demoOutcome;

  if (outcome === 'error') {
    await sleep(1200);
    throw { code: 'service' };
  }
  if (!photos.some((photo) => photo.quality === 'ok')) {
    return { error: 'unreliable' };
  }

  const random = seededRandom(hashString(photos.map((photo) => photo.hash).join('') + note.id));
  const forced = outcome in FORCED_SCORES;
  const missingViews = VIEWS.length - countCoveredViews(inspection);
  const poorPhotos = photos.filter((photo) => photo.quality !== 'ok').length;
  const unsupported = !hasReferenceData(note);

  let score;
  if (forced) {
    score = FORCED_SCORES[outcome];
  } else if (photos.every((photo) => photo.sample)) {
    score = 0.93; // the demo sample photos are made from a genuine note
  } else {
    score = randomScore(random);
  }

  // Missing views, poor photos and unknown notes pull the score towards 0.5,
  // which lowers the confidence. Forced demo results skip this.
  let certainty = 1;
  if (!forced) {
    certainty -= 0.08 * missingViews + 0.12 * poorPhotos;
    if (unsupported) certainty -= 0.3;
    if (state.settings.uploadQuality === 'saver') certainty -= 0.04;
    certainty = Math.max(0.2, certainty);
  }
  const pGenuine = 0.5 + (score - 0.5) * certainty;

  const confidencePercent = Math.round(Math.max(pGenuine, 1 - pGenuine) * 100);
  const threshold = state.settings.threshold;
  let label;
  if (confidencePercent < threshold) label = 'inconclusive';
  else label = pGenuine >= 0.5 ? 'genuine' : 'counterfeit';

  const notes = [];
  if (!forced && unsupported) notes.push('unsupported');
  if (!forced && (missingViews > 0 || poorPhotos > 0)) notes.push('lowq');

  return {
    pGenuine,
    confidence: confidencePercent / 100,
    label,
    threshold,
    perPhoto: photos.map((photo) => ({
      view: photo.view,
      quality: photo.quality,
      pGenuine: clamp(pGenuine + (random() - 0.5) * (photo.quality === 'ok' ? 0.1 : 0.3), 0.01, 0.99),
    })),
    model: MODEL_VERSION,
    simulated: true,
    uploadPx: Math.max(...photos.map((photo) => photo.uploadPx || 0)),
    notes,
  };
}

// Half of real photos come out genuine, a quarter unclear, a quarter counterfeit.
function randomScore(random) {
  const roll = random();
  if (roll < 0.5) return 0.82 + random() * 0.14;
  if (roll < 0.75) return 0.38 + random() * 0.26;
  return 0.05 + random() * 0.18;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
