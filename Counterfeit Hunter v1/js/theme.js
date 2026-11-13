import { setLanguage } from './i18n/index.js';
import { state } from './state.js';

const root = document.documentElement;

// Inside the Claude viewer the host sets data-theme itself. We remember its
// value so "Follow system" can hand control back to it.
let viewerTheme = root.getAttribute('data-theme');
let applying = false;

export function applySettings() {
  const { theme, largeText, highContrast, lang } = state.settings;
  applying = true;

  if (theme === 'system') {
    if (viewerTheme) root.setAttribute('data-theme', viewerTheme);
    else root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }

  root.classList.toggle('large-text', largeText);
  root.classList.toggle('high-contrast', highContrast);
  setLanguage(lang);

  applying = false;
}

export function watchViewerTheme() {
  const observer = new MutationObserver(() => {
    if (applying) return;
    const current = root.getAttribute('data-theme');
    if (state.settings.theme === 'system') {
      viewerTheme = current;
    } else if (current !== state.settings.theme) {
      // The user's own choice in the app wins over the viewer.
      applySettings();
    }
  });
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
}
