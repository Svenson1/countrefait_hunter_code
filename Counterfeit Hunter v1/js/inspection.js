import { VIEWS } from './config.js';
import { findBanknote, unknownBanknote } from './data/banknotes.js';
import { formatNumber } from './format.js';
import { t } from './i18n/index.js';

/*
 * An inspection is the check in progress: six photos, then the note, then the
 * photo result, then (optionally) the security checklist and the final result.
 * When the user finishes, it is saved to history as a record, which keeps only
 * small thumbnails:
 *
 *   {
 *     id, created, noteId, entered,
 *     photoList: [{ view, thumb, quality, kept, sample }],
 *     ai,         // photo result from classify(), or null
 *     checklist:  { f_size: 'ok' | 'no' | 'q', ... },
 *     final,      // final result from finalJudgement(), or null if the checklist was skipped
 *     status,     // 'preliminary' (photos only), 'checked' (photos and checklist) or 'review'
 *     review,     // bank verification details, or null
 *     example,    // true for the two example records
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
    photos: {}, // keyed by view
    currentView: VIEWS[0], // the photo the camera is taking now, null when all six are taken
    note: null, // chosen after the photos
    noteSearch: '', // what the user typed in the search box on step 2
    ai: null,
    checklist: {},
    final: null,
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

export function photosOf(item) {
  if (item.photoList) return item.photoList;
  return VIEWS.filter((view) => item.photos[view]).map((view) => item.photos[view]);
}

export function countPhotosTaken(inspection) {
  return VIEWS.filter((view) => inspection.photos[view]).length;
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
    photoList: photosOf(inspection).map((photo) => ({
      view: photo.view,
      thumb: photo.thumb,
      quality: photo.quality,
      kept: Boolean(photo.kept),
      sample: Boolean(photo.sample),
    })),
    ai: inspection.ai || null,
    checklist: inspection.checklist || {},
    final: inspection.final || null,
    status: inspection.status,
    review: inspection.review || null,
    example: Boolean(inspection.example),
  };
}
