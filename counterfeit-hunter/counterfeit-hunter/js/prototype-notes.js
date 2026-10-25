// The panel next to the phone on wide screens. It is for the team and the
// client during demos, so it stays in English.

const SCREEN_NOTES = {
  home: {
    title: 'Start screen',
    requirements: 'UI-08 · UI-09 · UI-12 · UI-83',
    text: 'Entry point for the guided check. The three layers are shown in order, and recent records show their status.',
  },
  identify: {
    title: 'Note selection',
    requirements: 'UI-01 · UI-07 · UI-65',
    text: 'The six 2010-series notes, searchable by value, colour or design. “Other or unknown note” continues without reference data.',
  },
  noteInfo: {
    title: 'Reference information',
    requirements: 'UI-02 · UI-07 · UI-66',
    text: 'Size, colours, wording and design elements from the team’s Banknotes document. Sizes follow the chosen units.',
  },
  checklist: {
    title: 'Security checklist (layer 1)',
    requirements: 'UI-03 to UI-06',
    text: 'Each feature says how to check it: look, feel, against the light or tilt. The features follow the published Bank of Uganda 2010 series.',
  },
  photos: {
    title: 'Image capture',
    requirements: 'UI-13 to UI-30 · UI-95',
    text: 'Five views: front, back, against the light, tilted and a serial close-up. Each photo is checked on the phone for darkness, glare and blur.',
  },
  analysing: {
    title: 'Processing',
    requirements: 'UI-31 · UI-32 · UI-90 · UI-93',
    text: 'The submit button locks while a request runs, so it cannot be sent twice. A message appears if the model is slow.',
  },
  result: {
    title: 'AI assessment (layer 2)',
    requirements: 'UI-33 to UI-43 · UI-47 · UI-97 · UI-99',
    text: 'Three outcomes, each with its own icon shape, label and colour. A counterfeit result tells the user not to accept or pass on the note.',
  },
  error: {
    title: 'Error handling',
    requirements: 'UI-11 · UI-40 · UI-88 · UI-89 · UI-91',
    text: 'A failed analysis is shown separately from an inconclusive result and can be retried.',
  },
  review: {
    title: 'Bank verification (layer 3)',
    requirements: 'UI-44 to UI-52',
    text: 'The case file holds the photos, checklist, AI result, serial number and where the note came from. The app never says a bank has checked it.',
  },
  summary: {
    title: 'Check record',
    requirements: 'UI-47 · UI-53 to UI-58',
    text: 'AI findings and the user’s own input are labelled separately. The record stores the model version and can be exported or copied.',
  },
  history: {
    title: 'Check history',
    requirements: 'UI-56 · UI-58',
    text: 'Stored on this device. Each record shows whether it is preliminary, inconclusive or waiting for bank verification.',
  },
  settings: {
    title: 'General settings',
    requirements: 'UI-59 to UI-86',
    text: 'English, Kiswahili and Finnish, plus units, theme, text size, contrast, photo and data options. Only the administrator PIN unlocks the threshold.',
  },
};

export function renderPrototypeNotes(screen) {
  const panel = document.getElementById('notes');
  const note = SCREEN_NOTES[screen] ?? SCREEN_NOTES.home;

  panel.innerHTML = `
    <p class="eyebrow">Prototype notes</p>
    <h2>${note.title}</h2>
    <p class="ids mono">${note.requirements}</p>
    <p>${note.text}</p>
    <hr>

    <h3>Try it</h3>
    <ul>
      <li>On the photo step, tap <b>Use sample photos</b> to run the flow without a camera. The tilted sample is too dark on purpose, so you see the quality warning.</li>
      <li>In Settings, unlock Administrator with PIN <code>1234</code> to change the threshold or force a result.</li>
      <li>Switch between English, Kiswahili and Finnish in Settings.</li>
    </ul>

    <h3>Data</h3>
    <p>Reference data is from the team’s Banknotes document (Bank of Uganda 2010 series). The training set is the UGX banknote dataset on Mendeley Data.</p>
    <p>In that dataset the phone model is linked to the class (Cramér’s V ≈ 0.29, p &lt; 0.001), so a model could learn the camera instead of the note. Balance or stratify by device before reporting accuracy.</p>

    <h3>Model</h3>
    <p>The classifier is simulated in the browser. Replace <code>classify()</code> in <code>js/model.js</code> with a call to your model’s API once you host the app yourselves.</p>
  `;
}
