import { STORAGE_PREFIX } from './config.js';

// localStorage can be missing or throw (private browsing, blocked site data),
// so all reads and writes go through these two functions.

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
