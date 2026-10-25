import { MODEL_VERSION } from './config.js';
import { drawNote, hasReferenceImage } from './images.js';
import { hashString } from './random.js';
import { saveHistory, state } from './state.js';
import { load, save } from './storage.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Two example records so History isn't empty on first launch. They are marked
// as examples in the UI, and are not added again once the user deletes history.
export function seedExampleRecords() {
  if (load('seeded', false) || state.history.length > 0) return;
  if (!hasReferenceImage(50000) || !hasReferenceImage(20000)) return;

  const now = Date.now();

  const genuineFifty = makeRecord({
    id: 'UG-261024-2214',
    value: 50000,
    daysAgo: 1,
    status: 'preliminary',
    ai: aiResult({ pGenuine: 0.9, scores: [0.91, 0.88, 0.9, 0.92] }),
    checklist: {
      f_size: 'ok',
      f_colours: 'ok',
      f_text: 'ok',
      f_wm: 'ok',
      f_thread: 'ok',
      f_see: 'q',
      f_cc: 'ok',
      f_foil: 'ok',
      f_irid: 'ok',
      f_intaglio: 'ok',
    },
    review: null,
    now,
  });

  const doubtfulTwenty = makeRecord({
    id: 'UG-261022-0937',
    value: 20000,
    daysAgo: 3,
    status: 'review',
    ai: aiResult({ pGenuine: 0.37, scores: [0.4, 0.31, 0.39, 0.38] }),
    checklist: {
      f_size: 'ok',
      f_colours: 'ok',
      f_text: 'ok',
      f_wm: 'q',
      f_thread: 'no',
      f_see: 'q',
      f_cc: 'ok',
      f_foil: 'ok',
      f_irid: 'q',
      f_intaglio: 'no',
    },
    review: {
      obs: 'Print feels flat and the thread does not change colour when tilted.',
      serial: 'AK3318920',
      source: 'Customer payment at the shop',
      count: '2',
      sent: new Date(now - 3 * DAY_MS).toISOString(),
    },
    now,
  });

  state.history = [genuineFifty, doubtfulTwenty];
  saveHistory();
  save('seeded', true);
}

const EXAMPLE_VIEWS = ['front', 'light', 'tilt', 'serial'];

function aiResult({ pGenuine, scores }) {
  const confidence = Math.max(pGenuine, 1 - pGenuine);
  return {
    pGenuine,
    confidence,
    label: confidence * 100 < 70 ? 'inconclusive' : pGenuine >= 0.5 ? 'genuine' : 'counterfeit',
    threshold: 70,
    perPhoto: EXAMPLE_VIEWS.map((view, i) => ({ view, quality: 'ok', pGenuine: scores[i] })),
    model: MODEL_VERSION,
    simulated: true,
    uploadPx: 1600,
    notes: ['lowq'],
    ms: 2600,
  };
}

function makeRecord({ id, value, daysAgo, status, ai, checklist, review, now }) {
  return {
    id,
    created: new Date(now - daysAgo * DAY_MS - 3 * 60 * 60 * 1000).toISOString(),
    noteId: `UGX-${value}`,
    entered: null,
    checklist,
    photoList: EXAMPLE_VIEWS.map((view) => ({
      view,
      quality: 'ok',
      kept: false,
      sample: true,
      thumb: drawNote(value, view, { photo: true, width: 240, seed: hashString(id + view) }).toDataURL('image/jpeg', 0.7),
    })),
    ai,
    status,
    review,
    example: true,
  };
}
