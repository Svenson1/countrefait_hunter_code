import { referenceImagePath } from '../data/banknotes.js';
import { formatDate, formatPercent } from '../format.js';
import { t } from '../i18n/index.js';
import { icons, methodIcons, UNKNOWN_NOTE_IMAGE, verdictIcon } from '../icons.js';
import { checklistCounts, hasReferenceData, noteName, noteOf } from '../inspection.js';
import { each, escapeHtml } from './dom.js';

export function noteImage(note) {
  return note && !note.unlisted ? referenceImagePath(note.value) : UNKNOWN_NOTE_IMAGE;
}

/**
 * Screen header. `back` is the action for the back arrow; `step` (0 to 3)
 * shows the progress bar for the check.
 */
export function header({ title, subtitle = '', back = null, help = false, close = false, step = null }) {
  return `
    <header class="bar">
      <div class="bar-in gut">
        ${back ? `<button class="icon-btn" data-act="${back}" aria-label="${t('back')}">${icons.back}</button>` : ''}
        <div class="bar-t">
          <h1>${escapeHtml(title)}</h1>
          ${subtitle ? `<p class="sub">${subtitle}</p>` : ''}
        </div>
        ${help ? `<button class="icon-btn" data-act="tips" aria-label="${t('tips_btn')}">${icons.help}</button>` : ''}
        ${close ? `<button class="icon-btn" data-act="leave" aria-label="${t('close')}">${icons.close}</button>` : ''}
      </div>
      ${step === null ? '' : stepper(step)}
    </header>
  `;
}

const STEPS = ['step_identify', 'step_check', 'step_photos', 'step_result'];

function stepper(current) {
  const steps = each(STEPS, (key, i) => {
    const className = i < current ? 'done' : i === current ? 'on' : '';
    const ariaCurrent = i === current ? ' aria-current="step"' : '';
    return `<li class="s ${className}"${ariaCurrent}><i></i><span>${i + 1} ${t(key)}</span></li>`;
  });
  return `<ol class="steps gut" aria-label="${t('step_n', { n: current + 1 })}">${steps}</ol>`;
}

const TABS = [
  { screen: 'home', label: 'nav_inspect', icon: icons.scan },
  { screen: 'history', label: 'nav_history', icon: icons.clock },
  { screen: 'settings', label: 'nav_settings', icon: icons.gear },
];

export function tabBar(active) {
  const tabs = each(TABS, (tab) => {
    const current = tab.screen === active ? ' aria-current="page"' : '';
    return `<button class="tab" data-act="tab" data-to="${tab.screen}"${current}>${tab.icon}<span>${t(tab.label)}</span></button>`;
  });
  return `<nav class="tabs gut" aria-label="Main">${tabs}</nav>`;
}

export function referenceChip(note) {
  if (hasReferenceData(note)) {
    return `<span class="chip ok">${icons.check}${t('ref_full')}</span>`;
  }
  return `<span class="chip">${icons.cross}${t('ref_none')}</span>`;
}

const STATUS_STYLE = {
  manual: { className: 'info', icon: icons.check },
  preliminary: { className: '', icon: icons.info },
  inconclusive: { className: 'warn', icon: icons.question },
  review: { className: 'info', icon: icons.clock },
};

export function statusChip(status) {
  const style = STATUS_STYLE[status] ?? { className: '', icon: '' };
  return `<span class="chip ${style.className}">${style.icon}${t(`st_${status}`)}</span>`;
}

export function aiSummary(ai) {
  const percent = formatPercent(Math.round(ai.confidence * 100));
  return `<span class="ai-mini v-${ai.label}">${verdictIcon[ai.label](15)}${t(`res_${ai.label}`)} · ${percent}</span>`;
}

export function qualityChip(photo) {
  if (photo.quality === 'ok') {
    return `<span class="chip ok">${icons.check}${t('q_ok')}</span>`;
  }
  return `<span class="chip warn">${icons.warning}${t(`q_${photo.quality}`)}</span>`;
}

export function methodChip(method) {
  return `<span class="chip how">${methodIcons[method]}${t(`how_${method}`)}</span>`;
}

export function answerChip(answer) {
  if (answer === 'ok') return `<span class="chip ok">${icons.check}${t('ck_ok')}</span>`;
  if (answer === 'no') return `<span class="chip bad">${icons.cross}${t('ck_no')}</span>`;
  return `<span class="chip warn">${icons.question}${t('ck_q')}</span>`;
}

// Counts of checklist answers as three small chips.
export function checklistSummary(item) {
  const counts = checklistCounts(item);
  if (!counts.total) {
    return `<span class="hint">${t('rv_none')}</span>`;
  }
  return `
    <span class="chips end">
      ${counts.ok ? `<span class="chip ok">${icons.check}${counts.ok}</span>` : ''}
      ${counts.no ? `<span class="chip bad">${icons.cross}${counts.no}</span>` : ''}
      ${counts.unsure ? `<span class="chip warn">${icons.question}${counts.unsure}</span>` : ''}
    </span>
  `;
}

export function recordRow(record) {
  const note = noteOf(record);
  const thumb = record.photoList?.[0]?.thumb || noteImage(note);
  return `
    <button class="row rec" data-act="open-record" data-id="${escapeHtml(record.id)}">
      <img class="rec-th" src="${thumb}" alt="">
      <span class="rec-main">
        <span class="rec-name">${escapeHtml(noteName(note))}</span>
        <span class="rec-meta"><span class="mono">${escapeHtml(record.id)}</span> · ${formatDate(record.created, { short: true })}</span>
        ${record.ai ? aiSummary(record.ai) : ''}
      </span>
      <span class="rec-side">
        ${statusChip(record.status)}
        ${record.example ? `<span class="chip">${t('example')}</span>` : ''}
      </span>
    </button>
  `;
}
