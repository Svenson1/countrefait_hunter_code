import { BANKNOTES } from './data/banknotes.js';
import { currentLanguage, t } from './i18n/index.js';
import { noteCode } from './inspection.js';

/*
 * The search box on step 2. Every word the user types has to match something
 * about the note:
 *
 *   value       5000, 5 000, 5,000 or 5k (a number matches from the start,
 *               so "5" finds both 5,000 and 50,000)
 *   words       the value in words as printed, e.g. "elfu tano"
 *   colours     in the app's language or in English
 *   design      place, landmarks, animal and other pictures on the note
 *
 * Accents are ignored, so "vihrea" finds "vihreä".
 */
export function searchBanknotes(query) {
  const words = normalise(joinNumbers(query)).split(' ').filter(Boolean);
  if (words.length === 0) return BANKNOTES;

  return BANKNOTES.filter((note) => {
    const text = searchText(note);
    return words.every((word) => {
      if (/^\d+$/.test(word)) return String(note.value).startsWith(word);
      return text.includes(word);
    });
  });
}

// "50 000" and "50,000" become "50000", and "5k" becomes "5000". Digits are
// joined across any separator, so the list doesn't empty while typing "5,00".
function joinNumbers(query) {
  return query
    .replace(/(\d)[\s.,'’]+(?=\d)/g, '$1')
    .replace(/(\d)\s?k\b/gi, '$1000');
}

function normalise(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const textCache = new Map();

function searchText(note) {
  const key = `${note.id}:${currentLanguage()}`; // colour names depend on the language
  if (!textCache.has(key)) {
    const parts = [
      noteCode(note),
      note.valueInWords,
      ...note.colours,
      ...note.colours.map((colour) => t(`c_${colour}`)),
      note.place,
      note.landmarks,
      note.animal,
      note.otherElements,
    ];
    textCache.set(key, normalise(parts.filter(Boolean).join(' ')));
  }
  return textCache.get(key);
}
