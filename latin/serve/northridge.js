/*
 * Northridge past the first few blocks, to about a mile out: real street plan, building outlines and heights, names and addresses
 * from OpenStreetMap, on the USDA NAIP aerial. Walls and windows are generated: no one has measured those.
 * Built a tile at a time as you come near, so that serving Mass never pays for it.
 */
(function (root) {
  'use strict';
  const THREE = root.THREE, Plan = root.Plan, Tex = root.Tex, Data = root.WideData, Inner = root.SiteData, Q = root.Quality, Aerial = root.AerialWide;
  const rng = seed => { let s = (seed % 2147483646) + 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
  const TILE = (root.WideData && root.WideData.tile) || 280;
  // how far you can see, by detail level: what is built must always reach into the haze
  const RANGE = { low: [520, 680], medium: [850, 1050], high: [1300, 1600], ultra: [1700, 2100] };
  const SIGN_NEAR = 320, SIGN_FAR = 480;

  function polygon(flat) {
    const p = []; for (let i = 0; i < flat.length; i += 2) p.push([flat[i], flat[i + 1]]);
    let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; }
    return { pts: a < 0 ? p.reverse() : p, area: Math.abs(a) / 2 };
  }
  function inPoly(p, x, z) {
    let c = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
    return c;
  }

  // ─── geometry, by the triangle ─────────────────────────────────────────────
  class Mesher {
    constructor() { this.sets = new Map(); }
    set(mat) { let s = this.sets.get(mat); if (!s) this.sets.set(mat, s = { pos: [], nor: [], uv: [], col: mat.vertexColors ? [] : null }); return s; }
    tri(mat, a, b, c, ua, ub, uc, color) {
      const s = this.set(mat);
      const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2], fx = c[0] - a[0], fy = c[1] - a[1], fz = c[2] - a[2];
      let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
      s.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      s.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
      s.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
      if (s.col) { const k = color || WHITE; s.col.push(k.r, k.g, k.b, k.r, k.g, k.b, k.r, k.g, k.b); }
    }
    /** A triangle with its own normals at the corners: for the laser's surfaces, which should look soft. */
    triN(mat, a, b, c, ua, ub, uc, na, nb, nc) {
      const s = this.set(mat);
      s.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      s.nor.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
      s.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
    }
    /** A wall from a to b, whose outside is to (dz, -dx). */
    wall(mat, ax, az, bx, bz, y0, y1, u0, u1, v0, v1, color) {
      const A = [ax, y0, az], B = [bx, y0, bz], C = [bx, y1, bz], D = [ax, y1, az];
      this.tri(mat, A, D, C, [u0, v0], [u0, v1], [u1, v1], color);
      this.tri(mat, A, C, B, [u0, v0], [u1, v1], [u1, v0], color);
    }
    /** A triangle turned to face the sky, with its texture lying flat. */
    up(mat, a, b, c, color, k = 2.2) {
      const y = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      if (y < 0) { const t = b; b = c; c = t; }
      this.tri(mat, a, b, c, [a[0] / k, a[2] / k], [b[0] / k, b[2] / k], [c[0] / k, c[2] / k], color);
    }
    /** A box turned by ry, without a floor. */
    box(mat, x, y, z, w, h, d, ry, color) {
      const c = Math.cos(ry || 0), s = Math.sin(ry || 0), P = (a, b) => [x + a * c + b * s, z - a * s + b * c];
      const q = [P(-w / 2, -d / 2), P(w / 2, -d / 2), P(w / 2, d / 2), P(-w / 2, d / 2)];
      // walk round so each wall's outside is out
      for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; this.wall(mat, a[0], a[1], b[0], b[1], y - h / 2, y + h / 2, 0, Math.hypot(b[0] - a[0], b[1] - a[1]), 0, h, color); }
      const T = v => [v[0], y + h / 2, v[1]];
      this.up(mat, T(q[0]), T(q[1]), T(q[2]), color); this.up(mat, T(q[0]), T(q[2]), T(q[3]), color);
    }
    cyl(mat, x, y0, y1, z, r0, r1 = r0, seg = 7, color) {
      for (let i = 0; i < seg; i++) {
        const a0 = i / seg * 6.283185, a1 = (i + 1) / seg * 6.283185, ca = Math.cos(a0), sa = Math.sin(a0), cb = Math.cos(a1), sb = Math.sin(a1);
        const A = [x + ca * r0, y0, z + sa * r0], B = [x + cb * r0, y0, z + sb * r0], C = [x + cb * r1, y1, z + sb * r1], D = [x + ca * r1, y1, z + sa * r1];
        this.tri(mat, A, D, C, [0, 0], [0, 1], [1, 1], color); this.tri(mat, A, C, B, [0, 0], [1, 1], [1, 0], color);
      }
    }
    flush(parent, shadow) {
      for (const [mat, s] of this.sets) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(s.nor, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(s.uv, 2));
        if (s.col) g.setAttribute('color', new THREE.Float32BufferAttribute(s.col, 3));
        const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false;
        if (mat.userData.layer != null) m.renderOrder = mat.userData.layer;
        else { m.castShadow = !!shadow; m.receiveShadow = true; }
        parent.add(m);
      }
      this.sets.clear();
    }
  }
  const WHITE = new THREE.Color(0xffffff);

  // ─── what walls look like: a repeating strip of bays, one storey high, tinted by the building's colour ─────
  function facades(W) {
    const noise = (g, w, h, n, a) => { const r = rng(n); for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${a * r()})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2); } };
    /** Draw a facade; `pane` also notes each window, so that some can be lit after dark. */
    const mk = (seed, draw) => {
      const panes = [], r = rng(seed * 991 + 7);
      const pane = (g, x, y, w, h, frame = '#e8e4da', fr = 5) => {
        panes.push([x, y, w, h]);
        g.fillStyle = frame; g.fillRect(x - fr, y - fr, w + 2 * fr, h + 2 * fr);
        const grad = g.createLinearGradient(0, y, 0, y + h); grad.addColorStop(0, '#8aa0ae'); grad.addColorStop(0.55, '#55687a'); grad.addColorStop(1, '#2e3a44');
        g.fillStyle = grad; g.fillRect(x, y, w, h);
        g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
        g.fillStyle = 'rgba(255,255,255,.1)'; g.beginPath(); g.moveTo(x + w * 0.1, y + h); g.lineTo(x + w * 0.45, y); g.lineTo(x + w * 0.72, y); g.lineTo(x + w * 0.37, y + h); g.fill();
        if (r() < 0.35) { g.fillStyle = 'rgba(232,226,210,.8)'; g.fillRect(x, y, w, h * (0.2 + r() * 0.3)); }
        g.restore();
      };
      const t = W.canvasTex(1024, 256, (g, w, h) => draw(g, w, h, pane)); t.anisotropy = 4;
      const glow = W.canvasTex(512, 128, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 512, 128); for (const [x, y, w, hh] of panes) if (r() < 0.45) { g.fillStyle = r() < 0.7 ? '#ffc877' : r() < 0.5 ? '#ffe2a8' : '#cfe0ff'; g.fillRect(x / 2, y / 2, w / 2, hh / 2); } });
      return new THREE.MeshStandardMaterial({ map: t, vertexColors: true, roughness: 0.85, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0 });
    };
    const stucco = (g, w, h, tone = '#f2efe8') => { g.fillStyle = tone; g.fillRect(0, 0, w, h); noise(g, w, h, 5000, 0.05); };
    const siding = (g, w, h, gap = 20) => { g.fillStyle = 'rgba(0,0,0,.13)'; for (let y = 0; y < h; y += gap) g.fillRect(0, y, w, 2); };
    const shutters = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x - 28, y, 20, h); g.fillRect(x + w + 8, y, 20, h); g.fillStyle = 'rgba(0,0,0,.2)'; for (let k = 0; k < 8; k++) { g.fillRect(x - 28, y + k * h / 8, 20, 1.5); g.fillRect(x + w + 8, y + k * h / 8, 20, 1.5); } };
    const H = (id, floor, bay, draw) => ({ id, bay, floor, mat: mk(id.charCodeAt(0) * 31 + id.charCodeAt(1), draw) });
    return {
      // Valley houses of the fifties and sixties, and some later ones
      h: [
        H('h1', 2.7, 3.3, (g, w, h, pane) => { stucco(g, w, h); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, h - 10, w, 10); pane(g, 40, 70, 176, 110); g.fillStyle = '#e8e4da'; g.fillRect(126, 70, 5, 110); pane(g, 560, 90, 70, 80); pane(g, 800, 62, 130, 124); g.fillStyle = '#e8e4da'; g.fillRect(800, 122, 130, 5); }),
        // a brick wainscot under long sliding windows
        H('h2', 2.7, 3.3, (g, w, h, pane) => { stucco(g, w, h); g.fillStyle = '#8f5a44'; g.fillRect(0, 176, w, 80); g.fillStyle = 'rgba(40,20,10,.35)'; for (let y = 176; y < h; y += 9) { g.fillRect(0, y, w, 1.5); for (let x = (y % 18 ? 0 : 12); x < w; x += 24) g.fillRect(x, y, 1.5, 9); } g.fillStyle = '#d8d3c6'; g.fillRect(0, 172, w, 5); pane(g, 50, 58, 200, 108, '#c8c4b8'); pane(g, 660, 58, 200, 108, '#c8c4b8'); }),
        // painted lap siding and shutters
        H('h3', 2.7, 3.3, (g, w, h, pane) => { stucco(g, w, h); siding(g, w, h); for (const x of [90, 610]) { pane(g, x, 66, 120, 118, '#fbf9f4'); shutters(g, x, 66, 120, 118, '#3c4a52'); g.fillStyle = '#fbf9f4'; g.fillRect(x + 58, 66, 4, 118); g.fillRect(x, 123, 120, 4); } }),
        // Spanish: thick plaster, an arched window, wrought iron
        H('h4', 2.8, 3.6, (g, w, h, pane) => { stucco(g, w, h, '#f4ead8'); noise(g, w, h, 3000, 0.08); for (const x of [110, 640]) { g.save(); g.beginPath(); g.moveTo(x, 190); g.lineTo(x, 100); g.arc(x + 60, 100, 60, Math.PI, 0); g.lineTo(x + 120, 190); g.closePath(); g.clip(); pane(g, x, 38, 120, 152, '#d4c2a4', 0); g.restore(); g.strokeStyle = '#1e1a16'; g.lineWidth = 3; for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x + k * 30, 192); g.lineTo(x + k * 30, 110); g.stroke(); } g.fillStyle = '#1e1a16'; g.fillRect(x - 8, 190, 136, 5); } }),
        // board and batten over a stone base
        H('h5', 2.7, 3.3, (g, w, h, pane) => { stucco(g, w, h, '#ece8de'); g.fillStyle = 'rgba(0,0,0,.14)'; for (let x = 0; x < w; x += 42) g.fillRect(x, 0, 4, 190); g.fillStyle = '#9b9486'; g.fillRect(0, 190, w, 66); const r = rng(77); for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${40 + r() * 90},${40 + r() * 80},${36 + r() * 70},.45)`; g.fillRect(r() * w, 190 + r() * 60, 14 + r() * 26, 7 + r() * 9); } pane(g, 100, 60, 150, 112, '#2e2c28'); pane(g, 620, 60, 90, 112, '#2e2c28'); }),
        // a plain modern house: big dark-framed windows
        H('h6', 2.9, 3.6, (g, w, h, pane) => { stucco(g, w, h, '#e6e4dc'); pane(g, 26, 34, 228, 196, '#23252a', 4); g.fillStyle = '#23252a'; g.fillRect(138, 34, 4, 196); pane(g, 580, 80, 110, 80, '#23252a', 4); }),
      ],
      a: [
        H('a1', 3, 3.8, (g, w, h, pane) => { stucco(g, w, h, '#efeadf'); g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(0, 0, w, 7); for (let i = 0; i < 4; i++) { const x = i * 256; if (i % 2) { pane(g, x + 60, 52, 136, 184); g.fillStyle = '#39352e'; g.fillRect(x + 42, 150, 172, 6); for (let k = 0; k < 13; k++) g.fillRect(x + 46 + k * 13.5, 150, 3, 86); } else pane(g, x + 62, 74, 132, 112); } }),
        // an older block with a walkway along each floor
        H('a2', 2.9, 3.4, (g, w, h, pane) => { stucco(g, w, h, '#e8dfcd'); g.fillStyle = '#7a6a56'; g.fillRect(0, 214, w, 12); g.fillStyle = '#403830'; for (let x = 0; x < w; x += 18) g.fillRect(x, 170, 3, 44); g.fillRect(0, 166, w, 5); for (let i = 0; i < 4; i++) { pane(g, i * 256 + 40, 54, 100, 96); g.fillStyle = '#6a4630'; g.fillRect(i * 256 + 170, 44, 56, 170); } }),
        // newer: bays in two colours
        H('a3', 3.2, 4.2, (g, w, h, pane) => { stucco(g, w, h, '#f0ece2'); g.fillStyle = 'rgba(70,74,84,.5)'; g.fillRect(0, 0, 256, h); g.fillRect(512, 0, 256, h); for (let i = 0; i < 4; i++) { pane(g, i * 256 + 40, 44, 80, 170, '#2a2c30', 3); pane(g, i * 256 + 134, 44, 80, 170, '#2a2c30', 3); } }),
      ],
      c: [
        H('c1', 4.2, 5, (g, w, h, pane) => { stucco(g, w, h, '#e8e2d4'); for (let i = 0; i < 4; i++) { pane(g, i * 256 + 16, 72, 224, 170, '#4a4a4a'); g.fillStyle = '#4a4a4a'; g.fillRect(i * 256 + 124, 72, 6, 170); } g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, 44, w, 8); }),
        H('c2', 3.6, 5, (g, w, h, pane) => { g.fillStyle = '#9a6650'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(40,20,10,.3)'; for (let y = 0; y < h; y += 10) { g.fillRect(0, y, w, 1.5); for (let x = (y % 20 ? 0 : 14); x < w; x += 28) g.fillRect(x, y, 1.5, 10); } for (let i = 0; i < 4; i++) pane(g, i * 256 + 40, 60, 176, 130, '#e6e2d6'); }),
        H('c3', 3.8, 6, (g, w, h, pane) => { g.fillStyle = '#c8ccd0'; g.fillRect(0, 0, w, h); for (let i = 0; i < 4; i++) pane(g, i * 256 + 6, 26, 244, 200, '#6a7076', 3); g.fillStyle = '#6a7076'; for (let x = 0; x < w; x += 64) g.fillRect(x, 26, 3, 200); }),
      ],
      u: [
        H('u1', 3.9, 6, (g, w, h, pane) => { stucco(g, w, h, '#ded9cc'); for (let i = 0; i < 4; i++) { pane(g, i * 256 + 30, 72, 196, 118, '#c8c2b4'); g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(i * 256 + 2, 0, 10, h); g.fillStyle = '#c8c2b4'; for (let k = 1; k < 4; k++) g.fillRect(i * 256 + 30 + k * 49, 72, 4, 118); } }),
        H('u2', 3.9, 5, (g, w, h, pane) => { g.fillStyle = '#a56a4e'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(40,20,10,.26)'; for (let y = 0; y < h; y += 10) g.fillRect(0, y, w, 1.5); for (let i = 0; i < 4; i++) { g.fillStyle = '#e4dfd2'; g.fillRect(i * 256, 0, 256, 24); pane(g, i * 256 + 60, 54, 136, 150, '#3a3a3a', 4); } }),
        H('u3', 3.9, 4.5, (g, w, h, pane) => { g.fillStyle = '#d4d8da'; g.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) pane(g, i * 128 + 8, 20, 112, 216, '#7a8086', 3); }),
      ],
      s: [
        H('s1', 3.7, 4, (g, w, h, pane) => { stucco(g, w, h, '#e6dcc6'); g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(0, 196, w, 60); for (let i = 0; i < 4; i++) { if (i === 2) continue; pane(g, i * 256 + 44, 50, 168, 138, '#d8d3c4'); g.fillStyle = '#d8d3c4'; g.fillRect(i * 256 + 124, 50, 5, 138); g.fillRect(i * 256 + 44, 110, 168, 4); } }),
        H('s2', 3.7, 4, (g, w, h, pane) => { g.fillStyle = '#b58a64'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,.2)'; for (let y = 0; y < h; y += 10) g.fillRect(0, y, w, 1.2); for (let i = 0; i < 4; i++) pane(g, i * 256 + 28, 44, 200, 124, '#e6e2d6'); g.fillStyle = '#efe8d8'; g.fillRect(0, 186, w, 8); }),
      ],
    };
  }
  /** Which facade: a real hint where there is one, the roof's own colour; otherwise the building's number decides. */
  function facadeFor(F, b) {
    const k = b.k === 'o' ? 'c' : b.k;
    const list = F[k] || F.c, r = (b.c >> 16) & 255, g = (b.c >> 8) & 255, bl = b.c & 255;
    if (k === 'h' && r > g * 1.18 && r > bl * 1.3) return F.h[3];      // a clay-tile roof goes with plaster and arches
    return list[(b.i * 2654435761 >>> 7) % list.length];
  }
  /** Doors and garage doors for the street side of a house. */
  function detailMat(W) {
    const t = W.canvasTex(512, 256, (g) => {
      const door = (x, base, glass) => {
        g.fillStyle = base; g.fillRect(x, 0, 128, 256);
        g.fillStyle = 'rgba(0,0,0,.2)'; for (const [a, b, c, d] of [[20, 24, 36, 80], [72, 24, 36, 80], [20, 130, 36, 100], [72, 130, 36, 100]]) g.fillRect(x + a, b, c, d);
        g.fillStyle = '#c8b070'; g.beginPath(); g.arc(x + 110, 128, 6, 0, 7); g.fill();
        if (glass) { g.fillStyle = '#1d262c'; g.fillRect(x + 36, 30, 56, 56); }
      };
      door(0, '#5a3517'); door(128, '#7a2522', true);
      g.fillStyle = '#e4e0d4'; g.fillRect(256, 0, 256, 256);
      g.strokeStyle = '#aaa698'; g.lineWidth = 3; for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(256, k * 64); g.lineTo(512, k * 64); g.stroke(); }
      g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 2; for (let row = 0; row < 4; row++) for (let k = 0; k < 6; k++) g.strokeRect(264 + k * 41, row * 64 + 10, 34, 44);
    });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  }

  // ─── street signs ──────────────────────────────────────────────────────────
  const short = n => n.replace(/\bStreet\b/, 'St').replace(/\bAvenue\b/, 'Ave').replace(/\bBoulevard\b/, 'Blvd').replace(/\bDrive\b/, 'Dr').replace(/\bPlace\b/, 'Pl').replace(/\bLane\b/, 'Ln').replace(/\bRoad\b/, 'Rd').replace(/\bCourt\b/, 'Ct');
  /** Every street's name on one sheet, so that a blade is two triangles. */
  function bladeAtlas(W) {
    const names = [...new Set(Data.blades.flatMap(b => [b.a, b.b]))], cell = {}, CW = 512, CH = 64;
    const t = W.canvasTex(2048, 2048, (g) => {
      g.textBaseline = 'middle'; g.textAlign = 'center';
      names.forEach((n, i) => {
        const x = (i % 4) * CW, y = Math.floor(i / 4) * CH, s = short(n);
        g.fillStyle = '#123f84'; g.fillRect(x, y, CW, CH);
        g.strokeStyle = '#f2f4f6'; g.lineWidth = 3; g.strokeRect(x + 4, y + 4, CW - 8, CH - 8);
        let size = 44; g.font = `700 ${size}px Arial, Helvetica, sans-serif`;
        while (g.measureText(s).width > CW - 30 && size > 16) { size -= 2; g.font = `700 ${size}px Arial, Helvetica, sans-serif`; }
        g.fillStyle = '#ffffff'; g.fillText(s, x + CW / 2, y + CH / 2 + 2);
        cell[n] = [x / 2048, 1 - (y + CH) / 2048, (x + CW) / 2048, 1 - y / 2048];
      });
    });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 8;
    return { mat: new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }), cell };
  }
  const SHOP = [['#1a2a44', '#ffffff'], ['#7a1f1c', '#fff6e8'], ['#14432e', '#ffffff'], ['#22242a', '#ffd76a'], ['#f4f1e8', '#1a1a1a'], ['#233b6e', '#ffffff']];
  const CHAIN = { "McDonald's": ['#c8102e', '#ffc72c'], 'Taco Bell': ['#702082', '#ffffff'], 'Starbucks': ['#00704a', '#ffffff'], '7-Eleven': ['#00794b', '#ffffff'], '76': ['#f47321', '#ffffff'], 'Chevron': ['#0054a4', '#ffffff'], 'Mobil': ['#ffffff', '#0a4ea2'], 'Mobil Mart': ['#ffffff', '#0a4ea2'], 'El Pollo Loco': ['#d6001c', '#ffffff'], 'Panda Express': ['#b81d24', '#ffffff'], 'Subway': ['#008c15', '#ffc600'], 'Wells Fargo': ['#d71e28', '#ffcd41'], 'Jiffy Lube': ['#e31837', '#ffffff'], 'Baskin-Robbins': ['#da1884', '#ffffff'], "Papa John's": ['#007a33', '#ffffff'], 'Kumon': ['#005ba9', '#ffffff'], 'Juice It Up!': ['#7ab51d', '#ffffff'], 'Shake Smart': ['#111111', '#ffffff'] };
  const hash = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
  /** A sign's face: the real name, in lettering of our own (nobody's logo). Returns the material and its shape. */
  function signFace(W, s) {
    const big = 56, lines = [];
    const words = s.n.split(' ');
    if (s.n.length > 26) { let a = '', i = 0; while (i < words.length && (a + words[i]).length < s.n.length * 0.55) a += (a ? ' ' : '') + words[i++]; lines.push(a, words.slice(i).join(' ')); } else lines.push(s.n);
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = `700 ${big}px Arial, Helvetica, sans-serif`;
    const tw = Math.min(1000, Math.max(...lines.map(l => probe.measureText(l).width))) + 64, th = lines.length * 70 + (s.k === 'bus' ? 58 : 24);
    const CW = Math.ceil(tw), CHt = Math.ceil(th);
    let bg, fg, border = null;
    if (s.k === 'shop' || s.k === 'civic') { const brand = CHAIN[s.n]; if (brand) [bg, fg] = brand; else if (s.k === 'shop') [bg, fg] = SHOP[hash(s.n) % SHOP.length]; else { bg = '#ece6d6'; fg = '#22262c'; border = '#8c8676'; } }
    else if (s.k === 'uni') { bg = '#2a2c30'; fg = '#f0ece2'; }
    else if (s.k === 'num') { bg = '#f4f1e8'; fg = '#141414'; border = '#55524a'; }
    else if (s.k === 'lot') { bg = '#1f4d9a'; fg = '#ffffff'; border = '#ffffff'; }
    else if (s.k === 'bus') { bg = '#f4f6f8'; fg = '#10253f'; border = '#123f84'; }
    else { bg = '#ece6d6'; fg = '#22262c'; border = '#8c8676'; }
    const t = W.canvasTex(CW, CHt, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      if (border) { g.strokeStyle = border; g.lineWidth = 5; g.strokeRect(5, 5, w - 10, h - 10); }
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${big}px Arial, Helvetica, sans-serif`;
      let y = s.k === 'bus' ? 58 : 12;
      if (s.k === 'bus') { g.fillStyle = '#123f84'; g.fillRect(0, 0, w, 50); g.fillStyle = '#fff'; g.font = '700 34px Arial, Helvetica, sans-serif'; g.fillText('BUS', w / 2, 26); g.fillStyle = fg; g.font = `700 ${big}px Arial, Helvetica, sans-serif`; }
      for (const l of lines) { g.fillText(l, w / 2, y + 35, w - 24); y += 70; }
    });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 8;
    return { mat: new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), aspect: CW / CHt, t };
  }

  // ─── all of it ─────────────────────────────────────────────────────────────
  function build(scene, W, out) {
    const group = new THREE.Group(); out.group.add(group);
    const M = W.M, level = Q.level, [range, fogFar] = RANGE[level] || RANGE.medium;
    const key = (x, z) => Math.floor(x / TILE) + ',' + Math.floor(z / TILE);
    const tiles = new Map(), RADII = { low: 0, medium: 260, high: 420, ultra: 560 }, nearR = RADII[level] || 0, roofStep = level === 'ultra' ? 1 : level === 'high' ? 1 : 2;
    const tile = (x, z) => { const k = key(x, z); let t = tiles.get(k); if (!t) { const [a, b] = k.split(',').map(Number); tiles.set(k, t = { x: (a + 0.5) * TILE, z: (b + 0.5) * TILE, buildings: [], roads: [], signs: [], blades: [], stops: [], signals: [], lamps: [], hydrants: [], touch: [], roadsNear: [], moreLamps: [], group: null, signGroup: null, built: false, i: a, j: b, solid: null, near: null, data: null, loading: false, heights: null, tex: null }); } return t; };
    for (let i = Math.floor(-1700 / TILE); i <= Math.floor(1700 / TILE); i++) for (let j = Math.floor(-1680 / TILE); j <= Math.floor(1720 / TILE); j++) tile((i + 0.5) * TILE, (j + 0.5) * TILE);
    // ── who stands where ──
    const CELL = 24, solids = new Map();
    const solidHas = (x, z) => { const l = solids.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)); if (!l) return false; for (const p of l) if (inPoly(p, x, z)) return true; return false; };
    Data.buildings.forEach((b, i) => {
      const { pts, area } = polygon(b.p); b.pts = pts; b.area = area; b.i = i;
      let cx = 0, cz = 0; for (const p of pts) { cx += p[0]; cz += p[1]; }
      tile(cx / pts.length, cz / pts.length).buildings.push(b);
      if (b.k === 'r') return;
      const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
      for (let g = Math.floor(Math.min(...xs) / CELL); g <= Math.floor(Math.max(...xs) / CELL); g++) for (let h = Math.floor(Math.min(...zs) / CELL); h <= Math.floor(Math.max(...zs) / CELL); h++) {
        const k = g + ',' + h; if (!solids.has(k)) solids.set(k, []); solids.get(k).push(pts);
      }
    });
    for (const r of Data.roads) { const m = Math.floor(r.p.length / 4) * 2; tile(r.p[m], r.p[m + 1]).roads.push(r); }
    for (const s of Data.signs) tile(s.x, s.z).signs.push(s);
    for (const s of Data.blades) tile(s.x, s.z).blades.push(s);
    for (const s of Data.stops) tile(s[0], s[1]).stops.push(s);
    for (const s of Data.signals) tile(s[0], s[1]).signals.push(s);
    for (const s of Data.lamps) tile(s[0], s[1]).lamps.push(s);
    for (const s of Data.hydrants) tile(s[0], s[1]).hydrants.push(s);
    // what overlaps each tile, for masking the ground
    const ensure = (i, j) => tiles.get(i + ',' + j);
    Data.buildings.forEach(b => { const xs = b.pts.map(p => p[0]), zs = b.pts.map(p => p[1]); for (let i = Math.floor(Math.min(...xs) / TILE); i <= Math.floor(Math.max(...xs) / TILE); i++) for (let j = Math.floor(Math.min(...zs) / TILE); j <= Math.floor(Math.max(...zs) / TILE); j++) { const t = ensure(i, j); if (t) t.touch.push(b); } });
    const allRoads = [...Inner.roads, ...Data.roads];
    for (const r of allRoads) {
      const seen = new Set();
      for (let i = 0; i + 1 < r.p.length; i += 2) { const k = key(r.p[i], r.p[i + 1]); if (!seen.has(k)) { seen.add(k); const t = tiles.get(k); if (t) t.roadsNear.push(r); } if (i + 3 < r.p.length) { const q = key((r.p[i] + r.p[i + 2]) / 2, (r.p[i + 1] + r.p[i + 3]) / 2); if (!seen.has(q)) { seen.add(q); const t = tiles.get(q); if (t) t.roadsNear.push(r); } } }
      // street lights about every seventy metres, as Los Angeles has them; the map only records a few
      if (r.w < 9) continue;
      let run = 30, side = 1;
      for (let i = 0; i + 3 < r.p.length; i += 2) {
        const ax = r.p[i], az = r.p[i + 1], bx = r.p[i + 2], bz = r.p[i + 3], L = Math.hypot(bx - ax, bz - az) || 1, ux = (bx - ax) / L, uz = (bz - az) / L;
        for (let d = 72 - run; d < L; d += 72) { const px = ax + ux * d - uz * side * (r.w / 2 + 0.9), pz = az + uz * d + ux * side * (r.w / 2 + 0.9), t = tiles.get(key(px, pz)); if (t && !solidHas(px, pz)) t.moreLamps.push([px, pz, uz * side, -ux * side]); side = -side; run = 0; }
        run += L; run %= 72;
      }
    }
    const solidAt = (x, z) => { const l = solids.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)); if (!l) return false; for (const p of l) if (inPoly(p, x, z)) return true; return false; };
    // ── roads, for fronts of houses and for telling you where you are ──
    const RC = 60, roadGrid = new Map();
    for (const r of [...Inner.roads, ...Data.roads]) {
      if (r.w < 8) continue;
      for (let i = 0; i + 3 < r.p.length; i += 2) {
        const ax = r.p[i], az = r.p[i + 1], bx = r.p[i + 2], bz = r.p[i + 3], n = Math.ceil(Math.hypot(bx - ax, bz - az) / RC) + 1, seen = new Set();
        for (let k = 0; k <= n; k++) { const q = Math.floor((ax + (bx - ax) * k / n) / RC) + ',' + Math.floor((az + (bz - az) * k / n) / RC); if (!seen.has(q)) { seen.add(q); if (!roadGrid.has(q)) roadGrid.set(q, []); roadGrid.get(q).push({ ax, az, bx, bz, r }); } }
      }
    }
    function nearestRoad(x, z) {
      let best = null, bd = 1e9; const cx = Math.floor(x / RC), cz = Math.floor(z / RC);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const s of roadGrid.get((cx + i) + ',' + (cz + j)) || []) {
        const dx = s.bx - s.ax, dz = s.bz - s.az, t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / ((dx * dx + dz * dz) || 1))), px = s.ax + t * dx, pz = s.az + t * dz, d = Math.hypot(x - px, z - pz);
        if (d < bd) { bd = d; best = { x: px, z: pz, d, r: s.r }; }
      }
      return best;
    }

    // ── materials: made once, first use ──
    const road = Tex.mat('asphalt', { color: 0x8c8c8c, rough: 1, depthWrite: false, side: THREE.DoubleSide }); road.userData.layer = -7;
    const walk = Tex.mat('concrete', { color: 0xdcd8cc, rough: 1, depthWrite: false, side: THREE.DoubleSide }); walk.userData.layer = -8;
    const yellow = new THREE.MeshStandardMaterial({ color: 0xb79a2c, roughness: 1, depthWrite: false, side: THREE.DoubleSide }); yellow.userData.layer = -6.5;
    const curb = Tex.mat('concrete', { color: 0xd8d4c8, rough: 1, side: THREE.DoubleSide });
    let MATS = null;
    function mats() {
      if (MATS) return MATS;
      const stopT = W.canvasTex(256, 128, (g) => {
        const oct = (cx, r, f) => { g.fillStyle = f; g.beginPath(); for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; g.lineTo(cx + Math.cos(a) * r, 64 + Math.sin(a) * r); } g.fill(); };
        oct(64, 62, '#ffffff'); oct(64, 57, '#b4161c'); g.fillStyle = '#fff'; g.font = '700 38px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('STOP', 64, 77);
        oct(192, 62, '#8d9094');
      });
      stopT.wrapS = stopT.wrapT = THREE.ClampToEdgeWrapping;
      const lens = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, emissive: c, emissiveIntensity: 0.05 });
      MATS = {
        F: facades(W), detail: detailMat(W), blade: bladeAtlas(W),
        plain: Tex.mat('stucco', { vertexColors: true, rough: 1, normal: 0.7 }),
        shingle: Tex.mat('shingle', { vertexColors: true, rough: 1 }),
        flat: Tex.mat('concrete', { vertexColors: true, rough: 1 }),
        steel: M(0x8d9094, { metalness: 0.7, roughness: 0.45 }), dark: M(0x24262a, { roughness: 0.6 }), post: M(0x6d6f72, { metalness: 0.5, roughness: 0.5 }),
        stop: new THREE.MeshStandardMaterial({ map: stopT, alphaTest: 0.5, roughness: 0.5 }),
        hydrant: M(0xb5a33a, { roughness: 0.5, metalness: 0.2 }), stone: Tex.mat('concrete', { color: 0xbdb7a8, rough: 0.9 }),
        lenses: [[lens(0xd8241c), lens(0xe8b018), lens(0x1fb84a)], [lens(0xd8241c), lens(0xe8b018), lens(0x1fb84a)]],
      };
      return MATS;
    }
    const WALL_H = [0xf6efe0, 0xeee0c4, 0xfafaf4, 0xe2cca8, 0xe8e4da, 0xd8dfd9, 0xf2e6d0, 0xdcc6a0, 0xe9e0d4, 0xc6d0d6, 0xb9c6b4, 0xd8b896, 0xa8b4bc, 0xe8d8c8, 0xcdbfa8, 0xc4a68a, 0xf0e8d8, 0x9fa8a2].map(c => new THREE.Color(c));
    const WALL_C = [0xe8e0d0, 0xd8d0c0, 0xc8b8a4, 0xf0ece0, 0xd4cbbb].map(c => new THREE.Color(c));
    const colour = new Map(), tint = hex => { let c = colour.get(hex); if (!c) { c = new THREE.Color(hex); c.multiplyScalar(1.3); colour.set(hex, c); } return c; };

    function hipRoof(G, m, rect, toWorld, eave, ridgeAt, wi, r, roofC, wallM, wallC) {
      const o = 0.45, a0 = rect.u0 - o, a1 = rect.u1 + o, b0 = rect.v0 - o, b1 = rect.v1 + o, alongU = a1 - a0 >= b1 - b0;
      const run = (alongU ? b1 - b0 : a1 - a0) / 2, gable = r() < (wi ? 0.4 : 0.25), inset = gable ? 0 : run;
      const rise = ridgeAt - eave;
      const P = (u, v, y) => { const q = toWorld(u, v); return [q[0], y, q[1]]; };
      const y0 = eave - 0.03, y1 = y0 + rise;
      if (alongU) {
        const vm = (b0 + b1) / 2, ua = a0 + inset, ub = a1 - inset;
        G.up(m, P(a0, b0, y0), P(ua, vm, y1), P(a1, b0, y0), roofC); G.up(m, P(a1, b0, y0), P(ua, vm, y1), P(ub, vm, y1), roofC);
        G.up(m, P(a0, b1, y0), P(a1, b1, y0), P(ua, vm, y1), roofC); G.up(m, P(a1, b1, y0), P(ub, vm, y1), P(ua, vm, y1), roofC);
        if (gable) { const q = [[P(rect.u0, b0, y0), P(rect.u0, vm, y1), P(rect.u0, b1, y0)], [P(rect.u1, b1, y0), P(rect.u1, vm, y1), P(rect.u1, b0, y0)]]; for (const t of q) G.tri(wallM, t[0], t[1], t[2], [0, 0], [0.5, 1], [1, 0], wallC); }
        else { G.up(m, P(a0, b0, y0), P(a0, b1, y0), P(ua, vm, y1), roofC); G.up(m, P(a1, b0, y0), P(ub, vm, y1), P(a1, b1, y0), roofC); }
      } else {
        const um = (a0 + a1) / 2, va = b0 + inset, vb = b1 - inset;
        G.up(m, P(a0, b0, y0), P(a0, b1, y0), P(um, va, y1), roofC); G.up(m, P(a0, b1, y0), P(um, vb, y1), P(um, va, y1), roofC);
        G.up(m, P(a1, b0, y0), P(um, va, y1), P(a1, b1, y0), roofC); G.up(m, P(a1, b1, y0), P(um, va, y1), P(um, vb, y1), roofC);
        if (gable) { const q = [[P(a0, rect.v0, y0), P(a1, rect.v0, y0), P(um, rect.v0, y1)], [P(a1, rect.v1, y0), P(a0, rect.v1, y0), P(um, rect.v1, y1)]]; for (const t of q) G.tri(wallM, t[0], t[1], t[2], [0, 0], [1, 0], [0.5, 1], wallC); }
        else { G.up(m, P(a0, b0, y0), P(um, va, y1), P(a1, b0, y0), roofC); G.up(m, P(a0, b1, y0), P(a1, b1, y0), P(um, vb, y1), roofC); }
      }
    }

    function addHouse(G, b) {
      const m = mats(), r = rng(b.i * 7919 + 13), F = facadeFor(m.F, Object.assign(b, { k: 'h' })), { ang, rects } = root.Outdoors.wings(b.pts, level === 'low' ? 1 : 2);
      if (!rects.length) return;
      const c = Math.cos(ang), s = Math.sin(ang), toWorld = (u, v) => [u * c - v * s, u * s + v * c];
      const wallC = WALL_H[b.i % WALL_H.length], roofC = tint(b.c);
      rects.forEach((w, wi) => {
        const lu = w.u1 - w.u0, lv = w.v1 - w.v0, run = Math.min(lu, lv) / 2 + 0.45, pitch = 0.28 + r() * 0.12, rise = run * pitch;
        const two = b.h > 6.8 && wi === 0, ridge = Math.max(b.h, 3.6), eave = Math.max(2.5, Math.min(two ? 5.6 : 3, ridge - rise)), floors = eave > 4 ? 2 : 1;
        const q = [toWorld(w.u0, w.v0), toWorld(w.u1, w.v0), toWorld(w.u1, w.v1), toWorld(w.u0, w.v1)];
        for (let i = 0; i < 4; i++) {
          const a = q[i], d = q[(i + 1) % 4], L = Math.hypot(d[0] - a[0], d[1] - a[1]), n = Math.max(1, Math.round(L / F.bay)), u0 = Math.floor(r() * 4) * 0.25;
          G.wall(F.mat, a[0], a[1], d[0], d[1], 0, eave, u0, u0 + n * 0.25, 0, floors, wallC);
        }
        hipRoof(G, m.shingle, w, toWorld, eave, eave + rise, wi, r, roofC, m.plain, wallC);
      });
      // the street side gets a front door, and a garage where there is room for one
      const w = rects[0], [cx, cz] = toWorld((w.u0 + w.u1) / 2, (w.v0 + w.v1) / 2), near = nearestRoad(cx, cz);
      if (!near || level === 'low') return;
      const q = [toWorld(w.u0, w.v0), toWorld(w.u1, w.v0), toWorld(w.u1, w.v1), toWorld(w.u0, w.v1)];
      let best = -2, fi = 0;
      for (let i = 0; i < 4; i++) { const a = q[i], d = q[(i + 1) % 4], L = Math.hypot(d[0] - a[0], d[1] - a[1]) || 1, ox = (d[1] - a[1]) / L, oz = -(d[0] - a[0]) / L, D = Math.hypot(near.x - cx, near.z - cz) || 1, dot = (ox * (near.x - cx) + oz * (near.z - cz)) / D; if (dot > best) { best = dot; fi = i; } }
      const a = q[fi], d = q[(fi + 1) % 4], L = Math.hypot(d[0] - a[0], d[1] - a[1]), ux = (d[0] - a[0]) / L, uz = (d[1] - a[1]) / L, ox = uz * 0.03, oz = -ux * 0.03;
      const piece = (t, wide, high, u0, u1) => { const x0 = a[0] + ux * (t - wide / 2) + ox, z0 = a[1] + uz * (t - wide / 2) + oz, x1 = a[0] + ux * (t + wide / 2) + ox, z1 = a[1] + uz * (t + wide / 2) + oz; G.wall(m.detail, x0, z0, x1, z1, 0, high, u0, u1, 0, 1); };
      const v = b.i % 2 ? 0 : 0.25;
      if (L >= 10) { piece(L * 0.28, 4.8, 2.25, 0.5, 1); piece(L * 0.66, 0.95, 2.05, v, v + 0.25); } else if (L > 2) piece(L * 0.5, 0.95, 2.05, v, v + 0.25);
    }

    function addBlock(G, b) {
      const m = mats(), r = rng(b.i * 104729 + 7), F = facadeFor(m.F, b), c = WALL_C[b.i % WALL_C.length], roofC = tint(b.c);
      const h = Math.max(b.h, 3), floors = Math.max(1, Math.round(h / F.floor));
      for (let i = 0; i < b.pts.length; i++) {
        const A = b.pts[i], B = b.pts[(i + 1) % b.pts.length], L = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.max(1, Math.round(L / F.bay)), u0 = Math.floor(r() * 4) * 0.25;
        G.wall(F.mat, A[0], A[1], B[0], B[1], 0, h, u0, u0 + n * 0.25, 0, floors, c);
      }
      flatRoof(G, m.flat, b.pts, h, roofC);
    }
    function flatRoof(G, mat, pts, y, color) {
      const tris = THREE.ShapeUtils.triangulateShape(pts.map(p => new THREE.Vector2(p[0], p[1])), []);
      for (const [a, b, c] of tris) G.up(mat, [pts[a][0], y, pts[a][1]], [pts[b][0], y, pts[b][1]], [pts[c][0], y, pts[c][1]], color, 3);
    }
    function addBuilding(G, b) {
      const m = mats();
      if (b.k === 'r') {       // a carport or a shelter: a roof on posts
        flatRoof(G, m.flat, b.pts, Math.max(2.5, b.h), tint(b.c));
        for (let i = 0; i < b.pts.length; i++) G.cyl(m.post, b.pts[i][0], 0, Math.max(2.5, b.h), b.pts[i][1], 0.06, 0.06, 5);
      } else if (b.k === 'g') {
        for (let i = 0; i < b.pts.length; i++) { const A = b.pts[i], B = b.pts[(i + 1) % b.pts.length]; G.wall(m.plain, A[0], A[1], B[0], B[1], 0, 2.6, 0, Math.hypot(B[0] - A[0], B[1] - A[1]) / 2.4, 0, 1.1, WALL_H[b.i % WALL_H.length]); }
        flatRoof(G, m.flat, b.pts, 2.6, tint(b.c));
      } else if (b.k === 'h' || (b.k === 'o' && b.area < 420 && b.h < 9)) addHouse(G, b);
      else addBlock(G, b);
    }

    function ribbon(G, mat, p, w, y, off = 0, y1) {
      const n = p.length / 2, N = i => { const a = Math.max(0, i - 1) * 2, b = Math.min(n - 1, i + 1) * 2, dx = p[b] - p[a], dz = p[b + 1] - p[a + 1], L = Math.hypot(dx, dz) || 1; return [-dz / L, dx / L]; };
      const yy = y1 == null ? y : y1;
      for (let i = 0; i < n - 1; i++) {
        const [nax, naz] = N(i), [nbx, nbz] = N(i + 1), ax = p[i * 2], az = p[i * 2 + 1], bx = p[i * 2 + 2], bz = p[i * 2 + 3];
        const A = [ax + nax * (off + w / 2), yy, az + naz * (off + w / 2)], B = [ax + nax * (off - w / 2), y, az + naz * (off - w / 2)], C = [bx + nbx * (off + w / 2), yy, bz + nbz * (off + w / 2)], D = [bx + nbx * (off - w / 2), y, bz + nbz * (off - w / 2)];
        G.up(mat, A, B, C, null, 2); G.up(mat, C, B, D, null, 2);
      }
    }
    function addRoad(G, r) {
      const foot = /footway|path|cycleway|steps|pedestrian/.test(r.k);
      if (foot) { ribbon(G, walk, r.p, r.w, -0.031); return; }
      if (r.w > 5) ribbon(G, walk, r.p, r.w + 5, -0.03);
      ribbon(G, road, r.p, r.w, -0.026);
      if (r.w >= 11) { ribbon(G, yellow, r.p, 0.1, -0.022, 0.09); ribbon(G, yellow, r.p, 0.1, -0.022, -0.09); }
      if (r.w > 5 && Q.houses >= 2) for (const side of [-1, 1]) { const off = side * (r.w / 2 + 0.08); ribbon(G, curb, r.p, 0.16, 0.13, off); ribbon(G, curb, r.p, 0.02, -0.02, off - side * 0.08, 0.13); }
    }
    /** A flat sign facing along ry, and its back. */
    function plate(G, mat, x, y, z, w, h, ry, uv) {
      const nx = Math.sin(ry), nz = Math.cos(ry), dx = nz, dz = -nx;        // out is (dz, -dx) of the way along
      const ax = x - dx * w / 2 + nx * 0.015, az = z - dz * w / 2 + nz * 0.015, bx = x + dx * w / 2 + nx * 0.015, bz = z + dz * w / 2 + nz * 0.015;
      G.wall(mat, ax, az, bx, bz, y - h / 2, y + h / 2, uv[2], uv[0], uv[1], uv[3]);     // read from outside, u runs back along the wall
    }
    function addBlade(G, s) {
      const m = mats(), B = m.blade;
      G.cyl(m.steel, s.x, 0, 3.05, s.z, 0.035, 0.03, 7);
      const put = (name, ra, y) => {
        const uv = B.cell[name]; if (!uv) return;
        for (const side of [Math.PI / 2, -Math.PI / 2]) plate(G, B.mat, s.x, y, s.z, 1.6, 0.2, ra + side, uv);
      };
      put(s.a, s.ra, 2.92); put(s.b, s.rb, 2.7);
    }
    function addStop(G, s) {
      const m = mats(), [x, z, ry] = s, nx = Math.sin(ry), nz = Math.cos(ry);
      G.cyl(m.steel, x, 0, 2.5, z, 0.03, 0.03, 6);
      plate(G, m.stop, x + nx * 0.04, 2.3, z + nz * 0.04, 0.76, 0.76, ry, [0, 0, 0.5, 1]);
      plate(G, m.stop, x + nx * 0.02, 2.3, z + nz * 0.02, 0.76, 0.76, ry + Math.PI, [0.5, 0, 1, 1]);
    }
    function addSignal(G, s) {
      const m = mats(), [x, z, ry, w] = s, nx = Math.sin(ry), nz = Math.cos(ry), phase = Math.abs(nx) > 0.7 ? 0 : 1;
      // the arm goes out over the road, to the left of the driver it faces
      const lx = -nz, lz = nx, arm = Math.min(7, w / 2 + 0.5);
      G.cyl(m.post, x, 0, 6.2, z, 0.13, 0.09, 8);
      for (let k = 0; k < 8; k++) { const a = k * arm / 8, b = (k + 1) * arm / 8; G.box(m.post, x + lx * (a + b) / 2, 6 - k * 0.02, z + lz * (a + b) / 2, 0.08, 0.08, 0.1 + arm / 8, Math.atan2(lx, lz)); }
      for (const t of [arm * 0.55, arm * 0.95]) {
        const hx = x + lx * t, hz = z + lz * t;
        G.box(m.dark, hx, 5.45, hz, 0.34, 1.04, 0.2, ry);
        [6, 5.45, 4.9].forEach((_, i) => plate(G, m.lenses[phase][i], hx + nx * 0.105, 5.77 - i * 0.32, hz + nz * 0.105, 0.2, 0.2, ry, [0, 0, 1, 1]));
      }
    }
    function addLamp(G, s) {
      const m = mats(), [x, z] = s, near = nearestRoad(x, z);
      let ux = 1, uz = 0; if (near && near.d > 0.5) { ux = (near.x - x) / near.d; uz = (near.z - z) / near.d; }
      G.cyl(m.steel, x, 0, 8.4, z, 0.12, 0.07, 8);
      G.box(m.steel, x + ux * 1.1, 8.45, z + uz * 1.1, 0.07, 0.07, 2.2, Math.atan2(ux, uz));
      G.box(M(0xdcd8cc), x + ux * 2.2, 8.4, z + uz * 2.2, 0.24, 0.1, 0.5, Math.atan2(ux, uz));
    }
    let lampGlow = null, lampPool = null;
    function nightMats() {
      if (lampGlow) return;
      const tex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.42)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
      lampGlow = new THREE.MeshBasicMaterial({ map: tex, color: 0xffe6b8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
      lampPool = new THREE.MeshBasicMaterial({ map: tex, color: 0xffdca0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, side: THREE.DoubleSide });
      lampGlow.userData.layer = 2; lampPool.userData.layer = 1;
    }
    function addStreetLamp(G, s) {
      nightMats();
      const m = mats(), [x, z, ux, uz] = s, hx = x + ux * 2.2, hz = z + uz * 2.2;
      G.cyl(m.steel, x, 0, 8.4, z, 0.12, 0.07, 7);
      G.box(m.steel, x + ux * 1.1, 8.45, z + uz * 1.1, 0.07, 0.07, 2.2, Math.atan2(ux, uz));
      G.box(m.dark, hx, 8.4, hz, 0.24, 0.1, 0.5, Math.atan2(ux, uz));
      // a pool of light on the ground under it, and a soft blur round the lamp
      const r = 9, A = [hx - r, 0.03, hz - r], B = [hx + r, 0.03, hz - r], C = [hx + r, 0.03, hz + r], D = [hx - r, 0.03, hz + r];
      G.up(lampPool, A, B, C, null, 1); G.up(lampPool, A, C, D, null, 1);
      const set = G.set(lampPool), v = set.uv, n = v.length; v.splice(n - 12, 12, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0);
      const k = 1.1, dx = uz, dz = -ux;
      for (const [ax, az, bx, bz] of [[hx - dx * k, hz - dz * k, hx + dx * k, hz + dz * k], [hx - ux * k, hz - uz * k, hx + ux * k, hz + uz * k]]) G.wall(lampGlow, ax, az, bx, bz, 8.4 - k, 8.4 + k, 0, 1, 0, 1);
    }
    function addHydrant(G, s) { const m = mats(), [x, z] = s; G.cyl(m.hydrant, x, 0, 0.6, z, 0.11, 0.09, 8); G.cyl(m.hydrant, x, 0.6, 0.76, z, 0.09, 0.05, 8); G.box(m.hydrant, x, 0.42, z, 0.34, 0.1, 0.1, 0); }

    function buildTile(t) {
      const g = new THREE.Group(), B = new THREE.Group(), G = new Mesher(), R = new Mesher(), H = new Mesher();
      for (const b of t.buildings) addBuilding(H, b);
      for (const r of t.roads) addRoad(R, r);
      for (const s of t.stops) addStop(G, s);
      for (const s of t.signals) addSignal(G, s);
      for (const s of t.lamps) addLamp(G, s);
      for (const s of t.hydrants) addHydrant(G, s);
      for (const s of t.blades) addBlade(G, s);
      for (const s of t.moreLamps) addStreetLamp(G, s);
      H.flush(B, level !== 'low'); G.flush(g, level !== 'low'); R.flush(g, false);
      g.add(B); group.add(g); t.group = g; t.farBuildings = B; t.built = true;
    }

    // ── the laser's shapes: loaded a tile at a time, only near you ──
    const tileAt = (x, z) => tiles.get(key(x, z));
    root.__tile = (k, d) => { const t = tiles.get(k); if (t) { t.data = d; t.loading = 'decode'; decode(t); } };
    function loadTile(t) {
      if (t.loading) return;
      t.loading = true;
      const sc = document.createElement('script'); sc.src = `serve/tiles/${t.i}_${t.j}.js`; sc.async = true;
      sc.onerror = () => { t.loading = 'missing'; sc.remove(); };
      sc.onload = () => sc.remove();
      document.head.appendChild(sc);
    }
    function decode(t) {
      const img = new Image(), a = new Image(); let left = 2; const done = () => { if (--left) return;
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
        const px = g.getImageData(0, 0, c.width, c.height).data, h = new Float32Array(c.width * c.height);
        for (let i = 0; i < h.length; i++) { const v = px[i * 4] / 255; h[i] = v * v * 80; }
        t.heights = h; t.hSize = c.width;
        const tx = new THREE.Texture(a); tx.encoding = THREE.sRGBEncoding; tx.anisotropy = 8; tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping; tx.needsUpdate = true; t.tex = tx;
        t.roofMat = new THREE.MeshStandardMaterial({ map: tx, color: 0xc4c4c4, roughness: 0.95 });
        t.raisedMat = root.Outdoors.groundMat(tx); t.raisedMat.depthWrite = true; t.raisedMat.side = THREE.FrontSide;
        t.flatMat = root.Outdoors.groundMat(tx); t.flatMat.userData.layer = -8.9;
        t.loading = 'ready'; t.data = null;
      };
      img.onload = done; a.onload = done; img.src = t.data.h; a.src = t.data.a;
    }
    /** The surface at a metre's grid, across tile edges. */
    const hSample = (x, z) => {
      const t = tileAt(x, z); if (!t || !t.heights) return 0;
      const r = Math.max(0, Math.min(t.hSize - 1, Math.floor(x - t.i * TILE))), c = Math.max(0, Math.min(t.hSize - 1, Math.floor(z - t.j * TILE)));
      return t.heights[r * t.hSize + c];
    };
    function clipCell(poly, x0, z0, x1, z1) {
      let out = poly;
      const clip = (inside, cross) => { const src = out; out = []; for (let i = 0; i < src.length; i++) { const a = src[i], b = src[(i + 1) % src.length], ia = inside(a), ib = inside(b); if (ia) out.push(a); if (ia !== ib) out.push(cross(a, b)); } };
      const atX = v => (a, b) => { const t = (v - a[0]) / (b[0] - a[0]); return [v, a[1] + (b[1] - a[1]) * t]; };
      const atZ = v => (a, b) => { const t = (v - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, v]; };
      clip(p => p[0] >= x0, atX(x0)); if (out.length) clip(p => p[0] <= x1, atX(x1)); if (out.length) clip(p => p[1] >= z0, atZ(z0)); if (out.length) clip(p => p[1] <= z1, atZ(z1));
      return out;
    }
    /** A roof plane, laid with the aerial photograph of that very roof, cut wherever it crosses from one tile's photograph to the next. */
    function roofTri(N, A, B, C) {
      const y = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]); if (y < 0) { const q = B; B = C; C = q; }
      const ex = B[0] - A[0], ey = B[1] - A[1], ez = B[2] - A[2], fx = C[0] - A[0], fy = C[1] - A[1], fz = C[2] - A[2];
      let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
      const n = [nx, ny, nz], det = ex * fz - ez * fx || 1e-6;
      const heightAt = (x, z) => { const dx = x - A[0], dz = z - A[2], u = (dx * fz - dz * fx) / det, v = (ex * dz - ez * dx) / det; return A[1] + u * ey + v * fy; };
      const x0 = Math.min(A[0], B[0], C[0]), x1 = Math.max(A[0], B[0], C[0]), z0 = Math.min(A[2], B[2], C[2]), z1 = Math.max(A[2], B[2], C[2]);
      for (let ti = Math.floor(x0 / TILE); ti <= Math.floor(x1 / TILE); ti++) for (let tj = Math.floor(z0 / TILE); tj <= Math.floor(z1 / TILE); tj++) {
        const t = tiles.get(ti + ',' + tj); if (!t || !t.roofMat) continue;
        const piece = clipCell([[A[0], A[2]], [B[0], B[2]], [C[0], C[2]]], ti * TILE, tj * TILE, (ti + 1) * TILE, (tj + 1) * TILE);
        if (piece.length < 3) continue;
        const P = q => [q[0], heightAt(q[0], q[1]), q[1]], UV = q => [(tj * TILE + TILE - q[1]) / TILE, 1 - (q[0] - ti * TILE) / TILE];
        for (let k = 1; k < piece.length - 1; k++) N.triN(t.roofMat, P(piece[0]), P(piece[k]), P(piece[k + 1]), UV(piece[0]), UV(piece[k]), UV(piece[k + 1]), n, n, n);
      }
    }
    /** What shape of roof best fits what the laser measured over this wing: a hip, a gable either way, or flat. */
    function fitRoof(w, toWorld, b) {
      const lu = w.u1 - w.u0, lv = w.v1 - w.v0, um = (w.u0 + w.u1) / 2, vm = (w.v0 + w.v1) / 2, run = Math.min(lu, lv) / 2;
      const samples = [];
      for (let u = w.u0 + 0.5; u < w.u1; u += 1) for (let v = w.v0 + 0.5; v < w.v1; v += 1) { const q = toWorld(u, v), h = hSample(q[0], q[1]); if (h > 1.8 && h < b.h + 1.2) samples.push([u, v, h]); }
      if (samples.length < 6) return { shape: lu >= lv ? 'hipU' : 'hipV', e: Math.min(b.e || 2.8, 3), slope: 0.34 };
      const dist = {
        hipU: (u, v) => Math.min(u - w.u0, w.u1 - u, v - w.v0, w.v1 - v), hipV: (u, v) => Math.min(u - w.u0, w.u1 - u, v - w.v0, w.v1 - v),
        gableU: (u, v) => Math.min(v - w.v0, w.v1 - v), gableV: (u, v) => Math.min(u - w.u0, w.u1 - u), flat: () => 0,
      };
      let best = null;
      for (const shape of Object.keys(dist)) {
        // the least squares fit of h = e + slope * distance from the eaves
        let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (const [u, v, h] of samples) { const x = dist[shape](u, v); n++; sx += x; sy += h; sxx += x * x; sxy += x * h; }
        const den = n * sxx - sx * sx; let slope = den > 1e-6 ? (n * sxy - sx * sy) / den : 0; slope = Math.max(0, Math.min(1, slope)); const e = (sy - slope * sx) / n;
        // measure with the worst tenth thrown out: those are the branches that hang over roofs
        const errs = samples.map(([u, v, h]) => Math.abs(h - e - slope * dist[shape](u, v))).sort((a, c) => a - c), cost = errs.slice(0, Math.ceil(errs.length * 0.88)).reduce((a, c) => a + c, 0) / errs.length + (shape === 'flat' ? 0 : 0.012);
        if (!best || cost < best.cost) best = { shape, e, slope, cost };
      }
      if (best.slope < 0.07) { best.shape = 'flat'; best.slope = 0; }
      best.e = Math.max(2.3, best.e); best.run = run;
      return best;
    }
    /** A house as measured: real walls under a roof of the right shape, at the right height, with its own photograph on it. */
    function addFitted(N, b) {
      const m = mats(), F = facadeFor(m.F, Object.assign(b, { k: 'h' })), { ang, rects } = root.Outdoors.wings(b.pts, 3), r = rng(b.i * 7919 + 13);
      if (!rects.length) return addBlock(N, b);
      const c = Math.cos(ang), sn = Math.sin(ang), toWorld = (u, v) => [u * c - v * sn, u * sn + v * c], wallC = WALL_H[b.i % WALL_H.length];
      rects.forEach(w => {
        const fit = fitRoof(w, toWorld, b), o = 0.4, e = fit.e;
        const q = [toWorld(w.u0, w.v0), toWorld(w.u1, w.v0), toWorld(w.u1, w.v1), toWorld(w.u0, w.v1)], floors = e > 4.4 ? 2 : 1;
        for (let i = 0; i < 4; i++) {
          const a = q[i], d = q[(i + 1) % 4], L = Math.hypot(d[0] - a[0], d[1] - a[1]), bays = Math.max(1, Math.round(L / F.bay)), u0 = Math.floor(r() * 4) * 0.25;
          N.wall(F.mat, a[0], a[1], d[0], d[1], 0, e, u0, u0 + bays * 0.25, 0, floors, wallC);
        }
        const P = (u, v, y) => { const g = toWorld(u, v); return [g[0], y, g[1]]; };
        const a0 = w.u0 - o, a1 = w.u1 + o, b0 = w.v0 - o, b1 = w.v1 + o, y0 = e - o * fit.slope;
        if (fit.shape === 'flat') { roofTri(N, P(a0, b0, e), P(a1, b0, e), P(a1, b1, e)); roofTri(N, P(a0, b0, e), P(a1, b1, e), P(a0, b1, e)); return; }
        const lu = a1 - a0, lv = b1 - b0;
        if (fit.shape === 'gableU' || fit.shape === 'gableV') {
          const alongU = fit.shape === 'gableU', run = (alongU ? lv : lu) / 2, top = y0 + run * fit.slope;
          if (alongU) { const vm = (b0 + b1) / 2; roofTri(N, P(a0, b0, y0), P(a1, b0, y0), P(a1, vm, top)); roofTri(N, P(a0, b0, y0), P(a1, vm, top), P(a0, vm, top)); roofTri(N, P(a0, b1, y0), P(a1, b1, y0), P(a1, vm, top)); roofTri(N, P(a0, b1, y0), P(a1, vm, top), P(a0, vm, top));
            for (const uu of [w.u0, w.u1]) { const A = toWorld(uu, b0), B = toWorld(uu, b1), M = toWorld(uu, vm); const out = uu === w.u0; const [p, s2] = out ? [A, B] : [B, A]; N.tri(F.mat, [p[0], y0, p[1]], [M[0], top, M[1]], [s2[0], y0, s2[1]], [0, 0], [0.12, 0.8], [0.25, 0], wallC); }
          } else { const um = (a0 + a1) / 2; roofTri(N, P(a0, b0, y0), P(a0, b1, y0), P(um, b1, top)); roofTri(N, P(a0, b0, y0), P(um, b1, top), P(um, b0, top)); roofTri(N, P(a1, b0, y0), P(a1, b1, y0), P(um, b1, top)); roofTri(N, P(a1, b0, y0), P(um, b1, top), P(um, b0, top));
            for (const vv of [w.v0, w.v1]) { const A = toWorld(a0 + o, vv), B = toWorld(a1 - o, vv), M = toWorld(um, vv); const out = vv === w.v1; const [p, s2] = out ? [A, B] : [B, A]; N.tri(F.mat, [p[0], y0, p[1]], [s2[0], y0, s2[1]], [M[0], top, M[1]], [0, 0], [0.25, 0], [0.12, 0.8], wallC); }
          }
          return;
        }
        // a hip: its ridge runs along the longer way
        const run = Math.min(lu, lv) / 2, top = y0 + run * fit.slope;
        if (lu >= lv) { const vm = (b0 + b1) / 2, ua = a0 + run, ub = a1 - run;
          roofTri(N, P(a0, b0, y0), P(a1, b0, y0), P(ub, vm, top)); roofTri(N, P(a0, b0, y0), P(ub, vm, top), P(ua, vm, top)); roofTri(N, P(a0, b1, y0), P(a1, b1, y0), P(ub, vm, top)); roofTri(N, P(a0, b1, y0), P(ub, vm, top), P(ua, vm, top));
          roofTri(N, P(a0, b0, y0), P(a0, b1, y0), P(ua, vm, top)); roofTri(N, P(a1, b0, y0), P(a1, b1, y0), P(ub, vm, top));
        } else { const um = (a0 + a1) / 2, va = b0 + run, vb = b1 - run;
          roofTri(N, P(a0, b0, y0), P(a0, b1, y0), P(um, vb, top)); roofTri(N, P(a0, b0, y0), P(um, vb, top), P(um, va, top)); roofTri(N, P(a1, b0, y0), P(a1, b1, y0), P(um, vb, top)); roofTri(N, P(a1, b0, y0), P(um, vb, top), P(um, va, top));
          roofTri(N, P(a0, b0, y0), P(a1, b0, y0), P(um, va, top)); roofTri(N, P(a0, b1, y0), P(a1, b1, y0), P(um, vb, top));
        }
      });
      // the street side, on the main wing
      const w = rects[0], [cx, cz] = toWorld((w.u0 + w.u1) / 2, (w.v0 + w.v1) / 2), near = nearestRoad(cx, cz);
      if (!near) return;
      const q = [toWorld(w.u0, w.v0), toWorld(w.u1, w.v0), toWorld(w.u1, w.v1), toWorld(w.u0, w.v1)];
      let best = -2, fi = 0, D = Math.hypot(near.x - cx, near.z - cz) || 1;
      for (let i = 0; i < 4; i++) { const a = q[i], d = q[(i + 1) % 4], L = Math.hypot(d[0] - a[0], d[1] - a[1]) || 1, dot = ((d[1] - a[1]) / L * (near.x - cx) + -(d[0] - a[0]) / L * (near.z - cz)) / D; if (dot > best) { best = dot; fi = i; } }
      const a = q[fi], d = q[(fi + 1) % 4], L = Math.hypot(d[0] - a[0], d[1] - a[1]), ux = (d[0] - a[0]) / L, uz = (d[1] - a[1]) / L, ox = uz * 0.035, oz = -ux * 0.035;
      const piece = (t, wide, high, u0, u1) => N.wall(m.detail, a[0] + ux * (t - wide / 2) + ox, a[1] + uz * (t - wide / 2) + oz, a[0] + ux * (t + wide / 2) + ox, a[1] + uz * (t + wide / 2) + oz, 0, high, u0, u1, 0, 1);
      const v = b.i % 2 ? 0 : 0.25;
      if (L >= 10) { piece(L * 0.28, 4.8, 2.25, 0.5, 1); piece(L * 0.66, 0.95, 2.05, v, v + 0.25); } else if (L > 2) piece(L * 0.5, 0.95, 2.05, v, v + 0.25);
    }
    /** A big building: its real outline, its roof terraced at the levels the laser found, each level flat. */
    function addTerraced(N, b) {
      const m = mats(), F = facadeFor(m.F, b), wallC = WALL_C[b.i % WALL_C.length], xs = b.pts.map(p => p[0]), zs = b.pts.map(p => p[1]), S = b.area > 6000 ? 4 : 3;
      const x0 = Math.floor(Math.min(...xs) / S) * S, x1 = Math.ceil(Math.max(...xs) / S) * S, z0 = Math.floor(Math.min(...zs) / S) * S, z1 = Math.ceil(Math.max(...zs) / S) * S;
      const level = (x, z) => {
        // the middle of what was measured in this square, to the half metre
        const v = []; for (let i = 0.5; i < S; i += 1) for (let j = 0.5; j < S; j += 1) { const h = hSample(x + i, z + j); if (h > 1.8) v.push(h); }
        if (!v.length) return b.e || b.h; v.sort((a, c) => a - c); return Math.round(v[v.length >> 1] * 2) / 2;
      };
      const H = new Map(), lv = (x, z) => { const k = x + ',' + z; if (!H.has(k)) { const u = level(x, z); H.set(k, Math.min(u, b.h + 1)); } return H.get(k); };
      const up = [0, 1, 0], top = (t, q, y) => [q[0], y, q[1]];
      for (let x = x0; x < x1; x += S) for (let z = z0; z < z1; z += S) {
        const piece = clipCell(b.pts, x, z, x + S, z + S); if (piece.length < 3) continue;
        const y = lv(x, z), t = tileAt(x + S / 2, z + S / 2); if (!t || !t.roofMat) continue;
        const UV = q => [(t.j * TILE + TILE - q[1]) / TILE, 1 - (q[0] - t.i * TILE) / TILE];
        for (let k = 1; k < piece.length - 1; k++) { const a = piece[0], c = piece[k], d = piece[k + 1], cr = (c[1] - a[1]) * (d[0] - a[0]) - (c[0] - a[0]) * (d[1] - a[1]), [P, Q] = cr >= 0 ? [c, d] : [d, c]; N.triN(t.roofMat, [a[0], y, a[1]], [P[0], y, P[1]], [Q[0], y, Q[1]], UV(a), UV(P), UV(Q), up, up, up); }
        // the step up to any higher neighbour
        for (const [dx, dz, ax, az, bx, bz] of [[S, 0, x + S, z + S, x + S, z], [-S, 0, x, z, x, z + S], [0, S, x, z + S, x + S, z + S], [0, -S, x + S, z, x, z]]) {
          const nb = x + dx >= x0 && x + dx < x1 && z + dz >= z0 && z + dz < z1 && clipCell(b.pts, x + dx, z + dz, x + dx + S, z + dz + S).length >= 3 ? lv(x + dx, z + dz) : -1;
          if (nb > y + 0.2) N.wall(m.plain, ax, az, bx, bz, y, nb, 0, 1, 0, (nb - y) / 2.4, wallC);
        }
      }
      // the walls follow the real outline, to the roof at each stretch
      const r = rng(b.i * 104729 + 7), fl = F.floor;
      for (let i = 0; i < b.pts.length; i++) {
        const A = b.pts[i], B = b.pts[(i + 1) % b.pts.length], L = Math.hypot(B[0] - A[0], B[1] - A[1]); if (L < 0.2) continue;
        const parts = Math.max(1, Math.round(L / (S * 2))), base = Math.floor(r() * 4) * 0.25, bays = Math.max(1, Math.round(L / F.bay));
        for (let k = 0; k < parts; k++) {
          const a = k / parts, c = (k + 1) / parts, ax = A[0] + (B[0] - A[0]) * a, az = A[1] + (B[1] - A[1]) * a, bx = A[0] + (B[0] - A[0]) * c, bz = A[1] + (B[1] - A[1]) * c, mx = (ax + bx) / 2, mz = (az + bz) / 2;
          const nx = (bz - az) / (L / parts) * -0.5 * S, nz = -(bx - ax) / (L / parts) * -0.5 * S, y = lv(Math.floor((mx + nx) / S) * S, Math.floor((mz + nz) / S) * S), ua = base + bays * 0.25 * a, ub = base + bays * 0.25 * c;
          N.wall(F.mat, ax, az, bx, bz, 0, y, ua, ub, 0, y / fl, wallC);
        }
      }
    }
    /** The ground itself, raised where there are hedges, walls and shrubs; flat ground stays one big quad. */
    function buildNear(t) {
      const n = t.hSize, N = new Mesher(), g = new THREE.Group();
      // what is not ground here: buildings, streets (which have their own surface), and the church's own grounds
      const c = document.createElement('canvas'); c.width = c.height = n; const d = c.getContext('2d', { willReadFrequently: true });
      d.setTransform(0, 1, 1, 0, -t.j * TILE, -t.i * TILE);      // canvas x along z, canvas y along x
      d.setTransform(0, n / TILE, n / TILE, 0, 0, 0); d.translate(-t.i * TILE, -t.j * TILE);
      d.fillStyle = '#fff'; d.strokeStyle = '#fff'; d.lineCap = 'round';
      const P = Plan.SITE.parcel; d.fillRect(P[0], P[1], P[2] - P[0], P[3] - P[1]);
      for (const b of t.touch) { d.beginPath(); for (const [x, z] of b.pts) d.lineTo(x, z); d.closePath(); d.fill(); d.lineWidth = 1.4; d.stroke(); }
      for (const r of t.roadsNear) { d.beginPath(); for (let i = 0; i < r.p.length; i += 2) d.lineTo(r.p[i], r.p[i + 1]); d.lineWidth = r.w + 0.6; d.stroke(); }
      const maskPx = d.getImageData(0, 0, n, n).data;
      const relief = new Float32Array((n + 1) * (n + 1)), R = (r, c2) => relief[r * (n + 1) + c2];
      for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) { const v = maskPx[(r * n + q) * 4] > 60 ? 0 : t.heights[r * n + q]; relief[r * (n + 1) + q] = v < 0.16 ? 0 : Math.min(v, 4.2); }
      const x0 = t.i * TILE, z0 = t.j * TILE, sx = TILE / n;
      const uv = (r, q) => [1 - q / n, 1 - r / n], Pz = (r, q) => [x0 + r * sx, R(r, q) - 0.05, z0 + q * sx];
      const norm = (r, q) => { const a = R(Math.max(0, r - 1), q), b = R(Math.min(n, r + 1), q), e = R(r, Math.max(0, q - 1)), f = R(r, Math.min(n, q + 1)), L = Math.hypot(b - a, 2 * sx, f - e) || 1; return [-(b - a) / L, 2 * sx / L, -(f - e) / L]; };
      const up = [0, 1, 0];
      const maxIn = (r, q, s) => { let m = 0; for (let i = r; i <= Math.min(n, r + s); i++) for (let j = q; j <= Math.min(n, q + s); j++) { const v = R(i, j); if (v > m) m = v; } return m; };
      const quad = (r, q, s, mat, smoothN) => {
        const r1 = Math.min(n, r + s), q1 = Math.min(n, q + s), A = Pz(r, q), B = Pz(r, q1), C = Pz(r1, q1), D = Pz(r1, q);
        // from above, r grows towards +x and q towards +z: this winding looks up
        const nA = smoothN ? norm(r, q) : up, nB = smoothN ? norm(r, q1) : up, nC = smoothN ? norm(r1, q1) : up, nD = smoothN ? norm(r1, q) : up;
        N.triN(mat, A, B, C, uv(r, q), uv(r, q1), uv(r1, q1), nA, nB, nC);
        N.triN(mat, A, C, D, uv(r, q), uv(r1, q1), uv(r1, q), nA, nC, nD);
      };
      const walk2 = (r, q, s) => {
        if (r >= n || q >= n) return;
        if (maxIn(r, q, s) < 0.01) return quad(r, q, s, t.flatMat, false);
        if (s <= 1) return quad(r, q, 1, t.raisedMat, true);
        const h = s >> 1; walk2(r, q, h); walk2(r, q + h, h); walk2(r + h, q, h); walk2(r + h, q + h, h);
      };
      for (let r = 0; r < n; r += 32) for (let q = 0; q < n; q += 32) walk2(r, q, 32);
      // the buildings whose middles are here
      for (const b of t.buildings) { if (b.e == null || b.k === 'r' || b.k === 'g') addBuilding(N, b); else if (b.k === 'h' || (b.k === 'o' && b.area < 420 && b.h < 9)) addFitted(N, b); else addTerraced(N, b); }
      N.flush(g, level !== 'low');
      group.add(g); t.near = g;
      if (t.farBuildings) t.farBuildings.visible = false;
    }
    function dropNear(t) {
      group.remove(t.near);
      t.near.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
      t.near = null;
      if (t.farBuildings) t.farBuildings.visible = true;
    }

    /** The named things, close enough to read. */
    function buildSigns(t) {
      const g = new THREE.Group(), G = new Mesher(), m = mats(), textures = [];
      for (const s of t.signs) {
        const f = signFace(W, s); textures.push(f.t, f.mat);
        const face = (x, y, z, w, h, ry) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), f.mat); o.position.set(x, y, z); o.rotation.y = ry; g.add(o); textures.push(o.geometry); };
        if (s.k === 'num') {
          const h = 0.2, w = h * f.aspect; face(s.x, 2.1, s.z, w, h, s.ry);
        } else if (s.k === 'shop' || s.k === 'uni' || s.k === 'civic') {
          let h = s.k === 'shop' ? 0.72 : (s.h || 5) > 10 ? 1.05 : 0.6, w = h * f.aspect;
          const room = Math.max(1.2, s.w || 4); if (w > room) { w = room; h = w / f.aspect; }
          const y = Math.min(Math.max(2.8, (s.h || 5) - 0.7 - h / 2), (s.h || 5) > 10 ? 5.4 : 4.1);
          face(s.x, y, s.z, w, h, s.ry);
          G.box(m.dark, s.x - Math.sin(s.ry) * 0.05, y, s.z - Math.cos(s.ry) * 0.05, w + 0.08, h + 0.08, 0.06, s.ry);
        } else if (s.k === 'bus') {
          const w = Math.min(1.1, 0.42 * f.aspect), h = w / f.aspect, nx = Math.cos(s.ry), nz = -Math.sin(s.ry);
          G.cyl(m.steel, s.x, 0, 3, s.z, 0.03, 0.03, 6);
          face(s.x + nx * 0.03, 2.62, s.z + nz * 0.03, w, h, Math.atan2(nx, nz)); face(s.x - nx * 0.03, 2.62, s.z - nz * 0.03, w, h, Math.atan2(-nx, -nz));
        } else {            // a sign standing on the ground: a parking lot's, a park's, a school's
          const lot = s.k === 'lot', w = lot ? Math.min(1.5, 0.5 * f.aspect) : Math.min(3.6, 0.95 * f.aspect), h = w / f.aspect, y = lot ? 2.1 : 0.46 + h / 2;
          const nx = Math.sin(s.ry), nz = Math.cos(s.ry);
          face(s.x + nx * 0.07, y, s.z + nz * 0.07, w, h, s.ry); face(s.x - nx * 0.07, y, s.z - nz * 0.07, w, h, s.ry + Math.PI);
          if (lot) { G.cyl(m.steel, s.x, 0, y, s.z, 0.03, 0.03, 6); } else { G.box(m.stone, s.x, 0.23, s.z, w + 0.3, 0.46, 0.32, s.ry); G.box(m.stone, s.x, y, s.z, w + 0.1, h + 0.1, 0.12, s.ry); }
        }
      }
      G.flush(g, false);
      group.add(g); t.signGroup = g; t.signStuff = textures;
    }
    function dropSigns(t) {
      group.remove(t.signGroup);
      t.signGroup.traverse(o => { if (o.isMesh && !o.geometry.disposed) { o.geometry.dispose(); o.geometry.disposed = true; } });
      for (const x of t.signStuff) if (x.dispose) x.dispose();
      t.signGroup = null; t.signStuff = null;
    }

    // ── the outer aerial, under the near one; made when first wanted ──
    let ground = null;
    function wake() {
      if (ground) return;
      const img = new Image(), tex = new THREE.Texture(img); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8;
      img.onload = () => { tex.needsUpdate = true; }; img.src = Aerial.src;
      const mat = root.Outdoors.groundMat(tex); mat.userData.layer = -9.5;
      const R = Aerial.r, x0 = Aerial.cx - R, x1 = Aerial.cx + R, z0 = Aerial.cz - R, z1 = Aerial.cz + R;
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute([x0, -0.055, z1, x1, -0.055, z1, x1, -0.055, z0, x0, -0.055, z0], 3));
      gg.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
      gg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 1, 1], 2));
      gg.setIndex([0, 1, 2, 0, 2, 3]);
      ground = new THREE.Mesh(gg, mat); ground.renderOrder = -9.5; ground.frustumCulled = false; group.add(ground);
    }

    const trunks = new Map();
    for (const t of Data.trees) { const k = Math.floor(t[0] / 8) + ',' + Math.floor(t[1] / 8); if (!trunks.has(k)) trunks.set(k, []); trunks.get(k).push(t); }
    const list = [...tiles.values()];
    let lastLook = -1, lx = 1e9, lz = 1e9;
    return {
      group, fogFar, range, solidAt, nearestRoad, wake, wetMats: [road, walk], tiles: list,
      /** Bring what is near into being, a little each frame; hide what is too far off to see. */
      update(camera, wide, now, opts) {
        const x = camera.position.x, z = camera.position.z, reach = wide ? range : 480;
        let best = null, bd = 1e9;
        for (const t of list) {
          if (t.built) continue;
          const d = Math.hypot(t.x - x, t.z - z);
          if (d < reach + TILE && d < bd) { bd = d; best = t; }
        }
        if (best) { buildTile(best); lx = 1e9; }      // one is plenty for a frame
        if (Math.hypot(x - lx, z - lz) > 20 || now - lastLook > 2) {
          lx = x; lz = z; lastLook = now;
          for (const t of list) {
            const d = Math.hypot(t.x - x, t.z - z);
            if (t.group) t.group.visible = d < reach + TILE * 0.72;
            if (wide && !t.signGroup && t.signs.length && d < SIGN_NEAR + TILE * 0.72 && t.built) buildSigns(t);
            else if (t.signGroup && d > SIGN_FAR + TILE * 0.72) dropSigns(t);
          }
        }
        if (wide && nearR) {
          // load the laser's tiles a little beyond where they will be needed, and build one each frame
          let want = null, wd = 1e9;
          for (const t of list) {
            const d = Math.hypot(t.x - x, t.z - z);
            if (d < nearR + TILE * 1.2) loadTile(t);
            if (t.near && d > nearR + TILE * 1.05) dropNear(t);
            if (!t.near && t.loading === 'ready' && t.built && d < nearR + TILE * 0.4 && d < wd) {
              // it needs its neighbours' data too, for roofs across the edge
              let ok = true; for (let a = -1; a <= 1 && ok; a++) for (let b = -1; b <= 1; b++) { const q = tiles.get((t.i + a) + ',' + (t.j + b)); if (q && q.loading !== 'ready' && q.loading !== 'missing') { ok = false; break; } }
              if (ok) { wd = d; want = t; }
            }
          }
          if (want) buildNear(want);
        }
        // the night: lit windows and street lamps
        { const night = opts && opts.night || 0, on = Math.max(0, Math.min(1, (night - 0.25) / 0.5));
          if (MATS) for (const list2 of Object.values(MATS.F)) for (const f of list2) f.mat.emissiveIntensity = on * 0.6;
          if (lampGlow) { lampGlow.opacity = on * 0.85; lampPool.opacity = on * 0.26; } }
        // the signals: each cross street has its turn
        if (MATS) {
          const c = (now % 40) / 40;
          const state = p => { const s = (c + p * 0.5) % 1; return s < 0.42 ? 2 : s < 0.5 ? 1 : 0; };
          MATS.lenses.forEach((set, p) => { const on = state(p); set.forEach((l, i) => { l.emissiveIntensity = i === on ? 2.4 : 0.04; }); });
        }
      },
      /** Any tree trunk here? For wheels; feet can go round. */
      trunkAt(x, z, r) {
        const l = trunks.get(Math.floor(x / 8) + ',' + Math.floor(z / 8)); if (!l) return false;
        for (const t of l) if (Math.hypot(t[0] - x, t[1] - z) < r + 0.3) return true;
        return false;
      },
      /** The street you are on, by its real name, or null away from any. */
      streetAt(x, z) {
        const n = nearestRoad(x, z);
        return n && n.r.n && n.d < n.r.w / 2 + 7 ? n.r.n : null;
      },
    };
  }

  root.Northridge = { build, TILE, RANGE };
})(typeof self !== 'undefined' ? self : this);
