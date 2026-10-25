import { VIEWS } from './config.js';
import { t } from './i18n/index.js';
import { drawNote, hasReferenceImage, readPhoto } from './images.js';
import { createInspection, noteOf, photosOf, toRecord } from './inspection.js';
import { classify } from './model.js';
import { hashString } from './random.js';
import { saveHistory, state } from './state.js';
import { showToast } from './ui/dom.js';
import { goTo, render } from './ui/render.js';
import { closeSheet, openSheet } from './ui/sheets.js';

// The steps of one banknote check: choose the note, checklist, photos, analysis, result.

export function startInspection() {
  state.inspection = createInspection();
  state.query = '';
  state.busy = false;
  goTo('identify');
}

export function openPhotoStep() {
  goTo('photos');
  if (state.settings.showTips && !state.inspection.tipsShown) {
    state.inspection.tipsShown = true;
    openSheet({ type: 'tips' });
  }
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

export function addPhoto(photo) {
  const inspection = state.inspection;
  if (photo.view === 'extra') inspection.extras.push(photo);
  else inspection.photos[photo.view] = photo;
  render();
  showToast(t('ph_added', { v: t(`v_${photo.view}`) }));
}

export async function handlePhotoFile(file) {
  if (!file || !state.inspection) return;
  const view = state.captureView;
  closeSheet();
  showToast(t('q_checking'));

  let photo;
  try {
    photo = await readPhoto(file, view);
  } catch {
    showToast(t('q_err'));
    return;
  }

  if (photo.quality !== 'ok' && state.settings.qualityWarnings) {
    openSheet({ type: 'quality', photo });
  } else {
    addPhoto(photo);
  }
}

// Demo only: fill four of the five views with photos drawn from the reference
// image. The tilted one is darkened so the quality warning shows up.
export async function useSamplePhotos() {
  const inspection = state.inspection;
  const note = noteOf(inspection);
  if (note.unlisted || !hasReferenceImage(note.value)) return;

  for (const view of ['front', 'light', 'tilt', 'serial']) {
    const canvas = drawNote(note.value, view, {
      photo: true,
      width: 960,
      dark: view === 'tilt',
      seed: hashString(note.id + view),
    });
    const photo = await readPhoto(canvas.toDataURL('image/jpeg', 0.86), view, { sample: true });
    photo.kept = photo.quality !== 'ok';
    inspection.photos[view] = photo;
  }

  render();
  const covered = VIEWS.filter((view) => inspection.photos[view]).length;
  showToast(t('ph_count', { a: covered, n: VIEWS.length }));
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
  inspection.status = result.label === 'inconclusive' ? 'inconclusive' : 'preliminary';
  goTo('result');
}

export function cancelAnalysis() {
  state.runId = null;
  state.busy = false;
  goTo('photos');
  showToast(t('an_cancelled'));
}
