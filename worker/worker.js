/* API Dynasty 8 : comptes employés (admin, gérant), catalogue et images des pièces.
   Cloudflare Worker avec un espace de stockage KV lié sous le nom « DB ».
   Clés KV : data (catalogue), staff (comptes), secret (clé de signature des sessions), media/… (images). */

const MEDIA_RE = /^media\/[a-z0-9-]{1,60}\/[a-z0-9-]{1,80}\.jpg$/;
const STATIC_RE = /^[a-z0-9_-]{1,60}\.(jpg|png)$/i;
const ID_RE = /^[a-z0-9-]{1,60}$/;
const USER_RE = /^[a-z0-9._-]{3,24}$/;
const ROLES = ['admin', 'gerant'];
const OLD_TYPES = { Bureau: 'Bureaux', Villa: 'Maison', Commerce: 'Location Pro', Entrepot: 'Entrepôt', Garage: 'Intérieur vide', Terrain: 'Intérieur vide' };
const ITER = 5000;
const SESSION_MS = 30 * 24 * 3600 * 1000;
const MAX_IMAGE = 20 * 1024 * 1024;
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
  if (path.startsWith('/api/media/') && m === 'PUT') return putMedia(request, env, me, path.slice('/api/'.length));
  if (path === '/api/save' && m === 'POST') return save(request, env, me);
  if (path === '/api/staff' || path.startsWith('/api/staff/')) {
    if (me.role !== 'admin') deny('Seul un admin peut gérer les comptes.');
    const name = decodeURIComponent(path.slice('/api/staff/'.length) || '');
    if (path === '/api/staff' && m === 'GET') return listStaff(env);
    if (path === '/api/staff' && m === 'POST') return createStaff(request, env);
    if (name && m === 'PATCH') return updateStaff(request, env, me, name);
    if (name && m === 'DELETE') return deleteStaff(env, me, name);
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
  if (me.role !== 'admin') checkGerant(cur, next, me);

  const deletes = Array.isArray(body.deletes) ? body.deletes : [];
  if (deletes.length && me.role !== 'admin') deny('Un gérant ne peut rien supprimer.');
  const used = new Set();
  next.listings.forEach(l => { used.add(l.cover); l.points.forEach(p => { used.add(p.image); used.add(p.imageSmall); }); });
  const toDelete = deletes.filter(p => typeof p === 'string' && MEDIA_RE.test(p) && !used.has(p));

  next.version = 1;
  next.rev = (cur.rev || 0) + 1;
  next.updated = new Date().toISOString();
  next.updatedBy = me.username;
  const out = JSON.stringify(next, null, 1);
  if (out.length > MAX_DATA) throw new HttpError(413, 'too_large', 'Catalogue trop volumineux.');
  await env.DB.put('data', out);
  await Promise.all(toDelete.map(k => env.DB.delete(k)));
  return json({ ok: true, data: next });
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
    l.price = numOrNull(l.price); l.garagePrice = numOrNull(l.garagePrice);
    delete l.district; delete l.surface; delete l.rooms; delete l.garage;
    l.description = str(l.description, 4000);
    l.features = Array.isArray(l.features) ? l.features.map(f => str(f, 80)).filter(Boolean).slice(0, 30) : [];
    l.cover = imgPath(l.cover); l.order = isFinite(+l.order) ? +l.order : 0; l.created = str(l.created, 30);
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
}

// l'auteur d'un bien ou d'une pièce est fixé par le serveur, à la création
function stampAuthors(cur, next, me) {
  const curL = new Map(cur.listings.map(l => [l.id, l]));
  next.listings.forEach(l => {
    const cl = curL.get(l.id);
    if (cl) { if (cl.createdBy) l.createdBy = cl.createdBy; else delete l.createdBy; }
    else l.createdBy = me.username;
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
  const nextL = new Map(next.listings.map(l => [l.id, l]));
  for (const cl of cur.listings) {
    const nl = nextL.get(cl.id);
    if (!nl) deny('Un gérant ne peut pas supprimer un bien.');
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

// ------------------------------------------------------------------ comptes
async function getStaff(env) {
  const txt = await env.DB.get('staff');
  const s = txt ? JSON.parse(txt) : null;
  return s && isObj(s.users) ? s : { users: {} };
}
const putStaff = (env, s) => env.DB.put('staff', JSON.stringify(s));
const publicUser = u => ({ username: u.username, role: u.role });

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
async function makeUser(username, password, role) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPassword(password, salt);
  return { username, role, salt: b64(salt), hash: b64(hash), v: 1, created: new Date().toISOString() };
}
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
  const nu = await makeUser(me.username, body.password, me.role);
  nu.created = me.created; nu.v = (me.v || 1) + 1;
  staff.users[me.username] = nu;
  await putStaff(env, staff);
  return json(await issueSession(env, nu));
}
async function listStaff(env) {
  const staff = await getStaff(env);
  return json({ users: Object.values(staff.users).map(u => ({ username: u.username, role: u.role, created: u.created })).sort((a, b) => a.username.localeCompare(b.username)) });
}
async function createStaff(request, env) {
  const body = await readJson(request);
  const username = cleanUsername(body.username);
  if (!ROLES.includes(body.role)) bad('Grade inconnu.');
  checkNewPassword(body.password);
  const staff = await getStaff(env);
  if (staff.users[username]) bad('Cet identifiant est déjà pris.');
  staff.users[username] = await makeUser(username, body.password, body.role);
  await putStaff(env, staff);
  return listStaff(env);
}
const adminCount = staff => Object.values(staff.users).filter(u => u.role === 'admin').length;
async function updateStaff(request, env, me, name) {
  const body = await readJson(request);
  const staff = await getStaff(env);
  const u = staff.users[name];
  if (!u) throw new HttpError(404, 'not_found', 'Compte introuvable.');
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) bad('Grade inconnu.');
    if (u.role === 'admin' && body.role !== 'admin' && adminCount(staff) <= 1) bad('Il faut garder au moins un admin.');
    if (u.role !== body.role) { u.role = body.role; u.v = (u.v || 1) + 1; }
  }
  if (body.password !== undefined) {
    checkNewPassword(body.password);
    const nu = await makeUser(u.username, body.password, u.role);
    u.salt = nu.salt; u.hash = nu.hash; u.v = (u.v || 1) + 1;
  }
  await putStaff(env, staff);
  return listStaff(env);
}
async function deleteStaff(env, me, name) {
  if (name === me.username) bad('Tu ne peux pas supprimer ton propre compte.');
  const staff = await getStaff(env);
  if (!staff.users[name]) throw new HttpError(404, 'not_found', 'Compte introuvable.');
  delete staff.users[name];
  await putStaff(env, staff);
  return listStaff(env);
}
