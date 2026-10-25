import { APP_VERSION, LANGUAGES, MODEL_VERSION } from '../../config.js';
import { formatDate, formatPercent } from '../../format.js';
import { t } from '../../i18n/index.js';
import { icons } from '../../icons.js';
import { state } from '../../state.js';
import { header, tabBar } from '../components.js';
import { each, escapeHtml } from '../dom.js';

// Administrator-only: force the demo result so every screen can be shown to the client.
const DEMO_OUTCOMES = {
  auto: 'do_auto',
  genuine: 'do_genuine',
  counterfeit: 'do_counterfeit',
  inconclusive: 'do_inconclusive',
  error: 'do_error',
  slow: 'do_slow',
};

export function settings() {
  const s = state.settings;
  const languageOptions = Object.entries(LANGUAGES).map(([code, lang]) => [code, lang.name]);

  const languageSection = section(t('sec_lang'), [
    selectRow('lang', t('s_lang'), languageOptions),
    selectRow('units', t('s_units'), [
      ['metric', t('u_metric')],
      ['imperial', t('u_imperial')],
    ]),
    `
      <div class="row set">
        <span class="set-l"><span>${t('s_date')}</span><span class="hint">${t('s_date_d')}</span></span>
        <span class="val">${formatDate(new Date().toISOString())}</span>
      </div>
    `,
  ]);

  const appearanceSection = section(t('sec_look'), [
    selectRow('theme', t('s_theme'), [
      ['system', t('th_system')],
      ['light', t('th_light')],
      ['dark', t('th_dark')],
    ]),
    toggleRow('largeText', t('s_large')),
    toggleRow('highContrast', t('s_hc'), t('s_hc_d')),
  ]);

  const photoSection = section(t('sec_photo'), [
    toggleRow('showTips', t('s_tips')),
    toggleRow('qualityWarnings', t('s_quality')),
  ]);

  const dataSection = section(t('sec_data'), [
    toggleRow('wifiOnly', t('s_wifi')),
    selectRow(
      'uploadQuality',
      t('s_upq'),
      [
        ['standard', t('upq_std')],
        ['saver', t('upq_low')],
      ],
      s.uploadQuality === 'saver' ? t('upq_low_d') : '',
    ),
  ]);

  const assessmentSection = section(t('sec_res'), [
    selectRow('confidenceDisplay', t('s_disp'), [
      ['percent', t('disp_pct')],
      ['category', t('disp_cat')],
    ]),
    state.adminUnlocked ? thresholdSlider() : thresholdLocked(),
  ]);

  const adminSection = section(t('sec_admin'), state.adminUnlocked ? adminControls() : [pinEntry()]);

  const privacySection = section(t('sec_priv'), [
    linkRow('privacy', t('s_priv')),
    linkRow('delete-history', t('s_del'), { danger: true }),
  ]);

  const helpSection = section(t('sec_help'), [
    linkRow('tour', t('s_tour')),
    linkRow('tips', t('s_tips_open')),
    linkRow('feedback', t('s_fb')),
    linkRow('licences', t('s_lic')),
    linkRow('reset-settings', t('s_reset'), { danger: true }),
  ]);

  return `
    ${header({ title: t('set_t') })}
    <main class="scroll" id="scroll">
      <div class="pad gut stack">
        ${languageSection}
        ${appearanceSection}
        ${photoSection}
        ${dataSection}
        ${assessmentSection}
        ${adminSection}
        ${privacySection}
        ${helpSection}
        <div class="about">
          <span>${t('ab_app')}: <span class="mono">${APP_VERSION}</span></span>
          <span>${t('ab_model')}: <span class="mono">${MODEL_VERSION}</span></span>
          ${s.lang === 'en' ? '' : `<span>${t('ab_trans')}</span>`}
        </div>
      </div>
    </main>
    ${tabBar('settings')}
  `;
}

function section(title, rows) {
  return `
    <section class="section">
      <h3 class="eyebrow">${title}</h3>
      <div class="group">${rows.join('')}</div>
    </section>
  `;
}

function selectRow(key, label, options, description = '') {
  const current = String(state.settings[key]);
  const optionTags = each(options, ([value, text]) => {
    const selected = String(value) === current ? ' selected' : '';
    return `<option value="${value}"${selected}>${escapeHtml(text)}</option>`;
  });
  return `
    <div class="row set">
      <span class="set-l">
        <label for="set_${key}">${label}</label>
        ${description ? `<span class="hint">${description}</span>` : ''}
      </span>
      <select id="set_${key}" class="sel" data-setting="${key}">${optionTags}</select>
    </div>
  `;
}

function toggleRow(key, label, description = '') {
  return `
    <div class="row set">
      <span class="set-l">
        <span id="label_${key}">${label}</span>
        ${description ? `<span class="hint">${description}</span>` : ''}
      </span>
      <button class="switch" role="switch" aria-checked="${Boolean(state.settings[key])}"
        aria-labelledby="label_${key}" data-act="toggle-setting" data-key="${key}"><i></i></button>
    </div>
  `;
}

function linkRow(action, label, { danger = false } = {}) {
  return `
    <button class="row set" data-act="${action}">
      <span class="${danger ? 'danger-t' : ''}">${label}</span>
      ${icons.chevron}
    </button>
  `;
}

function thresholdLocked() {
  return `
    <div class="row set">
      <span class="set-l"><span>${t('s_thr')}</span><span class="hint">${t('s_thr_lock')}</span></span>
      <span class="val mono">${formatPercent(state.settings.threshold)} ${icons.lock}</span>
    </div>
  `;
}

function thresholdSlider() {
  const value = state.settings.threshold;
  return `
    <div class="row set range-row">
      <div class="range-h">
        <label for="threshold">${t('s_thr')}</label>
        <span class="mono" id="threshold-value">${formatPercent(value)}</span>
      </div>
      <input type="range" id="threshold" min="50" max="95" step="5" value="${value}">
      <span class="hint">${t('ad_thr_d')}</span>
    </div>
  `;
}

function pinEntry() {
  return `
    <div class="row set range-row">
      <label for="pin" class="set-l">${t('ad_unlock')}</label>
      <div class="pin-row">
        <input id="pin" class="input" type="password" inputmode="numeric" autocomplete="off"
          placeholder="${escapeHtml(t('ad_pin'))}" aria-describedby="pin-hint">
        <button class="btn primary sm" data-act="unlock-admin">${t('ad_ok')}</button>
      </div>
      <span class="hint" id="pin-hint">
        ${state.pinError ? `<span class="err-t">${t('ad_wrong')}</span>` : ''}
        ${t('ad_pin_hint')}
      </span>
    </div>
  `;
}

function adminControls() {
  const outcomes = Object.entries(DEMO_OUTCOMES).map(([value, label]) => [value, t(label)]);
  return [selectRow('demoOutcome', t('s_demo'), outcomes), linkRow('lock-admin', t('ad_lock'))];
}
