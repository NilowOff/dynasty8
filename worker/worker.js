/* API Dynasty 8 : comptes employés (admin, gérant), catalogue et images des pièces.
   Cloudflare Worker avec un espace de stockage KV lié sous le nom « DB ».
   Clés KV : data (catalogue), staff (comptes), secret (clé de signature des sessions), media/… (images),
   media/staff/… (photos de profil des employés). */

const MEDIA_RE = /^media\/[a-z0-9-]{1,60}\/[a-z0-9-]{1,80}\.jpg$/;
const PHOTO_RE = /^media\/staff\/[a-z0-9-]{1,80}\.jpg$/;
const STATIC_RE = /^[a-z0-9_-]{1,60}\.(jpg|png)$/i;
const ID_RE = /^[a-z0-9-]{1,60}$/;
const USER_RE = /^[a-z0-9._-]{3,24}$/;
const ROLES = ['admin', 'gerant', 'decorateur'];
const ROLE_LABEL = { admin: 'Admin', gerant: 'Gérant', decorateur: 'Décorateur' };
const rid = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => (b % 36).toString(36)).join('');
const OLD_TYPES = { Bureau: 'Bureaux', Villa: 'Maison', Commerce: 'Location Pro', Entrepot: 'Entrepôt', Garage: 'Intérieur vide', Terrain: 'Intérieur vide' };
const ITER = 5000;
const SESSION_MS = 30 * 24 * 3600 * 1000;
const MAX_IMAGE = 20 * 1024 * 1024;
const MAX_PHOTO = 2 * 1024 * 1024;
const MAX_DATA = 1024 * 1024;
const DEFAULT_SEED = 'https://nilowoff.github.io/dynasty8/data.json';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400'
};

class HttpError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}
const deny = msg => { throw new HttpError(403, 'forbidden', msg); };
const bad = msg => { throw new HttpError(400, 'invalid', msg); };

function json(obj, status, extra) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(extra || {}) } });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      return await route(request, env, ctx);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
      return json({ error: 'server', message: 'Erreur interne du serveur.' }, 500);
    }
  }
};

