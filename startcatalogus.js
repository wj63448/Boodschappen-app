// Startcatalogus die een nieuw gezin kan kiezen in de wizard.
// Formaat per artikel: [categorie, artikel, eenheid, standaardhoeveelheid, basis?, ookInKleinHuishouden?]

export const UNITS = ['stuk', 'kg', 'g', 'liter', 'pak', 'pot', 'doos', 'fles', 'zak', 'blik', 'bak', 'rol'];

export const CATEGORIES = [
  'Groenten & fruit',
  'Brood & ontbijt',
  'Zuivel & eieren',
  'Kaas & beleg',
  'Vlees & vis',
  'Diepvries',
  'Droge voeding',
  'Conserven & sauzen',
  'Dranken',
  'Snacks & snoep',
  'Huishouden',
  'Verzorging'
];

export const MANUAL_CATEGORY = 'Manueel ingegeven';

const G = 'Groenten & fruit', B = 'Brood & ontbijt', Z = 'Zuivel & eieren', K = 'Kaas & beleg',
  V = 'Vlees & vis', D = 'Diepvries', DR = 'Droge voeding', C = 'Conserven & sauzen',
  DK = 'Dranken', S = 'Snacks & snoep', H = 'Huishouden', VZ = 'Verzorging';

const RAW = [
  [G, 'Appels', 'kg', 1, true, true],
  [G, 'Bananen', 'stuk', 6, true, true],
  [G, 'Peren', 'kg', 1, false, false],
  [G, 'Sinaasappels', 'kg', 1, false, false],
  [G, 'Mandarijnen', 'kg', 1, false, false],
  [G, 'Citroenen', 'stuk', 2, false, true],
  [G, 'Druiven', 'bak', 1, false, false],
  [G, 'Aardbeien', 'bak', 1, false, false],
  [G, "Kiwi's", 'stuk', 4, false, false],
  [G, 'Tomaten', 'kg', 1, true, true],
  [G, 'Komkommer', 'stuk', 1, false, true],
  [G, 'Paprika', 'stuk', 2, false, true],
  [G, 'Wortelen', 'kg', 1, false, true],
  [G, 'Uien', 'kg', 1, true, true],
  [G, 'Look', 'stuk', 1, false, true],
  [G, 'Prei', 'stuk', 2, false, false],
  [G, 'Courgette', 'stuk', 1, false, false],
  [G, 'Champignons', 'bak', 1, false, true],
  [G, 'Sla', 'stuk', 1, false, true],
  [G, 'Broccoli', 'stuk', 1, false, false],
  [G, 'Bloemkool', 'stuk', 1, false, false],
  [G, 'Aardappelen', 'kg', 2.5, true, true],
  [G, 'Spinazie', 'zak', 1, false, false],
  [G, "Avocado's", 'stuk', 2, false, false],
  [G, 'Verse kruiden', 'pot', 1, false, false],

  [B, 'Brood', 'stuk', 1, true, true],
  [B, 'Pistolets', 'stuk', 6, false, false],
  [B, 'Beschuiten', 'pak', 1, false, false],
  [B, 'Ontbijtgranen', 'doos', 1, false, true],
  [B, 'Havermout', 'pak', 1, false, false],
  [B, 'Choco', 'pot', 1, false, true],
  [B, 'Confituur', 'pot', 1, false, true],
  [B, 'Honing', 'pot', 1, false, false],
  [B, 'Speculoospasta', 'pot', 1, false, false],

  [Z, 'Melk', 'liter', 2, true, true],
  [Z, 'Boter', 'pak', 1, true, true],
  [Z, 'Yoghurt natuur', 'pot', 1, false, true],
  [Z, 'Fruityoghurt', 'pak', 1, false, false],
  [Z, 'Platte kaas', 'pot', 1, false, false],
  [Z, 'Kookroom', 'pak', 1, false, true],
  [Z, 'Eieren', 'doos', 1, true, true],
  [Z, 'Pudding', 'pak', 1, false, false],

  [K, 'Jonge kaas', 'stuk', 1, false, true],
  [K, 'Geraspte kaas', 'zak', 1, false, true],
  [K, 'Parmezaan', 'stuk', 1, false, false],
  [K, 'Mozzarella', 'stuk', 1, false, false],
  [K, 'Hesp', 'pak', 1, false, true],
  [K, 'Kipfilet (beleg)', 'pak', 1, false, false],
  [K, 'Salami', 'pak', 1, false, false],
  [K, 'Préparé', 'bak', 1, false, false],

  [V, 'Gehakt', 'g', 500, false, true],
  [V, 'Kippenfilet', 'g', 500, false, true],
  [V, 'Worsten', 'stuk', 4, false, false],
  [V, 'Biefstuk', 'stuk', 4, false, false],
  [V, 'Stoofvlees', 'g', 800, false, false],
  [V, 'Spekblokjes', 'pak', 1, false, false],
  [V, 'Zalm', 'g', 300, false, true],
  [V, 'Kabeljauw', 'g', 400, false, false],
  [V, 'Vegetarische burgers', 'pak', 1, false, false],

  [D, 'Frietjes', 'zak', 1, false, true],
  [D, 'Erwtjes', 'zak', 1, false, false],
  [D, 'Pizza', 'stuk', 2, false, true],
  [D, 'Vissticks', 'doos', 1, false, false],
  [D, 'Roomijs', 'doos', 1, false, false],
  [D, 'Diepvriesgroenten', 'zak', 1, false, true],

  [DR, 'Spaghetti', 'pak', 1, true, true],
  [DR, 'Penne', 'pak', 1, false, false],
  [DR, 'Rijst', 'pak', 1, false, true],
  [DR, 'Couscous', 'pak', 1, false, false],
  [DR, 'Bloem', 'pak', 1, false, false],
  [DR, 'Suiker', 'pak', 1, false, true],
  [DR, 'Wraps', 'pak', 1, false, false],
  [DR, 'Paneermeel', 'pak', 1, false, false],
  [DR, 'Bouillonblokjes', 'doos', 1, false, true],
  [DR, 'Koffie', 'pak', 1, true, true],
  [DR, 'Thee', 'doos', 1, false, true],

  [C, 'Tomatensaus', 'pot', 1, false, true],
  [C, 'Passata', 'fles', 1, false, false],
  [C, 'Tomatenpuree', 'blik', 1, false, false],
  [C, 'Mayonaise', 'pot', 1, false, true],
  [C, 'Ketchup', 'fles', 1, false, false],
  [C, 'Mosterd', 'pot', 1, false, true],
  [C, 'Olijfolie', 'fles', 1, false, true],
  [C, 'Azijn', 'fles', 1, false, false],
  [C, 'Tonijn', 'blik', 2, false, true],
  [C, 'Maïs', 'blik', 1, false, false],
  [C, 'Zout', 'pak', 1, false, true],
  [C, 'Peper', 'pot', 1, false, true],

  [DK, 'Water (plat)', 'pak', 1, true, true],
  [DK, 'Bruiswater', 'pak', 1, false, false],
  [DK, 'Fruitsap', 'fles', 2, false, true],
  [DK, 'Cola', 'fles', 1, false, false],
  [DK, 'Bier', 'bak', 1, false, false],
  [DK, 'Wijn', 'fles', 1, false, true],
  [DK, 'Siroop', 'fles', 1, false, false],

  [S, 'Chips', 'zak', 2, false, true],
  [S, 'Koekjes', 'pak', 2, false, true],
  [S, 'Chocolade', 'stuk', 2, false, true],
  [S, 'Nootjes', 'zak', 1, false, false],
  [S, 'Snoep', 'zak', 1, false, false],
  [S, 'Rijstwafels', 'pak', 1, false, false],

  [H, 'Toiletpapier', 'pak', 1, true, true],
  [H, 'Keukenrol', 'pak', 1, false, true],
  [H, 'Afwasmiddel', 'fles', 1, false, true],
  [H, 'Vaatwastabletten', 'doos', 1, false, false],
  [H, 'Wasmiddel', 'fles', 1, false, true],
  [H, 'Vuilniszakken', 'rol', 1, false, true],
  [H, 'Aluminiumfolie', 'rol', 1, false, false],
  [H, 'Allesreiniger', 'fles', 1, false, false],
  [H, 'Batterijen', 'pak', 1, false, false],

  [VZ, 'Tandpasta', 'stuk', 1, false, true],
  [VZ, 'Shampoo', 'fles', 1, false, true],
  [VZ, 'Douchegel', 'fles', 1, false, true],
  [VZ, 'Deodorant', 'stuk', 1, false, false],
  [VZ, 'Zakdoeken', 'doos', 1, false, true],
  [VZ, 'Handzeep', 'fles', 1, false, false]
];

