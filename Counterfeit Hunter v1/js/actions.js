import { cameraStatus } from './camera.js';
import { ADMIN_PIN, DEFAULT_SETTINGS } from './config.js';
import { findBanknote, unknownBanknote } from './data/banknotes.js';
import {
  addPhoto,
  allPhotosTaken,
  cancelAnalysis,
  chooseNote,
  finishInspection,
  openPhotoStep,
  runAnalysis,
  selectView,
  showFinalResult,
  startInspection,
  takeLivePhoto,
  useSamplePhotos,
} from './flow.js';
import { detectLanguage, t } from './i18n/index.js';
import { reportHtml, summaryText } from './report.js';
import { emptyReviewDraft, saveHistory, saveSettings, state } from './state.js';
import { load, save } from './storage.js';
import { applySettings } from './theme.js';
import { $, showToast } from './ui/dom.js';
import { goTo, render } from './ui/render.js';
import { closeSheet, openSheet, renderSheet } from './ui/sheets.js';

/*
 * Every button in the app has data-act="name". main.js looks the name up here
 * and calls the function with the button's data attributes.
 */
export const actions = {
  // ---- Navigation ----

  start: () => startInspection(),

  tab: ({ to }) => {
    state.inspection = null;
    goTo(to);
  },

  'back-to-history': () => goTo('history'),

  leave: () =>
    openSheet({
      type: 'confirm',
      title: t('cf_leave'),
      description: t('cf_leave_d'),
      confirmLabel: t('cf_discard'),
      action: 'discard-inspection',
      danger: true,
    }),

  'discard-inspection': () => {
    state.runId = null;
    state.busy = false;
    state.inspection = null;
    goTo('home');
  },

  'to-photos': () => openPhotoStep(),
  'to-result': () => goTo('result'),
  'to-checklist': () => goTo('checklist'),
  'to-final-screen': () => goTo('final'),

  'to-summary': () => {
    state.inspection = null;
    goTo('summary');
  },

  // ---- Step 1: photos ----

  'select-view': ({ view }) => selectView(view),

  // With the live camera, take the frame. Otherwise open the phone's camera app.
  shutter: () => {
    const view = state.inspection.currentView;
    if (!view) return;
    if (cameraStatus() === 'live') {
      takeLivePhoto();
    } else {
      pickFile('#file-camera', view);
    }
  },

  'choose-photo': () => {
    const view = state.inspection.currentView;
    if (view) pickFile('#file-gallery', view);
  },

  'keep-photo': () => {
    const photo = state.sheet.photo;
    photo.kept = true;
    closeSheet();
    addPhoto(photo);
  },

  'retake-photo': () => {
    state.inspection.currentView = state.sheet.photo.view;
    closeSheet();
    render();
  },

  'sample-photos': () => useSamplePhotos(),

  'photos-done': () => {
    if (allPhotosTaken()) goTo('identify');
  },

  // ---- Step 2: the note, then the analysis ----

  'pick-note': ({ id }) => chooseNote(findBanknote(id)),
  'unknown-note': () => chooseNote(unknownBanknote()),

  'accept-consent': () => {
    save('consent', true);
    state.sheet = null;
    renderSheet();
    runAnalysis();
  },

  'privacy-from-consent': () => openSheet({ type: 'privacy', returnTo: { type: 'consent' } }),
  'cancel-analysis': () => cancelAnalysis(),
  retry: () => runAnalysis(),

  // ---- Step 3: result. The user decides whether to do the checklist. ----

  'skip-checklist': () => finishInspection(),

  // ---- Step 4: security checklist, then step 5: final result ----

  answer: ({ item, value }) => {
    state.inspection.checklist[item] = value;
    render();
  },

  'to-final': () => showFinalResult(),
  finish: () => finishInspection(),

  // ---- Bank verification and the saved record ----

  'to-review': () => {
    state.reviewDraft = emptyReviewDraft();
    goTo('review');
  },

  'send-review': () => {
    const inspection = state.inspection;
    inspection.review = { ...state.reviewDraft, sent: new Date().toISOString() };
    inspection.status = 'review';
    finishInspection(inspection.fromRecord ? state.recordOpenedFrom : 'flow');
  },

  // Ask for bank verification from a record that is already saved.
  escalate: () => {
    state.inspection = { ...structuredClone(state.record), fromRecord: true };
    state.reviewDraft = emptyReviewDraft();
    goTo('review');
  },

  'open-record': ({ id }) => {
    const record = state.history.find((item) => item.id === id);
    if (!record) return;
    state.record = record;
    state.recordOpenedFrom = 'history';
    goTo('summary');
  },

  'close-record': () => {
    state.record = null;
    goTo('home');
  },

  export: async () => {
    if (!state.downloads) return;
    try {
      await state.downloads.save({ filename: `${state.record.id}.html`, data: reportHtml(state.record) });
      showToast(t('sm_exported'));
    } catch (error) {
      if (error?.code !== 'declined') showToast(t('sm_export_fail'));
    }
  },

  'copy-summary': async () => {
    const text = summaryText(state.record);
    try {
      await navigator.clipboard.writeText(text);
      showToast(t('sm_copied'));
    } catch {
      openSheet({ type: 'copyText', text });
    }
  },

  // ---- Feedback ----

  report: () => openFeedback('wrong'),
  feedback: () => openFeedback('bug'),

  'feedback-type': ({ value }) => {
    state.feedbackDraft.type = value;
    renderSheet();
  },

  'send-feedback': () => {
    if (!state.feedbackDraft.text.trim()) {
      state.feedbackError = true;
      renderSheet();
      return;
    }
    const saved = load('feedback', []);
    saved.push({
      ...state.feedbackDraft,
      at: new Date().toISOString(),
      check: state.inspection?.id ?? state.record?.id ?? null,
    });
    save('feedback', saved);
    state.feedbackError = false;
    state.sheet = null;
    renderSheet();
    showToast(t('fb_sent'));
  },

  // ---- Help sheets and the introduction tour ----

  tips: () => openSheet({ type: 'tips' }),

  // "Don't show again" in the photo tips. The same switch is in Settings.
  'hide-tips': () => {
    state.settings.showTips = false;
    saveSettings();
    closeSheet();
    showToast(t('tips_hidden'));
  },

  'privacy-from-tips': () => openSheet({ type: 'privacy', returnTo: { type: 'tips' } }),
  privacy: () => openSheet({ type: 'privacy' }),
  licences: () => openSheet({ type: 'licences' }),
  tour: () => openSheet({ type: 'tour', page: 0 }),

  'next-tour-page': () => {
    state.sheet.page += 1;
    renderSheet();
  },

  'finish-tour': () => {
    hideTour();
    state.sheet = null;
    renderSheet();
    render();
  },

  'hide-tour': () => {
    hideTour();
    render();
  },

  'close-sheet': () => closeSheet(),

  // ---- Settings ----

  'toggle-setting': ({ key }) => {
    state.settings[key] = !state.settings[key];
    saveSettings();
    applySettings();
    render();
  },

  'unlock-admin': () => {
    const pin = $('#pin')?.value ?? '';
    state.adminUnlocked = pin === ADMIN_PIN;
    state.pinError = !state.adminUnlocked;
    render();
  },

  'lock-admin': () => {
    state.adminUnlocked = false;
    render();
  },

  'delete-history': () =>
    openSheet({
      type: 'confirm',
      title: t('s_del'),
      description: t('s_del_d', { n: state.history.length }),
      confirmLabel: t('s_del_ok'),
      action: 'confirm-delete-history',
      danger: true,
    }),

  'confirm-delete-history': () => {
    state.history = [];
    saveHistory();
    save('seeded', true); // don't bring the examples back
    state.sheet = null;
    renderSheet();
    render();
    showToast(t('s_deleted'));
  },

  'reset-settings': () =>
    openSheet({
      type: 'confirm',
      title: t('s_reset'),
      description: t('s_reset_d'),
      confirmLabel: t('s_reset_ok'),
      action: 'confirm-reset-settings',
      danger: true,
    }),

  'confirm-reset-settings': () => {
    state.settings = { ...DEFAULT_SETTINGS, lang: detectLanguage() };
    saveSettings();
    applySettings();
    state.sheet = null;
    renderSheet();
    render();
    showToast(t('s_reset_done'));
  },
};

// The file input has to be clicked inside the tap handler, or the browser blocks it.
function pickFile(selector, view) {
  state.captureView = view;
  const input = $(selector);
  input.value = '';
  input.click();
}

function openFeedback(type) {
  state.feedbackDraft = { type, text: '' };
  state.feedbackError = false;
  openSheet({ type: 'feedback' });
}

function hideTour() {
  state.tourHidden = true;
  save('tourHidden', true);
}