async function route(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const m = request.method;

  if (m === 'GET' && path.startsWith('/media/')) return serveMedia(env, path.slice(1));
  if (path === '/' || path === '/api') return json({ ok: true, service: 'Dynasty 8' });

  if (path === '/api/data' && m === 'GET') {
    const txt = await env.DB.get('data');
    if (!txt) return json({ error: 'empty' }, 404);
    return new Response(txt, { headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' } });
  }
  if (path === '/api/reviews' && m === 'GET') return json({ items: await getJSON(env, 'reviews', []) });
  if (path === '/api/reviews' && m === 'POST') return postReview(request, env);
  if (path === '/api/status' && m === 'GET') {
    const staff = await getStaff(env);
    return json({ setup: Object.keys(staff.users).length === 0 });
  }
  if (path === '/api/setup' && m === 'POST') return setup(request, env);
  if (path === '/api/login' && m === 'POST') return login(request, env);

  // tout le reste demande une session valide
  const me = await auth(request, env);
  if (path === '/api/me' && m === 'GET') return json({ user: publicUser(me) });
  if (path === '/api/password' && m === 'POST') return changeOwnPassword(request, env, me);
  if ((path === '/api/me/photo' || path === '/api/me/banner') && (m === 'PUT' || m === 'DELETE')) return setPhoto(request, env, me, me.username, m === 'DELETE', path.endsWith('banner') ? 'banner' : 'photo');
  if (path.startsWith('/api/media/') && m === 'PUT') return putMedia(request, env, me, path.slice('/api/'.length));
  if (path === '/api/save' && m === 'POST') return save(request, env, me);
  if (path.startsWith('/api/reviews/') && m === 'DELETE') {
    if (me.role !== 'admin') deny('Seul un admin peut supprimer un avis.');
    return deleteReview(env, me, decodeURIComponent(path.slice('/api/reviews/'.length)));
  }
  if (path === '/api/log' || path === '/api/trash' || path.startsWith('/api/trash/')) {
    if (me.role !== 'admin') deny('Seul un admin peut voir l’historique.');
    if (path === '/api/log' && m === 'GET') return json({ items: await getJSON(env, 'log', []) });
    if (path === '/api/trash' && m === 'GET') return listTrash(env);
    const rest = path.slice('/api/trash/'.length).split('/');
    const id = decodeURIComponent(rest[0] || '');
    if (id && rest[1] === 'restore' && m === 'POST') return restoreTrash(env, me, id);
    if (id && rest.length === 1 && m === 'DELETE') return purgeTrash(env, me, id);
  }
  if (path === '/api/staff' || path.startsWith('/api/staff/')) {
    if (me.role !== 'admin') deny('Seul un admin peut gérer les comptes.');
    const rest = path.slice('/api/staff/'.length).split('/');
    const name = path === '/api/staff' ? '' : decodeURIComponent(rest[0] || '');
    if (path === '/api/staff' && m === 'GET') return listStaff(env);
    if (path === '/api/staff' && m === 'POST') return createStaff(request, env, me);
    if (name && (rest[1] === 'photo' || rest[1] === 'banner') && rest.length === 2 && (m === 'PUT' || m === 'DELETE')) return setPhoto(request, env, me, name, m === 'DELETE', rest[1]);
    if (name && rest.length === 1 && m === 'PATCH') return updateStaff(request, env, me, name);
    if (name && rest.length === 1 && m === 'DELETE') return deleteStaff(env, me, name);
  }
  throw new HttpError(404, 'not_found', 'Adresse inconnue.');
}

// ------------------------------------------------------------------ images
async function serveMedia(env, key) {
  if (!MEDIA_RE.test(key)) return new Response('Introuvable', { status: 404, headers: CORS });
  const body = await env.DB.get(key, { type: 'stream', cacheTtl: 86400 });
  if (!body) return new Response('Introuvable', { status: 404, headers: CORS });
  return new Response(body, {
    headers: { ...CORS, 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' }
  });
}
async function putMedia(request, env, me, key) {
  if (!MEDIA_RE.test(key)) bad('Chemin d’image non valable.');
  if (PHOTO_RE.test(key)) deny('Les photos de profil se changent dans « Mon compte ».');
  const len = +(request.headers.get('Content-Length') || 0);
  if (len > MAX_IMAGE) throw new HttpError(413, 'too_large', 'Image trop lourde (20 Mo maximum).');
  if (!/^image\/jpeg/i.test(request.headers.get('Content-Type') || '')) bad('Seules les images JPEG sont acceptées.');
  if (me.role !== 'admin') {
    const existing = (await env.DB.list({ prefix: key, limit: 1 })).keys.find(k => k.name === key);
    if (existing && (!existing.metadata || existing.metadata.by !== me.username)) deny('Cette image existe déjà.');
  }
  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX_IMAGE) throw new HttpError(413, 'too_large', 'Image trop lourde (20 Mo maximum).');
  if (buf.byteLength < 4 || new Uint8Array(buf, 0, 2)[0] !== 0xff || new Uint8Array(buf, 0, 2)[1] !== 0xd8) bad('Ce fichier n’est pas une image JPEG.');
  await env.DB.put(key, buf, { metadata: { by: me.username, at: Date.now() } });
  return json({ ok: true, path: key });
}

// ------------------------------------------------------------------ catalogue
async function currentData(env) {
  const txt = await env.DB.get('data');
  if (txt) return JSON.parse(txt);
  try {
    const r = await fetch(env.SEED_URL || DEFAULT_SEED, { cf: { cacheTtl: 0 } });
    if (r.ok) { const d = await r.json(); if (d && Array.isArray(d.listings)) return d; }
  } catch (e) { /* pas de données de départ */ }
  return { version: 1, listings: [] };
}

async function save(request, env, me) {
  const text = await request.text();
  if (text.length > MAX_DATA * 3) throw new HttpError(413, 'too_large', 'Données trop volumineuses.');
  let body; try { body = JSON.parse(text); } catch (e) { bad('Requête illisible.'); }
  const cur = await currentData(env);
  sanitize(cur, true);
  const base = body.base && Array.isArray(body.base.listings) ? body.base : cur;
  const mine = body.data;
  if (!mine || !Array.isArray(mine.listings)) bad('Catalogue manquant.');
  let next = merge3(base, mine, cur);
  sanitize(next, false);
  stampAuthors(cur, next, me);
  checkBases(cur, next);
  if (me.role === 'gerant') checkGerant(cur, next, me);
  else if (me.role === 'decorateur') checkDecorateur(cur, next, me);
  const staffNow = await getStaff(env);
  next.decorators = computeDecorators(staffNow, next, cur.decorators);

  const deletes = Array.isArray(body.deletes) ? body.deletes : [];
  if (deletes.length && me.role === 'gerant') deny('Un gérant ne peut rien supprimer.');
  const now = new Date().toISOString();
  // biens supprimés : gardés dans la corbeille (avec leurs images) pour pouvoir les restaurer
  const removed = cur.listings.filter(l => !next.listings.some(x => x.id === l.id));
  let trash = null;
  if (removed.length || deletes.length) trash = await getJSON(env, 'trash', []);
  removed.forEach(l => trash.unshift({ id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), listing: l, deletedAt: now, deletedBy: me.username }));
  const used = usedMedia(next, trash || []);
  // un décorateur ne peut effacer que les images de ses propres décorations
  const ownMedia = me.role === 'decorateur' ? new Set(cur.listings.filter(l => l.deco === me.uid).flatMap(mediaOfListing)) : null;
  const toDelete = deletes.filter(p => typeof p === 'string' && MEDIA_RE.test(p) && !PHOTO_RE.test(p) && !used.has(p) && (!ownMedia || ownMedia.has(p)));
  toDelete.push(...lostPhotos(cur.decorators, next.decorators, staffNow));
  const changes = describeChanges(cur, next);

  next.version = 1;
  next.rev = (cur.rev || 0) + 1;
  next.updated = now;
  next.updatedBy = me.username;
  const out = JSON.stringify(next, null, 1);
  if (out.length > MAX_DATA) throw new HttpError(413, 'too_large', 'Catalogue trop volumineux.');
  await env.DB.put('data', out);
  if (removed.length) await env.DB.put('trash', JSON.stringify(trash));
  await Promise.all(toDelete.map(k => env.DB.delete(k)));
  await addLog(env, me.username, changes);
  return json({ ok: true, data: next });
}

// ------------------------------------------------------------------ historique : corbeille et journal
async function getJSON(env, key, def) {
  const t = await env.DB.get(key);
  if (!t) return def;
  try { return JSON.parse(t); } catch (e) { return def; }
}
function mediaOfListing(l) {
  const out = [l.cover];
  (l.points || []).forEach(p => out.push(p.image, p.imageSmall));
  return out.filter(x => typeof x === 'string' && MEDIA_RE.test(x));
}
// images encore utilisées : catalogue, pages du site, biens dans la corbeille
function usedMedia(data, trash) {
  const used = new Set();
  data.listings.forEach(l => mediaOfListing(l).forEach(x => used.add(x)));
  if (data.site) { (data.site.home.photos || []).forEach(x => used.add(x)); (data.site.team.members || []).forEach(m => used.add(m.photo)); }
  trash.forEach(t => mediaOfListing(t.listing).forEach(x => used.add(x)));
  return used;
}
async function addLog(env, by, texts) {
  if (!texts.length) return;
  const at = new Date().toISOString();
  const log = await getJSON(env, 'log', []);
  const shown = texts.length > 12 ? texts.slice(0, 11).concat(['a fait ' + (texts.length - 11) + ' autres changements']) : texts;
  await env.DB.put('log', JSON.stringify(shown.map(text => ({ at, by, text })).concat(log).slice(0, 300)));
}
const STATUS_NAMES = { disponible: 'Disponible', reserve: 'Réservé', vendu: 'Vendu', loue: 'Loué' };
const SITE_PAGES = { home: 'Accueil', info: 'Informations', team: 'Qui sommes-nous ?', recruit: 'Recrutements', calendar: 'Calendrier', faq: 'Réponses FAQ' };
function priceTxt(l) {
  const f = v => Math.round(v).toLocaleString('fr-FR') + ' $';
  if (l.price === null && l.priceMax === null) return 'sur demande';
  if (l.price !== null && l.priceMax !== null && l.priceMax > l.price) return f(l.price) + ' – ' + f(l.priceMax);
  return f(l.price !== null ? l.price : l.priceMax);
}
// résumé lisible de ce qu'un enregistrement a changé
function describeChanges(cur, next) {
  const out = [], q = s => '« ' + (s || 'Sans nom') + ' »';
  const curL = new Map(cur.listings.map(l => [l.id, l])), nextL = new Map(next.listings.map(l => [l.id, l]));
  const noun = l => l.deco ? 'la décoration ' : 'le bien ';
  const baseName = l => { const b = l.deco && l.base && nextL.get(l.base); return b ? ' dans ' + q(b.name) : ''; };
  next.listings.forEach(l => { if (!curL.has(l.id)) out.push('a créé ' + noun(l) + q(l.name) + baseName(l) + (l.points.length ? ' (' + l.points.length + (l.points.length > 1 ? ' pièces)' : ' pièce)') : '')); });
  cur.listings.forEach(l => { if (!nextL.has(l.id)) out.push('a supprimé ' + noun(l) + q(l.name)); });
  next.listings.forEach(l => {
    const c = curL.get(l.id); if (!c) return;
    const cp = new Map(c.points.map(p => [p.id, p])), np = new Map(l.points.map(p => [p.id, p]));
    l.points.forEach(p => { if (!cp.has(p.id)) out.push('a ajouté la pièce ' + q(p.name) + ' dans ' + q(l.name)); });
    c.points.forEach(p => { if (!np.has(p.id)) out.push('a supprimé la pièce ' + q(p.name) + ' de ' + q(l.name)); });
    if (c.price !== l.price || (c.priceMax ?? null) !== (l.priceMax ?? null)) out.push('a changé le prix de ' + q(l.name) + ' : ' + priceTxt({ price: c.price, priceMax: c.priceMax ?? null }) + ' → ' + priceTxt({ price: l.price, priceMax: l.priceMax ?? null }));
    if (c.status !== l.status) out.push('a passé ' + q(l.name) + ' en « ' + (STATUS_NAMES[l.status] || l.status) + ' »');
    if (c.start && c.start !== l.start && np.has(l.start)) out.push('a choisi « ' + np.get(l.start).name + ' » comme pièce de départ de ' + q(l.name));
    if (c.cover && c.cover !== l.cover) out.push('a changé la photo de couverture de ' + q(l.name));
    if (l.deco && l.base && c.base !== l.base) out.push('a placé la décoration ' + q(l.name) + baseName(l));
    const strip = x => { const { points, price, priceMax, status, start, cover, base, ...r } = x; return r; };
    if (!eq(strip(c), strip(l))) out.push('a modifié les infos de ' + q(l.name));
    const edited = l.points.filter(p => cp.has(p.id) && !eq(p, cp.get(p.id)));
    if (edited.length) out.push('a modifié la visite de ' + q(l.name) + ' (' + edited.map(p => p.name).join(', ') + ')');
  });
  const cs = cur.site, ns = next.site;
  if (!cs && ns) out.push('a modifié les pages du site');
  else if (cs && ns) Object.keys(SITE_PAGES).forEach(k => {
    if (eq(cs[k], ns[k])) return;
    if (k === 'recruit' && cs.recruit.open !== ns.recruit.open) out.push('a passé les recrutements en « ' + (ns.recruit.open ? 'Ouverts' : 'Fermés') + ' »');
    else if (k === 'calendar' && cs.calendar.intro === ns.calendar.intro) out.push('a modifié le calendrier du Rooftop');
    else out.push('a modifié la page « ' + SITE_PAGES[k] + ' »');
  });
  return out;
}
async function listTrash(env) {
  const trash = await getJSON(env, 'trash', []);
  return json({ items: trash.map(t => ({
    id: t.id, deletedAt: t.deletedAt, deletedBy: t.deletedBy,
    name: t.listing.name, type: t.listing.type, deal: t.listing.deal, period: t.listing.period, deco: t.listing.deco || null,
    price: t.listing.price, priceMax: t.listing.priceMax ?? null, cover: t.listing.cover, rooms: (t.listing.points || []).length
  })) });
}
async function restoreTrash(env, me, id) {
  const trash = await getJSON(env, 'trash', []);
  const i = trash.findIndex(t => t.id === id);
  if (i < 0) throw new HttpError(404, 'not_found', 'Ce bien n’est plus dans l’historique.');
  const cur = await currentData(env);
  sanitize(cur, true);
  const l = { ...trash[i].listing };
  const base = l.id; let k = 2;
  while (cur.listings.some(x => x.id === l.id)) l.id = (base + '-' + k++).slice(0, 60);
  cur.listings.push(l);
  sanitize(cur, true);
  cur.rev = (cur.rev || 0) + 1; cur.updated = new Date().toISOString(); cur.updatedBy = me.username;
  await env.DB.put('data', JSON.stringify(cur, null, 1));
  trash.splice(i, 1);
  await env.DB.put('trash', JSON.stringify(trash));
  await addLog(env, me.username, ['a restauré le bien « ' + (l.name || 'Sans nom') + ' »']);
  return json({ ok: true, listing: cur.listings.find(x => x.id === l.id) });
}
async function purgeTrash(env, me, id) {
  const trash = await getJSON(env, 'trash', []);
  const i = trash.findIndex(t => t.id === id);
  if (i < 0) throw new HttpError(404, 'not_found', 'Ce bien n’est plus dans l’historique.');
  const [entry] = trash.splice(i, 1);
  const cur = await currentData(env);
  sanitize(cur, true);
  const used = usedMedia(cur, trash);
  await env.DB.put('trash', JSON.stringify(trash));
  await Promise.all(mediaOfListing(entry.listing).filter(x => !used.has(x)).map(x => env.DB.delete(x)));
  await addLog(env, me.username, ['a supprimé définitivement le bien « ' + (entry.listing.name || 'Sans nom') + ' »']);
  return listTrash(env);
}

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
// comparaison indépendante de l'ordre des clés
const canon = x => JSON.stringify(x, (k, v) => isObj(v) ? Object.keys(v).sort().reduce((o, key) => { o[key] = v[key]; return o; }, {}) : v);
const eq = (a, b) => canon(a) === canon(b);
const isIdArray = x => Array.isArray(x) && x.every(o => isObj(o) && typeof o.id === 'string');

// fusion à trois : ce que l'employé a changé (base → mine) est appliqué sur la version actuelle (theirs)
function merge3(base, mine, theirs) {
  if (eq(mine, base)) return theirs;
  if (eq(theirs, base)) return mine;
  if (isIdArray(mine) && isIdArray(theirs) && (base === undefined || isIdArray(base))) {
    const b = new Map((base || []).map(o => [o.id, o])), m = new Map(mine.map(o => [o.id, o])), t = new Map(theirs.map(o => [o.id, o]));
    const out = [];
    for (const o of mine) {
      if (t.has(o.id)) out.push(merge3(b.get(o.id), o, t.get(o.id)));
      else if (!b.has(o.id) || !eq(o, b.get(o.id))) out.push(o);
    }
    for (const o of theirs) {
      if (m.has(o.id)) continue;
      if (!b.has(o.id) || !eq(o, b.get(o.id))) out.push(o);
    }
    return out;
  }
  if (isObj(mine) && isObj(theirs) && (base === undefined || isObj(base))) {
    const out = {};
    for (const k of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
      const inB = !!base && k in base, bv = inB ? base[k] : undefined;
      if (k in mine && k in theirs) out[k] = merge3(bv, mine[k], theirs[k]);
      else if (k in mine) { if (!inB || !eq(mine[k], bv)) out[k] = mine[k]; }
      else if (!inB || !eq(theirs[k], bv)) out[k] = theirs[k];
    }
    return out;
  }
  return mine;
}

const str = (v, n) => (typeof v === 'string' ? v : '').slice(0, n);
const numOrNull = v => (v === null || v === undefined || v === '' || !isFinite(+v)) ? null : Math.max(0, Math.min(1e12, +v));
const angle = v => isFinite(+v) ? Math.round(+v * 100) / 100 : 0;
const imgPath = v => (typeof v === 'string' && (MEDIA_RE.test(v) || STATIC_RE.test(v))) ? v : null;

// remet le catalogue dans une forme sûre (types, longueurs, chemins d'images)
function sanitize(d, lenient) {
  if (!Array.isArray(d.listings)) d.listings = [];
  const seen = new Set();
  d.listings = d.listings.filter(l => {
    if (!isObj(l) || typeof l.id !== 'string' || !ID_RE.test(l.id) || seen.has(l.id)) { if (lenient) return false; bad('Identifiant de bien non valable.'); }
    seen.add(l.id); return true;
  });
  d.listings.forEach(l => {
    l.name = str(l.name, 120); l.type = str(l.type, 40); l.deal = l.deal === 'location' ? 'location' : 'vente';
    l.period = ['semaine', 'mois', 'jour'].includes(l.period) ? l.period : 'semaine';
    l.status = ['disponible', 'reserve', 'vendu', 'loue'].includes(l.status) ? l.status : 'disponible';
    if (OLD_TYPES[l.type]) l.type = OLD_TYPES[l.type];
    l.price = numOrNull(l.price); l.priceMax = numOrNull(l.priceMax); l.garagePrice = numOrNull(l.garagePrice);
    delete l.district; delete l.surface; delete l.rooms; delete l.garage;
    l.description = str(l.description, 4000);
    l.features = Array.isArray(l.features) ? l.features.map(f => str(f, 80)).filter(Boolean).slice(0, 30) : [];
    l.cover = imgPath(l.cover); l.order = isFinite(+l.order) ? +l.order : 0; l.created = str(l.created, 30);
    if (typeof l.deco === 'string' && /^[a-z0-9]{1,20}$/.test(l.deco)) { /* décoration d'un décorateur */ } else delete l.deco;
    if (typeof l.base === 'string' && ID_RE.test(l.base)) { /* intérieur du catalogue où la décoration a été faite */ } else delete l.base;
    if (l.createdBy !== undefined) l.createdBy = str(l.createdBy, 24);
    const pids = new Set();
    l.points = (Array.isArray(l.points) ? l.points : []).filter(p => {
      if (!isObj(p) || typeof p.id !== 'string' || !ID_RE.test(p.id) || pids.has(p.id)) { if (lenient) return false; bad('Identifiant de pièce non valable.'); }
      pids.add(p.id); return true;
    });
    l.points.forEach(p => {
      p.name = str(p.name, 80); p.image = imgPath(p.image); p.imageSmall = imgPath(p.imageSmall);
      p.north = angle(p.north); p.yaw = angle(p.yaw); p.pitch = angle(p.pitch);
      if (p.createdBy !== undefined) p.createdBy = str(p.createdBy, 24);
      p.pins = (Array.isArray(p.pins) ? p.pins : []).filter(x => isObj(x) && typeof x.id === 'string').slice(0, 100)
        .map(x => ({ id: str(x.id, 20), yaw: angle(x.yaw), pitch: angle(x.pitch), label: str(x.label, 80), text: str(x.text, 400) }));
      p.links = (Array.isArray(p.links) ? p.links : []).filter(x => isObj(x) && typeof x.id === 'string' && pids.has(x.target)).slice(0, 50)
        .map(x => ({ id: str(x.id, 20), target: x.target, yaw: angle(x.yaw), pitch: angle(x.pitch) }));
    });
    if (l.start !== null && !pids.has(l.start)) l.start = l.points[0] ? l.points[0].id : null;
  });
  if (d.decorators !== undefined) d.decorators = (Array.isArray(d.decorators) ? d.decorators : []).filter(x => isObj(x) && typeof x.id === 'string' && /^[a-z0-9]{1,20}$/.test(x.id)).slice(0, 100).map(x => decoEntry(x.id, str(x.name, 40), x.photo, x.banner));
  if (d.site !== undefined) d.site = sanitizeSite(d.site);
  if (d.site === undefined) delete d.site;
}

// pages du site (accueil, informations, équipe, recrutements, calendrier, réponses FAQ)
function sanitizeSite(s) {
  if (!isObj(s)) return undefined;
  const ob = v => isObj(v) ? v : {};
  const list = (v, max, fn) => (Array.isArray(v) ? v : []).filter(x => isObj(x) && typeof x.id === 'string' && x.id.length <= 20).slice(0, max).map(fn);
  const h = ob(s.home), i = ob(s.info), t = ob(s.team), r = ob(s.recruit), c = ob(s.calendar), f = ob(s.faq);
  const booked = {};
  Object.keys(ob(c.booked)).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).slice(0, 800).forEach(k => { booked[k] = str(c.booked[k], 80); });
  return {
    home: { lead: str(h.lead, 600), text: str(h.text, 3000), tagline: str(h.tagline, 200), photos: (Array.isArray(h.photos) ? h.photos : []).map(imgPath).filter(Boolean).slice(0, 4) },
    info: {
      intro: str(i.intro, 2000), warning: str(i.warning, 600), note: str(i.note, 400),
      sections: list(i.sections, 30, x => ({ id: x.id, title: str(x.title, 120), text: str(x.text, 5000) }))
    },
    team: {
      intro: str(t.intro, 2000),
      members: list(t.members, 60, x => ({ id: x.id, name: str(x.name, 80), role: str(x.role, 160), bio: str(x.bio, 3000), photo: imgPath(x.photo) }))
    },
    recruit: { open: r.open === true, intro: str(r.intro, 2000), closedText: str(r.closedText, 300), openText: str(r.openText, 300) },
    calendar: { intro: str(c.intro, 1000), booked },
    reviews: { intro: str(ob(s.reviews).intro, 1000) },
    decor: { intro: str(ob(s.decor).intro, 1000) },
    faq: { intro: str(f.intro, 2000), items: list(f.items, 80, x => ({ id: x.id, q: str(x.q, 300), a: str(x.a, 5000) })) }
  };
}

