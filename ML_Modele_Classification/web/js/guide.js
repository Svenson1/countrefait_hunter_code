import { t } from './i18n/index.js';
import { icons } from './icons.js';
import { each } from './ui/dom.js';

// Step-by-step guide shown next to the phone on wide screens. It follows the
// user through the check and marks the step they are on.

const STEP_FOR_SCREEN = {
  photos: 0,
  identify: 1,
  analysing: 2,
  result: 2,
  error: 2,
  checklist: 3,
  final: 4,
  review: 4,
};

const STEPS = [
  { title: 'gd_s1_t', text: 'gd_s1_d' },
  { title: 'gd_s2_t', text: 'gd_s2_d' },
  { title: 'gd_s3_t', text: 'gd_s3_d' },
  { title: 'gd_s4_t', text: 'gd_s4_d' },
  { title: 'gd_s5_t', text: 'gd_s5_d' },
];

export function renderGuide(screen) {
  const current = STEP_FOR_SCREEN[screen] ?? -1;

  const steps = each(STEPS, (step, i) => {
    let className = '';
    if (current >= 0 && i < current) className = 'done';
    if (i === current) className = 'on';

    return `
      <li class="${className}"${i === current ? ' aria-current="step"' : ''}>
        <b>${i < current ? icons.check : i + 1}</b>
        <div>
          <h3>${t(step.title)}</h3>
          <p>${t(step.text)}</p>
          ${i === current ? `<span class="chip info">${t('gd_now')}</span>` : ''}
        </div>
      </li>
    `;
  });

  const panel = document.getElementById('guide');
  panel.setAttribute('aria-label', t('gd_title'));
  panel.innerHTML = `
    <p class="eyebrow">${t('home_eyebrow')}</p>
    <h2>${t('gd_title')}</h2>
    <ol class="guide-steps">${steps}</ol>
    <section class="guide-tips">
      <h3>${t('gd_tips_t')}</h3>
      <ul>
        <li>${t('gd_tip1')}</li>
        <li>${t('gd_tip2')}</li>
        <li>${t('gd_tip3')}</li>
      </ul>
    </section>
  `;
}