function shrink(unit, std) {
  if (unit === 'g') return Math.max(100, Math.round(std / 200) * 100);
  if (unit === 'kg') return Math.max(0.5, Math.round(std) / 2);
  if (unit === 'stuk' && std > 2) return Math.ceil(std / 2);
  return 1;
}

// pack: 0 = standaard gezin, 1 = klein huishouden, 2 = leeg
export function startCatalog(pack) {
  if (pack === 2) return [];
  return RAW
    .filter((r) => pack === 0 || r[5])
    .map(([category, name, unit, std, basis]) => ({
      category, name, unit,
      std: pack === 1 ? shrink(unit, std) : std,
      basis: !!basis,
      photo: '', shopNr: '', link: ''
    }));
}

export function startDishes(pack) {
  if (pack === 2) return [];
  return [
    { name: 'Spaghetti bolognese', items: [
      { name: 'Gehakt', qty: 500, unit: 'g' },
      { name: 'Tomatensaus', qty: 1, unit: 'pot' },
      { name: 'Spaghetti', qty: 1, unit: 'pak' },
      { name: 'Look', qty: 1, unit: 'stuk' },
      { name: 'Geraspte kaas', qty: 1, unit: 'zak' }
    ] },
    { name: 'Pannenkoeken', items: [
      { name: 'Bloem', qty: 1, unit: 'pak' },
      { name: 'Melk', qty: 1, unit: 'liter' },
      { name: 'Eieren', qty: 1, unit: 'doos' },
      { name: 'Suiker', qty: 1, unit: 'pak' }
    ] },
    { name: 'Wraps', items: [
      { name: 'Wraps', qty: 1, unit: 'pak' },
      { name: 'Kippenfilet', qty: 500, unit: 'g' },
      { name: 'Paprika', qty: 2, unit: 'stuk' },
      { name: 'Sla', qty: 1, unit: 'stuk' },
      { name: 'Geraspte kaas', qty: 1, unit: 'zak' }
    ] },
    { name: 'Stoofvlees met frietjes', items: [
      { name: 'Stoofvlees', qty: 800, unit: 'g' },
      { name: 'Uien', qty: 1, unit: 'kg' },
      { name: 'Mosterd', qty: 1, unit: 'pot' },
      { name: 'Frietjes', qty: 1, unit: 'zak' }
    ] }
  ];
}

