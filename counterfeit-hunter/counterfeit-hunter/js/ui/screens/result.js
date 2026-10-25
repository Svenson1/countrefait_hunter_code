import { formatNumber, formatPercent } from '../../format.js';
import { t } from '../../i18n/index.js';
import { icons, verdictIcon } from '../../icons.js';
import { checklistCounts, noteCode, noteOf } from '../../inspection.js';
import { state } from '../../state.js';
import { checklistSummary, header } from '../components.js';
import { each, escapeHtml } from '../dom.js';

// Short class names used by the CSS for each verdict.
const VERDICT_CLASS = { genuine: 'g', counterfeit: 'c', inconclusive: 'q' };

export function result() {
  const inspection = state.inspection;
  const ai = inspection.ai;
  const note = noteOf(inspection);
  const verdict = VERDICT_CLASS[ai.label];
  const percent = Math.round(ai.confidence * 100);
  const belowThreshold = percent < ai.threshold;
  const showCategory = state.settings.confidenceDisplay === 'category';

  let category = 'med';
  if (percent >= 85) category = 'high';
  else if (belowThreshold) category = 'low';

  let thresholdHint = '';
  if (ai.label !== 'counterfeit') {
    thresholdHint = `<p class="hint">${belowThreshold ? t('res_below') : t('res_above')}</p>`;
  }

  return `
    ${header({
      title: t('res_t'),
      subtitle: `<span class="mono">${escapeHtml(noteCode(note))}</span>`,
      close: true,
      step: 3,
    })}
    <main class="scroll" id="scroll">
      <div class="pad gut stack">
        <section class="verdict v-${verdict}">
          <span class="src">${icons.scanSmall}${t('sm_ai_src')}</span>
          <div class="v-top">
            ${verdictIcon[ai.label](42)}
            <h2 class="vl">${t(`res_${ai.label}`)}</h2>
          </div>
          <p>${t(`res_${ai.label}_d`)}</p>
        </section>

        ${ai.label === 'counterfeit' ? `<div class="note bad">${verdictIcon.counterfeit(20)}<span>${t('res_cf')}</span></div>` : ''}

        <section class="group conf">
          <div class="conf-h">
            <span>${t('res_conf')}</span>
            <strong class="${verdict}">${showCategory ? t(`res_cat_${category}`) : formatPercent(percent)}</strong>
          </div>
          ${showCategory ? categoryMeter(category) : confidenceGauge(percent, ai.threshold, verdict)}
          ${thresholdHint}
        </section>

        ${each(ai.notes, (key) => `<div class="note warn">${icons.warning}<span>${t(key === 'unsupported' ? 'res_unsupported' : 'res_lowq')}</span></div>`)}
        <div class="note info">${icons.info}<span>${t('res_disclaimer')}</span></div>

        ${checklistCounts(inspection).total ? userChecklistStrip(inspection) : ''}
        ${technicalDetails(ai)}

        <button class="link center" data-act="report">${icons.flag}${t('res_report')}</button>
      </div>
    </main>
    <footer class="foot gut">${nextActions(ai.label)}</footer>
  `;
}

function confidenceGauge(percent, threshold, verdict) {
  const label = `${t('res_conf')} ${formatPercent(percent)}, ${t('res_thr', { t: threshold })}`;
  return `
    <div class="gauge" role="img" aria-label="${escapeHtml(label)}">
      <b class="f-${verdict}" style="width: ${percent}%"></b>
      <i class="tick" style="left: ${threshold}%"></i>
    </div>
    <div class="gauge-lab">
      <span class="l0">0</span>
      <span style="left: ${threshold}%">${t('res_thr', { t: threshold })}</span>
      <span class="l100">100</span>
    </div>
  `;
}

function categoryMeter(active) {
  const steps = each(['low', 'med', 'high'], (category) => {
    return `<span class="${category === active ? 'on' : ''}">${t(`res_cat_${category}`)}</span>`;
  });
  return `<div class="cat-meter">${steps}</div>`;
}

function userChecklistStrip(inspection) {
  return `
    <section class="group checklist-strip">
      <span class="src you">${icons.user}${t('sm_you')} · ${t('rv_check')}</span>
      ${checklistSummary(inspection)}
    </section>
  `;
}

function technicalDetails(ai) {
  const rows = each(ai.perPhoto, (photo) => `
    <tr>
      <td>${t(`v_${photo.view}`)}</td>
      <td>${t(`q_${photo.quality}`)}</td>
      <td class="num">${formatNumber(photo.pGenuine, 2)}</td>
    </tr>
  `);

  return `
    <details class="group tech">
      <summary>${t('res_details')}</summary>
      <div class="tech-b">
        <p class="hint">${t('res_sim')}</p>
        <dl class="kv-mini">
          <dt>${t('res_model')}</dt><dd class="mono">${escapeHtml(ai.model)}</dd>
          <dt>${t('res_score')}</dt><dd class="mono">${formatNumber(ai.pGenuine, 2)}</dd>
          <dt>${t('s_thr')}</dt><dd class="mono">${formatPercent(ai.threshold)}</dd>
          <dt>${t('res_time')}</dt><dd class="mono">${formatNumber((ai.ms || 0) / 1000, 1)} s</dd>
          <dt>${t('res_upload')}</dt><dd class="mono">${ai.uploadPx} px</dd>
        </dl>
        <p class="hint">${t('res_score_d')}</p>
        <table>
          <thead>
            <tr>
              <th>${t('res_per')}</th>
              <th>${t('res_quality')}</th>
              <th class="num">${t('res_score')}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="note warn">${icons.warning}<span>${t('res_bias')}</span></div>
      </div>
    </details>
  `;
}

function nextActions(label) {
  if (label === 'genuine') {
    return `
      <button class="btn primary" data-act="finish">${t('res_finish')}</button>
      <button class="btn ghost" data-act="to-review">${t('res_review_any')}</button>
    `;
  }
  return `
    <button class="btn primary" data-act="to-review">${t('res_review')}</button>
    <div class="foot-row">
      <button class="btn secondary" data-act="to-photos">${t('res_retake')}</button>
      <button class="btn secondary" data-act="finish">${t('res_finish')}</button>
    </div>
  `;
}
