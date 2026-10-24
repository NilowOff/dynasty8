/* Motion design du site Dynasty 8 (refonte 2026).
   Rien ici ne touche au catalogue, aux comptes ou aux visites : uniquement de l'animation par-dessus.
   - accueil : une clé dorée en 3D (tête en forme de maison, comme le logo, avec le soleil en creux) qui flotte et tourne dans la serrure au survol de « Voir les biens » ;
   - visite : la vue 360° s'ouvre à travers un trou de serrure, depuis l'endroit où on a cliqué ;
   - cartes : volume et reflet qui suivent la souris, arrivée en cascade ;
   - pages : fil doré sous l'en-tête et contenu qui monte en douceur. */
(function () {
  'use strict';
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = id => document.getElementById(id);

  /* ---------------- clé 3D de l'accueil ---------------- */
  function heroKey() {
    const hero = $('hero');
    if (!hero || !window.THREE || hero.querySelector('.hero-key')) return;
    if (window.innerWidth <= 860) { window.addEventListener('resize', onWide); return; }
    const THREE = window.THREE;
    const box = document.createElement('div'); box.className = 'hero-key'; box.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas'); box.appendChild(canvas);
    hero.insertBefore(box, hero.querySelector('.hero-inner'));
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' }); }
    catch (e) { box.remove(); return; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 100); cam.position.set(0, 0, 13);

    // reflets : un ciel « golden hour » au-dessus de Los Santos, avec quelques boîtes à lumière
    const pm = new THREE.PMREMGenerator(renderer);
    const env = new THREE.Scene();
    const skyGeo = new THREE.SphereGeometry(20, 48, 24), cols = [], p = skyGeo.attributes.position, c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 20;
      if (y > 0.35) c.setRGB(1.0, 0.94, 0.8); else if (y > 0.0) c.setRGB(1.0, 0.66, 0.24); else if (y > -0.3) c.setRGB(0.18, 0.12, 0.05); else c.setRGB(0.02, 0.05, 0.03);
      cols.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    env.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true })));
    const softbox = (w, h, x, y, z, col, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
    };
    softbox(14, 3, 0, 11, 5, 0xffffff, 3.2); softbox(3, 12, -11, 2, 5, 0xfff0c4, 2.2); softbox(2.4, 9, 11, 0, -2, 0x9ff5d3, 1.1);
    scene.environment = pm.fromScene(env, 0.025).texture;

    // la clé : tête en forme de maison (le toit du logo) percée du soleil, tige et panneton
    const s = new THREE.Shape();
    [[-1.15, -0.95], [1.15, -0.95], [1.15, -0.19], [3.2, -0.19], [3.2, -0.66], [3.5, -0.66], [3.5, -0.42], [3.76, -0.42], [3.76, -0.8], [4.1, -0.8], [4.1, -0.47], [4.3, -0.31], [4.3, 0.19], [1.15, 0.19], [1.15, 0.4], [0, 1.42], [-1.15, 0.4]]
      .forEach((q, i) => (i ? s.lineTo(q[0], q[1]) : s.moveTo(q[0], q[1])));
    const sun = new THREE.Path(); sun.absarc(0, 0.04, 0.47, 0, Math.PI * 2, true); s.holes.push(sun);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.32, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 5, curveSegments: 64 });
    geo.computeBoundingBox();
    const bc = new THREE.Vector3(); geo.boundingBox.getCenter(bc);
    geo.center();
    const gold = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xFFD25A).convertSRGBToLinear(), metalness: 1, roughness: 0.2 });
    const key = new THREE.Mesh(geo, gold);
    // le soleil du logo, logé dans la tête de la clé
    const sunDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 48), new THREE.MeshStandardMaterial({ color: new THREE.Color(0xFDC614).convertSRGBToLinear(), emissive: new THREE.Color(0xFFB000).convertSRGBToLinear(), emissiveIntensity: 0.7, metalness: 0.2, roughness: 0.4 }));
    sunDisc.rotation.x = Math.PI / 2; sunDisc.position.set(0 - bc.x, 0.04 - bc.y, 0);   // au centre du creux, après centrage de la clé
    key.add(sunDisc);
    const spin = new THREE.Group(); spin.add(key);            // rotation « dans la serrure » (autour de la tige)
    const tilt = new THREE.Group(); tilt.add(spin);            // pose générale et suivi de la souris
    tilt.rotation.z = 0.55; tilt.scale.setScalar(0.8);
    scene.add(tilt);
    scene.add(new THREE.AmbientLight(0xffffff, 0.12));
    const sunLight = new THREE.DirectionalLight(0xfff0cc, 2.2); sunLight.position.set(4, 6, 7); scene.add(sunLight);
    const rim = new THREE.DirectionalLight(0x7ff0c8, 0.8); rim.position.set(-6, -2, -4); scene.add(rim);

    function size() {
      const w = box.clientWidth, h = box.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
    }
    size(); window.addEventListener('resize', size);

    let mx = 0, my = 0, turn = 0, turnTarget = 0, t0 = performance.now(), running = false, raf = 0;
    hero.addEventListener('pointermove', e => { const r = hero.getBoundingClientRect(); mx = (e.clientX - r.left) / r.width - 0.5; my = (e.clientY - r.top) / r.height - 0.5; }, { passive: true });
    hero.addEventListener('pointerleave', () => { mx = 0; my = 0; });
    const go = $('heroGo'), feat = $('heroFeature');
    [go, feat].forEach(b => { if (!b) return; b.addEventListener('pointerenter', () => { turnTarget = Math.PI / 2; }); b.addEventListener('pointerleave', () => { turnTarget = 0; }); b.addEventListener('focus', () => { turnTarget = Math.PI / 2; }); b.addEventListener('blur', () => { turnTarget = 0; }); });

    const still = reduce();
    function frame(now) {
      const t = (now - t0) / 1000;
      const intro = still ? 1 : Math.min(1, t / 1.8), e = 1 - Math.pow(1 - intro, 4);
      turn += (turnTarget - turn) * 0.09;
      spin.rotation.x = turn + (1 - e) * -Math.PI * 1.5;
      tilt.rotation.y = (still ? 0 : Math.sin(t * 0.42) * 0.38) + mx * 0.5 + (1 - e) * -1.2;
      tilt.rotation.x = my * 0.32;
      tilt.position.y = still ? 0 : Math.sin(t * 0.9) * 0.14;
      renderer.render(scene, cam);
      if (running && !still) raf = requestAnimationFrame(frame);
    }
    function visible() { return !document.hidden && !document.body.classList.contains('visit-open') && hero.offsetParent !== null; }
    let onScreen = true;
    function sync() {
      const want = onScreen && visible();
      if (want && !running) { running = true; raf = requestAnimationFrame(frame); }
      else if (!want && running) { running = false; cancelAnimationFrame(raf); }
    }
    if ('IntersectionObserver' in window) new IntersectionObserver(es => { onScreen = es[0].isIntersecting; sync(); }).observe(hero);
    document.addEventListener('visibilitychange', sync);
    new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('hashchange', () => setTimeout(sync, 50));
    requestAnimationFrame(() => { size(); frame(performance.now()); box.classList.add('ready'); sync(); });
  }
  function onWide() { if (window.innerWidth > 860) { window.removeEventListener('resize', onWide); heroKey(); } }

  /* ---------------- visite : ouverture par le trou de la serrure ---------------- */
  const KEYHOLE = 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 130"><circle cx="50" cy="42" r="31" fill="#fff"/><path d="M35 60h30l12 68H23z" fill="#fff"/></svg>') + '")';
  let lastPt = null, lastAt = 0;
  document.addEventListener('pointerdown', e => { lastPt = [e.clientX, e.clientY]; lastAt = Date.now(); }, true);
  function keyhole() {
    const v = $('visit'); if (!v) return;
    v.style.setProperty('--kh-img', KEYHOLE);
    let open = !v.hidden;
    new MutationObserver(() => {
      const now = !v.hidden;
      if (now && !open && !reduce() && window.CSS && CSS.registerProperty !== undefined) {
        const pt = lastPt && Date.now() - lastAt < 2500 ? lastPt : [innerWidth / 2, innerHeight / 2];
        v.style.setProperty('--kx', pt[0] + 'px'); v.style.setProperty('--ky', pt[1] + 'px');
        v.classList.remove('kh-in'); void v.offsetWidth; v.classList.add('kh-in');
        const done = () => { v.classList.remove('kh-in'); v.removeEventListener('animationend', done); };
        v.addEventListener('animationend', done); setTimeout(done, 1400);
      }
      open = now;
    }).observe(v, { attributes: true, attributeFilter: ['hidden'] });
  }

  /* ---------------- cartes : volume, reflet, arrivée en cascade ---------------- */
  let cur = null;
  function resetCard(c) { c.style.transform = ''; }
  document.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || reduce()) return;
    const c = e.target.closest ? e.target.closest('.grid > .card:not(.new)') : null;
    if (c !== cur) { if (cur) resetCard(cur); cur = c; }
    if (!c) return;
    const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    c.style.transform = 'translateY(-6px) rotateX(' + ((0.5 - y) * 6).toFixed(2) + 'deg) rotateY(' + ((x - 0.5) * 8).toFixed(2) + 'deg)';
    c.style.setProperty('--mx', (x * 100).toFixed(1) + '%'); c.style.setProperty('--my', (y * 100).toFixed(1) + '%');
  }, { passive: true });
  document.addEventListener('pointerleave', () => { if (cur) { resetCard(cur); cur = null; } }, true);

  function revealCards(grid) {
    if (!grid) return;
    new MutationObserver(muts => {
      let i = 0;
      muts.forEach(m => m.addedNodes.forEach(n => {
        if (n.nodeType !== 1 || !n.classList.contains('card')) return;
        n.style.setProperty('--i', Math.min(i++, 12));
        n.classList.add('d8-reveal');
        n.addEventListener('animationend', () => n.classList.remove('d8-reveal'), { once: true });
      }));
    }).observe(grid, { childList: true });
  }

  /* ---------------- pages : fil doré et contenu qui monte ---------------- */
  function goldLine() {
    if (reduce() || !Element.prototype.animate) return;
    const l = document.createElement('div'); l.className = 'd8-line'; document.body.appendChild(l);
    l.animate([{ transform: 'scaleX(0)', opacity: 1 }, { transform: 'scaleX(1)', opacity: 1, offset: 0.7 }, { transform: 'scaleX(1)', opacity: 0 }], { duration: 750, easing: 'cubic-bezier(.22,1,.36,1)' }).finished.finally(() => l.remove());
  }
  function pages() {
    document.querySelectorAll('.page').forEach(pg => {
      let shown = !pg.hidden;
      new MutationObserver(() => {
        const now = !pg.hidden;
        if (now && !shown) {
          goldLine();
          pg.classList.remove('d8-in'); void pg.offsetWidth; pg.classList.add('d8-in');
          setTimeout(() => pg.classList.remove('d8-in'), 1000);
        }
        shown = now;
      }).observe(pg, { attributes: true, attributeFilter: ['hidden'] });
    });
  }

  function start() {
    try { heroKey(); } catch (e) { console.warn('clé 3D', e); }
    keyhole(); pages(); revealCards($('grid')); revealCards($('homeGrid'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
