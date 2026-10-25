import { VIEWS } from './config.js';
import { findBanknote, unknownBanknote } from './data/banknotes.js';
import { formatNumber } from './format.js';
import { t } from './i18n/index.js';

/*
 * An inspection is the check in progress. When the user finishes, it is saved
 * to history as a record, which keeps only small thumbnails of the photos:
 *
 *   {
 *     id, created, noteId, entered,
 *     checklist: { f_size: 'ok' | 'no' | 'q', ... },
 *     photoList: [{ view, thumb, quality, kept, sample }],
 *     ai,       // result from classify(), or null
 *     status,   // 'manual' | 'preliminary' | 'inconclusive' | 'review'
 *     review,   // bank verification details, or null
 *     example,  // true for the two example records
 *   }
 */

export function makeCheckId(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const day = `${String(date.getFullYear()).slice(2)}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const number = Math.floor(Math.random() * 9000) + 1000;
  return `UG-${day}-${number}`;
}

export function createInspection() {
  return {
    id: makeCheckId(),
    created: new Date().toISOString(),
    note: null,
    checklist: {},
    photos: {}, // keyed by view
    extras: [],
    ai: null,
    review: null,
    status: null,
    tipsShown: false,
  };
}

// Works for both an inspection (which holds the note) and a saved record (which holds its id).
export function noteOf(item) {
  if (item.note) return item.note;
  return findBanknote(item.noteId) ?? unknownBanknote(item.entered);
}

export function noteName(note) {
  return note.unlisted ? t('unknown_part') : t('note_name', { v: formatNumber(note.value) });
}

export function noteCode(note) {
  if (note.unlisted) return note.entered || '—';
  return `UGX ${formatNumber(note.value)}`;
}

export function hasReferenceData(note) {
  return note.checklist.length > 0;
}

// Recommended views first, in order, then any extra photos.
export function photosOf(item) {
  if (item.photoList) return item.photoList;
  const recommended = VIEWS.filter((view) => item.photos[view]).map((view) => item.photos[view]);
  return [...recommended, ...item.extras];
}

export function countCoveredViews(item) {
  const photos = photosOf(item);
  return VIEWS.filter((view) => photos.some((photo) => photo.view === view)).length;
}

export function checklistCounts(item) {
  const answers = Object.values(item.checklist || {});
  const count = (answer) => answers.filter((a) => a === answer).length;
  return { total: answers.length, ok: count('ok'), no: count('no'), unsure: count('q') };
}

export function toRecord(inspection) {
  const note = noteOf(inspection);
  return {
    id: inspection.id,
    created: inspection.created,
    noteId: note.id,
    entered: note.entered || null,
    checklist: inspection.checklist || {},
    photoList: photosOf(inspection).map((photo) => ({
      view: photo.view,
      thumb: photo.thumb,
      quality: photo.quality,
      kept: Boolean(photo.kept),
      sample: Boolean(photo.sample),
    })),
    ai: inspection.ai || null,
    status: inspection.status,
    review: inspection.review || null,
    example: Boolean(inspection.example),
  };
}
