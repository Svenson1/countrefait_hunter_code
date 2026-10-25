import { formatDate, formatPercent } from './format.js';
import { currentLanguage, t } from './i18n/index.js';
import { noteName, noteOf } from './inspection.js';
import { escapeHtml } from './ui/dom.js';

// Plain-text summary for "Copy summary".
export function summaryText(record) {
  const note = noteOf(record);
  const lines = [
    `Counterfeit Hunter · ${t('sm_t')}`,
    `${t('sm_id')}: ${record.id}`,
    `${t('sm_date')}: ${formatDate(record.created)}`,
    `${t('rv_part')}: ${noteName(note)}`,
    `${t('sm_status')}: ${t(`st_${record.status}`)}`,
  ];

  if (record.ai) {
    const percent = formatPercent(Math.round(record.ai.confidence * 100));
    const threshold = t('res_thr', { t: record.ai.threshold });
    lines.push(`${t('sm_ai_src')}: ${t(`res_${record.ai.label}`)}, ${t('res_conf')} ${percent} (${threshold}, ${record.ai.model})`);
  }

  const answers = Object.entries(record.checklist || {});
  if (answers.length) {
    const list = answers.map(([itemId, answer]) => `${t(itemId)}: ${t(`ck_${answer}`)}`).join('; ');
    lines.push(`${t('sm_you')} · ${t('rv_check')}: ${list}`);
  }

  const review = record.review;
  if (review) {
    if (review.serial) lines.push(`${t('rv_serial')}: ${review.serial}`);
    if (review.source) lines.push(`${t('rv_source')}: ${review.source}`);
    if (review.count) lines.push(`${t('rv_count')}: ${review.count}`);
    if (review.obs) lines.push(`${t('sm_obs')}: ${review.obs}`);
  }

  lines.push(`${t('rv_photos')}: ${(record.photoList || []).length}`);
  if (record.ai) lines.push(t('res_disclaimer'));
  return lines.join('\n');
}

// Stand-alone HTML report for "Export report". The photos are embedded as thumbnails.
export function reportHtml(record) {
  const note = noteOf(record);
  const row = (label, value) => `<tr><th>${escapeHtml(label)}</th><td>${value}</td></tr>`;
  const rows = [
    row(t('sm_id'), `<code>${escapeHtml(record.id)}</code>`),
    row(t('sm_date'), escapeHtml(formatDate(record.created))),
    row(t('rv_part'), escapeHtml(noteName(note))),
    row(t('sm_status'), escapeHtml(t(`st_${record.status}`))),
  ];

  if (record.ai) {
    const ai = record.ai;
    const parts = [
      escapeHtml(t(`res_${ai.label}`)),
      `${escapeHtml(t('res_conf'))} ${formatPercent(Math.round(ai.confidence * 100))}`,
      escapeHtml(t('res_thr', { t: ai.threshold })),
      `<code>${escapeHtml(ai.model)}</code>`,
    ];
    rows.push(row(t('sm_ai_src'), parts.join(' · ')));
  }

  for (const [itemId, answer] of Object.entries(record.checklist || {})) {
    rows.push(row(`${t('sm_you')} · ${t(itemId)}`, escapeHtml(t(`ck_${answer}`))));
  }

  const review = record.review;
  if (review) {
    rows.push(row(t('sm_obs'), escapeHtml(review.obs || t('sm_none'))));
    if (review.serial) rows.push(row(t('rv_serial'), `<code>${escapeHtml(review.serial)}</code>`));
    if (review.source) rows.push(row(t('rv_source'), escapeHtml(review.source)));
    if (review.count) rows.push(row(t('rv_count'), escapeHtml(review.count)));
  }

  const photos = (record.photoList || [])
    .map((photo) => `<figure><img src="${photo.thumb}" alt=""><figcaption>${escapeHtml(t(`v_${photo.view}`))}</figcaption></figure>`)
    .join('');

  const disclaimer = record.ai ? `<p class="note">${escapeHtml(t('res_disclaimer'))} ${escapeHtml(t('res_sim'))}</p>` : '';

  return `<!doctype html>
<html lang="${currentLanguage()}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(record.id)}</title>
<style>
  body { max-width: 720px; margin: 32px auto; padding: 0 16px; font-family: system-ui, sans-serif; color: #12202d; }
  h1 { font-size: 22px; }
  table { width: 100%; margin: 12px 0; border-collapse: collapse; }
  th, td { padding: 8px; border-top: 1px solid #d3dbe4; text-align: left; vertical-align: top; }
  th { width: 38%; font-weight: 600; color: #56636f; }
  .photos { display: flex; flex-wrap: wrap; gap: 8px; }
  .photos figure { margin: 0; font-size: 12px; color: #56636f; }
  .photos img { display: block; width: 180px; height: 135px; border-radius: 8px; object-fit: cover; }
  .note { padding: 10px 12px; border-radius: 8px; background: #e0eaf4; font-size: 14px; }
</style>
</head>
<body>
<h1>Counterfeit Hunter · ${escapeHtml(t('sm_t'))}</h1>
<table>${rows.join('')}</table>
<div class="photos">${photos}</div>
${disclaimer}
</body>
</html>`;
}
