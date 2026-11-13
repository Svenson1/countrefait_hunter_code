import { MODEL_VERSION } from './config.js';
import { hasReferenceData, noteOf, photosOf } from './inspection.js';
import { hashString, seededRandom } from './random.js';
import { state } from './state.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Genuine scores used when the administrator forces a demo result.
const FORCED_SCORES = { genuine: 0.97, counterfeit: 0.64 };

/*
 * Assess the six photos of one banknote.
 *
 * Resolves to
 *   { pGenuine, confidence, label, threshold, perPhoto, model, simulated, uploadPx, notes }
 * where label is 'genuine' ("Not a counterfeit") only when the model is at
 * least `threshold` percent sure the note is genuine, and 'counterfeit'
 * ("Might be counterfeit") otherwise. There is no third outcome.
 *
 * Resolves to { error: 'unreliable' } when none of the photos can be used, and
 * rejects with { code: 'service' } when the assessment service is unavailable.
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
  const poorPhotos = photos.filter((photo) => photo.quality !== 'ok').length;
  const unsupported = !hasReferenceData(note);

  let score;
  if (forced) {
    score = FORCED_SCORES[outcome];
  } else if (photos.every((photo) => photo.sample)) {
    // Sample photos are made from a genuine note. If the user picks a
    // different value than the one photographed, the photos won't match.
    const matches = photos.every((photo) => photo.sampleValue === note.value);
    score = matches ? 0.975 : 0.2;
  } else {
    score = randomScore(random);
  }

  // Poor photos and unknown notes pull the score towards 0.5. Forced demo results skip this.
  let certainty = 1;
  if (!forced) {
    certainty -= 0.12 * poorPhotos;
    if (unsupported) certainty -= 0.3;
    if (state.settings.uploadQuality === 'saver') certainty -= 0.04;
    certainty = Math.max(0.2, certainty);
  }
  const pGenuine = 0.5 + (score - 0.5) * certainty;

  const percent = Math.round(pGenuine * 100);
  const threshold = state.settings.threshold;
  const label = percent >= threshold ? 'genuine' : 'counterfeit';

  const notes = [];
  if (!forced && unsupported) notes.push('unsupported');
  if (!forced && poorPhotos > 0) notes.push('lowq');

  return {
    pGenuine,
    confidence: percent / 100,
    label,
    threshold,
    perPhoto: photos.map((photo) => ({
      view: photo.view,
      quality: photo.quality,
      pGenuine: clamp(pGenuine + (random() - 0.5) * (photo.quality === 'ok' ? 0.06 : 0.3), 0.01, 0.99),
    })),
    model: MODEL_VERSION,
    simulated: true,
    uploadPx: Math.max(...photos.map((photo) => photo.uploadPx || 0)),
    notes,
  };
}

// For real photos: 40% clearly genuine, 30% fairly sure but under 95%, 30% low.
function randomScore(random) {
  const roll = random();
  if (roll < 0.4) return 0.955 + random() * 0.04;
  if (roll < 0.7) return 0.7 + random() * 0.24;
  return 0.05 + random() * 0.35;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
