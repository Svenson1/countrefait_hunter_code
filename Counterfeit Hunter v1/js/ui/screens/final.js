import { t } from '../../i18n/index.js';
import { icons, verdictIcon } from '../../icons.js';
import { noteCode, noteOf } from '../../inspection.js';
import { state } from '../../state.js';
import { aiSummary, checklistSummary, header } from '../components.js';
import { escapeHtml } from '../dom.js';

// Step 5. The second verdict, counting both the photos and the checklist (see judgement.js).
export function final() {
  const inspection = state.inspection;
  const result = inspection.final;
  const note = noteOf(inspection);
  const genuine = result.label === 'genuine';

  let description = t('fin_genuine_d');
  if (!genuine) description = result.counts.no > 0 ? t('fin_mismatch_d') : t('fin_counterfeit_d');

  return `
    ${header({
      title: t('fin_t'),
      subtitle: `<span class="mono">${escapeHtml(noteCode(note))}</span>`,
      back: 'to-checklist',
      close: true,
      step: 4,
    })}
    <main class="scroll" id="scroll">
      <div class="pad gut stack">
        <section class="verdict ${genuine ? 'v-g' : 'v-c'}">
          <div class="v-top">
            ${verdictIcon[result.label](42)}
            <h2 class="vl">${t(`res_${result.label}`)}</h2>
          </div>
          <p>${description}</p>
        </section>
        <div class="note info">${icons.info}<span>${t('fin_disclaimer')}</span></div>

        ${genuine ? '' : `<div class="note bad">${verdictIcon.counterfeit(20)}<span>${t('fin_cf')}</span></div>`}

        <section class="section">
          <h3 class="h3">${t('fin_how_t')}</h3>
          <div class="group">
            <div class="row kv"><span>${t('fin_photos')}</span>${aiSummary(inspection.ai)}</div>
            <div class="row kv"><span>${t('fin_checklist')}</span>${checklistSummary(inspection)}</div>
          </div>
          ${result.counts.total ? '' : `<p class="hint">${t('fin_none')}</p>`}
        </section>
      </div>
    </main>
    <footer class="foot gut">
      <button class="btn primary" data-act="finish">${t('fin_save')}</button>
      ${genuine ? '' : `<button class="btn secondary" data-act="to-review">${t('sm_escalate')}</button>`}
    </footer>
  `;
}
