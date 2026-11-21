export const APP_VERSION = '0.6.0';
export const MODEL_VERSION = 'demo-sim 0.5 · UGX (untrained)';

export const LANGUAGES = {
  en: { name: 'English', locale: 'en-UG' },
  sw: { name: 'Kiswahili', locale: 'sw' },
  fi: { name: 'Suomi', locale: 'fi-FI' },
};

// The six photos every check needs: both faces and all four edges, like the
// sides of a box. Listed in the order the photo screen shows them.
export const VIEWS = ['front', 'back', 'top', 'bottom', 'left', 'right'];

// Views that get the distance check. An edge is too thin to ever fill the frame.
export const CLOSE_UP_VIEWS = ['front', 'back'];

export const DEFAULT_SETTINGS = {
  lang: null, // null = pick from the device language on first launch
  units: 'metric',
  theme: 'system',
  largeText: false,
  highContrast: false,
  showTips: true,
  qualityWarnings: true,
  wifiOnly: false,
  uploadQuality: 'standard',
};

// Prototype only. A real app would check the administrator role on a server.
export const ADMIN_PIN = '1234';

// Bumped to v2 when the flow changed, so records saved by the old flow
// (different photo views and three-way results) are not loaded.
export const STORAGE_PREFIX = 'counterfeit-hunter.v2.';
