import { BANKNOTES } from '../data/banknotes.js';
import { t } from '../i18n/index.js';
import { icons } from '../icons.js';
import { viewIllustration } from '../images.js';
import { noteOf } from '../inspection.js';
import { state } from '../state.js';
import { $, each, escapeHtml } from './dom.js';

/*
 * Bottom sheets: small dialogs that slide up over the current screen.
 * state.sheet is { type, ...data }. A sheet can carry `returnTo`, another sheet
 * to reopen when it closes (privacy information opened from the consent sheet).
 */

export function openSheet(sheet) {
  state.sheet = sheet;
  renderSheet();
}

export function closeSheet() {
  const returnTo = state.sheet?.returnTo;
  state.sheet = null;
  if (returnTo) openSheet(returnTo);
  else renderSheet();
}

export function renderSheet() {
  const root = $('#sheetRoot');
  const sheet = state.sheet;
  if (!sheet) {
    root.innerHTML = '';
    return;
  }

  root.innerHTML = `
    <div class="sheet-wrap" data-act="sheet-backdrop">
      <div class="sheet gut" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div class="grab"></div>
        ${templates[sheet.type](sheet)}
      </div>
    </div>
  `;

  const firstControl = root.querySelector('.sheet button, .sheet textarea');
  if (firstControl) {
    setTimeout(() => firstControl.focus({ preventScroll: true }), 30);
  }
  if (sheet.type === 'copyText') {
    const area = $('#copy-area');
    area.focus();
    area.select();
  }
}

const currentNote = () => (state.inspection ? noteOf(state.inspection) : BANKNOTES[BANKNOTES.length - 1]);

const closeButton = (label = t('close')) => `<button class="btn primary" data-act="close-sheet">${label}</button>`;

const templates = {
  capture: ({ view }) => `
    <h2 id="sheet-title">${t(`v_${view}`)}</h2>
    <div class="cap-ill"><img src="${viewIllustration(currentNote(), view)}" alt=""></div>
    <p>${t(`tip_${view}`)}</p>
    <div class="sheet-a">
      <button class="btn primary" data-act="take-photo">${icons.camera}${t('ph_take')}</button>
      <button class="btn secondary" data-act="choose-photo">${icons.image}${t('ph_choose')}</button>
      <button class="btn ghost" data-act="close-sheet">${t('cancel')}</button>
    </div>
  `,

  quality: ({ photo }) => `
    <h2 id="sheet-title">${t(`q_${photo.quality}`)}</h2>
    <div class="q-prev"><img src="${photo.preview}" alt="${escapeHtml(t(`v_${photo.view}`))}"></div>
    <p>${t(`q_${photo.quality}_d`)}</p>
    <div class="sheet-a">
      <button class="btn primary" data-act="retake-photo">${icons.camera}${t('ph_retake')}</button>
      <button class="btn secondary" data-act="keep-photo">${t('q_keep')}</button>
    </div>
  `,

  tips: () => `
    <h2 id="sheet-title">${t('tips_t')}</h2>
    <ol>${each([1, 2, 3, 4, 5], (n) => `<li>${t(`tips_${n}`)}</li>`)}</ol>
    <div class="note info">${icons.info}<span>${t('tips_more')}</span></div>
    <div class="sheet-a">${closeButton(t('done'))}</div>
  `,

  tour: ({ page }) => {
    const n = page + 1;
    const isLast = page === 2;
    return `
      <p class="tour-n">${t('tut_of', { n })}</p>
      <span class="tour-big">${n}</span>
      <h2 id="sheet-title">${t(`tut${n}_t`)}</h2>
      <p>${t(`tut${n}_d`)}</p>
      ${isLast ? `<div class="note info">${icons.info}<span>${t('tut_note')}</span></div>` : ''}
      <div class="dots" aria-hidden="true">${each([0, 1, 2], (i) => `<i class="${i === page ? 'on' : ''}"></i>`)}</div>
      <div class="sheet-a">
        ${isLast
          ? `<button class="btn primary" data-act="finish-tour">${t('tut_go')}</button>`
          : `<button class="btn primary" data-act="next-tour-page">${t('tut_next')}</button>`}
        <button class="btn ghost" data-act="finish-tour">${t('close')}</button>
      </div>
    `;
  },

  consent: () => `
    <h2 id="sheet-title">${t('pv_t')}</h2>
    <p>${t('pv_d')}</p>
    <div class="note info">${icons.info}<span>${t('pv_proto')}</span></div>
    <div class="sheet-a">
      <button class="btn primary" data-act="accept-consent">${t('pv_ok')}</button>
      <button class="btn ghost" data-act="privacy-from-consent">${t('pv_more')}</button>
    </div>
  `,

  privacy: ({ returnTo }) => `
    <h2 id="sheet-title">${t('priv_t')}</h2>
    <ul>${each([1, 2, 3, 4], (n) => `<li>${t(`priv_${n}`)}</li>`)}</ul>
    <div class="sheet-a">${closeButton(returnTo ? t('back') : t('close'))}</div>
  `,

  licences: () => `
    <h2 id="sheet-title">${t('lic_t')}</h2>
    <ul>${each([1, 2, 3, 4], (n) => `<li>${t(`lic_${n}`)}</li>`)}</ul>
    <div class="sheet-a">${closeButton()}</div>
  `,

  feedback: () => {
    const draft = state.feedbackDraft;
    const types = [
      ['wrong', 'fb_wrong'],
      ['bug', 'fb_bug'],
      ['idea', 'fb_idea'],
    ];
    return `
      <h2 id="sheet-title">${t('fb_t')}</h2>
      <span class="eyebrow">${t('fb_about')}</span>
      <div class="radio-list" role="radiogroup" aria-label="${escapeHtml(t('fb_about'))}">
        ${each(types, ([value, label]) => `
          <button role="radio" aria-checked="${draft.type === value}" data-act="feedback-type" data-value="${value}">
            <i></i>${t(label)}
          </button>
        `)}
      </div>
      <div class="field">
        <label for="feedback-text">${t('fb_text')}</label>
        <textarea id="feedback-text" class="input" placeholder="${escapeHtml(t('fb_ph'))}">${escapeHtml(draft.text)}</textarea>
        ${state.feedbackError ? `<span class="err-t">${t('fb_need')}</span>` : ''}
      </div>
      <div class="sheet-a">
        <button class="btn primary" data-act="send-feedback">${t('fb_send')}</button>
        <button class="btn ghost" data-act="close-sheet">${t('cancel')}</button>
      </div>
    `;
  },

  // Generic "are you sure?" sheet. `action` runs when the user confirms.
  confirm: ({ title, description, confirmLabel, action, danger }) => `
    <h2 id="sheet-title">${title}</h2>
    <p>${description}</p>
    <div class="sheet-a">
      <button class="btn ${danger ? 'danger' : 'primary'}" data-act="${action}">${confirmLabel}</button>
      <button class="btn ghost" data-act="close-sheet">${t('cancel')}</button>
    </div>
  `,

  // Fallback when the clipboard is not available: show the text, already selected.
  copyText: ({ text }) => `
    <h2 id="sheet-title">${t('sm_copy')}</h2>
    <p class="hint">${t('sm_copy_fail')}</p>
    <textarea id="copy-area" class="input" style="min-height: 220px" readonly>${escapeHtml(text)}</textarea>
    <div class="sheet-a">${closeButton(t('done'))}</div>
  `,
};
