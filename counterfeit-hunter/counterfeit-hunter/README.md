# Counterfeit Hunter

Mobile web prototype for checking Ugandan shilling banknotes. Team 2, IS Project.

The user picks a note, works through a security checklist, takes photos and gets
an AI assessment. Doubtful notes can be saved as a case file for bank
verification. The AI model is simulated for now (see "Connecting the model").

## Running it

The app uses ES modules, which browsers won't load from `file://`, so serve the
folder with any static web server:

```sh
cd counterfeit-hunter
python3 -m http.server 8000
```

Then open http://localhost:8000. To try it on a phone, connect the phone to the
same Wi-Fi and open `http://<your computer's IP>:8000`. The camera button opens
the phone camera directly.

There is no build step and nothing to install.

## Project layout

```
index.html            page shell: loads the CSS and js/main.js
css/
  tokens.css          colours, fonts, light and dark theme, large text, high contrast
  base.css            reset, phone frame, header bar, tabs
  components.css      buttons, list rows, chips, notices, form fields, sheets, toast
  screens.css         styles used by a single screen
js/
  main.js             entry point: event handlers and start-up
  config.js           version numbers, photo views, default settings, admin PIN
  state.js            the app state object, saving settings and history
  storage.js          localStorage wrapper
  actions.js          what each button does (looked up by its data-act name)
  flow.js             the steps of a check: photos, analysis, saving
  model.js            classify(), the AI assessment (simulated)
  images.js           photo intake, quality check, banknote drawings
  inspection.js       helpers for an inspection and a saved record
  format.js           numbers, dates, lengths, checklist text
  report.js           text summary and HTML report
  examples.js         the two example records shown on first launch
  theme.js            applies theme, text size, contrast and language
  icons.js            inline SVG icons
  random.js           seeded random numbers for the simulation
  prototype-notes.js  side panel shown next to the phone on wide screens
  data/banknotes.js   the six notes: reference data and checklist items
  i18n/               translations (en, sw, fi) and the t() lookup
  ui/
    render.js         draws the current screen
    components.js     header, tabs, chips, list rows
    sheets.js         bottom sheets (capture, tips, consent, feedback...)
    dom.js            small DOM helpers and the toast
    screens/          one file per screen
assets/notes/         reference images of the six notes, stamped SPECIMEN
```

## How it fits together

All UI state lives in one object, `state` in `js/state.js`. Each screen is a
function that reads `state` and returns HTML. `render()` draws
`screens[state.screen]` into `#app`.

Buttons don't have their own listeners. Each one has a `data-act` attribute,
and the single click handler in `main.js` calls the matching function in
`actions.js` with the button's `data-*` values. An action changes `state` and
then calls `render()` or `goTo(screen)`.

A check in progress is `state.inspection`. When the user finishes, `toRecord()`
turns it into a smaller record (thumbnails only) that is saved to history.
The record format is described at the top of `js/inspection.js`.

## Common changes

| To change | Edit |
|---|---|
| Colours, fonts | `css/tokens.css` |
| Any text | `js/i18n/en.js`, then the same key in `sw.js` and `fi.js` |
| Add a language | Copy `en.js`, translate it, add it to `dictionaries` in `js/i18n/index.js` and to `LANGUAGES` in `js/config.js` |
| Note data or checklist items | `js/data/banknotes.js` |
| Recommended photo views | `VIEWS` in `js/config.js` (add `v_` and `tip_` strings for new views) |
| Default settings, threshold | `DEFAULT_SETTINGS` in `js/config.js` |
| Photo quality limits | `TOO_DARK`, `TOO_BRIGHT`, `MIN_SHARPNESS` in `js/images.js` |
| A screen's layout | `js/ui/screens/<screen>.js` |

## Connecting the model

`classify()` in `js/model.js` is the only place the app talks to the model. It
receives the inspection and returns a result object; the comment above it lists
the fields the rest of the app expects and shows an example `fetch()` call.
Once the trained model runs behind an API, replace the body of `classify()` with
that call. Nothing else needs to change.

The Claude artifact preview blocks requests to other servers, which is why the
prototype simulates the model. A copy you host yourselves can call your API.

## Data and third-party material

- Reference data (sizes, colours, wording, design elements) is from the team's
  Banknotes document, which follows the Bank of Uganda 2010 series.
- Security features follow the bank's published description of the series.
  Check them against the Bank of Uganda's own material before relying on them.
- The reference images in `assets/notes/` come from LeftoverCurrency.com and
  carry its watermark. Get permission before publishing the app with them.
- Training data: UGX banknote dataset on Mendeley Data. In that dataset the
  phone model is linked to the class (Cramér's V about 0.29, p < 0.001), so
  balance or stratify by device before reporting accuracy.
- Fonts: Barlow, Barlow Semi Condensed and IBM Plex Mono (SIL Open Font
  License 1.1), loaded from Google Fonts. No other third-party code.

## Prototype limits

- History, settings and feedback are stored in the browser's localStorage on
  one device. Nothing is sent anywhere.
- Bank verification is saved locally; no bank service is connected.
- The administrator PIN (`1234`) is checked in the browser, so it only keeps
  field users from changing the threshold by accident.
- The Kiswahili and Finnish texts are draft translations.
