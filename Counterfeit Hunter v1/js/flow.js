import { cameraStatus, captureFrame } from './camera.js';
import { VIEWS } from './config.js';
import { BANKNOTES } from './data/banknotes.js';
import { formatNumber } from './format.js';
import { t } from './i18n/index.js';
import { drawNote, hasReferenceImage, readPhoto } from './images.js';
import { createInspection, photosOf, toRecord } from './inspection.js';
import { finalJudgement } from './judgement.js';
import { classify } from './model.js';
import { hashString } from './random.js';
import { saveHistory, state } from './state.js';
import { load } from './storage.js';
import { showToast } from './ui/dom.js';
import { goTo, render } from './ui/render.js';
import { closeSheet, openSheet } from './ui/sheets.js';

// The steps of one banknote check: six photos, choose the note, photo result,
// then the security checklist and the final result if the user wants them.

export function startInspection() {
  state.inspection = createInspection();
  state.busy = false;
  openPhotoStep();
}

export function openPhotoStep() {
  const inspection = state.inspection;
  inspection.currentView = nextMissingView(inspection);
  goTo('photos');
  if (state.settings.showTips && !inspection.tipsShown) {
    inspection.tipsShown = true;
    openSheet({ type: 'tips' });
  }
}

// ---- Photos ----

// The next view without a photo, starting after `after`, or null when all six are taken.
function nextMissingView(inspection, after = null) {
  const start = after ? VIEWS.indexOf(after) + 1 : 0;
  for (let i = 0; i < VIEWS.length; i++) {
    const view = VIEWS[(start + i) % VIEWS.length];
    if (!inspection.photos[view]) return view;
  }
  return null;
}

export function selectView(view) {
  state.inspection.currentView = view;
  render();
}

export function addPhoto(photo) {
  const inspection = state.inspection;
  inspection.photos[photo.view] = photo;
  inspection.currentView = nextMissingView(inspection, photo.view);
  render();
  showToast(t('ph_added', { v: t(`v_${photo.view}`) }));
}

// A photo that fails the light or distance check gets a warning first, so the
// user can retake it (or keep it anyway).
function reviewPhoto(photo) {
  if (photo.quality !== 'ok' && state.settings.qualityWarnings) {
    openSheet({ type: 'quality', photo });
  } else {
    addPhoto(photo);
  }
}

export async function takeLivePhoto() {
  const view = state.inspection.currentView;
  if (!view || cameraStatus() !== 'live') return;
  try {
    reviewPhoto(await captureFrame(view));
  } catch {
    showToast(t('q_err'));
  }
}

// A photo from the phone's camera app or the gallery, for the view that was selected when it was picked.
export async function handlePhotoFile(file) {
  if (!file || !state.inspection) return;
  closeSheet();
  showToast(t('q_checking'));
  try {
    reviewPhoto(await readPhoto(file, state.captureView));
  } catch {
    showToast(t('q_err'));
  }
}

// Demo only: six photos of a random note, drawn from its reference image.
export async function useSamplePhotos() {
  const inspection = state.inspection;
  const available = BANKNOTES.filter((note) => hasReferenceImage(note.value));
  if (!available.length) return;

  const note = available[Math.floor(Math.random() * available.length)];
  for (const view of VIEWS) {
    const canvas = drawNote(note.value, view, { photo: true, width: 960, seed: hashString(note.id + view) });
    inspection.photos[view] = await readPhoto(canvas.toDataURL('image/jpeg', 0.86), view, {
      sample: true,
      sampleValue: note.value,
    });
  }
  inspection.currentView = null;

  render();
  showToast(t('ph_sample_added', { v: formatNumber(note.value) }));
}

export function allPhotosTaken() {
  return VIEWS.every((view) => state.inspection.photos[view]);
}

// ---- Note and analysis ----

export function chooseNote(note) {
  state.inspection.note = note;
  state.inspection.checklist = {};
  state.inspection.final = null;
  if (load('consent', false)) runAnalysis();
  else openSheet({ type: 'consent' });
}

const ANALYSIS_TIME_MS = 2600;
const SLOW_ANALYSIS_TIME_MS = 9000;
const FAILED_ANALYSIS_TIME_MS = 1800;
const SLOW_WARNING_AFTER_MS = 5000;
const STAGE_TIMES_MS = [400, 1000, 1700];

export async function runAnalysis() {
  if (state.busy) return; // a request is already running
  const inspection = state.inspection;

  const onMobileData = navigator.connection?.type === 'cellular';
  if (state.settings.wifiOnly && onMobileData) {
    state.error = 'wifi';
    goTo('error');
    return;
  }

  // runId lets us ignore a result that arrives after the user cancelled.
  const runId = Math.random();
  state.runId = runId;
  state.busy = true;
  state.analysis = { stage: 0, slow: false, photoCount: photosOf(inspection).length };
  goTo('analysing');

  const outcome = state.settings.demoOutcome;
  const slow = outcome === 'slow';
  let duration = ANALYSIS_TIME_MS;
  if (slow) duration = SLOW_ANALYSIS_TIME_MS;
  else if (outcome === 'error') duration = FAILED_ANALYSIS_TIME_MS;

  const stillRunning = () => state.runId === runId;

  STAGE_TIMES_MS.forEach((time, index) => {
    setTimeout(() => {
      if (!stillRunning()) return;
      state.analysis.stage = index + 1;
      if (state.screen === 'analysing') render();
    }, slow ? time * 2.4 : time);
  });

  if (slow) {
    setTimeout(() => {
      if (!stillRunning()) return;
      state.analysis.slow = true;
      if (state.screen === 'analysing') render();
    }, SLOW_WARNING_AFTER_MS);
  }

  const startedAt = performance.now();
  let result = null;
  let failed = false;
  try {
    result = await classify(inspection);
  } catch {
    failed = true;
  }

  // Keep the progress screen up for the expected time, so the stages read naturally.
  const remaining = duration - (performance.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));

  if (!stillRunning()) return;
  state.busy = false;

  if (failed) {
    state.error = 'service';
    goTo('error');
    return;
  }
  if (result.error) {
    state.error = 'unreliable';
    goTo('error');
    return;
  }

  result.ms = duration;
  inspection.ai = result;
  inspection.status = 'preliminary';
  goTo('result');
}

export function cancelAnalysis() {
  state.runId = null;
  state.busy = false;
  goTo('identify');
  showToast(t('an_cancelled'));
}

// ---- Final result and saving ----

export function showFinalResult() {
  const inspection = state.inspection;
  inspection.final = finalJudgement(inspection);
  inspection.status = 'checked';
  goTo('final');
}

// Save the current inspection to history and show its summary.
export function finishInspection(openedFrom = 'flow') {
  const record = toRecord(state.inspection);
  const index = state.history.findIndex((item) => item.id === record.id);
  if (index >= 0) state.history[index] = record;
  else state.history.unshift(record);
  saveHistory();

  state.record = record;
  state.recordOpenedFrom = openedFrom;
  state.inspection = null;
  goTo('summary');
  showToast(t('sm_saved'));
}
