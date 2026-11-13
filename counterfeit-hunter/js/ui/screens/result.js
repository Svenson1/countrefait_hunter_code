import { t } from '../../i18n/index.js';
import { icons, verdictIcon } from '../../icons.js';
import { hasReferenceData, noteCode, noteOf } from '../../inspection.js';
import { state } from '../../state.js';
import { header } from '../components.js';
import { escapeHtml } from '../dom.js';

/*
 * Step 3. One of two verdicts in plain words, marked as an AI estimate, then
 * the question whether to do the checklist. The certainty behind the verdict
 * stays inside the app.
 */
export function result() {
  const inspection = state.inspection;
  const ai = inspection.ai;
  const note = noteOf(inspection);
  const genuine = ai.label === 'genuine';
  const poorPhotos = ai.notes.includes('lowq');

  return `
    ${header({
      title: t('res_t'),
      subtitle: `<span class="mono">${escapeHtml(noteCode(note))}</span>`,
      close: true,
      step: 2,
    })}
    <main class="scroll" id="scroll">
      <div class="pad gut stack">
        <section class="verdict ${genuine ? 'v-g' : 'v-c'}">
          <div class="v-top">
            ${verdictIcon[ai.label](42)}
            <h2 class="vl">${t(`res_${ai.label}`)}</h2>
          </div>
          <p>${t(`res_${ai.label}_d`)}</p>
        </section>
        <div class="note info">${icons.info}<span>${t('res_disclaimer')}</span></div>

        ${genuine ? '' : `<div class="note bad">${verdictIcon.counterfeit(20)}<span>${t('res_cf')}</span></div>`}
        ${ai.notes.includes('unsupported') ? `<div class="note warn">${icons.warning}<span>${t('res_unsupported')}</span></div>` : ''}
        ${poorPhotos ? `<div class="note warn">${icons.warning}<span>${t('res_lowq')}</span></div>` : ''}
        ${poorPhotos ? `<button class="link center" data-act="to-photos">${icons.camera}${t('res_retake')}</button>` : ''}

        <button class="link center" data-act="report">${icons.flag}${t('res_report')}</button>
      </div>
    </main>
    <footer class="foot gut">${checklistQuestion(note, genuine)}</footer>
  `;
}

// The footer asks whether to go on to the security checklist.
function checklistQuestion(note, genuine) {
  if (!hasReferenceData(note)) {
    return `
      <p class="foot-q">${t('ask_unknown')}</p>
      <button class="btn primary" data-act="skip-checklist">${t('res_finish')}</button>
    `;
  }
  return `
    <div class="foot-q">
      <strong>${t('ask_t')}</strong>
      <span>${genuine ? t('ask_g') : t('ask_c')}</span>
    </div>
    <button class="btn primary" data-act="to-checklist">${t('ask_yes')}</button>
    <button class="btn ghost" data-act="skip-checklist">${t('ask_no')}</button>
  `;
}