// l'auteur d'un bien ou d'une pièce est fixé par le serveur, à la création
function stampAuthors(cur, next, me) {
  const curL = new Map(cur.listings.map(l => [l.id, l]));
  next.listings.forEach(l => {
    const cl = curL.get(l.id);
    if (cl) {
      if (cl.createdBy) l.createdBy = cl.createdBy; else delete l.createdBy;
      if (cl.deco) l.deco = cl.deco; else delete l.deco;
    } else {
      l.createdBy = me.username;
      if (me.role === 'decorateur') l.deco = me.uid;
      else if (me.role === 'gerant') delete l.deco;
      else if (l.deco && !(cur.decorators || []).some(x => x.id === l.deco)) delete l.deco;
    }
    const curP = new Map((cl ? cl.points : []).map(p => [p.id, p]));
    l.points.forEach(p => {
      const cp = curP.get(p.id);
      if (cp) { if (cp.createdBy) p.createdBy = cp.createdBy; else delete p.createdBy; }
      else p.createdBy = me.username;
    });
  });
}

// règles du gérant : il crée des biens et des pièces, modifie ce qu'il a créé, choisit la pièce de départ, ne supprime rien
function checkGerant(cur, next, me) {
  if (!eq(cur.site === undefined ? null : cur.site, next.site === undefined ? null : next.site)) deny('Seul un admin peut modifier les pages du site.');
  const nextL = new Map(next.listings.map(l => [l.id, l]));
  for (const cl of cur.listings) {
    const nl = nextL.get(cl.id);
    if (!nl) deny('Un gérant ne peut pas supprimer un bien.');
    if (cl.deco) { if (!eq(cl, nl)) deny('Un gérant ne peut pas modifier les décorations des décorateurs.'); continue; }
    const ownListing = cl.createdBy === me.username;
    const np = new Map(nl.points.map(p => [p.id, p]));
    for (const cp of cl.points) {
      const p = np.get(cp.id);
      if (!p) deny('Un gérant ne peut pas supprimer une pièce.');
      if (ownListing || cp.createdBy === me.username) continue;
      const { links: la, ...ra } = cp, { links: lb, ...rb } = p;
      if (!eq(ra, rb)) deny('Un gérant ne peut modifier que les biens et les pièces qu’il a créés (« ' + (cp.name || cp.id) + ' »).');
      const nb = new Map(lb.map(x => [x.id, x]));
      for (const x of la) if (!eq(nb.get(x.id), x)) deny('Un gérant ne peut pas modifier les passages d’une pièce qu’il n’a pas créée.');
    }
    if (!ownListing) {
      const strip = l => { const { points, ...rest } = l; return rest; };
      const a = strip(cl), b = strip(nl);
      delete a.start; delete b.start;   // la pièce de départ de la visite peut être choisie par un gérant
      if (a.cover === null || a.cover === undefined) { delete a.cover; delete b.cover; }
      if (!eq(a, b)) deny('Un gérant ne peut pas modifier les infos ni le prix de « ' + (cl.name || cl.id) + ' » : ce bien a été créé par quelqu’un d’autre.');
    }
  }
}

