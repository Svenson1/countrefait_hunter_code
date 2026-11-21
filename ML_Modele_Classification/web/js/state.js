import { DEFAULT_SETTINGS, LANGUAGES } from './config.js';
import { load, save } from './storage.js';
import { detectLanguage } from './i18n/index.js';

export function emptyReviewDraft() {
  return { obs: '', serial: '', source: '', count: '' };
}

// Everything the UI needs lives in this one object. Screens read from it,
// actions change it and then call render().
export const state = {
  screen: 'home',
  settings: { ...DEFAULT_SETTINGS, ...load('settings', {}) },
  history: load('history', []),

  inspection: null, // the check in progress
  record: null, // the saved check shown on the summary screen
  recordOpenedFrom: 'flow', // 'flow' or 'history'

  sheet: null,
  captureView: null,
  busy: false,
  runId: null,
  analysis: null,
  error: null,

  adminUnlocked: false,
  pinError: false,
  tourHidden: load('tourHidden', false),
  reviewDraft: emptyReviewDraft(),
  feedbackDraft: { type: 'bug', text: '' },
  feedbackError: false,

  // Description of the trained model on the server (GET /api/model), null until loaded.
  modelInfo: null,

  // Set when the page runs inside the Claude viewer and file downloads are allowed.
  downloads: null,
};

if (!LANGUAGES[state.settings.lang]) {
  state.settings.lang = detectLanguage();
}

export function saveSettings() {
  save('settings', state.settings);
}

export function saveHistory() {
  save('history', state.history);
}
