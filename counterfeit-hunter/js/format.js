import { t, currentLanguage, currentLocale } from './i18n/index.js';
import { state } from './state.js';

export function formatNumber(value, maxDecimals = 2) {
  try {
    return new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: maxDecimals }).format(value);
  } catch {
    return String(value);
  }
}

// Finnish writes a space before the percent sign.
export function formatPercent(value) {
  return currentLanguage() === 'fi' ? `${value} %` : `${value}%`;
}

export function formatDate(iso, { short = false } = {}) {
  const options = short
    ? { day: 'numeric', month: 'short' }
    : { dateStyle: 'medium', timeStyle: 'short' };
  try {
    return new Intl.DateTimeFormat(currentLocale(), options).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatLength(mm) {
  if (state.settings.units === 'imperial') {
    return `${formatNumber(mm / 25.4, 2)} in`;
  }
  return `${formatNumber(mm, 1)} mm`;
}

// The text shown after "Genuine note:" for one checklist item.
export function describeFeature(item) {
  if (item.size) {
    return `${formatLength(item.size[0])} × ${formatLength(item.size[1])}`;
  }
  if (item.colours) {
    return item.colours.map((colour) => t(`c_${colour}`)).join(', ');
  }
  if (item.words) {
    return `“${item.words}”`;
  }
  if (item.foil) {
    return t('r_foil', { s: t(`foil_${item.foil}`) });
  }
  return t(item.describe);
}
