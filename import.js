// =====================================================================
//  Slimme import van een spreadsheet (Excel / Google Spreadsheets / CSV)
//  Herkent tabbladen aan hun kolommen, zoekt zelf de rij met kolomtitels,
//  kent synoniemen (Product = Artikel, Afdeling = Categorie, Menu = Gerecht…)
//  en leest links naar productpagina's.
//
//  Invoer: [{ name, rows: [[cel, cel, …], …], links: { "rij,kolom": url } }]
// =====================================================================

const strip = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const key = (s) => strip(s).trim().toLowerCase().replace(/[\s_.:]+/g, ' ').replace(/\s*-\s*/g, '-');

const SYN = {
  article: ['artikel', 'product', 'producten', 'detail', 'omschrijving', 'ingredient', 'ingredienten', 'item'],
  category: ['categorie', 'afdeling', 'rayon', 'groep'],
  unit: ['eenheid', 'verpakking', 'eenheden'],
  std: ['standaard', 'standaardhoeveelheid', 'aantal'],
  qty: ['hoeveelheid', 'aantal', 'qty'],
  basis: ['basis', 'basispakket', 'vast'],
  photo: ['foto', 'afbeelding', 'beeld', 'image'],
  nr: ['colruyt-nr', 'colruyt nr', 'colruytnr', 'colruyt nummer', 'winkelnr', 'winkel-nr', 'artikelnummer', 'artikelnr', 'nr', 'nummer'],
  link: ['link', 'url', 'website', 'webadres'],
  dish: ['gerecht', 'gerechten', 'menu', 'menus', 'maaltijd', 'recept'],
  shop: ['winkel', 'winkels'],
  order: ['volgorde', 'positie', 'route'],
  card: ['kaartnummer', 'kaart', 'klantenkaart', 'kaartnr'],
  holder: ['op naam van', 'naam', 'eigenaar', 'houder'],
  format: ['type', 'weergave', 'formaat', 'code'],
  qrtext: ['qr-inhoud', 'qr inhoud', 'inhoud qr', 'qr-tekst']
};

function roleOf(h, kind) {
  const k = key(h);
  if (!k) return null;
  const order = kind === 'dish'
    ? ['dish', 'article', 'qty', 'unit', 'category', 'photo', 'nr', 'link']
    : kind === 'card'
      ? ['shop', 'card', 'holder', 'format', 'qrtext']
      : ['article', 'category', 'unit', 'std', 'basis', 'photo', 'nr', 'link', 'dish', 'shop', 'order', 'card', 'qty'];
  for (const r of order) if (SYN[r].includes(k)) return r;
  return null;
}

const isEmpty = (v) => v == null || String(v).trim() === '';
const text = (v) => (isEmpty(v) ? '' : String(v).trim());
const num = (v, d) => {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(n) ? d : n;
};
const yes = (v) => ['ja', 'j', 'x', '1', 'yes', 'y', 'true', 'waar', 'v'].includes(key(v));
const nrText = (v) => (typeof v === 'number' ? String(Math.round(v)) : text(v).replace(/\.0+$/, ''));

// Zoekt de rij met de meeste herkende kolomtitels (in de eerste 15 rijen)
function findHeader(rows) {
  let best = null;
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const row = rows[r] || [];
    let hits = 0;
    row.forEach((c) => { if (!isEmpty(c) && roleOf(c)) hits++; });
    if (hits >= 2 && (!best || hits > best.hits)) best = { r, hits };
  }
  return best ? best.r : -1;
}

function analyseUrl(url) {
  const u = text(url);
  if (!/^https?:\/\//i.test(u)) return {};
  const m = u.match(/colruyt\.be\/[a-z]{2}\/producten\/(\d+)/i);
  if (m) return { shopNr: m[1], link: u };
  if (/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u) || /static\.colruytgroup\.com\/images/i.test(u)) return { photo: u };
  return { link: u };
}

