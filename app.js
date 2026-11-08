// =====================================================================
//  Boodschappen – gezinsapp (PWA + Firebase)
// =====================================================================
import { firebaseConfig, FEATURES, APP_NAME } from './config.js';
import { CATEGORIES, MANUAL_CATEGORY, UNITS, SHOPS, SHOP_LINKS, startCatalog, startDishes } from './startcatalogus.js';
import { parseImport } from './import.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut, reauthenticateWithPopup
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch,
  serverTimestamp, query, orderBy, limit, increment, arrayUnion, arrayRemove, deleteField, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const root = document.getElementById('app');

// ---------------------------------------------------------------------
//  Configuratie controleren
// ---------------------------------------------------------------------
if (!firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith('VUL')) {
  root.innerHTML = '';
  root.append(h('div', { class: 'login' },
    h('div', { class: 'col' },
      h('h1', { class: 'title-lg' }, 'Nog niet ingesteld'),
      h('p', {}, 'Vul eerst de Firebase-gegevens in het bestand config.js in. Het stappenplan legt uit waar je ze vindt.'))));
  throw new Error('config.js is nog niet ingevuld');
}

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
let db;
try {
  db = initializeFirestore(fbApp, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch (e) {
  console.warn('Offline cache niet beschikbaar, verder zonder.', e);
  db = initializeFirestore(fbApp, {});
}

// ---------------------------------------------------------------------
//  Toestand
// ---------------------------------------------------------------------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* geen opslag */ } }
};

const S = {
  booting: true,
  user: null,
  profile: null,
  hid: null,
  household: null,
  hhNames: {},          // hid -> naam (voor de wisselaar)
  items: [], catalog: [], dishes: [], cards: [], history: [], events: [], invites: [],
  loaded: {},
  view: 'list',         // list | add | settings | cards | history
  page: null,           // instellingen-subpagina
  filter: store.get('filter', 'open'),
  pending: {},          // itemId -> true (net afgevinkt, nog even zichtbaar)
  swiped: null,
  viewAs: null,         // 'member' = testweergave
  staged: {},           // te-toevoegen artikelen
  search: '', chip: 'Alles',
  manual: { name: '', qty: 1, unit: 'stuk' },
  noteOpen: null,
  sheet: null,
  toast: null,
  online: navigator.onLine,
  pendingWrites: false,
  wizard: null,
  joinCode: null,
  dismissedEvent: store.get('dismissedEvent', null),
  form: {},
  error: null
};

let unsubs = [];
let toastTimer = null;
const lingerTimers = {};

// ---------------------------------------------------------------------
//  Hulpfuncties
// ---------------------------------------------------------------------
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') { for (const sk in v) { if (sk.startsWith('--')) el.style.setProperty(sk, v[sk]); else el.style[sk] = v[sk]; } }
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const ICONS = {
  check: '<path d="M5 12l5 5 9-10"/>',
  plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  gear: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9v6M10 9v6M13 9v6M16 9v6"/>',
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h8"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  up: '<path d="M18 15l-6-6-6 6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  miss: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/><path d="M8.5 8.5l5 5M13.5 8.5l-5 5"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  ext: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  join: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><path d="M18 8v6M15 11h6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  basket: '<path d="M3 9h18l-2 10a2 2 0 0 1-2 1.6H7A2 2 0 0 1 5 19L3 9z"/><path d="M8 9l3-6"/><path d="M16 9l-3-6"/>',
  // categorie-iconen
  leaf: '<path d="M5 19c0-8 5-14 14-14 0 9-6 14-14 14z"/><path d="M5 19l8-8"/>',
  bread: '<path d="M5 11a4 4 0 0 1 2-7h10a4 4 0 0 1 2 7v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/>',
  milk: '<path d="M8 3h8v3l2 4v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V10l2-4z"/><path d="M6 12h12"/>',
  cheese: '<path d="M3 17l9-11 9 11z"/><circle cx="10" cy="14" r="1"/><circle cx="14" cy="15" r="1"/>',
  meat: '<path d="M15 4a5 5 0 0 1 5 5c0 5-6 9-11 9a4 4 0 0 1-4-4c0-5 5-10 10-10z"/><circle cx="14" cy="9" r="1.5"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>',
  jar: '<rect x="7" y="3" width="10" height="4" rx="1"/><rect x="5" y="7" width="14" height="14" rx="3"/>',
  bottle: '<path d="M10 3h4v4l2 3v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10l2-3z"/>',
  candy: '<circle cx="12" cy="12" r="4"/><path d="M8.5 10L4 7v10l4.5-3M15.5 10L20 7v10l-4.5-3"/>',
  spray: '<path d="M9 8h6v13H9zM10 8V5h4v3M14 5h3"/>',
  drop: '<path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z"/>'
};

function icon(name, size = 22, color = 'currentColor', sw = 2) {
  return h('span', {
    'aria-hidden': 'true',
    style: { display: 'inline-flex', flex: 'none' },
    html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`
  });
}

function catIcon(cat) {
  const c = (cat || '').toLowerCase();
  if (c.includes('groent') || c.includes('fruit')) return 'leaf';
  if (c.includes('brood') || c.includes('ontbijt')) return 'bread';
  if (c.includes('zuivel') || c.includes('melk')) return 'milk';
  if (c.includes('kaas') || c.includes('beleg')) return 'cheese';
  if (c.includes('vlees') || c.includes('vis')) return 'meat';
  if (c.includes('diepvries')) return 'snow';
  if (c.includes('drank')) return 'bottle';
  if (c.includes('snack') || c.includes('snoep')) return 'candy';
  if (c.includes('huishoud')) return 'spray';
  if (c.includes('verzorg')) return 'drop';
  if (c.includes('manueel')) return 'pencil';
  return 'jar';
}

function thumb(photo, cat, small) {
  const box = h('div', { class: 'thumb' + (small ? ' sm' : '') + (photo ? '' : ' none') });
  if (photo) {
    const img = h('img', { src: photo, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => { box.classList.add('none'); box.innerHTML = ''; box.append(icon(catIcon(cat), small ? 20 : 24, '#5B655E', 1.8)); });
    box.append(img);
  } else {
    box.append(icon(catIcon(cat), small ? 20 : 24, '#5B655E', 1.8));
  }
  return box;
}

const norm = (s) => (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
const fmtNum = (n) => (Math.round(n * 100) / 100).toLocaleString('nl-BE');
function fmtQty(q, unit) {
  if (unit === 'stuk') return `${fmtNum(q)} ${q === 1 ? 'stuk' : 'stuks'}`;
  return `${fmtNum(q)} ${unit || ''}`.trim();
}
function stepFor(unit) { return unit === 'g' ? 100 : unit === 'kg' ? 0.5 : 1; }
function toDate(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  return null;
}
function fmtWhen(ts) {
  const d = toDate(ts);
  if (!d) return 'zonet';
  const now = new Date();
  const time = d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
  const days = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5);
  if (days === 0) return `vandaag ${time}`;
  if (days === 1) return `gisteren ${time}`;
  if (days < 7) return `${d.toLocaleDateString('nl-BE', { weekday: 'short' })} ${time}`;
  return d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
}
function fmtDay(ts) {
  const d = toDate(ts);
  if (!d) return 'vandaag';
  return d.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' });
}
const uid = () => S.user?.uid;
const firstName = (n) => (n || '').trim().split(/\s+/)[0] || 'Ik';
function nameOf(u) {
  if (!u) return 'onbekend';
  if (u === uid()) return S.household?.memberNames?.[u] || firstName(S.user?.displayName);
  return S.household?.memberNames?.[u] || 'oud lid';
}
const realRole = () => S.household?.members?.[uid()] || null;
const role = () => (S.viewAs ? S.viewAs : realRole());
const isAdmin = () => role() === 'admin';
const canShop = () => role() === 'admin' || role() === 'shopper';
const ROLE_LABEL = { admin: 'beheerder', shopper: 'winkelaar', member: 'lid' };
const ROLE_LABEL_CAP = { admin: 'Beheerder', shopper: 'Winkelaar', member: 'Lid' };
const AVATAR_COLORS = ['#2F6B45', '#1F5C8A', '#9A4A1A', '#6B4A8C', '#7A5A12', '#8A2F4A', '#2F6B6B'];
function avatarColor(key) { let s = 0; for (const c of String(key)) s = (s * 31 + c.charCodeAt(0)) >>> 0; return AVATAR_COLORS[s % AVATAR_COLORS.length]; }

function qtyOf(it) { return Object.values(it.parts || {}).reduce((a, b) => a + (Number(b) || 0), 0); }
function isOwnOnly(it) { const k = Object.keys(it.parts || {}); return k.length === 1 && k[0] === uid(); }
function partsText(it) {
  const ks = Object.keys(it.parts || {});
  if (ks.length <= 1) return nameOf(ks[0] || it.addedBy);
  return ks.map((k) => `${nameOf(k)} ${fmtNum(it.parts[k])}`).join(' + ');
}
function catOrder() {
  const shop = activeShop();
  const base = (shop && S.household?.routes?.[shop]) || S.household?.categories || CATEGORIES;
  const extra = new Set();
  for (const c of S.catalog) if (c.category && !base.includes(c.category)) extra.add(c.category);
  for (const i of S.items) if (i.category && !base.includes(i.category) && i.category !== MANUAL_CATEGORY) extra.add(i.category);
  return [...base, ...[...extra].sort(), MANUAL_CATEGORY];
}
function allCategories() {
  const set = new Set([...(S.household?.categories || CATEGORIES)]);
  for (const c of S.catalog) if (c.category) set.add(c.category);
  return [...set];
}
function activeShop() {
  const shops = S.household?.shops || [];
  const saved = store.get('shop:' + S.hid, null);
  if (saved && shops.includes(saved)) return saved;
  return shops[0] || null;
}
function catalogFor(it) { return it.catalogId ? S.catalog.find((c) => c.id === it.catalogId) : S.catalog.find((c) => norm(c.name) === norm(it.name)); }
function photoFor(it) { const c = catalogFor(it); return (c && c.photo) || it.photo || ''; }
function linkFor(it) {
  const c = catalogFor(it) || it;
  if (c.link) return c.link;
  if (c.shopNr) {
    const tpl = SHOP_LINKS[activeShop()] || SHOP_LINKS.Colruyt;
    return tpl.replace('{nr}', encodeURIComponent(c.shopNr));
  }
  return '';
}
function lastBought(name) {
  const n = norm(name);
  return S.history.find((x) => x.action === 'bought' && norm(x.name) === n) || null;
}
function latestShoppingEvent() { return S.events[0] || null; }
function isNew(it) {
  const ev = latestShoppingEvent();
  if (!ev) return false;
  const evAt = toDate(ev.at), itAt = toDate(it.addedAt);
  if (!evAt || !itAt) return false;
  if (Date.now() - evAt.getTime() > 4 * 3600e3) return false;
  return itAt > evAt && it.addedBy !== ev.by;
}
function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint32Array(7));
  const c = [...r].map((x) => A[x % A.length]).join('');
  return c.slice(0, 3) + '-' + c.slice(3);
}
function cleanCode(c) { return (c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{3})(.+)$/, '$1-$2'); }
function inviteUrl(code) { return location.origin + location.pathname + '#join=' + code; }
async function shareText(title, text, url) {
  try {
    if (navigator.share) { await navigator.share({ title, text, url }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(`${text} ${url}`.trim()); toast('Gekopieerd naar het klembord'); }
  catch { prompt('Kopieer deze tekst:', `${text} ${url}`.trim()); }
}
function fail(e) {
  console.error(e);
  const msg = e && e.code === 'permission-denied'
    ? 'Dat mag je niet doen met jouw rol.'
    : (e && e.message) || 'Er ging iets mis.';
  toast(msg);
}
function bg(promise) { promise.catch(fail); }
function hhRef(...p) { return doc(db, 'households', S.hid, ...p); }
function hhCol(name) { return collection(db, 'households', S.hid, name); }

// ---------------------------------------------------------------------
//  Toast & sheets
// ---------------------------------------------------------------------
function toast(text, undo) {
  clearTimeout(toastTimer);
  S.toast = { text, undo };
  render();
  toastTimer = setTimeout(() => { S.toast = null; render(); }, undo ? 6000 : 3500);
}
function openSheet(sheet) { S.sheet = sheet; render(); }
function closeSheet() { S.sheet = null; render(); }

// ---------------------------------------------------------------------
//  Aanmelden
// ---------------------------------------------------------------------
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

async function login() {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) {
      await signInWithRedirect(auth, provider);
    } else if (e.code !== 'auth/popup-closed-by-user') {
      S.error = e.code === 'auth/unauthorized-domain'
        ? 'Dit webadres staat nog niet bij de toegelaten domeinen in Firebase (Authentication › Instellingen › Geautoriseerde domeinen).'
        : 'Aanmelden lukte niet: ' + (e.message || e.code);
      render();
    }
  }
}

function readJoinFromUrl() {
  const m = location.hash.match(/join=([A-Za-z0-9-]+)/);
  if (m) {
    sessionStorage.setItem('joinCode', cleanCode(m[1]));
    history.replaceState(null, '', location.pathname + location.search);
  }
  S.joinCode = sessionStorage.getItem('joinCode');
}

getRedirectResult(auth).catch((e) => { if (e) { S.error = 'Aanmelden lukte niet: ' + (e.message || e.code); render(); } });

onAuthStateChanged(auth, async (user) => {
  S.user = user;
  stopSubs();
  S.household = null; S.hid = null; S.profile = null;
  if (!user) { S.booting = false; render(); return; }
  S.booting = true; render();
  try {
    const ref = doc(db, 'users', user.uid);
    let snap = await getDoc(ref).catch(() => null);
    if (!snap || !snap.exists()) {
      await setDoc(ref, { name: user.displayName || '', email: user.email || '', households: [], createdAt: serverTimestamp() }, { merge: true });
      snap = await getDoc(ref);
    }
    S.profile = snap.data();
    if (S.joinCode) { await joinWithCode(S.joinCode); }
    const list = S.profile.households || [];
    const pick = (S.profile.lastHousehold && list.includes(S.profile.lastHousehold)) ? S.profile.lastHousehold : list[0];
    if (pick) await openHousehold(pick);
    else { S.booting = false; render(); }
    loadHouseholdNames();
  } catch (e) {
    S.booting = false; S.error = 'Laden mislukt: ' + (e.message || e.code); render();
  }
});

async function loadHouseholdNames() {
  const list = S.profile?.households || [];
  for (const hid of list) {
    if (S.hhNames[hid]) continue;
    try {
      const s = await getDoc(doc(db, 'households', hid));
      if (s.exists() && s.data().members?.[uid()]) S.hhNames[hid] = s.data().name;
      else await updateDoc(doc(db, 'users', uid()), { households: arrayRemove(hid) }).catch(() => {});
    } catch { /* geen toegang meer */ }
  }
  render();
}

// ---------------------------------------------------------------------
//  Gezin openen & live gegevens
// ---------------------------------------------------------------------
function stopSubs() { unsubs.forEach((u) => { try { u(); } catch { /* */ } }); unsubs = []; }

function docsOf(snap) { return snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })); }

async function openHousehold(hid) {
  stopSubs();
  S.hid = hid; S.household = null; S.viewAs = null; S.loaded = {};
  S.items = []; S.catalog = []; S.dishes = []; S.cards = []; S.history = []; S.events = []; S.invites = [];
  S.view = 'list'; S.page = null; S.staged = {}; S.sheet = null;
  updateDoc(doc(db, 'users', uid()), { lastHousehold: hid }).catch(() => {});

  await new Promise((resolve) => {
    let first = true;
    unsubs.push(onSnapshot(doc(db, 'households', hid), (s) => {
      if (!s.exists() || !s.data().members?.[uid()]) {
        // niet (meer) lid
        S.household = null; S.hid = null; stopSubs();
        updateDoc(doc(db, 'users', uid()), { households: arrayRemove(hid) }).catch(() => {});
        if (S.profile) S.profile.households = (S.profile.households || []).filter((x) => x !== hid);
        toast('Je bent geen lid meer van dit gezin.');
        S.booting = false; render(); if (first) { first = false; resolve(); }
        return;
      }
      S.household = { id: s.id, ...s.data() };
      S.hhNames[hid] = S.household.name;
      S.booting = false;
      render();
      if (first) { first = false; resolve(); subscribeRest(hid); }
    }, (e) => {
      console.warn('household', e);
      S.household = null; S.hid = null; stopSubs();
      if (e.code === 'permission-denied') {
        updateDoc(doc(db, 'users', uid()), { households: arrayRemove(hid) }).catch(() => {});
        if (S.profile) S.profile.households = (S.profile.households || []).filter((x) => x !== hid);
        const next = (S.profile?.households || [])[0];
        if (!first) toast('Je hebt geen toegang meer tot dit gezin.');
        if (next && !first) { openHousehold(next); }
      }
      S.booting = false; render();
      if (first) { first = false; resolve(); }
    }));
  });
}

function subscribeRest(hid) {
  const sub = (q, key, opts) => unsubs.push(onSnapshot(q, opts || {}, (snap) => {
    S[key] = docsOf(snap);
    S.loaded[key] = true;
    if (key === 'items') S.pendingWrites = snap.metadata.hasPendingWrites;
    if (key === 'events') handleEvents(snap);
    render();
  }, (e) => console.warn(key, e)));
  sub(collection(db, 'households', hid, 'items'), 'items', { includeMetadataChanges: true });
  sub(collection(db, 'households', hid, 'catalog'), 'catalog');
  sub(collection(db, 'households', hid, 'dishes'), 'dishes');
  sub(collection(db, 'households', hid, 'cards'), 'cards');
  sub(query(collection(db, 'households', hid, 'history'), orderBy('at', 'desc'), limit(300)), 'history');
  sub(query(collection(db, 'households', hid, 'events'), orderBy('at', 'desc'), limit(5)), 'events');
  if (realRole() === 'admin') sub(collection(db, 'households', hid, 'invites'), 'invites');
}

let eventsPrimed = false;
function handleEvents(snap) {
  if (!eventsPrimed) { eventsPrimed = true; return; }
  for (const ch of snap.docChanges()) {
    if (ch.type !== 'added' || snap.metadata.fromCache) continue;
    const ev = ch.doc.data({ serverTimestamps: 'estimate' });
    if (ev.by === uid()) continue;
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      navigator.serviceWorker?.ready.then((reg) => reg.showNotification(`${ev.byName || 'Iemand'} gaat winkelen`, {
        body: `${ev.shop ? '(' + ev.shop + ') ' : ''}Nog iets nodig? Zet het nu op de lijst.`,
        icon: 'icon-192.png', badge: 'icon-192.png', tag: 'shopping'
      })).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------
//  Gezin aanmaken / lid worden
// ---------------------------------------------------------------------
async function createHousehold(w) {
  const me = uid();
  const ref = doc(collection(db, 'households'));
  const hid = ref.id;
  const myName = firstName(S.user.displayName);
  const shops = w.shops.length ? w.shops : [];
  await setDoc(ref, {
    name: w.name.trim() || 'Ons gezin',
    createdBy: me,
    createdAt: serverTimestamp(),
    members: { [me]: 'admin' },
    memberNames: { [me]: myName },
    joinedVia: {},
    shops,
    categories: CATEGORIES,
    routes: {}
  });
  // catalogus & gerechten
  const cat = startCatalog(w.pack);
  const dishes = startDishes(w.pack);
  await commitInChunks([
    ...cat.map((c) => (b) => b.set(doc(collection(db, 'households', hid, 'catalog')), c)),
    ...dishes.map((d) => (b) => b.set(doc(collection(db, 'households', hid, 'dishes')), d))
  ]);
  // uitnodigingen
  const invites = [];
  for (const p of w.people) {
    const code = makeCode();
    invites.push({ code, name: p.name, role: p.role });
  }
  const groupCode = makeCode();
  const ops = [];
  const exp = Timestamp.fromDate(new Date(Date.now() + FEATURES.inviteDays * 864e5));
  for (const inv of invites) {
    const data = { hid, hhName: w.name.trim(), name: inv.name, role: inv.role, createdBy: me, createdAt: serverTimestamp(), expiresAt: exp, personal: true };
    ops.push((b) => b.set(doc(db, 'invites', inv.code), data));
    ops.push((b) => b.set(doc(db, 'households', hid, 'invites', inv.code), data));
  }
  const gdata = { hid, hhName: w.name.trim(), name: '', role: 'member', createdBy: me, createdAt: serverTimestamp(), expiresAt: exp, personal: false };
  ops.push((b) => b.set(doc(db, 'invites', groupCode), gdata));
  ops.push((b) => b.set(doc(db, 'households', hid, 'invites', groupCode), gdata));
  await commitInChunks(ops);
  await updateDoc(doc(db, 'users', me), { households: arrayUnion(hid), lastHousehold: hid });
  S.profile.households = [...(S.profile.households || []), hid];
  return hid;
}

async function commitInChunks(ops, size = 400) {
  for (let i = 0; i < ops.length; i += size) {
    const b = writeBatch(db);
    ops.slice(i, i + size).forEach((op) => op(b));
    await b.commit();
  }
}

async function joinWithCode(code) {
  code = cleanCode(code);
  sessionStorage.removeItem('joinCode'); S.joinCode = null;
  let inv;
  try {
    const s = await getDoc(doc(db, 'invites', code));
    if (!s.exists()) { toast('Deze uitnodiging bestaat niet (meer).'); return false; }
    inv = s.data();
  } catch (e) { toast('Uitnodiging kon niet gelezen worden.'); return false; }
  if (toDate(inv.expiresAt) < new Date()) { toast('Deze uitnodiging is verlopen. Vraag een nieuwe.'); return false; }
  const me = uid();
  if ((S.profile.households || []).includes(inv.hid)) { await openHousehold(inv.hid); return true; }
  const name = inv.name || firstName(S.user.displayName);
  try {
    await updateDoc(doc(db, 'households', inv.hid), {
      ['members.' + me]: inv.role,
      ['memberNames.' + me]: name,
      ['joinedVia.' + me]: code
    });
    await updateDoc(doc(db, 'users', me), { households: arrayUnion(inv.hid), lastHousehold: inv.hid });
    S.profile.households = [...(S.profile.households || []), inv.hid];
    S.profile.lastHousehold = inv.hid;
    toast(`Welkom bij ${inv.hhName || 'het gezin'}!`);
    return true;
  } catch (e) { fail(e); return false; }
}

// ---------------------------------------------------------------------
//  Acties op de lijst
// ---------------------------------------------------------------------
function putInCart(it) {
  S.pending[it.id] = true;
  S.swiped = null;
  bg(updateDoc(hhRef('items', it.id), { status: 'cart', cartBy: uid(), cartAt: serverTimestamp(), missing: false }));
  clearTimeout(lingerTimers[it.id]);
  lingerTimers[it.id] = setTimeout(() => { delete S.pending[it.id]; render(); }, FEATURES.cartLingerMs);
  render();
}
function takeOutOfCart(it) {
  clearTimeout(lingerTimers[it.id]);
  delete S.pending[it.id];
  bg(updateDoc(hhRef('items', it.id), { status: 'open', cartBy: deleteField(), cartAt: deleteField() }));
  render();
}
function markMissing(it, on = true) {
  S.swiped = null;
  bg(updateDoc(hhRef('items', it.id), on ? { missing: true, missingAt: serverTimestamp() } : { missing: false }));
  toast(on ? `${it.name}: niet gevonden` : 'Label verwijderd', on ? () => markMissing(it, false) : null);
}
function deleteLine(it) {
  S.swiped = null;
  const copy = { ...it }; delete copy.id;
  const histRef = doc(hhCol('history'));
  const b = writeBatch(db);
  b.delete(hhRef('items', it.id));
  b.set(histRef, { action: 'deleted', name: it.name, qty: qtyOf(it), unit: it.unit || '', category: it.category || '', by: uid(), at: serverTimestamp(), addedBy: it.addedBy || '' });
  bg(b.commit());
  toast(`${it.name} gewist`, () => {
    const u = writeBatch(db);
    u.set(hhRef('items', it.id), copy);
    u.delete(histRef);
    bg(u.commit());
  });
}
function removeMyPart(it) {
  if (isOwnOnly(it)) return deleteLine(it);
  bg(updateDoc(hhRef('items', it.id), { ['parts.' + uid()]: deleteField(), updatedAt: serverTimestamp() }));
  toast('Jouw deel is gewist');
}
function splitLine(it, n, restMissing) {
  const total = qtyOf(it);
  if (n >= total) { putInCart(it); if (restMissing) { /* niets meer over */ } return; }
  const remaining = { ...it.parts };
  const taken = {};
  let left = n;
  for (const k of Object.keys(remaining).sort()) {
    if (left <= 0) break;
    const t = Math.min(remaining[k], left);
    taken[k] = t; remaining[k] = Math.round((remaining[k] - t) * 1000) / 1000; left -= t;
    if (remaining[k] <= 0) delete remaining[k];
  }
  const copy = { ...it }; delete copy.id;
  const b = writeBatch(db);
  const newRef = doc(hhCol('items'));
  b.set(newRef, { ...copy, parts: taken, status: 'cart', cartBy: uid(), cartAt: serverTimestamp(), missing: false, splitFrom: it.id });
  b.update(hhRef('items', it.id), restMissing ? { parts: remaining, missing: true, missingAt: serverTimestamp() } : { parts: remaining });
  bg(b.commit());
  const restQ = Math.round((total - n) * 100) / 100;
  toast(`${fmtQty(n, it.unit)} in de mand, ${fmtQty(restQ, it.unit)} ${restMissing ? 'niet gevonden' : 'nog te kopen'}`);
}
function finishShopping() {
  const cart = S.items.filter((i) => i.status === 'cart');
  const ops = [];
  for (const it of cart) {
    ops.push((b) => b.delete(hhRef('items', it.id)));
    ops.push((b) => b.set(doc(hhCol('history')), { action: 'bought', name: it.name, qty: qtyOf(it), unit: it.unit || '', category: it.category || '', by: uid(), at: serverTimestamp(), addedBy: it.addedBy || '', catalogId: it.catalogId || '' }));
  }
  bg(commitInChunks(ops));
  closeSheet();
  toast(`Winkelbeurt afgerond · ${cart.length} artikelen naar de historiek`);
}
function announceShopping() {
  bg(setDoc(doc(hhCol('events')), { type: 'shopping', by: uid(), byName: nameOf(uid()), shop: activeShop() || '', at: serverTimestamp() }));
  toast('De anderen zien nu dat je gaat winkelen');
}
function restoreFromHistory(hx) {
  const owner = hx.addedBy || hx.by;
  const cat = S.catalog.find((c) => c.id === hx.catalogId) || S.catalog.find((c) => norm(c.name) === norm(hx.name));
  bg(setDoc(doc(hhCol('items')), {
    name: hx.name, category: hx.category || (cat && cat.category) || MANUAL_CATEGORY, unit: hx.unit || 'stuk',
    catalogId: (cat && cat.id) || '', photo: (cat && cat.photo) || '', note: '',
    parts: { [owner]: hx.qty || 1 }, addedBy: owner, addedAt: serverTimestamp(), status: 'open', missing: false
  }));
  toast(`${hx.name} staat terug op de lijst`);
}

// Artikelen op de lijst zetten (vanuit Toevoegen)
function commitStaged() {
  const entries = Object.values(S.staged).filter((s) => s.qty > 0);
  if (!entries.length) return;
  const me = uid();
  const b = writeBatch(db);
  for (const s of entries) {
    const existing = S.items.find((i) => i.status === 'open' && norm(i.name) === norm(s.name) && (i.unit || '') === (s.unit || ''));
    if (existing) {
      const upd = { ['parts.' + me]: increment(s.qty), updatedAt: serverTimestamp() };
      if (s.note && !existing.note && (isOwnOnly(existing) || canShop())) upd.note = s.note;
      b.update(hhRef('items', existing.id), upd);
    } else {
      b.set(doc(hhCol('items')), {
        name: s.name.trim(), category: s.category || MANUAL_CATEGORY, unit: s.unit || 'stuk',
        catalogId: s.catalogId || '', photo: s.photo || '', note: s.note || '',
        parts: { [me]: s.qty }, addedBy: me, addedAt: serverTimestamp(), status: 'open', missing: false
      });
    }
  }
  bg(b.commit());
  const n = entries.length;
  S.staged = {}; S.noteOpen = null; S.search = '';
  S.view = 'list';
  toast(`${n} ${n === 1 ? 'artikel' : 'artikelen'} op de lijst gezet`);
}
function stageKey(name, unit) { return norm(name) + '|' + (unit || ''); }
function stageCatalog(c, delta) {
  const k = stageKey(c.name, c.unit);
  const cur = S.staged[k] || { name: c.name, unit: c.unit, category: c.category, catalogId: c.id, photo: c.photo || '', note: '', qty: 0 };
  let q = cur.qty;
  if (delta > 0) q = q === 0 ? (c.std || stepFor(c.unit)) : q + stepFor(c.unit);
  else q = Math.max(0, q - stepFor(c.unit));
  q = Math.round(q * 100) / 100;
  if (q <= 0 && !cur.note) delete S.staged[k]; else S.staged[k] = { ...cur, qty: q };
  render();
}
function stageEntry(entry) {
  const k = stageKey(entry.name, entry.unit);
  const cur = S.staged[k];
  S.staged[k] = cur ? { ...cur, qty: Math.round((cur.qty + entry.qty) * 100) / 100 } : { note: '', ...entry };
}

// ---------------------------------------------------------------------
//  Renderen
// ---------------------------------------------------------------------
let renderQueued = false;
function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; doRender(); });
}

function doRender() {
  // focus en scroll bewaren
  const ae = document.activeElement;
  const focusKey = ae && ae.dataset ? ae.dataset.key : null;
  const selStart = ae && 'selectionStart' in ae ? ae.selectionStart : null;
  const scrollY = window.scrollY;
  const sheetEl = document.querySelector('.sheet');
  const sheetScroll = sheetEl ? sheetEl.scrollTop : 0;

  root.innerHTML = '';
  let screen;
  if (S.booting) screen = renderLoading();
  else if (!S.user) screen = renderLogin();
  else if (S.wizard) screen = renderWizard();
  else if (!S.household) screen = renderWelcome();
  else screen = renderApp();
  root.append(screen);

  if (S.sheet) root.append(renderSheet());
  if (S.toast) {
    root.append(h('div', { class: 'toast', role: 'status' },
      h('span', {}, S.toast.text),
      S.toast.undo ? h('button', { onclick: () => { const u = S.toast.undo; S.toast = null; clearTimeout(toastTimer); u(); render(); } }, 'Ongedaan maken') : null));
  }

  if (focusKey) {
    const el = root.querySelector(`[data-key="${focusKey}"]`);
    if (el) { el.focus({ preventScroll: true }); if (selStart != null && el.setSelectionRange) { try { el.setSelectionRange(selStart, selStart); } catch { /* */ } } }
  }
  window.scrollTo(0, scrollY);
  const ns = document.querySelector('.sheet');
  if (ns) ns.scrollTop = sheetScroll;
}

function renderLoading() {
  return h('div', { class: 'login', style: { alignItems: 'center', justifyContent: 'center' } }, h('div', { class: 'spinner', role: 'status', 'aria-label': 'Laden' }));
}

function renderLogin() {
  return h('div', { class: 'screen' }, h('div', { class: 'login' },
    h('div', { class: 'col', style: { gap: '20px' } },
      h('div', { class: 'logo' }, icon('basket', 38, '#fff', 1.8)),
      h('h1', { class: 'title-lg', style: { fontSize: '44px' } }, APP_NAME),
      h('p', { style: { margin: 0, fontSize: '17px', color: 'var(--ink-2)' } }, 'Eén lijst voor het hele gezin. Zet erop wat nodig is, wie winkelt vinkt af.'),
      S.joinCode ? h('div', { class: 'banner' }, icon('join', 22), h('div', { class: 'grow' }, h('b', {}, 'Je bent uitgenodigd'), 'Meld je aan om mee te doen.')) : null),
    h('div', { class: 'col', style: { gap: '14px' } },
      S.error ? h('div', { class: 'banner test' }, S.error) : null,
      h('button', { class: 'btn big block', onclick: login, html: '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.4 3-4.1 5.6-4.1z"/></svg> Aanmelden met Google' }),
      h('p', { class: 'small muted center', style: { margin: 0 } }, 'Elk gezin heeft een eigen, afgeschermde lijst.'))));
}

function renderWelcome() {
  if (S.form.joincode == null) S.form.joincode = S.joinCode || '';
  const input = h('input', { class: 'field', 'data-key': 'joincode', placeholder: 'bv. KX7-42PQ', 'aria-label': 'Uitnodigingscode', style: { letterSpacing: '.1em', textTransform: 'uppercase', fontSize: '17px' }, value: S.form.joincode, oninput: (e) => { S.form.joincode = e.target.value; } });
  return h('div', { class: 'screen' }, h('div', { class: 'main', style: { paddingTop: 'calc(56px + var(--safe-top))', gap: '20px' } },
    h('div', { class: 'col' },
      h('div', { class: 'small muted' }, 'Aangemeld als ' + (S.user.email || '')),
      h('h1', { class: 'title-lg' }, 'Welkom! Hoe wil je beginnen?')),
    h('button', { class: 'choice main', onclick: () => { S.wizard = { step: 1, name: '', shops: ['Colruyt'], pack: 0, people: [] }; render(); } },
      h('div', { class: 'ic', style: { background: 'var(--accent)' } }, icon('home', 26, '#fff')),
      h('div', { class: 'col', style: { gap: '4px' } }, h('div', { style: { fontSize: '18px', fontWeight: 700 } }, 'Nieuw gezin aanmaken'),
        h('div', { class: 'muted', style: { fontSize: '15px' } }, 'Je stelt de app in voor je gezin en nodigt daarna de anderen uit. Duurt ongeveer 3 minuten.'))),
    h('div', { class: 'card pad col', style: { gap: '14px', borderRadius: '18px' } },
      h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '14px' } },
        h('div', { class: 'choice ic', style: { padding: 0, border: 'none', background: 'var(--accent-soft)' } }, icon('join', 26, 'var(--accent-ink)')),
        h('div', { class: 'col', style: { gap: '4px' } }, h('div', { style: { fontSize: '18px', fontWeight: 700 } }, 'Ik heb een uitnodiging'),
          h('div', { class: 'muted', style: { fontSize: '15px' } }, 'Een uitnodigingslink opent vanzelf het juiste gezin. Of geef de code in:'))),
      h('div', { class: 'row' }, input,
        h('button', { class: 'btn dark', onclick: async () => { const codeVal = S.form.joincode || ''; if (!codeVal.trim()) return; S.booting = true; render(); const ok = await joinWithCode(codeVal); if (ok) { await openHousehold(S.profile.lastHousehold); loadHouseholdNames(); } else { S.booting = false; render(); } } }, 'Doe mee'))),
    S.household === null && (S.profile?.households || []).length ? h('button', { class: 'btn block', onclick: () => openHousehold(S.profile.households[0]) }, 'Terug naar mijn gezin') : null,
    h('div', { style: { marginTop: 'auto' }, class: 'row', }, h('button', { class: 'btn ghost', onclick: () => signOut(auth) }, 'Afmelden'))));
}

// ---------- Wizard ----------
function renderWizard() {
  const w = S.wizard;
  const steps = h('div', { class: 'steps' }, [1, 2, 3].map((n) => h('span', { class: n <= w.step ? 'on' : '' })));
  const head = (t, sub) => h('div', { class: 'col' }, steps, h('div', { class: 'small bold muted' }, `Stap ${w.step} van 3`), h('h1', { class: 'title' }, t), sub ? h('div', { class: 'muted', style: { fontSize: '15px' } }, sub) : null);
  const wrap = (...kids) => h('div', { class: 'screen' }, h('div', { class: 'main', style: { paddingTop: 'calc(40px + var(--safe-top))', gap: '18px', paddingBottom: 'calc(24px + var(--safe-bottom))' } }, ...kids));

  if (w.step === 1) {
    return wrap(
      head('Jullie gezin'),
      h('label', { class: 'lbl' }, 'Naam van het gezin', h('input', { class: 'field', 'data-key': 'wname', value: w.name, placeholder: 'bv. Gezin Peeters', oninput: (e) => { w.name = e.target.value; } })),
      h('div', { class: 'col' },
        h('div', { class: 'bold', style: { fontSize: '15px' } }, 'Waar doen jullie boodschappen?'),
        h('div', { class: 'small muted' }, 'Per winkel kun je later de looproute instellen.'),
        h('div', { class: 'row wrap' },
          [...new Set([...SHOPS, ...w.shops])].map((s) => h('button', { class: 'chip' + (w.shops.includes(s) ? ' on' : ''), 'aria-pressed': String(w.shops.includes(s)), style: { height: '44px' }, onclick: () => { w.shops = w.shops.includes(s) ? w.shops.filter((x) => x !== s) : [...w.shops, s]; render(); } }, s)),
          h('button', { class: 'chip dashed', style: { height: '44px' }, onclick: () => { const n = prompt('Naam van de winkel'); if (n && n.trim()) { w.shops = [...w.shops, n.trim()]; render(); } } }, '+ Andere'))),
      h('div', { class: 'col' },
        h('div', { class: 'bold', style: { fontSize: '15px' } }, 'Startcatalogus'),
        [['Standaard gezin', `ca. ${startCatalog(0).length} courante artikelen`], ['Klein huishouden', `ca. ${startCatalog(1).length} artikelen, kleinere hoeveelheden`], ['Leeg beginnen', 'zelf toevoegen of uit een spreadsheet importeren']].map(([t, s], i) =>
          h('button', { class: 'radio' + (w.pack === i ? ' on' : ''), 'aria-pressed': String(w.pack === i), onclick: () => { w.pack = i; render(); } },
            h('span', { class: 'r' }), h('span', { class: 'col', style: { gap: '2px' } }, h('span', { class: 'bold' }, t), h('span', { class: 'small muted' }, s))))),
      h('div', { class: 'row', style: { marginTop: 'auto' } },
        h('button', { class: 'btn', onclick: () => { S.wizard = null; render(); } }, 'Annuleren'),
        h('button', { class: 'btn primary big grow', onclick: () => { if (!w.name.trim()) { toast('Geef een naam voor het gezin'); return; } w.step = 2; render(); } }, 'Volgende')));
  }

  if (w.step === 2) {
    const myName = firstName(S.user.displayName);
    const cycle = (p) => { p.role = p.role === 'admin' ? 'shopper' : p.role === 'shopper' ? 'member' : 'admin'; render(); };
    return wrap(
      head('Wie doet mee?', 'Geef de namen in. Bij elke naam kies je wat die persoon mag. Tik op de rol om te wisselen.'),
      h('div', { class: 'list' },
        h('div', { class: 'row', style: { padding: '10px 12px', minHeight: '56px' } },
          h('div', { class: 'avatar', style: { background: avatarColor(uid()) } }, myName[0]),
          h('div', { class: 'grow col', style: { gap: '1px' } }, h('div', { class: 'bold' }, myName), h('div', { class: 'tiny muted' }, 'jij · ' + (S.user.email || ''))),
          h('span', { class: 'badge' }, 'Beheerder')),
        w.people.map((p, i) => h('div', { class: 'row', style: { padding: '10px 12px', minHeight: '56px' } },
          h('div', { class: 'avatar', style: { background: avatarColor(p.name + i) } }, p.name[0].toUpperCase()),
          h('div', { class: 'grow col', style: { gap: '1px' } }, h('div', { class: 'bold' }, p.name), h('div', { class: 'tiny muted' }, 'wordt uitgenodigd')),
          h('button', { class: 'btn sm soft', 'aria-label': `Rol van ${p.name}: ${ROLE_LABEL_CAP[p.role]}`, onclick: () => cycle(p) }, ROLE_LABEL_CAP[p.role], icon('down', 12)),
          h('button', { class: 'iconbtn plain', 'aria-label': `${p.name} verwijderen`, onclick: () => { w.people.splice(i, 1); render(); } }, icon('x', 18, 'var(--ink-3)')))),
        h('form', { class: 'row', style: { padding: '10px 12px' }, onsubmit: (e) => { e.preventDefault(); const nn = (S.form.pname || '').trim(); if (nn) { w.people.push({ name: nn, role: 'member' }); S.form.pname = ''; render(); } } },
          h('input', { class: 'field', 'data-key': 'pname', placeholder: 'Naam toevoegen…', 'aria-label': 'Naam toevoegen', style: { height: '44px' }, value: S.form.pname || '', oninput: (e) => { S.form.pname = e.target.value; } }),
          h('button', { class: 'qbtn plus', type: 'submit', 'aria-label': 'Toevoegen' }, '+'))),
      roleLegend(),
      h('div', { class: 'row', style: { marginTop: 'auto' } },
        h('button', { class: 'btn', onclick: () => { w.step = 1; render(); } }, 'Terug'),
        h('button', { class: 'btn primary big grow', disabled: w.busy, onclick: async () => {
          w.busy = true; render();
          try { w.hid = await createHousehold(w); w.step = 3; w.busy = false; await openHouseholdKeepWizard(w.hid); }
          catch (e) { w.busy = false; fail(e); render(); }
        } }, w.busy ? 'Bezig met aanmaken…' : 'Gezin aanmaken')));
  }

  // stap 3
  const invites = S.invites.slice().sort((a, b) => (a.personal === b.personal ? 0 : a.personal ? -1 : 1));
  return wrap(
    head('Nodig je gezin uit', 'Iedereen krijgt een eigen link. Wie die opent en zich met Google aanmeldt, komt meteen in jullie gezin terecht met de juiste rol.'),
    invites.filter((i) => i.personal).length ? h('div', { class: 'list' }, invites.filter((i) => i.personal).map((inv) => inviteRow(inv))) : h('div', { class: 'muted' }, 'Je voegde nog niemand toe. Dat kan later via Instellingen › Leden.'),
    invites.filter((i) => !i.personal).map((inv) => h('div', { class: 'card pad col', style: { alignItems: 'center', gap: '8px' } },
      h('div', { class: 'small muted' }, 'Of één code voor iedereen (wordt Lid):'),
      h('div', { class: 'code' }, inv.id),
      h('button', { class: 'btn sm soft', onclick: () => shareInvite(inv) }, icon('share', 16), 'Delen'))),
    h('button', { class: 'btn primary big block', style: { marginTop: 'auto' }, onclick: () => { S.wizard = null; S.view = 'list'; render(); } }, 'Naar de lijst'));
}
async function openHouseholdKeepWizard(hid) {
  const w = S.wizard;
  await openHousehold(hid);
  S.wizard = w;
  render();
}
function roleLegend() {
  return h('div', { class: 'col small muted', style: { gap: '4px' } },
    h('div', {}, h('b', { style: { color: 'var(--ink)' } }, 'Beheerder'), ' · alles, ook instellingen en leden'),
    h('div', {}, h('b', { style: { color: 'var(--ink)' } }, 'Winkelaar'), ' · afvinken, afronden, alle lijnen wissen'),
    h('div', {}, h('b', { style: { color: 'var(--ink)' } }, 'Lid'), ' · toevoegen, eigen lijnen aanpassen of wissen'));
}
function inviteState(inv) {
  const joined = Object.entries(S.household?.joinedVia || {}).find(([, c]) => c === inv.id);
  if (joined && S.household.members[joined[0]]) return { ok: true, text: 'Doet mee' };
  if (toDate(inv.expiresAt) < new Date()) return { ok: false, text: 'Verlopen' };
  return { ok: false, text: 'Geldig tot ' + toDate(inv.expiresAt).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' }) };
}
function inviteRow(inv, withDelete) {
  const st = inviteState(inv);
  return h('div', { class: 'row', style: { padding: '10px 12px', minHeight: '56px' } },
    h('div', { class: 'grow col', style: { gap: '2px' } },
      h('div', { class: 'bold' }, inv.name || 'Gezinscode', h('span', { class: 'muted', style: { fontWeight: 500 } }, ' · ' + ROLE_LABEL[inv.role])),
      h('div', { class: 'small', style: { color: st.ok ? 'var(--accent-ink)' : 'var(--ink-3)' } }, inv.personal ? st.text : inv.id + ' · ' + st.text)),
    st.ok ? null : h('button', { class: 'btn sm soft', onclick: () => shareInvite(inv) }, icon('share', 16), 'Delen'),
    withDelete ? h('button', { class: 'iconbtn plain', 'aria-label': 'Uitnodiging intrekken', onclick: () => revokeInvite(inv) }, icon('trash', 18, 'var(--ink-3)')) : null);
}
function shareInvite(inv) {
  const hhName = S.household?.name || '';
  const text = inv.personal
    ? `Hoi ${inv.name}! Doe mee met onze boodschappenlijst (${hhName}). Open deze link en meld je aan met Google:`
    : `Doe mee met onze boodschappenlijst (${hhName}). Open de link of gebruik code ${inv.id}:`;
  shareText(APP_NAME, text, inviteUrl(inv.id));
}
async function createInvite(name, r, personal = true) {
  const code = makeCode();
  const exp = Timestamp.fromDate(new Date(Date.now() + FEATURES.inviteDays * 864e5));
  const data = { hid: S.hid, hhName: S.household.name, name: name || '', role: r, createdBy: uid(), createdAt: serverTimestamp(), expiresAt: exp, personal };
  const b = writeBatch(db);
  b.set(doc(db, 'invites', code), data);
  b.set(hhRef('invites', code), data);
  await b.commit();
  return { id: code, ...data, expiresAt: exp };
}
function revokeInvite(inv) {
  const b = writeBatch(db);
  b.delete(doc(db, 'invites', inv.id));
  b.delete(hhRef('invites', inv.id));
  bg(b.commit());
}

// ---------- App-schil ----------
function renderApp() {
  const shopper = canShop();
  const tabs = shopper || isAdmin()
    ? [['list', 'Lijst', 'list'], ['add', 'Toevoegen', 'plus'], ['settings', 'Instellingen', 'gear']]
    : [['list', 'Lijst', 'list'], ['add', 'Toevoegen', 'plus'], ['settings', 'Profiel', 'user']];
  let body;
  if (S.view === 'add') body = renderAdd();
  else if (S.view === 'settings') body = renderSettings();
  else if (S.view === 'cards') body = renderCards();
  else if (S.view === 'history') body = renderHistory();
  else body = renderList();

  return h('div', { class: 'screen' },
    S.viewAs ? h('div', { class: 'banner test', style: { borderRadius: 0, justifyContent: 'space-between', alignItems: 'center' } },
      h('span', {}, h('b', { style: { display: 'inline' } }, 'Testweergave: '), ROLE_LABEL[S.viewAs]),
      h('button', { class: 'btn sm', onclick: () => { S.viewAs = null; render(); } }, 'Stoppen')) : null,
    h('div', { style: { flex: '1 0 auto' } }, body),
    h('div', { class: 'bottom' },
      S.view === 'list' && shopper && S.items.some((i) => i.status === 'cart')
        ? h('div', { class: 'bottom-action' }, h('button', { class: 'btn primary big block', onclick: () => openSheet({ type: 'finish' }) }, icon('check', 20, '#fff', 2.2), `Winkelen afronden (${S.items.filter((i) => i.status === 'cart').length} in de mand)`))
        : null,
      S.view === 'add' ? renderAddFooter() : null,
      h('nav', { class: 'tabs', style: { '--n': tabs.length } }, tabs.map(([v, label, ic]) =>
        h('button', { class: (S.view === v || (v === 'settings' && ['cards', 'history'].includes(S.view)) ? 'on' : ''), 'aria-current': S.view === v ? 'page' : null, onclick: () => { S.view = v; S.page = null; S.swiped = null; window.scrollTo(0, 0); render(); } }, icon(ic, 24), label)))));
}

function headerBlock(title, extra) {
  const multi = FEATURES.multiHousehold && (S.profile?.households || []).length > 1;
  const st = !S.online ? ['off', 'Offline · wijzigingen worden later verzonden'] : S.pendingWrites ? ['busy', 'Bezig met verzenden…'] : ['', 'Live bijgewerkt'];
  return h('div', { class: 'row between', style: { alignItems: 'flex-start' } },
    h('div', { class: 'col', style: { gap: '2px', minWidth: 0 } },
      FEATURES.multiHousehold
        ? h('button', { class: 'hh-switch', onclick: () => openSheet({ type: 'households' }), 'aria-label': 'Gezin wisselen' },
          h('span', { class: 'title', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, title), multi ? icon('down', 18) : null)
        : h('h1', { class: 'title' }, title),
      h('div', { class: 'status' }, h('span', { class: 'dot ' + st[0] }), st[1])),
    extra || h('span', { class: 'badge' + (canShop() ? '' : ' grey') }, `${nameOf(uid())} · ${ROLE_LABEL[role()]}`));
}

// ---------- Lijst ----------
function renderList() {
  const shopper = canShop();
  const open = S.items.filter((i) => i.status === 'open');
  const cart = S.items.filter((i) => i.status === 'cart');
  const showAll = S.filter === 'all';
  const visible = S.items.filter((i) => i.status === 'open' || (i.status === 'cart' && S.pending[i.id]));

  const groups = groupBy(visible);
  const ev = latestShoppingEvent();
  const evAt = ev && toDate(ev.at);
  const showEvent = ev && ev.by !== uid() && evAt && Date.now() - evAt.getTime() < 45 * 60e3 && S.dismissedEvent !== ev.id;
  const shop = activeShop();

  const top = h('div', { class: 'top' },
    headerBlock(S.household.name),
    shopper ? h('div', { class: 'row' },
      (S.household.shops || []).length ? h('button', { class: 'btn sm grow', style: { height: '44px', borderRadius: '12px', fontSize: '14px' }, onclick: () => openSheet({ type: 'shop' }) }, icon('route', 18, 'var(--ink-2)'), 'Route: ' + (shop || '—'), icon('down', 14)) : h('div', { class: 'grow' }),
      h('button', { class: 'btn sm soft', style: { height: '44px', borderRadius: '12px' }, onclick: announceShopping }, icon('bell', 18, 'var(--accent-ink)'), 'Ik ga winkelen'),
      S.cards.length ? h('button', { class: 'iconbtn', 'aria-label': 'Klantenkaarten', onclick: () => { S.view = 'cards'; render(); } }, icon('card', 20, 'var(--ink-2)')) : null) : null,
    !shopper ? h('div', { class: 'card', style: { padding: '10px 12px', fontSize: '14px', color: 'var(--ink-2)' } }, 'Je eigen lijnen herken je aan het potloodje. Tik erop om aan te passen, of veeg naar links om te wissen.') : null,
    showEvent ? h('div', { class: 'banner' }, icon('bell', 22, '#1F4E79'),
      h('div', { class: 'grow' }, h('b', {}, `${ev.byName || nameOf(ev.by)} gaat winkelen${ev.shop ? ' (' + ev.shop + ')' : ''}`), 'Nog iets nodig? Zet het nu op de lijst.'),
      h('button', { class: 'iconbtn plain', 'aria-label': 'Sluiten', onclick: () => { S.dismissedEvent = ev.id; store.set('dismissedEvent', ev.id); render(); } }, icon('x', 18, '#1F4E79'))) : null,
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter' },
      h('button', { class: !showAll ? 'on' : '', 'aria-pressed': String(!showAll), onclick: () => { S.filter = 'open'; store.set('filter', 'open'); render(); } }, `Nog te kopen (${open.length})`),
      h('button', { class: showAll ? 'on' : '', 'aria-pressed': String(showAll), onclick: () => { S.filter = 'all'; store.set('filter', 'all'); render(); } }, `Alles (${open.length + cart.length})`)));

  const main = h('div', { class: 'main' });
  if (!S.loaded.items) main.append(h('div', { class: 'empty' }, h('div', { class: 'spinner' })));
  else if (!visible.length && !(showAll && cart.length)) {
    main.append(h('div', { class: 'empty' }, icon('basket', 44, 'var(--muted-box)', 1.6),
      h('div', { class: 'bold', style: { color: 'var(--ink)' } }, open.length === 0 && cart.length ? 'Alles ligt in de mand!' : 'De lijst is leeg'),
      h('div', {}, open.length === 0 && cart.length && shopper ? 'Rond je winkelbeurt af met de knop onderaan.' : 'Tik op Toevoegen om iets op de lijst te zetten.')));
  }
  for (const [cat, items] of groups) {
    main.append(h('section', { class: 'section' }, h('h2', { class: 'group-h' }, cat), h('div', { class: 'list' }, items.map((it) => listRow(it)))));
  }
  if (showAll && cart.length) {
    const inCart = cart.filter((i) => !S.pending[i.id]);
    if (inCart.length) main.append(h('section', { class: 'section' }, h('h2', { class: 'group-h cart' }, `In de mand (${inCart.length})`), h('div', { class: 'list' }, inCart.map((it) => listRow(it, true)))));
  }
  return h('div', {}, top, main);
}

function groupBy(items) {
  const order = catOrder();
  const map = new Map();
  for (const it of items) {
    const c = it.category || MANUAL_CATEGORY;
    if (!map.has(c)) map.set(c, []);
    map.get(c).push(it);
  }
  const res = [...map.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  res.forEach(([, arr]) => arr.sort((a, b) => a.name.localeCompare(b.name, 'nl')));
  return res;
}

function listRow(it, cartSection) {
  const shopper = canShop();
  const inCart = it.status === 'cart';
  const pending = inCart && S.pending[it.id];
  const own = !!(it.parts && it.parts[uid()]);
  const qty = qtyOf(it);

  // veeg-acties
  const actions = [];
  if (!inCart) {
    if (shopper) actions.push(['a-miss', 'miss', it.missing ? 'Gevonden' : 'Niet gevonden', () => markMissing(it, !it.missing)]);
    if (shopper || isOwnOnly(it)) actions.push(['a-del', 'trash', 'Wissen', () => deleteLine(it)]);
    else if (own) actions.push(['a-del', 'trash', 'Mijn deel', () => removeMyPart(it)]);
  }
  const width = actions.length * 96;
  const swiped = S.swiped === it.id && width;

  let lead;
  if (shopper) {
    lead = h('button', { class: 'cb' + (inCart ? ' on' : ''), 'aria-label': (inCart ? 'Uit de mand halen: ' : 'In de mand: ') + it.name, oncontextmenu: (e) => e.preventDefault() },
      inCart ? icon('check', 17, '#fff', 3) : null);
    let timer = null, longPressed = false;
    lead.addEventListener('pointerdown', () => {
      longPressed = false;
      if (inCart || qty <= stepFor(it.unit)) return;
      timer = setTimeout(() => { longPressed = true; if (navigator.vibrate) navigator.vibrate(15); openSheet({ type: 'partial', id: it.id, n: Math.max(stepFor(it.unit), Math.round((qty / 2) / stepFor(it.unit)) * stepFor(it.unit)) }); }, 500);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => lead.addEventListener(ev, () => clearTimeout(timer)));
    lead.addEventListener('click', (e) => { e.stopPropagation(); if (longPressed) { longPressed = false; return; } inCart ? takeOutOfCart(it) : putInCart(it); });
  } else {
    lead = h('div', { class: 'mark' }, own ? h('span', { role: 'img', 'aria-label': 'Jouw lijn' }, icon('pencil', 18, 'var(--accent)')) : h('span', { class: 'd' }));
  }

  const metaBits = [];
  if (it.missing && !inCart) metaBits.push(h('span', { class: 'pill warn' }, 'Niet gevonden · ' + fmtWhen(it.missingAt)));
  if (!inCart && isNew(it)) metaBits.push(h('span', { class: 'pill new' }, 'nieuw'));
  metaBits.push(h('span', {}, inCart && !pending ? `In de mand · ${nameOf(it.cartBy)}` : `${partsText(it)} · ${fmtWhen(it.addedAt)}`));

  const content = h('div', { class: 'content' + (pending ? ' incart' : ''), style: { transform: swiped ? `translateX(-${width}px)` : '' } },
    lead,
    thumb(photoFor(it), it.category),
    h('div', { class: 'grow col', style: { gap: '2px' } },
      h('div', { class: 'iname', style: { color: cartSection ? 'var(--ink-2)' : 'var(--ink)' } }, it.name),
      it.note && !pending ? h('div', { class: 'inote' }, '“' + it.note + '”') : null,
      pending
        ? h('div', { class: 'row wrap', style: { gap: '4px 10px' } }, h('span', { class: 'small bold', style: { color: 'var(--accent-ink)', whiteSpace: 'nowrap' } }, 'In de mand'), h('button', { class: 'undo', style: { whiteSpace: 'nowrap' }, onclick: (e) => { e.stopPropagation(); takeOutOfCart(it); } }, 'Ongedaan maken'))
        : h('div', { class: 'imeta' }, metaBits)),
    h('div', { class: 'qty' }, fmtQty(qty, it.unit)));

  content.addEventListener('click', () => {
    if (content.dataset.dragged) { delete content.dataset.dragged; return; }
    if (S.swiped) { S.swiped = null; render(); return; }
    openSheet({ type: 'item', id: it.id });
  });

  const row = h('div', { class: 'lrow' },
    actions.length ? h('div', { class: 'actions', style: { width: width + 'px' }, 'aria-hidden': swiped ? null : 'true' },
      actions.map(([cls, ic, label, fn]) => h('button', { class: cls, tabindex: swiped ? null : '-1', onclick: (e) => { e.stopPropagation(); fn(); } }, icon(ic, 20, '#fff'), label))) : null,
    content);
  if (actions.length) makeSwipeable(content, it.id, width);
  return row;
}

function makeSwipeable(el, id, width) {
  let sx = 0, sy = 0, base = 0, dx = 0, active = false, decided = false;
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    active = true; decided = false; sx = e.clientX; sy = e.clientY;
    base = S.swiped === id ? -width : 0; dx = base;
  });
  el.addEventListener('pointermove', (e) => {
    if (!active) return;
    const mx = e.clientX - sx, my = e.clientY - sy;
    if (!decided) {
      if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.3) { decided = true; el.style.transition = 'none'; try { el.setPointerCapture(e.pointerId); } catch { /* */ } }
      else if (Math.abs(my) > 10) { active = false; return; }
      else return;
    }
    dx = Math.min(0, Math.max(-width - 24, base + mx));
    el.style.transform = `translateX(${dx}px)`;
  });
  const end = () => {
    if (!active) return;
    active = false;
    el.style.transition = '';
    if (decided) {
      el.dataset.dragged = '1';
      setTimeout(() => { delete el.dataset.dragged; }, 80);
      S.swiped = dx < -width / 2 ? id : null;
      el.style.transform = S.swiped ? `translateX(-${width}px)` : '';
      setTimeout(render, 220);
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

// ---------- Toevoegen ----------
function renderAdd() {
  const onList = new Map();
  for (const i of S.items) if (i.status === 'open') onList.set(norm(i.name) + '|' + (i.unit || ''), i);
  const basis = S.catalog.filter((c) => c.basis);
  const basisMissing = basis.filter((c) => !onList.has(norm(c.name) + '|' + (c.unit || '')));
  const cats = ['Alles', ...catOrder().filter((c) => c !== MANUAL_CATEGORY && S.catalog.some((x) => x.category === c))];
  const q = norm(S.search);
  let list = S.catalog.filter((c) => (q ? norm(c.name).includes(q) : (S.chip === 'Alles' || c.category === S.chip)));
  const order = catOrder();
  list.sort((a, b) => (order.indexOf(a.category) - order.indexOf(b.category)) || a.name.localeCompare(b.name, 'nl'));
  const shown = list.slice(0, 400);

  const top = h('div', { class: 'top' },
    h('h1', { class: 'title' }, 'Toevoegen'),
    h('label', { class: 'search' }, icon('search', 20, 'var(--ink-3)'),
      h('input', { 'data-key': 'search', placeholder: 'Zoek in catalogus…', 'aria-label': 'Zoek in catalogus', value: S.search, oninput: (e) => { S.search = e.target.value; render(); } }),
      S.search ? h('button', { class: 'iconbtn plain', style: { width: '32px', height: '32px' }, 'aria-label': 'Wissen', onclick: (e) => { e.preventDefault(); S.search = ''; render(); } }, icon('x', 16)) : null),
    !q && cats.length > 1 ? h('div', { class: 'chips' }, cats.map((c) => h('button', { class: 'chip' + (S.chip === c ? ' on' : ''), onclick: () => { S.chip = c; render(); } }, c))) : null);

  const main = h('div', { class: 'main' });
  if (!q && basis.length) {
    main.append(h('button', { class: 'btn block', style: { borderStyle: 'dashed', borderColor: 'var(--accent)', color: 'var(--accent-ink)' }, disabled: !basisMissing.length, onclick: () => {
      for (const c of basisMissing) stageEntry({ name: c.name, unit: c.unit, category: c.category, catalogId: c.id, photo: c.photo || '', qty: c.std || 1 });
      toast(`${basisMissing.length} basisartikelen klaargezet`); render();
    } }, icon('star', 18, 'var(--accent-ink)'), basisMissing.length ? `Basispakket toevoegen · ${basisMissing.length} van ${basis.length} ontbreken` : 'Basispakket staat al op de lijst'));
  }
  if (!q && S.dishes.length) {
    main.append(h('section', { class: 'section' }, h('h2', { class: 'group-h' }, 'Gerechten'),
      h('div', { class: 'chips' }, S.dishes.slice().sort((a, b) => a.name.localeCompare(b.name, 'nl')).map((d) =>
        h('button', { class: 'card', style: { flex: 'none', minHeight: '52px', padding: '6px 14px', textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'center' }, onclick: () => openSheet({ type: 'dish', id: d.id, sel: null }) },
          h('span', { class: 'bold', style: { fontSize: '15px' } }, d.name), h('span', { class: 'tiny muted' }, `${(d.items || []).length} ingrediënten`))))));
  }

  if (shown.length) {
    main.append(h('div', { class: 'list' }, shown.map((c) => catalogRow(c, onList))));
    if (list.length > shown.length) main.append(h('div', { class: 'small muted center' }, `${list.length - shown.length} meer · kies een categorie of zoek`));
  } else if (q) {
    main.append(h('div', { class: 'muted center', style: { padding: '12px' } }, `“${S.search}” staat niet in de catalogus. Voeg het hieronder manueel toe.`));
  } else if (!S.catalog.length) {
    main.append(h('div', { class: 'muted center', style: { padding: '12px' } }, isAdmin() ? 'De catalogus is nog leeg. Voeg artikelen toe via Instellingen › Catalogus, of manueel hieronder.' : 'De catalogus is nog leeg. Voeg hieronder manueel iets toe.'));
  }

  // manueel
  const m = S.manual;
  if (q && !m.touched) m.name = S.search;
  const recent = [];
  const seen = new Set(S.catalog.map((c) => norm(c.name)));
  for (const x of [...S.items.filter((i) => !i.catalogId), ...S.history]) {
    const n = norm(x.name);
    if (!n || seen.has(n)) continue;
    seen.add(n); recent.push(x);
    if (recent.length >= 10) break;
  }
  main.append(h('section', { class: 'section' },
    h('h2', { class: 'group-h' }, 'Iets anders'),
    h('form', { class: 'col', onsubmit: (e) => { e.preventDefault(); if (!m.name.trim()) return; stageEntry({ name: m.name.trim(), unit: m.unit, category: MANUAL_CATEGORY, catalogId: '', photo: '', qty: Number(m.qty) || 1, note: m.note || '' }); toast(`${m.name.trim()} klaargezet`); S.manual = { name: '', qty: 1, unit: 'stuk' }; S.search = ''; render(); } },
      h('div', { class: 'row' },
        h('input', { class: 'field', 'data-key': 'mname', placeholder: 'Eigen artikel, bv. verjaardagstaart', 'aria-label': 'Eigen artikel', value: m.name, oninput: (e) => { m.name = e.target.value; m.touched = true; } }),
        h('input', { class: 'field', 'data-key': 'mqty', inputmode: 'decimal', 'aria-label': 'Hoeveelheid', style: { width: '64px', textAlign: 'center', padding: '0 6px' }, value: String(m.qty), oninput: (e) => { m.qty = e.target.value.replace(',', '.'); } })),
      h('div', { class: 'row' },
        h('select', { class: 'field', 'aria-label': 'Eenheid', style: { width: '120px', flex: 'none' }, onchange: (e) => { m.unit = e.target.value; } }, UNITS.map((u) => h('option', { value: u, selected: m.unit === u ? true : null }, u))),
        h('input', { class: 'field', 'data-key': 'mnote', placeholder: 'Opmerking (optioneel)', 'aria-label': 'Opmerking', value: m.note || '', oninput: (e) => { m.note = e.target.value; } }),
        h('button', { class: 'qbtn plus', type: 'submit', 'aria-label': 'Eigen artikel klaarzetten' }, '+'))),
    recent.length ? h('div', { class: 'row wrap' }, h('span', { class: 'small muted' }, 'Recent:'),
      recent.map((r) => h('button', { class: 'chip dashed', style: { height: '36px' }, onclick: () => { stageEntry({ name: r.name, unit: r.unit || 'stuk', category: MANUAL_CATEGORY, catalogId: '', photo: '', qty: 1 }); toast(`${r.name} klaargezet`); render(); } }, r.name))) : null));

  const extraStaged = Object.values(S.staged).filter((s) => !s.catalogId || !shown.some((c) => c.id === s.catalogId));
  if (extraStaged.length) {
    main.append(h('section', { class: 'section' }, h('h2', { class: 'group-h cart' }, 'Klaargezet'),
      h('div', { class: 'list' }, extraStaged.map((s) => h('div', { class: 'crow' },
        thumb(s.photo, s.category, true),
        h('div', { class: 'grow col', style: { gap: '1px' } }, h('div', { class: 'bold' }, s.name), s.note ? h('div', { class: 'inote' }, '“' + s.note + '”') : null),
        h('div', { class: 'qv' }, fmtQty(s.qty, s.unit)),
        h('button', { class: 'iconbtn plain', 'aria-label': `${s.name} niet toevoegen`, onclick: () => { delete S.staged[stageKey(s.name, s.unit)]; render(); } }, icon('x', 18, 'var(--ink-3)')))))));
  }
  return h('div', {}, top, main);
}

function catalogRow(c, onList) {
  const k = stageKey(c.name, c.unit);
  const st = S.staged[k];
  const n = st ? st.qty : 0;
  const existing = onList.get(norm(c.name) + '|' + (c.unit || ''));
  const lb = lastBought(c.name);
  let sub = existing ? `al op lijst: ${fmtQty(qtyOf(existing), c.unit)}${existing.note ? ' · “' + existing.note + '”' : ''}` : (c.basis ? 'basis' : '');
  if (!existing && lb) sub = (sub ? sub + ' · ' : '') + `laatst gekocht ${fmtWhen(lb.at).replace(/ \d\d:\d\d$/, '')}`;
  const noteOpen = S.noteOpen === k;
  return h('div', { class: 'col', style: { gap: 0 } },
    h('div', { class: 'crow' },
      thumb(c.photo, c.category, true),
      h('div', { class: 'grow col', style: { gap: '1px' } },
        h('div', { class: 'bold', style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, c.name),
        sub ? h('div', { class: 'small muted' }, sub) : null,
        st && st.note && !noteOpen ? h('div', { class: 'inote' }, '“' + st.note + '”') : null),
      h('button', { class: 'iconbtn plain', style: { width: '36px' }, 'aria-label': `Opmerking bij ${c.name}`, onclick: () => { S.noteOpen = noteOpen ? null : k; if (!S.staged[k]) S.staged[k] = { name: c.name, unit: c.unit, category: c.category, catalogId: c.id, photo: c.photo || '', note: '', qty: 0 }; render(); } }, icon('pencil', 18, noteOpen || (st && st.note) ? 'var(--accent)' : 'var(--ink-3)')),
      n ? h('button', { class: 'qbtn', 'aria-label': `Minder ${c.name}`, onclick: () => stageCatalog(c, -1) }, '−') : null,
      n ? h('div', { class: 'qv' }, fmtQty(n, c.unit)) : null,
      h('button', { class: 'qbtn plus', 'aria-label': `Meer ${c.name}`, onclick: () => stageCatalog(c, 1) }, '+')),
    noteOpen ? h('div', { style: { padding: '0 12px 10px' } },
      h('input', { class: 'field', 'data-key': 'note-' + k, placeholder: 'Opmerking, bv. merk of formaat', 'aria-label': 'Opmerking', value: (st && st.note) || '', style: { height: '42px', borderColor: 'var(--accent)' }, oninput: (e) => { S.staged[k].note = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter') { S.noteOpen = null; if (S.staged[k] && !S.staged[k].qty && !S.staged[k].note) delete S.staged[k]; render(); } } })) : null);
}

function renderAddFooter() {
  const n = Object.values(S.staged).filter((s) => s.qty > 0).length;
  return h('div', { class: 'bottom-action' },
    h('button', { class: 'btn primary big block', disabled: !n, onclick: commitStaged }, n ? `${n} ${n === 1 ? 'artikel' : 'artikelen'} op de lijst zetten` : 'Kies artikelen om toe te voegen'));
}

// ---------- Klantenkaarten ----------
let barcodeLib = null;
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.append(s); });
}
function renderCards() {
  const sel = Math.min(S.cardSel || 0, Math.max(0, S.cards.length - 1));
  const card = S.cards[sel];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Streepjescode');
  if (card) {
    const draw = () => {
      try {
        const digits = String(card.number).replace(/\s/g, '');
        const fmt = /^\d{13}$/.test(digits) ? 'EAN13' : 'CODE128';
        window.JsBarcode(svg, digits, { format: fmt, width: 2.4, height: 110, displayValue: true, fontSize: 18, margin: 0 });
      } catch { svg.replaceWith(h('div', { class: 'muted' }, 'Ongeldig kaartnummer')); }
    };
    if (window.JsBarcode) setTimeout(draw);
    else (barcodeLib ||= loadScript('https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js')).then(draw).catch(() => {});
  }
  return h('div', {},
    h('div', { class: 'top' }, h('div', { class: 'row' }, h('button', { class: 'iconbtn plain', 'aria-label': 'Terug', onclick: () => { S.view = 'list'; render(); } }, icon('back', 22)), h('h1', { class: 'title' }, 'Klantenkaarten'))),
    h('div', { class: 'main' },
      !S.cards.length ? h('div', { class: 'empty' }, 'Nog geen kaarten. Een beheerder voegt ze toe via Instellingen › Klantenkaarten.') : [
        h('div', { class: 'chips', role: 'tablist' }, S.cards.map((c, i) => h('button', { class: 'chip' + (i === sel ? ' on' : ''), role: 'tab', 'aria-selected': String(i === sel), style: { height: '44px' }, onclick: () => { S.cardSel = i; render(); } }, c.shop))),
        h('div', { class: 'card pad col', style: { alignItems: 'center', gap: '14px', padding: '24px 16px' } },
          h('div', { class: 'title', style: { fontSize: '24px' } }, card.shop),
          h('div', { class: 'barcode', style: { width: '100%' } }, svg),
          card.holder ? h('div', { class: 'muted' }, 'Op naam van ' + card.holder) : null),
        h('p', { class: 'small muted' }, 'Tip: zet je scherm helder voor het scannen aan de kassa.')
      ]));
}

// ---------- Historiek ----------
function renderHistory() {
  const days = new Map();
  for (const x of S.history) {
    const k = fmtDay(x.at);
    if (!days.has(k)) days.set(k, []);
    days.get(k).push(x);
  }
  return h('div', {},
    h('div', { class: 'top' }, h('div', { class: 'row' }, h('button', { class: 'iconbtn plain', 'aria-label': 'Terug', onclick: () => { S.view = 'settings'; render(); } }, icon('back', 22)), h('h1', { class: 'title' }, 'Recent gekocht & gewist'))),
    h('div', { class: 'main' },
      !S.history.length ? h('div', { class: 'empty' }, 'Nog niets in de historiek.') : null,
      [...days.entries()].slice(0, 30).map(([day, arr]) => h('section', { class: 'section' }, h('h2', { class: 'group-h' }, day),
        h('div', { class: 'list' }, arr.map((x) => h('div', { class: 'crow' },
          h('div', { class: 'grow col', style: { gap: '1px' } },
            h('div', { class: 'bold' }, x.name, h('span', { class: 'muted', style: { fontWeight: 500 } }, ' · ' + fmtQty(x.qty || 1, x.unit))),
            h('div', { class: 'small muted' }, (x.action === 'bought' ? 'gekocht door ' : 'gewist door ') + nameOf(x.by) + ' · ' + fmtWhen(x.at))),
          canShop() ? h('button', { class: 'btn sm', onclick: () => restoreFromHistory(x) }, 'Terugzetten') : null)))))));
}

// ---------- Instellingen ----------
function renderSettings() {
  if (S.page) return renderSettingsPage();
  const admin = isAdmin();
  const shopper = canShop();
  const nav = (label, sub, page, ic) => h('button', { class: 'navrow', onclick: () => { if (page === 'history' || page === 'cards') { S.view = page; } else S.page = page; window.scrollTo(0, 0); render(); } },
    icon(ic, 22, 'var(--ink-2)'), h('div', { class: 'grow' }, h('span', { class: 'bold' }, label), sub ? h('span', { class: 'small muted' }, sub) : null), icon('right', 18, 'var(--ink-3)'));
  const memberCount = Object.keys(S.household.members || {}).length;
  return h('div', {},
    h('div', { class: 'top' }, headerBlock(admin || shopper ? 'Instellingen' : 'Profiel', h('span', {}))),
    h('div', { class: 'main' },
      h('div', { class: 'card pad row' },
        h('div', { class: 'avatar', style: { background: avatarColor(uid()), width: '44px', height: '44px', fontSize: '17px' } }, nameOf(uid())[0]),
        h('div', { class: 'grow col', style: { gap: '1px' } }, h('div', { class: 'bold' }, nameOf(uid())), h('div', { class: 'small muted' }, `${S.user.email} · ${ROLE_LABEL[realRole()]} in ${S.household.name}`))),
      admin ? h('div', { class: 'list' },
        nav('Leden & uitnodigingen', `${memberCount} ${memberCount === 1 ? 'lid' : 'leden'}`, 'members', 'join'),
        nav('Winkels & looproute', (S.household.shops || []).join(', ') || 'nog geen winkels', 'shops', 'route'),
        nav('Catalogus', `${S.catalog.length} artikelen`, 'catalog', 'jar'),
        nav('Gerechten', `${S.dishes.length} gerechten`, 'dishes', 'bread'),
        nav('Klantenkaarten', `${S.cards.length} kaarten`, 'cardsAdmin', 'card'),
        nav('Importeren uit spreadsheet', 'Excel (.xlsx) of CSV', 'import', 'upload')) : null,
      shopper ? h('div', { class: 'list' },
        nav('Recent gekocht & gewist', 'terugzetten wat per ongeluk weg is', 'history', 'clock'),
        S.cards.length ? nav('Klantenkaarten tonen', null, 'cards', 'card') : null) : null,
      h('div', { class: 'list' },
        FEATURES.multiHousehold ? nav('Gezin wisselen of toevoegen', `${(S.profile.households || []).length} ${(S.profile.households || []).length === 1 ? 'gezin' : 'gezinnen'}`, 'households', 'home') : null,
        nav('Meldingen', 'Notification' in window ? ({ granted: 'aan', denied: 'geblokkeerd in je browser', default: 'uit' }[Notification.permission]) : 'niet ondersteund op dit toestel', 'notify', 'bell'),
        realRole() !== 'member' ? nav('Bekijk als…', 'testweergave voor een andere rol', 'viewas', 'user') : null,
        nav('Account & privacy', null, 'account', 'user')),
      h('button', { class: 'btn block', onclick: () => signOut(auth) }, 'Afmelden'),
      h('div', { class: 'tiny muted center' }, `${APP_NAME} · versie ${window.APP_VERSION || ''}`)));
}

function subHead(title) {
  return h('div', { class: 'top' }, h('div', { class: 'row' }, h('button', { class: 'iconbtn plain', 'aria-label': 'Terug', onclick: () => { S.page = null; render(); } }, icon('back', 22)), h('h1', { class: 'title', style: { fontSize: '24px' } }, title)));
}

function renderSettingsPage() {
  const p = S.page;
  if (p === 'members') return pageMembers();
  if (p === 'shops') return pageShops();
  if (p === 'catalog') return pageCatalog();
  if (p === 'dishes') return pageDishes();
  if (p === 'cardsAdmin') return pageCardsAdmin();
  if (p === 'import') return pageImport();
  if (p === 'households') return pageHouseholds();
  if (p === 'notify') return pageNotify();
  if (p === 'viewas') return pageViewAs();
  if (p === 'account') return pageAccount();
  S.page = null; return renderSettings();
}

function pageMembers() {
  const hh = S.household;
  const members = Object.entries(hh.members || {}).sort((a, b) => nameOf(a[0]).localeCompare(nameOf(b[0]), 'nl'));
  const admins = members.filter(([, r]) => r === 'admin').length;
  const pendingInv = S.invites.filter((i) => i.personal && !inviteState(i).ok);
  const groupInv = S.invites.filter((i) => !i.personal);
  if (!S.form.invrole) S.form.invrole = 'member';
  return h('div', {}, subHead('Leden & uitnodigingen'), h('div', { class: 'main' },
    h('div', { class: 'list' }, members.map(([u, r]) => h('div', { class: 'row', style: { padding: '10px 12px', minHeight: '56px' } },
      h('div', { class: 'avatar', style: { background: avatarColor(u) } }, nameOf(u)[0]),
      h('div', { class: 'grow col', style: { gap: '1px' } }, h('div', { class: 'bold' }, nameOf(u) + (u === uid() ? ' (jij)' : ''))),
      h('select', { class: 'field', style: { width: '136px', height: '40px', fontSize: '14px' }, 'aria-label': `Rol van ${nameOf(u)}`, disabled: u === uid() && admins === 1 ? true : null,
        onchange: (e) => bg(updateDoc(hhRef(), { ['members.' + u]: e.target.value })) },
        ['admin', 'shopper', 'member'].map((x) => h('option', { value: x, selected: x === r ? true : null }, ROLE_LABEL_CAP[x]))),
      u !== uid() ? h('button', { class: 'iconbtn plain', 'aria-label': `${nameOf(u)} uit het gezin verwijderen`, onclick: () => {
        if (!confirm(`${nameOf(u)} uit het gezin verwijderen?`)) return;
        bg(updateDoc(hhRef(), { ['members.' + u]: deleteField() }));
      } }, icon('trash', 18, 'var(--ink-3)')) : null))),
    roleLegend(),
    h('section', { class: 'section' }, h('h2', { class: 'group-h' }, 'Iemand uitnodigen'),
      h('form', { class: 'card pad col', onsubmit: async (e) => {
        e.preventDefault();
        const nn = (S.form.invname || '').trim();
        if (!nn) { toast('Geef een naam'); return; }
        try { const inv = await createInvite(nn, S.form.invrole, true); S.form.invname = ''; render(); shareInvite(inv); } catch (err) { fail(err); }
      } },
        h('input', { class: 'field', 'data-key': 'invname', placeholder: 'Naam', 'aria-label': 'Naam', value: S.form.invname || '', oninput: (e) => { S.form.invname = e.target.value; } }),
        h('div', { class: 'row' },
          h('select', { class: 'field', 'aria-label': 'Rol', onchange: (e) => { S.form.invrole = e.target.value; } }, ['member', 'shopper', 'admin'].map((x) => h('option', { value: x, selected: S.form.invrole === x ? true : null }, ROLE_LABEL_CAP[x]))),
          h('button', { class: 'btn primary', type: 'submit' }, icon('share', 18, '#fff'), 'Uitnodigen')))),
    pendingInv.length ? h('section', { class: 'section' }, h('h2', { class: 'group-h' }, 'Openstaande uitnodigingen'), h('div', { class: 'list' }, pendingInv.map((i) => inviteRow(i, true)))) : null,
    h('section', { class: 'section' }, h('h2', { class: 'group-h' }, 'Gezinscode (wordt Lid)'),
      groupInv.length ? h('div', { class: 'list' }, groupInv.map((i) => inviteRow(i, true))) : null,
      h('button', { class: 'btn block', onclick: async () => { try { for (const g of groupInv) revokeInvite(g); const inv = await createInvite('', 'member', false); toast('Nieuwe code: ' + inv.id); } catch (e) { fail(e); } } }, groupInv.length ? 'Nieuwe code maken (oude vervalt)' : 'Gezinscode maken'))));
}

function pageShops() {
  const hh = S.household;
  const shops = hh.shops || [];
  const sel = S.routeShop && shops.includes(S.routeShop) ? S.routeShop : shops[0];
  const route = (sel && hh.routes?.[sel]) || hh.categories || CATEGORIES;
  const full = [...route, ...allCategories().filter((c) => !route.includes(c))];
  const move = (i, d) => {
    const arr = full.slice(); const j = i + d; if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    bg(updateDoc(hhRef(), { ['routes.' + sel]: arr }));
  };
  return h('div', {}, subHead('Winkels & looproute'), h('div', { class: 'main' },
    h('div', { class: 'row wrap' },
      shops.map((s) => h('span', { class: 'chip on', style: { display: 'inline-flex', alignItems: 'center', gap: '6px', height: '40px' } }, s,
        h('button', { class: 'iconbtn plain', style: { width: '24px', height: '24px', color: '#fff' }, 'aria-label': `${s} verwijderen`, onclick: () => { if (confirm(`${s} verwijderen?`)) bg(updateDoc(hhRef(), { shops: arrayRemove(s) })); } }, icon('x', 14, '#fff')))),
      [...SHOPS].filter((s) => !shops.includes(s)).map((s) => h('button', { class: 'chip', style: { height: '40px' }, onclick: () => bg(updateDoc(hhRef(), { shops: arrayUnion(s) })) }, '+ ' + s)),
      h('button', { class: 'chip dashed', style: { height: '40px' }, onclick: () => { const n = prompt('Naam van de winkel'); if (n && n.trim()) bg(updateDoc(hhRef(), { shops: arrayUnion(n.trim()) })); } }, '+ Andere')),
    sel ? h('section', { class: 'section' },
      h('h2', { class: 'group-h' }, 'Looproute'),
      h('div', { class: 'small muted' }, 'Zet de categorieën in de volgorde waarin je door de winkel loopt.'),
      shops.length > 1 ? h('div', { class: 'chips' }, shops.map((s) => h('button', { class: 'chip' + (s === sel ? ' on' : ''), onclick: () => { S.routeShop = s; render(); } }, s))) : null,
      h('div', { class: 'list' }, full.map((c, i) => h('div', { class: 'row', style: { padding: '6px 8px 6px 14px', minHeight: '52px' } },
        h('span', { class: 'muted bold', style: { width: '24px' } }, String(i + 1)),
        h('span', { class: 'grow' }, c),
        h('button', { class: 'iconbtn plain', 'aria-label': `${c} omhoog`, disabled: i === 0 ? true : null, onclick: () => move(i, -1) }, icon('up', 20)),
        h('button', { class: 'iconbtn plain', 'aria-label': `${c} omlaag`, disabled: i === full.length - 1 ? true : null, onclick: () => move(i, 1) }, icon('down', 20)))))) : h('div', { class: 'muted' }, 'Voeg eerst een winkel toe.')));
}

function pageCatalog() {
  const q = norm(S.catSearch || '');
  const order = catOrder();
  const list = S.catalog.filter((c) => !q || norm(c.name).includes(q) || norm(c.category).includes(q))
    .sort((a, b) => (order.indexOf(a.category) - order.indexOf(b.category)) || a.name.localeCompare(b.name, 'nl'));
  return h('div', {}, subHead('Catalogus'), h('div', { class: 'main' },
    h('div', { class: 'row' },
      h('label', { class: 'search grow' }, icon('search', 20, 'var(--ink-3)'), h('input', { 'data-key': 'catsearch', placeholder: 'Zoeken…', 'aria-label': 'Zoeken in catalogus', value: S.catSearch || '', oninput: (e) => { S.catSearch = e.target.value; render(); } })),
      h('button', { class: 'btn primary', onclick: () => openSheet({ type: 'catEdit', data: { name: '', category: allCategories()[0], unit: 'stuk', std: 1, basis: false, photo: '', shopNr: '', link: '' } }) }, '+ Artikel')),
    h('div', { class: 'small muted' }, `${S.catalog.length} artikelen · tik om te wijzigen`),
    h('div', { class: 'list' }, list.map((c) => h('button', { class: 'navrow', onclick: () => openSheet({ type: 'catEdit', id: c.id, data: { ...c } }) },
      thumb(c.photo, c.category, true),
      h('div', { class: 'grow' }, h('span', { class: 'bold' }, c.name + (c.basis ? ' ★' : '')), h('span', { class: 'small muted' }, `${c.category} · ${fmtQty(c.std || 1, c.unit)}${c.shopNr ? ' · nr ' + c.shopNr : ''}`)),
      icon('right', 18, 'var(--ink-3)'))))));
}

function pageDishes() {
  return h('div', {}, subHead('Gerechten'), h('div', { class: 'main' },
    h('button', { class: 'btn primary block', onclick: () => openSheet({ type: 'dishEdit', data: { name: '', items: [{ name: '', qty: 1, unit: 'stuk' }] } }) }, '+ Gerecht'),
    S.dishes.length ? h('div', { class: 'list' }, S.dishes.slice().sort((a, b) => a.name.localeCompare(b.name, 'nl')).map((d) => h('button', { class: 'navrow', onclick: () => openSheet({ type: 'dishEdit', id: d.id, data: JSON.parse(JSON.stringify({ name: d.name, items: d.items || [] })) }) },
      h('div', { class: 'grow' }, h('span', { class: 'bold' }, d.name), h('span', { class: 'small muted' }, (d.items || []).map((x) => x.name).join(', '))), icon('right', 18, 'var(--ink-3)')))) : h('div', { class: 'muted' }, 'Nog geen gerechten.')));
}

function pageCardsAdmin() {
  return h('div', {}, subHead('Klantenkaarten'), h('div', { class: 'main' },
    h('button', { class: 'btn primary block', onclick: () => openSheet({ type: 'cardEdit', data: { shop: (S.household.shops || [])[0] || '', number: '', holder: '' } }) }, '+ Kaart'),
    S.cards.length ? h('div', { class: 'list' }, S.cards.map((c) => h('button', { class: 'navrow', onclick: () => openSheet({ type: 'cardEdit', id: c.id, data: { ...c } }) },
      icon('card', 22, 'var(--ink-2)'), h('div', { class: 'grow' }, h('span', { class: 'bold' }, c.shop), h('span', { class: 'small muted' }, `${c.number}${c.holder ? ' · ' + c.holder : ''}`)), icon('right', 18, 'var(--ink-3)')))) : h('div', { class: 'muted' }, 'Nog geen kaarten. Het nummer staat meestal onder de streepjescode op je kaart.')));
}

function pageHouseholds() {
  const list = S.profile.households || [];
  const others = Object.keys(S.household.members || {}).filter((u) => u !== uid());
  const otherAdmins = others.filter((u) => S.household.members[u] === 'admin');
  return h('div', {}, subHead('Gezinnen'), h('div', { class: 'main' },
    h('div', { class: 'list' }, list.map((hid) => h('button', { class: 'navrow', onclick: () => { if (hid !== S.hid) openHousehold(hid); else { S.page = null; render(); } } },
      icon(hid === S.hid ? 'check' : 'home', 20, hid === S.hid ? 'var(--accent)' : 'var(--ink-2)'),
      h('div', { class: 'grow' }, h('span', { class: 'bold' }, S.hhNames[hid] || '…'), hid === S.hid ? h('span', { class: 'small muted' }, 'huidig gezin') : null)))),
    h('button', { class: 'btn primary block', onclick: () => { S.wizard = { step: 1, name: '', shops: ['Colruyt'], pack: 0, people: [] }; render(); } }, icon('home', 18, '#fff'), 'Nieuw gezin aanmaken'),
    h('form', { class: 'row', onsubmit: async (e) => { e.preventDefault(); const code = S.form.hhcode || ''; if (!code.trim()) return; S.form.hhcode = ''; const ok = await joinWithCode(code); if (ok) { await openHousehold(S.profile.lastHousehold); loadHouseholdNames(); } } },
      h('input', { class: 'field', 'data-key': 'hhcode', placeholder: 'Uitnodigingscode', 'aria-label': 'Uitnodigingscode', style: { textTransform: 'uppercase' }, value: S.form.hhcode || '', oninput: (e) => { S.form.hhcode = e.target.value; } }),
      h('button', { class: 'btn dark', type: 'submit' }, 'Doe mee')),
    h('section', { class: 'section', style: { marginTop: '12px' } }, h('h2', { class: 'group-h' }, S.household.name),
      realRole() === 'admin' && !others.length
        ? h('button', { class: 'btn danger block', onclick: deleteHouseholdFlow }, 'Gezin verwijderen')
        : realRole() === 'admin' && !otherAdmins.length
          ? h('div', { class: 'small muted' }, 'Je bent de enige beheerder. Maak eerst iemand anders beheerder voor je het gezin verlaat, of verwijder de andere leden om het gezin te verwijderen.')
          : h('button', { class: 'btn danger block', onclick: leaveHouseholdFlow }, 'Dit gezin verlaten'),
      realRole() === 'admin' && others.length ? h('button', { class: 'btn danger block', onclick: deleteHouseholdFlow }, 'Gezin verwijderen (voor iedereen)') : null)));
}

async function leaveHouseholdFlow() {
  if (!confirm(`Wil je ${S.household.name} verlaten?`)) return;
  const hid = S.hid, me = uid();
  try {
    stopSubs();
    await updateDoc(doc(db, 'households', hid), { ['members.' + me]: deleteField() });
    await updateDoc(doc(db, 'users', me), { households: arrayRemove(hid) });
    S.profile.households = (S.profile.households || []).filter((x) => x !== hid);
    S.household = null; S.hid = null;
    if (S.profile.households[0]) await openHousehold(S.profile.households[0]); else render();
  } catch (e) { fail(e); }
}

async function deleteHouseholdFlow() {
  if (!confirm(`${S.household.name} definitief verwijderen? De lijst, catalogus en historiek gaan verloren voor alle leden.`)) return;
  const hid = S.hid, me = uid();
  try {
    toast('Bezig met verwijderen…');
    stopSubs();
    for (const c of ['items', 'catalog', 'dishes', 'cards', 'history', 'events', 'invites']) {
      const snap = await getDocs(collection(db, 'households', hid, c));
      const ops = [];
      snap.docs.forEach((d) => {
        ops.push((b) => b.delete(d.ref));
        if (c === 'invites') ops.push((b) => b.delete(doc(db, 'invites', d.id)));
      });
      await commitInChunks(ops);
    }
    const b = writeBatch(db);
    b.delete(doc(db, 'households', hid));
    await b.commit();
    await updateDoc(doc(db, 'users', me), { households: arrayRemove(hid) });
    S.profile.households = (S.profile.households || []).filter((x) => x !== hid);
    S.household = null; S.hid = null; S.page = null;
    toast('Gezin verwijderd');
    if (S.profile.households[0]) await openHousehold(S.profile.households[0]); else render();
  } catch (e) { fail(e); }
}

function pageNotify() {
  const supported = 'Notification' in window;
  return h('div', {}, subHead('Meldingen'), h('div', { class: 'main' },
    h('div', { class: 'card pad col' },
      h('div', {}, 'Wanneer iemand op “Ik ga winkelen” tikt, verschijnt er bovenaan de lijst een melding.'),
      h('div', { class: 'small muted' }, 'Sta je meldingen toe, dan krijg je ook een systeemmelding zolang de app op de achtergrond openstaat. Op iPhone werkt dat alleen als de app op het beginscherm staat (iOS 16.4 of nieuwer).'),
      !supported ? h('div', { class: 'pill warn' }, 'Niet ondersteund op dit toestel of in deze browser')
        : Notification.permission === 'granted' ? h('div', { class: 'pill ok' }, 'Meldingen staan aan')
          : Notification.permission === 'denied' ? h('div', { class: 'small' }, 'Meldingen zijn geblokkeerd. Zet ze aan in de instellingen van je browser of telefoon.')
            : h('button', { class: 'btn primary', onclick: async () => { await Notification.requestPermission(); render(); } }, 'Meldingen toestaan'))));
}

function pageViewAs() {
  const opts = realRole() === 'admin' ? ['shopper', 'member'] : ['member'];
  return h('div', {}, subHead('Bekijk als…'), h('div', { class: 'main' },
    h('div', { class: 'muted' }, 'Zie hoe de app eruitziet voor een andere rol. Dit verandert alleen de weergave: achter de schermen blijf je ' + ROLE_LABEL[realRole()] + '. Om de rechten echt te testen gebruik je een tweede Google-account (zie het stappenplan).'),
    opts.map((r) => h('button', { class: 'radio' + (S.viewAs === r ? ' on' : ''), onclick: () => { S.viewAs = r; S.page = null; S.view = 'list'; render(); } }, h('span', { class: 'r' }), h('span', { class: 'bold' }, ROLE_LABEL_CAP[r]))),
    S.viewAs ? h('button', { class: 'btn block', onclick: () => { S.viewAs = null; render(); } }, 'Testweergave stoppen') : null));
}

function pageAccount() {
  return h('div', {}, subHead('Account & privacy'), h('div', { class: 'main' },
    h('div', { class: 'card pad col' },
      h('div', { class: 'bold' }, 'Wat bewaart de app?'),
      h('div', { class: 'small' }, 'Je naam en e-mailadres van Google, de gezinnen waarin je zit, en de artikelen die je toevoegt of afvinkt. Alles staat in een Firebase-database van de beheerder van deze app. Leden van een gezin zien alleen de gegevens van hun eigen gezin. Er worden geen gegevens verkocht of gedeeld en er is geen reclame.')),
    h('div', { class: 'card pad col' },
      h('div', { class: 'bold' }, 'Account verwijderen'),
      h('div', { class: 'small' }, 'Je verlaat al je gezinnen (gezinnen waar je alleen in zit worden verwijderd) en je account wordt gewist.'),
      h('button', { class: 'btn danger', onclick: deleteAccountFlow }, 'Mijn account verwijderen'))));
}

async function deleteAccountFlow() {
  if (!confirm('Je account en je gegevens definitief verwijderen?')) return;
  const me = uid();
  try {
    for (const hid of [...(S.profile.households || [])]) {
      const s = await getDoc(doc(db, 'households', hid)).catch(() => null);
      if (!s || !s.exists()) continue;
      const m = s.data().members || {};
      const others = Object.keys(m).filter((u) => u !== me);
      if (m[me] === 'admin' && others.length && !others.some((u) => m[u] === 'admin')) {
        toast(`Maak eerst iemand anders beheerder van ${s.data().name}.`);
        return;
      }
    }
    stopSubs();
    for (const hid of [...(S.profile.households || [])]) {
      const s = await getDoc(doc(db, 'households', hid)).catch(() => null);
      if (!s || !s.exists()) continue;
      const others = Object.keys(s.data().members || {}).filter((u) => u !== me);
      if (!others.length) { S.hid = hid; S.household = { id: hid, ...s.data() }; await deleteHouseholdSilently(hid); }
      else await updateDoc(doc(db, 'households', hid), { ['members.' + me]: deleteField(), ['memberNames.' + me]: deleteField() });
    }
    const b = writeBatch(db); b.delete(doc(db, 'users', me)); await b.commit();
    try { await auth.currentUser.delete(); }
    catch (e) {
      if (e.code === 'auth/requires-recent-login') { await reauthenticateWithPopup(auth.currentUser, provider); await auth.currentUser.delete(); }
      else throw e;
    }
    toast('Je account is verwijderd');
  } catch (e) { fail(e); }
}
async function deleteHouseholdSilently(hid) {
  for (const c of ['items', 'catalog', 'dishes', 'cards', 'history', 'events', 'invites']) {
    const snap = await getDocs(collection(db, 'households', hid, c));
    const ops = [];
    snap.docs.forEach((d) => { ops.push((b) => b.delete(d.ref)); if (c === 'invites') ops.push((b) => b.delete(doc(db, 'invites', d.id))); });
    await commitInChunks(ops);
  }
  const b = writeBatch(db); b.delete(doc(db, 'households', hid)); await b.commit();
}

// ---------- Importeren ----------
let xlsxLib = null;
function pageImport() {
  const imp = S.importData;
  return h('div', {}, subHead('Importeren'), h('div', { class: 'main' },
    h('div', { class: 'card pad col' },
      h('div', {}, 'Werk je liever in Excel of Google Spreadsheets? Kies een .xlsx- of .csv-bestand. De app herkent de tabbladen aan hun kolomtitels; namen, volgorde en opmaak mag je vrij kiezen.'),
      h('div', { class: 'small' }, h('b', {}, 'Artikelen'), ': Artikel of Product · Afdeling of Categorie · Eenheid of Verpakking · Standaard · Basis · Foto · Colruyt-nr · Link'),
      h('div', { class: 'small' }, h('b', {}, 'Gerechten'), ': Gerecht of Menu · Artikel of Detail · Hoeveelheid · Eenheid · Afdeling (gerechtnaam enkel op de eerste rij mag)'),
      h('div', { class: 'small' }, h('b', {}, 'Looproute'), ': Afdeling + één kolom per winkel met de volgorde, of Winkel · Afdeling · Volgorde'),
      h('div', { class: 'small' }, h('b', {}, 'Klantenkaarten'), ': Winkel · Kaartnummer · Op naam van'),
      h('div', { class: 'small muted' }, 'Bij Google Spreadsheets: Bestand › Downloaden › Microsoft Excel (.xlsx).'),
      h('div', { class: 'small muted' }, 'Een bestand in Google Drive of OneDrive kies je gewoon via de bestandskiezer van je telefoon.'),
      h('label', { class: 'btn primary' }, icon('upload', 18, '#fff'), 'Bestand kiezen',
        h('input', { type: 'file', accept: '.xlsx,.xls,.csv', class: 'hidden', onchange: (e) => readImportFile(e.target.files[0]) }))),
    imp ? h('div', { class: 'card pad col' },
      h('div', { class: 'bold' }, imp.fileName),
      [['catalog', `Artikelen: ${imp.catalog.length}`, 'vervangt de huidige catalogus'], ['dishes', `Gerechten: ${imp.dishes.length}`, 'vervangt de huidige gerechten'], ['routes', `Winkelroutes: ${Object.keys(imp.routes).join(', ')}`, 'vult aan'], ['cards', `Klantenkaarten: ${imp.cards.length}`, 'vervangt de huidige kaarten']]
        .filter(([k]) => (k === 'routes' ? Object.keys(imp.routes).length : imp[k].length))
        .map(([k, t, s]) => h('label', { class: 'row', style: { minHeight: '44px' } }, h('input', { type: 'checkbox', checked: imp.use[k], style: { width: '22px', height: '22px' }, onchange: (e) => { imp.use[k] = e.target.checked; } }), h('span', { class: 'grow col', style: { gap: 0 } }, h('span', { class: 'bold' }, t), h('span', { class: 'small muted' }, s)))),
      imp.found && imp.found.length ? h('div', { class: 'small muted' }, 'Gevonden: ' + imp.found.join(' · ')) : null,
      imp.warnings.length ? h('div', { class: 'col', style: { gap: '4px', background: 'var(--warn-soft)', color: 'var(--warn-ink)', borderRadius: '10px', padding: '10px 12px' } }, h('b', {}, 'Even nakijken'), imp.warnings.map((w) => h('div', { class: 'small' }, '• ' + w))) : null,
      h('button', { class: 'btn primary', disabled: imp.busy ? true : null, onclick: runImport }, imp.busy ? 'Bezig…' : 'Importeren')) : null));
}

async function readImportFile(file) {
  if (!file) return;
  try {
    if (!window.XLSX) await (xlsxLib ||= loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'));
    const X = window.XLSX;
    const buf = await file.arrayBuffer();
    const wb = X.read(buf, { type: 'array' });
    const sheets = wb.SheetNames.map((name) => {
      const ws = wb.Sheets[name];
      if (!ws || !ws['!ref']) return { name, rows: [], links: {} };
      const range = X.utils.decode_range(ws['!ref']);
      const rows = X.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: true });
      const links = {};
      for (const addr in ws) {
        if (addr[0] === '!') continue;
        const c = ws[addr];
        if (c && c.l && c.l.Target) { const p = X.utils.decode_cell(addr); links[(p.r - range.s.r) + ',' + (p.c - range.s.c)] = c.l.Target; }
      }
      return { name, rows, links };
    });
    const res = parseImport(sheets);
    if (!res.catalog.length && !res.dishes.length && !res.cards.length && !Object.keys(res.routes).length) {
      res.warnings.unshift('Geen bruikbare gegevens gevonden. Staan er kolomtitels zoals Artikel/Product, Afdeling/Categorie, Gerecht/Menu of Kaartnummer?');
    }
    S.importData = { fileName: file.name, ...res, use: { catalog: true, dishes: true, routes: true, cards: true } };
    render();
  } catch (e) { fail(e); }
}

async function runImport() {
  const imp = S.importData;
  imp.busy = true; render();
  try {
    const ops = [];
    const replace = async (coll, rows) => {
      const snap = await getDocs(hhCol(coll));
      snap.docs.forEach((d) => ops.push((b) => b.delete(d.ref)));
      rows.forEach((r) => ops.push((b) => b.set(doc(hhCol(coll)), r)));
    };
    if (imp.use.catalog && imp.catalog.length) await replace('catalog', imp.catalog);
    if (imp.use.dishes && imp.dishes.length) await replace('dishes', imp.dishes);
    if (imp.use.cards && imp.cards.length) await replace('cards', imp.cards);
    await commitInChunks(ops);
    if (imp.use.routes && Object.keys(imp.routes).length) {
      const upd = {};
      for (const k in imp.routes) upd['routes.' + k] = imp.routes[k];
      upd.shops = arrayUnion(...Object.keys(imp.routes));
      if (imp.use.catalog && imp.catalog.length) {
        const cats = [...new Set(imp.catalog.map((c) => c.category))];
        const first = Object.values(imp.routes)[0];
        upd.categories = [...first, ...cats.filter((c) => !first.includes(c))];
      }
      await updateDoc(hhRef(), upd);
    } else if (imp.use.catalog && imp.catalog.length) {
      const cats = [...new Set(imp.catalog.map((c) => c.category))];
      const cur = S.household.categories || CATEGORIES;
      await updateDoc(hhRef(), { categories: [...cur.filter((c) => cats.includes(c)), ...cats.filter((c) => !cur.includes(c))] });
    }
    S.importData = null;
    toast('Import geslaagd');
  } catch (e) { imp.busy = false; fail(e); }
  render();
}

// ---------------------------------------------------------------------
//  Sheets
// ---------------------------------------------------------------------
function renderSheet() {
  const sh = S.sheet;
  let body;
  try { body = sheetBody(sh); } catch (e) { console.error(e); body = null; }
  if (!body) { S.sheet = null; return h('span'); }
  const overlay = h('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) closeSheet(); } },
    h('section', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'grip' }), body));
  return overlay;
}

function sheetBody(sh) {
  if (sh.type === 'item') return sheetItem(sh);
  if (sh.type === 'partial') return sheetPartial(sh);
  if (sh.type === 'finish') return sheetFinish();
  if (sh.type === 'shop') return sheetShop();
  if (sh.type === 'dish') return sheetDish(sh);
  if (sh.type === 'catEdit') return sheetCatEdit(sh);
  if (sh.type === 'dishEdit') return sheetDishEdit(sh);
  if (sh.type === 'cardEdit') return sheetCardEdit(sh);
  if (sh.type === 'households') return sheetHouseholds();
  return null;
}

function sheetItem(sh) {
  const it = S.items.find((i) => i.id === sh.id);
  if (!it) return null;
  const shopper = canShop();
  const inCart = it.status === 'cart';
  const own = it.parts && it.parts[uid()] != null;
  const canEditAll = shopper;
  const canNote = shopper || isOwnOnly(it);
  if (!sh.edit) sh.edit = { parts: { ...it.parts }, note: it.note || '' };
  const ed = sh.edit;
  const photo = photoFor(it);
  const link = linkFor(it);
  const step = stepFor(it.unit);
  const total = Object.values(ed.parts).reduce((a, b) => a + b, 0);
  const changed = JSON.stringify(ed.parts) !== JSON.stringify(it.parts) || ed.note !== (it.note || '');

  const partRow = (u) => {
    const mine = u === uid();
    const editable = !inCart && (canEditAll || mine);
    return h('div', { class: 'row', style: { padding: '8px 10px 8px 14px', minHeight: '52px' } },
      h('div', { class: 'grow col', style: { gap: '1px' } }, h('div', { class: 'bold' }, mine ? 'Jouw deel' : nameOf(u)), !editable && !mine ? h('div', { class: 'tiny muted' }, 'kan enkel ' + nameOf(u) + ' of een winkelaar wijzigen') : null),
      editable ? h('button', { class: 'qbtn', 'aria-label': 'Minder', onclick: () => { ed.parts[u] = Math.max(0, Math.round((ed.parts[u] - step) * 100) / 100); render(); } }, '−') : null,
      h('div', { class: 'qv', style: { width: '64px', textAlign: 'center', fontWeight: 600 } }, fmtQty(ed.parts[u] || 0, it.unit)),
      editable ? h('button', { class: 'qbtn plus', 'aria-label': 'Meer', onclick: () => { ed.parts[u] = Math.round(((ed.parts[u] || 0) + step) * 100) / 100; render(); } }, '+') : null);
  };

  const save = () => {
    const parts = {};
    for (const [u, q] of Object.entries(ed.parts)) if (q > 0) parts[u] = q;
    if (!Object.keys(parts).length) { closeSheet(); deleteLine(it); return; }
    const upd = { parts, updatedAt: serverTimestamp() };
    if (canNote && ed.note !== (it.note || '')) upd.note = ed.note;
    bg(updateDoc(hhRef('items', it.id), upd));
    closeSheet();
  };

  return h('div', { class: 'col', style: { gap: '16px' } },
    photo ? h('div', { class: 'bigphoto' }, h('img', { src: photo, alt: it.name, referrerpolicy: 'no-referrer', onerror: (e) => { e.target.closest('.bigphoto').remove(); } })) : null,
    h('div', { class: 'row between', style: { alignItems: 'flex-start' } },
      h('div', { class: 'col', style: { gap: '4px' } }, h('h2', {}, it.name),
        h('div', { class: 'small muted' }, `${it.category || MANUAL_CATEGORY} · toegevoegd door ${nameOf(it.addedBy)} · ${fmtWhen(it.addedAt)}`),
        it.missing ? h('span', { class: 'pill warn', style: { alignSelf: 'flex-start' } }, 'Niet gevonden · ' + fmtWhen(it.missingAt)) : null,
        inCart ? h('span', { class: 'pill ok', style: { alignSelf: 'flex-start' } }, 'In de mand · ' + nameOf(it.cartBy)) : null),
      h('div', { class: 'qty', style: { fontSize: '18px' } }, fmtQty(total, it.unit))),
    h('div', { class: 'list' }, Object.keys(ed.parts).sort((a, b) => (a === uid() ? -1 : b === uid() ? 1 : 0)).map(partRow),
      !own && !inCart ? h('button', { class: 'navrow', onclick: () => { ed.parts[uid()] = step; render(); } }, icon('plus', 20, 'var(--accent)'), h('span', { class: 'bold', style: { color: 'var(--accent-ink)' } }, 'Ik wil er ook')) : null),
    canNote && !inCart ? h('label', { class: 'lbl' }, 'Opmerking', h('input', { class: 'field', 'data-key': 'itemnote', value: ed.note, placeholder: 'bv. merk of formaat', oninput: (e) => { ed.note = e.target.value; render(); } })) : (it.note ? h('div', { class: 'inote' }, '“' + it.note + '”') : null),
    link ? h('a', { class: 'btn block', href: link, target: '_blank', rel: 'noopener' }, 'Bekijk op de website', icon('ext', 18)) : null,
    changed ? h('button', { class: 'btn primary big block', onclick: save }, 'Bewaren') : null,
    shopper && !inCart ? h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' } },
      h('button', { class: 'btn', onclick: () => { closeSheet(); markMissing(it, !it.missing); } }, it.missing ? 'Toch gevonden' : 'Niet gevonden'),
      h('button', { class: 'btn primary', onclick: () => { closeSheet(); putInCart(it); } }, 'In de mand')) : null,
    shopper && !inCart && qtyOf(it) > step ? h('button', { class: 'btn block', onclick: () => openSheet({ type: 'partial', id: it.id, n: Math.max(step, Math.round((qtyOf(it) / 2) / step) * step) }) }, 'Maar een deel gevonden…') : null,
    shopper && inCart ? h('button', { class: 'btn block', onclick: () => { closeSheet(); takeOutOfCart(it); } }, 'Uit de mand halen') : null,
    !inCart && (shopper || isOwnOnly(it)) ? h('button', { class: 'btn danger block', onclick: () => { closeSheet(); deleteLine(it); } }, icon('trash', 18), 'Lijn wissen')
      : !inCart && own ? h('button', { class: 'btn danger block', onclick: () => { closeSheet(); removeMyPart(it); } }, 'Mijn deel wissen') : null);
}

function sheetPartial(sh) {
  const it = S.items.find((i) => i.id === sh.id);
  if (!it) return null;
  const total = qtyOf(it);
  const step = stepFor(it.unit);
  const n = Math.min(total, Math.max(step, sh.n));
  const rest = Math.round((total - n) * 100) / 100;
  return h('div', { class: 'col', style: { gap: '16px' } },
    h('div', { class: 'col', style: { gap: '4px' } }, h('h2', {}, it.name), h('div', { class: 'small muted' }, `${fmtQty(total, it.unit)} gevraagd · ${partsText(it)}`)),
    h('div', { class: 'col', style: { alignItems: 'center', gap: '10px' } },
      h('div', { class: 'bold muted' }, 'Hoeveel liggen er in de mand?'),
      h('div', { class: 'counter' },
        h('button', { class: 'qbtn', 'aria-label': 'Minder', onclick: () => { sh.n = Math.max(step, Math.round((n - step) * 100) / 100); render(); } }, '−'),
        h('div', { class: 'n' }, fmtNum(n), h('span', { style: { fontSize: '20px', color: 'var(--ink-3)' } }, ' van ' + fmtNum(total))),
        h('button', { class: 'qbtn plus', 'aria-label': 'Meer', onclick: () => { sh.n = Math.min(total, Math.round((n + step) * 100) / 100); render(); } }, '+'))),
    h('div', { class: 'col', style: { background: 'var(--bg)', borderRadius: '14px', padding: '12px 14px', gap: '6px' } },
      h('div', { class: 'group-h', style: { margin: 0 } }, 'Daarna op de lijst'),
      h('div', { class: 'row' }, h('span', { class: 'cb on', style: { width: '22px', height: '22px', borderRadius: '6px' } }, icon('check', 14, '#fff', 3)), h('span', {}, `${it.name} · ${fmtQty(n, it.unit)}`), h('span', { class: 'muted' }, 'in de mand')),
      rest > 0 ? h('div', { class: 'row' }, h('span', { class: 'cb', style: { width: '22px', height: '22px', borderRadius: '6px' } }), h('span', { class: 'bold' }, `${it.name} · ${fmtQty(rest, it.unit)}`), h('span', { class: 'muted' }, 'nog te kopen')) : null),
    h('button', { class: 'btn primary big block', onclick: () => { closeSheet(); splitLine(it, n, false); } }, rest > 0 ? `${fmtNum(n)} in de mand, ${fmtNum(rest)} blijven staan` : 'Alles in de mand'),
    rest > 0 ? h('button', { class: 'btn block', onclick: () => { closeSheet(); splitLine(it, n, true); } }, `${fmtNum(n)} in de mand, rest niet gevonden`) : h('button', { class: 'btn block', onclick: closeSheet }, 'Annuleren'));
}

function sheetFinish() {
  const cart = S.items.filter((i) => i.status === 'cart');
  const missing = S.items.filter((i) => i.status === 'open' && i.missing);
  const open = S.items.filter((i) => i.status === 'open' && !i.missing);
  const names = (arr) => arr.map((i) => i.name).slice(0, 8).join(', ') + (arr.length > 8 ? '…' : '');
  const row = (bgc, ic, col, title, sub) => h('div', { class: 'sumrow' }, h('div', { class: 'sumicon', style: { background: bgc } }, icon(ic, 18, col, 2.4)), h('div', { class: 'col', style: { gap: '2px' } }, h('div', { class: 'bold' }, title), sub ? h('div', { class: 'small muted' }, sub) : null));
  return h('div', { class: 'col', style: { gap: '16px' } },
    h('h2', {}, 'Winkelen afronden'),
    row('var(--accent-soft)', 'check', 'var(--accent-ink)', `${cart.length} gekocht → naar de historiek`, names(cart)),
    missing.length ? row('var(--warn-soft)', 'search', 'var(--warn-ink)', `${missing.length} niet gevonden → blijft staan, met label`, names(missing)) : null,
    open.length ? row('var(--line-2)', 'list', 'var(--ink-2)', `${open.length} niet gekocht → blijven op de lijst`, names(open)) : null,
    h('button', { class: 'btn primary big block', disabled: !cart.length ? true : null, onclick: finishShopping }, 'Afronden'),
    h('button', { class: 'btn block', onclick: closeSheet }, 'Annuleren'));
}

function sheetShop() {
  const shops = S.household.shops || [];
  const cur = activeShop();
  return h('div', { class: 'col', style: { gap: '12px' } },
    h('h2', {}, 'Welke winkel?'),
    h('div', { class: 'small muted' }, 'De lijst volgt de looproute van de gekozen winkel.'),
    shops.map((s) => h('button', { class: 'radio' + (s === cur ? ' on' : ''), onclick: () => { store.set('shop:' + S.hid, s); closeSheet(); } }, h('span', { class: 'r' }), h('span', { class: 'bold' }, s))),
    isAdmin() ? h('button', { class: 'btn block', onclick: () => { S.sheet = null; S.view = 'settings'; S.page = 'shops'; render(); } }, 'Looproute aanpassen') : null);
}

function sheetDish(sh) {
  const d = S.dishes.find((x) => x.id === sh.id);
  if (!d) return null;
  const onList = new Set(S.items.filter((i) => i.status === 'open').map((i) => norm(i.name)));
  if (!sh.sel) sh.sel = (d.items || []).map((x) => !onList.has(norm(x.name)));
  return h('div', { class: 'col', style: { gap: '12px' } },
    h('h2', {}, d.name),
    h('div', { class: 'small muted' }, 'Vink uit wat je nog in huis hebt.'),
    h('div', { class: 'list' }, (d.items || []).map((x, i) => h('label', { class: 'row', style: { padding: '10px 14px', minHeight: '52px' } },
      h('input', { type: 'checkbox', checked: sh.sel[i], style: { width: '22px', height: '22px' }, onchange: (e) => { sh.sel[i] = e.target.checked; } }),
      h('span', { class: 'grow' }, x.name, onList.has(norm(x.name)) ? h('span', { class: 'small muted' }, ' · al op lijst') : null),
      h('span', { class: 'muted' }, fmtQty(x.qty, x.unit))))),
    h('button', { class: 'btn primary big block', onclick: () => {
      let n = 0;
      (d.items || []).forEach((x, i) => {
        if (!sh.sel[i]) return;
        const c = S.catalog.find((cc) => norm(cc.name) === norm(x.name));
        stageEntry({ name: c ? c.name : x.name, unit: x.unit || (c && c.unit) || 'stuk', category: c ? c.category : (x.category || MANUAL_CATEGORY), catalogId: c ? c.id : '', photo: c ? c.photo || '' : '', qty: x.qty || 1 });
        n++;
      });
      closeSheet(); toast(`${n} ingrediënten klaargezet`);
    } }, 'Klaarzetten'));
}

function sheetCatEdit(sh) {
  const d = sh.data;
  const cats = allCategories();
  const set = (k) => (e) => { d[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; };
  return h('form', { class: 'col', style: { gap: '12px' }, onsubmit: (e) => {
    e.preventDefault();
    if (!d.name.trim()) { toast('Geef een naam'); return; }
    const data = { name: d.name.trim(), category: d.category || 'Overige', unit: d.unit || 'stuk', std: parseFloat(String(d.std).replace(',', '.')) || 1, basis: !!d.basis, photo: (d.photo || '').trim(), shopNr: String(d.shopNr || '').trim(), link: (d.link || '').trim() };
    bg(sh.id ? setDoc(hhRef('catalog', sh.id), data) : setDoc(doc(hhCol('catalog')), data));
    if (!cats.includes(data.category)) bg(updateDoc(hhRef(), { categories: arrayUnion(data.category) }));
    closeSheet();
  } },
    h('h2', {}, sh.id ? 'Artikel wijzigen' : 'Nieuw artikel'),
    d.photo ? h('div', { class: 'bigphoto', style: { height: '160px' } }, h('img', { src: d.photo, alt: '', referrerpolicy: 'no-referrer' })) : null,
    h('label', { class: 'lbl' }, 'Naam', h('input', { class: 'field', 'data-key': 'ce-name', value: d.name, oninput: set('name') })),
    h('label', { class: 'lbl' }, 'Categorie',
      h('input', { class: 'field', 'data-key': 'ce-cat', list: 'catlist', value: d.category, oninput: set('category') }),
      h('datalist', { id: 'catlist' }, cats.map((c) => h('option', { value: c })))),
    h('div', { class: 'row' },
      h('label', { class: 'lbl grow' }, 'Standaard', h('input', { class: 'field', 'data-key': 'ce-std', inputmode: 'decimal', value: String(d.std), oninput: set('std') })),
      h('label', { class: 'lbl grow' }, 'Eenheid', h('select', { class: 'field', onchange: set('unit') }, [...new Set([...UNITS, d.unit || 'stuk'])].map((u) => h('option', { value: u, selected: d.unit === u ? true : null }, u))))),
    h('label', { class: 'row', style: { minHeight: '44px' } }, h('input', { type: 'checkbox', checked: d.basis, style: { width: '22px', height: '22px' }, onchange: set('basis') }), h('span', {}, 'Hoort bij het basispakket')),
    h('label', { class: 'lbl' }, 'Foto (adres van de afbeelding)', h('input', { class: 'field', 'data-key': 'ce-photo', value: d.photo, placeholder: 'https://…', oninput: set('photo'), onchange: () => render() }),
      h('span', { class: 'small muted', style: { fontWeight: 400 } }, 'Op de website: houd de foto ingedrukt (of rechtsklik) › Afbeeldingsadres kopiëren.')),
    h('label', { class: 'lbl' }, 'Colruyt-nummer', h('input', { class: 'field', 'data-key': 'ce-nr', value: d.shopNr, inputmode: 'numeric', placeholder: 'bv. 30323', oninput: set('shopNr') })),
    h('label', { class: 'lbl' }, 'Of een eigen link', h('input', { class: 'field', 'data-key': 'ce-link', value: d.link, placeholder: 'https://…', oninput: set('link') })),
    h('button', { class: 'btn primary big block', type: 'submit' }, 'Bewaren'),
    sh.id ? h('button', { class: 'btn danger block', type: 'button', onclick: () => { if (confirm(`${d.name} uit de catalogus verwijderen?`)) { bg(deleteDoc(hhRef('catalog', sh.id))); closeSheet(); } } }, 'Verwijderen') : null);
}

function sheetDishEdit(sh) {
  const d = sh.data;
  const names = S.catalog.map((c) => c.name);
  return h('form', { class: 'col', style: { gap: '12px' }, onsubmit: (e) => {
    e.preventDefault();
    if (!d.name.trim()) { toast('Geef een naam'); return; }
    const items = d.items.filter((x) => x.name.trim()).map((x) => ({ name: x.name.trim(), qty: parseFloat(String(x.qty).replace(',', '.')) || 1, unit: x.unit || 'stuk', category: x.category || '' }));
    const data = { name: d.name.trim(), items };
    bg(sh.id ? setDoc(hhRef('dishes', sh.id), data) : setDoc(doc(hhCol('dishes')), data));
    closeSheet();
  } },
    h('h2', {}, sh.id ? 'Gerecht wijzigen' : 'Nieuw gerecht'),
    h('label', { class: 'lbl' }, 'Naam', h('input', { class: 'field', 'data-key': 'de-name', value: d.name, oninput: (e) => { d.name = e.target.value; } })),
    h('datalist', { id: 'artlist' }, names.map((n) => h('option', { value: n }))),
    h('div', { class: 'bold' }, 'Ingrediënten'),
    d.items.map((x, i) => h('div', { class: 'row' },
      h('input', { class: 'field', 'data-key': 'de-n' + i, list: 'artlist', placeholder: 'Artikel', value: x.name, oninput: (e) => { x.name = e.target.value; const c = S.catalog.find((cc) => norm(cc.name) === norm(x.name)); if (c && !x.unitTouched) { x.unit = c.unit; } } }),
      h('input', { class: 'field', 'data-key': 'de-q' + i, inputmode: 'decimal', style: { width: '64px', textAlign: 'center', padding: '0 6px' }, value: String(x.qty), 'aria-label': 'Hoeveelheid', oninput: (e) => { x.qty = e.target.value; } }),
      h('select', { class: 'field', style: { width: '96px', flex: 'none' }, 'aria-label': 'Eenheid', onchange: (e) => { x.unit = e.target.value; x.unitTouched = true; } }, [...new Set([...UNITS, x.unit || 'stuk'])].map((u) => h('option', { value: u, selected: x.unit === u ? true : null }, u))),
      h('button', { class: 'iconbtn plain', type: 'button', 'aria-label': 'Ingrediënt verwijderen', onclick: () => { d.items.splice(i, 1); render(); } }, icon('x', 18, 'var(--ink-3)')))),
    h('button', { class: 'btn block', type: 'button', onclick: () => { d.items.push({ name: '', qty: 1, unit: 'stuk' }); render(); } }, '+ Ingrediënt'),
    h('button', { class: 'btn primary big block', type: 'submit' }, 'Bewaren'),
    sh.id ? h('button', { class: 'btn danger block', type: 'button', onclick: () => { if (confirm(`${d.name} verwijderen?`)) { bg(deleteDoc(hhRef('dishes', sh.id))); closeSheet(); } } }, 'Verwijderen') : null);
}

function sheetCardEdit(sh) {
  const d = sh.data;
  return h('form', { class: 'col', style: { gap: '12px' }, onsubmit: (e) => {
    e.preventDefault();
    if (!d.shop.trim() || !String(d.number).trim()) { toast('Vul winkel en kaartnummer in'); return; }
    const data = { shop: d.shop.trim(), number: String(d.number).replace(/\s/g, ''), holder: (d.holder || '').trim() };
    bg(sh.id ? setDoc(hhRef('cards', sh.id), data) : setDoc(doc(hhCol('cards')), data));
    closeSheet();
  } },
    h('h2', {}, sh.id ? 'Kaart wijzigen' : 'Nieuwe kaart'),
    h('label', { class: 'lbl' }, 'Winkel', h('input', { class: 'field', 'data-key': 'cd-shop', list: 'shoplist', value: d.shop, oninput: (e) => { d.shop = e.target.value; } }),
      h('datalist', { id: 'shoplist' }, [...new Set([...(S.household.shops || []), ...SHOPS])].map((s) => h('option', { value: s })))),
    h('label', { class: 'lbl' }, 'Kaartnummer (cijfers onder de streepjescode)', h('input', { class: 'field', 'data-key': 'cd-nr', inputmode: 'numeric', value: d.number, oninput: (e) => { d.number = e.target.value; } })),
    h('label', { class: 'lbl' }, 'Op naam van (optioneel)', h('input', { class: 'field', 'data-key': 'cd-holder', value: d.holder, oninput: (e) => { d.holder = e.target.value; } })),
    h('button', { class: 'btn primary big block', type: 'submit' }, 'Bewaren'),
    sh.id ? h('button', { class: 'btn danger block', type: 'button', onclick: () => { if (confirm('Kaart verwijderen?')) { bg(deleteDoc(hhRef('cards', sh.id))); closeSheet(); } } }, 'Verwijderen') : null);
}

function sheetHouseholds() {
  const list = S.profile.households || [];
  return h('div', { class: 'col', style: { gap: '12px' } },
    h('h2', {}, 'Gezin kiezen'),
    h('div', { class: 'list' }, list.map((hid) => h('button', { class: 'navrow', onclick: () => { closeSheet(); if (hid !== S.hid) openHousehold(hid); } },
      icon(hid === S.hid ? 'check' : 'home', 20, hid === S.hid ? 'var(--accent)' : 'var(--ink-2)'),
      h('div', { class: 'grow' }, h('span', { class: 'bold' }, S.hhNames[hid] || '…'))))),
    h('button', { class: 'btn block', onclick: () => { S.sheet = null; S.view = 'settings'; S.page = 'households'; render(); } }, '+ Nieuw gezin of uitnodiging'));
}

// ---------------------------------------------------------------------
//  Start
// ---------------------------------------------------------------------
window.addEventListener('online', () => { S.online = true; render(); });
window.addEventListener('offline', () => { S.online = false; render(); });
window.addEventListener('hashchange', () => { readJoinFromUrl(); render(); if (S.user && S.joinCode) joinWithCode(S.joinCode).then((ok) => { if (ok) openHousehold(S.profile.lastHousehold).then(loadHouseholdNames); }); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.sheet) closeSheet(); });

readJoinFromUrl();
render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker niet geregistreerd', e));
}
