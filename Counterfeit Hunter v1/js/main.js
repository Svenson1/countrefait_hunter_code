import { actions } from './actions.js';
import { onCameraChange } from './camera.js';
import { seedExampleRecords } from './examples.js';
import { handlePhotoFile } from './flow.js';
import { formatPercent } from './format.js';
import { loadReferenceImages } from './images.js';
import { saveSettings, state } from './state.js';
import { applySettings, watchViewerTheme } from './theme.js';
import { $ } from './ui/dom.js';
import { render } from './ui/render.js';
import { updateNoteSearch } from './ui/screens/identify.js';
import { closeSheet } from './ui/sheets.js';

const device = document.getElementById('device');

// One click handler for the whole app: buttons say what they do with data-act.
device.addEventListener('click', (event) => {
  const target = event.target.closest('[data-act]');
  if (!target || target.disabled) return;

  const name = target.dataset.act;
  if (name === 'sheet-backdrop') {
    // Only a click on the dimmed area closes the sheet, not a click inside it.
    if (event.target === target) closeSheet();
    return;
  }

  const action = actions[name];
  if (action) {
    event.preventDefault();
    action(target.dataset);
  }
});

// Typing updates state without a full re-render, so the input keeps focus.
device.addEventListener('input', (event) => {
  const field = event.target;

  if (field.dataset.reviewField) {
    state.reviewDraft[field.dataset.reviewField] = field.value;
  } else if (field.id === 'feedback-text') {
    state.feedbackDraft.text = field.value;
  } else if (field.id === 'note-search') {
    updateNoteSearch(field.value);
  } else if (field.id === 'threshold') {
    state.settings.threshold = Number(field.value);
    $('#threshold-value').textContent = formatPercent(state.settings.threshold);
  }
});

device.addEventListener('change', (event) => {
  const field = event.target;

  if (field.dataset.setting) {
    state.settings[field.dataset.setting] = field.value;
    saveSettings();
    applySettings();
    render();
  } else if (field.id === 'threshold') {
    saveSettings();
  } else if (field.id === 'file-camera' || field.id === 'file-gallery') {
    handlePhotoFile(field.files?.[0]);
  }
});

device.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.sheet) {
    closeSheet();
  } else if (event.key === 'Enter' && event.target.id === 'pin') {
    actions['unlock-admin']();
  } else if (event.key === 'Enter' && event.target.id === 'note-search') {
    event.target.blur(); // hides the phone keyboard so the notes can be seen
  }
});

// Inside the Claude viewer the page may save files through the "downloads"
// capability. Anywhere else window.claude doesn't exist and Export stays hidden.
async function connectDownloads() {
  if (typeof window.claude?.use !== 'function') return;
  try {
    const downloads = await window.claude.use('downloads');
    if (downloads) {
      state.downloads = downloads;
      if (state.screen === 'summary') render();
    }
  } catch {
    // no downloads, no Export button
  }
}

applySettings();
watchViewerTheme();
onCameraChange(() => {
  if (state.screen === 'photos') render();
});
render({ resetScroll: true });

loadReferenceImages().then(() => {
  seedExampleRecords();
  render();
});
connectDownloads();
