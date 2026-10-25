import { renderPrototypeNotes } from '../prototype-notes.js';
import { state } from '../state.js';
import { screens } from './screens/index.js';
import { renderSheet } from './sheets.js';

const app = document.getElementById('app');
let lastScreen = null;

// Redraw the current screen. Keeps the scroll position when the screen is the same.
export function render({ resetScroll = false } = {}) {
  const scroller = document.getElementById('scroll');
  const scrollTop = scroller ? scroller.scrollTop : 0;

  app.innerHTML = screens[state.screen]();

  const newScroller = document.getElementById('scroll');
  if (newScroller && !resetScroll && lastScreen === state.screen) {
    newScroller.scrollTop = scrollTop;
  }
  lastScreen = state.screen;
  renderPrototypeNotes(state.screen);
}

export function goTo(screen) {
  state.screen = screen;
  state.sheet = null;
  renderSheet();
  render({ resetScroll: true });
}
