import { analysing } from './analysing.js';
import { checklist } from './checklist.js';
import { error } from './error.js';
import { history } from './history.js';
import { home } from './home.js';
import { identify } from './identify.js';
import { noteInfo } from './note-info.js';
import { photos } from './photos.js';
import { result } from './result.js';
import { review } from './review.js';
import { settings } from './settings.js';
import { summary } from './summary.js';

// state.screen picks one of these. Each returns the screen's HTML.
export const screens = {
  home,
  identify,
  noteInfo,
  checklist,
  photos,
  analysing,
  result,
  error,
  review,
  summary,
  history,
  settings,
};