// règles du décorateur : il crée, modifie et supprime ses propres décorations, et rien d'autre
function checkDecorateur(cur, next, me) {
  if (!eq(cur.site === undefined ? null : cur.site, next.site === undefined ? null : next.site)) deny('Seul un admin peut modifier les pages du site.');
  const nextL = new Map(next.listings.map(l => [l.id, l]));
  for (const cl of cur.listings) {
    if (cl.deco === me.uid) continue;
    const nl = nextL.get(cl.id);
    if (!nl || !eq(cl, nl)) deny('Un décorateur ne peut modifier que ses propres décorations (« ' + (cl.name || cl.id) + ' »).');
  }
}
// chaque décoration est faite dans un intérieur du catalogue (bouton « Sans la déco » pendant la visite) :
// sans cet intérieur, on ne peut pas créer de pièce dans la décoration
function checkBases(cur, next) {
  const curL = new Map(cur.listings.map(l => [l.id, l]));
  const catalogue = new Set(next.listings.filter(l => !l.deco).map(l => l.id));
  next.listings.forEach(l => {
    if (!l.deco) { delete l.base; return; }
    if (l.base === l.id) delete l.base;
    const before = new Set(((curL.get(l.id) || {}).points || []).map(p => p.id));
    if (l.points.some(p => !before.has(p.id)) && !catalogue.has(l.base)) bad('Choisis d’abord l’intérieur du catalogue de la décoration « ' + (l.name || 'Sans nom') + ' » : sans lui, on ne peut pas créer ses pièces.');
  });
}
// catégories « Décorateurs » : un compte décorateur = une catégorie ; celle d'un compte supprimé reste tant qu'elle contient des décorations
const okPhoto = v => typeof v === 'string' && PHOTO_RE.test(v);
function decoEntry(id, name, photo, banner) {
  const x = { id, name };
  if (okPhoto(photo)) x.photo = photo;
  if (okPhoto(banner)) x.banner = banner;   // image de fond de la carte du décorateur
  return x;
}
function computeDecorators(staff, data, prev) {
  const list = Object.values(staff.users).filter(u => u.role === 'decorateur' && u.uid).map(u => decoEntry(u.uid, u.name || u.username, u.photo, u.banner));
  const ids = new Set(list.map(x => x.id));
  (prev || []).forEach(x => { if (!ids.has(x.id) && data.listings.some(l => l.deco === x.id)) { list.push(decoEntry(x.id, x.name, x.photo, x.banner)); ids.add(x.id); } });
  return list.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
// photos de profil et images de fond qui ne servent plus : ni à un compte, ni à une catégorie de décorateur
const imagesOf = x => [x.photo, x.banner].filter(Boolean);
function lostPhotos(before, after, staff) {
  const keep = new Set(Object.values(staff.users).flatMap(imagesOf).concat((after || []).flatMap(imagesOf)));
  return (before || []).flatMap(imagesOf).filter(p => PHOTO_RE.test(p) && !keep.has(p));
}
async function syncDecorators(env, staff) {
  const txt = await env.DB.get('data');
  if (!txt) return [];
  const data = JSON.parse(txt);
  const before = data.decorators || [];
  const list = computeDecorators(staff, data, before);
  if (eq(list, before)) return list;
  data.decorators = list; data.rev = (data.rev || 0) + 1; data.updated = new Date().toISOString();
  await env.DB.put('data', JSON.stringify(data, null, 1));
  await Promise.all(lostPhotos(before, list, staff).map(k => env.DB.delete(k)));
  return list;
}

// ------------------------------------------------------------------ avis des clients
const reviewHits = new Map();
async function postReview(request, env) {
  const body = await readJson(request);
  const reviews = await getJSON(env, 'reviews', []);
  if (body.website) return json({ ok: true, items: reviews });   // champ piège rempli par les robots
  const clean = (v, n) => String(v || '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, n);
  const name = clean(body.name, 60).replace(/\n/g, ' '), text = clean(body.text, 1000), stars = Math.round(+body.stars);
  if (name.length < 2) bad('Indique ton nom et ton prénom.');
  if (!(stars >= 1 && stars <= 5)) bad('Choisis une note de 1 à 5 étoiles.');
  if (text.length < 5) bad('Écris quelques mots sur ton expérience.');
  const ip = request.headers.get('CF-Connecting-IP') || '', now = Date.now();
  const recent = (reviewHits.get(ip) || []).filter(t => now - t < 3600 * 1000);
  if (recent.length >= 3) throw new HttpError(429, 'throttled', 'Tu as déjà publié plusieurs avis récemment. Réessaie plus tard.');
  const today = new Date(now).toISOString().slice(0, 10);
  if (reviews.filter(r => String(r.at).slice(0, 10) === today).length >= 100) throw new HttpError(429, 'throttled', 'Trop d’avis aujourd’hui. Réessaie demain.');
  recent.push(now); reviewHits.set(ip, recent); if (reviewHits.size > 5000) reviewHits.clear();
  reviews.unshift({ id: 'r' + now.toString(36) + rid(4), name, stars, text, at: new Date(now).toISOString() });
  const kept = reviews.slice(0, 1000);
  await env.DB.put('reviews', JSON.stringify(kept));
  return json({ ok: true, items: kept });
}
async function deleteReview(env, me, id) {
  const reviews = await getJSON(env, 'reviews', []);
  const r = reviews.find(x => x.id === id);
  if (!r) throw new HttpError(404, 'not_found', 'Cet avis n’existe plus.');
  const kept = reviews.filter(x => x.id !== id);
  await env.DB.put('reviews', JSON.stringify(kept));
  await addLog(env, me.username, ['a supprimé l’avis de ' + r.name + ' (' + r.stars + ' étoile' + (r.stars > 1 ? 's' : '') + ')']);
  return json({ ok: true, items: kept });
}

// ------------------------------------------------------------------ comptes
async function getStaff(env) {
  const txt = await env.DB.get('staff');
  const s = txt ? JSON.parse(txt) : null;
  const staff = s && isObj(s.users) ? s : { users: {} };
  // identifiant public stable de chaque compte (sert aux catégories des décorateurs)
  let changed = false;
  Object.values(staff.users).forEach(u => { if (!u.uid) { u.uid = 'u' + rid(9); changed = true; } });
  if (changed) await putStaff(env, staff);
  return staff;
}
const putStaff = (env, s) => env.DB.put('staff', JSON.stringify(s));
const publicUser = u => ({ username: u.username, role: u.role, uid: u.uid, name: u.name || u.username, photo: u.photo || null, banner: u.banner || null });

const enc = new TextEncoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64url = buf => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = s => unb64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));

