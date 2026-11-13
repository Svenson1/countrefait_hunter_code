import { t } from '../../i18n/index.js';
import { icons } from '../../icons.js';
import { state } from '../../state.js';
import { header, recordRow, tabBar } from '../components.js';
import { each } from '../dom.js';

export function history() {
  const count = state.history.length;

  const content = count
    ? `<div class="group">${each(state.history, recordRow)}</div>`
    : `
      <div class="empty-state">
        ${icons.clock}
        <p>${t('hi_empty')}</p>
        <button class="btn primary sm" data-act="start">${t('start')}</button>
      </div>
    `;

  return `
    ${header({ title: t('hi_t'), subtitle: count ? t('hi_n', { n: count }) : '' })}
    <main class="scroll" id="scroll">
      <div class="pad gut stack">${content}</div>
    </main>
    ${tabBar('history')}
  `;
}
