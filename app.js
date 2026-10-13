/* Catalogue Dynasty 8 : catalogue public, visite 360°, espace employé (admin, gérant : création des biens,
   pièces, étiquettes, passages) et enregistrement sur le serveur de l'agence. */
(function () {
  'use strict';
  const D2R = Math.PI / 180;
  const $ = id => document.getElementById(id);
  // serveur de l'agence (comptes employés, catalogue, images des pièces) : adresse dans <meta name="d8-api">
  const API = ((document.querySelector('meta[name="d8-api"]') || {}).content || '').trim().replace(/\/+$/, '');
  const SHARE_BASE = API ? location.origin + location.pathname.replace(/index\.html?$/i, '') : 'https://claude.ai/artifact/7eJ2mP66hxVcGT49Gkc4ww';
  const ROLE_NAMES = { admin: 'Admin', gerant: 'Gérant' };
  const TYPES = ['Appartement', 'Maison', 'Villa', 'Bureau', 'Entrepôt', 'Garage', 'Commerce', 'Terrain'];
  const STATUSES = { disponible: 'Disponible', reserve: 'Réservé', vendu: 'Vendu', loue: 'Loué' };
  const DEALS = { vente: 'Vente', location: 'Location' };
  const PERIODS = { semaine: 'semaine', mois: 'mois', jour: 'jour' };

  const FALLBACK = {
    version: 1, updated: '2026-10-13T02:30:00.000Z',
    listings: [{
      id: 'bureau-1', name: 'Bureau #1', type: 'Bureau', deal: 'vente', price: null, period: 'semaine', status: 'disponible',
      district: '', surface: null, rooms: null, garage: null, description: '', features: [],
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
  function priceParts(l) {
    if (l.price === null || l.price === undefined || l.price === '' || isNaN(+l.price)) return { text: 'Prix sur demande', ask: true };
    return { text: nf.format(+l.price) + ' $', per: l.deal === 'location' ? ' / ' + (PERIODS[l.period] || 'semaine') : '' };
  }
  function priceEl(l, cls) {
    const p = priceParts(l);
    return el('p', { class: 'price' + (p.ask ? ' ask' : '') + (cls ? ' ' + cls : '') }, [p.text, p.per ? el('small', { text: p.per }) : null]);
  }
  function mediaURL(path) {
    if (!path) return '';
    if (state.urls.has(path)) return state.urls.get(path);
    return API && path.startsWith('media/') ? API + '/' + path : path;
  }
  // droits : l'admin peut tout ; le gérant crée des biens et des pièces et modifie ce qu'il a créé
  const me = () => state.user ? state.user.username : null;
  const isAdmin = () => !state.user || state.user.role === 'admin';
  const canEditListing = l => isAdmin() || (!!l && l.createdBy === me());
  const canEditPoint = (l, p) => canEditListing(l) || (!!p && p.createdBy === me());
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
  const canEditLink = (l, p, link) => canEditPoint(l, p) || !savedHas(l.id, p.id, link.id);
  function wrapYaw(y) { return ((y % 360) + 540) % 360 - 180; }
  function listing(id) { return state.data.listings.find(l => l.id === id); }
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
    const r = await api('POST', '/api/save', { base: JSON.parse(state.saved), data: state.data, deletes: isAdmin() ? [...state.removed] : [] });
    adoptServerData(r.data);
  }
  // le serveur renvoie le catalogue fusionné (avec les changements des autres employés)
  function adoptServerData(d) {
    normalize(d);
    const same = JSON.stringify(d.listings) === JSON.stringify(state.data.listings);
    if (same) {
      Object.keys(state.data).forEach(k => { if (k !== 'listings') delete state.data[k]; });
      Object.keys(d).forEach(k => { if (k !== 'listings') state.data[k] = d[k]; });
    } else {
      const lid = visit.listing && visit.listing.id, pid = visit.point && visit.point.id;
      state.data = d;
      if (!$('sheet').hidden) closeSheet();
      if (lid) {
        const l = listing(lid);
        if (l && l.points.length) { visit.listing = l; visit.point = pointOf(l, pid) || null; if (visit.point) applyPoint(visit.point); setVisitTexts(); refreshVisitAgent(); }
        else location.hash = '';
      }
      toast('Enregistré. Le catalogue inclut aussi les derniers changements des autres employés.', 5000);
    }
    state.saved = JSON.stringify(state.data);
    state.baseUpdated = state.data.updated || '';
    renderCatalog();
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
    if (visit.listing) { const l = listing(visit.listing.id); visit.listing = null; visit.point = null; if (l && l.points.length) openVisit(l); else location.hash = ''; }
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
    if (tag) tag.textContent = u ? (ROLE_NAMES[u.role] || u.role) + ' · ' + u.username : 'Mode agent';
    if ($('staffBtn')) $('staffBtn').hidden = !(u && u.role === 'admin');
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
    openSheet('Mon compte', [
      el('dl', { class: 'kv' }, [el('div', {}, [el('dt', { text: 'Identifiant' }), el('dd', { text: u.username })]), el('div', {}, [el('dt', { text: 'Grade' }), el('dd', { text: ROLE_NAMES[u.role] })])]),
      el('p', { class: 'help', text: u.role === 'admin' ? 'Admin : tu peux tout faire, y compris gérer les comptes des employés.' : 'Gérant : tu peux créer des biens, ajouter des pièces dans tous les biens et choisir la pièce de départ des visites. Tu modifies les biens et les pièces que tu as créés ; tu ne peux rien supprimer.' }),
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
            try { render((await api('PATCH', '/api/staff/' + encodeURIComponent(u.username), { role: e.target.value })).users); toast('Grade de ' + u.username + ' : ' + ROLE_NAMES[e.target.value] + '.'); }
            catch (x) { showErr(x); e.target.value = u.role; }
          }
        }, Object.entries(ROLE_NAMES).map(([v, t]) => el('option', { value: v, text: t, selected: u.role === v })));
        const self = u.username === me();
        box.append(el('div', { class: 'staffitem' }, [
          el('span', { class: 'avatar', text: u.username.slice(0, 1).toUpperCase() }),
          el('div', {}, [el('b', { text: u.username + (self ? ' (toi)' : '') }), el('small', { text: 'Créé le ' + (u.created ? new Date(u.created).toLocaleDateString('fr-FR') : '?') })]),
          role,
          el('div', { class: 'acts' }, [
            iconBtn('key', 'Nouveau mot de passe pour ' + u.username, () => openResetSheet(u)),
            self ? null : iconBtn('trash', 'Supprimer le compte de ' + u.username, async () => {
              if (!(await confirmBox('Supprimer le compte « ' + u.username + ' » ?', 'Cette personne ne pourra plus se connecter. Les biens et pièces qu’elle a créés restent dans le catalogue.', 'Supprimer'))) return;
              try { render((await api('DELETE', '/api/staff/' + encodeURIComponent(u.username))).users); toast('Compte supprimé.'); } catch (x) { showErr(x); }
            })
          ])
        ]));
      });
    };
    const nu = el('input', { id: 'staffUser', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', placeholder: 'ex. jean.dupont' });
    const np = el('input', { id: 'staffPass', type: 'text', autocomplete: 'off', spellcheck: 'false' });
    const nr = el('select', { id: 'staffRole' }, [el('option', { value: 'gerant', text: 'Gérant' }), el('option', { value: 'admin', text: 'Admin' })]);
    const add = el('button', { type: 'button', class: 'btn primary', id: 'staffAdd', html: ICON.plus + '<span>Créer le compte</span>' });
    const create = async () => {
      err.hidden = true; add.disabled = true;
      try {
        render((await api('POST', '/api/staff', { username: nu.value.trim(), password: np.value, role: nr.value })).users);
        toast('Compte « ' + nu.value.trim().toLowerCase() + ' » créé. Donne-lui son identifiant et son mot de passe.', 5000);
        nu.value = ''; np.value = '';
      } catch (x) { showErr(x); }
      add.disabled = false;
    };
    add.addEventListener('click', create);
    inputEnter([nu, np], create);
    openSheet('Comptes des employés', [
      el('p', { class: 'help', text: 'Admin : a droit à tout. Gérant : crée des biens, ajoute des pièces et choisit la pièce de départ des visites ; il modifie ce qu’il a créé et ne peut rien supprimer.' }),
      box, err,
      el('h4', { class: 'subhead', text: 'Nouveau compte' }),
      field('Identifiant', nu), field('Mot de passe', np, 'Au moins 8 caractères. L’employé pourra le changer dans « Mon compte ».'), field('Grade', nr)
    ], [add]);
    box.append(el('p', { class: 'help', text: 'Chargement…' }));
    try { render((await api('GET', '/api/staff')).users); } catch (x) { box.innerHTML = ''; showErr(x); }
  }
  function openResetSheet(u) {
    const np = el('input', { id: 'resetPass', type: 'text', autocomplete: 'off', spellcheck: 'false' });
    const err = el('p', { class: 'note error', hidden: true });
    const ok = el('button', {
      type: 'button', class: 'btn primary', text: 'Valider', onclick: async () => {
        err.hidden = true; ok.disabled = true;
        try { await api('PATCH', '/api/staff/' + encodeURIComponent(u.username), { password: np.value }); toast('Nouveau mot de passe enregistré pour ' + u.username + '.'); openStaffSheet(); }
        catch (x) { err.textContent = x.message; err.hidden = false; }
        ok.disabled = false;
      }
    });
    openSheet('Mot de passe de ' + u.username, [
      el('p', { class: 'help', text: 'Choisis un nouveau mot de passe et donne-le à l’employé. Il sera déconnecté de ses appareils.' }),
      field('Nouveau mot de passe', np, 'Au moins 8 caractères.'), err
    ], [ok, el('button', { type: 'button', class: 'btn', text: 'Retour', onclick: openStaffSheet })]);
    setTimeout(() => np.focus(), 50);
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
    try { sessionStorage.setItem('d8-agent', state.agent ? '1' : '0'); } catch (e) { }
    $('agentbar').hidden = !state.agent;
    $('agentBtn').hidden = API ? state.agent : (!state.canEdit || state.agent);
    updateStaffUI();
    renderCatalog();
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
  if ($('accountBtn')) $('accountBtn').addEventListener('click', openAccountSheet);
  $('saveBtn').addEventListener('click', save);
  window.addEventListener('beforeunload', e => { if (state.canEdit && isDirty()) { e.preventDefault(); e.returnValue = ''; } });

  // ------------------------------------------------------------------ catalogue
  function renderCatalog() {
    const d = state.data; if (!d) return;
    const f = state.filter;
    const types = TYPES.filter(t => d.listings.some(l => l.type === t));
    const fl = $('filters'); fl.innerHTML = '';
    const chip = (label, val) => el('button', { type: 'button', class: 'chip', 'aria-pressed': String(f.type === val), text: label, onclick: () => { f.type = val; renderCatalog(); } });
    fl.append(chip('Tous', 'all'));
    types.forEach(t => fl.append(chip(t, t)));
    fl.append(el('span', { class: 'sep' }));
    const deal = el('select', { id: 'fDeal', 'aria-label': 'Transaction', onchange: e => { f.deal = e.target.value; renderCatalog(); } },
      [['all', 'Vente et location'], ['vente', 'Vente'], ['location', 'Location']].map(([v, t]) => el('option', { value: v, text: t, selected: f.deal === v })));
    const sort = el('select', { id: 'fSort', 'aria-label': 'Tri', onchange: e => { f.sort = e.target.value; renderCatalog(); } },
      [['recent', 'Plus récents'], ['asc', 'Prix croissant'], ['desc', 'Prix décroissant']].map(([v, t]) => el('option', { value: v, text: t, selected: f.sort === v })));
    const q = el('input', { id: 'fSearch', type: 'search', placeholder: 'Nom, quartier…', value: f.q, 'aria-label': 'Rechercher', oninput: e => { f.q = e.target.value; renderGrid(); } });
    fl.append(deal, sort, q);
    renderGrid();
    const n = d.listings.filter(l => l.status === 'disponible').length;
    $('catSub').textContent = 'Los Santos · ' + (n === 0 ? 'aucun bien disponible' : n === 1 ? '1 bien disponible' : n + ' biens disponibles');
  }
  function renderGrid() {
    const d = state.data, f = state.filter, grid = $('grid');
    grid.innerHTML = '';
    let items = d.listings.filter(l =>
      (f.type === 'all' || l.type === f.type) && (f.deal === 'all' || l.deal === f.deal) &&
      (!f.q || (l.name + ' ' + (l.district || '') + ' ' + (l.type || '')).toLowerCase().includes(f.q.toLowerCase())) &&
      (state.agent || l.points.length > 0));
    const pv = l => (l.price === null || l.price === '' || isNaN(+l.price)) ? null : +l.price;
    if (f.sort === 'recent') items.sort((a, b) => (b.order || 0) - (a.order || 0));
    else items.sort((a, b) => { const x = pv(a), y = pv(b); if (x === null) return 1; if (y === null) return -1; return f.sort === 'asc' ? x - y : y - x; });
    if (state.agent) {
      grid.append(el('button', { type: 'button', class: 'card new', onclick: newListing }, [
        el('div', {}, [el('div', { class: 'plus', html: ICON.plus }), el('span', { text: 'Nouveau bien' })])]));
    }
    items.forEach(l => grid.append(cardOf(l)));
    $('empty').hidden = items.length > 0 || state.agent;
  }
  function cardOf(l) {
    const photo = el('div', { class: 'photo', style: l.cover ? { backgroundImage: 'url("' + mediaURL(l.cover) + '")' } : {} }, [
      el('span', { class: 'status ' + l.status, text: STATUSES[l.status] || 'Disponible' }),
      l.points.length ? el('span', { class: 'sunbadge' }, ['360°', el('small', { text: l.points.length + (l.points.length > 1 ? ' pièces' : ' pièce') })]) : null
    ]);
    const specs = [];
    if (l.surface) specs.push(nf.format(+l.surface) + ' m²');
    if (l.rooms) specs.push(l.rooms + (+l.rooms > 1 ? ' pièces' : ' pièce'));
    if (l.garage) specs.push(l.garage + (+l.garage > 1 ? ' places de garage' : ' place de garage'));
    const body = el('div', { class: 'body' }, [
      el('p', { class: 'eyebrow', text: [l.type, DEALS[l.deal], l.district].filter(Boolean).join(' · ') }),
      el('h2', { text: l.name || 'Sans nom' }),
      priceEl(l),
      specs.length ? el('p', { class: 'specs' }, specs.map(s => el('span', { text: s }))) : null
    ]);
    const link = el('a', { href: '#' + l.id, class: 'cardlink', style: { display: 'flex', flexDirection: 'column', color: 'inherit', textDecoration: 'none' } }, [photo, body]);
    if (!l.points.length) {
      link.removeAttribute('href');
      link.addEventListener('click', () => openListingSheet(l));
      photo.append(el('span', { class: 'sunbadge', style: { background: '#fff' } }, ['+', el('small', { text: 'pièce' })]));
    }
    const card = el('article', { class: 'card' }, [link]);
    if (state.agent) {
      card.append(el('div', { class: 'agent-actions' }, [
        el('button', { type: 'button', class: 'btn', html: (canEditListing(l) ? ICON.pencil + '<span>Modifier</span>' : ICON.eye + '<span>Infos</span>'), onclick: () => openListingSheet(l) }),
        l.points.length ? el('button', { type: 'button', class: 'btn', html: ICON.plus + '<span>Pièce</span>', onclick: () => openWizard(l) }) : null
      ]));
    }
    return card;
  }
  function newListing() {
    const d = state.data;
    const name = 'Nouveau bien';
    const l = {
      id: uniqueId(slugify(name), d.listings.map(x => x.id)), name, type: 'Appartement', deal: 'vente', price: null, period: 'semaine',
      status: 'disponible', district: '', surface: null, rooms: null, garage: null, description: '', features: [],
      cover: null, start: null, order: Math.max(0, ...d.listings.map(x => x.order || 0)) + 1, created: new Date().toISOString().slice(0, 10), points: []
    };
    if (me()) l.createdBy = me();
    d.listings.push(l);
    markDirty(); renderCatalog();
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
    const district = el('input', { id: 'lDistrict', value: l.district || '', placeholder: 'Ex. Vinewood Hills', oninput: e => upd('district', e.target.value) });
    const surface = el('input', { id: 'lSurface', type: 'number', min: '0', value: l.surface ?? '', oninput: e => upd('surface', num(e.target.value)) });
    const rooms = el('input', { id: 'lRooms', type: 'number', min: '0', value: l.rooms ?? '', oninput: e => upd('rooms', num(e.target.value)) });
    const garage = el('input', { id: 'lGarage', type: 'number', min: '0', value: l.garage ?? '', oninput: e => upd('garage', num(e.target.value)) });
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
    const ro = !canEditListing(l);
    if (ro) [name, type, period, deal, price, status, district, surface, rooms, garage, desc, feats].forEach(i => { i.disabled = true; });
    openSheet(isNew ? 'Nouveau bien' : ro ? l.name : 'Modifier le bien', [
      isNew ? el('p', { class: 'note', text: 'Remplis les infos, puis ajoute les pièces avec tes screens. Pense à enregistrer à la fin.' }) : null,
      ro ? el('p', { class: 'note', text: 'Ce bien a été créé par ' + (l.createdBy || 'un admin') + ' : tu peux y ajouter des pièces et choisir la pièce de départ, mais pas modifier ses infos ni son prix.' }) : null,
      field('Nom du bien', name),
      el('div', { class: 'row2' }, [field('Type', type), field('Statut', status)]),
      el('div', { class: 'row2' }, [field('Transaction', deal), periodField]),
      field('Prix ($)', price, 'Laisse vide pour afficher « Prix sur demande ».'),
      field('Quartier ou adresse', district),
      el('div', { class: 'row2' }, [field('Surface (m²)', surface), field('Pièces', rooms)]),
      field('Places de garage', garage),
      field('Description', desc),
      field('Points forts', feats, 'Sépare-les par des virgules.'),
      l.points.length > 1 ? startPicker(l, renderRooms) : null,
      el('div', { class: 'field' }, [el('span', { text: 'Pièces de la visite' }), roomsBox])
    ], [
      el('button', { type: 'button', class: 'btn primary', html: ICON.plus + '<span>Ajouter une pièce</span>', onclick: () => { closeSheet(); openWizard(l); } }),
      l.points.length ? el('button', { type: 'button', class: 'btn', text: 'Ouvrir la visite', onclick: () => { closeSheet(); go(l); } }) : null,
      isAdmin() ? el('button', { type: 'button', class: 'btn danger', text: 'Supprimer le bien', onclick: () => deleteListing(l) }) : null
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
    const ok = await confirmBox('Supprimer « ' + l.name + ' » ?', 'Le bien et toutes ses pièces seront retirés du catalogue au prochain enregistrement.', 'Supprimer');
    if (!ok) return;
    mediaOfListing(l).forEach(dropMedia);
    state.data.listings = state.data.listings.filter(x => x !== l);
    closeSheet();
    if (visit.listing === l) { location.hash = ''; }
    markDirty(); renderCatalog();
  }

  // ------------------------------------------------------------------ visite
  const visit = { viewer: null, listing: null, point: null, pins: [], links: [], badge: null, markers: null, tool: null, busy: false };
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
    setVisitTexts();
    refreshVisitAgent();
    if (sameListing && visit.point === p) return;
    $('vStatus').hidden = false; $('vStatus').textContent = 'Chargement de la visite…';
    $('stage').style.backgroundImage = l.cover ? 'url("' + mediaURL(l.cover) + '")' : '';
    try {
      const tex = await panoLoadTexture(texURL(p), v.renderer);
      if (visit.listing !== l) return;
      v.setTexture(tex);
      v.look(p.yaw || 0, p.pitch ?? -4, v.defaultFov());
      applyPoint(p);
      $('vStatus').hidden = true;
      l.points.forEach(q => { if (q !== p) panoLoadTexture(texURL(q), v.renderer).catch(() => { }); });
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
    visit.listing = null; visit.point = null;
    buildPins(); buildLinks();
  }
  function setVisitTexts() {
    const l = visit.listing; if (!l) return;
    $('vEyebrow').textContent = [l.type, DEALS[l.deal], l.district].filter(Boolean).join(' · ');
    $('vName').textContent = l.name;
    const pr = priceParts(l), pe = $('vPrice');
    pe.className = 'price' + (pr.ask ? ' ask' : ''); pe.innerHTML = '';
    pe.append(pr.text); if (pr.per) pe.append(el('small', { text: pr.per }));
    if (visit.point) {
      const i = l.points.indexOf(visit.point);
      $('vRoom').textContent = visit.point.name + (l.points.length > 1 ? ' · ' + (i + 1) + '/' + l.points.length : '');
    }
    $('vHint').textContent = visit.point && visit.point.links.length ? 'Glissez pour regarder, cliquez les cercles au sol pour avancer' : 'Glissez pour regarder autour de vous';
  }
  function applyPoint(p) {
    visit.point = p;
    setVisitTexts();
    buildPins(); buildLinks(); orientBadge();
    refreshTools();
  }
  // outils visibles selon les droits sur la pièce affichée
  function refreshTools() {
    const l = visit.listing, p = visit.point; if (!l || !p) return;
    const ep = canEditPoint(l, p), elist = canEditListing(l) || !l.cover;
    const show = { start: ep, pin: ep, link: true, north: ep, cover: elist, rooms: true };
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

  $('backBtn').addEventListener('click', () => { location.hash = ''; });
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
    add('Type', l.type); add('Transaction', DEALS[l.deal]); add('Statut', STATUSES[l.status]);
    add('Surface', l.surface ? nf.format(+l.surface) + ' m²' : null); add('Pièces', l.rooms); add('Garage', l.garage ? l.garage + ' place' + (+l.garage > 1 ? 's' : '') : null);
    add('Quartier', l.district);
    const share = SHARE_BASE + '#' + l.id;
    const shareInput = el('input', { id: 'shareLink', value: share, readonly: true, onfocus: e => e.target.select() });
    const rooms = el('div', { class: 'roomlist' }, l.points.map(p => el('button', {
      type: 'button', class: 'roomitem' + (p === visit.point ? ' current' : ''), onclick: () => { closeSheet(); jumpTo(p); }
    }, [el('span', { class: 'thumb', style: { backgroundImage: 'url("' + mediaURL(p.imageSmall || p.image) + '")' } }), el('div', {}, [el('b', { text: p.name })]), el('span', {})])));
    openSheet(l.name, [
      priceEl(l),
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
      bar = el('div', { id: 'vAgent', style: { position: 'absolute', zIndex: 7, top: 'calc(env(safe-area-inset-top, 0px) + 16px)', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--sun)', color: 'var(--ink)', borderRadius: '999px', padding: '4px 4px 4px 12px', boxShadow: '0 6px 18px rgba(0,0,0,.3)' } }, [
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
    toast('Vue de départ de « ' + p.name + ' » enregistrée.');
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
    openSheet('Passages de « ' + p.name + ' »', [
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
        toast('Passage retour ajouté dans « ' + t.name + ' ». Vérifie sa position en y allant.', 4500);
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
      el('p', {}, ['Repère actuel de « ' + p.name + ' » : ', val])
    ], [el('button', {
      type: 'button', class: 'btn primary', text: 'Utiliser la direction actuelle', onclick: () => {
        p.north = Math.round(wrapYaw(visit.viewer.view.yaw) * 10) / 10; val.textContent = p.north.toFixed(1) + '°'; orientBadge(); markDirty(); toast('Repère enregistré pour « ' + p.name + ' ».');
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
            iconBtn(l.start === p.id ? 'starFill' : 'star', 'Commencer la visite ici', () => { l.start = p.id; markDirty(); render(); }),
            el_ ? iconBtn('up', 'Monter', () => { if (i > 0) { l.points.splice(i, 1); l.points.splice(i - 1, 0, p); markDirty(); render(); setVisitTexts(); } }) : null,
            ep ? iconBtn('image', 'Remplacer l’image 360°', () => { closeSheet(); openWizard(l, p); }) : null,
            isAdmin() ? iconBtn('trash', 'Supprimer la pièce', () => deletePoint(l, p, render)) : null
          ])
        ]));
      });
    };
    render();
    openSheet('Pièces de « ' + l.name + ' »', [startPicker(l, render), box], [
      el('button', { type: 'button', class: 'btn primary', html: ICON.plus + '<span>Ajouter une pièce</span>', onclick: () => { closeSheet(); openWizard(l); } }),
      el('button', { type: 'button', class: 'btn', text: 'Infos du bien', onclick: () => openListingSheet(l) })
    ]);
  }
  // pièce dans laquelle le visiteur apparaît en ouvrant la visite (modifiable par l'admin et les gérants)
  function startPicker(l, onChange) {
    const sel = el('select', {
      id: 'startRoom', onchange: e => { l.start = e.target.value; markDirty(); renderCatalog(); onChange && onChange(); toast('La visite commencera dans « ' + (pointOf(l, l.start) || {}).name + ' ».'); }
    }, l.points.map(p => el('option', { value: p.id, text: p.name, selected: (l.start || (l.points[0] && l.points[0].id)) === p.id })));
    return field('Pièce de départ de la visite', sel, 'C’est la pièce dans laquelle on apparaît en ouvrant la visite.');
  }
  async function deletePoint(l, p, rerender) {
    const ok = await confirmBox('Supprimer « ' + p.name + ' » ?', 'La pièce, ses étiquettes et les passages qui y mènent seront supprimés.', 'Supprimer');
    if (!ok) return;
    dropMedia(p.image); dropMedia(p.imageSmall);
    l.points = l.points.filter(x => x !== p);
    l.points.forEach(q => { q.links = q.links.filter(k => k.target !== p.id); });
    if (l.start === p.id) l.start = l.points[0] ? l.points[0].id : null;
    markDirty(); renderCatalog();
    if (!l.points.length) { closeSheet(); location.hash = ''; return; }
    if (visit.point === p) { visit.point = null; await openVisit(l, l.start); }
    else buildLinks();
    rerender && rerender();
  }

  // ------------------------------------------------------------------ assistant d'assemblage
  const wiz = { listing: null, replace: null, files: [], S: null, viewer: null, preview: null, sel: -1, equi: null, adj: {} };
  function openWizard(l, replacePoint) {
    Object.assign(wiz, { listing: l, replace: replacePoint || null, files: [], S: null, sel: -1, equi: null, adj: {} });
    $('wizTitle').textContent = replacePoint ? 'Nouvelle image pour « ' + replacePoint.name + ' »' : 'Nouvelle pièce · ' + l.name;
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
      el('p', { text: 'Le tour complet, les rangées vers le haut et vers le bas, le plafond et le sol. L’ordre de prise de vue est retrouvé grâce à la date des fichiers.' }),
      el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' } }, [
        el('button', { type: 'button', class: 'btn primary', text: 'Choisir les screens', onclick: () => input.click() }),
        el('button', { type: 'button', class: 'btn', text: 'J’ai déjà une image 360°', onclick: () => equiIn.click() })
      ])
    ]);
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => setFiles(e.dataTransfer.files));
    const thumbs = el('div', { class: 'thumbs', id: 'wizThumbs' });
    const go = el('button', { type: 'button', class: 'btn primary', id: 'wizGo', text: 'Assembler', disabled: true, onclick: () => runStitch(nameIn.value) });
    const count = el('span', { id: 'wizCount', class: 'help' });
    function setFiles(list) {
      const arr = [...list].filter(f => /^image\//.test(f.type));
      arr.sort((a, b) => (a.lastModified - b.lastModified) || a.name.localeCompare(b.name, undefined, { numeric: true }));
      wiz.files = arr;
      thumbs.innerHTML = '';
      arr.forEach((f, i) => {
        const url = URL.createObjectURL(f);
        thumbs.append(el('div', { class: 'thumb-card' }, [el('img', { src: url, alt: '', onload: () => URL.revokeObjectURL(url) }), el('span', { class: 'num', text: String(i + 1) })]));
      });
      count.textContent = arr.length ? arr.length + ' screens' : '';
      go.disabled = arr.length < 4;
      if (arr.length && arr.length < 4) toast('Il faut au moins 4 screens qui se recouvrent.');
    }
    body.append(steps(0),
      el('div', { class: 'panel' }, [field('Nom de la pièce', nameIn)]),
      drop, input, equiIn,
      el('div', { style: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } }, [go, count]),
      thumbs,
      el('div', { class: 'panel' }, [
        el('h4', { text: 'Rappel pour de bons screens' }),
        el('p', { class: 'help', text: 'Caméra libre à hauteur d’yeux, HUD caché. Ne déplace jamais la caméra pendant un point : fais-la seulement tourner. Tour complet d’environ 12 screens qui se recouvrent de moitié, puis une rangée à mi-hauteur vers le haut et une vers le bas, puis le plafond et le sol. Garde le même zoom.' })
      ]));
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
    const weights = { 'Lecture des captures': [0, 5], 'Analyse des captures': [5, 25], 'Recherche des recouvrements': [25, 40], 'Vérification des recouvrements': [40, 55], 'Alignement des murs unis': [55, 60], 'Calcul de la position des captures': [60, 62], 'Ajustement global': [62, 66], 'Placement du plafond et du sol': [66, 99], 'Prêt': [99, 100] };
    wiz.busy = true;
    try {
      wiz.S = await Stitcher.prepare(wiz.files, {
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

  function normalize(d) { d.listings.forEach(l => { l.points = l.points || []; l.points.forEach(p => { p.pins = p.pins || []; p.links = p.links || []; }); }); }

  // ------------------------------------------------------------------ navigation
  function route() {
    const id = decodeURIComponent(location.hash.slice(1));
    const l = id && state.data && listing(id);
    if (l && l.points.length) openVisit(l, null);
    else closeVisit();
  }
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
  window.__d8 = { state, save, go, openWizard, visit };
})();
