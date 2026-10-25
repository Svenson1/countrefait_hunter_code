import { BANKNOTES } from '../../data/banknotes.js';
import { t } from '../../i18n/index.js';
import { icons } from '../../icons.js';
import { noteName } from '../../inspection.js';
import { state } from '../../state.js';
import { header, noteImage } from '../components.js';
import { each, escapeHtml } from '../dom.js';

export function identify() {
  return `
    ${header({ title: t('id_title'), subtitle: t('step_n', { n: 1 }), close: true, step: 0 })}
    <main class="scroll" id="scroll">
      <div class="pad gut stack">
        <div class="field">
          <label for="q">${t('id_label')}</label>
          <div class="search">
            <span class="s-ic">${icons.search}</span>
            <input id="q" class="input" type="search" autocomplete="off" spellcheck="false"
              placeholder="${escapeHtml(t('id_ph'))}" value="${escapeHtml(state.query)}">
          </div>
        </div>
        <div id="results" class="stack">${searchResults()}</div>
      </div>
    </main>
  `;
}

// Re-rendered on every keystroke, so it is exported separately from the screen.
export function searchResults() {
  const query = state.query.trim().toLowerCase();
  const matches = query ? BANKNOTES.filter((note) => matchesQuery(note, query)) : BANKNOTES;

  let heading = t('id_all');
  if (query) {
    heading = matches.length === 1 ? t('id_count1') : t('id_count', { n: matches.length });
  }

  const list = matches.length
    ? `<div class="group">${each(matches, noteRow)}</div>`
    : `<div class="note warn">${icons.warning}<span>${t('id_none', { q: escapeHtml(state.query.trim()) })}</span></div>`;

  return `
    <div class="section">
      <span class="eyebrow">${heading}</span>
      ${list}
    </div>
    <button class="btn secondary" data-act="unknown-note">${t('id_noref')}</button>
  `;
}

// Matches the value ("20000", "20 000", "20,000"), colours in English or the
// current language, and any of the design elements.
function matchesQuery(note, query) {
  const searchable = [
    String(note.value),
    note.valueInWords,
    note.place,
    note.landmarks,
    note.animal ?? '',
    note.otherElements,
    ...note.colours,
    ...note.colours.map((colour) => t(`c_${colour}`)),
    noteName(note),
  ]
    .join(' ')
    .toLowerCase();

  const withoutSeparators = (text) => text.replace(/[\s.,]/g, '');
  return searchable.includes(query) || withoutSeparators(searchable).includes(withoutSeparators(query));
}

function noteRow(note) {
  const colours = note.colours.map((colour) => t(`c_${colour}`)).join(', ');
  return `
    <button class="row" data-act="pick-note" data-id="${note.id}">
      <img class="p-ic" src="${noteImage(note)}" alt="">
      <span class="rec-main">
        <span class="rec-name">${escapeHtml(noteName(note))}</span>
        <span class="rec-meta">${escapeHtml(note.animal || note.place)} · ${colours}</span>
      </span>
      ${icons.chevron}
    </button>
  `;
}