export function parseImport(sheets) {
  const out = { catalog: [], dishes: [], routes: {}, cards: [], warnings: [], found: [] };

  for (const sh of sheets) {
    const rows = sh.rows || [];
    const hr = findHeader(rows);
    if (hr < 0) continue;
    const header = rows[hr];
    // eerste blik op welke soort tabblad dit is
    const rough = header.map((c) => roleOf(c));
    const has = (r) => rough.includes(r);
    let kind;
    if (has('card')) kind = 'card';
    else if (has('dish') && (has('article') || header.some((c) => key(c) === 'detail'))) kind = 'dish';
    else if (has('category') && !has('article')) kind = 'route';
    else if (has('article')) kind = 'catalog';
    else continue;

    const cols = {};
    header.forEach((c, i) => {
      const r = kind === 'route' ? (key(c) && SYN.category.includes(key(c)) ? 'category' : SYN.order.includes(key(c)) ? 'order' : SYN.shop.includes(key(c)) ? 'shop' : null) : roleOf(c, kind);
      if (r && cols[r] == null) cols[r] = i;
    });
    const linkAt = (r, c) => (sh.links && sh.links[r + ',' + c]) || '';
    const data = [];
    for (let r = hr + 1; r < rows.length; r++) data.push([r, rows[r] || []]);

    if (kind === 'catalog') {
      let n = 0;
      for (const [r, row] of data) {
        const name = text(row[cols.article]);
        if (!name) continue;
        const item = {
          category: text(row[cols.category]) || 'Overige',
          name,
          unit: key(row[cols.unit]) || 'stuk',
          std: num(row[cols.std], 1) || 1,
          basis: cols.basis != null ? yes(row[cols.basis]) : false,
          photo: '', shopNr: cols.nr != null ? nrText(row[cols.nr]) : '', link: ''
        };
        for (const c of [cols.photo, cols.link, cols.nr]) {
          if (c == null) continue;
          const info = { ...analyseUrl(linkAt(r, c)), ...analyseUrl(row[c]) };
          // In de kolom Foto is elk webadres dat geen productpagina is een afbeelding
          if (c === cols.photo && info.link && !info.shopNr) { info.photo = info.link; delete info.link; }
          if (info.photo && !item.photo) item.photo = info.photo;
          if (info.shopNr && !item.shopNr) item.shopNr = info.shopNr;
          if (info.link && !item.link && !info.shopNr) item.link = info.link;
        }
        out.catalog.push(item); n++;
      }
      out.found.push(`${sh.name}: ${n} artikelen`);
    }

    if (kind === 'dish') {
      const artCol = cols.article != null ? cols.article : header.findIndex((c) => key(c) === 'detail');
      let current = '';
      let n = 0;
      const map = new Map();
      for (const [, row] of data) {
        const d = text(row[cols.dish]);
        if (d) current = d;
        const art = text(row[artCol]);
        if (!art || !current) continue;
        if (!map.has(current)) map.set(current, []);
        map.get(current).push({
          name: art,
          qty: num(row[cols.qty], 1) || 1,
          unit: key(row[cols.unit]) || '',
          category: text(row[cols.category])
        });
      }
      for (const [name, items] of map) { out.dishes.push({ name, items }); n++; }
      out.found.push(`${sh.name}: ${n} gerechten`);
    }

    if (kind === 'route') {
      const catCol = cols.category;
      // Formaat A: kolom "Winkel" + "Volgorde" (één rij per winkel en afdeling)
      if (cols.shop != null && cols.order != null) {
        for (const [, row] of data) {
          const shop = text(row[cols.shop]), cat = text(row[catCol]);
          if (shop && cat) (out.routes[shop] ||= []).push([num(row[cols.order], 99), cat]);
        }
      } else {
        // Formaat B: één kolom per winkel met daarin de volgorde.
        // De winkelnaam staat in de titelrij, of in een tekstcel net onder "Volgorde".
        const shopCols = [];
        header.forEach((c, i) => {
          if (i === catCol || isEmpty(c)) return;
          let name = SYN.order.includes(key(c)) ? '' : text(c);
          if (!name) {
            for (let r = hr + 1; r < Math.min(rows.length, hr + 4); r++) {
              const v = (rows[r] || [])[i];
              if (!isEmpty(v) && typeof v !== 'number' && isNaN(parseFloat(v))) { name = text(v); break; }
            }
          }
          shopCols.push([i, name || 'Mijn winkel']);
        });
        for (const [i, shop] of shopCols) {
          for (const [, row] of data) {
            const cat = text(row[catCol]);
            const v = row[i];
            if (!cat || isEmpty(v) || isNaN(num(v, NaN))) continue;
            (out.routes[shop] ||= []).push([num(v, 99), cat]);
          }
        }
      }
      out.found.push(`${sh.name}: looproute voor ${Object.keys(out.routes).join(', ') || 'geen winkel'}`);
    }

    if (kind === 'card') {
      let n = 0;
      for (const [, row] of data) {
        const shop = text(row[cols.shop]);
        const nr = nrText(row[cols.card]).replace(/\s/g, '');
        if (!shop || !/\d{4,}/.test(nr)) continue;
        const f = key(row[cols.format]);
        out.cards.push({ shop, number: nr, holder: cols.holder != null ? text(row[cols.holder]) : '', format: f.startsWith('qr') ? 'qr' : 'barcode', qrText: cols.qrtext != null ? text(row[cols.qrtext]) : '' });
        if (/^\d{12}$/.test(nr)) out.warnings.push(`Kaartnummer ${shop} heeft 12 cijfers: controleer of er een 0 vooraan ontbreekt (zet de cel dan op Tekst).`);
        n++;
      }
      out.found.push(`${sh.name}: ${n} klantenkaarten`);
    }
  }

  // Looproutes sorteren en dubbels opruimen
  for (const shop in out.routes) {
    const seen = new Map();
    const sorted = out.routes[shop].sort((a, b) => a[0] - b[0]);
    const dups = [];
    const list = [];
    for (const [o, cat] of sorted) {
      const k = key(cat);
      if (seen.has(k)) { dups.push(`${cat} (${seen.get(k)} en ${o})`); continue; }
      seen.set(k, o); list.push(cat);
    }
    const byNr = new Map();
    for (const [o, cat] of sorted) { if (!byNr.has(o)) byNr.set(o, new Set()); byNr.get(o).add(cat); }
    const clashes = [...byNr.entries()].filter(([, set]) => set.size > 1).map(([o, set]) => `${[...set].join(' en ')} (${o})`);
    if (dups.length) out.warnings.push(`${shop}: dubbele afdeling ${dups.join(', ')}; de eerste plaats wordt gebruikt.`);
    if (clashes.length) out.warnings.push(`${shop}: zelfde volgnummer voor ${clashes.join(', ')}.`);
    out.routes[shop] = list;
  }

  // Categorieën in gerechten die nergens anders voorkomen (bv. "Divers" naast "Diversen")
  const known = new Set([...out.catalog.map((c) => key(c.category)), ...Object.values(out.routes).flat().map(key)]);
  if (known.size) {
    const odd = new Set();
    out.dishes.forEach((d) => d.items.forEach((x) => { if (x.category && !known.has(key(x.category))) odd.add(x.category); }));
    if (odd.size) out.warnings.push(`Afdeling ${[...odd].map((x) => '"' + x + '"').join(', ')} in de gerechten komt niet voor in de catalogus of looproute.`);
  }
  // Categorieën van de catalogus die in geen enkele looproute staan
  const routeCats = new Set(Object.values(out.routes).flat().map(key));
  if (routeCats.size) {
    const missing = [...new Set(out.catalog.map((c) => c.category))].filter((c) => !routeCats.has(key(c)));
    if (missing.length) out.warnings.push(`Niet in de looproute: ${missing.join(', ')} (komen achteraan).`);
  }
  return out;
}
