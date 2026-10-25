// Bank of Uganda 2010 series, the notes in circulation now.
//
// Size, colours, wording and design elements come from the team's Banknotes
// document. The security features follow the bank's published description of
// the series. Place names and landmarks stay in English in every language.

const NOTES = [
  {
    value: 1000,
    width: 130,
    height: 63,
    colours: ['black', 'orange', 'red'],
    valueInWords: 'SHILINGI ELFU MOJA',
    place: 'Kumi savannah grassland',
    landmarks: 'Nyero rock paintings, National Independence Monument',
    animal: 'Antelopes',
    otherElements: 'Coat of arms, outline of Uganda, rock, sun',
    colourChange: 'purple-to-green',
    foil: null,
  },
  {
    value: 2000,
    width: 134,
    height: 66,
    colours: ['blue', 'green', 'purple'],
    valueInWords: 'SHILINGI ELFU MBILI',
    place: 'Njeru',
    landmarks: 'Speke Monument, National Independence Monument',
    animal: 'Tilapia',
    otherElements: 'Coat of arms, rock',
    colourChange: 'purple-to-green',
    foil: null,
  },
  {
    value: 5000,
    width: 139,
    height: 68,
    colours: ['green', 'purple'],
    valueInWords: 'SHILINGI ELFU TANO',
    place: 'Rwenzori Mountains',
    landmarks: 'National Independence Monument, World War I and II Memorial Monument',
    animal: 'Weaver birds',
    otherElements: 'Coat of arms, outline of Uganda, mountains, nest, sun',
    colourChange: 'purple-to-green',
    foil: null,
  },
  {
    value: 10000,
    width: 142,
    height: 70,
    colours: ['green', 'pink', 'purple'],
    valueInWords: 'SHILINGI ELFU KUMI',
    place: 'Kyambogo University',
    landmarks: 'Education Monument, Key to Success Monument, National Independence Monument',
    animal: null,
    otherElements: 'Coat of arms, outline of Uganda, banana tree, mountains, waterfall, sun',
    colourChange: 'moving-line',
    foil: 'pots',
  },
  {
    value: 20000,
    width: 147,
    height: 72,
    colours: ['black', 'pink', 'red'],
    valueInWords: 'SHILINGI ELFU ISHIRINI',
    place: 'Centenary Park',
    landmarks: 'Centenary Monument, Socio-economic Growth of Kampala City Monument, National Independence Monument',
    animal: 'Long-horned bulls',
    otherElements: 'Coat of arms, crater lake, drums, mountains, trees, sun',
    colourChange: 'moving-line',
    foil: 'drums',
  },
  {
    value: 50000,
    width: 151,
    height: 74,
    colours: ['brown', 'yellow'],
    valueInWords: 'SHILINGI ELFU HAMSINI',
    place: 'Bwindi Impenetrable Forest',
    landmarks: 'Stride Monument, National Independence Monument',
    animal: 'Silverback mountain gorilla',
    otherElements: 'Coat of arms, outline of Uganda, forest, statue, sun',
    colourChange: 'moving-line',
    foil: 'shield',
  },
];

// The ids double as translation keys for the feature names.
function checklistFor(note) {
  const items = [
    { id: 'f_size', method: 'look', size: [note.width, note.height] },
    { id: 'f_colours', method: 'look', colours: note.colours },
    { id: 'f_text', method: 'look', words: note.valueInWords },
    { id: 'f_wm', method: 'light', describe: 'r_wm' },
    { id: 'f_thread', method: 'light', describe: 'r_thread' },
    { id: 'f_see', method: 'light', describe: 'r_see' },
    {
      id: 'f_cc',
      method: 'tilt',
      describe: note.colourChange === 'purple-to-green' ? 'r_cc_low' : 'r_cc_high',
    },
  ];

  // Only the 10,000 note and up carry a foil image.
  if (note.foil) {
    items.push({ id: 'f_foil', method: 'tilt', foil: note.foil });
  }

  items.push(
    { id: 'f_irid', method: 'tilt', describe: 'r_irid' },
    { id: 'f_intaglio', method: 'feel', describe: 'r_intaglio' },
  );
  return items;
}

export const BANKNOTES = NOTES.map((note) => ({
  ...note,
  id: `UGX-${note.value}`,
  checklist: checklistFor(note),
}));

export function findBanknote(id) {
  return BANKNOTES.find((note) => note.id === id);
}

// "Other or unknown note". It has no reference data, so the checklist is skipped.
export function unknownBanknote(entered = '') {
  return { id: 'UNLISTED', unlisted: true, entered, checklist: [] };
}

export function referenceImagePath(value) {
  return `assets/notes/ugx-${value}.jpg`;
}
