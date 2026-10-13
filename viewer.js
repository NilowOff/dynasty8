/* Visionneuse 360° (three.js) partagée par la visite et l'aperçu de l'assembleur.
   yaw : vers la droite, pitch : vers le haut, en degrés. yaw = longitude de l'image équirectangulaire. */
(function () {
  'use strict';
  const D2R = Math.PI / 180;

  function dir(yaw, pitch) {
    const y = yaw * D2R, p = pitch * D2R;
    return new THREE.Vector3(-Math.cos(p) * Math.cos(y), Math.sin(p), -Math.cos(p) * Math.sin(y));
  }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function makeSphere(r) {
    const g = new THREE.SphereGeometry(r, 96, 64);
    g.scale(-1, 1, 1);
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  }

  const texCache = new Map();
  function loadTexture(url, renderer) {
    if (!texCache.has(url)) {
      texCache.set(url, new Promise(function (resolve, reject) {
        new THREE.TextureLoader().load(url, function (tex) {
          if (renderer) tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
          resolve(tex);
        }, undefined, function (e) { texCache.delete(url); reject(e); });
      }));
    }
    return texCache.get(url);
  }
  function forgetTexture(url) { texCache.delete(url); }

  class PanoViewer {
    constructor(stage, opts) {
      this.stage = stage;
      this.opts = Object.assign({ keyboard: false, autoRotate: false, minFov: 30, maxFov: 100 }, opts || {});
      this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.renderer = new THREE.WebGLRenderer({ antialias: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      stage.appendChild(this.renderer.domElement);
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1100);
      this.sphere = makeSphere(500);
      this.scene.add(this.sphere);
      this.fadeSphere = makeSphere(490);
      Object.assign(this.fadeSphere.material, { transparent: true, opacity: 0, depthWrite: false });
      this.fadeSphere.visible = false;
      this.fadeSphere.renderOrder = 1;
      this.scene.add(this.fadeSphere);
      this.view = { yaw: 0, pitch: -4, fov: 72, vYaw: 0, vPitch: 0 };
      this.autoRotate = this.opts.autoRotate && !this.reduceMotion;
      this.lastInput = performance.now();
      this.frameHooks = [];
      this.onTap = null; this.onHover = null; this.onInput = null;
      this.anim = null;
      this.pointers = new Map();
      this.alive = true;
      this._bind();
      this._resize();
      this.view.fov = this.defaultFov();
      this.ro = new ResizeObserver(() => this._resize());
      this.ro.observe(stage);
      this._last = performance.now();
      requestAnimationFrame(t => this._frame(t));
    }
    defaultFov() { return this.stage.clientWidth >= this.stage.clientHeight ? 72 : 92; }
    _resize() {
      const w = Math.max(1, this.stage.clientWidth), h = Math.max(1, this.stage.clientHeight);
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    setTexture(tex) {
      this.sphere.material.map = tex;
      this.sphere.material.needsUpdate = true;
      this.stage.classList.add('ready');
    }
    look(yaw, pitch, fov) {
      this.view.yaw = yaw; this.view.pitch = pitch;
      if (fov) this.view.fov = fov;
      this.view.vYaw = this.view.vPitch = 0;
    }
    setFov(f) { this.view.fov = Math.max(this.opts.minFov, Math.min(this.opts.maxFov, f)); this.settle = null; }
    clampPitch(p) { return Math.max(-88, Math.min(88, p)); }
    touched() { this.lastInput = performance.now(); if (this.onInput) this.onInput(); }

    // direction (yaw/pitch) sous un point de l'écran
    screenToDir(clientX, clientY) {
      const r = this.stage.getBoundingClientRect();
      const ndc = new THREE.Vector3((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1, 0.5);
      ndc.unproject(this.camera);
      const d = ndc.sub(this.camera.position).normalize();
      const pitch = Math.asin(Math.max(-1, Math.min(1, d.y))) / D2R;
      const yaw = Math.atan2(-d.z, -d.x) / D2R;
      return { yaw, pitch };
    }
    // point 3D -> position écran (relative à la scène), front = devant la caméra
    project(v) {
      const fwd = new THREE.Vector3(); this.camera.getWorldDirection(fwd);
      const front = v.clone().normalize().dot(fwd) > 0.08;
      const p = v.clone().project(this.camera);
      return { x: (p.x + 1) / 2 * this.stage.clientWidth, y: (1 - p.y) / 2 * this.stage.clientHeight, front };
    }
    raycast(clientX, clientY, objects) {
      const r = this.stage.getBoundingClientRect();
      const rc = new THREE.Raycaster();
      rc.setFromCamera(new THREE.Vector2((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
      return rc.intersectObjects(objects);
    }

    _bind() {
      const st = this.stage;
      let pinchStart = 0, fovStart = 0, press = null;
      st.addEventListener('pointerdown', e => {
        st.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
        press = this.pointers.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 } : null;
        this.view.vYaw = this.view.vPitch = 0;
        st.classList.add('dragging');
        if (this.pointers.size === 2) {
          const [a, b] = [...this.pointers.values()];
          pinchStart = Math.hypot(a.x - b.x, a.y - b.y); fovStart = this.view.fov;
        }
        this.touched();
      });
      st.addEventListener('pointermove', e => {
        const p = this.pointers.get(e.pointerId);
        if (!p) { if (e.pointerType === 'mouse' && this.onHover) this.onHover(e.clientX, e.clientY); return; }
        if (this.anim) return;
        const now = performance.now();
        if (this.pointers.size === 2) {
          p.x = e.clientX; p.y = e.clientY;
          const [a, b] = [...this.pointers.values()];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinchStart > 0) this.setFov(fovStart * pinchStart / dist);
        } else {
          const k = this.view.fov / st.clientHeight;
          const dx = e.clientX - p.x, dy = e.clientY - p.y;
          if (press) press.moved += Math.abs(dx) + Math.abs(dy);
          this.view.yaw -= dx * k;
          this.view.pitch = this.clampPitch(this.view.pitch + dy * k);
          const dt = Math.max(1, now - p.t);
          this.view.vYaw = -dx * k / dt * 16; this.view.vPitch = dy * k / dt * 16;
          p.x = e.clientX; p.y = e.clientY; p.t = now;
        }
        this.touched();
      });
      const end = e => {
        const p = this.pointers.get(e.pointerId);
        this.pointers.delete(e.pointerId);
        if (this.pointers.size < 2) pinchStart = 0;
        if (this.pointers.size === 0) {
          st.classList.remove('dragging');
          if ((p && performance.now() - p.t > 80) || this.reduceMotion) this.view.vYaw = this.view.vPitch = 0;
          if (e.type === 'pointerup' && press && press.moved < 8 && performance.now() - press.t < 600 && this.onTap) {
            this.view.vYaw = this.view.vPitch = 0;
            this.onTap(e.clientX, e.clientY);
          }
          press = null;
        }
      };
      st.addEventListener('pointerup', end);
      st.addEventListener('pointercancel', end);
      st.addEventListener('wheel', e => {
        e.preventDefault();
        if (this.anim) return;
        this.setFov(this.view.fov * Math.exp(e.deltaY * 0.0012));
        this.touched();
      }, { passive: false });
      if (this.opts.keyboard) {
        this._key = e => {
          if (this.anim || !this.keyboardActive || !this.keyboardActive()) return;
          const t = e.target;
          if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
          const step = 5;
          if (e.key === 'ArrowLeft') this.view.yaw -= step;
          else if (e.key === 'ArrowRight') this.view.yaw += step;
          else if (e.key === 'ArrowUp') this.view.pitch = this.clampPitch(this.view.pitch + step);
          else if (e.key === 'ArrowDown') this.view.pitch = this.clampPitch(this.view.pitch - step);
          else if (e.key === '+' || e.key === '=') this.setFov(this.view.fov - 6);
          else if (e.key === '-') this.setFov(this.view.fov + 6);
          else return;
          e.preventDefault(); this.touched();
        };
        window.addEventListener('keydown', this._key);
      }
    }

    // passage vers une autre image : on se tourne vers le cercle, on avance, fondu enchaîné
    travel(linkYaw, tex, delta) {
      return new Promise(resolve => {
        this.fadeSphere.material.map = tex; this.fadeSphere.material.needsUpdate = true;
        this.fadeSphere.material.opacity = 0;
        this.fadeSphere.rotation.y = delta * D2R;
        this.fadeSphere.visible = true;
        const dYaw = ((linkYaw - this.view.yaw) % 360 + 540) % 360 - 180;
        this.anim = { t0: performance.now(), dur: this.reduceMotion ? 1 : 900, yaw0: this.view.yaw, dYaw, pitch0: this.view.pitch, fov0: this.view.fov, tex, delta, resolve };
        this.view.vYaw = this.view.vPitch = 0;
      });
    }
    _stepAnim(now) {
      const a = this.anim, t = Math.min(1, (now - a.t0) / a.dur);
      const turn = ease(Math.min(1, t / 0.55));
      this.view.yaw = a.yaw0 + a.dYaw * turn;
      this.view.pitch = a.pitch0 + (-6 - a.pitch0) * turn;
      const push = ease(Math.max(0, (t - 0.25) / 0.75));
      this.view.fov = a.fov0 * (1 - 0.3 * push);
      this.fadeSphere.material.opacity = Math.max(0, Math.min(1, (t - 0.35) / 0.55));
      if (t >= 1) {
        this.setTexture(a.tex);
        this.view.yaw += a.delta;
        this.fadeSphere.visible = false;
        this.fadeSphere.material.opacity = 0;
        this.anim = null;
        this.settle = { t0: now, fov0: this.view.fov };
        a.resolve();
      }
    }

    // capture JPEG d'une vue (pour la photo de couverture)
    capture(width, height, yaw, pitch, fov, hide) {
      const cam = new THREE.PerspectiveCamera(fov, width / height, 0.1, 1100);
      cam.lookAt(dir(yaw, pitch));
      const rt = new THREE.WebGLRenderTarget(width, height);
      const hidden = (hide || []).filter(o => o && o.visible);
      hidden.forEach(o => { o.visible = false; });
      this.renderer.setRenderTarget(rt);
      this.renderer.render(this.scene, cam);
      const px = new Uint8Array(width * height * 4);
      this.renderer.readRenderTargetPixels(rt, 0, 0, width, height, px);
      this.renderer.setRenderTarget(null);
      hidden.forEach(o => { o.visible = true; });
      rt.dispose();
      const c = document.createElement('canvas'); c.width = width; c.height = height;
      const g = c.getContext('2d'), img = g.createImageData(width, height);
      for (let y = 0; y < height; y++) img.data.set(px.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4);
      g.putImageData(img, 0, 0);
      return new Promise(res => c.toBlob(res, 'image/jpeg', 0.86));
    }

    _frame(now) {
      if (!this.alive) return;
      const dt = Math.min(0.05, (now - this._last) / 1000);
      this._last = now;
      const v = this.view;
      if (this.anim) this._stepAnim(now);
      else {
        if (this.settle) {
          const t = Math.min(1, (now - this.settle.t0) / (this.reduceMotion ? 1 : 450));
          v.fov = this.settle.fov0 + (this.defaultFov() - this.settle.fov0) * ease(t);
          if (t >= 1) this.settle = null;
        }
        if (this.pointers.size === 0) {
          if (Math.abs(v.vYaw) > 0.001 || Math.abs(v.vPitch) > 0.001) {
            v.yaw += v.vYaw; v.pitch = this.clampPitch(v.pitch + v.vPitch);
            v.vYaw *= 0.92; v.vPitch *= 0.92;
          } else if (this.autoRotate && now - this.lastInput > 3500) {
            v.yaw += 4 * dt;
            v.pitch += (-4 - v.pitch) * Math.min(1, dt * 0.6);
          }
        }
      }
      this.camera.fov = v.fov;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(dir(v.yaw, v.pitch));
      for (const h of this.frameHooks) h(now);
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(t => this._frame(t));
    }
    dispose() {
      this.alive = false;
      this.ro.disconnect();
      if (this._key) window.removeEventListener('keydown', this._key);
      this.renderer.dispose();
      if (this.renderer.domElement.parentNode) this.renderer.domElement.remove();
    }
  }

  window.PanoViewer = PanoViewer;
  window.panoDir = dir;
  window.panoLoadTexture = loadTexture;
  window.panoForgetTexture = forgetTexture;
})();
