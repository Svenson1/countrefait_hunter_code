// Inline SVG icons. They use currentColor, so they follow the text colour.

function svg(paths, size = 22, stroke = 2, className = '') {
  return `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

const SCAN_PATHS = '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><rect x="7" y="9.5" width="10" height="5" rx="1"/>';

export const icons = {
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.6"/><path d="M12 17v.01"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>', 20),
  check: svg('<path d="M4.5 12.5l5 5L19.5 7"/>', 16, 2.6),
  cross: svg('<path d="M6 6l12 12M18 6L6 18"/>', 16, 2.6),
  question: svg('<path d="M9.2 9.2a2.9 2.9 0 1 1 4 2.7c-.7.3-1.2.9-1.2 1.7v.4"/><path d="M12 17.5v.01"/>', 16, 2.6),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  image: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-9 8.5"/>', 20),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 24),
  trash: svg('<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>', 17),
  warning: svg('<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.2v.01"/>', 20),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.01"/>', 20),
  chevron: svg('<path d="M9 5l7 7-7 7"/>', 18, 2, 'chev'),
  lock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>', 15),
  send: svg('<path d="M4 12l16-8-6 16-2.5-6.5z"/>', 20),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>', 18),
  download: svg('<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>', 18),
  flag: svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', 17),
  offline: svg('<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 9.5 4.3 4.3 0 0 0 7 18z"/><path d="M4 4l16 16"/>', 40, 1.8),
  scan: svg(SCAN_PATHS),
  scanSmall: svg(SCAN_PATHS, 14),
  user: svg('<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>', 14),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', 20),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>'),
};

// How to check a feature.
export const methodIcons = {
  look: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>', 13),
  feel: svg('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 6.5-6 6.5-2.6 0-4-1.3-5.4-3.4L4 14.2a1.5 1.5 0 0 1 2.4-1.7L8 14"/>', 13),
  light: svg('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>', 13),
  tilt: svg('<rect x="6" y="7" width="12" height="7" rx="1" transform="rotate(-18 12 10.5)"/><path d="M4 19c3 1.5 13 1.5 16 0"/>', 13),
};

// Each verdict has its own shape as well as its own colour, so it reads without colour.
export const verdictIcon = {
  genuine: (size = 40) => svg('<circle cx="12" cy="12" r="9.5"/><path d="M7.5 12.3l3 3 6-6.3"/>', size, 2.2),
  counterfeit: (size = 40) => svg('<path d="M8.2 2.8h7.6l5.4 5.4v7.6l-5.4 5.4H8.2l-5.4-5.4V8.2z"/><path d="M12 7.5v6M12 16.8v.01"/>', size, 2.2),
  inconclusive: (size = 40) => svg('<path d="M12 2.3l9.7 9.7-9.7 9.7L2.3 12z"/><path d="M10 9.8a2.1 2.1 0 1 1 2.9 1.9c-.5.2-.9.6-.9 1.2v.4M12 15.9v.01"/>', size, 2.2),
};

export const LOGO = `<svg viewBox="0 0 32 32" width="34" height="34" aria-hidden="true">
  <rect x="3" y="8" width="26" height="16" rx="2.5" fill="none" stroke="currentColor" stroke-width="2.2"/>
  <circle cx="14" cy="16" r="4.2" fill="none" stroke="currentColor" stroke-width="2.2"/>
  <path d="M17.2 19.2l3.6 3.6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M23 12.5v2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
</svg>`;

// Dashed placeholder for "Other or unknown note".
export const UNKNOWN_NOTE_IMAGE =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 48"><rect x="4" y="4" width="88" height="40" rx="6" fill="none" stroke="#8A99A8" stroke-width="2.5" stroke-dasharray="6 5"/><path d="M43.5 19a4.5 4.5 0 1 1 6.3 4.1c-1.1.5-1.8 1.4-1.8 2.6v.8M48 32v.1" fill="none" stroke="#8A99A8" stroke-width="2.6" stroke-linecap="round"/></svg>',
  );
