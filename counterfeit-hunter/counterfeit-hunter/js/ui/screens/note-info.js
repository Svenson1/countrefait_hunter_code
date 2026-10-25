import { VIEWS } from '../../config.js';
import { formatLength } from '../../format.js';
import { t } from '../../i18n/index.js';
import { methodIcons } from '../../icons.js';
import { noteCode, noteName } from '../../inspection.js';
import { state } from '../../state.js';
import { header, noteImage, referenceChip } from '../components.js';
import { each, escapeHtml } from '../dom.js';

// Reference information for the chosen note, before the checklist.
export function noteInfo() {
  const note = state.inspection.note;
  const colours = note.colours.map((colour) => t(`c_${colour}`)).join(', ');

  // The first three checklist items (size, colours, wording) are already in the table.
  const securityFeatures = note.checklist.slice(3);

  return `
    ${header({
      title: t('pd_title'),
      subtitle: `<span class="mono">${escapeHtml(noteCode(note))}</span>`,
      back: 'to-identify',
      close: true,
      step: 0,
    })}
    <main class="scroll" id="scroll">
      <div class="pad gut stack">
        <figure class="ref-fig">
          <img src="${noteImage(note)}" alt="${escapeHtml(noteName(note))}">
          <figcaption class="hint">${t('pd_specimen')}</figcaption>
        </figure>

        <div class="part-title">
          <p class="eyebrow">${t('demo_set')}</p>
          <h2>${escapeHtml(noteName(note))}</h2>
          ${referenceChip(note)}
        </div>

        <section class="section">
          <h3 class="h3">${t('pd_ref')}</h3>
          <dl class="group spec">
            ${row(t('pd_size'), `${formatLength(note.width)} × ${formatLength(note.height)}`, true)}
            ${row(t('pd_colours'), colours)}
            ${row(t('pd_text'), note.valueInWords, true)}
            ${row(t('pd_place'), note.place)}
            ${row(t('pd_landmark'), note.landmarks)}
            ${row(t('pd_animal'), note.animal)}
            ${row(t('pd_objects'), note.otherElements)}
          </dl>
        </section>

        <section class="section">
          <h3 class="h3">${t('pd_features')}</h3>
          <div class="chips">
            ${each(securityFeatures, (item) => `<span class="chip">${methodIcons[item.method]}${t(item.id)}</span>`)}
          </div>
        </section>

        <section class="section">
          <h3 class="h3">${t('pd_views')}</h3>
          <div class="chips">${each(VIEWS, (view) => `<span class="chip">${t(`v_${view}`)}</span>`)}</div>
        </section>
      </div>
    </main>
    <footer class="foot gut">
      <button class="btn primary" data-act="to-checklist">${t('pd_start')}</button>
      <button class="btn ghost" data-act="to-photos">${t('pd_skip')}</button>
    </footer>
  `;
}

function row(label, value, mono = false) {
  if (!value) return '';
  return `<div class="row"><dt>${label}</dt><dd class="${mono ? 'mono' : ''}">${escapeHtml(value)}</dd></div>`;
}
