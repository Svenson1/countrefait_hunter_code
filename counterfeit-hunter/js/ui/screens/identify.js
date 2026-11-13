import { t } from '../../i18n/index.js';
import { icons } from '../../icons.js';
import { noteCode } from '../../inspection.js';
import { searchBanknotes } from '../../note-search.js';
import { state } from '../../state.js';
import { header, noteImage } from '../components.js';
import { $, each, escapeHtml } from '../dom.js';

// Step 2. Choosing a note starts the analysis. The search box filters the notes as the user types.
export function identify() {
  const query = state.inspection.noteSearch;

  return `
    ${header({ title: t('id_title'), subtitle: t('step_n', { n: 2 }), back: 'to-photos', close: true, step: 1 })}
    <main class="scroll" id="scroll">
      <div class="pad gut stack">
        <p class="lead">${t('id_lead')}</p>
        <div class="search" role="search">
          <span class="s-ic">${icons.search}</span>
          <input id="note-search" class="input" type="search" value="${escapeHtml(query)}"
            placeholder="${escapeHtml(t('id_search_ph'))}" aria-label="${escapeHtml(t('id_search'))}"
            aria-controls="note-results" autocomplete="off" spellcheck="false" enterkeyhint="search">
        </div>
        <section class="section">
          <span class="eyebrow">${t('id_all')}</span>
          <div id="note-results">${noteResults(query)}</div>
          <p class="visually-hidden" id="note-count" aria-live="polite"></p>
        </section>
        <button class="btn secondary" data-act="unknown-note">${t('id_noref')}</button>
      </div>
    </main>
  `;
}

// Called while the user types. Only the list is redrawn, so the search box keeps focus.
export function updateNoteSearch(query) {
  state.inspection.noteSearch = query;
  $('#note-results').innerHTML = noteResults(query);
  $('#note-count').textContent = t('id_found', { n: searchBanknotes(query).length });
}

function noteResults(query) {
  const notes = searchBanknotes(query);
  if (notes.length === 0) {
    return `<p class="no-match">${t('id_none', { q: escapeHtml(query.trim()), other: t('id_noref') })}</p>`;
  }
  return `<div class="note-grid">${each(notes, noteTile)}</div>`;
}

function noteTile(note) {
  const colours = note.colours.map((colour) => t(`c_${colour}`)).join(', ');
  return `
    <button class="note-tile" data-act="pick-note" data-id="${note.id}">
      <img src="${noteImage(note)}" alt="">
      <span class="note-value">${escapeHtml(noteCode(note))}</span>
      <span class="note-sub">${colours}</span>
    </button>
  `;
}
