import { t } from '../../i18n/index.js';
import { icons } from '../../icons.js';
import { noteCode, noteOf } from '../../inspection.js';
import { state } from '../../state.js';
import { header } from '../components.js';
import { each, escapeHtml } from '../dom.js';

const STAGES = ['an_1', 'an_2', 'an_3', 'an_4'];

export function analysing() {
  const { stage, slow, photoCount } = state.analysis;
  const note = noteOf(state.inspection);

  const stages = each(STAGES, (key, i) => {
    if (i < stage) return `<li class="done">${icons.check}${t(key)}</li>`;
    if (i === stage) return `<li class="on"><span class="dot"></span>${t(key)}</li>`;
    return `<li><span class="dot off"></span>${t(key)}</li>`;
  });

  return `
    ${header({ title: t('an_t'), subtitle: `<span class="mono">${escapeHtml(noteCode(note))}</span>`, step: 3 })}
    <main class="scroll" id="scroll">
      <div class="pad gut stack an">
        <div class="ring" aria-hidden="true">
          <svg viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="50" class="r-track"/>
            <circle cx="60" cy="60" r="50" class="r-arc"/>
          </svg>
          <span>${icons.scan}</span>
        </div>
        <p class="an-lead" role="status">${t('an_d', { n: photoCount })}</p>
        <ol class="an-steps">${stages}</ol>
        ${slow ? `<div class="note warn" style="text-align: left">${icons.warning}<span>${t('an_slow')}</span></div>` : ''}
      </div>
    </main>
    <footer class="foot gut">
      <button class="btn secondary" data-act="cancel-analysis">${t('an_cancel')}</button>
    </footer>
  `;
}
