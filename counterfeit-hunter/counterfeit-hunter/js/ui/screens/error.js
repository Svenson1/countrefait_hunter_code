import { t } from '../../i18n/index.js';
import { icons } from '../../icons.js';
import { noteCode, noteOf } from '../../inspection.js';
import { state } from '../../state.js';
import { header } from '../components.js';
import { escapeHtml } from '../dom.js';

// state.error is 'service' (no answer from the model), 'wifi' (on mobile data
// with Wi-Fi-only uploads) or 'unreliable' (every photo failed the quality check).
export function error() {
  const kind = state.error;
  const note = noteOf(state.inspection);
  const technical = kind !== 'unreliable';

  const messages = { service: 'er_service', wifi: 'er_wifi', unreliable: 'er_unrel' };

  return `
    ${header({
      title: t('res_t'),
      subtitle: `<span class="mono">${escapeHtml(noteCode(note))}</span>`,
      close: true,
      step: 3,
    })}
    <main class="scroll" id="scroll">
      <div class="pad gut stack err">
        <div class="err-ic">${technical ? icons.offline : icons.warning}</div>
        <h2>${technical ? t('er_t') : t('er_unrel_t')}</h2>
        <p>${t(messages[kind])}</p>
        ${technical ? `<div class="note info">${icons.info}<span>${t('er_note')}</span></div>` : ''}
      </div>
    </main>
    <footer class="foot gut">
      ${technical ? `<button class="btn primary" data-act="retry">${t('er_retry')}</button>` : ''}
      <button class="btn ${technical ? 'secondary' : 'primary'}" data-act="to-photos">${t('er_back')}</button>
    </footer>
  `;
}
