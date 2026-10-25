import { ADMIN_PIN, DEFAULT_SETTINGS } from './config.js';
import {
  addPhoto,
  cancelAnalysis,
  finishInspection,
  openPhotoStep,
  runAnalysis,
  startInspection,
  useSamplePhotos,
} from './flow.js';
import { detectLanguage, t } from './i18n/index.js';
import { findBanknote, unknownBanknote } from './data/banknotes.js';
import { photosOf } from './inspection.js';
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

  'to-identify': () => goTo('identify'),
  'to-note-info': () => goTo('noteInfo'),
  'to-checklist': () => goTo('checklist'),
  'to-photos': () => openPhotoStep(),
  'to-result': () => goTo('result'),

  'to-summary': () => {
    state.inspection = null;
    goTo('summary');
  },

  // ---- Choosing the note and the checklist ----

  'pick-note': ({ id }) => {
    state.inspection.note = findBanknote(id);
    state.inspection.checklist = {};
    goTo('noteInfo');
  },

  'unknown-note': () => {
    state.inspection.note = unknownBanknote(state.query.trim());
    state.inspection.checklist = {};
    openPhotoStep();
  },

  answer: ({ item, value }) => {
    state.inspection.checklist[item] = value;
    render();
  },

  'finish-without-ai': () => {
    state.inspection.status = 'manual';
    finishInspection();
  },

  // ---- Photos ----

  capture: ({ view }) => openSheet({ type: 'capture', view }),

  // The file inputs must be clicked inside the tap handler, or the browser blocks them.
  'take-photo': () => pickFile('#file-camera'),
  'choose-photo': () => pickFile('#file-gallery'),

  'keep-photo': () => {
    const photo = state.sheet.photo;
    photo.kept = true;
    closeSheet();
    addPhoto(photo);
  },

  'retake-photo': () => openSheet({ type: 'capture', view: state.sheet.photo.view }),

  'remove-photo': ({ view, index }) => {
    if (index !== undefined) state.inspection.extras.splice(Number(index), 1);
    else delete state.inspection.photos[view];
    render();
    showToast(t('ph_removed'));
  },

  'sample-photos': () => useSamplePhotos(),

  submit: () => {
    if (state.busy || photosOf(state.inspection).length === 0) return;
    if (load('consent', false)) runAnalysis();
    else openSheet({ type: 'consent' });
  },

  'accept-consent': () => {
    save('consent', true);
    state.sheet = null;
    renderSheet();
    runAnalysis();
  },

  'privacy-from-consent': () => openSheet({ type: 'privacy', returnTo: { type: 'consent' } }),
  'cancel-analysis': () => cancelAnalysis(),
  retry: () => runAnalysis(),

  // ---- Result, bank verification and the saved record ----

  finish: () => finishInspection(),

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

function pickFile(selector) {
  state.captureView = state.sheet.view;
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
