import { describeFeature } from '../../format.js';
import { t } from '../../i18n/index.js';
import { icons, verdictIcon } from '../../icons.js';
import { noteCode } from '../../inspection.js';
import { state } from '../../state.js';
import { header, methodChip } from '../components.js';
import { each, escapeHtml } from '../dom.js';

const ANSWERS = [
  { value: 'ok', label: 'ck_ok', icon: icons.check },
  { value: 'no', label: 'ck_no', icon: icons.cross },
  { value: 'q', label: 'ck_q', icon: icons.question },
];

export function checklist() {
  const { note, checklist: answers } = state.inspection;
  const items = note.checklist;
  const answered = items.filter((item) => answers[item.id]).length;
  const notMatching = items.filter((item) => answers[item.id] === 'no').length;
  const notVerified = items.filter((item) => answers[item.id] === 'q').length;
  const allAnswered = answered === items.length;

  let summary;
  if (!allAnswered) {
    summary = `<div class="note info">${icons.info}<span>${t('ck_todo')}</span></div>`;
  } else if (notMatching === 0 && notVerified === 0) {
    summary = `<div class="note ok">${verdictIcon.genuine(20)}<span>${t('ck_all_ok')}</span></div>`;
  } else {
    summary = `<div class="note warn">${icons.warning}<span>${t('ck_incon', { x: notMatching, y: notVerified })}</span></div>`;
  }

  return `
    ${header({
      title: t('ck_title'),
      subtitle: `<span class="mono">${escapeHtml(noteCode(note))}</span> · ${t('ck_answered', { a: answered, n: items.length })}`,
      back: 'to-note-info',
      close: true,
      step: 1,
    })}
    <main class="scroll" id="scroll">
      <div class="pad gut stack">
        <p class="lead">${t('ck_lead')}</p>
        <ul class="group ck-list">${each(items, (item) => checklistItem(item, answers[item.id]))}</ul>
        ${summary}
      </div>
    </main>
    <footer class="foot gut">
      <button class="btn primary" data-act="to-photos">${t('ck_continue')}</button>
      ${allAnswered ? `<button class="btn ghost" data-act="finish-without-ai">${t('ck_finish')}</button>` : ''}
    </footer>
  `;
}

function checklistItem(item, answer) {
  const isCode = item.size || item.words;
  const buttons = each(ANSWERS, (option) => `
    <button role="radio" aria-checked="${answer === option.value}" class="v-${option.value}"
      data-act="answer" data-item="${item.id}" data-value="${option.value}">${option.icon}${t(option.label)}</button>
  `);

  return `
    <li class="ck-item">
      <div class="ck-h">
        <div class="ck-top">
          <span class="ck-name">${t(item.id)}</span>
          ${methodChip(item.method)}
        </div>
        <span class="ck-ref">${t('ck_ref')}: <span class="${isCode ? 'mono' : ''}">${escapeHtml(describeFeature(item))}</span></span>
      </div>
      <div class="seg" role="radiogroup" aria-label="${escapeHtml(t(item.id))}">${buttons}</div>
    </li>
  `;
}
