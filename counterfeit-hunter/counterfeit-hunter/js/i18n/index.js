import { LANGUAGES } from '../config.js';
import en from './en.js';
import sw from './sw.js';
import fi from './fi.js';

const dictionaries = { en, sw, fi };
let current = 'en';

export function setLanguage(lang) {
  current = dictionaries[lang] ? lang : 'en';
  document.documentElement.lang = current;
}

export function currentLanguage() {
  return current;
}

export function currentLocale() {
  return LANGUAGES[current].locale;
}

/**
 * Look up a UI string and fill in its {placeholders}.
 * Missing strings fall back to English, then to the key itself.
 */
export function t(key, vars) {
  let text = dictionaries[current][key] ?? en[key] ?? key;
  if (vars) {
    text = text.replace(/\{(\w+)\}/g, (match, name) => vars[name] ?? '');
  }
  return text;
}

export function detectLanguage() {
  const preferred = navigator.languages || [navigator.language || 'en'];
  const codes = preferred.map((code) => String(code).slice(0, 2).toLowerCase());
  return codes.find((code) => dictionaries[code]) || 'en';
}