async function hashPassword(password, saltBytes) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: ITER }, key, 256));
}
function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
async function makeUser(username, password, role, name) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPassword(password, salt);
  return { username, role, name: name || username, uid: 'u' + rid(9), salt: b64(salt), hash: b64(hash), v: 1, created: new Date().toISOString() };
}
const cleanName = (v, fallback) => (String(v || '').replace(/\s+/g, ' ').trim().slice(0, 40) || fallback);
function checkNewPassword(p) {
  if (typeof p !== 'string' || p.length < 8) bad('Le mot de passe doit faire au moins 8 caractères.');
  if (p.length > 200) bad('Mot de passe trop long.');
}
function cleanUsername(u) {
  const n = String(u || '').trim().toLowerCase();
  if (!USER_RE.test(n)) bad('Identifiant non valable : 3 à 24 caractères, lettres, chiffres, point, tiret ou tiret bas.');
  return n;
}

async function sessionKey(env) {
  let s = await env.DB.get('secret');
  if (!s) { s = b64(crypto.getRandomValues(new Uint8Array(32))); await env.DB.put('secret', s); }
  return crypto.subtle.importKey('raw', unb64(s), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function issueSession(env, u) {
  const payload = b64url(enc.encode(JSON.stringify({ u: u.username, v: u.v, exp: Date.now() + SESSION_MS })));
  const sig = await crypto.subtle.sign('HMAC', await sessionKey(env), enc.encode(payload));
  return { token: payload + '.' + b64url(sig), user: publicUser(u) };
}
async function auth(request, env) {
  const h = request.headers.get('Authorization') || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [payload, sig] = tok.split('.');
  const expired = () => { throw new HttpError(401, 'session', 'Session expirée : reconnecte-toi.'); };
  if (!payload || !sig) expired();
  let ok = false;
  try { ok = await crypto.subtle.verify('HMAC', await sessionKey(env), unb64url(sig), enc.encode(payload)); } catch (e) { ok = false; }
  if (!ok) expired();
  let p; try { p = JSON.parse(new TextDecoder().decode(unb64url(payload))); } catch (e) { expired(); }
  if (!p || p.exp < Date.now()) expired();
  const u = (await getStaff(env)).users[p.u];
  if (!u || u.v !== p.v) expired();
  return u;
}

// limite des essais de mot de passe (par instance du serveur)
const attempts = new Map();
function throttled(key) {
  const a = attempts.get(key);
  return a && a.n >= 6 && Date.now() - a.t < 10 * 60 * 1000;
}
function failed(key) {
  const a = attempts.get(key);
  if (!a || Date.now() - a.t > 10 * 60 * 1000) attempts.set(key, { n: 1, t: Date.now() });
  else a.n++;
  if (attempts.size > 5000) attempts.clear();
}

async function readJson(request) {
  try { return await request.json(); } catch (e) { bad('Requête illisible.'); }
}
async function setup(request, env) {
  const body = await readJson(request);
  const staff = await getStaff(env);
  if (Object.keys(staff.users).length) deny('Le compte administrateur existe déjà.');
  const username = cleanUsername(body.username);
  checkNewPassword(body.password);
  const u = await makeUser(username, body.password, 'admin');
  staff.users[username] = u;
  await putStaff(env, staff);
  if (!(await env.DB.get('data'))) {
    const seed = await currentData(env);
    sanitize(seed, true);
    seed.rev = 1; seed.updated = new Date().toISOString();
    await env.DB.put('data', JSON.stringify(seed, null, 1));
  }
  return json(await issueSession(env, u));
}
async function login(request, env) {
  const body = await readJson(request);
  const username = String(body.username || '').trim().toLowerCase();
  const key = (request.headers.get('CF-Connecting-IP') || '') + '|' + username;
  if (throttled(key)) throw new HttpError(429, 'throttled', 'Trop d’essais. Réessaie dans 10 minutes.');
  const u = (await getStaff(env)).users[username];
  const salt = u ? unb64(u.salt) : new Uint8Array(16);
  const h = await hashPassword(String(body.password || ''), salt);
  if (!u || !sameBytes(h, unb64(u.hash))) {
    failed(key);
    await new Promise(r => setTimeout(r, 400));
    throw new HttpError(401, 'login', 'Identifiant ou mot de passe incorrect.');
  }
  attempts.delete(key);
  return json(await issueSession(env, u));
}
async function changeOwnPassword(request, env, me) {
  const body = await readJson(request);
  const h = await hashPassword(String(body.current || ''), unb64(me.salt));
  if (!sameBytes(h, unb64(me.hash))) throw new HttpError(401, 'login', 'Mot de passe actuel incorrect.');
  checkNewPassword(body.password);
  const staff = await getStaff(env);
  const nu = await makeUser(me.username, body.password, me.role, me.name);
  nu.created = me.created; nu.uid = me.uid; nu.v = (me.v || 1) + 1;
  if (me.photo) nu.photo = me.photo;
  if (me.banner) nu.banner = me.banner;
  staff.users[me.username] = nu;
  await putStaff(env, staff);
  return json(await issueSession(env, nu));
}
async function listStaff(env) {
  const staff = await getStaff(env);
  return json({ users: Object.values(staff.users).map(u => ({ username: u.username, name: u.name || u.username, role: u.role, uid: u.uid, photo: u.photo || null, banner: u.banner || null, created: u.created })).sort((a, b) => a.username.localeCompare(b.username)) });
}
async function createStaff(request, env, me) {
  const body = await readJson(request);
  const username = cleanUsername(body.username);
  if (!ROLES.includes(body.role)) bad('Grade inconnu.');
  checkNewPassword(body.password);
  const staff = await getStaff(env);
  if (staff.users[username]) bad('Cet identifiant est déjà pris.');
  staff.users[username] = await makeUser(username, body.password, body.role, cleanName(body.name, username));
  await putStaff(env, staff);
  await syncDecorators(env, staff);
  await addLog(env, me.username, ['a créé le compte de ' + username + ' (' + ROLE_LABEL[body.role] + ')']);
  return listStaff(env);
}
const adminCount = staff => Object.values(staff.users).filter(u => u.role === 'admin').length;
async function updateStaff(request, env, me, name) {
  const body = await readJson(request);
  const staff = await getStaff(env);
  const u = staff.users[name];
  if (!u) throw new HttpError(404, 'not_found', 'Compte introuvable.');
  const logs = [];
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) bad('Grade inconnu.');
    if (u.role === 'admin' && body.role !== 'admin' && adminCount(staff) <= 1) bad('Il faut garder au moins un admin.');
    if (u.role !== body.role) { u.role = body.role; u.v = (u.v || 1) + 1; logs.push('a changé le grade de ' + name + ' : ' + ROLE_LABEL[body.role]); }
  }
  if (body.name !== undefined) {
    const nn = cleanName(body.name, u.username);
    if (nn !== (u.name || u.username)) { u.name = nn; logs.push('a renommé le compte de ' + name + ' en « ' + nn + ' »'); }
  }
  if (body.password !== undefined) {
    checkNewPassword(body.password);
    const nu = await makeUser(u.username, body.password, u.role);
    u.salt = nu.salt; u.hash = nu.hash; u.v = (u.v || 1) + 1;
    logs.push('a réinitialisé le mot de passe de ' + name);
  }
  await putStaff(env, staff);
  await syncDecorators(env, staff);
  await addLog(env, me.username, logs);
  return listStaff(env);
}
async function deleteStaff(env, me, name) {
  if (name === me.username) bad('Tu ne peux pas supprimer ton propre compte.');
  const staff = await getStaff(env);
  if (!staff.users[name]) throw new HttpError(404, 'not_found', 'Compte introuvable.');
  const imgs = imagesOf(staff.users[name]);
  delete staff.users[name];
  await putStaff(env, staff);
  const decos = await syncDecorators(env, staff);
  // la photo et l'image de fond restent tant que la catégorie du décorateur existe (elle contient encore des décorations)
  const kept = new Set(decos.flatMap(imagesOf));
  await Promise.all(imgs.filter(k => !kept.has(k)).map(k => env.DB.delete(k)));
  await addLog(env, me.username, ['a supprimé le compte de ' + name]);
  return listStaff(env);
}

