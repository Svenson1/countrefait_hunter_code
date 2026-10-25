import { t } from '../../i18n/index.js';
import { icons } from '../../icons.js';
import { noteCode, noteOf, photosOf } from '../../inspection.js';
import { state } from '../../state.js';
import { aiSummary, checklistSummary, header } from '../components.js';
import { each, escapeHtml } from '../dom.js';

const DETAIL_FIELDS = [
  { key: 'serial', type: 'text', extra: 'autocapitalize="characters"', className: 'mono-in' },
  { key: 'source', type: 'text', extra: '', className: '' },
  { key: 'count', type: 'number', extra: 'inputmode="numeric" min="1"', className: '' },
];

// Bank verification (layer 3). Also opened from a saved record in History.
export function review() {
  const inspection = state.inspection;
  const note = noteOf(inspection);
  const photos = photosOf(inspection);
  const draft = state.reviewDraft;
  const fromRecord = Boolean(inspection.fromRecord);

  const thumbnails = photos.length
    ? each(photos.slice(0, 6), (photo) => `<img src="${photo.thumb}" alt="${escapeHtml(t(`v_${photo.view}`))}">`)
    : `<span class="hint">${t('rv_none')}</span>`;

  const detailFields = each(DETAIL_FIELDS, (field) => `
    <div class="field">
      <label for="rv_${field.key}">${t(`rv_${field.key}`)}</label>
      <input id="rv_${field.key}" class="input ${field.className}" type="${field.type}" ${field.extra}
        data-review-field="${field.key}" placeholder="${escapeHtml(t(`rv_${field.key}_ph`))}"
        value="${escapeHtml(draft[field.key])}">
    </div>
  `);

  return `
    ${header({
      title: t('rv_t'),
      subtitle: `<span class="mono">${escapeHtml(noteCode(note))}</span>`,
      back: fromRecord ? 'to-summary' : 'to-result',
      close: !fromRecord,
    })}
    <main class="scroll" id="scroll">
      <div class="pad gut stack">
        <p class="lead">${t('rv_lead')}</p>

        <section class="section">
          <h3 class="h3">${t('rv_inc')}</h3>
          <div class="group">
            <div class="row kv"><span>${t('rv_part')}</span><span class="mono">${escapeHtml(noteCode(note))}</span></div>
            <div class="row kv"><span>${t('rv_photos')}</span><span class="thumbs">${thumbnails}</span></div>
            <div class="row kv"><span>${t('rv_check')}</span>${checklistSummary(inspection)}</div>
            <div class="row kv">
              <span>${t('rv_ai')}</span>
              ${inspection.ai ? aiSummary(inspection.ai) : `<span class="hint">${t('rv_none')}</span>`}
            </div>
          </div>
        </section>

        <section class="field">
          <label for="rv_obs">${t('rv_obs')}</label>
          <textarea id="rv_obs" class="input" data-review-field="obs"
            placeholder="${escapeHtml(t('rv_obs_ph'))}">${escapeHtml(draft.obs)}</textarea>
        </section>

        <section class="section">
          <h3 class="h3">${t('rv_ctx')}</h3>
          ${detailFields}
        </section>
      </div>
    </main>
    <footer class="foot gut">
      <button class="btn primary" data-act="send-review">${icons.send}${t('rv_send')}</button>
    </footer>
  `;
}
