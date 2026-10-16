/* Catalogue Dynasty 8 : catalogue public, visite 360°, espace employé (admin, gérant : création des biens,
   pièces, étiquettes, passages) et enregistrement sur le serveur de l'agence. */
(function () {
  'use strict';
  const D2R = Math.PI / 180;
  const $ = id => document.getElementById(id);
  // serveur de l'agence (comptes employés, catalogue, images des pièces) : adresse dans <meta name="d8-api">
  const API = ((document.querySelector('meta[name="d8-api"]') || {}).content || '').trim().replace(/\/+$/, '');
  const SHARE_BASE = API ? location.origin + location.pathname.replace(/index\.html?$/i, '') : 'https://claude.ai/artifact/7eJ2mP66hxVcGT49Gkc4ww';
  const ROLE_NAMES = { admin: 'Admin', gerant: 'Gérant', decorateur: 'Décorateur' };
  const TYPES = ['Maison', 'Appartement', 'Bureaux', 'Entrepôt', 'Motel/Hôtel', 'Location Pro', 'Intérieur vide'];
  const OLD_TYPES = { Bureau: 'Bureaux', Villa: 'Maison', Commerce: 'Location Pro', Entrepot: 'Entrepôt', Garage: 'Intérieur vide', Terrain: 'Intérieur vide' };
  const STATUSES = { disponible: 'Disponible', reserve: 'Réservé', vendu: 'Vendu', loue: 'Loué' };
  const DEALS = { vente: 'Vente', location: 'Location' };
  const PERIODS = { semaine: 'semaine', mois: 'mois', jour: 'jour' };

  const FALLBACK = {
    version: 1, updated: '2026-10-13T02:30:00.000Z',
    listings: [{
      id: 'bureau-1', name: 'Bureau #1', type: 'Bureaux', deal: 'vente', price: null, period: 'semaine', status: 'disponible',
      garagePrice: null, description: '', features: [],
      cover: 'preview.jpg', start: 'chambre', order: 0, created: '2026-10-13',
      points: [
        {
          id: 'chambre', name: 'Chambre', image: 'pano.jpg', imageSmall: 'pano_2k.jpg', north: 0.4, yaw: 0, pitch: -4,
          pins: [
            { id: 'p1', yaw: -16, pitch: 14, label: 'Baie vitrée', text: 'Vue dégagée sur le centre-ville' },
            { id: 'p2', yaw: 180, pitch: 6, label: 'Chambre', text: 'Lit double, éclairage indirect' }],
          links: [{ id: 'l1', target: 'piece', yaw: 67, pitch: -23 }]
        },
        {
          id: 'piece', name: 'Pièce de vie', image: 'pdv.jpg', imageSmall: 'pdv_2k.jpg', north: -3, yaw: 0, pitch: -4,
          pins: [
            { id: 'p3', yaw: -102, pitch: 5, label: 'Cuisine', text: 'Îlot central, double four' },
            { id: 'p4', yaw: 87, pitch: -12, label: 'Salon', text: 'Grand canapé d’angle' }],
          links: [{ id: 'l2', target: 'chambre', yaw: -68, pitch: -16.5 }]
        }]
    }]
  };

  // ------------------------------------------------------------------ état
  const state = {
    data: null, saved: '', baseUpdated: '',
    pending: new Map(),   // chemin -> Blob à publier
    urls: new Map(),      // chemin -> URL locale (images pas encore publiées)
    removed: new Set(),   // fichiers media/ à supprimer au prochain enregistrement
    agent: false, canEdit: false, artifact: null, readOnly: false,
    session: null, user: null,       // employé connecté : { username, role }
    uploaded: new Set(),             // images déjà envoyées au serveur (en cas de nouvel essai)
    filter: { type: 'all', deal: 'all', sort: 'recent', q: '' },
    saving: false
  };

  // ------------------------------------------------------------------ utilitaires
  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].concat(kids || [])) if (c !== null && c !== undefined && c !== false) n.append(c.nodeType ? c : document.createTextNode(c));
    return n;
  }
  const ICON = {
    pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.4 6.4 20.3l1.1-6.2L3 9.7l6.2-.9Z"/></svg>',
    starFill: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.4 6.4 20.3l1.1-6.2L3 9.7l6.2-.9Z"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>'
  };
  function iconBtn(icon, label, onclick) { return el('button', { type: 'button', 'aria-label': label, title: label, html: ICON[icon], onclick }); }
  const rid = n => Math.random().toString(36).slice(2, 2 + (n || 6));
  function slugify(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'bien';
  }
  function uniqueId(base, taken) {
    let id = base, k = 2;
    while (taken.includes(id)) id = base + '-' + (k++);
    return id;
  }
  const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  // prix fixe, ou fourchette « 1 000 $ – 2 000 $ » quand un prix maximum est indiqué
  const isNum = v => v !== null && v !== undefined && v !== '' && !isNaN(+v);
  function priceParts(l) {
    const lo = isNum(l.price) ? +l.price : null, hi = isNum(l.priceMax) ? +l.priceMax : null;
    if (lo === null && hi === null) return { text: 'Prix sur demande', ask: true };
    const per = l.deal === 'location' ? ' / ' + (PERIODS[l.period] || 'semaine') : '';
    const $$ = v => nf.format(v) + '\u00a0$';   // le montant et « $ » restent sur la même ligne
    if (lo !== null && hi !== null && hi > lo) return { text: $$(lo) + ' – ' + $$(hi), per, range: true };
    if (lo === null) return { text: 'Jusqu’à ' + $$(hi), per, range: true };
    return { text: $$(lo), per };
  }
  // option garage : supplément affiché sous le prix (« + Option garage : +750 $ / semaine »)
  function optionText(l) {
    const g = l.garagePrice;
    if (g === null || g === undefined || g === '' || isNaN(+g) || +g <= 0) return null;
    return '+' + nf.format(+g) + ' $' + (l.deal === 'location' ? ' / ' + (PERIODS[l.period] || 'semaine') : '');
  }
  function optionEl(l) {
    const t = optionText(l);
    return t ? el('p', { class: 'opt' }, ['Option garage : ', el('b', { text: t })]) : null;
  }
  // « Bureaux en location », « Maison en vente »
  function kindOf(l) { return l.deco ? 'Décoration par ' + decoName(l.deco) : (l.type || 'Bien') + ' en ' + (DEALS[l.deal] || 'Vente').toLowerCase(); }
  const hasPrice = l => isNum(l.price) || isNum(l.priceMax);

  // accueil : le panorama du bien à l'affiche défile lentement (une image 360° se raccorde à elle-même)
  let heroImg = null, heroPick = null;
  function renderHero() {
    const d = state.data; if (!d || !$('hero')) return;
    const open = d.listings.filter(l => !l.deco && l.points.length && (l.status === 'disponible' || l.status === 'reserve'));
    const pool = open.length ? open : d.listings.filter(l => !l.deco && l.points.length);
    // un bien tiré au hasard à chaque visite du site (il reste le même pendant la navigation)
    let f = pool.find(l => l.id === heroPick);
    if (!f && pool.length) { f = pool[Math.floor(Math.random() * pool.length)]; heroPick = f.id; }
    const fe = $('heroFeature');
    let url = 'pano_2k.jpg';
    if (f) {
      const p = pointOf(f, f.start) || f.points[0];
      url = mediaURL(p.imageSmall || p.image);
      fe.hidden = false; fe.href = '#' + f.id;
      $('heroName').textContent = 'Visiter ' + f.name;
      const pr = priceParts(f); $('heroPrice').textContent = pr.text + (pr.per || '');
    } else fe.hidden = true;
    if (url === heroImg) return;
    heroImg = url;
    const pano = $('heroPano'), img = new Image();
    img.onload = () => { if (heroImg !== url) return; pano.style.setProperty('--hero-img', 'url("' + url + '")'); sizeHero(); pano.classList.add('ready'); };
    img.src = url;
  }
  function sizeHero() {
    const h = $('hero'), pano = $('heroPano'); if (!h || !pano) return;
    const tile = Math.round(h.clientHeight * 1.65 * 2);
    pano.style.setProperty('--tile', tile + 'px');
    pano.style.setProperty('--pan', Math.round(tile / 22) + 's');
  }
  window.addEventListener('resize', sizeHero);

  function priceEl(l, cls) {
    const p = priceParts(l);
    return el('p', { class: 'price' + (p.ask ? ' ask' : '') + (p.range ? ' range' : '') + (cls ? ' ' + cls : '') }, [p.text, p.per ? el('small', { text: p.per }) : null]);
  }
  function mediaURL(path) {
    if (!path) return '';
    if (state.urls.has(path)) return state.urls.get(path);
    return API && path.startsWith('media/') ? API + '/' + path : path;
  }
  // photo de profil ronde (ou initiales si la personne n'a pas mis de photo)
  const initials = n => { const w = String(n || '').trim().split(/\s+/).filter(Boolean).map(x => Array.from(x)[0]); return w.length ? (w[0] + (w.length > 1 ? w[w.length - 1] : '')).toUpperCase() : '?'; };
  function avatarEl(name, photo, cls) {
    const a = el('span', { class: 'avatar' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' });
    if (photo) {
      const img = el('img', { src: mediaURL(photo), alt: '', decoding: 'async' });
      img.addEventListener('error', () => { a.textContent = initials(name); a.classList.remove('has-photo'); });
      a.classList.add('has-photo'); a.append(img);
    } else a.textContent = initials(name);
    return a;
  }
  // droits : l'admin peut tout ; le gérant crée des biens et des pièces et modifie ce qu'il a créé
  // droits : l'admin peut tout ; le gérant crée des biens et des pièces et modifie ce qu'il a créé ;
  // le décorateur ne touche qu'aux décorations de sa propre catégorie
  const me = () => state.user ? state.user.username : null;
  const myUid = () => state.user ? state.user.uid : null;
  const role = () => state.user ? state.user.role : 'admin';
  const isAdmin = () => role() === 'admin';
  const isGerant = () => role() === 'gerant';
  const isDeco = () => role() === 'decorateur';
  const ownDeco = l => !!l && isDeco() && !!l.deco && l.deco === myUid();
  const canEditListing = l => isAdmin() || (isGerant() && !!l && !l.deco && l.createdBy === me()) || ownDeco(l);
  const canEditPoint = (l, p) => canEditListing(l) || (isGerant() && !!l && !l.deco && !!p && p.createdBy === me());
  const canAddRoom = l => isAdmin() || (isGerant() && !!l && !l.deco) || ownDeco(l);
  const canDeleteListing = l => isAdmin() || ownDeco(l);
  let savedKeysCache = { src: null, keys: null };
  function savedHas(...ids) {
    if (savedKeysCache.src !== state.saved) {
      const keys = new Set();
      try {
        JSON.parse(state.saved).listings.forEach(l => {
          keys.add(l.id);
          (l.points || []).forEach(p => { keys.add(l.id + '/' + p.id); (p.links || []).forEach(k => keys.add(l.id + '/' + p.id + '/' + k.id)); });
        });
      } catch (e) { }
      savedKeysCache = { src: state.saved, keys };
    }
    return savedKeysCache.keys.has(ids.join('/'));
  }
  const canEditLink = (l, p, link) => canEditPoint(l, p) || (canAddRoom(l) && !savedHas(l.id, p.id, link.id));
  function wrapYaw(y) { return ((y % 360) + 540) % 360 - 180; }
  function listing(id) { return state.data.listings.find(l => l.id === id); }
  // décoration → intérieur du catalogue où elle a été faite
  const baseOf = l => { const b = l && l.deco && l.base ? listing(l.base) : null; return b && !b.deco ? b : null; };
  const interiors = () => state.data.listings.filter(x => !x.deco && x.points.length).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
  const roomKey = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  // la même pièce dans l'autre version (même nom, ou la seule pièce du bien)
  function twinRoom(p, t) {
    if (!p || !t) return null;
    const k = roomKey(p.name);
    return t.points.find(q => roomKey(q.name) === k) || (t.points.length === 1 ? t.points[0] : null);
  }
  function pointOf(l, id) { return l.points.find(p => p.id === id); }

  let toastTimer = null;
  function toast(msg, ms) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms || 3200);
  }
  function modal(title, text, actions) {
    return new Promise(resolve => {
      $('modalTitle').textContent = title; $('modalText').textContent = text;
      const acts = $('modalActs'); acts.innerHTML = '';
      (actions || [{ label: 'OK', value: true, cls: 'primary' }]).forEach(a => {
        acts.append(el('button', { type: 'button', class: 'btn ' + (a.cls || ''), text: a.label, onclick: () => { $('modal').hidden = true; resolve(a.value); } }));
      });
      $('modal').hidden = false;
      acts.lastChild && acts.lastChild.focus();
    });
  }
  function confirmBox(title, text, okLabel) {
    return modal(title, text, [{ label: 'Annuler', value: false }, { label: okLabel || 'Confirmer', value: true, cls: 'danger' }]);
  }

  // ------------------------------------------------------------------ données
  async function loadData() {
    if (API) {
      try {
        const r = await fetch(API + '/api/data', { cache: 'no-store' });
        if (r.ok) { const d = await r.json(); if (d && Array.isArray(d.listings)) return d; }
      } catch (e) { /* serveur injoignable : version publiée avec le site */ }
    }
    try {
      const r = await fetch('data.json', { cache: 'no-store' });
      if (r.ok) { const d = await r.json(); if (d && Array.isArray(d.listings)) return d; }
    } catch (e) { /* données intégrées */ }
    return JSON.parse(JSON.stringify(FALLBACK));
  }
  function isDirty() { return JSON.stringify(state.data) !== state.saved || state.pending.size > 0 || state.removed.size > 0; }
  function markDirty() {
    updateAgentBar();
    scheduleDraft();
  }
  function addMedia(path, blob) {
    state.pending.set(path, blob);
    state.urls.set(path, URL.createObjectURL(blob));
  }
  function dropMedia(path) {
    if (!path) return;
    if (state.pending.has(path)) {
      state.pending.delete(path);
      const u = state.urls.get(path); if (u) URL.revokeObjectURL(u);
      state.urls.delete(path);
    } else if (path.startsWith('media/')) state.removed.add(path);
    window.panoForgetTexture && window.panoForgetTexture(mediaURL(path));
  }
  function mediaOfListing(l) {
    const out = [l.cover];
    l.points.forEach(p => out.push(p.image, p.imageSmall));
    return out.filter(Boolean);
  }

  // brouillon local (en cas de rechargement avant l'enregistrement)
  const DB_NAME = 'dynasty8-drafts';
  function idb() {
    return new Promise((res, rej) => {
      try {
        const r = indexedDB.open(DB_NAME, 1);
        r.onupgradeneeded = () => r.result.createObjectStore('d');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
  }
  async function idbOp(mode, fn) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction('d', mode), st = tx.objectStore('d');
      const req = fn(st);
      tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error);
    });
  }
  let draftTimer = null;
  function scheduleDraft() {
    if (!state.canEdit) return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(async () => {
      try {
        if (!isDirty()) { await idbOp('readwrite', st => st.delete('draft')); return; }
        const media = [...state.pending.entries()].map(([path, blob]) => ({ path, blob }));
        await idbOp('readwrite', st => st.put({ base: state.baseUpdated, data: state.data, media, removed: [...state.removed], at: Date.now() }, 'draft'));
      } catch (e) { /* stockage indisponible : pas de brouillon */ }
    }, 800);
  }
  async function offerDraft() {
    let d = null;
    try { d = await idbOp('readonly', st => st.get('draft')); } catch (e) { return; }
    if (!d) return;
    if (d.base !== state.baseUpdated) { try { await idbOp('readwrite', st => st.delete('draft')); } catch (e) { } return; }
    const when = new Date(d.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    const ok = await modal('Modifications non enregistrées', 'Tu avais des modifications en cours (' + when + ') qui n’ont pas été enregistrées. Les reprendre ?',
      [{ label: 'Ignorer', value: false }, { label: 'Reprendre', value: true, cls: 'primary' }]);
    if (!ok) { try { await idbOp('readwrite', st => st.delete('draft')); } catch (e) { } return; }
    state.data = d.data;
    (d.media || []).forEach(m => addMedia(m.path, m.blob));
    (d.removed || []).forEach(p => state.removed.add(p));
    setAgent(true);
    renderCatalog(); markDirty(); route();
  }

  // ------------------------------------------------------------------ enregistrement
  async function save() {
    if ((!state.artifact && !state.session) || state.saving || !isDirty()) return;
    state.saving = true; updateAgentBar(); $('agentState').textContent = 'Enregistrement…';
    try {
      if (state.session) await saveApi();
      else await saveArtifact();
      state.pending.clear(); state.removed.clear(); state.uploaded.clear();
      try { await idbOp('readwrite', st => st.delete('draft')); } catch (e) { }
      toast('Enregistré. Les visiteurs voient maintenant cette version.', 4500);
    } catch (e) {
      const code = e && e.code;
      if (e && e.api) {
        if (e.status === 401) {
          await modal('Session expirée', 'Reconnecte-toi pour enregistrer. Tes modifications restent ici.');
          dropSession(); openLogin();
        } else if (e.status === 403) {
          const undo = await modal('Action non autorisée', e.message, [{ label: 'Garder mes modifications', value: false }, { label: 'Annuler mes modifications', value: true, cls: 'danger' }]);
          if (undo) await discardChanges();
        } else if (e.status === 413) {
          await modal('Trop lourd', e.message);
        } else if (e.status === 0) {
          await modal('Pas de connexion', e.message + ' Tes modifications restent ici.');
        } else {
          await modal('L’enregistrement a échoué', e.message + ' Réessaie dans un instant ; tes modifications restent ici.');
        }
      } else if (code === 'capability_disabled') {
        await modal('Enregistrement impossible pour l’instant',
          'Le lien de la page est en mode public, et la plateforme n’autorise pas l’enregistrement dans ce cas. Ouvre le menu Partager de la page, repasse l’accès en privé, clique de nouveau sur Enregistrer, puis remets le lien en public. Tes modifications restent ici en attendant.');
      } else if (code === 'conflict') {
        toast('Une autre version vient d’être enregistrée : la page se recharge.', 5000);
      } else if (code === 'not_writer' || code === 'not_granted' || code === 'not_declared') {
        state.readOnly = true;
        await modal('Lecture seule', 'Ce compte peut voir la page mais pas l’enregistrer.');
      } else if (code === 'too_large') {
        await modal('Trop lourd', 'Les images à enregistrer dépassent la taille autorisée en une fois. Enregistre après chaque pièce ajoutée.');
      } else if (code === 'rate_limited') {
        toast('Trop d’enregistrements rapprochés : réessaie dans une minute.', 5000);
      } else {
        await modal('L’enregistrement a échoué', 'Réessaie dans un instant. Tes modifications restent ici. (' + (code || (e && e.message) || 'erreur inconnue') + ')');
      }
    }
    state.saving = false; updateAgentBar();
  }
  async function saveArtifact() {
    const before = state.data.updated;
    state.data.updated = new Date().toISOString();
    const files = { 'data.json': { content: JSON.stringify(state.data, null, 1), contentType: 'application/json' } };
    for (const [p, b] of state.pending) files[p] = b;
    for (const p of state.removed) files[p] = null;
    try { await state.artifact.publish(files); }
    catch (e) { state.data.updated = before; throw e; }
    state.saved = JSON.stringify(state.data);
    state.baseUpdated = state.data.updated;
  }

  // ------------------------------------------------------------------ serveur de l'agence
  async function api(method, path, body, contentType) {
    const headers = {};
    if (state.session) headers.Authorization = 'Bearer ' + state.session;
    let payload;
    if (body instanceof Blob) { payload = body; headers['Content-Type'] = contentType || body.type || 'application/octet-stream'; }
    else if (body !== undefined) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
    let r;
    try { r = await fetch(API + path, { method, headers, body: payload, cache: 'no-store' }); }
    catch (e) { throw Object.assign(new Error('Le serveur ne répond pas. Vérifie ta connexion.'), { api: true, status: 0 }); }
    let j = null; try { j = await r.json(); } catch (e) { }
    if (!r.ok) throw Object.assign(new Error((j && j.message) || ('Erreur ' + r.status + '.')), { api: true, status: r.status, code: j && j.error });
    return j;
  }
  async function saveApi() {
    const todo = [...state.pending.entries()].filter(([p]) => !state.uploaded.has(p));
    let i = 0;
    for (const [path, blob] of todo) {
      $('agentState').textContent = 'Envoi des images… ' + (++i) + '/' + todo.length;
      await api('PUT', '/api/' + path, blob, 'image/jpeg');
      state.uploaded.add(path);
    }
    $('agentState').textContent = 'Enregistrement…';
    const r = await api('POST', '/api/save', { base: JSON.parse(state.saved), data: state.data, deletes: (isAdmin() || isDeco()) ? [...state.removed] : [] });
    adoptServerData(r.data);
  }
  // le serveur renvoie le catalogue fusionné (avec les changements des autres employés)
  function adoptServerData(d) {
    normalize(d);
    const canon = x => JSON.stringify(x, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((o, key) => { o[key] = v[key]; return o; }, {}) : v);
    const same = canon(d.listings) === canon(state.data.listings);
    const siteSame = canon(d.site) === canon(state.data.site);
    if (!siteSame && !$('sheet').hidden) closeSheet();
    if (same) {
      const keep = k => k === 'listings' || (k === 'site' && siteSame);
      Object.keys(state.data).forEach(k => { if (!keep(k)) delete state.data[k]; });
      Object.keys(d).forEach(k => { if (!keep(k)) state.data[k] = d[k]; });
    } else {
      const lid = visit.listing && visit.listing.id, pid = visit.point && visit.point.id;
      state.data = d;
      if (!$('sheet').hidden) closeSheet();
      if (lid) {
        const l = listing(lid);
        if (l && l.points.length) { visit.listing = l; visit.point = pointOf(l, pid) || null; if (visit.point) applyPoint(visit.point); setVisitTexts(); refreshVisitAgent(); }
        else leaveVisit();
      }
      toast('Enregistré. Le catalogue inclut aussi les derniers changements des autres employés.', 5000);
    }
    state.saved = JSON.stringify(state.data);
    state.baseUpdated = state.data.updated || '';
    renderCatalog(); refreshPage();
  }
  async function discardChanges() {
    for (const u of state.urls.values()) URL.revokeObjectURL(u);
    state.urls.clear(); state.pending.clear(); state.removed.clear(); state.uploaded.clear();
    let d = null;
    try { d = await api('GET', '/api/data'); } catch (e) { d = JSON.parse(state.saved); }
    normalize(d);
    state.data = d; state.saved = JSON.stringify(d); state.baseUpdated = d.updated || '';
    try { await idbOp('readwrite', st => st.delete('draft')); } catch (e) { }
    closeSheet(); renderCatalog();
    if (visit.listing) { const l = listing(visit.listing.id); visit.listing = null; visit.point = null; if (l && l.points.length) openVisit(l); else leaveVisit(); }
    updateAgentBar();
    toast('Modifications annulées.');
  }

  function useSession(s) {
    state.session = s.token; state.user = s.user; state.canEdit = true;
    try { localStorage.setItem('d8-session', JSON.stringify(s)); } catch (e) { }
    updateStaffUI();
  }
  function dropSession() {
    state.session = null; state.user = null; state.canEdit = false;
    try { localStorage.removeItem('d8-session'); } catch (e) { }
    setAgent(false);
  }
  async function logout() {
    if (isDirty() && !(await confirmBox('Se déconnecter ?', 'Tes modifications non enregistrées seront perdues.', 'Se déconnecter'))) return;
    try { await idbOp('readwrite', st => st.delete('draft')); } catch (e) { }
    const dirty = isDirty();
    dropSession(); closeSheet();
    if (dirty) { await discardLocal(); }
    toast('Déconnecté.');
  }
  async function discardLocal() {
    state.pending.clear(); state.removed.clear(); state.uploaded.clear();
    state.data = JSON.parse(state.saved); normalize(state.data);
    renderCatalog(); route();
  }
  function updateStaffUI() {
    const u = state.user;
    const tag = $('agentTag');
    if (tag) fill(tag, u ? [avatarEl(u.name || u.username, u.photo, 'xs'), u.username + ' (' + (ROLE_NAMES[u.role] || u.role) + ')'] : ['Mode agent']);
    if ($('staffBtn')) $('staffBtn').hidden = !(u && u.role === 'admin');
    if ($('histBtn')) $('histBtn').hidden = !(u && u.role === 'admin');
    if ($('accountBtn')) $('accountBtn').hidden = !u;
    const vt = document.querySelector('#vAgent .tag'); if (vt) vt.textContent = u ? ROLE_NAMES[u.role] : 'Mode agent';
  }
  function inputEnter(inputs, fn) { inputs.forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); fn(); } })); }

  async function openLogin() {
    let setupMode = false;
    try { setupMode = !!(await api('GET', '/api/status')).setup; } catch (e) { /* on tente la connexion normale */ }
    const user = el('input', { id: 'loginUser', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false' });
    const pass = el('input', { id: 'loginPass', type: 'password', autocomplete: setupMode ? 'new-password' : 'current-password' });
    const pass2 = setupMode ? el('input', { id: 'loginPass2', type: 'password', autocomplete: 'new-password' }) : null;
    const err = el('p', { class: 'note error', hidden: true });
    const btn = el('button', { type: 'button', class: 'btn primary', id: 'loginBtn', text: setupMode ? 'Créer le compte admin' : 'Se connecter' });
    const submit = async () => {
      if (btn.disabled) return;
      err.hidden = true;
      if (!user.value.trim() || !pass.value) { err.textContent = 'Remplis l’identifiant et le mot de passe.'; err.hidden = false; return; }
      if (setupMode && pass.value !== pass2.value) { err.textContent = 'Les deux mots de passe ne sont pas identiques.'; err.hidden = false; return; }
      btn.disabled = true;
      try {
        const s = await api('POST', setupMode ? '/api/setup' : '/api/login', { username: user.value.trim(), password: pass.value });
        useSession(s);
        closeSheet(); setAgent(true); offerDraft();
        if (!visit.listing) {
          if (s.user.role === 'decorateur') location.hash = '#/decorateurs/' + s.user.uid;
          else if (currentPage !== 'catalogue') location.hash = '#/catalogue';
        }
        toast('Connecté : ' + s.user.username + ' (' + ROLE_NAMES[s.user.role] + ').');
      } catch (e) { err.textContent = e.message; err.hidden = false; }
      btn.disabled = false;
    };
    btn.addEventListener('click', submit);
    inputEnter([user, pass].concat(pass2 ? [pass2] : []), submit);
    openSheet('Espace employé', [
      setupMode ? el('p', { class: 'note', text: 'Première connexion : aucun compte n’existe encore. Crée le compte administrateur, qui pourra ensuite créer les comptes des autres employés.' })
        : el('p', { class: 'help', text: 'Réservé aux employés de l’agence. Ton compte est créé par un admin.' }),
      field('Identifiant', user, setupMode ? '3 à 24 caractères : lettres, chiffres, point ou tiret.' : null),
      field('Mot de passe', pass, setupMode ? 'Au moins 8 caractères.' : null),
      pass2 ? field('Confirme le mot de passe', pass2) : null,
      err
    ], [btn]);
    setTimeout(() => user.focus(), 50);
  }

  const ROLE_HELP = {
    admin: 'Admin : tu peux tout faire, y compris gérer les comptes des employés et les pages du site.',
    gerant: 'Gérant : tu peux créer des biens, ajouter des pièces dans tous les biens et choisir la pièce de départ des visites. Tu modifies les biens et les pièces que tu as créés ; tu ne peux rien supprimer.',
    decorateur: 'Décorateur : tu as ta propre catégorie dans « Décorateurs ». Tu y crées, modifies et supprimes tes décorations, et tu ne touches pas au reste du site.'
  };
  function openAccountSheet() {
    const u = state.user; if (!u) return;
    const cur = el('input', { id: 'pwCurrent', type: 'password', autocomplete: 'current-password' });
    const nw = el('input', { id: 'pwNew', type: 'password', autocomplete: 'new-password' });
    const nw2 = el('input', { id: 'pwNew2', type: 'password', autocomplete: 'new-password' });
    const msg = el('p', { class: 'note error', hidden: true });
    const change = el('button', { type: 'button', class: 'btn primary', text: 'Changer le mot de passe' });
    const submit = async () => {
      msg.hidden = true; msg.className = 'note error';
      if (nw.value !== nw2.value) { msg.textContent = 'Les deux nouveaux mots de passe ne sont pas identiques.'; msg.hidden = false; return; }
      change.disabled = true;
      try {
        const s = await api('POST', '/api/password', { current: cur.value, password: nw.value });
        useSession(s); cur.value = nw.value = nw2.value = '';
        msg.className = 'note'; msg.textContent = 'Mot de passe changé.'; msg.hidden = false;
      } catch (e) { msg.textContent = e.message; msg.hidden = false; }
      change.disabled = false;
    };
    change.addEventListener('click', submit);
    inputEnter([cur, nw, nw2], submit);
    const afterPhoto = r => {
      useSession({ token: state.session, user: r.user });
      if (r.user.role === 'decorateur') refreshData();
      openAccountSheet();
    };
    openSheet('Mon compte', [
      photoBlock(u.name || u.username, u.photo, ROLE_NAMES[u.role],
        u.role === 'decorateur' ? 'Elle s’affiche sur ta carte dans « Décorateurs » et en haut de ta catégorie.' : 'Elle s’affiche dans la barre employé et dans la liste des comptes.',
        () => choosePhoto(async blob => afterPhoto(await api('PUT', '/api/me/photo', blob, 'image/jpeg')), openAccountSheet, 'Ma photo de profil'),
        async () => afterPhoto(await api('DELETE', '/api/me/photo'))),
      u.role === 'decorateur' ? bannerBlock(decoBanner({ id: u.uid, banner: u.banner }), !!u.banner, 'Elle s’affiche derrière ta photo sur ta carte dans « Décorateurs » et en haut de ta catégorie.',
        () => choosePhoto(async blob => afterPhoto(await api('PUT', '/api/me/banner', blob, 'image/jpeg')), openAccountSheet, 'Image de fond de ma carte', 'banner'),
        async () => afterPhoto(await api('DELETE', '/api/me/banner'))) : null,
      el('dl', { class: 'kv' }, [el('div', {}, [el('dt', { text: 'Identifiant' }), el('dd', { text: u.username })]), el('div', {}, [el('dt', { text: 'Grade' }), el('dd', { text: ROLE_NAMES[u.role] })])]),
      el('p', { class: 'help', text: ROLE_HELP[u.role] || '' }),
      el('h4', { class: 'subhead', text: 'Changer mon mot de passe' }),
      field('Mot de passe actuel', cur), field('Nouveau mot de passe', nw, 'Au moins 8 caractères.'), field('Confirme le nouveau', nw2), msg
    ], [change, el('button', { type: 'button', class: 'btn danger', id: 'logoutBtn', text: 'Se déconnecter', onclick: logout })]);
  }

  async function openStaffSheet() {
    const box = el('div', { class: 'stafflist' });
    const err = el('p', { class: 'note error', hidden: true });
    const showErr = e => { err.textContent = e.message; err.hidden = false; };
    const render = users => {
      box.innerHTML = '';
      users.forEach(u => {
        const role = el('select', {
          'aria-label': 'Grade de ' + u.username, onchange: async e => {
            err.hidden = true;
            try { render((await api('PATCH', '/api/staff/' + encodeURIComponent(u.username), { role: e.target.value })).users); toast('Grade de ' + u.username + ' : ' + ROLE_NAMES[e.target.value] + '.'); refreshData(); }
            catch (x) { showErr(x); e.target.value = u.role; }
          }
        }, Object.entries(ROLE_NAMES).map(([v, t]) => el('option', { value: v, text: t, selected: u.role === v })));
        const self = u.username === me();
        box.append(el('div', { class: 'staffitem' }, [
          avatarEl(u.name || u.username, u.photo),
          el('div', {}, [el('b', { text: (u.name || u.username) + (self ? ' (toi)' : '') }), el('small', { text: 'Identifiant : ' + u.username })]),
          role,
          el('div', { class: 'acts' }, [
            iconBtn('pencil', 'Modifier le compte de ' + u.username, () => openResetSheet(u)),
            self ? null : iconBtn('trash', 'Supprimer le compte de ' + u.username, async () => {
              if (!(await confirmBox('Supprimer le compte « ' + u.username + ' » ?', 'Cette personne ne pourra plus se connecter. Les biens et pièces qu’elle a créés restent dans le catalogue.', 'Supprimer'))) return;
              try { render((await api('DELETE', '/api/staff/' + encodeURIComponent(u.username))).users); toast('Compte supprimé.'); } catch (x) { showErr(x); }
            })
          ])
        ]));
      });
    };
    const nu = el('input', { id: 'staffUser', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', placeholder: 'ex. jean.dupont' });
    const np = el('input', { id: 'staffPass', type: 'text', autocomplete: 'off', spellcheck: 'false' });
    const nn = el('input', { id: 'staffName', autocomplete: 'off', placeholder: 'ex. Jean Dupont', maxlength: 40 });
    const nr = el('select', { id: 'staffRole' }, [el('option', { value: 'gerant', text: 'Gérant' }), el('option', { value: 'decorateur', text: 'Décorateur' }), el('option', { value: 'admin', text: 'Admin' })]);
    const add = el('button', { type: 'button', class: 'btn primary', id: 'staffAdd', html: ICON.plus + '<span>Créer le compte</span>' });
    const create = async () => {
      err.hidden = true; add.disabled = true;
      try {
        render((await api('POST', '/api/staff', { username: nu.value.trim(), password: np.value, role: nr.value, name: nn.value.trim() })).users);
        toast('Compte « ' + nu.value.trim().toLowerCase() + ' » créé. Donne-lui son identifiant et son mot de passe.' + (nr.value === 'decorateur' ? ' Sa catégorie apparaît dans « Décorateurs ».' : ''), 6000);
        if (nr.value === 'decorateur') refreshData();
        nu.value = ''; np.value = ''; nn.value = '';
      } catch (x) { showErr(x); }
      add.disabled = false;
    };
    add.addEventListener('click', create);
    inputEnter([nu, np, nn], create);
    openSheet('Comptes des employés', [
      el('p', { class: 'help', text: 'Admin : a droit à tout. Gérant : crée des biens, ajoute des pièces et choisit la pièce de départ des visites ; il modifie ce qu’il a créé et ne peut rien supprimer. Décorateur : a sa propre catégorie dans « Décorateurs » et n’y gère que ses décorations.' }),
      box, err,
      el('h4', { class: 'subhead', text: 'Nouveau compte' }),
      field('Identifiant', nu, 'Sert à se connecter.'), field('Nom affiché', nn, 'Ex. Jean Dupont. C’est le nom de la catégorie d’un décorateur.'),
      field('Mot de passe', np, 'Au moins 8 caractères. L’employé pourra le changer dans « Mon compte ».'), field('Grade', nr)
    ], [add]);
    box.append(el('p', { class: 'help', text: 'Chargement…' }));
    try { render((await api('GET', '/api/staff')).users); } catch (x) { box.innerHTML = ''; showErr(x); }
  }
  function openResetSheet(u, draft) {
    const nn = el('input', { id: 'editName', value: draft ? draft.name : (u.name || u.username), maxlength: 40 });
    const np = el('input', { id: 'resetPass', type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: 'Laisse vide pour ne pas le changer', value: draft ? draft.pass : '' });
    const back = () => openResetSheet(u, { name: nn.value, pass: np.value });
    const afterPhoto = r => {
      u.photo = r.user.photo; u.banner = r.user.banner;
      if (u.username === me()) useSession({ token: state.session, user: r.user });
      if (r.user.role === 'decorateur') refreshData();
      back();
    };
    const photoPath = '/api/staff/' + encodeURIComponent(u.username) + '/photo', bannerPath = '/api/staff/' + encodeURIComponent(u.username) + '/banner';
    const err = el('p', { class: 'note error', hidden: true });
    const ok = el('button', {
      type: 'button', class: 'btn primary', text: 'Enregistrer', onclick: async () => {
        err.hidden = true; ok.disabled = true;
        const body = { name: nn.value.trim() };
        if (np.value) body.password = np.value;
        try { await api('PATCH', '/api/staff/' + encodeURIComponent(u.username), body); toast('Compte de ' + u.username + ' mis à jour.'); refreshData(); openStaffSheet(); }
        catch (x) { err.textContent = x.message; err.hidden = false; }
        ok.disabled = false;
      }
    });
    openSheet('Compte de ' + u.username, [
      photoBlock(u.name || u.username, u.photo, ROLE_NAMES[u.role], u.role === 'decorateur' ? 'Elle s’affiche sur sa carte dans « Décorateurs ».' : null,
        () => choosePhoto(async blob => afterPhoto(await api('PUT', photoPath, blob, 'image/jpeg')), back, 'Photo de ' + (u.name || u.username)),
        async () => afterPhoto(await api('DELETE', photoPath))),
      u.role === 'decorateur' ? bannerBlock(decoBanner({ id: u.uid, banner: u.banner }), !!u.banner, null,
        () => choosePhoto(async blob => afterPhoto(await api('PUT', bannerPath, blob, 'image/jpeg')), back, 'Image de fond de ' + (u.name || u.username), 'banner'),
        async () => afterPhoto(await api('DELETE', bannerPath))) : null,
      field('Nom affiché', nn, 'Pour un décorateur, c’est le nom de sa catégorie.'),
      field('Nouveau mot de passe', np, 'Au moins 8 caractères. L’employé sera déconnecté de ses appareils.'), err
    ], [ok, el('button', { type: 'button', class: 'btn', text: 'Retour', onclick: openStaffSheet })]);
    setTimeout(() => nn.focus(), 50);
  }
  // bloc « photo de profil » : aperçu rond + changer / retirer (enregistré tout de suite, sans passer par « Enregistrer »)
  function photoBlock(name, photo, sub, help, onPick, onRemove) {
    const err = el('p', { class: 'note error', hidden: true });
    const del = photo ? el('button', {
      type: 'button', class: 'btn danger', id: 'photoDel', text: 'Retirer', onclick: async () => {
        err.hidden = true; del.disabled = true;
        try { await onRemove(); toast('Photo retirée.'); } catch (x) { err.textContent = x.message; err.hidden = false; del.disabled = false; }
      }
    }) : null;
    return el('div', { class: 'profile' }, [
      avatarEl(name, photo, 'xl'),
      el('div', { class: 'who' }, [
        el('b', { text: name }), sub ? el('small', { text: sub }) : null,
        el('div', { class: 'btns' }, [el('button', { type: 'button', class: 'btn', id: 'photoBtn', html: ICON.image + '<span>' + (photo ? 'Changer la photo' : 'Ajouter une photo') + '</span>', onclick: onPick }), del]),
        help ? el('small', { class: 'help', text: help }) : null, err
      ])
    ]);
  }
  // format du recadrage : photo de profil ronde, ou image de fond large (carte du décorateur)
  const CROP = {
    photo: { w: 300, h: 300, outW: 512, outH: 512, round: true, done: 'Photo de profil enregistrée.', help: 'Fais glisser la photo pour la placer dans le cercle et règle le zoom.', ok: 'Valider la photo' },
    banner: { w: 320, h: 140, outW: 1280, outH: 560, round: false, done: 'Image de fond enregistrée.', help: 'Fais glisser l’image pour choisir la partie visible et règle le zoom.', ok: 'Valider l’image' }
  };
  function choosePhoto(upload, back, title, kind) {
    const inp = el('input', { type: 'file', accept: 'image/*' });
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      let bmp; try { bmp = await createImageBitmap(f); } catch (e) { toast('Cette image n’a pas pu être lue.'); return; }
      cropSheet(bmp, upload, back, title, CROP[kind] || CROP.photo);
    });
    inp.click();
  }
  // recadrage : on fait glisser l'image dans le cadre et on règle le zoom
  function cropSheet(bmp, upload, back, title, o) {
    o = o || CROP.photo;
    const W = o.w, H = o.h, dpr = Math.min(2, window.devicePixelRatio || 1);
    const cv = el('canvas', { class: 'crop-cv', id: 'cropCanvas', width: W * dpr, height: H * dpr, tabindex: '0', 'aria-label': 'Aperçu : fais glisser pour placer l’image, flèches du clavier pour la déplacer' });
    const g = cv.getContext('2d');
    const min = Math.max(W / bmp.width, H / bmp.height);
    let z = 1, x = 0, y = 0;
    const sc = () => min * z;
    const clamp = () => { x = Math.min(0, Math.max(W - bmp.width * sc(), x)); y = Math.min(0, Math.max(H - bmp.height * sc(), y)); };
    const draw = () => { g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#0d1410'; g.fillRect(0, 0, W, H); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, x, y, bmp.width * sc(), bmp.height * sc()); };
    x = (W - bmp.width * sc()) / 2;
    y = o.round && bmp.height > bmp.width ? -(bmp.height * sc() - H) * 0.25 : (H - bmp.height * sc()) / 2;   // portrait : on vise le haut (le visage)
    clamp(); draw();
    const zoom = el('input', { type: 'range', id: 'cropZoom', min: '1', max: '5', step: '0.01', value: '1', 'aria-label': 'Zoom' });
    const zoomTo = nz => {
      nz = Math.max(1, Math.min(5, nz));
      const k = nz / z; x = W / 2 - (W / 2 - x) * k; y = H / 2 - (H / 2 - y) * k; z = nz;
      clamp(); draw(); zoom.value = String(z);
    };
    zoom.addEventListener('input', () => zoomTo(+zoom.value));
    let drag = null;
    cv.addEventListener('pointerdown', e => { drag = { px: e.clientX, py: e.clientY, k: W / cv.getBoundingClientRect().width }; cv.setPointerCapture(e.pointerId); cv.classList.add('dragging'); });
    cv.addEventListener('pointermove', e => { if (!drag) return; x += (e.clientX - drag.px) * drag.k; y += (e.clientY - drag.py) * drag.k; drag.px = e.clientX; drag.py = e.clientY; clamp(); draw(); });
    const stop = () => { drag = null; cv.classList.remove('dragging'); };
    cv.addEventListener('pointerup', stop); cv.addEventListener('pointercancel', stop);
    cv.addEventListener('wheel', e => { e.preventDefault(); zoomTo(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); }, { passive: false });
    cv.addEventListener('keydown', e => {
      const d = { ArrowLeft: [12, 0], ArrowRight: [-12, 0], ArrowUp: [0, 12], ArrowDown: [0, -12] }[e.key];
      if (d) { x += d[0]; y += d[1]; clamp(); draw(); e.preventDefault(); }
      if (e.key === '+' || e.key === '=') { zoomTo(z * 1.1); e.preventDefault(); }
      if (e.key === '-') { zoomTo(z / 1.1); e.preventDefault(); }
    });
    const err = el('p', { class: 'note error', hidden: true });
    const ok = el('button', {
      type: 'button', class: 'btn primary', id: 'cropOk', text: o.ok, onclick: async () => {
        err.hidden = true; ok.disabled = true; ok.textContent = 'Envoi…';
        try {
          const out = document.createElement('canvas'); out.width = o.outW; out.height = o.outH;
          const og = out.getContext('2d'), k = o.outW / W; og.imageSmoothingQuality = 'high';
          og.drawImage(bmp, x * k, y * k, bmp.width * sc() * k, bmp.height * sc() * k);
          await upload(await toBlob(out, 0.86));
          toast(o.done);
        } catch (x2) { err.textContent = x2.message || 'L’envoi a échoué.'; err.hidden = false; ok.disabled = false; ok.textContent = o.ok; }
      }
    });
    openSheet(title || 'Photo de profil', [
      el('p', { class: 'help', text: o.help }),
      el('div', { class: 'crop' + (o.round ? '' : ' wide'), style: { aspectRatio: W + ' / ' + H, width: 'min(' + W + 'px, 100%)' } }, [cv]),
      el('label', { class: 'crop-zoom', style: { width: 'min(' + W + 'px, 100%)' } }, [el('span', { text: 'Zoom' }), zoom]),
      err
    ], [ok, el('button', { type: 'button', class: 'btn', text: 'Annuler', onclick: back })]);
  }
  // fond de la carte d'un décorateur : son image de fond, sinon la couverture de sa dernière décoration
  function decoBanner(x) {
    if (x.banner) return mediaURL(x.banner);
    const items = state.data.listings.filter(l => l.deco === x.id && l.points.length && l.cover).sort((a, b) => (b.order || 0) - (a.order || 0));
    return items[0] ? mediaURL(items[0].cover) : '';
  }
  // bloc « image de fond » (décorateurs) : aperçu + changer / retirer
  function bannerBlock(bg, custom, help, onPick, onRemove) {
    const err = el('p', { class: 'note error', hidden: true });
    const del = custom ? el('button', {
      type: 'button', class: 'btn danger', id: 'bannerDel', text: 'Retirer', onclick: async () => {
        err.hidden = true; del.disabled = true;
        try { await onRemove(); toast('Image de fond retirée.'); } catch (x) { err.textContent = x.message; err.hidden = false; del.disabled = false; }
      }
    }) : null;
    return el('div', { class: 'field' }, [
      el('span', { text: 'Image de fond de la carte' }),
      el('div', { class: 'bannerprev' + (bg ? '' : ' empty'), style: bg ? { backgroundImage: 'url("' + bg + '")' } : {} }, [custom ? null : el('small', { text: bg ? 'Pour l’instant : couverture de la dernière décoration' : 'Pour l’instant : fond vert' })]),
      el('div', { class: 'btns' }, [el('button', { type: 'button', class: 'btn', id: 'bannerBtn', html: ICON.image + '<span>' + (custom ? 'Changer l’image de fond' : 'Choisir une image de fond') + '</span>', onclick: onPick }), del]),
      help ? el('small', { class: 'help', text: help }) : null, err
    ]);
  }
  // recharge le catalogue depuis le serveur (catégories des décorateurs) sans perdre les modifications en cours
  async function refreshData() {
    if (!API) return;
    try {
      const d = await api('GET', '/api/data');
      if (!d || !Array.isArray(d.decorators)) return;
      state.data.decorators = d.decorators;
      const base = JSON.parse(state.saved); base.decorators = d.decorators; state.saved = JSON.stringify(base);
      updateAgentBar(); renderCatalog(); refreshPage();
    } catch (e) { /* pas grave : visible au prochain chargement */ }
  }

  // ------------------------------------------------------------------ mode employé
  async function initCaps() {
    if (API) {
      $('agentBtn').hidden = false;
      let s = null; try { s = JSON.parse(localStorage.getItem('d8-session') || 'null'); } catch (e) { }
      if (s && s.token) {
        state.session = s.token;
        try {
          const r = await api('GET', '/api/me');
          useSession({ token: s.token, user: r.user });
          let on = false; try { on = sessionStorage.getItem('d8-agent') === '1'; } catch (e) { }
          if (on) setAgent(true);
          offerDraft();
        } catch (e) {
          if (e.status === 401) dropSession();
          else { state.session = null; }
        }
      }
      return;
    }
    if (!window.claude || typeof window.claude.use !== 'function') return;
    try {
      const [user, artifact] = await Promise.all([window.claude.use('user'), window.claude.use('artifact')]);
      if (!artifact) return;
      let can = false;
      if (user) { try { can = (await user.isOwner()) || (await user.canEdit()); } catch (e) { can = false; } }
      if (!can) return;
      state.artifact = artifact; state.canEdit = true;
      $('agentBtn').hidden = false;
      let saved = false; try { saved = sessionStorage.getItem('d8-agent') === '1'; } catch (e) { }
      if (saved) setAgent(true);
      offerDraft();
    } catch (e) { /* visiteur sans droits */ }
  }
  function setAgent(on) {
    state.agent = !!on && state.canEdit;
    document.body.classList.toggle('agent-on', state.agent);
    try { sessionStorage.setItem('d8-agent', state.agent ? '1' : '0'); } catch (e) { }
    $('agentbar').hidden = !state.agent;
    $('agentBtn').hidden = API ? state.agent : (!state.canEdit || state.agent);
    updateStaffUI();
    renderCatalog(); refreshPage();
    if (!$('visit').hidden) refreshVisitAgent();
    updateAgentBar();
  }
  function updateAgentBar() {
    const dirty = isDirty();
    if (!state.saving) $('agentState').textContent = dirty ? 'Modifications non enregistrées' : 'Tout est enregistré';
    $('saveBtn').disabled = !dirty || state.saving;
    const vs = $('vSave'); if (vs) { vs.disabled = !dirty || state.saving; vs.textContent = state.saving ? 'Enregistrement…' : 'Enregistrer'; }
  }
  $('agentBtn').addEventListener('click', () => { if (state.canEdit) setAgent(true); else if (API) openLogin(); });
  $('agentExit').addEventListener('click', () => setAgent(false));
  if ($('staffBtn')) $('staffBtn').addEventListener('click', openStaffSheet);
  if ($('histBtn')) $('histBtn').addEventListener('click', openHistory);
  if ($('accountBtn')) $('accountBtn').addEventListener('click', openAccountSheet);
  $('saveBtn').addEventListener('click', save);
  window.addEventListener('beforeunload', e => { if (state.canEdit && isDirty()) { e.preventDefault(); e.returnValue = ''; } });

  // ------------------------------------------------------------------ catalogue
  function renderCatalog() {
    const d = state.data; if (!d) return;
    const f = state.filter;
    const types = TYPES.filter(t => d.listings.some(l => !l.deco && l.type === t && (state.agent || l.points.length)) || f.type === t);
    const fl = $('filters'); fl.innerHTML = '';
    const chip = (label, val) => el('button', { type: 'button', class: 'chip', 'aria-pressed': String(f.type === val), text: label, onclick: () => { location.hash = val === 'all' ? '#/catalogue' : '#/catalogue/' + typeSlug(val); } });
    fl.append(chip('Tous', 'all'));
    types.forEach(t => fl.append(chip(typePlural(t), t)));
    $('catTitle').textContent = f.type === 'all' ? 'Catalogue' : typePlural(f.type);
    fl.append(el('span', { class: 'sep' }));
    const deal = el('select', { id: 'fDeal', 'aria-label': 'Transaction', onchange: e => { f.deal = e.target.value; renderCatalog(); } },
      [['all', 'Vente et location'], ['vente', 'Vente'], ['location', 'Location']].map(([v, t]) => el('option', { value: v, text: t, selected: f.deal === v })));
    const sort = el('select', { id: 'fSort', 'aria-label': 'Tri', onchange: e => { f.sort = e.target.value; renderCatalog(); } },
      [['recent', 'Plus récents'], ['asc', 'Prix croissant'], ['desc', 'Prix décroissant']].map(([v, t]) => el('option', { value: v, text: t, selected: f.sort === v })));
    const q = el('input', { id: 'fSearch', type: 'search', placeholder: 'Rechercher un bien…', value: f.q, 'aria-label': 'Rechercher', oninput: e => { f.q = e.target.value; renderGrid(); } });
    fl.append(deal, sort, q);
    renderGrid();
    const n = d.listings.filter(l => !l.deco && l.status === 'disponible').length;
    $('catSub').textContent = n === 0 ? 'Aucun bien disponible pour le moment' : n === 1 ? '1 bien disponible à Los Santos' : n + ' biens disponibles à Los Santos';
    renderNav(); renderHomeLatest(); renderHero();
  }
  function renderGrid() {
    const d = state.data, f = state.filter, grid = $('grid');
    grid.innerHTML = '';
    let items = d.listings.filter(l => !l.deco &&
      (f.type === 'all' || l.type === f.type) && (f.deal === 'all' || l.deal === f.deal) &&
      (!f.q || (l.name + ' ' + (l.type || '')).toLowerCase().includes(f.q.toLowerCase())) &&
      (state.agent || l.points.length > 0));
    const pv = l => isNum(l.price) ? +l.price : isNum(l.priceMax) ? +l.priceMax : null;
    if (f.sort === 'recent') items.sort((a, b) => (b.order || 0) - (a.order || 0));
    else items.sort((a, b) => { const x = pv(a), y = pv(b); if (x === null) return 1; if (y === null) return -1; return f.sort === 'asc' ? x - y : y - x; });
    if (state.agent && (isAdmin() || isGerant())) {
      grid.append(el('button', { type: 'button', class: 'card new', onclick: () => newListing() }, [
        el('div', {}, [el('div', { class: 'plus', html: ICON.plus }), el('span', { text: 'Nouveau bien' })])]));
    }
    items.forEach(l => grid.append(cardOf(l)));
    $('empty').hidden = items.length > 0 || state.agent;
    $('empty').textContent = f.type !== 'all' && !f.q && f.deal === 'all' ? 'Aucun bien dans cette catégorie pour le moment.' : 'Aucun bien ne correspond à ces critères.';
  }
  function cardOf(l) {
    const photo = el('div', { class: 'photo', style: l.cover ? { backgroundImage: 'url("' + mediaURL(l.cover) + '")' } : {} }, [
      l.deco ? null : el('span', { class: 'status ' + l.status, text: STATUSES[l.status] || 'Disponible' }),
      l.points.length ? el('span', { class: 'sunbadge' }, ['360°', el('small', { text: l.points.length + (l.points.length > 1 ? ' pièces' : ' pièce') })]) : null
    ]);
    const body = el('div', { class: 'body' }, [
      el('p', { class: 'eyebrow', text: kindOf(l) }),
      el('h3', { text: l.name || 'Sans nom' }),
      l.deco && !hasPrice(l) ? null : priceEl(l),
      l.deco ? null : optionEl(l)
    ]);
    const link = el('a', { href: '#' + l.id, class: 'cardlink', style: { display: 'flex', flexDirection: 'column', color: 'inherit', textDecoration: 'none' } }, [photo, body]);
    if (!l.points.length) {
      link.removeAttribute('href');
      link.addEventListener('click', () => openListingSheet(l));
      photo.append(el('span', { class: 'sunbadge', style: { background: 'var(--card)', color: 'var(--ink)' } }, ['+', el('small', { text: 'pièce' })]));
    }
    const card = el('article', { class: 'card' }, [link]);
    if (state.agent) {
      card.append(el('div', { class: 'agent-actions' }, [
        el('button', { type: 'button', class: 'btn', html: (canEditListing(l) ? ICON.pencil + '<span>Modifier</span>' : ICON.eye + '<span>Infos</span>'), onclick: () => openListingSheet(l) }),
        l.points.length && canAddRoom(l) ? el('button', { type: 'button', class: 'btn', html: ICON.plus + '<span>Pièce</span>', onclick: () => openWizard(l) }) : null
      ]));
    }
    return card;
  }
  function newListing(decoId) {
    const d = state.data;
    const name = decoId ? 'Nouvelle décoration' : 'Nouveau bien';
    const l = {
      id: uniqueId(slugify(name), d.listings.map(x => x.id)), name, type: decoId ? 'Décoration' : 'Appartement', deal: 'vente', price: null, period: 'semaine',
      status: 'disponible', garagePrice: null, description: '', features: [],
      cover: null, start: null, order: Math.max(0, ...d.listings.map(x => x.order || 0)) + 1, created: new Date().toISOString().slice(0, 10), points: []
    };
    if (me()) l.createdBy = me();
    if (decoId) l.deco = decoId;
    d.listings.push(l);
    markDirty(); renderCatalog(); refreshPage();
    openListingSheet(l, true);
  }

  // ------------------------------------------------------------------ panneau latéral
  let sheetOnClose = null;
  function openSheet(title, bodyKids, footKids, onClose) {
    if (sheetOnClose) { const f = sheetOnClose; sheetOnClose = null; f(); }
    $('sheetTitle').textContent = title;
    const b = $('sheetBody'); b.innerHTML = ''; bodyKids.forEach(k => k && b.append(k));
    const f = $('sheetFoot'); f.innerHTML = ''; (footKids || []).forEach(k => k && f.append(k)); f.hidden = !(footKids && footKids.length);
    $('sheet').hidden = false;
    sheetOnClose = onClose || null;
  }
  function closeSheet() {
    $('sheet').hidden = true;
    if (sheetOnClose) { const f = sheetOnClose; sheetOnClose = null; f(); }
  }
  $('sheetClose').addEventListener('click', closeSheet);
  function field(label, input, help) { return el('label', { class: 'field' }, [el('span', { text: label }), input, help ? el('small', { class: 'help', text: help }) : null]); }

  function openListingSheet(l, isNew) {
    const upd = (k, v) => {
      l[k] = v;
      if (k === 'name') renameIfUnsaved(l);
      markDirty(); renderCatalog(); if (visit.listing === l) setVisitTexts();
    };
    const num = v => v === '' ? null : Math.max(0, +v);
    const name = el('input', { id: 'lName', value: l.name, oninput: e => upd('name', e.target.value) });
    const type = el('select', { id: 'lType', onchange: e => upd('type', e.target.value) }, TYPES.map(t => el('option', { value: t, text: t, selected: l.type === t })));
    const period = el('select', { id: 'lPeriod', onchange: e => upd('period', e.target.value) }, Object.entries(PERIODS).map(([v, t]) => el('option', { value: v, text: 'par ' + t, selected: l.period === v })));
    const periodField = field('Période', period);
    const deal = el('select', { id: 'lDeal', onchange: e => { upd('deal', e.target.value); periodField.hidden = e.target.value !== 'location'; } },
      Object.entries(DEALS).map(([v, t]) => el('option', { value: v, text: t, selected: l.deal === v })));
    periodField.hidden = l.deal !== 'location';
    const price = el('input', { id: 'lPrice', type: 'number', min: '0', step: '1000', inputmode: 'numeric', value: l.price ?? '', placeholder: 'Vide = prix sur demande', oninput: e => upd('price', num(e.target.value)) });
    const status = el('select', { id: 'lStatus', onchange: e => upd('status', e.target.value) }, Object.entries(STATUSES).map(([v, t]) => el('option', { value: v, text: t, selected: l.status === v })));
    const garageHelp = () => 'Supplément si le client prend un garage' + (l.deal === 'location' ? ', par ' + (PERIODS[l.period] || 'semaine') : '') + '. Laisse vide s’il n’y a pas d’option garage.';
    const garage = el('input', { id: 'lGarage', type: 'number', min: '0', step: '50', inputmode: 'numeric', value: l.garagePrice ?? '', placeholder: 'Pas d’option garage', oninput: e => upd('garagePrice', num(e.target.value)) });
    const garageField = field('Option garage ($)', garage, garageHelp());
    const refreshGarageHelp = () => { const h = garageField.querySelector('.help'); if (h) h.textContent = garageHelp(); };
    deal.addEventListener('change', refreshGarageHelp); period.addEventListener('change', refreshGarageHelp);
    const desc = el('textarea', { id: 'lDesc', oninput: e => upd('description', e.target.value) }); desc.value = l.description || '';
    const feats = el('input', { id: 'lFeats', value: (l.features || []).join(', '), placeholder: 'Ex. Vue sur la ville, Garage privé', oninput: e => upd('features', e.target.value.split(',').map(s => s.trim()).filter(Boolean)) });
    const roomsBox = el('div', { class: 'roomlist' });
    const renderRooms = () => {
      roomsBox.innerHTML = '';
      if (!l.points.length) roomsBox.append(el('p', { class: 'note', text: 'Ce bien n’a pas encore de pièce. Ajoute une pièce avec tes screens pour créer la visite 360°.' }));
      l.points.forEach(p => roomsBox.append(el('div', { class: 'roomitem' }, [
        el('span', { class: 'thumb', style: { backgroundImage: 'url("' + mediaURL(p.imageSmall || p.image) + '")' } }),
        el('div', {}, [el('b', { text: p.name }), el('small', { text: (l.start === p.id ? 'Départ de la visite · ' : '') + p.pins.length + ' étiquette(s) · ' + p.links.length + ' passage(s)' })]),
        el('div', { class: 'acts' }, [iconBtn('eye', 'Ouvrir dans la visite', () => { closeSheet(); go(l, p.id); })])
      ])));
    };
    renderRooms();
    const ro = !canEditListing(l), dc = !!l.deco, what = dc ? 'la décoration' : 'le bien';
    const priceMax = el('input', { id: 'lPriceMax', type: 'number', min: '0', step: '1000', inputmode: 'numeric', value: l.priceMax ?? '', placeholder: 'Facultatif', oninput: e => upd('priceMax', num(e.target.value)) });
    // décoration : intérieur du catalogue obligatoire avant de créer les pièces
    const addRoomBtn = canAddRoom(l) ? el('button', { type: 'button', class: 'btn primary', id: 'addRoomBtn', html: ICON.plus + '<span>Ajouter une pièce</span>', onclick: () => { closeSheet(); openWizard(l); } }) : null;
    const baseNote = el('p', { class: 'note', id: 'baseNote', hidden: true, text: 'Choisis d’abord l’intérieur du catalogue : sans lui, tu ne peux pas créer les pièces de ta décoration.' });
    const refreshBase = () => { const need = dc && !baseOf(l); if (addRoomBtn) addRoomBtn.disabled = need; baseNote.hidden = !(need && canAddRoom(l)); };
    let baseField = null;
    if (dc) {
      const list = interiors();
      const sel = el('select', { id: 'lBase', onchange: e => { upd('base', e.target.value || null); refreshBase(); } },
        [el('option', { value: '', text: list.length ? '— Choisis l’intérieur —' : 'Aucun bien du catalogue avec une visite' })]
          .concat(l.base && !list.some(x => x.id === l.base) ? [el('option', { value: l.base, text: baseOf(l) ? baseOf(l).name : 'Intérieur retiré du catalogue', selected: true })] : [])
          .concat(list.map(x => el('option', { value: x.id, text: (x.name || 'Sans nom') + ' · ' + (x.type || 'Bien'), selected: l.base === x.id }))));
      if (ro) sel.disabled = true;
      baseField = field('Intérieur du catalogue', sel, 'Le bien du catalogue où tu as fait cette déco. Pendant la visite, les clients pourront voir ce bien sans la déco, puis revenir à ta déco.');
    }
    refreshBase();
    if (ro) [name, type, period, deal, price, priceMax, status, garage, desc, feats].forEach(i => { i.disabled = true; });
    openSheet(isNew ? (dc ? 'Nouvelle décoration' : 'Nouveau bien') : ro ? l.name : (dc ? 'Modifier la décoration' : 'Modifier le bien'), [
      isNew ? el('p', { class: 'note', text: 'Remplis les infos, puis ajoute les pièces avec tes screens. Pense à enregistrer à la fin.' }) : null,
      ro && dc ? el('p', { class: 'note', text: 'Cette décoration appartient à ' + decoName(l.deco) + '.' }) : null,
      ro && !dc ? el('p', { class: 'note', text: canAddRoom(l) ? 'Ce bien a été créé par ' + (l.createdBy || 'un admin') + ' : tu peux y ajouter des pièces et choisir la pièce de départ, mais pas modifier ses infos ni son prix.' : 'Tu ne peux pas modifier ce bien.' }) : null,
      dc ? el('p', { class: 'help', text: 'Catégorie : ' + decoName(l.deco) }) : null,
      field(dc ? 'Nom de la décoration' : 'Nom du bien', name),
      baseField, baseNote,
      dc ? null : el('div', { class: 'row2' }, [field('Type', type), field('Statut', status)]),
      dc ? null : el('div', { class: 'row2' }, [field('Transaction', deal), periodField]),
      el('div', { class: 'row2' }, [field(dc ? 'Prix ($, facultatif)' : 'Prix ($)', price), field('Prix maximum ($)', priceMax)]),
      el('p', { class: 'help', style: { margin: '-6px 0 0' }, text: dc ? 'Laisse vide si tu ne veux pas afficher de prix. Remplis les deux pour une fourchette.' : 'Un seul prix : laisse « Prix maximum » vide. Une fourchette : remplis les deux (ex. 1 000 et 2 000 → « 1 000 $ – 2 000 $ »). Rien du tout : « Prix sur demande ».' }),
      dc ? null : garageField,
      field('Description', desc),
      field('Points forts', feats, 'Sépare-les par des virgules.'),
      l.points.length > 1 && canAddRoom(l) ? startPicker(l, renderRooms) : null,
      el('div', { class: 'field' }, [el('span', { text: 'Pièces de la visite' }), roomsBox])
    ], [
      addRoomBtn,
      l.points.length ? el('button', { type: 'button', class: 'btn', text: 'Ouvrir la visite', onclick: () => { closeSheet(); go(l); } }) : null,
      canDeleteListing(l) ? el('button', { type: 'button', class: 'btn danger', text: dc ? 'Supprimer la décoration' : 'Supprimer le bien', onclick: () => deleteListing(l) }) : null
    ]);
    if (isNew) setTimeout(() => { name.focus(); name.select(); }, 50);
  }
  // tant qu'un bien n'a jamais été enregistré et n'a pas de pièce, son identifiant (utilisé dans le lien) suit son nom
  function renameIfUnsaved(l) {
    if (l.points.length) return;
    let saved = [];
    try { saved = JSON.parse(state.saved).listings.map(x => x.id); } catch (e) { }
    if (saved.includes(l.id)) return;
    l.id = uniqueId(slugify(l.name), state.data.listings.filter(x => x !== l).map(x => x.id).concat(saved));
  }
  async function deleteListing(l) {
    const ok = await confirmBox('Supprimer « ' + l.name + ' » ?', (l.deco ? 'La décoration et toutes ses pièces seront retirées' : 'Le bien et toutes ses pièces seront retirés') + ' du site au prochain enregistrement. Un admin pourra ' + (l.deco ? 'la' : 'le') + ' restaurer depuis l’Historique.', 'Supprimer');
    if (!ok) return;
    mediaOfListing(l).forEach(dropMedia);
    state.data.listings = state.data.listings.filter(x => x !== l);
    closeSheet();
    if (visit.listing === l) leaveVisit();
    markDirty(); renderCatalog(); refreshPage();
  }

  // ------------------------------------------------------------------ visite
  const visit = { viewer: null, listing: null, point: null, pins: [], links: [], badge: null, markers: null, tool: null, busy: false };
  let decoPair = null;   // { deco, base } : la décoration visitée et l'intérieur du catalogue sans déco
  function go(l, pointId) {
    visit.pendingPoint = pointId || null;
    if (location.hash.slice(1) === l.id) openVisit(l, pointId);
    else location.hash = l.id;
  }
  function ensureViewer() {
    if (visit.viewer) return visit.viewer;
    const v = new PanoViewer($('stage'), { keyboard: true, autoRotate: true });
    visit.viewer = v;
    v.keyboardActive = () => !$('visit').hidden && $('wizard').hidden;
    v.onInput = () => $('vHint').classList.add('gone');
    v.onTap = onStageTap;
    v.onHover = (x, y) => {
      const l = linkAt(x, y);
      visit.links.forEach(e => setHot(e, e === l));
      $('stage').classList.toggle('over-link', !!l && !visit.tool);
    };
    v.frameHooks.push(placeOverlays);
    visit.markers = new THREE.Group();
    v.scene.add(visit.markers);
    // logo de l'agence posé au sol
    const img = new Image();
    img.onload = () => {
      const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
      const g = c.getContext('2d');
      g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2); g.fillStyle = '#025934'; g.fill();
      g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 40, 0, Math.PI * 2); g.fillStyle = '#fbfaf5'; g.fill();
      g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 58, 0, Math.PI * 2); g.lineWidth = 6; g.strokeStyle = '#fdc614'; g.stroke();
      const w = S * 0.7, h = w * img.height / img.width;
      g.drawImage(img, (S - w) / 2, (S - h) / 2 - S * 0.02, w, h);
      const tex = new THREE.CanvasTexture(c);
      tex.anisotropy = v.renderer.capabilities.getMaxAnisotropy();
      const badge = new THREE.Mesh(new THREE.CircleGeometry(24, 96), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      badge.rotation.order = 'YXZ'; badge.rotation.x = -Math.PI / 2; badge.position.y = -100; badge.renderOrder = 2;
      visit.badge = badge; orientBadge(); v.scene.add(badge);
    };
    img.src = 'logo.png';
    return v;
  }
  function orientBadge() { if (visit.badge && visit.point) visit.badge.rotation.y = Math.PI / 2 - (visit.point.north || 0) * D2R; }
  const bigTextures = () => (visit.viewer.renderer.capabilities.maxTextureSize || 4096) >= 4096;
  function texURL(p) { return mediaURL(bigTextures() ? p.image : (p.imageSmall || p.image)); }

  async function openVisit(l, pointId) {
    const v = ensureViewer();
    document.body.classList.add('visit-open');
    $('visit').hidden = false;
    const p = pointOf(l, pointId || visit.pendingPoint || '') || pointOf(l, l.start) || l.points[0];
    visit.pendingPoint = null;
    if (!p) { closeVisit(); return; }
    const sameListing = visit.listing === l;
    visit.listing = l;
    if (!l.deco && !(decoPair && decoPair.base === l.id)) decoPair = null;
    setVisitTexts();
    refreshVisitAgent();
    const sw = visit.switchFrom; visit.switchFrom = null;
    if (sameListing && visit.point === p) return;
    $('vStatus').hidden = false; $('vStatus').textContent = 'Chargement de la visite…';
    $('stage').style.backgroundImage = l.cover ? 'url("' + mediaURL(l.cover) + '")' : '';
    try {
      const tex = await panoLoadTexture(texURL(p), v.renderer);
      if (visit.listing !== l) return;
      if (sw && !v.anim && v.sphere.material.map) {
        // avec / sans la déco : même pièce, même direction, fondu enchaîné
        $('vStatus').hidden = true;
        visit.point = null; buildPins(); buildLinks();
        visit.busy = true;
        try { await v.crossfade(tex, (p.north || 0) - (sw.north || 0)); } finally { visit.busy = false; }
        if (visit.listing !== l) return;
      } else {
        v.setTexture(tex);
        v.look(p.yaw || 0, p.pitch ?? -4, v.defaultFov());
      }
      applyPoint(p);
      $('vStatus').hidden = true;
    } catch (e) {
      $('vStatus').textContent = 'L’image de cette pièce n’a pas pu se charger.';
    }
  }
  function closeVisit() {
    cancelTool();
    if ($('visit').hidden) return;
    $('visit').hidden = true;
    document.body.classList.remove('visit-open');
    if (!$('sheet').hidden) closeSheet();
    visit.listing = null; visit.point = null; decoPair = null;
    $('vDeco').hidden = true;
    buildPins(); buildLinks();
  }
  function setVisitTexts() {
    const l = visit.listing; if (!l) return;
    $('vEyebrow').textContent = kindOf(l);
    $('vName').textContent = l.name;
    const pr = priceParts(l), pe = $('vPrice');
    pe.hidden = !!l.deco && !hasPrice(l);
    pe.className = 'price' + (pr.ask ? ' ask' : '') + (pr.range ? ' range' : ''); pe.innerHTML = '';
    pe.append(pr.text); if (pr.per) pe.append(el('small', { text: pr.per }));
    const ot = l.deco ? null : optionText(l), vo = $('vOption');
    vo.hidden = !ot; vo.innerHTML = '';
    if (ot) vo.append('Option garage : ', el('b', { text: ot }));
    if (visit.point) {
      const i = l.points.indexOf(visit.point);
      $('vRoom').textContent = visit.point.name + (l.points.length > 1 ? ' · ' + (i + 1) + '/' + l.points.length : '');
    }
    $('vHint').textContent = visit.point && visit.point.links.length ? 'Glissez pour regarder, cliquez les cercles au sol pour avancer' : 'Glissez pour regarder autour de vous';
    syncDecoSwitch();
  }
  // bouton « Avec la déco / Sans la déco » : visible sur une décoration liée à un intérieur du catalogue,
  // et sur cet intérieur quand on y est arrivé depuis la décoration
  function syncDecoSwitch() {
    const l = visit.listing;
    if (l && l.deco) { const b = baseOf(l); decoPair = b && b.points.length ? { deco: l.id, base: b.id } : null; }
    const on = !!(l && decoPair && (decoPair.deco === l.id || decoPair.base === l.id));
    $('vDeco').hidden = !on; if (!on) return;
    const withDeco = decoPair.deco === l.id;
    $('vWithDeco').setAttribute('aria-pressed', String(withDeco));
    $('vNoDeco').setAttribute('aria-pressed', String(!withDeco));
  }
  function switchDeco(toBase) {
    const l = visit.listing; if (!l || !decoPair || visit.busy) return;
    const t = listing(toBase ? decoPair.base : decoPair.deco);
    if (!t || t === l || !t.points.length) return;
    const q = twinRoom(visit.point, t);
    visit.switchFrom = q ? visit.point : null;
    cancelTool();
    go(t, (q || pointOf(t, t.start) || t.points[0]).id);
  }
  $('vWithDeco').addEventListener('click', () => switchDeco(false));
  $('vNoDeco').addEventListener('click', () => switchDeco(true));
  // charge à l'avance la même pièce dans l'autre version, pour un passage instantané
  function preloadTwin() {
    const l = visit.listing, p = visit.point; if (!decoPair || !l || !p) return;
    const o = listing(l.id === decoPair.deco ? decoPair.base : decoPair.deco); if (!o || !o.points.length) return;
    const q = twinRoom(p, o) || pointOf(o, o.start) || o.points[0];
    panoLoadTexture(texURL(q), visit.viewer.renderer).catch(() => { });
  }
  function applyPoint(p) {
    visit.point = p;
    setVisitTexts();
    buildPins(); buildLinks(); orientBadge();
    refreshTools();
    preloadTwin();
    // pièces reliées par un passage : chargées à l'avance (pas tout le bien, pour économiser le quota du serveur)
    p.links.forEach(k => { const q = pointOf(visit.listing, k.target); if (q) panoLoadTexture(texURL(q), visit.viewer.renderer).catch(() => { }); });
  }
  // outils visibles selon les droits sur la pièce affichée
  function refreshTools() {
    const l = visit.listing, p = visit.point; if (!l || !p) return;
    const ep = canEditPoint(l, p), elist = canEditListing(l) || !l.cover;
    const show = { start: ep, pin: ep, link: canAddRoom(l) || ep, north: ep, cover: elist && (canEditListing(l) || canAddRoom(l)), rooms: canAddRoom(l) || canEditListing(l) };
    document.querySelectorAll('#vtools button[data-tool]').forEach(b => { b.hidden = !show[b.dataset.tool]; });
  }

  // étiquettes
  function buildPins() {
    visit.pins.forEach(x => x.el.remove()); visit.pins = [];
    const p = visit.point; if (!p || !visit.listing) return;
    p.pins.forEach(pin => {
      const b = el('button', { type: 'button', class: 'pin' }, [el('span', { class: 'dot' }), el('span', { class: 'tag' }, [pin.label || 'Étiquette', pin.text ? el('span', { class: 'more', text: pin.text }) : null])]);
      b.setAttribute('aria-label', (pin.label || '') + (pin.text ? ' : ' + pin.text : ''));
      b.addEventListener('click', () => { if (state.agent && canEditPoint(visit.listing, visit.point)) openPinSheet(pin); else b.classList.toggle('open'); });
      $('overlay').append(b);
      visit.pins.push({ el: b, pin });
    });
  }
  // passages (cercles au sol)
  function buildLinks() {
    visit.links.forEach(x => x.label.remove()); visit.links = [];
    if (visit.markers) visit.markers.clear();
    const p = visit.point, l = visit.listing; if (!p || !l) return;
    p.links.forEach(link => {
      const target = pointOf(l, link.target); if (!target) return;
      const pa = Math.max(3, Math.abs(Math.min(-3, link.pitch))) * D2R;
      let hgt = 100, dist = 100 / Math.tan(pa);
      const r3 = Math.hypot(hgt, dist), maxR = 430;
      if (r3 > maxR) { hgt *= maxR / r3; dist *= maxR / r3; }
      const R = 0.3 * hgt;
      const group = new THREE.Group();
      const fill = new THREE.Mesh(new THREE.CircleGeometry(R * 0.78, 64), new THREE.MeshBasicMaterial({ color: 0x025934, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false }));
      const ring = new THREE.Mesh(new THREE.RingGeometry(R * 0.78, R, 64), new THREE.MeshBasicMaterial({ color: 0xfdc614, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }));
      const hit = new THREE.Mesh(new THREE.CircleGeometry(R * 1.9, 32), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
      hit.renderOrder = 3; fill.renderOrder = 4; ring.renderOrder = 5;
      [hit, fill, ring].forEach(m => { m.rotation.x = -Math.PI / 2; group.add(m); });
      const h = panoDir(link.yaw, 0);
      group.position.set(h.x * dist, -hgt, h.z * dist);
      visit.markers.add(group);
      const far = group.position.clone().add(new THREE.Vector3(h.x * R, 0, h.z * R));
      const label = el('button', { type: 'button', class: 'link-label', html: ICON.arrow }, [el('span', { text: target.name })]);
      label.setAttribute('aria-label', 'Aller à : ' + target.name);
      const entry = { link, group, far, hit, fill, ring, label };
      label.addEventListener('click', () => travelTo(link));
      label.addEventListener('pointerenter', () => setHot(entry, true));
      label.addEventListener('pointerleave', () => setHot(entry, false));
      $('overlay').append(label);
      visit.links.push(entry);
    });
  }
  function setHot(e, on) {
    e.fill.material.color.set(on ? 0x04804b : 0x025934);
    e.fill.material.opacity = on ? 0.8 : 0.55;
    e.label.classList.toggle('hot', on);
  }
  function linkAt(x, y) {
    if (!visit.links.length || visit.busy) return null;
    const hits = visit.viewer.raycast(x, y, visit.links.map(e => e.hit));
    return hits.length ? visit.links.find(e => e.hit === hits[0].object) : null;
  }
  function placeOverlays() {
    const v = visit.viewer, w = v.stage.clientWidth, h = v.stage.clientHeight, show = !visit.busy;
    visit.pins.forEach(x => {
      const pr = v.project(panoDir(x.pin.yaw, x.pin.pitch).multiplyScalar(100));
      const vis = show && pr.front && pr.x > -200 && pr.x < w + 200 && pr.y > -200 && pr.y < h + 200;
      x.el.hidden = !vis;
      if (vis) x.el.style.transform = 'translate(' + (pr.x - 7) + 'px,' + (pr.y - 7) + 'px)';
    });
    visit.links.forEach(e => {
      e.group.visible = show;
      const pr = v.project(e.far);
      const vis = show && pr.front && pr.x > -200 && pr.x < w + 200 && pr.y > -200 && pr.y < h + 200;
      e.label.hidden = !vis;
      if (vis) e.label.style.transform = 'translate(' + pr.x + 'px,' + pr.y + 'px) translate(-50%, -100%) translateY(-8px)';
    });
  }
  async function travelTo(link) {
    const l = visit.listing, from = visit.point, to = pointOf(l, link.target);
    if (!to || visit.busy) return;
    cancelTool();
    visit.busy = true;
    try {
      const v = visit.viewer;
      const tex = await panoLoadTexture(texURL(to), v.renderer);
      await v.travel(link.yaw, tex, (to.north || 0) - (from.north || 0));
      applyPoint(to);
    } catch (e) { toast('Cette pièce n’a pas pu se charger.'); }
    visit.busy = false;
  }
  async function jumpTo(p) {
    if (visit.point === p || visit.busy) return;
    const v = visit.viewer;
    visit.busy = true;
    try {
      const tex = await panoLoadTexture(texURL(p), v.renderer);
      await v.travel(v.view.yaw, tex, 0);
      v.look(p.yaw || 0, p.pitch ?? -4);
      applyPoint(p);
    } catch (e) { toast('Cette pièce n’a pas pu se charger.'); }
    visit.busy = false;
  }
  function onStageTap(x, y) {
    if (visit.tool) { placeWithTool(x, y); return; }
    const e = linkAt(x, y);
    if (e) travelTo(e.link);
  }

  $('backBtn').addEventListener('click', leaveVisit);
  $('infoBtn').addEventListener('click', openInfoSheet);
  $('rotateBtn').addEventListener('click', () => {
    const v = ensureViewer(); v.autoRotate = !v.autoRotate;
    $('rotateBtn').setAttribute('aria-pressed', String(v.autoRotate)); v.lastInput = performance.now() - 10000;
  });
  $('zoomIn').addEventListener('click', () => { const v = ensureViewer(); v.setFov(v.view.fov - 10); v.touched(); });
  $('zoomOut').addEventListener('click', () => { const v = ensureViewer(); v.setFov(v.view.fov + 10); v.touched(); });
  (function () {
    const fb = $('fullBtn');
    if (!(document.fullscreenEnabled || document.webkitFullscreenEnabled)) { fb.hidden = true; return; }
    fb.addEventListener('click', () => {
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        else { const t = document.documentElement, r = (t.requestFullscreen || t.webkitRequestFullscreen).call(t); if (r && r.catch) r.catch(() => { fb.hidden = true; }); }
      } catch (e) { fb.hidden = true; }
    });
  })();
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!$('modal').hidden) return;
    if (visit.tool) { cancelTool(); return; }
    if (!$('sheet').hidden) { closeSheet(); return; }
  });

  function openInfoSheet() {
    const l = visit.listing; if (!l) return;
    const kv = [];
    const add = (k, v) => { if (v !== null && v !== undefined && v !== '') kv.push(el('div', {}, [el('dt', { text: k }), el('dd', { text: v })])); };
    if (l.deco) add('Décorateur', decoName(l.deco));
    else { add('Type', l.type); add('Transaction', DEALS[l.deal]); add('Statut', STATUSES[l.status]); }
    const share = SHARE_BASE + '#' + l.id;
    const shareInput = el('input', { id: 'shareLink', value: share, readonly: true, onfocus: e => e.target.select() });
    const rooms = el('div', { class: 'roomlist' }, l.points.map(p => el('button', {
      type: 'button', class: 'roomitem' + (p === visit.point ? ' current' : ''), onclick: () => { closeSheet(); jumpTo(p); }
    }, [el('span', { class: 'thumb', style: { backgroundImage: 'url("' + mediaURL(p.imageSmall || p.image) + '")' } }), el('div', {}, [el('b', { text: p.name })]), el('span', {})])));
    openSheet(l.name, [
      priceEl(l),
      optionEl(l),
      el('dl', { class: 'kv' }, kv),
      l.description ? el('p', { class: 'desc', text: l.description }) : null,
      (l.features || []).length ? el('div', { class: 'tags' }, l.features.map(t => el('span', { text: t }))) : null,
      el('div', { class: 'field' }, [el('span', { text: 'Pièces à visiter' }), rooms]),
      el('div', { class: 'field' }, [el('span', { text: 'Lien direct vers ce bien' }), el('div', { class: 'copyrow' }, [shareInput,
        el('button', {
          type: 'button', class: 'btn', text: 'Copier', onclick: async () => {
            try { await navigator.clipboard.writeText(share); toast('Lien copié'); } catch (e) { shareInput.focus(); shareInput.select(); toast('Sélectionné : fais Ctrl+C pour copier'); }
          }
        })])])
    ]);
  }

  // ------------------------------------------------------------------ outils agent dans la visite
  function refreshVisitAgent() {
    const on = state.agent && !!visit.listing;
    $('vtools').hidden = !on;
    let bar = $('vAgent');
    if (on && !bar) {
      bar = el('div', { id: 'vAgent', style: { position: 'absolute', zIndex: 7, top: 'calc(env(safe-area-inset-top, 0px) + 16px)', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--sun)', color: 'var(--on-sun)', borderRadius: '999px', padding: '4px 4px 4px 12px', boxShadow: '0 6px 18px rgba(0,0,0,.3)' } }, [
        el('span', { class: 'tag', text: state.user ? ROLE_NAMES[state.user.role] : 'Mode agent', style: { fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', fontSize: '12px' } }),
        el('button', { id: 'vSave', type: 'button', class: 'btn primary', text: 'Enregistrer', onclick: save, style: { minHeight: '32px' } })
      ]);
      $('visit').append(bar);
    }
    if (bar) bar.hidden = !on;
    $('vHint').hidden = on;
    refreshTools(); updateStaffUI();
    updateAgentBar();
    if (!on) cancelTool();
  }
  $('vtools').addEventListener('click', e => {
    const b = e.target.closest('button[data-tool]'); if (!b) return;
    const t = b.dataset.tool;
    if (t === 'start') toolStart();
    else if (t === 'pin') startTool('pin', 'Clique dans la vue là où placer l’étiquette');
    else if (t === 'link') openLinksSheet();
    else if (t === 'north') openNorthSheet();
    else if (t === 'cover') toolCover();
    else if (t === 'rooms') openRoomsSheet();
  });
  function startTool(kind, text, payload) {
    visit.tool = { kind, payload };
    const h = $('placeHint'); h.innerHTML = ''; h.append(text + ' ', el('button', { type: 'button', class: 'btn', text: 'Annuler', style: { minHeight: '28px', marginLeft: '8px' }, onclick: cancelTool }));
    h.hidden = false;
    $('stage').classList.add('placing');
    document.querySelectorAll('#vtools button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === kind)));
  }
  function cancelTool() {
    visit.tool = null;
    $('placeHint').hidden = true;
    $('stage').classList.remove('placing');
    document.querySelectorAll('#vtools button').forEach(b => b.setAttribute('aria-pressed', 'false'));
  }
  function placeWithTool(x, y) {
    const t = visit.tool, p = visit.point; if (!t || !p) return;
    const d = visit.viewer.screenToDir(x, y);
    const yaw = Math.round(wrapYaw(d.yaw) * 10) / 10, pitch = Math.round(d.pitch * 10) / 10;
    if (t.kind === 'pin') {
      const pin = { id: 'p' + rid(5), yaw, pitch, label: 'Nouvelle étiquette', text: '' };
      p.pins.push(pin); cancelTool(); buildPins(); markDirty(); openPinSheet(pin, true);
    } else if (t.kind === 'move-pin') {
      Object.assign(t.payload, { yaw, pitch }); cancelTool(); buildPins(); markDirty(); openPinSheet(t.payload);
    } else if (t.kind === 'link' || t.kind === 'move-link') {
      if (pitch > -4) { toast('Clique sur le sol, sous la ligne d’horizon.'); return; }
      if (t.kind === 'link') {
        const other = visit.listing.points.find(q => q !== p);
        const link = { id: 'l' + rid(5), target: other.id, yaw, pitch };
        p.links.push(link); cancelTool(); buildLinks(); markDirty(); openLinkSheet(link, true);
      } else {
        Object.assign(t.payload, { yaw, pitch }); cancelTool(); buildLinks(); markDirty(); openLinkSheet(t.payload);
      }
    }
  }
  function toolStart() {
    const v = visit.viewer, p = visit.point;
    p.yaw = Math.round(wrapYaw(v.view.yaw) * 10) / 10; p.pitch = Math.round(v.view.pitch * 10) / 10;
    markDirty();
    toast('Vue de départ de « ' + p.name + ' » enregistrée.');
  }
  async function toolCover() {
    const v = visit.viewer, l = visit.listing;
    if (!canEditListing(l) && l.cover) return;
    const blob = await v.capture(1280, 800, v.view.yaw, v.view.pitch, Math.min(80, v.view.fov), [visit.markers, visit.badge]);
    if (!blob) { toast('La capture a échoué.'); return; }
    if (l.cover) dropMedia(l.cover);
    const path = 'media/' + l.id + '/cover-' + rid(5) + '.jpg';
    addMedia(path, blob); l.cover = path;
    markDirty(); renderCatalog();
    toast('Photo de couverture mise à jour.');
  }
  function openPinSheet(pin, isNew) {
    const lab = el('input', { id: 'pinLabel', value: pin.label, oninput: e => { pin.label = e.target.value; buildPins(); markDirty(); } });
    const txt = el('input', { id: 'pinText', value: pin.text || '', placeholder: 'Ex. Double vasque, rangements', oninput: e => { pin.text = e.target.value; buildPins(); markDirty(); } });
    openSheet(isNew ? 'Nouvelle étiquette' : 'Étiquette', [field('Titre', lab), field('Détail (affiché au clic)', txt)], [
      el('button', { type: 'button', class: 'btn primary', text: 'Terminé', onclick: closeSheet }),
      el('button', { type: 'button', class: 'btn', text: 'Déplacer', onclick: () => { closeSheet(); startTool('move-pin', 'Clique là où déplacer l’étiquette', pin); } }),
      el('button', { type: 'button', class: 'btn danger', text: 'Supprimer', onclick: () => { visit.point.pins = visit.point.pins.filter(x => x !== pin); buildPins(); markDirty(); closeSheet(); } })
    ]);
    if (isNew) setTimeout(() => { lab.focus(); lab.select(); }, 50);
  }
  function openLinksSheet() {
    const l = visit.listing, p = visit.point;
    if (l.points.length < 2) { toast('Ajoute d’abord une autre pièce (bouton Pièces).', 4000); return; }
    const list = el('div', { class: 'roomlist' }, p.links.map(link => {
      const t = pointOf(l, link.target);
      return el('div', { class: 'roomitem' }, [
        el('span', { class: 'thumb', style: { backgroundImage: t ? 'url("' + mediaURL(t.imageSmall || t.image) + '")' : '' } }),
        el('div', {}, [el('b', { text: 'Vers ' + (t ? t.name : '?') })]),
        el('div', { class: 'acts' }, [canEditLink(l, p, link) ? iconBtn('pencil', 'Modifier', () => openLinkSheet(link)) : null])
      ]);
    }));
    openSheet('Passages de « ' + p.name + ' »', [
      el('p', { class: 'note', text: 'Un passage est un cercle au sol : en cliquant dessus, le visiteur va dans une autre pièce. Place-le dans la direction de cette pièce.' }),
      p.links.length ? list : el('p', { class: 'help', text: 'Aucun passage pour l’instant.' })
    ], [el('button', { type: 'button', class: 'btn primary', html: ICON.plus + '<span>Placer un passage</span>', onclick: () => { closeSheet(); startTool('link', 'Clique sur le sol là où placer le cercle'); } })]);
  }
  function openLinkSheet(link, isNew) {
    const l = visit.listing, p = visit.point;
    const others = l.points.filter(q => q !== p);
    const hasBack = id => { const t = pointOf(l, id); return t && t.links.some(x => x.target === p.id); };
    const back = el('input', { id: 'linkBack', type: 'checkbox', checked: isNew && !hasBack(link.target) });
    const sel = el('select', { id: 'linkTarget', onchange: e => { link.target = e.target.value; buildLinks(); markDirty(); back.checked = isNew && !hasBack(link.target); } },
      others.map(q => el('option', { value: q.id, text: q.name, selected: q.id === link.target })));
    const finish = () => {
      if (back.checked && !hasBack(link.target)) {
        const t = pointOf(l, link.target);
        t.links.push({ id: 'l' + rid(5), target: p.id, yaw: Math.round(wrapYaw(link.yaw - (p.north || 0) + 180 + (t.north || 0)) * 10) / 10, pitch: link.pitch });
        markDirty();
        toast('Passage retour ajouté dans « ' + t.name + ' ». Vérifie sa position en y allant.', 4500);
      }
      closeSheet();
    };
    const editable = canEditLink(l, p, link);
    if (!editable) sel.disabled = true;
    openSheet(isNew ? 'Nouveau passage' : 'Passage', [
      field('Mène vers', sel),
      el('label', { class: 'field', style: { gridTemplateColumns: 'auto 1fr', alignItems: 'center', display: 'grid', gap: '8px' } }, [back, el('span', { text: 'Ajouter aussi le passage retour', style: { textTransform: 'none', letterSpacing: '0', fontSize: '15px' } })]),
      el('p', { class: 'help', text: 'Le passage retour est placé dans la direction opposée. Pour qu’il tombe juste, règle l’orientation des deux pièces (bouton Orientation).' })
    ], [
      el('button', { type: 'button', class: 'btn primary', text: 'Terminé', onclick: finish }),
      editable ? el('button', { type: 'button', class: 'btn', text: 'Déplacer', onclick: () => { closeSheet(); startTool('move-link', 'Clique sur le sol là où déplacer le cercle', link); } }) : null,
      editable ? el('button', { type: 'button', class: 'btn danger', text: 'Supprimer', onclick: () => { p.links = p.links.filter(x => x !== link); buildLinks(); markDirty(); closeSheet(); } }) : null
    ]);
  }
  function openNorthSheet() {
    const p = visit.point;
    const val = el('b', { text: (p.north || 0).toFixed(1) + '°' });
    openSheet('Orientation', [
      el('p', { class: 'note', text: 'Pour qu’on garde la même direction en passant d’une pièce à l’autre, choisis un repère commun (par exemple la façade vitrée ou la porte d’entrée), tourne la vue vers lui dans chaque pièce, puis clique sur le bouton.' }),
      el('p', {}, ['Repère actuel de « ' + p.name + ' » : ', val])
    ], [el('button', {
      type: 'button', class: 'btn primary', text: 'Utiliser la direction actuelle', onclick: () => {
        p.north = Math.round(wrapYaw(visit.viewer.view.yaw) * 10) / 10; val.textContent = p.north.toFixed(1) + '°'; orientBadge(); markDirty(); toast('Repère enregistré pour « ' + p.name + ' ».');
      }
    })]);
  }
  function openRoomsSheet() {
    const l = visit.listing;
    const box = el('div', { class: 'roomlist' });
    const render = () => {
      box.innerHTML = '';
      const el_ = canEditListing(l);
      l.points.forEach((p, i) => {
        const ep = canEditPoint(l, p);
        const name = el('input', { value: p.name, disabled: !ep, 'aria-label': 'Nom de la pièce', style: { width: '100%', border: '1px solid var(--line)', borderRadius: '6px', padding: '5px 8px', fontFamily: 'var(--label)', fontWeight: 700, fontSize: '16px' }, oninput: e => { p.name = e.target.value; markDirty(); buildLinks(); setVisitTexts(); } });
        box.append(el('div', { class: 'roomitem' + (p === visit.point ? ' current' : '') }, [
          el('span', { class: 'thumb', style: { backgroundImage: 'url("' + mediaURL(p.imageSmall || p.image) + '")' } }),
          el('div', {}, [name, el('small', { text: (l.start === p.id ? 'Départ de la visite' : '') })]),
          el('div', { class: 'acts' }, [
            iconBtn('eye', 'Aller dans cette pièce', () => jumpTo(p)),
            canAddRoom(l) ? iconBtn(l.start === p.id ? 'starFill' : 'star', 'Commencer la visite ici', () => { l.start = p.id; markDirty(); render(); }) : null,
            el_ ? iconBtn('up', 'Monter', () => { if (i > 0) { l.points.splice(i, 1); l.points.splice(i - 1, 0, p); markDirty(); render(); setVisitTexts(); } }) : null,
            ep ? iconBtn('image', 'Remplacer l’image 360°', () => { closeSheet(); openWizard(l, p); }) : null,
            canDeleteListing(l) ? iconBtn('trash', 'Supprimer la pièce', () => deletePoint(l, p, render)) : null
          ])
        ]));
      });
    };
    render();
    openSheet('Pièces de « ' + l.name + ' »', [canAddRoom(l) ? startPicker(l, render) : null, box], [
      canAddRoom(l) ? el('button', { type: 'button', class: 'btn primary', html: ICON.plus + '<span>Ajouter une pièce</span>', onclick: () => { closeSheet(); openWizard(l); } }) : null,
      el('button', { type: 'button', class: 'btn', text: l.deco ? 'Infos de la décoration' : 'Infos du bien', onclick: () => openListingSheet(l) })
    ]);
  }
  // pièce dans laquelle le visiteur apparaît en ouvrant la visite (modifiable par l'admin et les gérants)
  function startPicker(l, onChange) {
    const sel = el('select', {
      id: 'startRoom', onchange: e => { l.start = e.target.value; markDirty(); renderCatalog(); onChange && onChange(); toast('La visite commencera dans « ' + (pointOf(l, l.start) || {}).name + ' ».'); }
    }, l.points.map(p => el('option', { value: p.id, text: p.name, selected: (l.start || (l.points[0] && l.points[0].id)) === p.id })));
    return field('Pièce de départ de la visite', sel, 'C’est la pièce dans laquelle on apparaît en ouvrant la visite.');
  }
  async function deletePoint(l, p, rerender) {
    const ok = await confirmBox('Supprimer « ' + p.name + ' » ?', 'La pièce, ses étiquettes et les passages qui y mènent seront supprimés.', 'Supprimer');
    if (!ok) return;
    dropMedia(p.image); dropMedia(p.imageSmall);
    l.points = l.points.filter(x => x !== p);
    l.points.forEach(q => { q.links = q.links.filter(k => k.target !== p.id); });
    if (l.start === p.id) l.start = l.points[0] ? l.points[0].id : null;
    markDirty(); renderCatalog();
    if (!l.points.length) { closeSheet(); leaveVisit(); return; }
    if (visit.point === p) { visit.point = null; await openVisit(l, l.start); }
    else buildLinks();
    rerender && rerender();
  }

  // ------------------------------------------------------------------ assistant d'assemblage
  const wiz = { listing: null, replace: null, files: [], S: null, viewer: null, preview: null, sel: -1, equi: null, adj: {} };
  function openWizard(l, replacePoint) {
    if (!replacePoint && l.deco && !baseOf(l)) { toast('Choisis d’abord l’intérieur du catalogue de cette décoration.', 5000); openListingSheet(l); return; }
    Object.assign(wiz, { listing: l, replace: replacePoint || null, files: [], S: null, sel: -1, equi: null, adj: {} });
    $('wizTitle').textContent = replacePoint ? 'Nouvelle image pour « ' + replacePoint.name + ' »' : 'Nouvelle pièce · ' + l.name;
    $('wizard').hidden = false;
    wizStepFiles();
  }
  function closeWizard() {
    if (wiz.viewer) { wiz.viewer.dispose(); wiz.viewer = null; }
    wiz.S = null; wiz.files = [];
    $('wizard').hidden = true;
  }
  $('wizClose').addEventListener('click', async () => {
    if (wiz.busy) return;
    if ((wiz.files.length || wiz.S) && !(await confirmBox('Fermer l’assistant ?', 'L’assemblage en cours sera perdu.', 'Fermer'))) return;
    closeWizard();
  });
  function steps(cur) {
    return el('div', { class: 'steps' }, ['Screens', 'Assemblage', 'Vérification'].map((s, i) => el('span', { 'aria-current': i === cur ? 'step' : null, text: (i + 1) + '. ' + s })));
  }
  function wizStepFiles() {
    const body = $('wizBody'); body.innerHTML = '';
    const nameIn = el('input', { id: 'wizName', value: wiz.replace ? wiz.replace.name : 'Pièce ' + (wiz.listing.points.length + 1), disabled: !!wiz.replace });
    const input = el('input', { id: 'wizFiles', type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: e => setFiles(e.target.files) });
    const equiIn = el('input', { id: 'wizEqui', type: 'file', accept: 'image/*', hidden: true, onchange: e => useEquirect(e.target.files[0], nameIn.value) });
    const drop = el('div', { class: 'drop' }, [
      el('b', { text: 'Dépose ici tous les screens de ce point' }),
      el('p', { text: 'Nomme-les 1, 2, 3… dans l’ordre où tu les as pris : l’assistant se sert de ces numéros pour placer chaque screen.' }),
      el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' } }, [
        el('button', { type: 'button', class: 'btn primary', text: 'Choisir les screens', onclick: () => input.click() }),
        el('button', { type: 'button', class: 'btn', text: 'J’ai déjà une image 360°', onclick: () => equiIn.click() })
      ])
    ]);
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => setFiles(e.dataTransfer.files));
    const thumbs = el('div', { class: 'thumbs', id: 'wizThumbs' });
    // règle de prise de vue : l'avant-dernier screen est le sol, le dernier le plafond
    const polesIn = el('input', { type: 'checkbox', id: 'wizPoles', checked: wiz.lastArePoles !== false, onchange: e => { wiz.lastArePoles = e.target.checked; drawThumbs(); } });
    const polesField = el('label', { class: 'checkline' }, [polesIn, el('span', { text: 'L’avant-dernier screen est le sol et le dernier est le plafond' })]);
    const go = el('button', { type: 'button', class: 'btn primary', id: 'wizGo', text: 'Assembler', disabled: true, onclick: () => runStitch(nameIn.value) });
    const count = el('span', { id: 'wizCount', class: 'help' });
    function setFiles(list) {
      const arr = [...list].filter(f => /^image\//.test(f.type));
      // ordre des numéros dans le nom (1, 2, … 10, 11) ; sans numéro, ordre de prise de vue
      const numbered = arr.length && arr.every(f => /\d/.test(f.name)) && new Set(arr.map(f => f.name)).size === arr.length;
      arr.sort((a, b) => numbered ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : (a.lastModified - b.lastModified) || a.name.localeCompare(b.name, undefined, { numeric: true }));
      wiz.files = arr;
      drawThumbs();
      count.textContent = arr.length ? arr.length + ' screens' + (numbered ? ', dans l’ordre de leurs numéros' : '') : '';
      go.disabled = arr.length < 4;
      if (arr.length && arr.length < 4) toast('Il faut au moins 4 screens qui se recouvrent.');
      if (arr.length && !numbered) toast('Les noms des screens n’ont pas de numéro : ils sont rangés par date. Nomme-les 1, 2, 3… pour être sûr de l’ordre.', 6000);
    }
    function drawThumbs() {
      thumbs.innerHTML = '';
      const n = wiz.files.length, poles = wiz.lastArePoles !== false && n >= 6;
      wiz.files.forEach((f, i) => {
        const url = URL.createObjectURL(f);
        const tag = poles && i === n - 2 ? 'Sol' : poles && i === n - 1 ? 'Plafond' : null;
        thumbs.append(el('div', { class: 'thumb-card' + (tag ? ' pole' : '') }, [
          el('img', { src: url, alt: '', onload: () => URL.revokeObjectURL(url) }),
          el('span', { class: 'num', text: String(i + 1) }),
          tag ? el('span', { class: 'role', text: tag }) : null,
          el('small', { class: 'fname', text: f.name })
        ]));
      });
    }
    body.append(steps(0),
      el('div', { class: 'panel' }, [field('Nom de la pièce', nameIn)]),
      drop, input, equiIn,
      el('div', { style: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } }, [go, count]),
      polesField,
      thumbs,
      el('div', { class: 'panel' }, [
        el('h4', { text: 'Comment prendre et nommer les screens' }),
        el('ol', { class: 'howto' }, [
          el('li', { text: 'Place la caméra au point de départ, HUD caché, et garde le même zoom pour tout le point. Ne déplace jamais la caméra : fais-la seulement tourner.' }),
          el('li', { text: 'Screen 1 : face au départ. Puis tourne vers la droite, un peu à chaque fois (chaque screen recouvre bien le précédent), jusqu’à revenir juste à gauche du départ.' }),
          el('li', { text: 'Avant-dernier screen : le sol (regarde droit vers le bas). Dernier screen : le plafond (regarde droit vers le haut).' }),
          el('li', { text: 'Nomme les fichiers 1, 2, 3… dans cet ordre, puis dépose-les tous ici.' })
        ])
      ]));
    if (wiz.files.length) { drawThumbs(); count.textContent = wiz.files.length + ' screens'; go.disabled = wiz.files.length < 4; }
  }
  async function useEquirect(file, name) {
    if (!file) return;
    try {
      const bmp = await createImageBitmap(file);
      const ratio = bmp.width / bmp.height;
      if (Math.abs(ratio - 2) > 0.06) { toast('Une image 360° doit être deux fois plus large que haute.', 4500); return; }
      const W = Math.min(4096, bmp.width), c = document.createElement('canvas'); c.width = W; c.height = W / 2;
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, W, W / 2);
      wiz.equi = { canvas: c, name };
      wiz.S = null;
      showResult(c, name);
    } catch (e) { toast('Cette image n’a pas pu être lue.'); }
  }
  async function runStitch(name) {
    const body = $('wizBody'); body.innerHTML = '';
    const lab = el('b', { text: 'Préparation…' }), bar = el('i'), pct = el('span', { class: 'help' });
    body.append(steps(1), el('div', { class: 'progress' }, [lab, el('div', { class: 'bar' }, [bar]), pct]),
      el('p', { class: 'help', text: 'Compte entre 20 secondes et une minute selon le nombre de screens. Garde cet onglet ouvert.' }));
    const weights = { 'Lecture des captures': [0, 3], 'Analyse des captures': [3, 12], 'Recherche des recouvrements': [12, 17], 'Vérification des recouvrements': [17, 22], 'Placement du tour': [22, 62], 'Alignement des murs unis': [55, 60], 'Calcul de la position des captures': [60, 62], 'Ajustement global': [62, 65], 'Placement du plafond et du sol': [65, 99], 'Prêt': [99, 100] };
    wiz.busy = true;
    try {
      const n = wiz.files.length, poles = wiz.lastArePoles !== false && n >= 6;
      wiz.S = await Stitcher.prepare(wiz.files, {
        roles: wiz.files.map((f, i) => poles && i === n - 2 ? 'down' : poles && i === n - 1 ? 'up' : 'auto'),
        onProgress: (s, p) => { const w = weights[s] || [0, 100]; const v = w[0] + (w[1] - w[0]) * p; lab.textContent = s; bar.style.width = v.toFixed(1) + '%'; pct.textContent = Math.round(v) + ' %'; }
      });
      lab.textContent = 'Aperçu…'; bar.style.width = '100%';
      const out = await Stitcher.renderEquirect(wiz.S, 2048);
      showResult(toCanvas(out), name);
    } catch (e) {
      body.innerHTML = '';
      body.append(steps(1), el('p', { class: 'note error', text: (e && e.message) || 'L’assemblage a échoué.' }),
        el('div', {}, [el('button', { type: 'button', class: 'btn primary', text: 'Recommencer', onclick: wizStepFiles })]));
    }
    wiz.busy = false;
  }
  function toCanvas(out) {
    const c = document.createElement('canvas'); c.width = out.width; c.height = out.height;
    c.getContext('2d').putImageData(new ImageData(out.data, out.width, out.height), 0, 0);
    return c;
  }
  const ROLE_LABEL = { ring: 'Tour', up: 'Plafond', down: 'Sol', ignore: 'Ignorée' };
  function roleOf(c) { return c.role === 'ignore' ? 'ignore' : c.role === 'up' ? 'up' : c.role === 'down' ? 'down' : 'ring'; }
  function showResult(canvas, name) {
    const body = $('wizBody'); body.innerHTML = '';
    if (wiz.viewer) { wiz.viewer.dispose(); wiz.viewer = null; }
    const stage = el('div', { class: 'stage' });
    const prev = el('div', { class: 'preview360' }, [stage]);
    const side = el('div', { class: 'panel', id: 'wizSide' });
    const validate = el('button', { type: 'button', class: 'btn primary', id: 'wizValidate', text: wiz.replace ? 'Remplacer l’image' : 'Valider la pièce', onclick: () => finishWizard(name) });
    body.append(steps(2), el('div', { class: 'result' }, [
      el('div', { style: { display: 'grid', gap: '12px' } }, [prev,
        el('p', { class: 'help', text: 'Glisse dans l’aperçu pour regarder partout, surtout vers le plafond et le sol.' }),
        el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [validate, el('button', { type: 'button', class: 'btn', text: 'Recommencer', onclick: wizStepFiles })])]),
      side]));
    wiz.viewer = new PanoViewer(stage, { keyboard: false, autoRotate: false });
    setPreview(canvas);
    renderSide();
  }
  function setPreview(canvas) {
    wiz.preview = canvas;
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = wiz.viewer.renderer.capabilities.getMaxAnisotropy();
    const old = wiz.viewer.sphere.material.map;
    wiz.viewer.setTexture(tex);
    if (old && old !== tex) old.dispose();
  }
  async function rerenderPreview() {
    const out = await Stitcher.renderEquirect(wiz.S, 2048);
    setPreview(toCanvas(out));
  }
  function renderSide() {
    const side = $('wizSide'); if (!side) return;
    side.innerHTML = '';
    if (!wiz.S) {
      side.append(el('h4', { text: 'Image 360° importée' }), el('p', { class: 'help', text: 'Vérifie le rendu dans l’aperçu, puis valide.' }));
      return;
    }
    const S = wiz.S;
    const nb = S.cams.filter(c => !c.aligned && c.role !== 'ignore').length;
    side.append(el('h4', { text: 'Rôle de chaque screen' }),
      el('p', { class: 'help', text: 'Si le plafond ou le sol est mal placé, change le rôle du screen concerné ou ajuste-le avec les curseurs.' }));
    if (nb) side.append(el('p', { class: 'note', text: nb + ' screen(s) n’ont pas pu être placés. Ils sont ignorés dans l’image.' }));
    const thumbs = el('div', { class: 'thumbs' });
    S.cams.forEach((c, i) => {
      const url = URL.createObjectURL(wiz.files[i]);
      const sel = el('select', { 'aria-label': 'Rôle du screen ' + (i + 1), onchange: e => changeRole(i, e.target.value) },
        Object.entries(ROLE_LABEL).map(([v, t]) => el('option', { value: v, text: t, selected: roleOf(c) === v })));
      const card = el('div', { class: 'thumb-card' + (c.aligned || c.role === 'ignore' ? '' : ' bad') + (wiz.sel === i ? ' sel' : '') }, [
        el('img', { src: url, alt: '', onload: () => URL.revokeObjectURL(url), onclick: () => { wiz.sel = (c.role === 'up' || c.role === 'down') ? i : -1; renderSide(); } }),
        el('span', { class: 'num', text: String(i + 1) }), sel]);
      thumbs.append(card);
    });
    side.append(thumbs);
    const sc = S.cams[wiz.sel];
    if (sc && (sc.role === 'up' || sc.role === 'down')) {
      const a = wiz.adj[wiz.sel] || (wiz.adj[wiz.sel] = { spin: 0, tiltX: 0, tiltY: 0, zoom: 0 });
      let timer = null;
      const slider = (key, label, min, max, unit) => {
        const out = el('output', { text: a[key] + unit });
        const inp = el('input', {
          type: 'range', min, max, step: key === 'spin' ? 1 : 0.5, value: a[key], oninput: e => {
            a[key] = +e.target.value; out.textContent = a[key] + unit;
            clearTimeout(timer); timer = setTimeout(async () => { Stitcher.adjustPole(S, wiz.sel, a); await rerenderPreview(); }, 120);
          }
        });
        return el('label', { class: 'slider' }, [el('span', { text: label }), inp, out]);
      };
      side.append(el('h4', { text: 'Réglage du screen ' + (wiz.sel + 1) + ' (' + ROLE_LABEL[sc.role] + ')' }),
        slider('spin', 'Rotation', -180, 180, '°'), slider('tiltX', 'Bascule avant', -15, 15, '°'), slider('tiltY', 'Bascule côté', -15, 15, '°'), slider('zoom', 'Zoom', -15, 15, ' %'),
        el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
          el('button', { type: 'button', class: 'btn', text: 'Remettre à zéro', onclick: async () => { wiz.adj[wiz.sel] = { spin: 0, tiltX: 0, tiltY: 0, zoom: 0 }; Stitcher.adjustPole(S, wiz.sel, wiz.adj[wiz.sel]); renderSide(); await rerenderPreview(); } }),
          el('button', { type: 'button', class: 'btn danger', text: 'Retirer ce screen', onclick: () => changeRole(wiz.sel, 'ignore') })
        ]),
        el('p', { class: 'help', text: 'Sur un plafond uni, retirer le screen donne souvent un meilleur résultat : la zone est alors complétée en douceur.' }));
    } else if (S.cams.some(c => c.role === 'up' || c.role === 'down')) {
      side.append(el('p', { class: 'help', text: 'Clique sur la vignette d’un plafond ou d’un sol pour l’ajuster.' }));
    }
  }
  async function changeRole(i, role) {
    const side = $('wizSide');
    side.style.opacity = '.55'; side.style.pointerEvents = 'none';
    try {
      await Stitcher.setPoleRole(wiz.S, i, role);
      delete wiz.adj[i];
      wiz.sel = (role === 'up' || role === 'down') ? i : -1;
      await rerenderPreview();
      if (role === 'ring' && !wiz.S.cams[i].aligned) toast('Ce screen n’a pas pu être raccordé au tour.');
    } catch (e) { toast('Ce changement n’a pas pu être appliqué.'); }
    side.style.opacity = ''; side.style.pointerEvents = '';
    renderSide();
  }
  // vue perspective tirée d'une image équirectangulaire (pour la couverture)
  function perspectiveFrom(src, yaw, pitch, fov, W, H) {
    const sw = src.width, sh = src.height, sd = src.getContext('2d').getImageData(0, 0, sw, sh).data;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
    const f = (W / 2) / Math.tan(fov * D2R / 2), cp = Math.cos(pitch * D2R), sp = Math.sin(pitch * D2R), cy = Math.cos(yaw * D2R), sy = Math.sin(yaw * D2R);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let vx = x - W / 2 + 0.5, vy = y - H / 2 + 0.5, vz = f;
      const L = Math.hypot(vx, vy, vz); vx /= L; vy /= L; vz /= L;
      const y1 = vy * cp - vz * sp, z1 = vy * sp + vz * cp;          // inclinaison
      const x2 = vx * cy + z1 * sy, z2 = -vx * sy + z1 * cy;           // cap
      const lon = Math.atan2(x2, z2), lat = Math.asin(Math.max(-1, Math.min(1, -y1)));
      const u = Math.min(sw - 1, Math.max(0, ((lon + Math.PI) / (2 * Math.PI)) * sw | 0)), v = Math.min(sh - 1, Math.max(0, ((Math.PI / 2 - lat) / Math.PI) * sh | 0));
      const i = (v * sw + u) * 4, o = (y * W + x) * 4;
      d[o] = sd[i]; d[o + 1] = sd[i + 1]; d[o + 2] = sd[i + 2]; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  const toBlob = (c, q) => new Promise(r => c.toBlob(r, 'image/jpeg', q));
  async function finishWizard(name) {
    const body = $('wizBody'), l = wiz.listing;
    const btn = $('wizValidate'); if (btn) btn.disabled = true;
    wiz.busy = true;
    const prog = el('div', { class: 'progress' }, [el('b', { text: 'Rendu en haute définition…' }), el('div', { class: 'bar' }, [el('i', { id: 'finBar' })])]);
    body.prepend(prog);
    try {
      let big;
      if (wiz.S) {
        const out = await Stitcher.renderEquirect(wiz.S, 4096, p => { const b = $('finBar'); if (b) b.style.width = (p * 90).toFixed(1) + '%'; });
        big = toCanvas(out);
      } else big = wiz.equi.canvas;
      const small = document.createElement('canvas'); small.width = 2048; small.height = 1024;
      const sg = small.getContext('2d'); sg.imageSmoothingQuality = 'high'; sg.drawImage(big, 0, 0, 2048, 1024);
      const [b1, b2] = await Promise.all([toBlob(big, 0.86), toBlob(small, 0.84)]);
      let p = wiz.replace;
      if (!p) {
        const id = uniqueId(slugify(name || 'piece'), l.points.map(q => q.id));
        p = { id, name: (name || 'Pièce').trim() || 'Pièce', image: null, imageSmall: null, north: 0, yaw: 0, pitch: -4, pins: [], links: [] };
        if (me()) p.createdBy = me();
        l.points.push(p);
        if (!l.start) l.start = p.id;
      } else { dropMedia(p.image); dropMedia(p.imageSmall); }
      const base = 'media/' + l.id + '/' + p.id + '-' + rid(5);
      addMedia(base + '.jpg', b1); addMedia(base + '-2k.jpg', b2);
      p.image = base + '.jpg'; p.imageSmall = base + '-2k.jpg';
      if (!l.cover) {
        const cov = perspectiveFrom(small, p.yaw, p.pitch, 75, 1280, 800);
        const cb = await toBlob(cov, 0.86);
        const cp = 'media/' + l.id + '/cover-' + rid(5) + '.jpg';
        addMedia(cp, cb); l.cover = cp;
      }
      markDirty(); renderCatalog();
      wiz.busy = false;
      closeWizard();
      if (visit.point === p) { visit.point = null; }
      go(l, p.id);
      setTimeout(() => toast(wiz.replace ? 'Image remplacée. Pense à enregistrer.' : 'Pièce ajoutée. Règle la vue de départ, les étiquettes et les passages, puis enregistre.', 6000), 300);
    } catch (e) {
      wiz.busy = false;
      prog.remove();
      if (btn) btn.disabled = false;
      toast('Le rendu final a échoué. Réessaie.');
    }
  }

  function normalizeListing(l) {
    if (OLD_TYPES[l.type]) l.type = OLD_TYPES[l.type];
    delete l.district; delete l.surface; delete l.rooms; delete l.garage;
    l.points = l.points || []; l.points.forEach(p => { p.pins = p.pins || []; p.links = p.links || []; });
  }
  function normalize(d) {
    d.listings.forEach(normalizeListing);
    fillSite(d);
  }

  // ------------------------------------------------------------------ historique (admin) : biens supprimés et journal
  function whenText(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  function dayLabel(iso) {
    const d = new Date(iso), t = new Date(), y = new Date(); y.setDate(t.getDate() - 1);
    const same = (a, b) => a.toDateString() === b.toDateString();
    if (same(d, t)) return 'Aujourd’hui';
    if (same(d, y)) return 'Hier';
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  async function openHistory() {
    const trashBox = el('div', { class: 'stafflist' }, [el('p', { class: 'help', text: 'Chargement…' })]);
    const logBox = el('div', { class: 'loglist' });
    const err = el('p', { class: 'note error', hidden: true });
    openSheet('Historique', [
      el('h4', { class: 'subhead', text: 'Biens supprimés' }),
      el('p', { class: 'help', text: 'Un bien supprimé reste ici pour toujours, avec toutes ses pièces et ses images : il ne peut pas être effacé, seulement restauré.' }),
      trashBox, err,
      el('h4', { class: 'subhead', text: 'Dernières modifications' }),
      logBox
    ]);
    const drawTrash = items => {
      if (!items.length) { fill(trashBox, [el('p', { class: 'note', text: 'Aucun bien supprimé pour le moment.' })]); return; }
      fill(trashBox, items.map(t => {
        const pr = priceParts(t);
        return el('div', { class: 'trashitem' }, [
          el('span', { class: 'thumb', style: t.cover ? { backgroundImage: 'url("' + mediaURL(t.cover) + '")' } : {} }),
          el('div', {}, [
            el('b', { text: t.name || 'Sans nom' }),
            el('small', { text: kindOf(t) + ', ' + pr.text + (pr.per || '') + ', ' + t.rooms + (t.rooms > 1 ? ' pièces' : ' pièce') }),
            el('small', { text: 'Supprimé le ' + whenText(t.deletedAt) + ' par ' + t.deletedBy })
          ]),
          el('div', { class: 'trashacts' }, [
            el('button', { type: 'button', class: 'btn primary', text: 'Restaurer', onclick: e => restoreListing(t, e.currentTarget) })
          ])
        ]);
      }));
    };
    const loadLog = async () => {
      try {
        const items = (await api('GET', '/api/log')).items.slice(0, 120);
        if (!items.length) { fill(logBox, [el('p', { class: 'help', text: 'Rien pour le moment.' })]); return; }
        const kids = []; let last = null;
        items.forEach(x => {
          const lab = dayLabel(x.at);
          if (lab !== last) { kids.push(el('p', { class: 'logday', text: lab.charAt(0).toUpperCase() + lab.slice(1) })); last = lab; }
          kids.push(el('div', { class: 'logitem' }, [
            el('time', { datetime: x.at, text: new Date(x.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }),
            el('p', {}, [el('b', { text: x.by }), ' ' + x.text])
          ]));
        });
        fill(logBox, kids);
      } catch (x) { fill(logBox, [el('p', { class: 'note error', text: x.message })]); }
    };
    const restoreListing = async (t, btn) => {
      btn.disabled = true; err.hidden = true;
      try {
        const r = await api('POST', '/api/trash/' + encodeURIComponent(t.id) + '/restore', {});
        const l = r.listing; normalizeListing(l);
        // le bien revient dans le catalogue sans toucher aux modifications en cours
        if (!listing(l.id)) state.data.listings.push(l);
        const base = JSON.parse(state.saved);
        if (!base.listings.some(x => x.id === l.id)) { base.listings.push(JSON.parse(JSON.stringify(l))); state.saved = JSON.stringify(base); }
        renderCatalog(); refreshPage(); updateAgentBar();
        toast('« ' + l.name + ' » est de retour dans le catalogue.', 4500);
        drawTrash((await api('GET', '/api/trash')).items); loadLog();
      } catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
    };
    try { drawTrash((await api('GET', '/api/trash')).items); } catch (x) { fill(trashBox, []); err.textContent = x.message; err.hidden = false; }
    loadLog();
  }

  // ------------------------------------------------------------------ pages du site
  const TYPE_INFO = {
    'Maison': { plural: 'Maisons', slug: 'maisons' },
    'Appartement': { plural: 'Appartements', slug: 'appartements' },
    'Bureaux': { plural: 'Bureaux', slug: 'bureaux' },
    'Entrepôt': { plural: 'Entrepôts', slug: 'entrepots' },
    'Motel/Hôtel': { plural: 'Hôtel/Motel', slug: 'hotel-motel' },
    'Location Pro': { plural: 'Locations PRO', slug: 'locations-pro' },
    'Intérieur vide': { plural: 'Intérieurs vides', slug: 'interieurs-vides' }
  };
  const typePlural = t => (TYPE_INFO[t] || {}).plural || t;
  const typeSlug = t => (TYPE_INFO[t] || {}).slug || slugify(t);
  const typeFromSlug = s => TYPES.find(t => typeSlug(t) === s) || null;
  const PAGE_TITLES = { accueil: 'Accueil', catalogue: 'Catalogue', decorateurs: 'Décorateurs', informations: 'Informations', equipe: 'Qui sommes-nous ?', recrutements: 'Recrutements', calendrier: 'Calendrier', faq: 'Réponses FAQ', avis: 'Avis' };

  const SITE_DEFAULT = {
    home: {
      lead: 'Le **Dynasty 8** vous accompagne dans tous vos projets immobiliers à Los Santos et ses alentours.',
      text: '**Location, achat ou recherche d’un bien**, notre équipe met son expertise à votre service afin de vous proposer des propriétés adaptées à vos envies et à votre budget.',
      tagline: 'Votre projet, notre priorité. Votre futur commence ici.',
      photos: ['accueil-1.jpg', 'accueil-2.jpg']
    },
    info: {
      intro: 'Retrouvez ici toutes les informations utiles relatives au **Dynasty 8** : notre fonctionnement, nos services, nos tarifs, nos procédures ainsi que les renseignements nécessaires pour vos locations et achats immobiliers.',
      warning: 'Avant d’effectuer une demande auprès du Dynasty 8, merci de vous assurer que votre nom et votre prénom sont correctement renseignés sur votre profil Intranet.',
      note: 'Toute demande effectuée sans ces informations ne pourra pas être prise en compte.',
      sections: [
        { id: 's1', title: 'Demande de recrutement', text: 'Vous souhaitez rejoindre l’équipe du Dynasty 8 ? Pour que votre candidature puisse être étudiée, merci de nous transmettre les informations suivantes : nom et prénom, disponibilités, numéro de téléphone, photo de votre carte d’identité et photo de votre permis de conduire.\n\nVous pouvez également joindre un CV et/ou une lettre de motivation afin de nous présenter votre parcours, vos expériences et vos motivations. Cela constituera un véritable plus pour votre candidature.' },
        { id: 's2', title: 'Demande de partenariat', text: 'Vous représentez une entreprise et souhaitez mettre en place un partenariat avec Dynasty 8 ? Présentez-nous votre entreprise, le partenariat que vous souhaitez proposer ainsi que les avantages et engagements envisagés pour chacune des parties.\n\nLa Direction étudiera votre proposition et reviendra vers vous afin d’échanger sur les différentes possibilités de collaboration.' },
        { id: 's3', title: 'Contact Direction', text: 'Vous souhaitez échanger directement avec la Direction du Dynasty 8 ? Cette rubrique est réservée aux demandes nécessitant l’intervention de la direction : questions administratives, réclamations, propositions ou toute autre demande importante concernant l’agence.\n\nMerci de détailler au maximum votre demande afin que nous puissions vous répondre efficacement.' },
        { id: 's4', title: 'Question immobilière', text: 'Vous souhaitez obtenir une estimation pour l’achat d’un bien ? Merci de nous transmettre : la localisation exacte de la résidence, plusieurs photos du logement ainsi que le nom ou la référence de l’intérieur que vous souhaitez y installer.\n\nPlus votre demande sera complète, plus nos agents pourront réaliser une estimation précise et adaptée à votre projet immobilier.\n\nUne fois l’estimation effectuée, si vous acceptez l’offre, merci d’envoyer une demande sur la centrale du Dynasty 8 lorsque l’agence est ouverte. Pensez à préciser dans votre demande qu’il s’agit d’un achat pour lequel une estimation a déjà été réalisée, afin que notre équipe puisse prendre en charge votre dossier rapidement.' }
      ]
    },
    team: {
      intro: 'Découvrez ici les visages qui font vivre le **Dynasty 8**. Retrouvez les membres de notre équipe, leurs fonctions et les personnes qui vous accompagnent au quotidien dans vos projets immobiliers.',
      members: [
        { id: 'm1', name: 'MIJARES Sofia', role: 'Patronne du D8 depuis le 20/08/2026', bio: 'J’ai repris le **Dynasty 8** avec l’envie de lui redonner toute son activité et de redorer son image. Petit à petit, je souhaite faire évoluer l’entreprise, construire une équipe investie et proposer à nos clients un accompagnement et des services de qualité. Aujourd’hui, je suis fière de pouvoir faire grandir le Dynasty et de lui donner un nouveau souffle !', photo: 'equipe-sofia.jpg' },
        { id: 'm2', name: 'BOUCHARD Alya', role: 'Employé du D8 depuis le 24/04/2026', bio: '', photo: null },
        { id: 'm3', name: 'ANGUS Juan', role: 'Employé du D8 depuis le 01/09/2026', bio: '', photo: null }
      ]
    },
    recruit: {
      open: false,
      intro: 'Ici, vous pouvez vérifier à tout moment si les recrutements du **Dynasty 8** sont **ouverts** ou **fermés**. Le statut sera régulièrement mis à jour afin de vous informer lorsque de nouvelles places seront disponibles.\n\nSi les recrutements sont ouverts, vous pourrez déposer votre candidature directement via notre intranet.',
      closedText: 'Merci à tous pour vos candidatures !',
      openText: 'Déposez votre candidature directement via notre intranet.'
    },
    calendar: {
      intro: 'Consultez les disponibilités du **Rooftop D8** et contactez-nous pour effectuer une demande de réservation.',
      booked: {}
    },
    reviews: {
      intro: 'Vous avez fait appel au **Dynasty 8** ? Partagez votre expérience : votre avis aide les futurs clients et toute l’équipe.'
    },
    decor: {
      intro: 'Découvrez les réalisations des décorateurs du **Dynasty 8**. Chaque décoration se visite en 360°, pièce par pièce.'
    },
    faq: {
      intro: 'Retrouvez ici toutes les réponses aux questions posées sur la FAQ du **Dynasty 8**, afin de vous renseigner rapidement sur nos services, nos démarches ou autres questions.',
      items: [
        { id: 'q1', q: 'Puis-je occuper une location si aucun contrat n’a été signé ?', a: 'Non. Il est strictement interdit d’occuper une location sans l’autorisation et la présence du Dynasty 8. Toute occupation d’un bien sans autorisation est considérée comme du squattage de propriété.\n\nSi une maison ou un appartement n’a pas encore été libéré, même lorsque l’ancien locataire est décédé ou n’occupe plus les lieux, cela signifie qu’une procédure de libération du bien peut être en cours. Le Dynasty 8 doit respecter ces procédures et ne peut pas supprimer ou résilier un contrat comme bon lui semble.' },
        { id: 'q2', q: 'Je n’ai plus accès à ma location, est-ce normal ?', a: 'Plusieurs raisons peuvent expliquer la perte d’accès à votre location. Pensez tout d’abord à vérifier chaque mois que les 1 $ de frais obligatoires ont bien été réglés. En cas de non-paiement, les huissiers peuvent récupérer les affaires présentes dans le logement et placer les véhicules qui s’y trouvent. Pour récupérer vos véhicules, il faudra faire une réclamation auprès des huissiers.\n\nEn cas d’absence beaucoup trop prolongée ou d’impayés, une procédure peut également être engagée auprès du gouvernement et des avocats. À l’issue de celle-ci, certaines locations peuvent être libérées et supprimées.' },
        { id: 'q3', q: 'Comment puis-je payer mon loyer ?', a: 'Pour régler votre loyer, vous devez vous rendre directement au Dynasty 8 pendant les horaires d’ouverture. L’agence est généralement disponible **tous les jours entre 19h et 00h**.\n\nSi aucun agent n’est présent à l’accueil, il est possible que l’ensemble de l’équipe soit actuellement en rendez-vous ou en déplacement pour effectuer des locations. Si vous en avez la possibilité, nous vous invitons à patienter jusqu’au retour d’un agent.\n\nCertains jours, nos agents peuvent également être indisponibles en raison de congés ou d’événements imprévus. Nous vous remercions donc pour votre compréhension et vous invitons à vous présenter selon les disponibilités de l’agence.' }
      ]
    }
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  function fillSite(d) {
    if (!d.site || typeof d.site !== 'object') { d.site = clone(SITE_DEFAULT); return; }
    Object.keys(SITE_DEFAULT).forEach(k => { if (!d.site[k] || typeof d.site[k] !== 'object') d.site[k] = clone(SITE_DEFAULT[k]); });
    if (!d.site.calendar.booked || typeof d.site.calendar.booked !== 'object') d.site.calendar.booked = {};
  }
  const site = () => state.data.site;

  // texte avec paragraphes (ligne vide), retours à la ligne et **gras**
  function inlineRich(node, text) {
    String(text || '').split('\n').forEach((line, i) => {
      if (i) node.append(el('br'));
      line.split(/(\*\*[^*\n]+\*\*)/).forEach(part => {
        if (/^\*\*[^*\n]+\*\*$/.test(part)) node.append(el('strong', { text: part.slice(2, -2) }));
        else if (part) node.append(part);
      });
    });
    return node;
  }
  function rich(text) {
    const box = el('div', { class: 'rich' });
    String(text || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean).forEach(par => box.append(inlineRich(el('p'), par)));
    return box;
  }
  function fill(box, kids) { box.innerHTML = ''; kids.forEach(k => k && box.append(k)); }
  const canEditSite = () => state.agent && isAdmin();
  function editButton(page) {
    if (!canEditSite()) return null;
    return el('button', { type: 'button', class: 'btn sun editbtn', html: ICON.pencil + '<span>Modifier cette page</span>', onclick: () => EDITORS[page]() });
  }
  function pageHead(title, intro) { return el('div', { class: 'pagehead' }, [el('h1', { text: title }), intro ? rich(intro) : null]); }

  let currentPage = 'accueil', lastPageHash = '#/';
  function showPage(name) {
    const changed = name !== currentPage;
    currentPage = name;
    document.querySelectorAll('#pages > .page').forEach(p => { p.hidden = p.dataset.page !== name; });
    renderNav();
    document.title = name === 'accueil' ? 'Dynasty 8 | Agence immobilière de Los Santos' : (name === 'catalogue' && state.filter.type !== 'all' ? typePlural(state.filter.type) : name === 'decorateurs' && decoPage ? decoName(decoPage) : PAGE_TITLES[name]) + ' | Dynasty 8';
    renderPage(name);
    $('mainnav').classList.remove('open'); $('navToggle').setAttribute('aria-expanded', 'false');
    if (changed) window.scrollTo(0, 0);
  }
  function renderPage(name) {
    if (!state.data) return;
    if (name === 'accueil') renderHome();
    else if (name === 'catalogue') renderCatalog();
    else if (name === 'informations') renderInfo();
    else if (name === 'equipe') renderTeam();
    else if (name === 'recrutements') renderRecruit();
    else if (name === 'calendrier') renderCal();
    else if (name === 'faq') renderFaq();
    else if (name === 'decorateurs') renderDeco();
    else if (name === 'avis') renderAvis();
  }
  const refreshPage = () => renderPage(currentPage);

  function renderNav() {
    const m = $('ddMenu'); if (!m || !state.data) return;
    const count = t => state.data.listings.filter(l => !l.deco && l.points.length && (t === 'all' || l.type === t)).length;
    const link = (href, label, n, cur) => el('a', { href, 'aria-current': cur ? 'page' : null }, [label, n ? el('small', { text: String(n) }) : null]);
    const onCat = currentPage === 'catalogue';
    fill(m, [link('#/catalogue', 'Tous les biens', count('all'), onCat && state.filter.type === 'all'), el('hr')]
      .concat(TYPES.map(t => link('#/catalogue/' + typeSlug(t), typePlural(t), count(t), onCat && state.filter.type === t))));
    // menu « Décorateurs » : une entrée par décorateur
    const dm = $('ddDeco'), list = decorators(), onDeco = currentPage === 'decorateurs';
    $('decoNav').hidden = !list.length;
    if (dm) fill(dm, [link('#/decorateurs', 'Tous les décorateurs', 0, onDeco && !decoPage), list.length ? el('hr') : null]
      .concat(list.map(x => {
        const n = state.data.listings.filter(l => l.deco === x.id && l.points.length).length;
        return el('a', { href: '#/decorateurs/' + x.id, 'aria-current': onDeco && decoPage === x.id ? 'page' : null }, [
          el('span', { class: 'dd-who' }, [avatarEl(x.name, x.photo, 'xs'), el('span', { text: x.name })]), n ? el('small', { text: String(n) }) : null
        ]);
      })));
    document.querySelectorAll('.mainnav > a, .mainnav .dd-top').forEach(a => {
      if (a.dataset.page === currentPage) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  // ---- mode sombre (bouton lune / soleil dans l'en-tête)
  const themeNow = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  function logoSrc() { return themeNow() === 'dark' ? 'logo-sombre.png' : 'logo.png'; }
  function showTheme() {
    const dark = themeNow() === 'dark', b = $('themeBtn');
    b.setAttribute('aria-pressed', String(dark));
    b.setAttribute('aria-label', dark ? 'Passer en mode clair' : 'Passer en mode sombre'); b.title = b.getAttribute('aria-label');
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', dark ? '#0C1310' : '#025934');
  }
  function setTheme(t, keep) {
    document.documentElement.dataset.theme = t;
    if (keep) try { localStorage.setItem('d8-theme', t); } catch (e) { }
    showTheme();
    if (state.data) refreshPage();   // les éléments dessinés par le site (logo de l'affiche…) suivent
  }
  // le clic est géré dans la page elle-même ; ici on redessine ce qui dépend du thème
  document.addEventListener('d8-theme', () => { showTheme(); if (state.data) refreshPage(); });
  // tant que le visiteur n'a rien choisi, on suit le réglage de son appareil
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => { let saved = null; try { saved = localStorage.getItem('d8-theme'); } catch (x) { } if (!saved) setTheme(e.matches ? 'dark' : 'light', false); }); } catch (e) { }
  showTheme();
  $('navToggle').addEventListener('click', () => {
    const open = !$('mainnav').classList.contains('open');
    $('mainnav').classList.toggle('open', open); $('navToggle').setAttribute('aria-expanded', String(open));
  });

  // ---- accueil
  function renderHome() {
    const s = site().home, photos = (s.photos || []).filter(Boolean).slice(0, 2);
    const box = $('homeIntro');
    box.classList.toggle('nophotos', !photos.length);
    fill(box, [
      el('div', {}, [editButton('accueil'), s.lead ? inlineRich(el('p', { class: 'lead' }), s.lead) : null, rich(s.text)]),
      photos.length ? el('div', { class: 'photos' + (photos.length === 1 ? ' one' : '') }, photos.map(p => el('img', { src: mediaURL(p), alt: 'L’équipe du Dynasty 8', loading: 'lazy' }))) : null,
      s.tagline ? el('p', { class: 'tagline', text: s.tagline }) : null
    ]);
    renderHomeLatest();
    renderHero();
  }
  function renderHomeLatest() {
    const g = $('homeGrid'); if (!g || !state.data) return;
    const items = state.data.listings.filter(l => !l.deco && l.points.length).sort((a, b) => (b.order || 0) - (a.order || 0)).slice(0, 3);
    $('homeLatest').hidden = !items.length;
    fill(g, items.map(cardOf));
  }

  // ---- informations
  const WARN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>';
  function renderInfo() {
    const s = site().info;
    fill($('pInfo'), [
      editButton('informations'),
      pageHead('Informations', s.intro),
      s.warning ? el('div', { class: 'callout', html: WARN }, [inlineRich(el('p'), s.warning + (s.note ? '*' : '')), s.note ? el('p', { class: 'fine', text: '*' + s.note }) : null]) : null,
      el('div', { class: 'infogrid' }, s.sections.map(x => el('article', { class: 'infocard' }, [el('h2', { text: x.title }), rich(x.text)])))
    ]);
  }

  // ---- qui sommes-nous
  function renderTeam() {
    const s = site().team;
    fill($('pTeam'), [
      editButton('equipe'),
      pageHead('Qui sommes-nous ?', s.intro),
      el('div', { class: 'team' }, s.members.map(m => el('article', { class: 'member' }, [
        el('img', { class: 'ph' + (m.photo ? '' : ' logo'), src: m.photo ? mediaURL(m.photo) : 'logo.png', alt: m.photo ? m.name : '', loading: 'lazy' }),
        el('div', {}, [el('h2', { text: m.name }), m.role ? el('p', { class: 'role', text: m.role }) : null, m.bio ? rich(m.bio) : null])
      ])))
    ]);
  }

  // ---- recrutements
  function renderRecruit() {
    const s = site().recruit;
    fill($('pRecruit'), [
      editButton('recrutements'),
      pageHead('Recrutements', s.intro),
      el('div', { class: 'recruit' + (s.open ? ' open' : ''), role: 'status' }, [
        el('span', { class: 'stripe a' }), el('span', { class: 'stripe b' }),
        el('img', { src: logoSrc(), alt: 'Dynasty 8', width: 180, height: 94 }),
        el('p', { class: 'word', text: 'Recrutements' }),
        el('p', { class: 'state', text: s.open ? 'Ouverts' : 'Fermés' }),
        (s.open ? s.openText : s.closedText) ? el('p', { class: 'msg', text: s.open ? s.openText : s.closedText }) : null
      ])
    ]);
  }

  // ---- calendrier du rooftop
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const DOWS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const pad = n => String(n).padStart(2, '0');
  const dayKey = (y, m, d) => y + '-' + pad(m + 1) + '-' + pad(d);
  let calMonth = null;
  function renderCal() {
    const s = site().calendar;
    if (!calMonth) { const n = new Date(); calMonth = new Date(n.getFullYear(), n.getMonth(), 1); }
    const y = calMonth.getFullYear(), m = calMonth.getMonth();
    const first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
    const now = new Date(), todayKey = dayKey(now.getFullYear(), now.getMonth(), now.getDate());
    const edit = canEditSite();
    const cells = DOWS.map(d => el('div', { class: 'dow', text: d }));
    for (let i = 0; i < first; i++) cells.push(el('div', { class: 'day out', 'aria-hidden': 'true' }));
    for (let d = 1; d <= days; d++) {
      const k = dayKey(y, m, d), booked = Object.prototype.hasOwnProperty.call(s.booked, k);
      const cls = 'day' + (booked ? ' booked' : '') + (k === todayKey ? ' today' : '') + (k < todayKey ? ' past' : '');
      const label = d + ' ' + MONTHS[m] + (booked ? ' : réservé' + (s.booked[k] ? ' (' + s.booked[k] + ')' : '') : ' : libre');
      const kids = [el('span', { class: 'n', text: String(d) }), booked ? el('span', { class: 'what', text: s.booked[k] || 'Réservé' }) : null];
      cells.push(edit ? el('button', { type: 'button', class: cls, 'aria-label': label, onclick: () => openDaySheet(k) }, kids) : el('div', { class: cls, 'aria-label': label }, kids));
    }
    const nav = (delta, label, icon) => iconBtn(icon, label, () => { calMonth = new Date(y, m + delta, 1); renderCal(); });
    fill($('pCal'), [
      editButton('calendrier'),
      pageHead('Calendrier', s.intro),
      edit ? el('p', { class: 'note', text: 'Clique sur un jour pour le marquer réservé ou libre, puis enregistre.' }) : null,
      el('div', { class: 'cal' }, [
        el('div', { class: 'cal-head' }, [
          el('h2', {}, [MONTHS[m][0].toUpperCase() + MONTHS[m].slice(1) + ' ', el('span', { text: String(y) })]),
          el('div', { class: 'cal-nav' }, [nav(-1, 'Mois précédent', 'left'), nav(1, 'Mois suivant', 'right')])
        ]),
        el('div', { class: 'cal-grid' }, cells),
        el('div', { class: 'cal-legend' }, [el('span', {}, [el('i'), 'Libre']), el('span', {}, [el('i', { class: 'b' }), 'Réservé'])])
      ])
    ]);
  }
  function openDaySheet(k) {
    const s = site().calendar, [y, mo, d] = k.split('-').map(Number);
    const date = new Date(y, mo - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const isBooked = () => Object.prototype.hasOwnProperty.call(s.booked, k);
    const note = el('input', { id: 'dayNote', value: s.booked[k] || '', placeholder: 'Ex. Soirée privée', maxlength: 80 });
    const noteField = field('Motif (facultatif)', note, 'Affiché dans la case du calendrier.');
    const sw = el('div', { class: 'switch' });
    const draw = () => {
      fill(sw, [
        el('button', { type: 'button', class: 'on', 'aria-pressed': String(!isBooked()), text: 'Libre', onclick: () => { delete s.booked[k]; markDirty(); renderCal(); draw(); } }),
        el('button', { type: 'button', class: 'off', 'aria-pressed': String(isBooked()), text: 'Réservé', onclick: () => { s.booked[k] = note.value.trim(); markDirty(); renderCal(); draw(); } })
      ]);
      noteField.hidden = !isBooked();
    };
    note.addEventListener('input', () => { if (isBooked()) { s.booked[k] = note.value.trim(); markDirty(); renderCal(); } });
    draw();
    openSheet(date.charAt(0).toUpperCase() + date.slice(1), [sw, noteField], [el('button', { type: 'button', class: 'btn primary', text: 'Terminé', onclick: closeSheet })]);
  }

  // ---- réponses FAQ
  const CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  function renderFaq() {
    const s = site().faq;
    fill($('pFaq'), [
      editButton('faq'),
      pageHead('Réponses FAQ', s.intro),
      el('div', { class: 'faq' }, s.items.map((x, i) => el('details', { open: i === 0 }, [
        el('summary', {}, [el('span', { class: 'q', text: 'Q' }), el('span', { text: x.q }), el('span', { html: CHEV })]),
        el('div', { class: 'answer' }, [rich(x.a)])
      ])))
    ]);
  }

  // ---- décorateurs : une catégorie par compte décorateur, avec ses décorations à visiter en 360°
  const decorators = () => (state.data && state.data.decorators) || [];
  const decoName = id => (decorators().find(x => x.id === id) || {}).name || 'un décorateur';
  const decoItems = id => state.data.listings.filter(l => l.deco === id && (state.agent || l.points.length));
  let decoPage = null;
  function renderDeco() {
    const box = $('pDeco');
    if (!decoPage) {
      const list = decorators();
      fill(box, [
        editButton('decorateurs'),
        pageHead('Décorateurs', site().decor.intro),
        list.length ? el('div', { class: 'decogrid' }, list.map(x => {
          const items = state.data.listings.filter(l => l.deco === x.id && l.points.length);
          const bg = decoBanner(x);
          return el('a', { class: 'decocard', href: '#/decorateurs/' + x.id }, [
            el('span', { class: 'banner' + (bg ? '' : ' empty'), style: bg ? { backgroundImage: 'url("' + bg + '")' } : {} }),
            el('span', { class: 'who' }, [
              avatarEl(x.name, x.photo, 'deco'),
              el('b', { text: x.name }),
              el('small', { text: items.length ? items.length + (items.length > 1 ? ' décorations à visiter' : ' décoration à visiter') : 'Bientôt des décorations' }),
              el('span', { class: 'go', text: 'Voir ses décorations' })
            ])
          ]);
        })) : el('p', { class: 'note', text: 'Aucun décorateur pour le moment.' })
      ]);
      return;
    }
    const x = decorators().find(d => d.id === decoPage);
    if (!x) { fill(box, [pageHead('Décorateurs', null), el('p', { class: 'note', text: 'Ce décorateur n’existe plus.' }), el('a', { class: 'btn', href: '#/decorateurs', text: 'Voir tous les décorateurs' })]); return; }
    const items = decoItems(x.id).sort((a, b) => (b.order || 0) - (a.order || 0));
    const canNew = state.agent && (isAdmin() || (isDeco() && myUid() === x.id));
    const grid = el('div', { class: 'grid' });
    if (canNew) grid.append(el('button', { type: 'button', class: 'card new', onclick: () => newListing(x.id) }, [el('div', {}, [el('div', { class: 'plus', html: ICON.plus }), el('span', { text: 'Nouvelle décoration' })])]));
    items.forEach(l => grid.append(cardOf(l)));
    const n = items.filter(l => l.points.length).length;
    fill(box, [
      el('div', { class: 'deco-profile' }, [
        el('div', { class: 'banner' + (decoBanner(x) ? '' : ' empty'), style: decoBanner(x) ? { backgroundImage: 'url("' + decoBanner(x) + '")' } : {} }),
        el('div', { class: 'deco-id' }, [
          avatarEl(x.name, x.photo, 'xl'),
          el('div', {}, [
            el('h1', { text: x.name }),
            el('p', { class: 'sub', text: n ? n + (n > 1 ? ' décorations à visiter en 360°' : ' décoration à visiter en 360°') : 'Décorateur du Dynasty 8' })
          ])
        ])
      ]),
      el('div', { style: { height: '26px' } }),
      grid,
      !items.length && !canNew ? el('p', { class: 'empty', text: 'Pas encore de décoration dans cette catégorie.' }) : null
    ]);
  }

  // ---- avis des clients (tout le monde peut en publier un)
  let reviews = null, reviewsLoading = false;
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9Z"/></svg>';
  function starsEl(n, cls) {
    const box = el('span', { class: 'stars' + (cls ? ' ' + cls : ''), role: 'img', 'aria-label': (Math.round(n * 10) / 10).toString().replace('.', ',') + ' sur 5' });
    for (let i = 1; i <= 5; i++) {
      const fillPct = Math.max(0, Math.min(1, n - (i - 1))) * 100;
      const st = el('span', { class: 'star', html: STAR + STAR });
      st.style.setProperty('--f', fillPct + '%');   // part remplie de l'étoile (demi-étoiles comprises)
      box.append(st);
    }
    return box;
  }
  async function loadReviews() {
    if (reviewsLoading || !API) return;
    reviewsLoading = true;
    try { reviews = (await api('GET', '/api/reviews')).items; } catch (e) { if (!reviews) reviews = []; }
    reviewsLoading = false;
    if (currentPage === 'avis') renderAvis();
  }
  function renderAvis() {
    const box = $('pAvis');
    if (!reviews) { fill(box, [pageHead('Avis', site().reviews.intro), el('p', { class: 'help', text: 'Chargement des avis…' })]); loadReviews(); return; }
    const n = reviews.length, avg = n ? reviews.reduce((s, r) => s + r.stars, 0) / n : 0;
    const dist = [5, 4, 3, 2, 1].map(k => [k, reviews.filter(r => r.stars === k).length]);
    const summary = el('div', { class: 'avis-sum' }, [
      el('p', { class: 'avg' }, [n ? (Math.round(avg * 10) / 10).toFixed(1).replace('.', ',') : '–', el('small', { text: ' / 5' })]),
      starsEl(avg, 'big'),
      el('p', { class: 'count', text: n ? n + (n > 1 ? ' avis' : ' avis') : 'Aucun avis pour le moment' }),
      el('div', { class: 'dist' }, dist.map(([k, c]) => el('div', { class: 'distrow' }, [
        el('span', { text: k + ' ★' }), el('span', { class: 'bar' }, [el('i', { style: { width: (n ? c / n * 100 : 0) + '%' } })]), el('span', { class: 'c', text: String(c) })
      ])))
    ]);
    // formulaire
    let stars = 0;
    const nameIn = el('input', { id: 'rvName', maxlength: 60, autocomplete: 'name', placeholder: 'Ex. Jean Dupont' });
    const textIn = el('textarea', { id: 'rvText', maxlength: 1000, rows: 5, placeholder: 'Racontez votre expérience avec le Dynasty 8…' });
    const trap = el('input', { name: 'website', tabindex: '-1', autocomplete: 'off', class: 'trap', 'aria-hidden': 'true' });
    const pick = el('div', { class: 'starpick', role: 'radiogroup', 'aria-label': 'Note' });
    const drawPick = () => fill(pick, [1, 2, 3, 4, 5].map(k => el('button', {
      type: 'button', role: 'radio', 'aria-checked': String(stars === k), 'aria-label': k + (k > 1 ? ' étoiles' : ' étoile'), class: k <= stars ? 'on' : '', html: STAR,
      onclick: () => { stars = k; drawPick(); pick.querySelector('[aria-checked="true"]').focus(); }
    })));
    drawPick();
    pick.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { stars = Math.min(5, stars + 1); drawPick(); pick.querySelector('[aria-checked="true"]').focus(); e.preventDefault(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { stars = Math.max(1, stars - 1); drawPick(); pick.querySelector('[aria-checked="true"]').focus(); e.preventDefault(); }
    });
    const msg = el('p', { class: 'note error', hidden: true });
    const send = el('button', { type: 'submit', class: 'btn primary', id: 'rvSend', text: 'Publier mon avis' });
    const shownAt = Date.now();
    const form = el('form', { class: 'avis-form', novalidate: true }, [
      el('h2', { text: 'Donner mon avis' }),
      field('Nom et prénom', nameIn),
      el('div', { class: 'field' }, [el('span', { text: 'Note' }), pick]),
      field('Votre avis', textIn),
      trap, msg, send
    ]);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      msg.hidden = true; msg.className = 'note error';
      if (nameIn.value.trim().length < 2) { msg.textContent = 'Indiquez votre nom et votre prénom.'; msg.hidden = false; nameIn.focus(); return; }
      if (!stars) { msg.textContent = 'Choisissez une note de 1 à 5 étoiles.'; msg.hidden = false; return; }
      if (textIn.value.trim().length < 5) { msg.textContent = 'Écrivez quelques mots sur votre expérience.'; msg.hidden = false; textIn.focus(); return; }
      send.disabled = true;
      try {
        reviews = (await api('POST', '/api/reviews', { name: nameIn.value.trim(), stars, text: textIn.value.trim(), website: trap.value, t: Date.now() - shownAt })).items;
        renderAvis();
        toast('Merci ! Votre avis est publié.', 4500);
      } catch (x) { msg.textContent = x.message; msg.hidden = false; send.disabled = false; }
    });
    const admin = state.agent && isAdmin() && !!state.user;
    const list = el('div', { class: 'avis-list' }, n ? reviews.map(r => el('article', { class: 'avis' }, [
      el('header', {}, [
        el('span', { class: 'avatar', text: (r.name || '?').trim().charAt(0).toUpperCase() }),
        el('div', {}, [el('b', { text: r.name }), el('time', { datetime: r.at, text: new Date(r.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) })]),
        starsEl(r.stars)
      ]),
      el('p', { class: 'txt', text: r.text }),
      admin ? el('button', {
        type: 'button', class: 'btn danger', text: 'Supprimer cet avis', onclick: async () => {
          if (!(await confirmBox('Supprimer l’avis de ' + r.name + ' ?', 'Il disparaîtra du site tout de suite.', 'Supprimer'))) return;
          try { reviews = (await api('DELETE', '/api/reviews/' + encodeURIComponent(r.id))).items; renderAvis(); toast('Avis supprimé.'); } catch (x) { toast(x.message, 5000); }
        }
      }) : null
    ])) : [el('p', { class: 'note', text: 'Soyez le premier à donner votre avis !' })]);
    fill(box, [
      editButton('avis'),
      pageHead('Avis', site().reviews.intro),
      el('div', { class: 'avis-layout' }, [el('div', { class: 'avis-side' }, [summary, form]), list])
    ]);
  }

  // ---- éditeurs (admin)
  const siteChanged = () => { markDirty(); refreshPage(); };
  const RICH_HELP = 'Ligne vide = nouveau paragraphe. Mets un passage en gras en l’entourant de deux astérisques : **comme ceci**.';
  function edText(label, obj, key, opts) {
    opts = opts || {};
    const inp = opts.rows ? el('textarea', { rows: opts.rows }) : el('input', { type: 'text' });
    inp.value = obj[key] || '';
    inp.addEventListener('input', e => { obj[key] = e.target.value; siteChanged(); });
    return field(label, inp, opts.help);
  }
  function edList(arr, renderItem, make, addLabel) {
    const box = el('div', { class: 'stafflist' });
    const draw = () => {
      box.innerHTML = '';
      arr.forEach((it, i) => box.append(el('div', { class: 'ed-item' }, renderItem(it).concat([el('div', { class: 'ed-acts' }, [
        iconBtn('up', 'Monter', () => { if (i > 0) { arr.splice(i, 1); arr.splice(i - 1, 0, it); siteChanged(); draw(); } }),
        iconBtn('down', 'Descendre', () => { if (i < arr.length - 1) { arr.splice(i, 1); arr.splice(i + 1, 0, it); siteChanged(); draw(); } }),
        iconBtn('trash', 'Retirer', async () => {
          if (!(await confirmBox('Retirer cet élément ?', 'Il disparaîtra du site au prochain enregistrement.', 'Retirer'))) return;
          arr.splice(arr.indexOf(it), 1); siteChanged(); draw();
        })
      ])]))));
      box.append(el('button', { type: 'button', class: 'btn', html: ICON.plus + '<span>' + addLabel + '</span>', onclick: () => { arr.push(make()); siteChanged(); draw(); } }));
    };
    draw();
    return box;
  }
  // photo réduite dans le navigateur avant envoi
  function pickImage(maxSide) {
    return new Promise(resolve => {
      const inp = el('input', { type: 'file', accept: 'image/*' });
      inp.addEventListener('change', async () => {
        const f = inp.files && inp.files[0]; if (!f) { resolve(null); return; }
        try {
          const bmp = await createImageBitmap(f);
          const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
          const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
          const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, c.width, c.height);
          resolve(await toBlob(c, 0.86));
        } catch (e) { toast('Cette image n’a pas pu être lue.'); resolve(null); }
      });
      inp.click();
    });
  }
  function edPhoto(label, get, set, prefix, removable) {
    const wrap = el('div', { class: 'field' });
    const draw = () => {
      const p = get();
      fill(wrap, [el('span', { text: label }), el('div', { class: 'ed-photo' }, [
        el('img', { src: p ? mediaURL(p) : 'logo.png', alt: '' }),
        el('div', { class: 'btns' }, [
          el('button', {
            type: 'button', class: 'btn', text: p ? 'Changer la photo' : 'Ajouter une photo', onclick: async () => {
              const blob = await pickImage(1400); if (!blob) return;
              const path = 'media/site/' + prefix + '-' + rid(6) + '.jpg';
              const old = get();
              addMedia(path, blob); set(path);
              if (old) dropMedia(old);
              siteChanged(); draw();
            }
          }),
          p && removable ? el('button', { type: 'button', class: 'btn danger', text: 'Retirer', onclick: () => { const old = get(); set(null); dropMedia(old); siteChanged(); draw(); } }) : null
        ])
      ])]);
    };
    draw();
    return wrap;
  }
  const EDITORS = {
    avis() {
      const s = site().reviews;
      openSheet('Avis', [el('p', { class: 'help', text: RICH_HELP }), edText('Introduction', s, 'intro', { rows: 3 }),
        el('p', { class: 'note', text: 'Pour retirer un avis, utilise le bouton « Supprimer cet avis » sous l’avis concerné.' })],
      [el('button', { type: 'button', class: 'btn primary', text: 'Terminé', onclick: closeSheet })]);
    },
    decorateurs() {
      const s = site().decor;
      openSheet('Décorateurs', [el('p', { class: 'help', text: RICH_HELP }), edText('Introduction', s, 'intro', { rows: 3 }),
        el('p', { class: 'note', text: 'Chaque compte « Décorateur » (bouton Comptes) a automatiquement sa catégorie ici.' })],
      [el('button', { type: 'button', class: 'btn primary', text: 'Terminé', onclick: closeSheet })]);
    },
    accueil() {
      const s = site().home;
      s.photos = (s.photos || []).filter(Boolean);
      const slot = i => edPhoto('Photo ' + (i + 1), () => s.photos[i] || null, v => { if (v) s.photos[i] = v; else s.photos.splice(i, 1); s.photos = s.photos.filter(Boolean); }, 'accueil', true);
      openSheet('Page d’accueil', [
        el('p', { class: 'help', text: RICH_HELP }),
        edText('Phrase d’accroche', s, 'lead', { rows: 3 }), edText('Texte de présentation', s, 'text', { rows: 6 }), edText('Slogan', s, 'tagline'),
        slot(0), slot(1)
      ], [el('button', { type: 'button', class: 'btn primary', text: 'Terminé', onclick: closeSheet })]);
    },
    informations() {
      const s = site().info;
      openSheet('Informations', [
        el('p', { class: 'help', text: RICH_HELP }),
        edText('Introduction', s, 'intro', { rows: 4 }), edText('Avertissement', s, 'warning', { rows: 3 }), edText('Précision sous l’avertissement', s, 'note', { rows: 2 }),
        el('h4', { class: 'subhead', text: 'Rubriques' }),
        edList(s.sections, x => [edText('Titre', x, 'title'), edText('Texte', x, 'text', { rows: 6 })], () => ({ id: 's' + rid(6), title: 'Nouvelle rubrique', text: '' }), 'Ajouter une rubrique')
      ], [el('button', { type: 'button', class: 'btn primary', text: 'Terminé', onclick: closeSheet })]);
    },
    equipe() {
      const s = site().team;
      openSheet('Qui sommes-nous ?', [
        el('p', { class: 'help', text: RICH_HELP }),
        edText('Introduction', s, 'intro', { rows: 4 }),
        el('h4', { class: 'subhead', text: 'Membres de l’équipe' }),
        edList(s.members, x => [
          edPhoto('Photo', () => x.photo, v => { x.photo = v; }, 'equipe', true),
          edText('Nom', x, 'name'), edText('Fonction', x, 'role', { help: 'Ex. Employé du D8 depuis le 01/09/2026' }), edText('Présentation', x, 'bio', { rows: 4 })
        ], () => ({ id: 'm' + rid(6), name: 'NOM Prénom', role: '', bio: '', photo: null }), 'Ajouter un membre')
      ], [el('button', { type: 'button', class: 'btn primary', text: 'Terminé', onclick: closeSheet })]);
    },
    recrutements() {
      const s = site().recruit;
      const sw = el('div', { class: 'switch' });
      const draw = () => fill(sw, [
        el('button', { type: 'button', class: 'on', 'aria-pressed': String(s.open), text: 'Ouverts', onclick: () => { s.open = true; siteChanged(); draw(); } }),
        el('button', { type: 'button', class: 'off', 'aria-pressed': String(!s.open), text: 'Fermés', onclick: () => { s.open = false; siteChanged(); draw(); } })
      ]);
      draw();
      openSheet('Recrutements', [
        el('div', { class: 'field' }, [el('span', { text: 'Statut des recrutements' }), sw]),
        edText('Message quand c’est ouvert', s, 'openText'), edText('Message quand c’est fermé', s, 'closedText'),
        el('p', { class: 'help', text: RICH_HELP }), edText('Introduction', s, 'intro', { rows: 5 })
      ], [el('button', { type: 'button', class: 'btn primary', text: 'Terminé', onclick: closeSheet })]);
    },
    calendrier() {
      const s = site().calendar;
      openSheet('Calendrier', [
        el('p', { class: 'note', text: 'Pour réserver ou libérer un jour, ferme ce panneau et clique sur le jour dans le calendrier.' }),
        el('p', { class: 'help', text: RICH_HELP }), edText('Introduction', s, 'intro', { rows: 3 })
      ], [el('button', { type: 'button', class: 'btn primary', text: 'Terminé', onclick: closeSheet })]);
    },
    faq() {
      const s = site().faq;
      openSheet('Réponses FAQ', [
        el('p', { class: 'help', text: RICH_HELP }),
        edText('Introduction', s, 'intro', { rows: 3 }),
        el('h4', { class: 'subhead', text: 'Questions et réponses' }),
        edList(s.items, x => [edText('Question', x, 'q'), edText('Réponse', x, 'a', { rows: 6 })], () => ({ id: 'q' + rid(6), q: 'Nouvelle question', a: '' }), 'Ajouter une question')
      ], [el('button', { type: 'button', class: 'btn primary', text: 'Terminé', onclick: closeSheet })]);
    }
  };

  // ------------------------------------------------------------------ navigation
  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (!h || h.startsWith('/')) {
      const parts = h.replace(/^\/+/, '').split('/').filter(Boolean);
      const page = PAGE_TITLES[parts[0]] ? parts[0] : 'accueil';
      if (page === 'catalogue') state.filter.type = typeFromSlug(parts[1] || '') || 'all';
      if (page === 'decorateurs') decoPage = parts[1] || null;
      if (page === 'avis') loadReviews();
      lastPageHash = '#/' + (page === 'accueil' ? '' : parts.join('/'));
      closeVisit();
      showPage(page);
      return;
    }
    const l = state.data && listing(h);
    if (l && l.points.length) openVisit(l, null);
    else closeVisit();
  }
  // fermer la visite : retour à la page d'où l'on venait
  function leaveVisit() { location.hash = lastPageHash || '#/'; }
  window.addEventListener('hashchange', route);

  // ------------------------------------------------------------------ démarrage
  (async function start() {
    state.data = await loadData();
    normalize(state.data);
    state.saved = JSON.stringify(state.data);
    state.baseUpdated = state.data.updated || '';
    renderCatalog();
    route();
    initCaps();
  })();

  // pour les tests
  // (aussi utilisé par la présentation animée, intro.js)
  window.__d8 = { state, save, go, openWizard, visit, media: mediaURL, price: priceParts, kind: kindOf, hero: () => heroPick };
})();
