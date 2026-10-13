/* Assembleur 360° — transforme une série de captures d'écran (tour complet + plafond + sol)
   en image équirectangulaire. JavaScript pur, sans dépendance.
   Repères : caméra x à droite, y vers le bas, z devant. Monde : y vers le bas.
   Équirectangulaire : lon = atan2(x, z), lat = asin(-y). */
(function (global) {
  'use strict';

  const DEG = Math.PI / 180;
  const ANALYSIS_W = 800;      // largeur de travail pour l'analyse
  const RENDER_MAX_W = 1600;   // largeur max des sources pour le rendu
  const MAX_KP = 1000;

  // ------------------------------------------------------------------ algèbre
  function mul3(A, B) {
    const C = new Float64Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    }
    return C;
  }
  function T3(A) { return Float64Array.of(A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]); }
  function mv3(A, x, y, z) { return [A[0] * x + A[1] * y + A[2] * z, A[3] * x + A[4] * y + A[5] * z, A[6] * x + A[7] * y + A[8] * z]; }
  function eye3() { return Float64Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1); }
  function rodrigues(wx, wy, wz) {
    const th = Math.hypot(wx, wy, wz);
    if (th < 1e-12) return Float64Array.of(1, -wz, wy, wz, 1, -wx, -wy, wx, 1);
    const kx = wx / th, ky = wy / th, kz = wz / th, c = Math.cos(th), s = Math.sin(th), v = 1 - c;
    return Float64Array.of(
      c + kx * kx * v, kx * ky * v - kz * s, kx * kz * v + ky * s,
      ky * kx * v + kz * s, c + ky * ky * v, ky * kz * v - kx * s,
      kz * kx * v - ky * s, kz * ky * v + kx * s, c + kz * kz * v);
  }
  function quatToMat(w, x, y, z) {
    const n = Math.hypot(w, x, y, z); w /= n; x /= n; y /= n; z /= n;
    return Float64Array.of(
      1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
      2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
      2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y));
  }
  function jacobiEigen(a, n) {
    const A = Float64Array.from(a), V = new Float64Array(n * n);
    for (let i = 0; i < n; i++) V[i * n + i] = 1;
    for (let sweep = 0; sweep < 60; sweep++) {
      let off = 0;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p * n + q] * A[p * n + q];
      if (off < 1e-22) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        const apq = A[p * n + q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (A[q * n + q] - A[p * n + p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k * n + p], akq = A[k * n + q];
          A[k * n + p] = c * akp - s * akq; A[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p * n + k], aqk = A[q * n + k];
          A[p * n + k] = c * apk - s * aqk; A[q * n + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k * n + p], vkq = V[k * n + q];
          V[k * n + p] = c * vkp - s * vkq; V[k * n + q] = s * vkp + c * vkq;
        }
      }
    }
    const values = []; for (let i = 0; i < n; i++) values.push(A[i * n + i]);
    return { values, vectors: V };  // vecteur propre i = colonne i
  }
  function solveLinear(A, b, n) {   // élimination de Gauss avec pivot partiel
    const M = Float64Array.from(A), x = Float64Array.from(b);
    for (let c = 0; c < n; c++) {
      let piv = c, best = Math.abs(M[c * n + c]);
      for (let r = c + 1; r < n; r++) { const v = Math.abs(M[r * n + c]); if (v > best) { best = v; piv = r; } }
      if (best < 1e-14) return null;
      if (piv !== c) {
        for (let k = 0; k < n; k++) { const t = M[c * n + k]; M[c * n + k] = M[piv * n + k]; M[piv * n + k] = t; }
        const t = x[c]; x[c] = x[piv]; x[piv] = t;
      }
      for (let r = c + 1; r < n; r++) {
        const f = M[r * n + c] / M[c * n + c];
        if (f === 0) continue;
        for (let k = c; k < n; k++) M[r * n + k] -= f * M[c * n + k];
        x[r] -= f * x[c];
      }
    }
    for (let r = n - 1; r >= 0; r--) {
      let s = x[r];
      for (let k = r + 1; k < n; k++) s -= M[r * n + k] * x[k];
      x[r] = s / M[r * n + r];
    }
    return x;
  }
  // rotation R telle que c ≈ R a (méthode de Horn, quaternions)
  function kabsch(as, cs, weights) {
    let Sxx = 0, Sxy = 0, Sxz = 0, Syx = 0, Syy = 0, Syz = 0, Szx = 0, Szy = 0, Szz = 0;
    for (let k = 0; k < as.length; k++) {
      const a = as[k], c = cs[k], w = weights ? weights[k] : 1;
      Sxx += w * a[0] * c[0]; Sxy += w * a[0] * c[1]; Sxz += w * a[0] * c[2];
      Syx += w * a[1] * c[0]; Syy += w * a[1] * c[1]; Syz += w * a[1] * c[2];
      Szx += w * a[2] * c[0]; Szy += w * a[2] * c[1]; Szz += w * a[2] * c[2];
    }
    const N = [
      Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx,
      Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz,
      Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy,
      Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz];
    const { values, vectors } = jacobiEigen(N, 4);
    let bi = 0; for (let i = 1; i < 4; i++) if (values[i] > values[bi]) bi = i;
    return quatToMat(vectors[bi], vectors[4 + bi], vectors[8 + bi], vectors[12 + bi]);
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const tick = () => new Promise(r => setTimeout(r, 0));

  // ------------------------------------------------------------------ images
  function gaussianBlur(src, w, h, sigma) {
    const r = Math.max(1, Math.ceil(sigma * 3)), k = new Float32Array(2 * r + 1);
    let s = 0;
    for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-i * i / (2 * sigma * sigma)); s += k[i + r]; }
    for (let i = 0; i < k.length; i++) k[i] /= s;
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let i = -r; i <= r; i++) { let xx = x + i; if (xx < 0) xx = 0; else if (xx >= w) xx = w - 1; acc += src[row + xx] * k[i + r]; }
        tmp[row + x] = acc;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let i = -r; i <= r; i++) { let yy = y + i; if (yy < 0) yy = 0; else if (yy >= h) yy = h - 1; acc += tmp[yy * w + x] * k[i + r]; }
        out[y * w + x] = acc;
      }
    }
    return out;
  }
  function gradMag(src, w, h) {
    const out = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = src[i - w + 1] + 2 * src[i + 1] + src[i + w + 1] - src[i - w - 1] - 2 * src[i - 1] - src[i + w - 1];
      const gy = src[i + w - 1] + 2 * src[i + w] + src[i + w + 1] - src[i - w - 1] - 2 * src[i - w] - src[i - w + 1];
      out[i] = Math.sqrt(gx * gx + gy * gy);
    }
    return out;
  }
  function drawScaled(bmp, w, h) {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, 0, 0, w, h);
    return g.getImageData(0, 0, w, h);
  }

  // ------------------------------------------------------------------ points d'intérêt (FAST + BRIEF orienté)
  const CIRCLE = [[0, -3], [1, -3], [2, -2], [3, -1], [3, 0], [3, 1], [2, 2], [1, 3], [0, 3], [-1, 3], [-2, 2], [-3, 1], [-3, 0], [-3, -1], [-2, -2], [-1, -3]];
  const N_BINS = 32;
  const PATTERN = (function () {
    const rnd = mulberry32(1234567), pairs = [];
    const g = () => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const clip = v => Math.max(-13, Math.min(13, Math.round(v)));
    for (let i = 0; i < 256; i++) pairs.push([clip(g() * 6.2), clip(g() * 6.2), clip(g() * 6.2), clip(g() * 6.2)]);
    const bins = [];
    for (let b = 0; b < N_BINS; b++) {
      const a = b / N_BINS * 2 * Math.PI, c = Math.cos(a), s = Math.sin(a);
      bins.push(pairs.map(([x1, y1, x2, y2]) => [
        Math.round(c * x1 - s * y1), Math.round(s * x1 + c * y1),
        Math.round(c * x2 - s * y2), Math.round(s * x2 + c * y2)]));
    }
    return bins;
  })();

  function detectFeatures(gray, w, h) {
    const border = 24;
    const blur1 = gaussianBlur(gray, w, h, 1.0);
    // gradients pour Harris
    const ix = new Float32Array(w * h), iy = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      ix[i] = (blur1[i + 1] - blur1[i - 1]) * 0.5; iy[i] = (blur1[i + w] - blur1[i - w]) * 0.5;
    }
    const offs = CIRCLE.map(([dx, dy]) => dy * w + dx);
    let cands = [];
    for (const t of [18, 11, 7, 4]) {
      cands = [];
      for (let y = border; y < h - border; y++) {
        for (let x = border; x < w - border; x++) {
          const i = y * w + x, p = blur1[i], hi = p + t, lo = p - t;
          // test rapide sur 4 points cardinaux
          const a = blur1[i + offs[0]], b = blur1[i + offs[4]], c = blur1[i + offs[8]], d = blur1[i + offs[12]];
          const nb = (a > hi) + (b > hi) + (c > hi) + (d > hi), nd = (a < lo) + (b < lo) + (c < lo) + (d < lo);
          if (nb < 2 && nd < 2) continue;
          let mb = 0, md = 0;
          for (let k = 0; k < 16; k++) { const v = blur1[i + offs[k]]; if (v > hi) mb |= 1 << k; else if (v < lo) md |= 1 << k; }
          const run = m => { let r = m | (m << 16); let acc = r; for (let s = 1; s < 9; s++) acc &= r >>> s; return acc !== 0; };
          if ((mb && run(mb)) || (md && run(md))) cands.push(i);
        }
      }
      if (cands.length >= MAX_KP * 1.5) break;
    }
    // score de Harris (fenêtre 5x5)
    const score = new Float32Array(w * h);
    for (const i of cands) {
      let a = 0, b = 0, c = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const j = i + dy * w + dx, gx = ix[j], gy = iy[j];
        a += gx * gx; b += gx * gy; c += gy * gy;
      }
      score[i] = Math.max(1e-6, a * c - b * b - 0.04 * (a + c) * (a + c));
    }
    // suppression des non-maxima 3x3
    let kps = [];
    for (const i of cands) {
      const s = score[i];
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && score[i + dy * w + dx] > s) { ok = false; break; }
      }
      if (ok) kps.push({ i, x: i % w, y: (i / w) | 0, s });
    }
    // répartition sur une grille
    const GX = 16, GY = 8, cap = Math.ceil(MAX_KP / (GX * GY) * 1.6);
    const cells = new Map();
    for (const k of kps) {
      const key = Math.min(GX - 1, (k.x * GX / w) | 0) + GX * Math.min(GY - 1, (k.y * GY / h) | 0);
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(k);
    }
    kps = [];
    for (const arr of cells.values()) { arr.sort((p, q) => q.s - p.s); kps.push(...arr.slice(0, cap)); }
    kps.sort((p, q) => q.s - p.s);
    kps = kps.slice(0, MAX_KP);
    // orientation (centroïde d'intensité) et descripteur
    const sm = gaussianBlur(gray, w, h, 2.0);
    const n = kps.length, desc = new Uint32Array(n * 8), xs = new Float32Array(n), ys = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const { i, x, y } = kps[k];
      let m01 = 0, m10 = 0;
      for (let dy = -12; dy <= 12; dy++) {
        const rr = Math.floor(Math.sqrt(144 - dy * dy));
        for (let dx = -rr; dx <= rr; dx++) { const v = sm[i + dy * w + dx]; m10 += dx * v; m01 += dy * v; }
      }
      let ang = Math.atan2(m01, m10); if (ang < 0) ang += 2 * Math.PI;
      const pat = PATTERN[Math.round(ang / (2 * Math.PI) * N_BINS) % N_BINS];
      for (let b = 0; b < 256; b++) {
        const [x1, y1, x2, y2] = pat[b];
        if (sm[i + y1 * w + x1] < sm[i + y2 * w + x2]) desc[k * 8 + (b >> 5)] |= 1 << (b & 31);
      }
      xs[k] = x; ys[k] = y;
    }
    return { n, xs, ys, desc };
  }
  function popcnt(v) { v = v - ((v >>> 1) & 0x55555555); v = (v & 0x33333333) + ((v >>> 2) & 0x33333333); return (((v + (v >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; }
  function matchFeatures(A, B, limitA, limitB) {
    const na = Math.min(A.n, limitA || A.n), nb = Math.min(B.n, limitB || B.n);
    const da = A.desc, db = B.desc;
    const bestA = new Int32Array(na), d1A = new Int32Array(na), d2A = new Int32Array(na);
    const bestB = new Int32Array(nb).fill(-1), dB = new Int32Array(nb).fill(999);
    for (let a = 0; a < na; a++) {
      let b1 = -1, d1 = 999, d2 = 999;
      const o = a * 8;
      const a0 = da[o], a1 = da[o + 1], a2 = da[o + 2], a3 = da[o + 3], a4 = da[o + 4], a5 = da[o + 5], a6 = da[o + 6], a7 = da[o + 7];
      for (let b = 0; b < nb; b++) {
        const p = b * 8;
        const d = popcnt(a0 ^ db[p]) + popcnt(a1 ^ db[p + 1]) + popcnt(a2 ^ db[p + 2]) + popcnt(a3 ^ db[p + 3]) +
          popcnt(a4 ^ db[p + 4]) + popcnt(a5 ^ db[p + 5]) + popcnt(a6 ^ db[p + 6]) + popcnt(a7 ^ db[p + 7]);
        if (d < d1) { d2 = d1; d1 = d; b1 = b; } else if (d < d2) d2 = d;
        if (d < dB[b]) { dB[b] = d; bestB[b] = a; }
      }
      bestA[a] = b1; d1A[a] = d1; d2A[a] = d2;
    }
    const out = [];
    for (let a = 0; a < na; a++) {
      const b = bestA[a];
      if (b < 0 || d1A[a] > 70 || d1A[a] >= 0.8 * d2A[a] || bestB[b] !== a) continue;
      out.push([a, b]);
    }
    return out;
  }

  // ------------------------------------------------------------------ homographie (RANSAC)
  function homographyFrom(src, dst, idx) {
    // h33 = 1, moindres carrés (normales) sur les indices donnés
    const AtA = new Float64Array(64), Atb = new Float64Array(8);
    for (const k of idx) {
      const x = src[2 * k], y = src[2 * k + 1], u = dst[2 * k], v = dst[2 * k + 1];
      const r1 = [x, y, 1, 0, 0, 0, -u * x, -u * y], r2 = [0, 0, 0, x, y, 1, -v * x, -v * y];
      for (let i = 0; i < 8; i++) {
        Atb[i] += r1[i] * u + r2[i] * v;
        for (let j = 0; j < 8; j++) AtA[i * 8 + j] += r1[i] * r1[j] + r2[i] * r2[j];
      }
    }
    const h = solveLinear(AtA, Atb, 8);
    return h ? [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1] : null;
  }
  function ransacHomography(src, dst, n, thr, iters, rnd) {
    if (n < 8) return null;
    const S = 300;  // normalisation (coordonnées centrées / S)
    const s = new Float64Array(2 * n), d = new Float64Array(2 * n);
    for (let k = 0; k < 2 * n; k++) { s[k] = src[k] / S; d[k] = dst[k] / S; }
    const t2 = (thr / S) * (thr / S);
    let bestIn = null, bestCount = 0;
    const err = (H, k) => {
      const x = s[2 * k], y = s[2 * k + 1], w = H[6] * x + H[7] * y + 1;
      if (Math.abs(w) < 1e-9) return 1e9;
      const u = (H[0] * x + H[1] * y + H[2]) / w - d[2 * k], v = (H[3] * x + H[4] * y + H[5]) / w - d[2 * k + 1];
      return u * u + v * v;
    };
    for (let it = 0; it < iters; it++) {
      const pick = new Set();
      while (pick.size < 4) pick.add((rnd() * n) | 0);
      const H = homographyFrom(s, d, [...pick]);
      if (!H) continue;
      let c = 0;
      for (let k = 0; k < n; k++) if (err(H, k) < t2) c++;
      if (c > bestCount) {
        bestCount = c; bestIn = H;
        const ratio = c / n;
        const need = Math.log(0.005) / Math.log(1 - Math.pow(ratio, 4) + 1e-12);
        if (it > need && it > 60) break;
      }
    }
    if (!bestIn || bestCount < 8) return null;
    let inl = [];
    for (let k = 0; k < n; k++) if (err(bestIn, k) < t2) inl.push(k);
    for (let rep = 0; rep < 2; rep++) {
      const H = homographyFrom(s, d, inl);
      if (!H) break;
      const next = []; for (let k = 0; k < n; k++) if (err(H, k) < t2) next.push(k);
      bestIn = H; if (next.length < inl.length) break; inl = next;
    }
    // dénormalise : H_px = diag(S,S,1) H diag(1/S,1/S,1)
    const H = bestIn;
    const Hp = [H[0], H[1], H[2] * S, H[3], H[4], H[5] * S, H[6] / S, H[7] / S, 1];
    return { H: Hp, inliers: inl };
  }
  function focalsFromHomography(h) {
    let f0 = null, f1 = null, d1, d2, v1, v2;
    d1 = h[6] * h[7]; d2 = (h[7] - h[6]) * (h[7] + h[6]);
    v1 = -(h[0] * h[1] + h[3] * h[4]) / d1; v2 = (h[0] * h[0] + h[3] * h[3] - h[1] * h[1] - h[4] * h[4]) / d2;
    if (v1 < v2) [v1, v2] = [v2, v1];
    if (v1 > 0 && v2 > 0) f1 = Math.sqrt(Math.abs(d1) > Math.abs(d2) ? v1 : v2); else if (v1 > 0) f1 = Math.sqrt(v1);
    d1 = h[0] * h[3] + h[1] * h[4]; d2 = h[0] * h[0] + h[1] * h[1] - h[3] * h[3] - h[4] * h[4];
    v1 = -h[2] * h[5] / d1; v2 = (h[5] * h[5] - h[2] * h[2]) / d2;
    if (v1 < v2) [v1, v2] = [v2, v1];
    if (v1 > 0 && v2 > 0) f0 = Math.sqrt(Math.abs(d1) > Math.abs(d2) ? v1 : v2); else if (v1 > 0) f0 = Math.sqrt(v1);
    return f0 && f1 && isFinite(f0) && isFinite(f1) ? Math.sqrt(f0 * f1) : null;
  }

  // ------------------------------------------------------------------ ajustement de faisceaux (rayons)
  function bearing(u, v, f) { const L = Math.sqrt(u * u + v * v + f * f); return [u / L, v / L, f / L]; }
  function bundleAdjust(cams, edges, f0, rootIdx, iterations) {
    // cams[i].R (Float64Array 9) ; edges: {i, j, pts: Float64Array [u_i, v_i, u_j, v_j]...} (coordonnées centrées)
    const idxOf = new Map(); let P = 0;
    for (let c = 0; c < cams.length; c++) if (c !== rootIdx && cams[c].active) { idxOf.set(c, P); P += 3; }
    const FI = P; P += 1;
    let f = f0, lambda = 1e-3;
    const huber = 2.5 / f0;
    const cost = (fv, Rs) => {
      let s = 0;
      for (const e of edges) {
        const Ri = Rs[e.i], Rj = Rs[e.j], p = e.pts;
        for (let k = 0; k < p.length; k += 4) {
          const a = bearing(p[k], p[k + 1], fv), b = bearing(p[k + 2], p[k + 3], fv);
          const va = mv3(Ri, a[0], a[1], a[2]), vb = mv3(Rj, b[0], b[1], b[2]);
          const r = Math.hypot(va[0] - vb[0], va[1] - vb[1], va[2] - vb[2]);
          s += r <= huber ? r * r : 2 * huber * r - huber * huber;
        }
      }
      return s;
    };
    let Rs = cams.map(c => c.R);
    let cur = cost(f, Rs);
    for (let it = 0; it < iterations; it++) {
      const JTJ = new Float64Array(P * P), JTr = new Float64Array(P);
      for (const e of edges) {
        const Ri = Rs[e.i], Rj = Rs[e.j], p = e.pts;
        const pi = idxOf.has(e.i) ? idxOf.get(e.i) : -1, pj = idxOf.has(e.j) ? idxOf.get(e.j) : -1;
        for (let k = 0; k < p.length; k += 4) {
          const ua = p[k], va_ = p[k + 1], ub = p[k + 2], vb_ = p[k + 3];
          const La = Math.sqrt(ua * ua + va_ * va_ + f * f), Lb = Math.sqrt(ub * ub + vb_ * vb_ + f * f);
          const a = [ua / La, va_ / La, f / La], b = [ub / Lb, vb_ / Lb, f / Lb];
          const va = mv3(Ri, a[0], a[1], a[2]), vb = mv3(Rj, b[0], b[1], b[2]);
          const r = [va[0] - vb[0], va[1] - vb[1], va[2] - vb[2]];
          const rn = Math.hypot(r[0], r[1], r[2]);
          const w = rn <= huber ? 1 : huber / rn;
          // dérivées : d(exp(δ) v)/dδ = -[v]x ; résidu r = Ri a - Rj b
          const cols = [];  // [paramIndex, dr(3)]
          if (pi >= 0) {   // -[va]x
            cols.push([pi, [0, -va[2], va[1]]], [pi + 1, [va[2], 0, -va[0]]], [pi + 2, [-va[1], va[0], 0]]);
          }
          if (pj >= 0) {   // +[vb]x
            cols.push([pj, [0, vb[2], -vb[1]]], [pj + 1, [-vb[2], 0, vb[0]]], [pj + 2, [vb[1], -vb[0], 0]]);
          }
          // focale (paramètre ln f)
          const da = [(-a[0] * a[2]) / La * f, (-a[1] * a[2]) / La * f, (1 - a[2] * a[2]) / La * f];
          const db = [(-b[0] * b[2]) / Lb * f, (-b[1] * b[2]) / Lb * f, (1 - b[2] * b[2]) / Lb * f];
          const Rda = mv3(Ri, da[0], da[1], da[2]), Rdb = mv3(Rj, db[0], db[1], db[2]);
          cols.push([FI, [Rda[0] - Rdb[0], Rda[1] - Rdb[1], Rda[2] - Rdb[2]]]);
          for (let m = 0; m < cols.length; m++) {
            const [pm, gm] = cols[m];
            JTr[pm] += w * (gm[0] * r[0] + gm[1] * r[1] + gm[2] * r[2]);
            for (let q = 0; q < cols.length; q++) {
              const [pq, gq] = cols[q];
              JTJ[pm * P + pq] += w * (gm[0] * gq[0] + gm[1] * gq[1] + gm[2] * gq[2]);
            }
          }
        }
      }
      let improved = false;
      for (let tries = 0; tries < 6 && !improved; tries++) {
        const A = Float64Array.from(JTJ);
        for (let d = 0; d < P; d++) A[d * P + d] += lambda * (JTJ[d * P + d] + 1e-9);
        const neg = JTr.map(v => -v);
        const delta = solveLinear(A, neg, P);
        if (!delta) { lambda *= 10; continue; }
        const nf = f * Math.exp(delta[FI]);
        const nR = Rs.map((R, c) => {
          if (!idxOf.has(c)) return R;
          const o = idxOf.get(c);
          return mul3(rodrigues(delta[o], delta[o + 1], delta[o + 2]), R);
        });
        const nc = cost(nf, nR);
        if (nc < cur) {
          const rel = (cur - nc) / cur;
          Rs = nR; f = nf; cur = nc; lambda = Math.max(1e-7, lambda / 3); improved = true;
          if (rel < 1e-7) it = iterations;
        } else lambda *= 8;
      }
      if (!improved) break;
    }
    cams.forEach((c, i) => { c.R = Rs[i]; });
    return f;
  }

  // ------------------------------------------------------------------ alignement direct (murs unis)
  function gradOf(c) {
    if (!c._grad) c._grad = gradMag(gaussianBlur(c.gray, c.aw, c.ah, 1.2), c.aw, c.ah);
    return c._grad;
  }
  // rotation R telle que b_A ≈ R b_B, cherchée en comparant les contours des deux images
  function alignDirect(A, B, f) {
    const ga = gradOf(A), gb = gradOf(B);
    const step = 4, bx = [], by = [], bz = [], va = [], us = [], vs = [];
    for (let y = 6; y < A.ah - 6; y += step) for (let x = 6; x < A.aw - 6; x += step) {
      const u = x - A.aw / 2, v = y - A.ah / 2, L = Math.sqrt(u * u + v * v + f * f);
      bx.push(u / L); by.push(v / L); bz.push(f / L); va.push(ga[y * A.aw + x]); us.push(u); vs.push(v);
    }
    const n0 = va.length, cxB = B.aw / 2, cyB = B.ah / 2;
    const make = q => mul3(rodrigues(0, q[0], 0), mul3(rodrigues(q[1], 0, 0), rodrigues(0, 0, q[2])));
    const score = q => {
      const R = make(q);   // b_B = R^T b_A
      let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
      for (let k = 0; k < n0; k++) {
        const x = R[0] * bx[k] + R[3] * by[k] + R[6] * bz[k], y = R[1] * bx[k] + R[4] * by[k] + R[7] * bz[k], z = R[2] * bx[k] + R[5] * by[k] + R[8] * bz[k];
        if (z <= 0.05) continue;
        const u = f * x / z + cxB, v = f * y / z + cyB;
        if (u < 2 || v < 2 || u > B.aw - 3 || v > B.ah - 3) continue;
        const a = va[k], b = sampleGray(gb, B.aw, B.ah, u, v);
        n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b;
      }
      if (n < n0 * 0.12) return -1;
      const cov = sab - sa * sb / n, vA = saa - sa * sa / n, vB = sbb - sb * sb / n;
      return cov / Math.sqrt(vA * vB + 1e-9);
    };
    const cands = [];
    for (let yaw = -80; yaw <= 80; yaw += 1.5) {
      if (Math.abs(yaw) < 3) continue;
      for (let pitch = -6; pitch <= 6; pitch += 3) cands.push({ q: [yaw * DEG, pitch * DEG, 0], s: 0 });
    }
    for (const c of cands) c.s = score(c.q);
    cands.sort((a, b) => b.s - a.s);
    let best = null;
    for (const c of cands.slice(0, 3)) {
      const r = nelderMead(q => (Math.abs(q[1]) > 15 * DEG || Math.abs(q[2]) > 10 * DEG) ? 2 : -score(q), c.q, [1 * DEG, 1 * DEG, 1 * DEG], 120);
      if (!best || r.f < best.f) best = r;
    }
    if (!best) return null;
    const R = make(best.x);
    // correspondances synthétiques (points à fort contour visibles dans les deux images)
    const idx = [];
    for (let k = 0; k < n0; k++) idx.push(k);
    idx.sort((p, q) => va[q] - va[p]);
    const pts = [];
    for (const k of idx) {
      const x = R[0] * bx[k] + R[3] * by[k] + R[6] * bz[k], y = R[1] * bx[k] + R[4] * by[k] + R[7] * bz[k], z = R[2] * bx[k] + R[5] * by[k] + R[8] * bz[k];
      if (z <= 0.05) continue;
      const u = f * x / z, v = f * y / z;
      if (Math.abs(u) > B.aw / 2 - 4 || Math.abs(v) > B.ah / 2 - 4) continue;
      pts.push(us[k], vs[k], u, v);
      if (pts.length >= 60 * 4) break;
    }
    return { R, score: -best.f, pts: Float64Array.from(pts) };
  }

  // ------------------------------------------------------------------ session
  async function prepare(files, opts) {
    opts = opts || {};
    const progress = opts.onProgress || (() => {});
    const roles = opts.roles || [];
    const rnd = mulberry32(42);
    const S = { cams: [], f: 0, fRender: 0 };

    progress('Lecture des captures', 0);
    const bitmaps = [];
    for (let k = 0; k < files.length; k++) {
      bitmaps.push(await createImageBitmap(files[k]));
      progress('Lecture des captures', (k + 1) / files.length);
      await tick();
    }
    const maxW = Math.max(...bitmaps.map(b => b.width));
    const sA = ANALYSIS_W / maxW, sR = Math.min(1, RENDER_MAX_W / maxW);
    S.scaleA = sA; S.scaleR = sR;

    progress('Analyse des captures', 0);
    for (let k = 0; k < bitmaps.length; k++) {
      const b = bitmaps[k];
      const aw = Math.round(b.width * sA), ah = Math.round(b.height * sA);
      const id = drawScaled(b, aw, ah);
      const gray = new Float32Array(aw * ah);
      for (let i = 0, j = 0; i < gray.length; i++, j += 4) gray[i] = 0.299 * id.data[j] + 0.587 * id.data[j + 1] + 0.114 * id.data[j + 2];
      const rw = Math.round(b.width * sR), rh = Math.round(b.height * sR);
      const rgba = drawScaled(b, rw, rh).data;
      const feats = detectFeatures(gray, aw, ah);
      S.cams.push({
        name: files[k].name || ('image ' + (k + 1)), index: k, role: roles[k] || 'auto',
        aw, ah, gray, rw, rh, rgba, feats, R: eye3(), active: false, aligned: false
      });
      b.close && b.close();
      progress('Analyse des captures', (k + 1) / bitmaps.length);
      await tick();
    }
    const N = S.cams.length;

    // --- appariement : test rapide sur toutes les paires, complet sur les prometteuses
    //     (les captures qui se suivent sont toujours comparées en détail)
    progress('Recherche des recouvrements', 0);
    const usable = S.cams.filter(c => c.role !== 'ignore');
    const order = new Map(usable.map((c, k) => [c.index, k]));
    const isNeighbor = (i, j) => Math.abs(order.get(i) - order.get(j)) <= 2;
    const pairs = [];
    const total = usable.length * (usable.length - 1) / 2; let done = 0;
    for (let a = 0; a < usable.length; a++) for (let b = a + 1; b < usable.length; b++) {
      const A = usable[a], B = usable[b];
      done++;
      if (b - a <= 2) { pairs.push([A.index, B.index]); continue; }
      const quick = matchFeatures(A.feats, B.feats, 300, 300);
      if (quick.length >= 10) pairs.push([A.index, B.index]);
      if (done % 8 === 0) { progress('Recherche des recouvrements', done / total); await tick(); }
    }
    const edges = [];
    for (let p = 0; p < pairs.length; p++) {
      const [i, j] = pairs[p], A = S.cams[i], B = S.cams[j];
      const m = matchFeatures(A.feats, B.feats);
      if (m.length >= 8) {
        const src = new Float64Array(2 * m.length), dst = new Float64Array(2 * m.length);
        m.forEach(([a, b], k) => {
          src[2 * k] = A.feats.xs[a] - A.aw / 2; src[2 * k + 1] = A.feats.ys[a] - A.ah / 2;
          dst[2 * k] = B.feats.xs[b] - B.aw / 2; dst[2 * k + 1] = B.feats.ys[b] - B.ah / 2;
        });
        const res = ransacHomography(src, dst, m.length, 3, 1500, rnd);
        if (res) {
          const conf = res.inliers.length / (8 + 0.3 * m.length);
          const strong = res.inliers.length >= 15 && conf > 1;
          const weak = !strong && isNeighbor(i, j) && res.inliers.length >= 8 && conf > 0.6;
          if (strong || weak) {
            // garde un échantillon bien réparti des appariements valides
            let inl = res.inliers.slice();
            if (inl.length > 120) {
              const grid = new Map();
              for (const k of inl) {
                const key = ((src[2 * k] / A.aw * 8 + 4) | 0) + 10 * ((src[2 * k + 1] / A.ah * 6 + 3) | 0);
                if (!grid.has(key)) grid.set(key, []); grid.get(key).push(k);
              }
              const pick = []; let round = 0;
              while (pick.length < 120) {
                let added = false;
                for (const arr of grid.values()) if (arr.length > round) { pick.push(arr[round]); added = true; if (pick.length >= 120) break; }
                if (!added) break; round++;
              }
              inl = pick;
            }
            const pts = new Float64Array(inl.length * 4);
            inl.forEach((k, q) => { pts[4 * q] = src[2 * k]; pts[4 * q + 1] = src[2 * k + 1]; pts[4 * q + 2] = dst[2 * k]; pts[4 * q + 3] = dst[2 * k + 1]; });
            edges.push({ i, j, conf: strong ? conf : conf * 0.5, n: res.inliers.length, H: res.H, pts, weak });
          }
        }
      }
      progress('Vérification des recouvrements', (p + 1) / pairs.length);
      if (p % 3 === 0) await tick();
    }
    S.edges = edges;

    // --- focale initiale (liens solides d'abord)
    const forcedPole = c => c.role === 'up' || c.role === 'down';
    const fs = [];
    for (const e of edges) {
      if (e.weak || forcedPole(S.cams[e.i]) || forcedPole(S.cams[e.j])) continue;
      const fv = focalsFromHomography(e.H); if (fv) fs.push(fv);
    }
    fs.sort((a, b) => a - b);
    const aw0 = S.cams[0].aw;
    let f = fs.length ? fs[fs.length >> 1] : aw0 / 2;
    if (!(f > aw0 * 0.15 && f < aw0 * 4)) f = aw0 / 2;

    // --- ensembles connectés ; les captures qui se suivent mais ne se relient pas par points
    //     communs (murs unis) sont alignées directement par corrélation
    const components = () => {
      const adj = new Map(); S.cams.forEach(c => adj.set(c.index, []));
      for (const e of edges) {
        if (forcedPole(S.cams[e.i]) || forcedPole(S.cams[e.j])) continue;
        adj.get(e.i).push(e); adj.get(e.j).push(e);
      }
      const compOf = new Map(), comps = [];
      for (const c of usable) {
        if (compOf.has(c.index) || forcedPole(c)) continue;
        const comp = [], stack = [c.index]; compOf.set(c.index, comps.length);
        while (stack.length) {
          const x = stack.pop(); comp.push(x);
          for (const e of adj.get(x)) { const y = e.i === x ? e.j : e.i; if (!compOf.has(y)) { compOf.set(y, comps.length); stack.push(y); } }
        }
        comps.push(comp);
      }
      return { compOf, comps };
    };
    let cc = components();
    if (cc.comps.length > 1) {
      progress('Alignement des murs unis', 0); await tick();
      const free = usable.filter(c => !forcedPole(c));
      for (let k = 0; k + 1 < free.length; k++) {
        const A = free[k], B = free[k + 1];
        if (cc.compOf.get(A.index) === cc.compOf.get(B.index)) continue;
        const r = alignDirect(A, B, f);
        if (r && r.score >= 0.3) {
          edges.push({ i: A.index, j: B.index, conf: 0.3 * r.score, n: r.pts.length / 4, H: null, pts: r.pts, weak: true, direct: true });
          cc = components();
        }
        progress('Alignement des murs unis', (k + 1) / free.length); await tick();
      }
    }
    let bestComp = [];
    for (const comp of cc.comps) if (comp.length > bestComp.length) bestComp = comp;
    if (bestComp.length < 3) throw new Error('Pas assez de captures qui se recouvrent. Prends des screens qui se chevauchent d’environ la moitié.');
    const inComp = new Set(bestComp);
    const root = Math.min(...bestComp);

    // --- rotations initiales (arbre couvrant de confiance maximale)
    progress('Calcul de la position des captures', 0);
    const relRot = (e, fv) => {
      const as = [], cs = [];
      for (let k = 0; k < e.pts.length; k += 4) { cs.push(bearing(e.pts[k], e.pts[k + 1], fv)); as.push(bearing(e.pts[k + 2], e.pts[k + 3], fv)); }
      return kabsch(as, cs); // b_i ≈ R_ij b_j
    };
    const placed = new Set([root]); S.cams[root].R = eye3();
    const compEdges = edges.filter(e => inComp.has(e.i) && inComp.has(e.j));
    while (placed.size < bestComp.length) {
      let best = null;
      for (const e of compEdges) {
        const a = placed.has(e.i), b = placed.has(e.j);
        if (a !== b && (!best || e.conf > best.conf)) best = e;
      }
      if (!best) break;
      const Rij = relRot(best, f);
      if (placed.has(best.i)) { S.cams[best.j].R = mul3(S.cams[best.i].R, Rij); placed.add(best.j); }
      else { S.cams[best.i].R = mul3(S.cams[best.j].R, T3(Rij)); placed.add(best.i); }
    }
    for (const i of bestComp) { S.cams[i].active = true; S.cams[i].aligned = true; }

    // --- ajustement global
    progress('Ajustement global', 0.2); await tick();
    f = bundleAdjust(S.cams, compEdges, f, root, 40);
    progress('Ajustement global', 1); await tick();

    // --- captures hors de l'ensemble : rattachement par points communs si possible
    const toPoles = [];
    for (const c of S.cams) {
      if (c.aligned || c.role === 'ignore') continue;
      const as = [], cs = [];
      for (const e of edges) {
        const other = e.i === c.index ? e.j : (e.j === c.index ? e.i : -1);
        if (other < 0 || !S.cams[other].aligned) continue;
        const Ro = S.cams[other].R, p = e.pts;
        for (let k = 0; k < p.length; k += 4) {
          const mine = e.i === c.index ? [p[k], p[k + 1]] : [p[k + 2], p[k + 3]];
          const theirs = e.i === c.index ? [p[k + 2], p[k + 3]] : [p[k], p[k + 1]];
          as.push(bearing(mine[0], mine[1], f));
          const b = bearing(theirs[0], theirs[1], f); cs.push(mv3(Ro, b[0], b[1], b[2]));
        }
      }
      let ok = false;
      if (as.length >= 15) {
        let bestR = null, bestIn = [];
        for (let it = 0; it < 300; it++) {
          const s = [(rnd() * as.length) | 0, (rnd() * as.length) | 0, (rnd() * as.length) | 0];
          const R = kabsch(s.map(q => as[q]), s.map(q => cs[q]));
          const inl = [];
          for (let q = 0; q < as.length; q++) {
            const v = mv3(R, as[q][0], as[q][1], as[q][2]);
            if (v[0] * cs[q][0] + v[1] * cs[q][1] + v[2] * cs[q][2] > Math.cos(0.6 * DEG)) inl.push(q);
          }
          if (inl.length > bestIn.length) { bestIn = inl; bestR = R; }
        }
        if (bestIn.length >= 15) {
          c.R = kabsch(bestIn.map(q => as[q]), bestIn.map(q => cs[q]));
          c.aligned = true; c.active = true; ok = true;
        }
      }
      if (!ok) toPoles.push(c);
    }

    // --- horizon droit (correction de vague) sur les captures alignées
    levelHorizon(S.cams.filter(c => c.aligned), S.cams[root]);
    S.f = f; S.root = root;

    // --- plafond / sol par corrélation
    if (toPoles.length) {
      progress('Placement du plafond et du sol', 0); await tick();
      for (let k = 0; k < toPoles.length; k++) {
        toPoles[k].autoRole = toPoles[k].role === 'auto';
        await solvePole(S, toPoles[k], (p) => progress('Placement du plafond et du sol', (k + p) / (toPoles.length + 1)));
      }
      // deux captures « plafond » (ou deux « sol ») détectées automatiquement : la moins sûre change de côté
      const autos = toPoles.filter(c => c.autoRole && c.aligned);
      for (const [a, b] of [['up', 'down'], ['down', 'up']]) {
        const same = autos.filter(c => c.role === a), other = autos.filter(c => c.role === b);
        if (same.length >= 2 && !other.length) {
          same.sort((p, q) => p.poleScore - q.poleScore);
          const c = same[0], prev = { R: c.R, fScale: c.fScale, planeC: c.planeC, poleSide: c.poleSide, poleScore: c.poleScore, auto: c.auto };
          c.role = b;
          await solvePole(S, c, (p) => progress('Placement du plafond et du sol', (toPoles.length + p) / (toPoles.length + 1)));
          if (!c.aligned || c.poleScore < 0.15) Object.assign(c, prev, { role: a, aligned: true, active: true });
          break;
        }
      }
    }
    S.gains = computeGains(S);
    progress('Prêt', 1);
    return S;
  }

  function levelHorizon(cams, rootCam) {
    const ring = cams.filter(c => {
      const z = [c.R[2], c.R[5], c.R[8]]; return true && z;
    });
    // vecteur « vertical » : direction la moins représentée par les axes x des captures
    const M = new Float64Array(9);
    for (const c of ring) {
      const x = [c.R[0], c.R[3], c.R[6]];
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) M[a * 3 + b] += x[a] * x[b];
    }
    const { values, vectors } = jacobiEigen(M, 3);
    let si = 0; for (let i = 1; i < 3; i++) if (values[i] < values[si]) si = i;
    let up = [vectors[si], vectors[3 + si], vectors[6 + si]];
    let s = 0; for (const c of ring) s += up[0] * c.R[1] + up[1] * c.R[4] + up[2] * c.R[7];
    if (s < 0) up = up.map(v => -v);  // monde y vers le bas, comme l'axe y des captures
    let z = [rootCam.R[2], rootCam.R[5], rootCam.R[8]];
    const dz = z[0] * up[0] + z[1] * up[1] + z[2] * up[2];
    z = [z[0] - dz * up[0], z[1] - dz * up[1], z[2] - dz * up[2]];
    const zn = Math.hypot(...z); z = z.map(v => v / zn);
    const x = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]];
    const W = Float64Array.of(x[0], x[1], x[2], up[0], up[1], up[2], z[0], z[1], z[2]);
    for (const c of cams) c.R = mul3(W, c.R);
  }

  // ------------------------------------------------------------------ rendu
  function camProjector(c, f, scale, w, h) {
    const Rt = T3(c.R), fs = f * scale, cx = w / 2, cy = h / 2;
    const corner = Math.atan(Math.hypot(w / 2, h / 2) / fs);
    const pl = c.planeC ? { x: c.planeC[0], y: c.planeC[1], z: c.planeC[2], side: c.poleSide } : null;
    return { Rt, fs, cx, cy, w, h, axis: [c.R[2], c.R[5], c.R[8]], cosLim: Math.cos(Math.min(corner + (pl ? 30 : 2) * DEG, 89 * DEG)), pl };
  }
  // projette une direction (depuis le centre du tour) dans une capture ; résultat dans PR
  const PR = { u: 0, v: 0, z: 0 };
  function project(p, dx, dy, dz) {
    let X = dx, Y = dy, Z = dz;
    const pl = p.pl;
    if (pl) {   // le plafond/sol est un plan à distance 1, vu depuis une caméra décalée
      const t = dy * pl.side;
      if (t <= 0.02) return false;
      X = dx / t - pl.x; Y = dy / t - pl.y; Z = dz / t - pl.z;
    }
    const Rt = p.Rt;
    const x = Rt[0] * X + Rt[1] * Y + Rt[2] * Z, y = Rt[3] * X + Rt[4] * Y + Rt[5] * Z, z = Rt[6] * X + Rt[7] * Y + Rt[8] * Z;
    if (z <= 1e-6) return false;
    PR.u = p.fs * x / z + p.cx; PR.v = p.fs * y / z + p.cy;
    PR.z = pl ? z / Math.sqrt(X * X + Y * Y + Z * Z) : z;
    return true;
  }
  function sampleGray(img, w, h, x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, i = y0 * w + x0;
    return (img[i] * (1 - fx) + img[i + 1] * fx) * (1 - fy) + (img[i + w] * (1 - fx) + img[i + w + 1] * fx) * fy;
  }
  // panorama en niveaux de gris des captures alignées (pour le placement du plafond/sol et les gains)
  function grayPano(S, W, H, filter) {
    const out = new Float32Array(W * H), mask = new Uint8Array(W * H);
    const cams = S.cams.filter(c => c.aligned && (!filter || filter(c)));
    const P = cams.map(c => camProjector(c, S.f * (c.fScale || 1), 1, c.aw, c.ah));
    for (let y = 0; y < H; y++) {
      const lat = Math.PI / 2 - (y + 0.5) / H * Math.PI, cl = Math.cos(lat), dy = -Math.sin(lat);
      for (let x = 0; x < W; x++) {
        const lon = (x + 0.5) / W * 2 * Math.PI - Math.PI, dx = cl * Math.sin(lon), dz = cl * Math.cos(lon);
        let best = -2, val = 0;
        for (let k = 0; k < P.length; k++) {
          const p = P[k], cz = p.axis[0] * dx + p.axis[1] * dy + p.axis[2] * dz;
          if (cz < p.cosLim) continue;
          if (!project(p, dx, dy, dz) || PR.z <= best) continue;
          const u = PR.u, v = PR.v;
          if (u < 1 || v < 1 || u > p.w - 2 || v > p.h - 2) continue;
          best = PR.z; val = sampleGray(cams[k].gray, p.w, p.h, u, v);
        }
        if (best > -2) { out[y * W + x] = val; mask[y * W + x] = 1; }
      }
    }
    return { gray: out, mask, W, H };
  }

  function poleTools(S, cam, sizes) {
    const g = gaussianBlur(cam.gray, cam.aw, cam.ah, 1.2);
    const camGrad = gradMag(g, cam.aw, cam.ah);
    const panos = {};
    for (const [W, H] of sizes) {
      const gp = grayPano(S, W, H, c => c !== cam && c.role !== 'up' && c.role !== 'down');
      const gg = gradMag(gaussianBlur(gp.gray, W, H, 1.0), W, H);
      panos[W] = { ...gp, grad: gg };
    }
    const base = side => side < 0
      ? Float64Array.of(1, 0, 0, 0, 0, -1, 0, 1, 0)    // regarde vers le haut : z_cam -> (0,-1,0)
      : Float64Array.of(1, 0, 0, 0, 0, 1, 0, -1, 0);   // regarde vers le bas : z_cam -> (0,1,0)
    // pixels de la calotte couverts par le tour
    const capPixels = (pano, side) => {
      const { W, H, mask, grad } = pano, dirs = [], vals = [];
      for (let y = 1; y < H - 1; y++) {
        const lat = Math.PI / 2 - (y + 0.5) / H * Math.PI;
        if (side < 0 ? lat < 15 * DEG : lat > -15 * DEG) continue;
        const cl = Math.cos(lat), dy = -Math.sin(lat);
        for (let x = 1; x < W - 1; x++) {
          if (!mask[y * W + x] || !mask[(y - 1) * W + x] || !mask[(y + 1) * W + x]) continue;
          const lon = (x + 0.5) / W * 2 * Math.PI - Math.PI;
          dirs.push(cl * Math.sin(lon), dy, cl * Math.cos(lon)); vals.push(grad[y * W + x]);
        }
      }
      return { dirs: Float32Array.from(dirs), vals: Float32Array.from(vals) };
    };
    const score = (cap, R, fscale, c, side) => {
      const Rt = T3(R), fs = S.f * fscale, cx = cam.aw / 2, cy = cam.ah / 2, w = cam.aw, h = cam.ah;
      let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
      const d = cap.dirs, v = cap.vals;
      for (let k = 0, q = 0; k < v.length; k++, q += 3) {
        let dx = d[q], dy = d[q + 1], dz = d[q + 2];
        if (c) { const t = dy * side; if (t <= 0.02) continue; dx = dx / t - c[0]; dy = dy / t - c[1]; dz = dz / t - c[2]; }
        const Z = Rt[6] * dx + Rt[7] * dy + Rt[8] * dz;
        if (Z <= 1e-6) continue;
        const u = fs * (Rt[0] * dx + Rt[1] * dy + Rt[2] * dz) / Z + cx, vv = fs * (Rt[3] * dx + Rt[4] * dy + Rt[5] * dz) / Z + cy;
        if (u < 2 || vv < 2 || u > w - 3 || vv > h - 3) continue;
        const a = sampleGray(camGrad, w, h, u, vv), b = v[k];
        n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b;
      }
      if (n < Math.max(150, v.length * 0.06)) return -1;
      const cov = sab - sa * sb / n, va = saa - sa * sa / n, vb = sbb - sb * sb / n;
      return cov / Math.sqrt(va * vb + 1e-9);
    };
    const make = (side, p) => mul3(base(side), rodrigues(p[0], p[1], p[2]));
    return { panos, capPixels, score, make };
  }

  async function solvePole(S, cam, progress) {
    const sides = cam.role === 'up' ? [-1] : cam.role === 'down' ? [1] : [-1, 1];
    const T = poleTools(S, cam, [[512, 256], [1024, 512]]);
    let best = { s: -2 };
    let step = 0; const steps = sides.length * 60;
    const MAXT = 24 * DEG;
    for (const side of sides) {
      const capC = T.capPixels(T.panos[512], side);
      const grid = [];
      for (let spin = 0; spin < 360; spin += 6) {
        let bestHere = null;
        for (let tx = -20; tx <= 20; tx += 4) for (let ty = -20; ty <= 20; ty += 4) {
          const p = [tx * DEG, ty * DEG, spin * DEG];
          const s = T.score(capC, T.make(side, p), 1);
          if (!bestHere || s > bestHere.s) bestHere = { s, p, side };
        }
        grid.push(bestHere);
        step++; if (step % 4 === 0) { progress(step / steps * 0.75); await tick(); }
      }
      // maxima locaux en rotation, puis affinage des meilleurs
      const peaks = grid.filter((g, i) => g.s >= grid[(i + 59) % 60].s && g.s >= grid[(i + 1) % 60].s).sort((a, b) => b.s - a.s);
      const capF = T.capPixels(T.panos[1024], side);
      for (const c of peaks.slice(0, 5)) {
        const fn = q => {
          if (Math.hypot(q[0], q[1]) > MAXT || Math.abs(q[3]) > 0.2) return 2;
          return -T.score(capF, T.make(side, q), Math.exp(q[3]));
        };
        let r = nelderMead(fn, [c.p[0], c.p[1], c.p[2], 0], [3 * DEG, 3 * DEG, 4 * DEG, 0.03], 180);
        r = nelderMead(fn, r.x, [1 * DEG, 1 * DEG, 1 * DEG, 0.01], 120);
        if (-r.f > best.s) best = { s: -r.f, p: r.x, side };
        await tick();
      }
    }
    // affinage : la caméra a pu bouger un peu (modèle « plan du sol/plafond »)
    // grille de départs sur le décalage horizontal, puis affinage complet
    const capP = T.capPixels(T.panos[1024], best.side), capQ = T.capPixels(T.panos[512], best.side);
    const okP = q => Math.hypot(q[0], q[1]) <= MAXT && Math.abs(q[3]) <= 0.25 && Math.hypot(q[4], q[5], q[6]) <= 0.6;
    let gbest = null;
    for (let cx = -0.3; cx <= 0.301; cx += 0.1) {
      for (let cz = -0.3; cz <= 0.301; cz += 0.1) {
        const fn = q => {
          const full = [q[0], q[1], q[2], q[3], cx, q[4], cz];
          return okP(full) ? -T.score(capQ, T.make(best.side, full), Math.exp(q[3]), [cx, q[4], cz], best.side) : 2;
        };
        const r = nelderMead(fn, [...best.p, 0], [1.5 * DEG, 1.5 * DEG, 1.5 * DEG, 0.015, 0.05], 70);
        if (!gbest || r.f < gbest.f) gbest = { f: r.f, x: [r.x[0], r.x[1], r.x[2], r.x[3], cx, r.x[4], cz] };
      }
      progress(0.8 + 0.15 * (cx + 0.3) / 0.6); await tick();
    }
    const fnP = q => okP(q) ? -T.score(capP, T.make(best.side, q), Math.exp(q[3]), [q[4], q[5], q[6]], best.side) : 2;
    let rp = nelderMead(fnP, gbest.x, [0.7 * DEG, 0.7 * DEG, 0.7 * DEG, 0.008, 0.03, 0.03, 0.03], 300);
    rp = nelderMead(fnP, rp.x, [0.3 * DEG, 0.3 * DEG, 0.3 * DEG, 0.004, 0.01, 0.01, 0.01], 200);
    const rotOnly = T.score(capP, T.make(best.side, best.p), Math.exp(best.p[3]), null, best.side);
    let planeC = null;
    if (-rp.f > rotOnly + 0.02) { best = { s: -rp.f, p: rp.x.slice(0, 4), side: best.side }; planeC = rp.x.slice(4, 7); }
    await tick();
    progress(1);
    cam.R = T.make(best.side, best.p);
    cam.fScale = Math.exp(best.p[3]);
    cam.planeC = planeC;
    cam.poleSide = best.side;
    cam.poleScore = best.s;
    cam.role = best.side < 0 ? 'up' : 'down';
    cam.aligned = best.s > 0.05;
    cam.active = cam.aligned;
    cam.auto = { R: cam.R, fScale: cam.fScale, planeC };
  }
  // pour les tests : score d'un placement donné
  function scorePole(S, index, R, fscale, W) {
    const cam = S.cams[index];
    const T = poleTools(S, cam, [[W, W / 2]]);
    const side = R[4] * 0 + (mv3(R, 0, 0, 1)[1] < 0 ? -1 : 1);
    return T.score(T.capPixels(T.panos[W], side), R, fscale, null, side);
  }

  function nelderMead(fn, x0, steps, maxIt) {
    const n = x0.length;
    let pts = [x0.slice()];
    for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += steps[i]; pts.push(p); }
    let vals = pts.map(fn);
    for (let it = 0; it < maxIt; it++) {
      const order = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
      pts = order.map(i => pts[i]); vals = order.map(i => vals[i]);
      const c = new Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += pts[i][j] / n;
      const refl = c.map((v, j) => v + (v - pts[n][j])), fr = fn(refl);
      if (fr < vals[0]) {
        const exp = c.map((v, j) => v + 2 * (v - pts[n][j])), fe = fn(exp);
        if (fe < fr) { pts[n] = exp; vals[n] = fe; } else { pts[n] = refl; vals[n] = fr; }
      } else if (fr < vals[n - 1]) { pts[n] = refl; vals[n] = fr; }
      else {
        const con = c.map((v, j) => v + 0.5 * (pts[n][j] - v)), fc = fn(con);
        if (fc < vals[n]) { pts[n] = con; vals[n] = fc; }
        else {
          for (let i = 1; i <= n; i++) { pts[i] = pts[i].map((v, j) => pts[0][j] + 0.5 * (v - pts[0][j])); vals[i] = fn(pts[i]); }
        }
      }
      if (Math.abs(vals[n] - vals[0]) < 1e-6) break;
    }
    let bi = 0; for (let i = 1; i <= n; i++) if (vals[i] < vals[bi]) bi = i;
    return { x: pts[bi], f: vals[bi] };
  }

  // gains d'exposition : grille 3x3 de facteurs par capture (corrige aussi les variations dans l'image)
  const GG = 3;
  function gridWeights(u, v, w, h, out) {   // poids bilinéaires des 9 nœuds pour le point (u, v)
    out.fill(0);
    const s = Math.max(0, Math.min(GG - 1 - 1e-9, u / (w - 1) * (GG - 1))), t = Math.max(0, Math.min(GG - 1 - 1e-9, v / (h - 1) * (GG - 1)));
    const i = Math.floor(s), j = Math.floor(t), fs = s - i, ft = t - j;
    out[j * GG + i] = (1 - fs) * (1 - ft); out[j * GG + i + 1] = fs * (1 - ft);
    out[(j + 1) * GG + i] = (1 - fs) * ft; out[(j + 1) * GG + i + 1] = fs * ft;
    return out;
  }
  function computeGains(S) {
    const cams = S.cams.filter(c => c.aligned);
    const n = cams.length, NG = GG * GG, P_ = n * NG, W = 256, H = 128;
    const P = cams.map(c => camProjector(c, S.f * (c.fScale || 1), 1, c.aw, c.ah));
    const A = new Float64Array(P_ * P_), b = new Float64Array(P_), nodeW = new Float64Array(P_);
    const wa = new Float64Array(NG), wb = new Float64Array(NG);
    const sN2 = 100;
    for (let y = 0; y < H; y++) {
      const lat = Math.PI / 2 - (y + 0.5) / H * Math.PI, cl = Math.cos(lat), dy = -Math.sin(lat);
      const area = cl;   // pondération par la surface réelle sur la sphère
      for (let x = 0; x < W; x++) {
        const lon = (x + 0.5) / W * 2 * Math.PI - Math.PI, dx = cl * Math.sin(lon), dz = cl * Math.cos(lon);
        const hits = [];
        for (let k = 0; k < n; k++) {
          const p = P[k], cz = p.axis[0] * dx + p.axis[1] * dy + p.axis[2] * dz;
          if (cz < p.cosLim || !project(p, dx, dy, dz)) continue;
          const u = PR.u, v = PR.v;
          if (u < 4 || v < 4 || u > p.w - 5 || v > p.h - 5) continue;
          const I = sampleGray(cams[k].gray, p.w, p.h, u, v);
          if (I > 245 || I < 4) continue;
          hits.push([k, I, u, v]);
        }
        for (let a = 0; a < hits.length; a++) for (let c = a + 1; c < hits.length; c++) {
          const [ka, Ia, ua, va] = hits[a], [kc, Ic, uc, vc] = hits[c];
          gridWeights(ua, va, P[ka].w, P[ka].h, wa); gridWeights(uc, vc, P[kc].w, P[kc].h, wb);
          // résidu : Σ wa Ia Ga - Σ wb Ic Gc
          const idx = [], val = [];
          for (let q = 0; q < NG; q++) {
            if (wa[q]) { idx.push(ka * NG + q); val.push(wa[q] * Ia); }
            if (wb[q]) { idx.push(kc * NG + q); val.push(-wb[q] * Ic); }
          }
          const wgt = area / sN2;
          for (let q = 0; q < NG; q++) { nodeW[ka * NG + q] += area * wa[q]; nodeW[kc * NG + q] += area * wb[q]; }
          for (let m = 0; m < idx.length; m++) for (let o = 0; o < idx.length; o++) A[idx[m] * P_ + idx[o]] += wgt * val[m] * val[o];
        }
      }
    }
    // a priori : gains proches de 1, et nœuds voisins proches entre eux
    // poids proportionnels à la quantité de données de chaque nœud (comme OpenCV) :
    // σ gain = 0,25 autour de 1, σ entre nœuds voisins = 0,08
    const sG2 = 0.3 * 0.3, sS2 = 0.2 * 0.2;
    for (let k = 0; k < n; k++) {
      for (let q = 0; q < NG; q++) { const d = k * NG + q, pr = nodeW[d] / sG2 + 1; A[d * P_ + d] += pr; b[d] += pr; }
      for (let j = 0; j < GG; j++) for (let i = 0; i < GG; i++) {
        const q = k * NG + j * GG + i;
        for (const r of [i + 1 < GG ? q + 1 : -1, j + 1 < GG ? q + GG : -1]) {
          if (r < 0) continue;
          const sm = (nodeW[q] + nodeW[r]) / 2 / sS2 + 1;
          A[q * P_ + q] += sm; A[r * P_ + r] += sm; A[q * P_ + r] -= sm; A[r * P_ + q] -= sm;
        }
      }
    }
    const g = solveLinear(A, b, P_);
    // recentre : la luminosité moyenne des captures du tour reste celle d'origine
    let mean = 1;
    if (g) {
      const ringVals = [];
      cams.forEach((c, k) => { if (c.role !== 'up' && c.role !== 'down') for (let q = 0; q < NG; q++) ringVals.push(g[k * NG + q]); });
      ringVals.sort((a, c) => a - c);
      if (ringVals.length) mean = ringVals[ringVals.length >> 1];
    }
    const gains = new Map();
    cams.forEach((c, k) => {
      const arr = new Float32Array(NG);
      for (let q = 0; q < NG; q++) arr[q] = g ? Math.max(0.4, Math.min(2.5, g[k * NG + q] / mean)) : 1;
      gains.set(c.index, arr);
    });
    return gains;
  }

  async function renderEquirect(S, W, progress) {
    progress = progress || (() => {});
    const H = W / 2;
    const cams = S.cams.filter(c => c.aligned);
    const P = cams.map(c => {
      const p = camProjector(c, S.f * (c.fScale || 1), S.scaleR / S.scaleA, c.rw, c.rh);
      p.rgba = c.rgba; p.gain = S.gains.get(c.index) || new Float32Array(GG * GG).fill(1); p.margin = Math.max(6, c.rw * 0.035);
      p.K = c.role === 'up' ? 12 : 30;   // fondu large pour le plafond (souvent uni)
      return p;
    });
    const out = new Uint8ClampedArray(W * H * 4), hole = new Uint8Array(W * H);
    const wts = new Float64Array(P.length), ths = new Float64Array(P.length), us = new Float64Array(P.length), vs = new Float64Array(P.length);
    for (let y = 0; y < H; y++) {
      const lat = Math.PI / 2 - (y + 0.5) / H * Math.PI, cl = Math.cos(lat), dy = -Math.sin(lat);
      for (let x = 0; x < W; x++) {
        const lon = (x + 0.5) / W * 2 * Math.PI - Math.PI, dx = cl * Math.sin(lon), dz = cl * Math.cos(lon);
        let thMin = 10, cnt = 0;
        for (let k = 0; k < P.length; k++) {
          wts[k] = 0;
          const p = P[k], cz = p.axis[0] * dx + p.axis[1] * dy + p.axis[2] * dz;
          if (cz < p.cosLim || !project(p, dx, dy, dz) || PR.z <= 0.05) continue;
          const u = PR.u, v = PR.v;
          if (u < 0.5 || v < 0.5 || u > p.w - 1.5 || v > p.h - 1.5) continue;
          const e = Math.min(u, v, p.w - 1 - u, p.h - 1 - v) / p.margin;
          const ef = e >= 1 ? 1 : e * e * (3 - 2 * e);
          const th = Math.acos(Math.min(1, PR.z));
          wts[k] = ef; ths[k] = th; us[k] = u; vs[k] = v;
          if (th < thMin) thMin = th;
          cnt++;
        }
        const o = (y * W + x) * 4;
        if (!cnt) { hole[y * W + x] = 1; out[o + 3] = 255; continue; }
        let r = 0, g = 0, b = 0, ws = 0;
        for (let k = 0; k < P.length; k++) {
          if (!wts[k]) continue;
          const wgt = wts[k] * Math.exp(-P[k].K * (ths[k] - thMin));
          if (wgt < 1e-4) continue;
          const p = P[k], u = us[k], v = vs[k];
          const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0, i = (y0 * p.w + x0) * 4, j = i + p.w * 4;
          const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy, d = p.rgba;
          const gs = Math.min(GG - 1 - 1e-9, u / (p.w - 1) * (GG - 1)), gt = Math.min(GG - 1 - 1e-9, v / (p.h - 1) * (GG - 1));
          const gi = gs | 0, gj = gt | 0, gfs = gs - gi, gft = gt - gj, G = p.gain;
          const gain = (G[gj * GG + gi] * (1 - gfs) + G[gj * GG + gi + 1] * gfs) * (1 - gft) + (G[(gj + 1) * GG + gi] * (1 - gfs) + G[(gj + 1) * GG + gi + 1] * gfs) * gft;
          const gk = gain * wgt;
          r += gk * (d[i] * w00 + d[i + 4] * w10 + d[j] * w01 + d[j + 4] * w11);
          g += gk * (d[i + 1] * w00 + d[i + 5] * w10 + d[j + 1] * w01 + d[j + 5] * w11);
          b += gk * (d[i + 2] * w00 + d[i + 6] * w10 + d[j + 2] * w01 + d[j + 6] * w11);
          ws += wgt;
        }
        out[o] = r / ws; out[o + 1] = g / ws; out[o + 2] = b / ws; out[o + 3] = 255;
      }
      if (y % 32 === 31) { progress((y + 1) / H); await tick(); }
    }
    fillHoles(out, hole, W, H);
    return { data: out, width: W, height: H, holes: hole };
  }

  // bandes non couvertes : mélange vertical entre le haut et le bas, puis adoucissement horizontal
  function fillHoles(out, hole, W, H) {
    let any = false; for (let i = 0; i < hole.length; i++) if (hole[i]) { any = true; break; }
    if (!any) return;
    const k = Math.max(2, W >> 10);
    const fill = new Float32Array(W * H * 3);
    for (let x = 0; x < W; x++) {
      let y = 0;
      while (y < H) {
        if (!hole[y * W + x]) { y++; continue; }
        let y1 = y; while (y1 < H && hole[y1 * W + x]) y1++;
        const avg = (ya, yb) => {
          const c = [0, 0, 0]; let n = 0;
          for (let yy = Math.max(0, ya); yy < Math.min(H, yb); yy++) { if (hole[yy * W + x]) continue; const o = (yy * W + x) * 4; c[0] += out[o]; c[1] += out[o + 1]; c[2] += out[o + 2]; n++; }
          return n ? c.map(v => v / n) : null;
        };
        let top = y > 0 ? avg(y - 2 * k, y) : null, bot = y1 < H ? avg(y1, y1 + 2 * k) : null;
        if (!top) top = bot; if (!bot) bot = top; if (!top) top = bot = [90, 90, 90];
        for (let yy = y; yy < y1; yy++) {
          const t = (yy - y + 0.5) / (y1 - y), q = (yy * W + x) * 3;
          fill[q] = top[0] * (1 - t) + bot[0] * t; fill[q + 1] = top[1] * (1 - t) + bot[1] * t; fill[q + 2] = top[2] * (1 - t) + bot[2] * t;
        }
        y = y1;
      }
    }
    // adoucissement horizontal (circulaire) à l'intérieur des trous, plus fort près des pôles
    const tmp = new Float32Array(W * 3);
    for (let y = 0; y < H; y++) {
      let rowHas = false; for (let x = 0; x < W; x++) if (hole[y * W + x]) { rowHas = true; break; }
      if (!rowHas) continue;
      const lat = Math.abs(90 - (y + 0.5) / H * 180);
      const r = Math.min(W / 4, Math.round((W / 200) / Math.max(0.05, Math.cos(lat * DEG))));
      // somme glissante circulaire
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let x = -r; x <= r; x++) s += fill[(y * W + ((x + W) % W)) * 3 + c];
        for (let x = 0; x < W; x++) {
          tmp[x * 3 + c] = s / (2 * r + 1);
          s += fill[(y * W + ((x + r + 1) % W)) * 3 + c] - fill[(y * W + ((x - r + W) % W)) * 3 + c];
        }
      }
      for (let x = 0; x < W; x++) {
        if (!hole[y * W + x]) continue;
        const o = (y * W + x) * 4;
        out[o] = tmp[x * 3]; out[o + 1] = tmp[x * 3 + 1]; out[o + 2] = tmp[x * 3 + 2];
      }
    }
    // fondu sur 3 px autour des trous
    const near = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (hole[y * W + x]) continue;
      for (let d = 1; d <= 3; d++) {
        if ((y - d >= 0 && hole[(y - d) * W + x]) || (y + d < H && hole[(y + d) * W + x])) { near[y * W + x] = d; break; }
      }
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = near[y * W + x]; if (!d) continue;
      const a = 0.5 * (1 - (d - 1) / 3), o = (y * W + x) * 4;
      const yy = hole[(Math.max(0, y - d)) * W + x] ? Math.max(0, y - d) : Math.min(H - 1, y + d), q = (yy * W + x) * 4;
      out[o] = out[o] * (1 - a) + out[q] * a; out[o + 1] = out[o + 1] * (1 - a) + out[q + 1] * a; out[o + 2] = out[o + 2] * (1 - a) + out[q + 2] * a;
    }
  }

  // réglage manuel d'une capture plafond/sol : décalages par rapport au placement automatique
  function adjustPole(S, index, adj) {
    const c = S.cams[index];
    if (!c || !c.auto) return;
    const side = c.poleSide || (c.role === 'up' ? -1 : 1);
    const R = mul3(c.auto.R, rodrigues(adj.tiltX * DEG, adj.tiltY * DEG, adj.spin * DEG));
    c.R = R; c.fScale = c.auto.fScale * (1 + (adj.zoom || 0) / 100); c.planeC = c.auto.planeC || null;
    c.aligned = true; c.active = true; c.poleSide = side;
    S.gains = computeGains(S);
  }
  // change le rôle d'une capture : 'up' / 'down' (relance le placement), 'ignore', ou 'ring' (aligne sur ses voisines)
  async function setPoleRole(S, index, role, progress) {
    const c = S.cams[index];
    progress = progress || (() => {});
    c.planeC = null; c.fScale = 1;
    if (role === 'ignore') { c.role = 'ignore'; c.aligned = false; c.active = false; }
    else if (role === 'up' || role === 'down') {
      c.role = role; c.aligned = false; c.active = false;
      await solvePole(S, c, progress);
      c.aligned = true; c.active = true;
    } else if (role === 'ring') {
      c.role = 'auto';
      // voisine alignée la plus proche dans l'ordre de prise de vue
      const order = S.cams.filter(x => x.role !== 'ignore');
      const k = order.indexOf(c);
      let done = false;
      for (const d of [-1, 1, -2, 2]) {
        const n = order[k + d];
        if (!n || !n.aligned || n.role === 'up' || n.role === 'down') continue;
        const r = d < 0 ? alignDirect(n, c, S.f) : alignDirect(c, n, S.f);
        if (!r || r.score < 0.2) continue;
        c.R = d < 0 ? mul3(n.R, r.R) : mul3(n.R, T3(r.R));
        c.aligned = true; c.active = true; done = true; break;
      }
      if (!done) { c.aligned = false; c.active = false; }
    }
    S.gains = computeGains(S);
    return c.aligned;
  }

  function summary(S) {
    return S.cams.map(c => {
      const z = [c.R[2], c.R[5], c.R[8]];
      return {
        name: c.name, role: c.role, aligned: c.aligned,
        yaw: Math.round(Math.atan2(z[0], z[2]) / DEG * 10) / 10, pitch: Math.round(Math.asin(-z[1]) / DEG * 10) / 10,
        poleScore: c.poleScore
      };
    });
  }

  global.Stitcher = { prepare, renderEquirect, adjustPole, setPoleRole, summary, _scorePole: scorePole, _poleTools: poleTools, _match: matchFeatures, _ransac: ransacHomography, _nm: nelderMead, _rod: rodrigues, _mul: mul3, _T: T3 };
})(typeof window !== 'undefined' ? window : self);
