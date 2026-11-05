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
    const key = color + JSON.stringify(opts);
    return MATS[key] || (MATS[key] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, metalness: 0 }, opts)));
  }
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
    fingers: { R: [-0.04, 0.2, 0.42], L: [0.04, 0.2, 0.42] },
    elevate: { R: [-0.05, 0.98, 0.16], L: [0.05, 0.98, 0.16] },
    book: { R: [-0.14, 0.22, 0.48], L: [0.14, 0.22, 0.48] },
    bellsLow: { R: [-0.2, 0.06, 0.2] },
  };

  // ── the body's shapes, shared between figures ──────────────────────────────
  const GEO = {};
  const sharedGeo = (key, make) => GEO[key] || (GEO[key] = make());
  const taper = (top, bottom, h, seg = 14) => new THREE.CylinderGeometry(top, bottom, h, seg);

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
    return turned([[0.0, -0.01], [0.15, 0.0], [0.142, 0.12], [0.15, 0.26], [0.172, 0.4], [0.17, 0.5], [0.13, 0.57], [0.07, 0.605], [0, 0.61]], 26, 0.72);
  }
  function calfShape() {
    const g = turned([[0.054, 0], [0.058, -0.1], [0.052, -0.26], [0.038, -DIM.shin + 0.02], [0.04, -DIM.shin]].map(([r, y]) => [r, y]), 14, 1, 3);
    g.computeVertexNormals();
    return g;
  }
  function shoeShape() {
    const g = new THREE.SphereGeometry(0.06, 16, 10);
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i), y = a.getY(i), z = a.getZ(i);
      a.setXYZ(i, x * 0.8 * (z > 0 ? 1 - z * 1.2 : 1), Math.max(-0.045, y * 0.72) + (z < 0 ? -z * 0.1 : 0), z * 2.15 + 0.05);
    }
    g.computeVertexNormals();
    return g;
  }
  /** A garment hanging from top radius to hem radius, with folds that deepen towards the hem. */
  function robeShape(top, hem, h, folds, depth) {
    const seg = 44, rings = 10, pos = [], idx = [];
    for (let j = 0; j <= rings; j++) {
      const t = j / rings, y = h / 2 - t * h, r = top + (hem - top) * Math.pow(t, 0.9);
      for (let i = 0; i <= seg; i++) {
        const a = i / seg * Math.PI * 2, deep = depth * t * t;
        const f = 1 + (deep / Math.max(0.05, r)) * Math.sin(a * folds + Math.sin(t * 2.4 + a * 2) * 0.8);
        pos.push(Math.sin(a) * r * f, y, Math.cos(a) * r * f * 0.86);
      }
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const p = j * (seg + 1) + i, q = p + seg + 1;
      idx.push(p, q, p + 1, p + 1, q, q + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  /** One face of a fiddleback chasuble, curved round the body. dir: +1 front, −1 back. */
  function chasuble(shoulder, waist, hem, h, dir) {
    const rows = 16, cols = 12, pos = [], idx = [];
    for (let j = 0; j <= rows; j++) {
      const t = j / rows, y = h / 2 - t * h;
      // broad at the shoulders, narrowed through the waist, opening to the rounded hem
      const k = t < 0.45 ? shoulder + (waist - shoulder) * Math.sin(t / 0.45 * Math.PI / 2) : waist + (hem - waist) * Math.sin((t - 0.45) / 0.55 * Math.PI / 2);
      const round = t > 0.92 ? Math.sqrt(Math.max(0.02, 1 - Math.pow((t - 0.92) / 0.08, 2))) : 1;
      for (let i = 0; i <= cols; i++) {
        const u = i / cols * 2 - 1, x = u * k * round;
        pos.push(x, y, dir * (0.018 - (x * x) * 0.55 + Math.sin(u * 5 + t * 2) * 0.004));
      }
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const p = j * (cols + 1) + i, q = p + cols + 1;
      if (dir > 0) idx.push(p, q, p + 1, p + 1, q, q + 1); else idx.push(p, p + 1, q, p + 1, q + 1, q);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  /** A head: a sphere pressed into a jaw, brow, sockets, nose, lips and chin. */
  function headShape() {
    const g = new THREE.SphereGeometry(0.1, 36, 28), a = g.attributes.position;
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
    const g = new THREE.SphereGeometry(0.106, 32, 22, 0, Math.PI * 2, 0, Math.PI * (style === 'long' ? 0.84 : 0.62)), a = g.attributes.position;
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
  /** A hand hanging from the wrist: palm, four fingers and a thumb. s: −1 right, +1 left. */
  function handShape(s) {
    const parts = [];
    const add = (geo, x, y, z, rz = 0, rx = 0) => { geo.rotateX(rx); geo.rotateZ(rz); geo.translate(x, y, z); parts.push(geo.index ? geo.toNonIndexed() : geo); };
    add(new THREE.BoxGeometry(0.058, 0.066, 0.024, 2, 2, 1), 0, -0.038, 0);
    for (let i = 0; i < 4; i++) {
      const fx = -0.021 + i * 0.014, L = [0.034, 0.042, 0.044, 0.038][s > 0 ? 3 - i : i];
      add(new THREE.CapsuleGeometry(0.0068, L, 2, 6), fx, -0.074 - L / 2, 0, 0, 0.1);
    }
    add(new THREE.CapsuleGeometry(0.0078, 0.026, 2, 6), -s * -0.036, -0.04, 0.008, -s * -0.55, 0.3);
    let n = 0; for (const g of parts) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
    for (const g of parts) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
    const G = new THREE.BufferGeometry(); G.setAttribute('position', new THREE.BufferAttribute(pos, 3)); G.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    return G;
  }

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
      mesh(sharedGeo('pelvis', () => { const g = new THREE.SphereGeometry(0.165, 18, 12); g.scale(1, 0.72, 0.74); return g; }), mat(legCol), this.pelvis, 0, 0.02, 0);
      this.legs = {};
      for (const side of ['R', 'L']) {
        const sx = side === 'R' ? -0.09 : 0.09;
        const hip = new THREE.Group(); hip.position.set(sx, 0, 0); this.pelvis.add(hip);
        mesh(sharedGeo('thigh', () => taper(0.082, 0.058, DIM.thigh)), mat(legCol), hip, 0, -DIM.thigh / 2, 0);
        const knee = new THREE.Group(); knee.position.set(0, -DIM.thigh, 0); hip.add(knee);
        mesh(sharedGeo('calf', () => calfShape()), mat(legCol), knee, 0, 0, 0);
        mesh(sharedGeo('shoe', () => shoeShape()), mat(c.shoe, { roughness: 0.32 }), knee, 0, -DIM.shin, 0);
        this.legs[side] = { hip, knee };
      }
      // the long garment below the waist, gathered in folds
      if (kind !== 'lay') {
        const skirt = mesh(sharedGeo('robe-' + kind, () => robeShape(kind === 'server' ? 0.145 : 0.17, kind === 'server' ? 0.255 : 0.3, DIM.hip - 0.04, kind === 'server' ? 8 : 11, kind === 'server' ? 0.05 : 0.09)),
          mat(dress, { side: THREE.DoubleSide, roughness: kind === 'priest' ? 0.85 : 0.7 }), this.pelvis, 0, -(DIM.hip - 0.04) / 2, 0);
        this.skirt = skirt;
      }

      this.spine = new THREE.Group(); this.pelvis.add(this.spine);
      const torsoCol = kind === 'lay' ? (opts.coat || 0x5a6470) : dress;
      mesh(sharedGeo('torso', () => torsoShape()), mat(torsoCol, { roughness: 0.75 }), this.spine, 0, 0, 0);

      this.neck = new THREE.Group(); this.neck.position.set(0, 0.6, 0); this.spine.add(this.neck);
      mesh(sharedGeo('neck', () => taper(0.05, 0.058, 0.12, 12)), skin, this.neck, 0, 0.02, 0);
      mesh(sharedGeo('head', () => headShape()), skin, this.neck, 0, 0.145, 0.008);
      for (const s of [-1, 1]) {
        mesh(sharedGeo('ear', () => { const g = new THREE.SphereGeometry(0.024, 10, 8); g.scale(0.42, 1.05, 0.72); return g; }), skin, this.neck, s * 0.094, 0.148, 0.0);
        mesh(sharedGeo('eyeWhite', () => { const g = new THREE.SphereGeometry(0.0145, 12, 10); g.scale(1, 0.72, 0.55); return g; }), mat(0xf2efe8, { roughness: 0.25 }), this.neck, s * 0.036, 0.162, 0.094);
        mesh(sharedGeo('iris', () => new THREE.SphereGeometry(0.0075, 10, 8)), mat(opts.eye || 0x2c2118, { roughness: 0.15 }), this.neck, s * 0.036, 0.162, 0.1012);
        const brow = mesh(sharedGeo('brow', () => new THREE.BoxGeometry(0.036, 0.0065, 0.008)), mat(opts.hair || c.hair), this.neck, s * 0.036, 0.181, 0.1); brow.rotation.z = s * -0.1;
      }
      mesh(sharedGeo('lips', () => { const g = new THREE.SphereGeometry(0.019, 12, 8); g.scale(1, 0.26, 0.4); return g; }), mat(opts.lips || 0xa8665a, { roughness: 0.5 }), this.neck, 0, 0.098, 0.1008);
      mesh(sharedGeo('hair-' + (opts.hairStyle || 'short'), () => hairShape(opts.hairStyle || 'short')), mat(opts.hair || c.hair, { roughness: 0.82 }), this.neck, 0, 0.145, 0.008);

      this.arms = {};
      const sleeve = kind === 'priest' ? c.alb : kind === 'server' ? c.cassock : (opts.coat || 0x5a6470);
      for (const side of ['R', 'L']) {
        const sx = side === 'R' ? -DIM.shoulderX : DIM.shoulderX, sgn = side === 'R' ? -1 : 1;
        const upper = new THREE.Group(); upper.position.set(sx, DIM.shoulderY, 0); this.spine.add(upper);
        mesh(sharedGeo('shoulder', () => new THREE.SphereGeometry(0.062, 14, 10)), mat(sleeve, { roughness: 0.75 }), upper, 0, 0, 0);
        mesh(sharedGeo('upper', () => taper(0.056, 0.046, DIM.upper, 12)), mat(sleeve, { roughness: 0.75 }), upper, 0, -DIM.upper / 2, 0);
        const elbow = new THREE.Group(); elbow.position.set(0, -DIM.upper, 0); upper.add(elbow);
        mesh(sharedGeo('elbowBall', () => new THREE.SphereGeometry(0.046, 12, 8)), mat(sleeve, { roughness: 0.75 }), elbow, 0, 0, 0);
        mesh(sharedGeo('fore', () => taper(0.046, 0.034, DIM.fore, 12)), mat(sleeve, { roughness: 0.75 }), elbow, 0, -DIM.fore / 2, 0);
        mesh(sharedGeo('cuff', () => taper(0.036, 0.036, 0.018, 12)), mat(kind === 'lay' ? 0xece8dc : c.alb), elbow, 0, -DIM.fore, 0);
        const hand = new THREE.Group(); hand.position.set(0, -DIM.fore, 0); elbow.add(hand);
        mesh(sharedGeo('hand-' + side, () => handShape(sgn)), skin, hand, 0, 0, 0);
        this.arms[side] = { upper, elbow, hand, shoulder: V(sx, DIM.shoulderY, 0) };
        if (kind === 'server') {   // the surplice's wide sleeves, gathered at the shoulder
          mesh(sharedGeo('surSleeve1', () => robeShape(0.07, 0.112, DIM.upper * 0.95, 7, 0.03)), mat(c.surplice, { side: THREE.DoubleSide }), upper, 0, -DIM.upper / 2, 0);
          mesh(sharedGeo('surSleeve2', () => robeShape(0.106, 0.122, DIM.fore * 0.55, 7, 0.03)), mat(c.surplice, { side: THREE.DoubleSide }), elbow, 0, -DIM.fore * 0.25, 0);
        }
      }

      if (kind === 'server') {
        // the surplice over the cassock, with a yoke at the neck and a band of lace at the hem
        mesh(sharedGeo('surplice', () => robeShape(0.2, 0.345, 0.9, 12, 0.05)), mat(c.surplice, { side: THREE.DoubleSide }), this.spine, 0, 0.09, 0);
        mesh(sharedGeo('yoke', () => { const g = new THREE.CylinderGeometry(0.075, 0.205, 0.075, 24); g.scale(1, 1, 0.82); return g; }), mat(c.surplice), this.spine, 0, 0.555, 0);
        mesh(sharedGeo('lace', () => { const g = robeShape(0.338, 0.35, 0.09, 12, 0.05); return g; }), mat(0xe6e2d6, { side: THREE.DoubleSide, transparent: true, opacity: 0.75 }), this.spine, 0, -0.32, 0);
        // the cassock's collar, seen at the throat
        mesh(sharedGeo('collar', () => taper(0.062, 0.064, 0.05, 16)), mat(c.cassock), this.neck, 0, -0.02, 0);
      }
      if (kind === 'priest') {
        const vest = mat(opts.vestment || 0x0c3016, { roughness: 0.5 });
        const gold = mat(c.gold, { metalness: 0.5, roughness: 0.4 });
        // Roman (fiddleback) chasuble: panels shaped to the body, broad at the shoulders and hem, cut in at the waist
        this.chasuble = new THREE.Group(); this.spine.add(this.chasuble);
        const back = mesh(sharedGeo('chasBack', () => chasuble(0.29, 0.25, 0.31, 1.02, -1)), vest, this.chasuble, 0, 0.04, -0.17);
        const front = mesh(sharedGeo('chasFront', () => chasuble(0.26, 0.16, 0.25, 0.92, 1)), vest, this.chasuble, 0, 0.08, 0.17);
        mesh(sharedGeo('chasYoke', () => { const g = new THREE.CylinderGeometry(0.09, 0.24, 0.06, 26); g.scale(1.08, 1, 0.8); return g; }), vest, this.chasuble, 0, 0.55, 0);
        mesh(sharedGeo('orphV', () => new THREE.BoxGeometry(0.09, 0.98, 0.006)), gold, back, 0, 0, -0.022);
        mesh(sharedGeo('orphH', () => new THREE.BoxGeometry(0.4, 0.08, 0.006)), gold, back, 0, 0.26, -0.022);
        mesh(sharedGeo('orphF', () => new THREE.BoxGeometry(0.1, 0.88, 0.006)), gold, front, 0, 0, 0.022);
        this.hem = new THREE.Object3D(); this.hem.position.set(0, -0.44, -0.2); this.chasuble.add(this.hem);
        this.albHem = new THREE.Object3D(); this.albHem.position.set(0, -DIM.hip + 0.1, 0.22); this.pelvis.add(this.albHem);
        // maniple on the left forearm
        this.maniple = mesh(sharedGeo('maniple', () => new THREE.BoxGeometry(0.07, 0.34, 0.02)), vest, this.arms.L.elbow, 0.0, -0.17, 0.05);
        // biretta
        this.biretta = new THREE.Group(); this.neck.add(this.biretta); this.biretta.position.set(0, 0.235, -0.005);
        mesh(sharedGeo('birBase', () => new THREE.BoxGeometry(0.2, 0.09, 0.2)), mat(c.biretta), this.biretta, 0, 0, 0);
        for (const [x, z, ry] of [[0, -0.05, 0], [-0.05, 0.03, Math.PI / 2], [0.05, 0.03, Math.PI / 2]]) {
          mesh(sharedGeo('birFin', () => new THREE.BoxGeometry(0.16, 0.05, 0.012)), mat(c.biretta), this.biretta, x, 0.06, z).rotation.y = ry;
        }
        mesh(sharedGeo('birTuft', () => new THREE.SphereGeometry(0.025, 8, 6)), mat(c.biretta), this.biretta, 0, 0.1, 0);
        this.setBiretta(true);
        // collar of the amice
        mesh(sharedGeo('amice', () => new THREE.TorusGeometry(0.07, 0.02, 8, 20)), mat(c.alb), this.neck, 0, 0.0, 0).rotation.x = Math.PI / 2;
      }
      if (kind === 'lay') {
        // shirt collar and a belt, so the clothes read as clothes
        mesh(sharedGeo('shirtCollar', () => taper(0.068, 0.078, 0.03, 16)), mat(opts.collar || 0xe6e2d6), this.neck, 0, -0.03, 0);
        mesh(sharedGeo('belt', () => { const g = new THREE.CylinderGeometry(0.152, 0.158, 0.035, 22); g.scale(1, 1, 0.76); return g; }), mat(0x201812, { roughness: 0.4 }), this.spine, 0, 0.03, 0);
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
      let want = w.speed * Math.max(0.4, Math.min(1, toGoal / 0.5));
      for (const o of Figure.bodies) {
        if (o === this || !o.root.visible || w.ghost === o) continue;
        const ox = o.x - this.x, oz = o.z - this.z, od = Math.hypot(ox, oz);
        if (od < 1.2 && (ox * ux + oz * uz) / (od || 1) > 0.5) want *= Math.max(0.3, Math.min(1, (od - 0.36) / 0.6));
      }
      w.v = (w.v || 0) + Math.max(-dt * 6, Math.min(dt * 4.5, want - (w.v || 0)));
      const step = Math.max(0, w.v) * dt;
      if (toGoal <= step && !(w.route && w.route.length)) { this.x = w.x; this.z = w.z; return finish(); }

      let mx = ux, mz = uz, stopped = false;
      const other = Figure.blockedAt(this, this.x + ux * step, this.z + uz * step, w);
      const kb = this.keepBehind, behind = kb && Math.hypot(this.x + ux * step - kb.x, this.z + uz * step - kb.z);
      const you = !this.isPlayer && Figure.bodies.find(o => o.isPlayer && o.root.visible);
      const toYou = you ? Math.hypot(this.x + ux * step - you.x, this.z + uz * step - you.z) : 9;
      const yielding = you && toYou < 0.6 && toYou < Math.hypot(this.x - you.x, this.z - you.z) && (w.yielded || 0) < 1;
      this.blockedBy = null;
      if (yielding) {                     // let you by, a moment
        w.yielded = (w.yielded || 0) + dt; stopped = true; this.walkLook = you;
        if (toGoal < 0.7) return finish();
      } else if (kb && !w.goRound && behind < 0.7 && behind < Math.hypot(this.x - kb.x, this.z - kb.z)) {
        // leave room for whoever is ahead, and wait; if they have plainly stopped there, settle near by or go round them
        stopped = true; this.walkLook = kb;
        w.heldT = kb.stepping ? 0 : (w.heldT || 0) + dt;
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
      return new Promise(resolve => { this.walk = { x, z, back: !!opts.back, speed: opts.speed || 1.25, route: opts.route ? opts.route.slice() : null, resolve }; });
    }
    /** Turn to a heading. dir: 'cw' (to the right, heading decreasing) | 'ccw' | undefined (shortest). */
    turnTo(h, dir) {
      let d = wrap(h - this.heading);
      if (dir === 'cw' && d > 0.02) d -= 2 * Math.PI;
      if (dir === 'ccw' && d < -0.02) d += 2 * Math.PI;
      if (Math.abs(d) < 0.01) return Promise.resolve(0);
      return new Promise(resolve => { this.turn = { to: this.heading + d, rate: 4.5, resolve, signed: d }; });
    }

    // ── legs ─────────────────────────────────────────────────────────────────
    legsTo(seq, dur) {
      // seq: list of pose names to pass through
      return new Promise(resolve => { this.legAnim = { from: this.legPose.slice(), seq: seq.map(n => LEGS[n]), t: 0, dur, resolve }; });
    }
    async kneel() {
      if (this.posture === 'kneel') return;
      this.posture = 'kneel';
      await this.legsTo(['gen', 'kneel'], 0.6);    // right knee first, then the left (SV p. 4)
    }
    async stand() {
      if (this.posture === 'stand') return;
      const from = this.posture;
      this.posture = 'stand';
      await this.legsTo(from === 'kneel' ? ['gen', 'stand'] : ['stand'], 0.5);    // the right leg leads
    }
    async genuflect() {
      await this.legsTo(['gen'], 0.38);
      await this.wait(0.12);
      await this.legsTo(['stand'], 0.38);
    }
    async genHold() { this.posture = 'genhold'; await this.legsTo(['gen'], 0.38); }
    async sit() { this.posture = 'sit'; await this.legsTo(['sit'], 0.5); }

    applyLegs() {
      const [hr, kr, hl, kl, py, pz] = this.legPose;
      this.legs.R.hip.rotation.x = -hr; this.legs.R.knee.rotation.x = kr;
      this.legs.L.hip.rotation.x = -hl; this.legs.L.knee.rotation.x = kl;
      this.pelvis.position.set(0, py, pz);
      if (this.skirt) {
        // keep the robe from poking forward through the floor when kneeling
        const k = 1 - (py - 0.5) / (DIM.hip - 0.5);
        this.skirt.scale.set(1 + 0.15 * k, 1 - 0.45 * k, 1 + 0.35 * k);
        this.skirt.position.y = -(DIM.hip - 0.04) * this.skirt.scale.y / 2;
      }
    }

    // ── bows, nods, gestures ─────────────────────────────────────────────────
    /** level: 0 none, 1 head, 2 moderate, 3 profound. target: world point to bow towards, or null (straight ahead). */
    bow(level, target) {
      this.bowLevel = level; this.bowTarget = target || null;
      return this.wait(0.35);
    }
    nod(target) { this.nodT = 1.0; this.nodTarget = target || null; return this.wait(0.7); }

    /** Play keyframes: [{t, R:[x,y,z]|'world:..', L, spine, neck}] over dur seconds. */
    gesture(keys, dur, opts = {}) {
      return new Promise(resolve => { this.gestures.push({ keys, dur, t: 0, resolve, onT: opts.onT || null, fired: new Set() }); });
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
      const R = h.R ? [ARMS.holdR[0], ARMS.holdR[1], ARMS.holdR[2] + (this.out && this.outHand !== 'L' ? out : 0)] : null;
      const L = h.L ? [ARMS.holdL[0], ARMS.holdL[1], ARMS.holdL[2] + (this.out && this.outHand === 'L' ? out : 0)] : null;
      if (R && L) return { R, L };
      if (R) return { R, L: ARMS.flatL };
      if (L) return { R: ARMS.flatR, L };
      if (this.kind === 'lay') return ARMS.rest;
      if (this.out) return ARMS.out;   // fingers held out (holy water)
      return ARMS.joined;
    }

    handWorld(side) {
      const v = V(0, -0.05, 0.0);
      this.arms[side].hand.localToWorld(v);
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
      this.nodT = Math.max(0, this.nodT - dt / 0.7);
      const nodAmt = Math.sin(Math.min(1, (1 - this.nodT)) * Math.PI) * (this.nodT > 0 ? 0.5 : 0);
      let neckYawT = 0;
      if (this.nodT > 0 && this.nodTarget) neckYawT = this.yawTo(this.nodTarget, 1.1);
      else if (this.walkLook) neckYawT = this.yawTo(this.walkLook.headWorld(), 1.0);     // a glance at whoever is in the way
      else if (this.lookAt) neckYawT = this.yawTo(this.lookAt, 1.0);

      // gestures
      let gHands = null, gSpine = null, gNeck = null;
      for (const g of this.gestures) {
        g.t += dt;
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
        if (r) gHands.R = r; if (l) gHands.L = l;
        if (k0.spine != null || k1.spine != null) gSpine = lerp(k0.spine != null ? k0.spine : k1.spine, k1.spine != null ? k1.spine : k0.spine, lf);
        if (k0.neck != null || k1.neck != null) gNeck = lerp(k0.neck != null ? k0.neck : k1.neck, k1.neck != null ? k1.neck : k0.neck, lf);
        if (g.onT) for (const [at, fn] of g.onT) if (f >= at && !g.fired.has(at)) { g.fired.add(at); fn(); }
      }
      for (const g of this.gestures.filter(g => g.t >= g.dur)) {
        if (g.onT) for (const [at, fn] of g.onT) if (!g.fired.has(at)) { g.fired.add(at); fn(); }
        g.resolve();
      }
      this.gestures = this.gestures.filter(g => g.t < g.dur);

      const k = Math.min(1, dt * 8);
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
        const w = want[side], kh = Math.min(1, dt * (this.pose[side] ? 30 : 12));
        this.handT[side].x += (w[0] - this.handT[side].x) * kh;
        this.handT[side].y += (w[1] - this.handT[side].y) * kh;
        this.handT[side].z += (w[2] - this.handT[side].z) * kh;
      }
      this.root.updateMatrixWorld(true);
      this.solveArm('R'); this.solveArm('L');
    }

    /** Spine-space coordinates of a world point (for reaching). */
    toSpine(world) {
      const v = world.clone();
      this.spine.updateMatrixWorld(true);
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
      const fw = tt.clone().sub(E).normalize().applyQuaternion(qU.clone().invert());
      arm.elbow.quaternion.setFromUnitVectors(down, fw);
    }
  }

  Figure.bodies = [];
  root.Figure = Figure;
  root.FigureDims = DIM;
})(typeof self !== 'undefined' ? self : this);
