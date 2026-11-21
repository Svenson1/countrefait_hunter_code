import { APP_VERSION, LANGUAGES } from '../../config.js';
import { formatDate, formatPercent } from '../../format.js';
import { t } from '../../i18n/index.js';
import { icons } from '../../icons.js';
import { state } from '../../state.js';
import { header, tabBar } from '../components.js';
import { each, escapeHtml } from '../dom.js';

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
        ${adminSection}
        ${privacySection}
        ${helpSection}
        <div class="about">
          <span>${t('ab_app')}: <span class="mono">${APP_VERSION}</span></span>
          <span>${t('ab_model')}: <span class="mono">${escapeHtml(state.modelInfo?.name ?? t('ab_no_model'))}</span></span>
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

// The decision threshold belongs to the trained model: it was chosen on the
// validation set for a target recall and is stored in the checkpoint. It is
// shown here, read-only, so administrators know what the app is using.
function modelThresholdRow() {
  const info = state.modelInfo;
  const value = info ? formatPercent(Math.round(info.threshold * 1000) / 10) : '—';
  return `
    <div class="row set range-row">
      <div class="range-h">
        <span>${t('s_thr_model')}</span>
        <span class="mono">${value}</span>
      </div>
      <span class="hint">${t('ad_thr_model_d')}</span>
      ${info ? `<span class="hint">${escapeHtml(t('ab_trained_on'))}: ${escapeHtml(info.dataset)}</span>` : ''}
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
  return [modelThresholdRow(), linkRow('lock-admin', t('ad_lock'))];
}
