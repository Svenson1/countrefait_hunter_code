import { VIEWS } from '../../config.js';
import { t } from '../../i18n/index.js';
import { icons } from '../../icons.js';
import { noteCode, noteOf } from '../../inspection.js';
import { state } from '../../state.js';
import { header, qualityChip } from '../components.js';
import { each, escapeHtml } from '../dom.js';

export function photos() {
  const inspection = state.inspection;
  const note = noteOf(inspection);
  const covered = VIEWS.filter((view) => inspection.photos[view]).length;
  const total = covered + inspection.extras.length;
  const missing = VIEWS.length - covered;
  const canSubmit = total > 0 && !state.busy;

  const progress = each(VIEWS, (view) => {
    const photo = inspection.photos[view];
    const className = !photo ? '' : photo.quality === 'ok' ? 'on' : 'wa';
    return `<i class="${className}"></i>`;
  });

  const extras = each(inspection.extras, (photo, index) => `
    <div class="ex">
      <img src="${photo.thumb}" alt="${escapeHtml(t('v_extra'))}">
      <button data-act="remove-photo" data-index="${index}" aria-label="${escapeHtml(t('ph_remove'))}">${icons.cross}</button>
    </div>
  `);

  return `
    ${header({
      title: t('ph_title'),
      subtitle: `<span class="mono">${escapeHtml(noteCode(note))}</span>`,
      back: note.unlisted ? 'to-identify' : 'to-checklist',
      help: true,
      close: true,
      step: 2,
    })}
    <main class="scroll" id="scroll">
      <div class="pad gut stack">
        <p class="lead">${t('ph_lead')}</p>

        <div class="prog">
          <div class="views" aria-hidden="true">${progress}</div>
          <span class="eyebrow">${t('ph_count', { a: covered, n: VIEWS.length })}</span>
        </div>

        <div class="group">${each(VIEWS, (view) => viewRow(view, inspection.photos[view]))}</div>

        <section class="section">
          <h3 class="h3">${t('ph_extra_t')}</h3>
          <div class="extras">
            ${extras}
            <button class="ex add" data-act="capture" data-view="extra" aria-label="${escapeHtml(t('ph_add'))}">${icons.plus}</button>
          </div>
        </section>

        ${covered < VIEWS.length && !note.unlisted ? samplePhotosCard() : ''}
        ${total && missing ? `<div class="note warn">${icons.warning}<span>${t('ph_missing', { m: missing })}</span></div>` : ''}
      </div>
    </main>
    <footer class="foot gut">
      <button class="btn primary" data-act="submit"${canSubmit ? '' : ' disabled'}>${t('ph_submit')}</button>
      <p class="fine">
        ${total ? '' : `${t('ph_none')} · `}
        <button class="link inline" data-act="privacy">${t('ph_privacy')}</button>
      </p>
    </footer>
  `;
}

function viewRow(view, photo) {
  const name = t(`v_${view}`);

  if (!photo) {
    return `
      <div class="row shot">
        <button class="th" data-act="capture" data-view="${view}" aria-label="${escapeHtml(`${t('ph_take')}: ${name}`)}">${icons.plus}</button>
        <div class="shot-main">
          <span class="shot-name">${name}</span>
          <span class="hint">${t(`tip_${view}`)}</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="row shot">
      <button class="th has" data-act="capture" data-view="${view}" aria-label="${escapeHtml(`${t('ph_retake')}: ${name}`)}">
        <img src="${photo.thumb}" alt="">
      </button>
      <div class="shot-main">
        <span class="shot-name">${name}</span>
        ${qualityChip(photo)}
      </div>
      <div class="shot-a">
        <button class="mini" data-act="capture" data-view="${view}">${t('ph_retake')}</button>
        <button class="mini icon" data-act="remove-photo" data-view="${view}" aria-label="${escapeHtml(`${t('ph_remove')}: ${name}`)}">${icons.trash}</button>
      </div>
    </div>
  `;
}

function samplePhotosCard() {
  return `
    <div class="demo">
      <p>${t('ph_sample_d')}</p>
      <button class="btn secondary sm" data-act="sample-photos">${icons.image}${t('ph_sample')}</button>
    </div>
  `;
}
