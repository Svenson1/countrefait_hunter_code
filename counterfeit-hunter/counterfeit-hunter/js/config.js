export const APP_VERSION = '0.5.0';
export const MODEL_VERSION = 'demo-sim 0.4 · UGX (untrained)';

export const LANGUAGES = {
  en: { name: 'English', locale: 'en-UG' },
  sw: { name: 'Kiswahili', locale: 'sw' },
  fi: { name: 'Suomi', locale: 'fi-FI' },
};

// Recommended photo views, in the order the photo screen lists them.
export const VIEWS = ['front', 'back', 'light', 'tilt', 'serial'];

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
  confidenceDisplay: 'percent',
  threshold: 70,
  demoOutcome: 'auto',
};

// Prototype only. A real app would check the administrator role on a server.
export const ADMIN_PIN = '1234';

export const STORAGE_PREFIX = 'counterfeit-hunter.';
