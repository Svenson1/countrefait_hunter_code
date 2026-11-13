# Developer guide

How the Counterfeit Hunter prototype is built, and where to make common
changes. For running the app, see the [README](../README.md#run-it-on-your-computer).

## No build step

The app is plain HTML, CSS and JavaScript ES modules. There is no bundler, no
framework and no `package.json`. Edit a file, reload the page, and the change
is there. Any static web server works (`python3 -m http.server 8000`).

The only thing loaded from the internet is the fonts, from Google Fonts.
Offline, the app falls back to the system font.

## Project layout

```
index.html            page shell: loads the CSS and js/main.js
css/
  tokens.css          colours, fonts, light and dark theme, large text, high contrast
  base.css            reset, phone frame, header bar, tabs, the guide panel
  components.css      buttons, list rows, chips, notices, form fields, sheets, toast
  screens.css         styles used by one screen, including the camera
js/
  main.js             entry point: event handlers and start-up
  config.js           photo views, default settings (95% threshold), admin PIN
  state.js            the app state object, saving settings and history
  storage.js          localStorage wrapper
  actions.js          what each button does (looked up by its data-act name)
  flow.js             the steps of a check: photos, note, analysis, final result, saving
  camera.js           live camera with light and distance checks
  images.js           photo checks, photo intake, banknote drawings
  note-search.js      the search box on the note step
  model.js            classify(), the AI assessment (simulated)
  judgement.js        the final result from the photos and the checklist
  inspection.js       helpers for a check in progress and a saved record
  guide.js            the step-by-step guide shown next to the phone
  format.js           numbers, dates, lengths, checklist text
  report.js           text summary and HTML report
  examples.js         the two example records shown on first launch
  theme.js            applies theme, text size, contrast and language
  icons.js            inline SVG icons
  random.js           seeded random numbers for the simulation
  data/banknotes.js   the six notes and their checklist items
  i18n/               translations (en, sw, fi) and the t() lookup
  ui/
    render.js         draws the current screen and the guide
    components.js     header, tabs, chips, list rows
    sheets.js         bottom sheets (photo warning, tips, consent...)
    dom.js            small DOM helpers and the toast
    screens/          one file per screen
assets/
  icon.svg            app icon
  notes/              reference images of the six notes (third-party, see its README)
docs/
  DEVELOPMENT.md      this file
  screenshots/        images used in the README
```

## How it fits together

All UI state lives in one object, `state` in `js/state.js`. Each screen is a
function that reads `state` and returns HTML. `render()` draws
`screens[state.screen]` into `#app` and redraws the guide.

Buttons don't have their own listeners. Each one has a `data-act` attribute,
and the single click handler in `main.js` calls the matching function in
`actions.js` with the button's `data-*` values. An action changes `state` and
then calls `render()` or `goTo(screen)`.

Typing doesn't re-render the whole screen, so text fields keep their focus.
The `input` handler in `main.js` updates `state` directly, and the note search
redraws only the list of notes.

A check in progress is `state.inspection`. When the user finishes, `toRecord()`
turns it into a smaller record (thumbnails only) that is saved to history.
The record format is described at the top of `js/inspection.js`.

Settings and history are saved in `localStorage` under the prefix
`counterfeit-hunter.v2.`. Clear the site data in the browser to start over.

## Live camera and photo checks

`js/camera.js` runs the back camera while the photo screen is showing and stops
it on every other screen. It checks light and distance on the viewfinder about
three times a second, so the user sees "Light: Good" and "Distance: Move
closer" before taking the photo.

Browsers only allow the live camera on `https` or `localhost`. Elsewhere (plain
`http` on a phone, or an embedded viewer that blocks the camera) the
viewfinder shows a drawing of the photo to take, and the round button opens
the phone's camera app through a file input. The checks then run on each photo
after it is taken.

The checks themselves are in `checkPhoto()` in `js/images.js`. They split a
small copy of the photo into a 12 × 12 grid and treat a tile as "note" when its
colour differs from the background or when it has the fine detail of print.

- Light: mean brightness of the note between 50 and 225 (out of 255).
- Distance: the note fills at least 60% of what a banknote lying across the
  frame could fill (`MIN_FILL`). In an upright phone photo that is the full
  width, about a quarter of the frame. Front and back only, because an edge
  can never fill the frame.

The live checks and the photos taken in the app use only the part of the
camera frame shown in the viewfinder, so what the user lines up with the guide
is what gets checked.

This works on a plain surface. On a busy, patterned background the distance
check can pass with the note too far away.

## The two results

### Result from the photos

`classify()` in `js/model.js` returns a genuine score between 0 and 1. The app
says "Not a counterfeit" when the score is at least the required certainty
(95% by default, `threshold` in `js/config.js`), and "Might be counterfeit"
otherwise. The score is stored with the check but never shown to users.

### Final result

`finalJudgement()` in `js/judgement.js` combines the photo result with the
checklist answers. It starts from the photo score as odds and multiplies them
for each answer:

- "Matches": × 1.3 (`MATCH_RATIO`)
- "Doesn't match": × 0.1 (`MISMATCH_RATIO`)
- "Couldn't check": no change

The result is capped at 99%, because a visual check can never be certain. The
same 95% rule then decides the label, with one extra rule: any "Doesn't match"
answer means "Might be counterfeit" and caps the certainty at 50%
(`MISMATCH_CAP`), whatever the photos said. For example, 60% from the photos
and ten matching features gives 95%, so the note is cleared; 50% and ten
matches gives 93%, so it is not.

## Translations

Every text the user sees is in `js/i18n/en.js`, `sw.js` and `fi.js`, under the
same key. Screens call `t('key')`, or `t('key', { name: value })` for texts with
`{name}` placeholders. A key missing from Kiswahili or Finnish falls back to
English, so a forgotten translation shows up as English text rather than an
error.

To add a language, copy `en.js`, translate it, and add it to `dictionaries` in
`js/i18n/index.js` and to `LANGUAGES` in `js/config.js`.

## Common changes

| To change | Edit |
|---|---|
| Colours, fonts | `css/tokens.css` |
| Any text | `js/i18n/en.js`, then the same key in `sw.js` and `fi.js` |
| The six photo views | `VIEWS` in `js/config.js` (add `v_`, `vs_` and `tip_` texts for new views) |
| Which views get the distance check | `CLOSE_UP_VIEWS` in `js/config.js` |
| Light and distance limits | `TOO_DARK`, `TOO_BRIGHT`, `MIN_FILL` in `js/images.js` |
| The 95% rule | `threshold` in `DEFAULT_SETTINGS`, `js/config.js` (administrators can also change it under Administrator in Settings) |
| How much each checklist answer counts | `MATCH_RATIO`, `MISMATCH_RATIO`, `MISMATCH_CAP`, `MAX_CERTAINTY` in `js/judgement.js` |
| What the note search matches | `searchBanknotes()` in `js/note-search.js` |
| Note data or checklist items | `js/data/banknotes.js` |
| The camera screen | `js/ui/screens/photos.js`, and the camera itself in `js/camera.js` |
| A screen's layout | `js/ui/screens/<screen>.js` |
| The administrator PIN | `ADMIN_PIN` in `js/config.js` |

## Connecting the model

`classify()` in `js/model.js` is the only place the app talks to the model. It
receives the check with its six photos and the chosen note, and returns the
genuine score and the label. The comment above it lists the fields the rest of
the app expects and shows an example `fetch()` call. Once the trained model
runs behind an API, replace the body of `classify()` with that call. The 95%
rule stays in the app, so the API only needs to return the score.

The model is simulated so that the prototype runs as static files with no
server. In the simulation, the demo sample photos come out as "Not a
counterfeit" when the user picks the note that was photographed, and as "Might
be counterfeit" when they pick a different one. Administrators can also force
an outcome under Settings → Administrator → Demo result.

Note on the training data: in the UGX banknote dataset on Mendeley Data, the
phone model is linked to the class (Cramér's V about 0.29, p < 0.001). Balance
or stratify by device before reporting accuracy, or the model may learn the
phone instead of the note.

## Export report

"Export report" saves a stand-alone HTML report. It only appears when the page
runs inside Claude's artifact viewer, which provides the file download. On any
other host, "Copy summary" copies the same information as text.

## Prototype limits

- History, settings and feedback are stored in the browser's localStorage on
  one device. Nothing is sent anywhere.
- Bank verification is saved locally; no bank service is connected.
- The administrator PIN is checked in the browser, so it only keeps field users
  from changing the threshold by accident.
- The Kiswahili and Finnish texts are draft translations.
