/*
 * Jointed figures for the altar-server game: priest (alb, Roman chasuble, maniple, biretta),
 * server (cassock and surplice), and lay communicants.
 *
 * Local frame: the figure faces +z, its right hand is at −x. root.rotation.y = heading.
 * Arms are solved each frame from hand targets given in spine space, so bows carry the hands with them.
 * Everything that takes time returns a promise resolved from update(dt).
 */
(function (root) {
  'use strict';
  const THREE = root.THREE;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  const MATS = {};
  function mat(color, opts = {}) {
    const { tex, ...rest } = opts;      // a drawn texture is named, not spelled out, in the key
    const key = color + JSON.stringify(rest) + (tex || '');
    if (MATS[key]) return MATS[key];
    const o = Object.assign({ color, roughness: 0.85, metalness: 0 }, rest);
    if (tex) Object.assign(o, TEXTURE[tex]());
    return (MATS[key] = new THREE.MeshStandardMaterial(o));
  }

  // ── what cloth and hair look like close to: drawn once and shared ─────────
  const TEXS = {};
  function drawn(key, w, h, draw, repeat, color = true) {
    if (TEXS[key]) return TEXS[key];
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); t.anisotropy = 8;
    if (color) { if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding; }
    return (TEXS[key] = t);
  }
  function seeded(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
  /** A woven ground: warp and weft, light grey so the cloth keeps its own colour. */
  function weave(g, w, h, seed, coarse) {
    const R = seeded(seed);
    g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(0,0,0,${0.03 + R() * 0.05})`; g.fillRect(0, y, w, 1); }
    for (let x = 0; x < w; x += 2) { g.fillStyle = `rgba(0,0,0,${0.02 + R() * 0.04})`; g.fillRect(x, 0, 1, h); }
    for (let i = 0; i < w * h / (coarse ? 30 : 60); i++) { g.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '0,0,0'},${R() * 0.06})`; g.fillRect(R() * w, R() * h, 1 + R() * 3, 1); }     // slubs in the thread
  }
  const TEXTURE = {
    linen: () => ({ map: drawn('linen', 128, 128, (g, w, h) => weave(g, w, h, 3, false), [10, 10]) }),
    wool: () => ({ map: drawn('wool', 128, 128, (g, w, h) => weave(g, w, h, 5, true), [8, 8]) }),
    coat: () => ({ map: drawn('coat', 128, 128, (g, w, h) => weave(g, w, h, 9, true), [6, 6]) }),
    // a damask of the same colour as the silk, the figure showing only as the light falls on it
    damask: () => ({ map: drawn('damask', 256, 256, (g, w, h) => {
      g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff';
      const motif = (cx, cy, s) => {
        g.beginPath(); g.moveTo(cx, cy - s); g.bezierCurveTo(cx + s * 0.9, cy - s * 0.6, cx + s * 0.5, cy + s * 0.4, cx, cy + s);
        g.bezierCurveTo(cx - s * 0.5, cy + s * 0.4, cx - s * 0.9, cy - s * 0.6, cx, cy - s); g.fill();
        for (const k of [-1, 1]) { g.beginPath(); g.ellipse(cx + k * s * 0.75, cy + s * 0.15, s * 0.32, s * 0.14, k * 0.7, 0, 7); g.fill(); }
      };
      for (let y = 0; y <= 2; y++) for (let x = 0; x <= 2; x++) { motif(x * 128, y * 128, 40); motif(x * 128 + 64, y * 128 + 64, 26); }
      for (let y = 0; y < h; y += 2) { g.fillStyle = 'rgba(0,0,0,0.04)'; g.fillRect(0, y, w, 1); }
    }, [3, 4]) }),
    gold: () => ({ map: drawn('galloon', 64, 256, (g, w, h) => {
      g.fillStyle = '#d8c070'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#8a6a24';
      for (let y = 0; y < h; y += 16) { g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w * 0.85, y + 8); g.lineTo(w / 2, y + 16); g.lineTo(w * 0.15, y + 8); g.closePath(); g.fill(); }
      g.fillStyle = '#f1dc8e'; for (let y = 4; y < h; y += 16) g.fillRect(w / 2 - 3, y + 2, 6, 4);
      g.fillStyle = '#6e521c'; g.fillRect(0, 0, 4, h); g.fillRect(w - 4, 0, 4, h);
    }, [1, 6]) }),
    // bobbin lace: a scalloped edge and open work, the holes cut out by alphaTest
    lace: () => ({ alphaMap: drawn('lace', 256, 64, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff'; g.strokeStyle = '#fff';
      g.fillRect(0, 0, w, 7);
      for (let x = 0; x < w; x += 32) {
        g.beginPath(); g.arc(x + 16, h - 14, 14, 0, Math.PI); g.lineWidth = 3; g.stroke();
        g.beginPath(); g.ellipse(x + 16, 26, 9, 11, 0, 0, 7); g.lineWidth = 2.5; g.stroke();
        g.beginPath(); g.moveTo(x, 7); g.lineTo(x + 16, 26); g.lineTo(x + 32, 7); g.lineWidth = 2; g.stroke();
        g.beginPath(); g.moveTo(x + 16, 37); g.lineTo(x + 16, h - 14); g.stroke();
        g.beginPath(); g.arc(x + 16, 26, 3, 0, 7); g.fill();
      }
    }, [14, 1], false), alphaTest: 0.5, transparent: false }),
    hair: () => ({ map: drawn('hair', 64, 256, (g, w, h) => {
      const R = seeded(13);
      g.fillStyle = '#d0d0d0'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 420; i++) { const x = R() * w, l = 20 + R() * 60, y = R() * h; g.strokeStyle = `rgba(${R() < 0.5 ? '255,255,255' : '0,0,0'},${0.1 + R() * 0.25})`; g.lineWidth = 0.6 + R(); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (R() - 0.5) * 6, y + l / 2, x + (R() - 0.5) * 4, y + l); g.stroke(); }
    }, [5, 1]) }),
  };
  function mesh(geo, material, parent, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }

  const COLORS = {
    skin: 0xc99a7c, hair: 0x2c1e14, alb: 0xf4f1ea, cassock: 0x0d0c10, surplice: 0xfbfaf6, gold: 0xc9a23a,
    shoe: 0x111111, biretta: 0x101010,
  };
  // A thigh of 0.46 puts a kneeling pelvis at ~0.5 above the floor.
  const DIM = { hip: 0.95, thigh: 0.46, shin: 0.45, torso: 0.6, shoulderY: 0.52, shoulderX: 0.19, upper: 0.29, fore: 0.27, head: 0.115 };

  // Leg poses: [hipPitch R, knee R, hipPitch L, knee L, pelvis height, pelvis z]
  const LEGS = {
    stand: [0, 0, 0, 0, DIM.hip, 0],
    gen: [-0.12, 1.62, 1.5, 1.5, 0.5, -0.04],      // right knee to the floor, left foot planted ahead
    kneel: [0.0, 1.57, 0.0, 1.57, 0.5, 0],
    sit: [1.5, 1.5, 1.5, 1.5, 0.47, -0.12],
  };

  /** Hand targets in spine space (figure faces +z, right hand is −x). */
  const ARMS = {
    joined: { R: [-0.02, 0.36, 0.22], L: [0.02, 0.36, 0.22] },
    rest: { R: [-0.22, 0.02, 0.06], L: [0.22, 0.02, 0.06] },
    flatL: [0.03, 0.30, 0.17], flatR: [-0.03, 0.30, 0.17],
    carry: { R: [-0.12, 0.2, 0.3], L: [0.12, 0.2, 0.3] },
    holdR: [-0.12, 0.27, 0.32], holdL: [0.12, 0.27, 0.32],
    out: { R: [-0.1, 0.36, 0.52], L: [0.1, 0.36, 0.52] },
    orans: { R: [-0.3, 0.42, 0.24], L: [0.3, 0.42, 0.24] },
    onAltar: { R: [-0.17, 0.12, 0.42], L: [0.17, 0.12, 0.42] },
    overOblata: { R: [-0.1, 0.22, 0.5], L: [0.1, 0.22, 0.5] },
    holdChalice: { R: [-0.06, 0.25, 0.4], L: [0.06, 0.22, 0.38] },
    fingers: { R: [-0.04, 0.04, 0.42], L: [0.04, 0.04, 0.42] },
    elevate: { R: [-0.05, 0.98, 0.16], L: [0.05, 0.98, 0.16] },
    book: { R: [-0.14, 0.22, 0.48], L: [0.14, 0.22, 0.48] },
    bellsLow: { R: [-0.2, 0.06, 0.2] },
  };

  // ── the body's shapes, shared between figures ──────────────────────────────
  const GEO = {};
  const sharedGeo = (key, make) => GEO[key] || (GEO[key] = make());
  const taper = (top, bottom, h, seg = 28) => new THREE.CylinderGeometry(top, bottom, h, seg, 3);

  /** A surface of revolution from [radius, y] pairs, flattened front to back. */
  function turned(prof, seg, flat = 0.78, steps = 4) {
    const pts = [];
    for (let i = 0; i < prof.length - 1; i++) for (let k = 0; k < steps; k++) {
      const t = k / steps, q = t * t * (3 - 2 * t);
      pts.push(new THREE.Vector2(prof[i][0] + (prof[i + 1][0] - prof[i][0]) * q, prof[i][1] + (prof[i + 1][1] - prof[i][1]) * t));
    }
    pts.push(new THREE.Vector2(prof[prof.length - 1][0], prof[prof.length - 1][1]));
    const g = new THREE.LatheGeometry(pts, seg);
    g.scale(1, 1, flat); g.computeVertexNormals();
    return g;
  }
  function torsoShape() {
    return turned([[0.0, -0.01], [0.15, 0.0], [0.142, 0.12], [0.15, 0.26], [0.172, 0.4], [0.17, 0.5], [0.13, 0.57], [0.07, 0.605], [0, 0.61]], 56, 0.72, 6);
  }
  function calfShape() {
    const g = turned([[0.054, 0], [0.058, -0.1], [0.052, -0.26], [0.038, -DIM.shin + 0.02], [0.04, -DIM.shin]].map(([r, y]) => [r, y]), 28, 1, 5);
    g.computeVertexNormals();
    return g;
  }
  function shoeShape() {
    const g = new THREE.SphereGeometry(0.06, 32, 20);
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i), y = a.getY(i), z = a.getZ(i);
      a.setXYZ(i, x * 0.8 * (z > 0 ? 1 - z * 1.2 : 1), Math.max(-0.045, y * 0.72) + (z < 0 ? -z * 0.1 : 0), z * 2.15 + 0.05);
    }
    g.computeVertexNormals();
    return g;
  }
  /** A garment hanging from top radius to hem radius, with folds that deepen towards the hem. pleat: 0 soft folds, 1 pressed pleats. */
  function robeAt(top, hem, folds, depth, t, a, pleat = 0) {
    const r = top + (hem - top) * Math.pow(t, 0.9), deep = depth * t * t, ph = a * folds + Math.sin(t * 2.4 + a * 2) * 0.8;
    const wave = pleat ? Math.sign(Math.sin(ph)) * Math.pow(Math.abs(Math.sin(ph)), 1 - pleat * 0.7) : Math.sin(ph);
    return r * (1 + (deep / Math.max(0.05, r)) * wave);
  }
  function robeShape(top, hem, h, folds, depth, pleat = 0, even = false, deep = 0.86) {      // deep: front to back, against side to side
    const seg = 128, rings = 28, pos = [], uv = [], idx = [];
    for (let j = 0; j <= rings; j++) {
      const t = j / rings, y = h / 2 - t * h;
      for (let i = 0; i <= seg; i++) {
        const a = i / seg * Math.PI * 2, r = even ? robeAt(top + (hem - top) * t, top + (hem - top) * t, folds, depth, 1, a, pleat) : robeAt(top, hem, folds, depth, t, a, pleat);      // even: a band whose folds are as deep all the way down
        pos.push(Math.sin(a) * r, y, Math.cos(a) * r * deep);
        uv.push(i / seg, 1 - t);
      }
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const p = j * (seg + 1) + i, q = p + seg + 1;
      idx.push(p, q, p + 1, p + 1, q, q + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  /** A box with its edges rounded off. */
  function roundedBox(w, h, d, r, seg = 6) {
    const g = new THREE.BoxGeometry(w, h, d, seg, seg, Math.max(2, seg >> 1)), a = g.attributes.position;
    const hx = w / 2 - r, hy = h / 2 - r, hz = Math.max(0.0005, d / 2 - r), p = V(0, 0, 0), c = V(0, 0, 0);
    for (let i = 0; i < a.count; i++) {
      p.set(a.getX(i), a.getY(i), a.getZ(i));
      c.set(Math.max(-hx, Math.min(hx, p.x)), Math.max(-hy, Math.min(hy, p.y)), Math.max(-hz, Math.min(hz, p.z)));
      p.sub(c); if (p.lengthSq() > 1e-12) p.setLength(r); p.add(c);
      a.setXYZ(i, p.x, p.y, p.z);
    }
    g.computeVertexNormals();
    return g;
  }
  /** One face of a fiddleback chasuble, curved round the body. dir: +1 front, −1 back. */
  function chasuble(shoulder, waist, hem, h, dir) {
    const rows = 40, cols = 28, pos = [], uv = [], idx = [];
    for (let j = 0; j <= rows; j++) {
      const t = j / rows, y = h / 2 - t * h;
      // broad at the shoulders, narrowed through the waist, opening to the rounded hem
      const k = t < 0.45 ? shoulder + (waist - shoulder) * Math.sin(t / 0.45 * Math.PI / 2) : waist + (hem - waist) * Math.sin((t - 0.45) / 0.55 * Math.PI / 2);
      const round = t > 0.92 ? Math.sqrt(Math.max(0.02, 1 - Math.pow((t - 0.92) / 0.08, 2))) : 1;
      for (let i = 0; i <= cols; i++) {
        const u = i / cols * 2 - 1, x = u * k * round;
        pos.push(x, y, dir * (0.018 - (x * x) * 0.55 + Math.sin(u * 5 + t * 2) * 0.004));
        uv.push((x + 0.32) / 0.64, 1 - t);
      }
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const p = j * (cols + 1) + i, q = p + cols + 1;
      if (dir > 0) idx.push(p, q, p + 1, p + 1, q, q + 1); else idx.push(p, p + 1, q, p + 1, q + 1, q);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  /** The gold braid along a chasuble's edge: a flat band following its outline, a hair proud of the silk. */
  function galloon(shoulder, waist, hem, h, dir) {
    const rows = 40, pts = [];
    const at = (t, side) => {
      const k = t < 0.45 ? shoulder + (waist - shoulder) * Math.sin(t / 0.45 * Math.PI / 2) : waist + (hem - waist) * Math.sin((t - 0.45) / 0.55 * Math.PI / 2);
      const round = t > 0.92 ? Math.sqrt(Math.max(0.02, 1 - Math.pow((t - 0.92) / 0.08, 2))) : 1, x = side * k * round;
      return V(x, h / 2 - t * h, dir * (0.022 - x * x * 0.55));
    };
    for (let j = 0; j <= rows; j++) pts.push(at(j / rows, -1));
    for (let j = rows; j >= 0; j--) pts.push(at(j / rows, 1));
    const curve = new THREE.CatmullRomCurve3(pts, false);
    const g = new THREE.TubeGeometry(curve, 160, 0.009, 5, false);
    g.scale(1, 1, 0.35);
    return g;
  }
  /** A head: a sphere pressed into a jaw, brow, sockets, nose, lips and chin. */
  function headShape() {
    const g = new THREE.SphereGeometry(0.1, 64, 48), a = g.attributes.position;
    const bump = (x, y, cx, cy, sx, sy) => Math.exp(-((x - cx) ** 2) / (sx * sx) - ((y - cy) ** 2) / (sy * sy));
    for (let i = 0; i < a.count; i++) {
      const X = a.getX(i), Y = a.getY(i), Z = a.getZ(i);
      let x = X * 0.86, y = Y * 1.2, z = Z * 1.02;
      if (Y < 0) { const n = 1 + Y * 1.6; x *= n; if (Z < 0) z *= 1 + Y * 2.6; }     // jaw and the neck's hollow
      if (Z > 0) {
        z += bump(X, Y, 0, 0.0, 0.013, 0.03) * 0.024;                                 // nose
        z += bump(X, Y, 0, -0.022, 0.016, 0.009) * 0.006;                             // its tip
        z += bump(X, Y, 0, 0.032, 0.06, 0.01) * 0.008;                                // brow
        z -= bump(Math.abs(X), Y, 0.036, 0.016, 0.02, 0.012) * 0.016;                 // sockets
        z += bump(Math.abs(X), Y, 0.052, -0.022, 0.024, 0.024) * 0.006;               // cheeks
        z += bump(X, Y, 0, -0.04, 0.022, 0.009) * 0.005;                              // mouth
        z += bump(X, Y, 0, -0.07, 0.024, 0.016) * 0.009;                              // chin
      }
      a.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  }
  /** Hair: a cap fitted over the skull with a real hairline. Styles: short, side, long, grey. */
  function hairShape(style) {
    const g = new THREE.SphereGeometry(0.106, 56, 36, 0, Math.PI * 2, 0, Math.PI * (style === 'long' ? 0.84 : 0.62)), a = g.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const X = a.getX(i), Y = a.getY(i), Z = a.getZ(i), ang = Math.atan2(X, Z);
      let y = Y * 1.21, z = Z * 1.03, x = X * 0.885;
      // the hairline: lifted over the face, lower at the temples and nape
      if (Z > 0.02) {
        const front = Math.cos(ang);
        const line = 0.056 + (style === 'side' ? Math.sin(ang) * 0.012 : 0) - Math.abs(Math.sin(ang)) * 0.03;
        if (y < line && front > 0.3) y = line + (y - line) * 0.08;
      }
      if (style === 'long' && Z < 0) { y -= 0.03; x *= 1.04; }
      if (y > 0.085) { const lift = 1 + Math.sin(ang * 13 + Y * 40) * 0.006; x *= lift; z *= lift; }
      if (style === 'side' && y > 0.06) x += 0.004;
      a.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  }
  /*
   * The hand. Its own frame: the fingers point along −y from the wrist, the palm faces +z, and the thumb is on the side s·x
   * (s: −1 right, +1 left), as a hand is held with the palm forward. Every finger has three joints and the thumb three; the wrist turns.
   */
  const FINGERS = [      // index, middle, ring, little: length, knuckle height, thickness
    { len: 0.07, ky: -0.083, r: 0.0088 }, { len: 0.077, ky: -0.087, r: 0.0089 }, { len: 0.072, ky: -0.085, r: 0.0084 }, { len: 0.057, ky: -0.079, r: 0.0073 },
  ];
  const PHALANX = [0.46, 0.3, 0.24];
  function buildHand(parent, skin, s) {
    const wrist = new THREE.Group(); parent.add(wrist);
    mesh(sharedGeo('palm', () => { const g = roundedBox(0.078, 0.088, 0.027, 0.0115, 8); g.translate(0, -0.044, 0); return g; }), skin, wrist);
    mesh(sharedGeo('thenar', () => { const g = new THREE.SphereGeometry(0.019, 20, 14); g.scale(1, 1.45, 0.75); return g; }), skin, wrist, s * 0.021, -0.036, 0.011);
    mesh(sharedGeo('wristJoint', () => { const g = new THREE.CylinderGeometry(0.024, 0.026, 0.02, 24); g.scale(1, 1, 0.62); return g; }), skin, wrist, 0, -0.002, 0);
    const fingers = FINGERS.map((F, i) => {
      const segs = [];
      let par = wrist;
      PHALANX.forEach((p, j) => {
        const g = new THREE.Group();
        g.position.set(j ? 0 : s * (0.0265 - i * 0.0177), j ? -F.len * PHALANX[j - 1] : F.ky, 0);
        par.add(g);
        const L = F.len * p, r = F.r * (1 - j * 0.1);
        mesh(sharedGeo('ph' + i + j, () => { const c = new THREE.CapsuleGeometry(r, Math.max(0.002, L - r * 0.8), 6, 14); c.translate(0, -L / 2, 0); c.scale(1, 1, 0.88); return c; }), skin, g);
        if (j === 2) mesh(sharedGeo('nail' + i, () => { const c = new THREE.SphereGeometry(r * 0.78, 12, 8); c.scale(1, 1.5, 0.32); return c; }), mat(0xe8c8bc, { roughness: 0.3 }), g, 0, -L * 0.62, -r * 0.62);
        segs.push(g); par = g;
      });
      return segs;
    });
    const thumb = [];
    let tpar = wrist;
    [[0.04, 0.0118, V(s * 0.03, -0.02, 0.006)], [0.033, 0.0102, null], [0.028, 0.0094, null]].forEach(([L, r, at], j) => {
      const g = new THREE.Group();
      if (at) g.position.copy(at); else g.position.set(0, -[0.04, 0.033][j - 1], 0);
      tpar.add(g);
      mesh(sharedGeo('th' + j, () => { const c = new THREE.CapsuleGeometry(r, Math.max(0.002, L - r * 0.8), 6, 14); c.translate(0, -L / 2, 0); c.scale(1, 1, 0.9); return c; }), skin, g);
      if (j === 2) mesh(sharedGeo('thNail', () => { const c = new THREE.SphereGeometry(r * 0.8, 12, 8); c.scale(1, 1.5, 0.32); return c; }), mat(0xe8c8bc, { roughness: 0.3 }), g, 0, -L * 0.62, -r * 0.6);
      thumb.push(g); tpar = g;
    });
    return { wrist, fingers, thumb, s, curl: [0.2, 0.25, 0.3, 0.35], tc: 0.2, to: 0.2, sp: 0, q: new THREE.Quaternion(), set: false };
  }
  /** How the fingers lie: curl of index, middle, ring, little (0 straight, 1 a fist); thumb bend; thumb across the palm; spread. */
  const SHAPES = {
    straight: { c: [0.04, 0.04, 0.05, 0.06], tc: 0.05, to: 0.05, sp: 0 },
    relaxed: { c: [0.24, 0.3, 0.35, 0.42], tc: 0.2, to: 0.25, sp: 0.15 },
    open: { c: [0.1, 0.1, 0.12, 0.14], tc: 0.08, to: 0.15, sp: 0.5 },
    cupped: { c: [0.26, 0.26, 0.3, 0.32], tc: 0.15, to: 0.35, sp: 0.05 },
    grip: { c: [0.88, 0.94, 0.98, 1.02], tc: 0.55, to: 0.85, sp: 0 },
    pinch: { c: [0.5, 0.78, 0.88, 0.95], tc: 0.45, to: 1.0, sp: 0 },
    fist: { c: [0.98, 1.02, 1.04, 1.06], tc: 0.7, to: 0.75, sp: 0 },
    thumbOut: { c: [0.98, 1.02, 1.04, 1.06], tc: 0.0, to: 0.0, sp: 0 },
  };
  /** Where the hand points and which way the palm faces, in the body's own frame, written for the right hand (the left is its mirror). */
  const HANDS = {
    joined: { F: [0, 0.8, 0.6], N: [1, 0, 0], shape: 'straight' },            // palm to palm, fingers up and a little forward
    breast: { F: [1, -0.15, 0.1], N: [0, 0, -1], shape: 'straight' },        // flat on the breast below the other
    grip: { F: [0.15, -0.05, 1], N: [1, 0, 0.1], shape: 'grip' },            // round something held upright: a cruet, the bell's handle
    palmUp: { F: [0.3, 0, 1], N: [0, 1, 0], shape: 'cupped' },               // under a tray, the Missal, the towel
    altar: { F: [0.15, -0.1, 1], N: [0, -1, 0], shape: 'straight' },         // flat on the altar, or over the oblation
    orans: { F: [0.1, 1, 0.25], N: [1, 0, 0.45], shape: 'open' },            // raised, palms towards each other
    digits: { F: [0.2, -0.1, 1], N: [0, -1, 0], shape: 'pinch' },            // after the Consecration: thumb and forefinger together
    elevate: { F: [0.1, 1, 0.1], N: [1, 0, -0.3], shape: 'pinch' },
    offer: { F: [0.1, -0.2, 1], N: [0, -1, 0], shape: 'pinch' },             // fingers held out over the cruet
    rest: { F: [0, -1, 0.12], N: [1, 0, 0], shape: 'relaxed' },
    cross: { F: [0.05, 1, 0.2], N: [0, 0, -1], shape: 'straight' },          // the sign of the cross: open hand, palm to the body
    thumb: { F: [0.2, 0.5, 1], N: [1, 0, 0], shape: 'thumbOut' },            // the small crosses, made with the thumb
    strike: { F: [0.6, 0.6, 0.2], N: [0, 0, -1], shape: 'fist' },
    edge: { F: [0.45, 0, 0.9], N: [0.4, 0.9, 0], shape: 'pinch' },           // holding cloth by its edge, thumb on top
    bless: { F: [0, 1, 0.1], N: [1, 0, 0], shape: 'straight' },
    reach: { natural: true, shape: 'open' },                                  // going for something: an open hand along the arm
    take: { natural: true, shape: 'grip' },
    pinchAt: { natural: true, shape: 'pinch' },
  };
  const HELD = { bells: 'grip', wine: 'grip', water: 'grip', pitcher: 'grip', lighter: 'grip', sc: 'grip', ciborium: 'grip', biretta: 'edge', paten: 'edge', towel: 'palmUp' };
  const BASE = { joined: 'joined', orans: 'orans', onAltar: 'altar', overOblata: 'altar', fingers: 'digits', elevate: 'elevate', book: 'palmUp', holdChalice: { R: 'grip', L: 'palmUp' } };

  // scratch for the hands, so a frame makes no garbage
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qe = new THREE.Quaternion();
  const _f = V(0, 0, 0), _f2 = V(0, 0, 0), _n = V(0, 0, 0), _p = V(0, 0, 0), _down = V(0, -1, 0);

  let nextId = 1;
  const BODY = 0.36;      // how close two people's centres can come: shoulders touching

  class Figure {
    constructor(kind, opts = {}) {
      this.id = nextId++;
      this.kind = kind;
      this.name = opts.name || kind;
      this.root = new THREE.Group();
      this.root.name = this.name;
      this.scale = opts.scale || (kind === 'server' ? 0.84 : 1);
      this.body = new THREE.Group();
      this.body.scale.setScalar(this.scale);
      this.root.add(this.body);

      this.x = 0; this.z = 0; this.heading = 0; this.y = 0;
      this.legPose = LEGS.stand.slice();
      this.from = null;                 // leg transition in progress
      this.posture = 'stand';
      this.spinePitch = 0; this.neckPitch = 0; this.neckYaw = 0; this.spineYaw = 0;
      this.bowLevel = 0; this.bowTarget = null;
      this.nodT = 0; this.nodTarget = null;
      this.base = null;                 // priest's sustained arm pose
      this.held = { R: null, L: null, both: null, arm: null };
      this.out = false;                 // holding something out
      this.handT = { R: V(...ARMS.joined.R), L: V(...ARMS.joined.L) };
      this.gestures = [];
      this.walk = null; this.turn = null; this.legAnim = null;
      this.phase = 0;
      this.lift = null;                 // world point the left/right hand reaches for (chasuble, alb)
      this.pose = {};                   // what the player is moving by hand: R, L (world points), spine, neck (pitches)
      this.lookAt = null;
      this.build(kind, opts);
    }

    build(kind, opts) {
      const c = Object.assign({}, COLORS, opts.colors || {});
      const dress = kind === 'priest' ? c.alb : kind === 'server' ? c.cassock : (opts.coat || 0x5a6470);
      const legCol = kind === 'priest' ? c.alb : kind === 'server' ? c.cassock : (opts.trousers || 0x3b3f46);
      const skin = mat(opts.skin || c.skin, { roughness: 0.62 });
      const b = this.body;

      this.pelvis = new THREE.Group(); b.add(this.pelvis);
      const cloth = kind === 'priest' ? 'linen' : kind === 'server' ? 'wool' : 'coat';
      mesh(sharedGeo('pelvis', () => { const g = new THREE.SphereGeometry(0.165, 36, 24); g.scale(1, 0.72, 0.74); return g; }), mat(legCol, { tex: cloth }), this.pelvis, 0, 0.02, 0);
      this.legs = {};
      for (const side of ['R', 'L']) {
        const sx = side === 'R' ? -0.09 : 0.09;
        const hip = new THREE.Group(); hip.position.set(sx, 0, 0); this.pelvis.add(hip);
        mesh(sharedGeo('thigh', () => taper(0.082, 0.058, DIM.thigh)), mat(legCol, { tex: cloth }), hip, 0, -DIM.thigh / 2, 0);
        const knee = new THREE.Group(); knee.position.set(0, -DIM.thigh, 0); hip.add(knee);
        mesh(sharedGeo('calf', () => calfShape()), mat(legCol, { tex: cloth }), knee, 0, 0, 0);
        mesh(sharedGeo('shoe', () => shoeShape()), mat(c.shoe, { roughness: 0.32 }), knee, 0, -DIM.shin, 0);
        this.legs[side] = { hip, knee };
      }
      // the long garment below the waist, gathered in folds
      if (kind !== 'lay') {
        const R = kind === 'server' ? [0.145, 0.255, 8, 0.05] : [0.17, 0.3, 11, 0.09], H = DIM.hip - 0.04;
        this.skirtPivot = new THREE.Group(); this.pelvis.add(this.skirtPivot);
        const skirt = mesh(sharedGeo('robe-' + kind, () => robeShape(R[0], R[1], H, R[2], R[3])),
          mat(dress, { side: THREE.DoubleSide, roughness: kind === 'priest' ? 0.85 : 0.7, tex: cloth }), this.skirtPivot, 0, -H / 2, 0);
        this.skirt = skirt;
        if (kind === 'server') {
          // the cassock's buttons, down the front below the surplice
          const button = mat(0x16141a, { roughness: 0.35 });
          for (let t = 0.44; t < 0.985; t += 0.028) {
            const r = robeAt(R[0], R[1], R[2], R[3], t, 0);
            mesh(sharedGeo('button', () => new THREE.SphereGeometry(0.0055, 10, 8)), button, skirt, 0, H / 2 - t * H, r * 0.86 + 0.002);
          }
        } else {
          // lace at the foot of the alb
          mesh(sharedGeo('albLace', () => robeShape(R[1] * 0.98, R[1] * 1.01, 0.16, R[2], R[3], 0, true)), mat(c.alb, { side: THREE.DoubleSide, tex: 'lace', roughness: 0.8 }), skirt, 0, -H / 2 + 0.075, 0);
        }
      }

      this.spine = new THREE.Group(); this.pelvis.add(this.spine);
      const torsoCol = kind === 'lay' ? (opts.coat || 0x5a6470) : dress;
      mesh(sharedGeo('torso', () => torsoShape()), mat(torsoCol, { roughness: 0.75, tex: cloth }), this.spine, 0, 0, 0);

      this.neck = new THREE.Group(); this.neck.position.set(0, 0.6, 0); this.spine.add(this.neck);
      mesh(sharedGeo('neck', () => taper(0.05, 0.058, 0.12)), skin, this.neck, 0, 0.02, 0);
      mesh(sharedGeo('head', () => headShape()), skin, this.neck, 0, 0.145, 0.008);
      for (const s of [-1, 1]) {
        const ear = mesh(sharedGeo('ear', () => { const g = new THREE.TorusGeometry(0.017, 0.0065, 10, 24, Math.PI * 1.6); g.rotateZ(-Math.PI * 0.3); g.scale(0.62, 1.25, 1); return g; }), skin, this.neck, s * 0.093, 0.15, -0.004);
        ear.rotation.y = s * Math.PI / 2;
        mesh(sharedGeo('earLobe', () => { const g = new THREE.SphereGeometry(0.019, 20, 14); g.scale(0.36, 1.05, 0.7); return g; }), skin, this.neck, s * 0.092, 0.148, -0.004);
        mesh(sharedGeo('eyeWhite', () => { const g = new THREE.SphereGeometry(0.0145, 28, 20); g.scale(1, 0.72, 0.55); return g; }), mat(0xf2efe8, { roughness: 0.25 }), this.neck, s * 0.036, 0.162, 0.094);
        mesh(sharedGeo('iris', () => { const g = new THREE.SphereGeometry(0.0075, 20, 14); g.scale(1, 1, 0.5); return g; }), mat(opts.eye || 0x4a3420, { roughness: 0.15 }), this.neck, s * 0.036, 0.162, 0.1005);
        mesh(sharedGeo('pupil', () => { const g = new THREE.SphereGeometry(0.0034, 14, 10); g.scale(1, 1, 0.4); return g; }), mat(0x080605, { roughness: 0.1 }), this.neck, s * 0.036, 0.162, 0.1038);
        const lid = mesh(sharedGeo('lid', () => { const g = new THREE.SphereGeometry(0.0158, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42); g.scale(1, 0.78, 0.62); return g; }), skin, this.neck, s * 0.036, 0.1625, 0.093);
        lid.rotation.x = 0.35;
        const brow = mesh(sharedGeo('brow', () => new THREE.BoxGeometry(0.036, 0.0065, 0.008)), mat(opts.hair || c.hair), this.neck, s * 0.036, 0.181, 0.1); brow.rotation.z = s * -0.1;
      }
      mesh(sharedGeo('lips', () => { const g = new THREE.SphereGeometry(0.019, 28, 14); g.scale(1, 0.26, 0.4); return g; }), mat(opts.lips || 0xa8665a, { roughness: 0.5 }), this.neck, 0, 0.098, 0.1008);
      mesh(sharedGeo('hair-' + (opts.hairStyle || 'short'), () => hairShape(opts.hairStyle || 'short')), mat(opts.hair || c.hair, { roughness: 0.7, tex: 'hair' }), this.neck, 0, 0.145, 0.008);

      this.arms = {};
      const sleeve = kind === 'priest' ? c.alb : kind === 'server' ? c.cassock : (opts.coat || 0x5a6470);
      for (const side of ['R', 'L']) {
        const sx = side === 'R' ? -DIM.shoulderX : DIM.shoulderX, sgn = side === 'R' ? -1 : 1;
        const upper = new THREE.Group(); upper.position.set(sx, DIM.shoulderY, 0); this.spine.add(upper);
        const sl = mat(sleeve, { roughness: 0.75, tex: cloth });
        // the round of the shoulder is of whatever lies over it: the surplice, the chasuble, the coat
        const over = kind === 'server' ? mat(c.surplice, { tex: 'linen' }) : kind === 'priest' ? mat(opts.vestment || 0x0c3016, { roughness: 0.5, side: THREE.DoubleSide, tex: 'damask' }) : sl;
        mesh(sharedGeo('shoulder', () => { const g = new THREE.SphereGeometry(0.054, 28, 20); g.scale(1, 0.8, 1); return g; }), over, upper, 0, 0, 0);
        mesh(sharedGeo('upper', () => turned([[0.001, 0.036], [0.034, 0.029], [0.054, 0.0], [0.058, -0.08], [0.052, -0.18], [0.047, -DIM.upper]], 28, 1, 5)), sl, upper, 0, 0, 0);
        const elbow = new THREE.Group(); elbow.position.set(0, -DIM.upper, 0); upper.add(elbow);
        mesh(sharedGeo('elbowBall', () => new THREE.SphereGeometry(0.047, 24, 16)), sl, elbow, 0, 0, 0);
        mesh(sharedGeo('fore', () => turned([[0.047, 0], [0.049, -0.06], [0.042, -0.17], [0.036, -DIM.fore]], 28, 1, 5)), sl, elbow, 0, 0, 0);
        mesh(sharedGeo('cuff', () => taper(0.037, 0.038, 0.02)), mat(kind === 'lay' ? 0xece8dc : c.alb, { tex: 'linen' }), elbow, 0, -DIM.fore + 0.004, 0);
        const hand = new THREE.Group(); hand.position.set(0, -DIM.fore, 0); elbow.add(hand);
        this.hands = this.hands || {};
        this.hands[side] = buildHand(hand, skin, sgn);
        this.arms[side] = { upper, elbow, hand, shoulder: V(sx, DIM.shoulderY, 0), fore: V(0, -1, 0) };
        if (kind === 'server') {   // the surplice's wide sleeves, gathered at the shoulder, pleated, and edged with lace
          const lin = mat(c.surplice, { side: THREE.DoubleSide, tex: 'linen' });
          mesh(sharedGeo('surSleeve1', () => robeShape(0.052, 0.112, DIM.upper * 0.82, 11, 0.022, 0.6)), lin, upper, 0, -DIM.upper * 0.6, 0);      // from just below the joint, so that its top edge never rises through the yoke
          mesh(sharedGeo('surSleeve2', () => robeShape(0.106, 0.124, DIM.fore * 0.5, 11, 0.022, 0.6)), lin, elbow, 0, -DIM.fore * 0.22, 0);
          mesh(sharedGeo('sleeveLace', () => robeShape(0.124, 0.13, 0.06, 11, 0.022, 0.6, true)), mat(c.surplice, { side: THREE.DoubleSide, tex: 'lace' }), elbow, 0, -DIM.fore * 0.47 - 0.03, 0);
        }
      }

      if (kind === 'server') {
        // the surplice over the cassock, with a yoke at the neck and a band of lace at the hem
        mesh(sharedGeo('surplice', () => robeShape(0.19, 0.345, 0.82, 26, 0.03, 0.8, false, 0.64)), mat(c.surplice, { side: THREE.DoubleSide, tex: 'linen' }), this.spine, 0, 0.13, 0);      // flatter than it is wide: the arms come out of the sleeves in front of it
        // the yoke: rounded over the shoulders and lapping down over the top of the pleats
        mesh(sharedGeo('yoke', () => turned([[0.066, 0.068], [0.12, 0.058], [0.19, 0.028], [0.24, -0.035], [0.248, -0.062]], 56, 0.74, 5)), mat(c.surplice, { tex: 'linen', side: THREE.DoubleSide }), this.spine, 0, 0.55, 0);
        mesh(sharedGeo('lace', () => robeShape(0.347, 0.356, 0.11, 26, 0.03, 0.8, true, 0.64)), mat(c.surplice, { side: THREE.DoubleSide, tex: 'lace' }), this.spine, 0, 0.13 - 0.41 - 0.05, 0);
        // the cassock's collar, seen at the throat
        mesh(sharedGeo('collar', () => taper(0.062, 0.064, 0.05)), mat(c.cassock, { tex: 'wool' }), this.neck, 0, -0.02, 0);
      }
      if (kind === 'priest') {
        const vest = mat(opts.vestment || 0x0c3016, { roughness: 0.5, side: THREE.DoubleSide, tex: 'damask' });
        const gold = mat(0xffffff, { metalness: 0.55, roughness: 0.38, tex: 'gold' });
        // Roman (fiddleback) chasuble: panels shaped to the body, broad at the shoulders and hem, cut in at the waist
        this.chasuble = new THREE.Group(); this.spine.add(this.chasuble);
        const back = mesh(sharedGeo('chasBack', () => chasuble(0.29, 0.25, 0.31, 1.02, -1)), vest, this.chasuble, 0, 0.04, -0.17);
        const front = mesh(sharedGeo('chasFront', () => chasuble(0.26, 0.16, 0.25, 0.92, 1)), vest, this.chasuble, 0, 0.08, 0.17);
        mesh(sharedGeo('chasYoke', () => { const g = turned([[0.085, 0.062], [0.16, 0.048], [0.23, 0.008], [0.275, -0.06], [0.282, -0.1]], 56, 0.68, 5); return g; }), vest, this.chasuble, 0, 0.56, 0);
        mesh(sharedGeo('galBack', () => galloon(0.29, 0.25, 0.31, 1.02, -1)), gold, back, 0, 0, 0);
        mesh(sharedGeo('galFront', () => galloon(0.26, 0.16, 0.25, 0.92, 1)), gold, front, 0, 0, 0);
        mesh(sharedGeo('orphV', () => new THREE.BoxGeometry(0.09, 0.98, 0.006)), gold, back, 0, 0, -0.022);
        mesh(sharedGeo('orphH', () => { const g = new THREE.BoxGeometry(0.08, 0.4, 0.006); g.rotateZ(Math.PI / 2); return g; }), gold, back, 0, 0.26, -0.024);      // laid along its length, so the braid runs the right way
        mesh(sharedGeo('orphF', () => new THREE.BoxGeometry(0.1, 0.88, 0.006)), gold, front, 0, 0, 0.022);
        this.hem = new THREE.Object3D(); this.hem.position.set(0, -0.44, -0.2); this.chasuble.add(this.hem);
        this.albHem = new THREE.Object3D(); this.albHem.position.set(0, -DIM.hip + 0.1, 0.22); this.pelvis.add(this.albHem);
        // maniple on the left forearm
        this.maniple = mesh(sharedGeo('maniple', () => roundedBox(0.07, 0.34, 0.012, 0.004, 4)), vest, this.arms.L.elbow, 0.0, -0.17, 0.05);
        for (const y of [-0.15, 0.15]) {      // its ends: a band of braid, and the fringe below it
          mesh(sharedGeo('manBand', () => new THREE.BoxGeometry(0.074, 0.014, 0.014)), gold, this.maniple, 0, y, 0);
          mesh(sharedGeo('manFringe', () => { const g = new THREE.BoxGeometry(0.07, 0.022, 0.006, 14, 1, 1); return g; }), gold, this.maniple, 0, y + Math.sign(y) * 0.02, 0);
        }
        // biretta
        this.biretta = new THREE.Group(); this.neck.add(this.biretta); this.biretta.position.set(0, 0.235, -0.005);
        const bir = mat(c.biretta, { roughness: 0.55, tex: 'wool' });
        mesh(sharedGeo('birBase', () => roundedBox(0.2, 0.09, 0.2, 0.025, 6)), bir, this.biretta, 0, 0, 0);
        for (const [x, z, ry] of [[0, -0.05, 0], [-0.05, 0.03, Math.PI / 2], [0.05, 0.03, Math.PI / 2]]) {
          mesh(sharedGeo('birFin', () => roundedBox(0.16, 0.05, 0.012, 0.005, 4)), bir, this.biretta, x, 0.06, z).rotation.y = ry;
        }
        mesh(sharedGeo('birTuft', () => new THREE.SphereGeometry(0.025, 16, 12)), mat(c.biretta, { roughness: 0.9, tex: 'hair' }), this.biretta, 0, 0.1, 0);
        this.setBiretta(true);
        // collar of the amice
        mesh(sharedGeo('amice', () => new THREE.TorusGeometry(0.07, 0.02, 14, 48)), mat(c.alb, { tex: 'linen' }), this.neck, 0, 0.0, 0).rotation.x = Math.PI / 2;
      }
      if (kind === 'lay') {
        // shirt collar and a belt, so the clothes read as clothes
        mesh(sharedGeo('shirtCollar', () => taper(0.068, 0.078, 0.03)), mat(opts.collar || 0xe6e2d6, { tex: 'linen' }), this.neck, 0, -0.03, 0);
        mesh(sharedGeo('belt', () => { const g = new THREE.CylinderGeometry(0.152, 0.158, 0.035, 48); g.scale(1, 1, 0.76); return g; }), mat(0x201812, { roughness: 0.4 }), this.spine, 0, 0.03, 0);
      }
      this.applyLegs();
    }

    /** Who would this figure walk into, by moving to (x, z)? Moving away from someone is always allowed. */
    static blockedAt(self, x, z, w) {
      for (const o of Figure.bodies) {
        if (o === self || !o.root.visible || (w && w.ghost === o)) continue;
        const near = Math.hypot(x - o.x, z - o.z);
        if (near < BODY && near < Math.hypot(self.x - o.x, self.z - o.z)) return o;
      }
      return null;
    }
    /** One frame of walking. Slows to a stop, makes way, waits, finds another way, and settles for near enough when it must. */
    stepWalk(w, dt) {
      const finish = () => { this.walk = null; this.stepping = false; this.walkLook = null; this.blockedBy = null; this.blockedT = 0; w.resolve(); };
      while (w.route && w.route.length && Math.hypot(w.route[0][0] - this.x, w.route[0][1] - this.z) < 0.22) w.route.shift();
      const next = w.route && w.route.length ? w.route[0] : [w.x, w.z];
      const toGoal = Math.hypot(w.x - this.x, w.z - this.z);
      const dx = next[0] - this.x, dz = next[1] - this.z, d = Math.hypot(dx, dz);
      if (toGoal < 0.01) { this.x = w.x; this.z = w.z; return finish(); }
      const ux = dx / (d || 1), uz = dz / (d || 1);

      // the pace: a step or two to get going, easing off on arrival and when someone is just ahead
      let want = w.speed * Math.max(0.4, Math.min(1, toGoal / 0.5)) * (w.pacer ? w.pacer() : 1);      // walking with someone, at their pace
      for (const o of Figure.bodies) {
        if (o === this || !o.root.visible || w.ghost === o) continue;
        const ox = o.x - this.x, oz = o.z - this.z, od = Math.hypot(ox, oz);
        if (od < 1.2 && (ox * ux + oz * uz) / (od || 1) > 0.5) want *= Math.max(0.3, Math.min(1, (od - 0.36) / 0.6));
      }
      w.v = (w.v || 0) + Math.max(-dt * 3.5, Math.min(dt * 2.2, want - (w.v || 0)));      // nobody sets off or stops dead
      const step = Math.max(0, w.v) * dt;
      if (toGoal <= step && !(w.route && w.route.length)) { this.x = w.x; this.z = w.z; return finish(); }

      let mx = ux, mz = uz, stopped = false;
      const other = Figure.blockedAt(this, this.x + ux * step, this.z + uz * step, w);
      const kb = this.keepBehind, behind = kb && Math.hypot(this.x + ux * step - kb.x, this.z + uz * step - kb.z);
      const you = !this.isPlayer && Figure.bodies.find(o => o.isPlayer && o.root.visible);
      const toYou = you ? Math.hypot(this.x + ux * step - you.x, this.z + uz * step - you.z) : 9;
      // only someone in front, on the way: beside him, as at the next place along a step, is not in his way
      const inFront = you && ((you.x - this.x) * ux + (you.z - this.z) * uz) / (Math.hypot(you.x - this.x, you.z - this.z) || 1) > 0.8;
      const yielding = inFront && toYou < 0.6 && toYou < Math.hypot(this.x - you.x, this.z - you.z) && (w.yielded || 0) < 1;
      this.blockedBy = null;
      if (yielding) {                     // let you by, a moment; then on to his place, not left short of it
        w.yielded = (w.yielded || 0) + dt; stopped = true; this.walkLook = you;
        if (toGoal < 0.25) return finish();
      } else if (kb && !w.goRound && behind < 0.7 && behind < Math.hypot(this.x - kb.x, this.z - kb.z)) {
        // leave room for whoever is ahead, and wait; if they have plainly stopped there, settle near by or go round them
        stopped = true; this.walkLook = kb;
        w.heldT = kb.stepping ? 0 : (w.heldT || 0) + dt;
        if (!kb.stepping) { this.blockedBy = kb; this.blockedT = (this.blockedT || 0) + dt; }      // you have stopped in their way: that is standing in their way
        if (toGoal < 0.3) return finish();
        if (w.heldT > 1.6) { if (toGoal < 1.3) return finish(); w.goRound = true; }
      } else if (other) {
        // someone has about the spot we were going to: beside them will do
        if (toGoal < 0.55) return finish();
        let found = false;
        for (const a of [0.6, -0.6, 1.1, -1.1, 1.55, -1.55]) {
          const c = Math.cos(a), si = Math.sin(a), ax = ux * c + uz * si, az = uz * c - ux * si, nx = this.x + ax * step, nz = this.z + az * step;
          if (!Figure.blockedAt(this, nx, nz, w) && (!Figure.freeAt || Figure.freeAt(nx, nz))) { mx = ax; mz = az; found = true; break; }
        }
        if (!found) {
          stopped = true; this.walkLook = other; this.blockedBy = other; this.blockedT = (this.blockedT || 0) + dt;
          const stillThere = !other.stepping;
          // they are not going to move: near enough is near enough, or find another way round
          if (stillThere && this.blockedT > 0.35 && toGoal < 1.0) return finish();
          if (this.blockedT > 0.6 && (w.replanAt == null || this.blockedT - w.replanAt > 0.8) && Figure.replan) { w.replanAt = this.blockedT; const r = Figure.replan(this, w); if (r) { w.route = r; } }
          if (this.blockedT > 3 && !other.isPlayer) w.ghost = other;
        }
      } else { this.blockedT = 0; }
      if (stopped) { w.v = 0; this.stepping = false; return; }
      this.walkLook = null;
      this.x += mx * step; this.z += mz * step;
      this.stepping = step > 1e-5;
      if (!w.back) this.heading += wrap(Math.atan2(mx, mz) - this.heading) * Math.min(1, dt * 9);
      this.phase += step * 5.2;
    }

    /** Shoved: a stagger that passes, or with `fall` a lurch that stays. */
    stumble(fall) { if (fall) this.tilt = 0.42; else this.jolt = 0.5; }

    setBiretta(on) { if (this.biretta) this.biretta.visible = on; }
    setManiple(on) { if (this.maniple) this.maniple.visible = on; }

    // ── placement ────────────────────────────────────────────────────────────
    place(x, z, heading = this.heading) { this.x = x; this.z = z; this.heading = heading; }

    /** Walk in a straight line; resolves on arrival. opts.back walks backwards without turning. */
    walkTo(x, z, opts = {}) {
      return new Promise(resolve => { this.walk = { x, z, back: !!opts.back, look: opts.look || null, speed: opts.speed || 1.1, route: opts.route ? opts.route.slice() : null, pacer: opts.pacer || null, resolve }; });
    }
    /** Turn to a heading. dir: 'cw' (to the right, heading decreasing) | 'ccw' | undefined (shortest). */
    turnTo(h, dir) {
      let d = wrap(h - this.heading);
      if (dir === 'cw' && d > 0.02) d -= 2 * Math.PI;
      if (dir === 'ccw' && d < -0.02) d += 2 * Math.PI;
      if (Math.abs(d) < 0.01) return Promise.resolve(0);
      return new Promise(resolve => { this.turn = { to: this.heading + d, rate: 2.4 / Figure.slow, resolve, signed: d }; });
    }

    // ── legs ─────────────────────────────────────────────────────────────────
    legsTo(seq, dur) {
      // seq: list of pose names to pass through
      return new Promise(resolve => { this.legAnim = { from: this.legPose.slice(), seq: seq.map(n => LEGS[n]), t: 0, dur: dur * Figure.slow, resolve }; });
    }
    async kneel() {
      if (this.posture === 'kneel') return;
      this.posture = 'kneel';
      await this.legsTo(['gen', 'kneel'], 1.3);    // right knee first, then the left (SV p. 4)
    }
    async stand() {
      if (this.posture === 'stand') return;
      const from = this.posture;
      this.posture = 'stand';
      await this.legsTo(from === 'kneel' ? ['gen', 'stand'] : ['stand'], 1.1);    // the right leg leads
    }
    async genuflect() {
      await this.legsTo(['gen'], 0.7);      // down on the right knee, a moment there, and up: about two seconds
      await this.wait(0.35 * Figure.slow);
      await this.legsTo(['stand'], 0.7);
    }
    async genHold() { this.posture = 'genhold'; await this.legsTo(['gen'], 0.7); }
    async sit() { this.posture = 'sit'; await this.legsTo(['sit'], 1.0); }

    applyLegs() {
      const [hr, kr, hl, kl, py, pz] = this.legPose;
      this.legs.R.hip.rotation.x = -hr; this.legs.R.knee.rotation.x = kr;
      this.legs.L.hip.rotation.x = -hl; this.legs.L.knee.rotation.x = kl;
      this.pelvis.position.set(0, py, pz);
      if (this.skirt) {
        // keep the robe from poking forward through the floor when kneeling
        const k = 1 - (py - 0.5) / (DIM.hip - 0.5);
        this.skirtPivot.scale.set(1 + 0.15 * k, 1 - 0.45 * k, 1 + 0.35 * k);
      }
    }

    // ── bows, nods, gestures ─────────────────────────────────────────────────
    /** level: 0 none, 1 head, 2 moderate, 3 profound. target: world point to bow towards, or null (straight ahead). */
    bow(level, target) {
      this.bowLevel = level; this.bowTarget = target || null;
      return this.wait(0.75 * Figure.slow);
    }
    nod(target) { this.nodT = 1.0; this.nodTarget = target || null; return this.wait(1.0 * Figure.slow); }

    /** Play keyframes: [{t, R:[x,y,z]|'world:..', L, spine, neck}] over dur seconds. */
    gesture(keys, dur, opts = {}) {
      return new Promise(resolve => { this.gestures.push({ keys, dur: dur * Figure.slow, t: 0, resolve, onT: opts.onT || null, onTick: opts.onTick || null, hands: opts.hands || null, fired: new Set() }); });
    }
    wait(s) { return new Promise(resolve => { this.gestures.push({ keys: [], dur: s, t: 0, resolve, idle: true, fired: new Set() }); }); }

    /** The base hand targets, from what is held and the priest's sustained pose. */
    baseHands() {
      const h = this.held;
      if (this.base && ARMS[this.base] && !h.both && !(h.R || h.L)) return { R: ARMS[this.base].R, L: ARMS[this.base].L };
      if (this.base && ARMS[this.base] && (h.R || h.L) && (this.base === 'holdChalice' || this.base === 'elevate' || this.base === 'fingers'))
        return { R: ARMS[this.base].R, L: ARMS[this.base].L };
      const out = this.out ? 0.22 : 0;
      if (h.both) {
        const a = h.both.carry === 'book' ? ARMS.book : ARMS.carry;
        return { R: [a.R[0], a.R[1] + out * 0.3, a.R[2] + out], L: [a.L[0], a.L[1] + out * 0.3, a.L[2] + out] };
      }
      const down = out && this.kind === 'priest' ? 0.16 : 0;      // he holds it out down to a server's height, not at his face
      const R = h.R ? [ARMS.holdR[0], ARMS.holdR[1] - (this.outHand !== 'L' ? down : 0), ARMS.holdR[2] + (this.out && this.outHand !== 'L' ? out : 0)] : null;
      const L = h.L ? [ARMS.holdL[0], ARMS.holdL[1] - (this.outHand === 'L' ? down : 0), ARMS.holdL[2] + (this.out && this.outHand === 'L' ? out : 0)] : null;
      if (R && L) return { R, L };
      if (R) return { R, L: ARMS.flatL };
      if (L) return { R: ARMS.flatR, L };
      if (this.kind === 'lay') return ARMS.rest;
      if (this.out) return ARMS.out;   // fingers held out (holy water)
      return ARMS.joined;
    }

    /** The point a held thing is held at: in the hollow of the hand, just off the palm. */
    handWorld(side) {
      const v = V(0, -0.072, 0.024);
      this.hands[side].wrist.localToWorld(v);
      return v;
    }
    headWorld() { const v = V(0, 0.14, 0.05); this.neck.localToWorld(v); return v; }
    hemWorld() { const v = V(); if (this.hem) this.hem.getWorldPosition(v); return v; }
    albHemWorld() { const v = V(); if (this.albHem) this.albHem.getWorldPosition(v); return v; }

    // ── per-frame ────────────────────────────────────────────────────────────
    update(dt, heightAt) {
      // walking: a person's, with somewhere to get to, a way of getting there, and an eye on who else is about
      if (this.walk) this.stepWalk(this.walk, dt);
      else { this.stepping = false; this.walkLook = null; }
      if (this.turn) {
        const t = this.turn, d = t.to - this.heading, step = t.rate * dt;
        if (Math.abs(d) <= step) { this.heading = wrap(t.to); this.turn = null; t.resolve(t.signed); }
        else this.heading += Math.sign(d) * step;
      }
      if (!this.turn) this.heading = wrap(this.heading);
      // legs
      if (this.legAnim) {
        const a = this.legAnim;
        a.t += dt;
        const n = a.seq.length, f = Math.min(1, a.t / a.dur);
        const seg = Math.min(n - 1, Math.floor(f * n)), lf = ease(f * n - seg);
        const p0 = seg === 0 ? a.from : a.seq[seg - 1], p1 = a.seq[seg];
        this.legPose = p0.map((v, i) => lerp(v, p1[i], lf));
        if (f >= 1) { this.legPose = a.seq[n - 1].slice(); this.legAnim = null; a.resolve(); }
      }
      // legs walk only when the body is really going somewhere: whoever is waiting simply stands
      this.stepHold = this.stepping ? 0.08 : Math.max(0, (this.stepHold || 0) - dt);
      const moving = this.stepHold > 0;
      let pose = this.legPose.slice();
      if (moving && this.posture === 'stand' && !this.legAnim) {
        const s = Math.sin(this.phase), amp = 0.42;
        pose[0] = amp * s; pose[2] = -amp * s;
        pose[1] = Math.max(0, -s) * 0.55; pose[3] = Math.max(0, s) * 0.55;
        pose[4] = DIM.hip - Math.abs(s) * 0.015;
      }
      const saved = this.legPose; this.legPose = pose; this.applyLegs(); this.legPose = saved;
      // the robe swings with the stride and trails a little behind the walk
      if (this.skirtPivot) {
        const v = this.walk && this.walk.v ? this.walk.v : this.manualWalk ? 1 : 0, kk = Math.min(1, dt * 5);
        this.sway = (this.sway || 0) + ((moving ? Math.sin(this.phase) * 0.028 : 0) - (this.sway || 0)) * kk;
        this.drag = (this.drag || 0) + ((moving ? 0.045 * Math.min(1.2, v) : 0) - (this.drag || 0)) * Math.min(1, dt * 3);
        this.skirtPivot.rotation.set(this.drag, 0, this.sway);
      }

      // height follows the steps, smoothly
      const gh = heightAt ? heightAt(this.x, this.z) : 0;
      this.y += (gh - this.y) * Math.min(1, dt * 14);
      this.root.position.set(this.x, this.y + (this.rideY || 0), this.z);
      this.root.rotation.y = this.heading;
      if (this.tilt || this.jolt) {
        this.jolt = Math.max(0, (this.jolt || 0) - dt * 1.4);
        this.root.rotation.order = 'YXZ';
        this.root.rotation.x = (this.tilt || 0) + this.jolt * 0.35;
      } else if (this.root.rotation.x) this.root.rotation.x = 0;

      // bows
      const bowPitch = [0, 0.05, 0.42, 0.95][this.bowLevel] || 0;
      const neckBow = [0, 0.4, 0.25, 0.3][this.bowLevel] || 0;
      let spineYawT = 0;
      if (this.bowTarget && this.bowLevel) spineYawT = this.yawTo(this.bowTarget, 0.9);
      this.nodT = Math.max(0, this.nodT - dt / (1.0 * Figure.slow));
      const nodAmt = Math.sin(Math.min(1, (1 - this.nodT)) * Math.PI) * (this.nodT > 0 ? 0.5 : 0);
      let neckYawT = 0;
      if (this.nodT > 0 && this.nodTarget) neckYawT = this.yawTo(this.nodTarget, 1.1);
      else if (this.walkLook) neckYawT = this.yawTo(this.walkLook.headWorld(), 1.0);     // a glance at whoever is in the way
      else if (this.walk && this.walk.back && this.walk.look) neckYawT = this.yawTo(this.walk.look, 1.25);      // stepping backwards: looking over the shoulder at where the feet go
      else if (this.lookBack) neckYawT = this.lookBack;
      else if (this.lookAt) neckYawT = this.yawTo(this.lookAt, 1.0);

      // gestures
      let gHands = null, gSpine = null, gNeck = null;
      const gSpec = {}, gMoved = new Set();
      for (const g of this.gestures) {
        g.t += g.idle ? dt : dt * (this.tempo || 1);      // a pause is a pause; what the hands do goes at this person's own pace
        if (g.onTick) g.onTick(Math.min(1, g.t / g.dur));
        if (g.idle || !g.keys.length) continue;
        const f = Math.min(1, g.t / g.dur);
        const ks = g.keys;
        let i = 0; while (i < ks.length - 1 && ks[i + 1].t <= f) i++;
        const k0 = ks[i], k1 = ks[Math.min(ks.length - 1, i + 1)];
        const lf = k1 === k0 ? 1 : ease((f - k0.t) / (k1.t - k0.t));
        const pick = (side) => {
          const a = k0[side] != null ? this.resolve(k0[side]) : null, b = k1[side] != null ? this.resolve(k1[side]) : null;
          if (!a && !b) return null;
          const A = a || b, Bv = b || a;
          return [lerp(A[0], Bv[0], lf), lerp(A[1], Bv[1], lf), lerp(A[2], Bv[2], lf)];
        };
        gHands = gHands || {};
        const r = pick('R'), l = pick('L');
        if (r) { gHands.R = r; gMoved.add('R'); } if (l) { gHands.L = l; gMoved.add('L'); }
        const near = lf < 0.5 ? k0 : k1;      // how the hand lies: as the nearer key says, or as the gesture says throughout
        for (const sd of ['R', 'L']) { const sp = (near.hands && near.hands[sd]) || (g.hands && g.hands[sd]); if (sp) gSpec[sd] = sp; }
        if (k0.spine != null || k1.spine != null) gSpine = lerp(k0.spine != null ? k0.spine : k1.spine, k1.spine != null ? k1.spine : k0.spine, lf);
        if (k0.neck != null || k1.neck != null) gNeck = lerp(k0.neck != null ? k0.neck : k1.neck, k1.neck != null ? k1.neck : k0.neck, lf);
        if (g.onT) for (const [at, fn] of g.onT) if (f >= at && !g.fired.has(at)) { g.fired.add(at); fn(); }
      }
      for (const g of this.gestures.filter(g => g.t >= g.dur)) {
        if (g.onT) for (const [at, fn] of g.onT) if (!g.fired.has(at)) { g.fired.add(at); fn(); }
        g.resolve();
      }
      this.gestures = this.gestures.filter(g => g.t < g.dur);

      const k = Math.min(1, dt * 4.5 / Figure.slow);
      const kp = this.pose.spine != null || this.pose.neck != null ? Math.min(1, dt * 20) : k;
      this.spinePitch += ((this.pose.spine != null ? this.pose.spine : gSpine != null ? gSpine : bowPitch) - this.spinePitch) * kp;
      this.spineYaw += (spineYawT - this.spineYaw) * k;
      this.neckPitch += ((this.pose.neck != null ? this.pose.neck : gNeck != null ? gNeck : neckBow + nodAmt) - this.neckPitch) * kp;
      this.neckYaw += (neckYawT - this.neckYaw) * k;
      this.spine.rotation.set(this.spinePitch, this.spineYaw, 0, 'YXZ');
      this.neck.rotation.set(this.neckPitch, this.neckYaw, 0, 'YXZ');

      // hands
      const base = this.baseHands();
      let want = { R: base.R, L: base.L };
      if (this.lift) {
        const side = this.liftHand || 'L';
        want[side] = this.toSpine(this.lift());
      }
      if (gHands) want = { R: gHands.R || want.R, L: gHands.L || want.L };
      for (const side of ['R', 'L']) {
        if (this.pose[side]) want[side] = this.toSpine(this.pose[side]);      // your own hand on it
        const w = want[side], kh = Math.min(1, dt * (this.pose[side] ? 30 : 7 / Figure.slow));
        this.handT[side].x += (w[0] - this.handT[side].x) * kh;
        this.handT[side].y += (w[1] - this.handT[side].y) * kh;
        this.handT[side].z += (w[2] - this.handT[side].z) * kh;
      }
      this.solveArm('R'); this.solveArm('L');
      this.stepHands(dt, gSpec, gMoved);
    }

    /** Which way a hand lies now: what the gesture asks; else what it holds; else the pose the Mass keeps; else joined. */
    handPreset(side, spec, moved) {
      if (this.pose[side]) return 'reach';
      if (spec) return spec;
      const h = this.held, holding = h[side] || h.both;
      if (moved && !holding) return 'reach';
      const b = this.base && BASE[this.base];
      if (b && (!(h.R || h.L || h.both) || this.base === 'holdChalice' || this.base === 'elevate' || this.base === 'fingers')) return typeof b === 'string' ? b : b[side];
      if (h.both) return h.both.name === 'veil' ? 'edge' : 'palmUp';
      if (h[side]) return HELD[h[side].name] || 'grip';
      if (this.out) return 'offer';
      if (this.kind === 'lay') return 'rest';
      if (h.R || h.L) return 'breast';
      return 'joined';
    }
    /** Turn each hand at the wrist, within what a wrist can do, and shape it finger by finger; never all at once. */
    stepHands(dt, spec, moved) {
      const k = Math.min(1, dt * 9 / Figure.slow);
      for (const side of ['R', 'L']) {
        const H = this.hands[side], arm = this.arms[side], name = this.handPreset(side, spec[side], moved.has(side));
        const P = HANDS[name] || HANDS.joined, S = SHAPES[P.shape] || SHAPES.relaxed, m = side === 'L' ? -1 : 1, fore = arm.fore;
        const F = P.natural ? _f.copy(fore) : _f.set(P.F[0] * m, P.F[1], P.F[2]).normalize();
        const N = P.natural ? _n.set(m, -0.35, 0.1) : _n.set(P.N[0] * m, P.N[1], P.N[2]);
        const ang = F.angleTo(fore), lim = 1.15;
        if (ang > lim) {
          _p.copy(F).addScaledVector(fore, -F.dot(fore)); if (_p.lengthSq() < 1e-8) _p.set(0, 0, 1); _p.normalize();
          F.copy(fore).multiplyScalar(Math.cos(lim)).addScaledVector(_p, Math.sin(lim));
        }
        N.addScaledVector(F, -N.dot(F)); if (N.lengthSq() < 1e-6) N.set(0, 0, 1).addScaledVector(F, -F.z); N.normalize();
        _p.copy(F).cross(N).negate();
        _m.makeBasis(_p, _f2.copy(F).negate(), N);
        _q.setFromRotationMatrix(_m);
        _qe.copy(arm.upper.quaternion).multiply(arm.elbow.quaternion).invert();
        _q.premultiply(_qe);
        if (!H.set) { H.q.copy(_q); H.set = true; } else H.q.slerp(_q, k);
        H.wrist.quaternion.copy(H.q);
        for (let i = 0; i < 4; i++) H.curl[i] += (S.c[i] - H.curl[i]) * k;
        H.tc += (S.tc - H.tc) * k; H.to += (S.to - H.to) * k; H.sp += (S.sp - H.sp) * k;
        H.fingers.forEach((segs, i) => {
          const c = H.curl[i];
          segs[0].rotation.set(-c * 1.35, 0, H.s * (1.5 - i) * 0.09 * H.sp);
          segs[1].rotation.x = -c * 1.65; segs[2].rotation.x = -c * 1.05;
        });
        _f.set(H.s * 0.62, -0.72, 0.32).lerp(_n.set(-H.s * 0.12, -0.6, 0.79), H.to).normalize();
        H.thumb[0].quaternion.setFromUnitVectors(_down, _f);
        H.thumb[1].rotation.x = -H.tc * 0.9; H.thumb[2].rotation.x = -H.tc * 1.15;
      }
    }

    // ── being taken back to a moment ─────────────────────────────────────────
    /** All that this figure's next moment depends on, between beats, when nothing is under way. The rest update(0) works out again. */
    save() {
      return {
        x: this.x, z: this.z, y: this.y, heading: this.heading, legPose: this.legPose.slice(), posture: this.posture,
        spinePitch: this.spinePitch, neckPitch: this.neckPitch, neckYaw: this.neckYaw, spineYaw: this.spineYaw,
        bowLevel: this.bowLevel, bowTarget: this.bowTarget && this.bowTarget.clone(), nodT: this.nodT, nodTarget: this.nodTarget && this.nodTarget.clone(),
        base: this.base, held: Object.assign({}, this.held), out: this.out, outHand: this.outHand, handR: this.handT.R.clone(), handL: this.handT.L.clone(),
        phase: this.phase, stepHold: this.stepHold, lift: this.lift, liftHand: this.liftHand, patenFor: this.patenFor,
        birettaOn: !!this.biretta && this.biretta.visible, manipleOn: !!this.maniple && this.maniple.visible,
      };
    }
    load(s) {
      this.gestures = []; this.walk = null; this.turn = null; this.legAnim = null;      // whoever was waiting on these waits no longer
      this.stepping = false; this.walkLook = null; this.keepBehind = null; this.blockedBy = null; this.blockedT = 0;
      const { handR, handL, birettaOn, manipleOn, ...rest } = s;
      Object.assign(this, rest);
      this.legPose = s.legPose.slice(); this.held = Object.assign({}, s.held);
      this.bowTarget = s.bowTarget && s.bowTarget.clone(); this.nodTarget = s.nodTarget && s.nodTarget.clone();
      this.handT.R.copy(handR); this.handT.L.copy(handL);
      this.setBiretta(birettaOn); this.setManiple(manipleOn);
    }

    /** Spine-space coordinates of a world point (for reaching). */
    toSpine(world) {
      const v = world.clone();
      this.spine.worldToLocal(v);
      return [v.x, v.y, v.z];
    }
    resolve(t) { return typeof t === 'function' ? this.toSpine(t()) : t; }
    yawTo(p, limit) {
      const a = Math.atan2(p.x - this.x, p.z - this.z);
      return Math.max(-limit, Math.min(limit, wrap(a - this.heading)));
    }

    solveArm(side) {
      const arm = this.arms[side];
      const S = arm.shoulder, T = this.handT[side];
      const a = DIM.upper, b = DIM.fore + 0.04;
      const d = Math.max(0.06, Math.min(a + b - 0.002, T.distanceTo(S)));
      const n = T.clone().sub(S).normalize();
      const tt = S.clone().addScaledVector(n, d);
      const cosA = (a * a + d * d - b * b) / (2 * a * d);
      const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
      // elbows point down, out and a little back
      const pole = V(side === 'R' ? -0.35 : 0.35, -0.45, -0.25).add(S);
      const pv = pole.clone().sub(S); pv.addScaledVector(n, -pv.dot(n)); pv.normalize();
      const E = S.clone().addScaledVector(n, a * cosA).addScaledVector(pv, a * sinA);
      const down = V(0, -1, 0);
      const qU = new THREE.Quaternion().setFromUnitVectors(down, E.clone().sub(S).normalize());
      arm.upper.quaternion.copy(qU);
      const foreDir = tt.clone().sub(E).normalize();
      arm.fore.copy(foreDir);
      const fw = foreDir.applyQuaternion(qU.clone().invert());
      arm.elbow.quaternion.setFromUnitVectors(down, fw);
    }
  }

  Figure.bodies = [];
  Figure.slow = 1;      // how deliberately everyone moves: 1 is a person's natural pace at Mass; more is slower
  root.Figure = Figure;
  root.FigureDims = DIM;
})(typeof self !== 'undefined' ? self : this);
