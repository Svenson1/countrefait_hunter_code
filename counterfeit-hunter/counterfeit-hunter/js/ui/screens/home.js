import { BANKNOTES } from '../../data/banknotes.js';
import { t } from '../../i18n/index.js';
import { icons, LOGO } from '../../icons.js';
import { state } from '../../state.js';
import { noteImage, recordRow, tabBar } from '../components.js';
import { each } from '../dom.js';

export function home() {
  const recent = state.history.slice(0, 3);

  return `
    <header class="bar home">
      <div class="bar-in gut">
        <span class="mark">${LOGO}</span>
        <div class="bar-t">
          <p class="sub">${t('home_eyebrow')}</p>
          <h1>Counterfeit Hunter</h1>
        </div>
      </div>
    </header>

    <main class="scroll" id="scroll">
      <div class="pad gut stack">
        <section class="hero">
          <h2>${t('home_title')}</h2>
          <p class="lead">${t('home_lead')}</p>
          <div class="denoms" aria-hidden="true">
            ${each(BANKNOTES, (note) => `<img src="${noteImage(note)}" alt="">`)}
          </div>
          <ol class="layers">
            ${each([1, 2, 3], (n) => `<li><b>${n}</b><span>${t(`tut${n}_t`)}</span></li>`)}
          </ol>
          <button class="btn primary big" data-act="start">${icons.scan}${t('start')}</button>
        </section>

        ${state.tourHidden ? '' : tourCard()}

        <section class="section">
          <div class="sec-h">
            <h3 class="h3">${t('recent')}</h3>
            ${state.history.length > 3 ? `<button class="link" data-act="tab" data-to="history">${t('see_all')}</button>` : ''}
          </div>
          ${recent.length ? `<div class="group">${each(recent, recordRow)}</div>` : `<p class="empty">${t('no_history')}</p>`}
        </section>
      </div>
    </main>

    ${tabBar('home')}
  `;
}

function tourCard() {
  return `
    <section class="tour">
      <div>
        <h3>${t('tour_t')}</h3>
        <p>${t('tour_d')}</p>
      </div>
      <div class="tour-a">
        <button class="btn secondary sm" data-act="tour">${t('tour_btn')}</button>
        <button class="btn ghost sm" data-act="hide-tour">${t('tour_hide')}</button>
      </div>
    </section>
  `;
}
