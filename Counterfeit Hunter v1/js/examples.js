import { MODEL_VERSION, VIEWS } from './config.js';
import { drawNote, hasReferenceImage } from './images.js';
import { finalJudgement } from './judgement.js';
import { hashString } from './random.js';
import { saveHistory, state } from './state.js';
import { load, save } from './storage.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const THRESHOLD = 95;

// Two example records so History isn't empty on first launch. They are marked
// as examples in the UI, and are not added again once the user deletes history.
export function seedExampleRecords() {
  if (load('seeded', false) || state.history.length > 0) return;
  if (!hasReferenceImage(50000) || !hasReferenceImage(20000)) return;

  const now = Date.now();

  const clearedFifty = makeRecord({
    id: 'UG-261111-2214',
    value: 50000,
    daysAgo: 1,
    status: 'checked',
    ai: aiResult(0.97),
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
    id: 'UG-261109-0937',
    value: 20000,
    daysAgo: 3,
    status: 'review',
    ai: aiResult(0.72),
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

  state.history = [clearedFifty, doubtfulTwenty];
  saveHistory();
  save('seeded', true);
}

function aiResult(pGenuine) {
  const percent = Math.round(pGenuine * 100);
  return {
    pGenuine,
    confidence: percent / 100,
    label: percent >= THRESHOLD ? 'genuine' : 'counterfeit',
    threshold: THRESHOLD,
    perPhoto: VIEWS.map((view, i) => ({ view, quality: 'ok', pGenuine: pGenuine + (i % 2 ? 0.01 : -0.01) })),
    model: MODEL_VERSION,
    simulated: true,
    uploadPx: 1600,
    notes: [],
    ms: 2600,
  };
}

function makeRecord({ id, value, daysAgo, status, ai, checklist, review, now }) {
  const record = {
    id,
    created: new Date(now - daysAgo * DAY_MS - 3 * 60 * 60 * 1000).toISOString(),
    noteId: `UGX-${value}`,
    entered: null,
    photoList: VIEWS.map((view) => ({
      view,
      quality: 'ok',
      kept: false,
      sample: true,
      thumb: drawNote(value, view, { photo: true, width: 240, seed: hashString(id + view) }).toDataURL('image/jpeg', 0.7),
    })),
    ai,
    checklist,
    status,
    review,
    example: true,
  };
  record.final = finalJudgement(record);
  return record;
}