// photo de profil (kind « photo ») ou image de fond de la carte d'un décorateur (kind « banner ») :
// chacun change la sienne, un admin peut changer celle de n'importe quel compte
async function setPhoto(request, env, me, name, remove, kind) {
  kind = kind === 'banner' ? 'banner' : 'photo';
  const what = kind === 'banner' ? 'l’image de fond' : 'la photo de profil';
  if (name !== me.username && me.role !== 'admin') deny('Seul un admin peut changer ' + what + ' d’un autre compte.');
  let buf = null;
  if (!remove) {
    if (!/^image\/jpeg/i.test(request.headers.get('Content-Type') || '')) bad('Seules les images JPEG sont acceptées.');
    if (+(request.headers.get('Content-Length') || 0) > MAX_PHOTO) throw new HttpError(413, 'too_large', 'Photo trop lourde (2 Mo maximum).');
    buf = await request.arrayBuffer();
    if (buf.byteLength > MAX_PHOTO) throw new HttpError(413, 'too_large', 'Photo trop lourde (2 Mo maximum).');
    const b = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
    if (buf.byteLength < 4 || b[0] !== 0xff || b[1] !== 0xd8) bad('Ce fichier n’est pas une image JPEG.');
  }
  const staff = await getStaff(env);
  const u = staff.users[name];
  if (!u) throw new HttpError(404, 'not_found', 'Compte introuvable.');
  if (kind === 'banner' && !remove && u.role !== 'decorateur') bad('Seuls les décorateurs ont une image de fond.');
  const old = u[kind] || null;
  if (remove) {
    if (!old) return json({ ok: true, user: publicUser(u) });
    delete u[kind];
  } else {
    u[kind] = 'media/staff/' + u.uid + (kind === 'banner' ? '-b-' : '-') + rid(6) + '.jpg';
    await env.DB.put(u[kind], buf, { metadata: { by: me.username, at: Date.now() } });
  }
  await putStaff(env, staff);
  const decos = await syncDecorators(env, staff);
  if (old && !decos.some(x => imagesOf(x).includes(old))) await env.DB.delete(old);
  if (name !== me.username) await addLog(env, me.username, [(remove ? 'a retiré ' : 'a changé ') + what + ' de ' + name]);
  return json({ ok: true, user: publicUser(u) });
}
