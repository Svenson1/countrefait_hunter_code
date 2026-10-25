import { formatDate, formatPercent } from '../../format.js';
import { t } from '../../i18n/index.js';
import { icons } from '../../icons.js';
import { checklistCounts, noteName, noteOf } from '../../inspection.js';
import { state } from '../../state.js';
import { aiSummary, answerChip, header, statusChip } from '../components.js';
import { each, escapeHtml } from '../dom.js';

const REVIEW_DETAILS = [
  { key: 'serial', label: 'rv_serial', mono: true },
  { key: 'source', label: 'rv_source', mono: false },
  { key: 'count', label: 'rv_count', mono: false },
];

export function summary() {
  const record = state.record;
  const note = noteOf(record);
  const openedFromHistory = state.recordOpenedFrom === 'history';
  const subtitle = `<span class="mono">${escapeHtml(record.id)}</span>${record.example ? ` · ${t('example')}` : ''}`;

  return `
    ${header({ title: t('sm_t'), subtitle, back: openedFromHistory ? 'back-to-history' : null })}
    <main class="scroll" id="scroll">
      <div class="pad gut stack">
        ${record.status === 'review' ? waitingForBank(record) : ''}

        <div class="group">
          <div class="row kv"><span>${t('sm_status')}</span>${statusChip(record.status)}</div>
          <div class="row kv"><span>${t('sm_id')}</span><span class="mono">${escapeHtml(record.id)}</span></div>
          <div class="row kv"><span>${t('sm_date')}</span><span>${formatDate(record.created)}</span></div>
          <div class="row kv"><span>${t('rv_part')}</span><span class="r-txt">${escapeHtml(noteName(note))}</span></div>
        </div>

        ${photoStrip(record)}
        ${record.ai ? aiFinding(record.ai) : ''}
        ${checklistCounts(record).total ? checklistAnswers(record) : ''}
        ${record.review ? observations(record.review) : ''}

        ${record.status === 'review' ? '' : `<button class="btn secondary" data-act="escalate">${t('sm_escalate')}</button>`}
      </div>
    </main>
    <footer class="foot gut">
      <div class="foot-row">
        ${state.downloads ? `<button class="btn secondary sm" style="width: 100%" data-act="export">${icons.download}${t('sm_export')}</button>` : ''}
        <button class="btn secondary sm" style="width: 100%${state.downloads ? '' : '; grid-column: 1 / -1'}" data-act="copy-summary">${icons.copy}${t('sm_copy')}</button>
      </div>
      ${openedFromHistory ? '' : `<button class="btn primary" data-act="close-record">${t('sm_close')}</button>`}
    </footer>
  `;
}

function waitingForBank(record) {
  return `
    <section class="note info">
      ${icons.clock}
      <div>
        <strong>${t('rv_sent')}</strong>
        <span>${t('rv_sent_d')}</span>
        <span class="hint">${t('rv_demo')}</span>
        <span class="hint">${t('rv_contact', { id: escapeHtml(record.id) })}</span>
      </div>
    </section>
  `;
}

function photoStrip(record) {
  const photos = record.photoList || [];
  if (!photos.length) return '';

  const figures = each(photos, (photo) => {
    const name = t(`v_${photo.view}`);
    const quality = photo.quality === 'ok' ? '' : ` · ${t(`q_${photo.quality}`)}`;
    return `<figure><img src="${photo.thumb}" alt="${escapeHtml(name)}"><figcaption>${name}${quality}</figcaption></figure>`;
  });

  return `
    <section class="section">
      <h3 class="h3">${t('rv_photos')}</h3>
      <div class="strip">${figures}</div>
    </section>
  `;
}

function aiFinding(ai) {
  return `
    <section class="section">
      <span class="src">${icons.scanSmall}${t('sm_ai_src')}</span>
      <div class="group">
        <div class="row kv"><span>${t('rv_ai')}</span>${aiSummary(ai)}</div>
        <div class="row kv"><span>${t('s_thr')}</span><span class="mono">${formatPercent(ai.threshold)}</span></div>
        <div class="row kv"><span>${t('res_model')}</span><span class="mono">${escapeHtml(ai.model)}</span></div>
      </div>
    </section>
  `;
}

function checklistAnswers(record) {
  const rows = each(Object.entries(record.checklist), ([itemId, answer]) => {
    return `<div class="row"><span>${t(itemId)}</span>${answerChip(answer)}</div>`;
  });
  return `
    <section class="section">
      <span class="src you">${icons.user}${t('sm_you')} · ${t('rv_check')}</span>
      <div class="group res-list">${rows}</div>
    </section>
  `;
}

function observations(review) {
  const details = REVIEW_DETAILS.filter((field) => review[field.key]);
  const isEmpty = !review.obs && details.length === 0;

  return `
    <section class="section">
      <span class="src you">${icons.user}${t('sm_you')} · ${t('sm_obs')}</span>
      <div class="group">
        ${review.obs ? `<p class="quote">${escapeHtml(review.obs)}</p>` : ''}
        ${each(details, (field) => `
          <div class="row kv">
            <span>${t(field.label)}</span>
            <span class="${field.mono ? 'mono' : ''}">${escapeHtml(review[field.key])}</span>
          </div>
        `)}
        ${isEmpty ? `<p class="quote hint">${t('sm_none')}</p>` : ''}
      </div>
    </section>
  `;
}