export const SHOPS = ['Colruyt', 'Delhaize', 'Aldi', 'Lidl', 'Albert Heijn', 'Carrefour', 'Okay', 'Spar'];

// Links naar productpagina's per winkel ({nr} wordt vervangen door het winkelnummer)
export const SHOP_LINKS = {
  'Colruyt': 'https://www.colruyt.be/nl/producten/{nr}'
};

// ---------------------------------------------------------------------
//  Afdelingen: standaardfoto's (banner bovenaan de afdeling) en kleuren.
//  Sleutel = afdelingsnaam in kleine letters. Een gezin kan per afdeling
//  een eigen foto instellen (Instellingen › Winkels & looproute).
// ---------------------------------------------------------------------
const U = (id) => `https://images.unsplash.com/${id}?w=800&q=70&auto=format&fit=crop`;
const P = (id) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=800`;

export const DEPT_PHOTOS = {
  'vlees': U('photo-1611038333075-2efd28705f42'),
  'vlees & vis': U('photo-1611038333075-2efd28705f42'),
  'drank': U('photo-1665359045452-bfa257a2a6bf'),
  'dranken': U('photo-1665359045452-bfa257a2a6bf'),
  'zuivel': P(6957905),
  'zuivel & eieren': P(6957905),
  'zuivel (koelafdeling)': U('photo-1760776140488-32fcfab4066a'),
  'groenten': U('photo-1597362925123-77861d3fbac7'),
  'groenten & fruit': U('photo-1597362925123-77861d3fbac7'),
  'fruit': U('photo-1610832958506-aa56368176cf'),
  'charcuterie': U('photo-1689774504345-6cf299b0b312'),
  'kaas & beleg': U('photo-1689774504345-6cf299b0b312'),
  'diepvries': P(5498226),
  'conserven': U('photo-1622985445103-fa1f01e80709'),
  'conserven & sauzen': U('photo-1622985445103-fa1f01e80709'),
  'koeken': U('photo-1590080874088-eec64895b423'),
  'snacks & snoep': U('photo-1590080874088-eec64895b423')
};

// [donkere kleur voor tekst en vakjes, lichte achtergrond, icoon]
export const DEPT_COLORS = [
  [/koel/, '#8A5A12', '#F6EBD6', 'cheese'],
  [/vlees|vis/, '#A8332E', '#F9E4E1', 'meat'],
  [/charcut|beleg|kaas/, '#8E4A3A', '#F5E5DF', 'cheese'],
  [/drank|drink/, '#1B7A78', '#DDF1EF', 'bottle'],
  [/zuivel|melk|eier/, '#2C66A0', '#E2EDF8', 'milk'],
  [/groent/, '#3B7D33', '#E5F1DF', 'leaf'],
  [/fruit/, '#B4511F', '#FBE9DC', 'leaf'],
  [/diepvries|vries/, '#2F6E9E', '#E1EEF7', 'snow'],
  [/conserv|blik/, '#9A5B1E', '#F6EADB', 'jar'],
  [/sauz|saus/, '#B23E1F', '#FBE4DC', 'jar'],
  [/koek|snoep|snack|chips/, '#A63F72', '#F8E3EE', 'candy'],
  [/brood|ontbijt|bakker/, '#9A6B1C', '#F6ECD8', 'bread'],
  [/droog|droge|pasta|rijst/, '#7A6420', '#F3EDD9', 'jar'],
  [/huishoud|poets|was/, '#4A5F7A', '#E6ECF3', 'spray'],
  [/verzorg|hygi/, '#7A4F99', '#EFE6F6', 'drop'],
  [/divers|overig/, '#5E5A8C', '#ECEAF5', 'jar'],
  [/manueel/, '#4E5952', '#EFECE4', 'pencil']
];
export const DEPT_FALLBACK = [
  ['#2F6B45', '#E3EDE5'], ['#1F5C8A', '#E1ECF6'], ['#9A4A1A', '#F7E7DA'], ['#6B4A8C', '#EEE6F5'],
  ['#7A5A12', '#F4ECD6'], ['#8A2F4A', '#F6E2E8'], ['#2F6B6B', '#DFEFEE']
];
