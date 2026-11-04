/*
 * The rest of St. Vitus around the sanctuary: the nave, the sacristy hall, sacristy and servers' room, the
 * church's outside, the parish hall inside and out, the covered walk, and the parking lot and lawns.
 * The neighbourhood beyond is in outdoors.js.
 * Geometry comes from Plan; everything that does not move is merged into a few meshes so it stays fast on phones.
 */
(function (root) {
  'use strict';
  const THREE = root.THREE, Plan = root.Plan, Tex = root.Tex;
  const { CH, SITE } = Plan;

  // ── merging ────────────────────────────────────────────────────────────────
  class Batch {
    constructor(parent) { this.parent = parent; this.sets = new Map(); this.m = new THREE.Matrix4(); }
    /** Add a geometry, placed by a matrix, to the set for this material. */
    add(mat, geo, matrix, color) {
      const g = geo.index ? geo.toNonIndexed() : geo;
      if (matrix) g.applyMatrix4(matrix);
      if (!this.sets.has(mat)) this.sets.set(mat, []);
      this.sets.get(mat).push({ g, color });
    }
    /** A box whose texture keeps its scale, whatever the box's size. */
    box(mat, w, h, d, x, y, z, opts = {}) {
      const g = new THREE.BoxGeometry(w, h, d);
      const u = g.attributes.uv, k = opts.tex || 1;
      const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        u.setXY(i, u.getX(i) * sizes[f][0] / k, u.getY(i) * sizes[f][1] / k);
      }
      if (root.__boxes && !opts.rx && !opts.ry && !opts.rz) root.__boxes.push({ b: [x - w / 2, y - h / 2, z - d / 2, x + w / 2, y + h / 2, z + d / 2], m: mat.uuid });   // tests: shared surfaces
      const e = new THREE.Euler(opts.rx || 0, opts.ry || 0, opts.rz || 0);
      this.m.makeRotationFromEuler(e); this.m.setPosition(x, y, z);
      this.add(mat, g, this.m, opts.color);
    }
    rect(mat, [x0, z0, x1, z1], y0, y1, opts) { this.box(mat, x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, opts); }
    /** A flat rectangle lying on the ground. */
    flat(mat, [x0, z0, x1, z1], y, opts = {}) {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      const k = opts.tex || 1, u = g.attributes.uv;
      for (let i = 0; i < 4; i++) u.setXY(i, u.getX(i) * (x1 - x0) / k, u.getY(i) * (z1 - z0) / k);
      this.m.makeRotationX(-Math.PI / 2); this.m.setPosition((x0 + x1) / 2, y, (z0 + z1) / 2);
      this.add(mat, g, this.m);
    }
    cyl(mat, rt, rb, h, x, y, z, seg = 8) {
      this.m.makeTranslation(x, y, z);
      this.add(mat, new THREE.CylinderGeometry(rt, rb, h, seg), this.m);
    }
    /** Raw triangles: a flat list of [x,y,z] triples. */
    tris(mat, pts, color) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
      const uv = []; for (const p of pts) uv.push(p[0] / 2, p[2] / 2);
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      this.add(mat, g, null, color);
    }
    flush(receive) {
      for (const [mat, list] of this.sets) {
        let n = 0; for (const { g } of list) n += g.attributes.position.count;
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
        const col = mat.vertexColors ? new Float32Array(n * 3) : null;
        let o = 0;
        for (const { g, color } of list) {
          const c = g.attributes.position.count;
          pos.set(g.attributes.position.array, o * 3);
          if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
          if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
          if (col) { const k = new THREE.Color(color == null ? 0xffffff : color); for (let i = 0; i < c; i++) col.set([k.r, k.g, k.b], (o + i) * 3); }
          o += c;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const mesh = new THREE.Mesh(geo, mat);
        mesh.receiveShadow = !!receive; mesh.matrixAutoUpdate = false;
        if (mat.userData.layer != null) { mesh.renderOrder = mat.userData.layer; mesh.frustumCulled = false; }
        this.parent.add(mesh);
      }
      this.sets.clear();
    }
  }

  if (new URLSearchParams(typeof location !== 'undefined' ? location.search : '').has('test')) root.__boxes = [];
  const rng = seed => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

  function build(scene, W) {
    const M = W.M, canvasTex = W.canvasTex;
    const group = new THREE.Group(); scene.add(group);
    const outGroup = new THREE.Group(); group.add(outGroup);     // the grounds: hidden while the camera is fixed at the altar
    const S = new Batch(group), O = new Batch(outGroup);

    const oakMat = Tex.mat('oak', { color: 0xc49a70, rough: 0.55, normal: 0.35 });
    const plaster = M(0xeee7da, { roughness: 0.95 });
    const stucco = Tex.mat('stucco', { color: 0xe9d6ae, rough: 1, normal: 0.8 });
    const fasciaM = M(0x4f2e15, { roughness: 0.8 });
    const shingle = Tex.mat('shingle', { color: 0x8a8782, rough: 1 });
    const stone = Tex.mat('stone', { rough: 1, normal: 1.2 });
    const brick = Tex.mat('brick', { color: 0xc98f70, rough: 1 });
    const floorOak = Tex.mat('floorboard', { rough: 0.42, normal: 0.35 });
    // what lies on the ground is drawn first, in this order, so the layers can never flicker against each other
    const layer = (n, name, o) => { const m = Tex.mat(name, Object.assign({ rough: 1, depthWrite: false, side: THREE.DoubleSide }, o)); m.userData.layer = n; return m; };
    const grass = layer(-6, 'grass');
    const asphalt = layer(-5, 'asphalt', { color: 0x9a9a9a });
    const concrete = layer(-4, 'concrete', { color: 0xe6e2d6 });
    const mulch = layer(-3, 'mulch');
    const paint = new THREE.MeshStandardMaterial({ color: 0xdcdcd6, roughness: 1, depthWrite: false, side: THREE.DoubleSide }); paint.userData.layer = -2;
    const dark = M(0x1b1612, { roughness: 0.6 });
    const iron = M(0x15161a, { roughness: 0.5 });
    const white = M(0xf1efe8, { roughness: 0.7 });
    const glassOut = M(0x20262c, { roughness: 0.25, metalness: 0.2 });
    const windowIn = new THREE.MeshBasicMaterial({ color: 0xe8f1f5 });

    // ── floors ──────────────────────────────────────────────────────────────
    S.flat(floorOak, [-9.05, -2.6, 9.05, CH.backWall], 0, { tex: 2.4 });
    S.flat(Tex.mat('tile', { rough: 0.4 }), [-9.05, CH.backWall, 9.05, CH.west + 0.25], 0.002, { tex: 1.6 });
    S.flat(Tex.mat('carpet', { color: 0x8a8f9a, rough: 1 }), [CH.hall[0] - 0.35, CH.hall[1], CH.hall[2], CH.hall[3] + 0.3], 0.004, { tex: 1.2 });
    S.flat(M(0xc2bcae, { roughness: 0.7 }), CH.sacristy, 0.004);
    S.flat(Tex.mat('carpet', { color: 0x8f8476, rough: 1 }), [CH.servers[0], CH.servers[1] - 0.45, CH.servers[2], CH.servers[3]], 0.004, { tex: 1.2 });

    // ── walls ───────────────────────────────────────────────────────────────
    for (const r0 of Plan.WALLS) {
      const r = r0.slice(0, 4), kind = r0[4];
      // the sanctuary's own oak walls stand on the inner face of these: start behind them, so the two never share a surface
      if (kind === 'oak' && r[2] - r[0] < 0.4 && r[3] - r[1] > 0.3) { if (Math.abs(r[0] - CH.alcove) < 0.01) r[0] = CH.alcove + 0.1; if (Math.abs(r[2] + CH.alcove) < 0.01) r[2] = -CH.alcove - 0.1; }
      S.rect(kind === 'oak' ? oakMat : plaster, r, 0, kind === 'oak' ? CH.sanctuaryCeil : kind === 'hall' ? 3.5 : r[0] < -9.01 ? 3.2 : CH.eave, { tex: kind === 'oak' ? 1.6 : 2.4 });
    }
    // lintels over the doors, and door frames that stand proud of the wall so they read from both sides
    const FR = M(0x38210f, { roughness: 0.6 });
    for (const d of Plan.DOORS) {
      const top = d.id === 'servers' ? CH.sanctuaryCeil : d.id === 'sacristy' || d.id === 'hallOut' ? 3.2 : /^hall[FA]/.test(d.id) ? 3.5 : CH.eave;
      const head = d.glass ? 2.5 : 2.15, half = d.w / 2, off = d.out ? d.out * 0.08 : 0, depth = CH.t + (d.out ? 0.3 : 0.04);
      const mat = d.id === 'servers' ? oakMat : plaster;
      if (d.axis === 'x') {
        S.box(mat, d.w, top - head, CH.t, d.c, (top + head) / 2, d.at, { tex: 2.2 });
        for (const s of [-1, 1]) S.box(FR, 0.09, head, depth, d.c + s * half, head / 2, d.at + off);
        S.box(FR, d.w + 0.18, 0.11, depth, d.c, head + 0.05, d.at + off);
      } else {
        S.box(mat, CH.t, top - head, d.w, d.at, (top + head) / 2, d.c, { tex: 2.2 });
        for (const s of [-1, 1]) S.box(FR, depth, head, 0.09, d.at + off, head / 2, d.c + s * half);
        S.box(FR, depth, 0.11, d.w + 0.18, d.at + off, head + 0.05, d.c);
      }
    }
    // the opening in the wall between the nave and narthex
    S.box(plaster, 4.4, CH.eave - 2.75, 0.3, 0, (CH.eave + 2.75) / 2, CH.backWall);

    // ── the nave's ceiling and beams ───────────────────────────────────────
    const nv = { x: 8.85, e: CH.ceilEave, r: CH.ceilRidge };
    const naveCeil = new THREE.MeshStandardMaterial({ color: 0xefe9dc, emissive: 0x6e6a60, roughness: 1 });
    const slope = Math.atan2(nv.r - nv.e, nv.x), slopeLen = Math.hypot(nv.x, nv.r - nv.e);
    const ceilAt = x => nv.e + (nv.x - Math.abs(x)) * Math.tan(slope);
    for (const s of [-1, 1]) {
      S.box(naveCeil, slopeLen, 0.06, CH.backWall - CH.front + 0.3, s * nv.x / 2, (nv.e + nv.r) / 2, (CH.front + CH.backWall) / 2, { rz: -s * slope });
      for (let i = 0; i < 8; i++) {
        const z = 4.5 + i * 2.4;
        S.box(Tex.mat('oak', { color: 0x7d5534, rough: 0.5, normal: 0.3 }), slopeLen * 0.97, 0.34, 0.26, s * nv.x / 2, (nv.e + nv.r) / 2 - 0.16, z, { rz: -s * slope });
      }
    }
    for (let i = 0; i < 8; i++) S.box(plaster, 0.24, 0.5, 0.2, 0, nv.r - 0.32, 4.5 + i * 2.4);      // the white strip at the ridge

    // gable walls above the eaves: the panelled front, and the wall over the narthex opening
    const gable = (mat, z, depth, y0, half, peak, ex = 0, shoulder = y0) => {
      const sh = new THREE.Shape();
      sh.moveTo(-half, y0); sh.lineTo(half, y0); sh.lineTo(half, shoulder); sh.lineTo(0, peak); sh.lineTo(-half, shoulder); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
      S.add(mat, g, new THREE.Matrix4().makeTranslation(ex, 0, z - depth / 2));
    };
    const hAt41 = nv.x - (CH.sanctuaryCeil - nv.e) / Math.tan(slope);
    gable(oakMat, CH.front, 0.3, CH.sanctuaryCeil, hAt41, nv.r + 0.02);
    gable(plaster, CH.backWall, 0.3, nv.e, nv.x, nv.r + 0.02);

    // ── the panelled front: entablature, pediment, pilasters ───────────────
    const trim = Tex.mat('oak', { color: 0x8a6240, rough: 0.5, normal: 0.3 });
    S.box(trim, 13, 0.46, 0.2, 0, CH.sanctuaryCeil + 0.23, CH.front + 0.25);
    S.box(trim, 13.3, 0.1, 0.32, 0, CH.sanctuaryCeil + 0.5, CH.front + 0.28);
    { const sh = new THREE.Shape(); sh.moveTo(-3.3, 0); sh.quadraticCurveTo(0, 1.55, 3.3, 0); sh.closePath();
      S.add(trim, new THREE.ExtrudeGeometry(sh, { depth: 0.26, bevelEnabled: false }), new THREE.Matrix4().makeTranslation(0, CH.sanctuaryCeil + 0.55, CH.front + 0.13));
    }
    for (const s of [-1, 1]) {
      S.box(trim, 0.2, CH.sanctuaryCeil, 0.14, s * 5.3, CH.sanctuaryCeil / 2, CH.front + 0.22);    // pilasters either side of the plain panel
      S.box(trim, 0.34, CH.sanctuaryCeil, 0.14, s * 5.98, CH.sanctuaryCeil / 2, CH.front + 0.22);
      S.box(trim, 0.34, CH.sanctuaryCeil, 0.14, s * 8.17, CH.sanctuaryCeil / 2, CH.front + 0.22);
      S.box(trim, 1.84, 0.34, 0.1, s * 7.08, 2.6, CH.front + 0.2);                                  // the head of the bay
      S.box(oakMat, 0.45, 3.3, 0.03, s * 5.64, 1.85, CH.front + 0.175, { tex: 1.6 });                // the plain panel
    }
    // the sanctuary's own ceiling, and the capitals of its columns
    S.rect(trim, [-CH.alcove, -2.6, CH.alcove, CH.front - 0.15], CH.sanctuaryCeil, CH.sanctuaryCeil + 0.06);
        S.box(trim, 6.8, 0.24, 0.42, 0, CH.sanctuaryCeil - 0.12, 1.35);
    // the bays' low ceilings
    for (const s of [-1, 1]) S.rect(trim, [Math.min(s * CH.bay[0], s * CH.bay[1]), CH.bayBack, Math.max(s * CH.bay[0], s * CH.bay[1]), CH.front], 2.75, 2.85);

    // ── windows, stations, lanterns ────────────────────────────────────────
    const stained = (seed) => canvasTex(128, 256, (g, w, h) => {
      const r = rng(seed), cols = ['#b2223a', '#2456a6', '#e8b530', '#2a8d57', '#e4ebef', '#7c3a9b'];
      g.fillStyle = '#e4ebef'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.beginPath(); g.moveTo(r() * w, r() * h); for (let k = 0; k < 3; k++) g.lineTo(r() * w, r() * h); g.fill(); }
      g.strokeStyle = 'rgba(20,20,30,.5)'; g.lineWidth = 1.5; for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(r() * w, r() * h); g.lineTo(r() * w, r() * h); g.stroke(); }
    });
    const stainedM = [new THREE.MeshBasicMaterial({ map: stained(3) }), new THREE.MeshBasicMaterial({ map: stained(7) })];
    const WIN_Z = [8.0, 10.8, 13.6, 16.4, 19.2];
    for (const s of [-1, 1]) WIN_Z.forEach((z, i) => {
      if (s < 0 && z < SITE.addition[3] + 0.6) return;     // the sacristy stands against this stretch of wall
      const inner = s > 0 && (i === 1 || i === 3) ? stainedM[i === 1 ? 0 : 1] : windowIn;
      const x = s * 8.69;
      S.box(inner, 0.01, 2.3, 1.15, x - s * 0.02, 2.05, z);
      S.box(dark, 0.01, 2.4, 1.25, x, 2.05, z);
      S.box(glassOut, 0.02, 2.3, 1.15, s * 9.02, 2.05, z);
    });
    const plaqueM = M(0xc3a878, { roughness: 0.8 });
    const station = (x, z, ry) => {
      S.box(plaqueM, 0.42, 0.42, 0.06, x, 2.35, z, { ry });
      S.box(dark, 0.025, 0.2, 0.025, x, 1.92, z, { ry });
      S.box(dark, 0.12, 0.025, 0.025, x, 1.96, z, { ry });
    };
    for (const z of [6.6, 9.4, 12.2, 15, 17.8, 20.6]) { station(-8.66, z, Math.PI / 2); station(8.66, z, Math.PI / 2); }
    station(-7.6, CH.backWall - 0.18, 0); station(7.6, CH.backWall - 0.18, 0);

    const glow = new THREE.MeshBasicMaterial({ color: 0xffe6b0 });
    const lantern = M(0x35291e, { roughness: 0.5 });
    for (const s of [-1, 1]) for (const z of [5.7, 9.3, 12.9, 16.5, 20.1]) {
      const x = s * 4.5, top = ceilAt(x);
      S.cyl(lantern, 0.008, 0.008, top - 3.75, x, (top + 3.75) / 2, z, 4);
      S.cyl(glow, 0.17, 0.17, 0.52, x, 3.45, z, 8);
      for (const y of [3.17, 3.73]) S.cyl(lantern, 0.2, 0.2, 0.05, x, y, z, 8);
      for (let k = 0; k < 4; k++) S.box(lantern, 0.02, 0.52, 0.02, x + Math.cos(k * 1.57 + 0.78) * 0.18, 3.45, z + Math.sin(k * 1.57 + 0.78) * 0.18);
    }

    // ── pews, with the cross cut in each tall end ──────────────────────────
    const pew = Tex.mat('oak', { color: 0xa87c54, rough: 0.42, normal: 0.3 }), pewSeat = Tex.mat('oak', { color: 0x8a6240, rough: 0.38, normal: 0.3 }), kneeler = M(0x2e2622, { roughness: 0.9 });
    const P = Plan.PEWS;
    for (const s of [-1, 1]) for (let i = 0; i < P.rows; i++) {
      const z = P.z0 + i * P.step, x0 = P.x0, x1 = P.x1, cx = s * (x0 + x1) / 2, len = x1 - x0;
      S.box(pewSeat, len, 0.05, 0.42, cx, 0.45, z + 0.21);
      S.box(pew, len, 0.5, 0.05, cx, 0.68, z + 0.44);
      S.box(pew, len, 0.42, 0.04, cx, 0.22, z + 0.42);
      S.box(kneeler, len, 0.06, 0.2, cx, 0.17, z - 0.32);
      S.box(pew, 0.09, 1.15, 0.72, s * x0, 0.575, z + 0.14);        // aisle end, tall
      S.box(dark, 0.02, 0.26, 0.05, s * (x0 - 0.05), 0.82, z + 0.14);
      S.box(dark, 0.02, 0.05, 0.17, s * (x0 - 0.05), 0.87, z + 0.14);
      S.box(pew, 0.07, 1.0, 0.68, s * x1, 0.5, z + 0.14);
    }

    const paintSolid = M(0xe9e9e4, { roughness: 1 });
    // ── the back of the nave and the narthex ───────────────────────────────
    S.box(M(0x8b6a3a), 2.1, 1.1, 0.05, 0, 4.4, CH.backWall - 0.18);
    S.box(M(0x4d3a28), 1.9, 0.9, 0.06, 0, 4.4, CH.backWall - 0.19);
    for (const s of [-1, 1]) S.box(M(0xddd5c5), 0.45, 0.7, 0.08, s * 2.6, 4.3, CH.backWall - 0.18);
    S.rect(plaster, [-8.85, CH.backWall + 0.15, 8.85, CH.west - 0.15], 3.0, 3.06);
    for (const s of [-1, 1]) { S.box(M(0x38210f), 0.09, 2.75, 0.34, s * 2.2, 1.37, CH.backWall); S.box(M(0x8f2a2a), 0.3, 0.14, 0.03, s * 3.2, 2.5, CH.backWall + 0.17); }
    S.box(M(0x38210f), 4.5, 0.09, 0.34, 0, 2.75, CH.backWall);
    S.box(M(0x3a0a0e), 3.2, 0.012, 3, 0, 0.012, 24);     // a mat at the entrance
    S.box(M(0xbdb7a8), 0.32, 0.8, 0.32, -2.6, 0.4, 23.9); // holy-water stoups by the doors
    S.box(M(0xbdb7a8), 0.32, 0.8, 0.32, 2.6, 0.4, 23.9);

    // the right-hand bay: Our Mother of Perpetual Help, her kneeler; the baptismal font before it
    const IZ = CH.bayBack + 0.02;
    { const tex = canvasTex(256, 340, (g, w, h) => {
        g.fillStyle = '#b48a2c'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#1f2f63'; g.beginPath(); g.moveTo(w * 0.5, h * 0.1); g.quadraticCurveTo(w * 0.08, h * 0.2, w * 0.1, h); g.lineTo(w * 0.9, h); g.quadraticCurveTo(w * 0.92, h * 0.2, w * 0.5, h * 0.1); g.fill();
        g.fillStyle = '#7a1f22'; g.beginPath(); g.ellipse(w * 0.5, h * 0.72, w * 0.28, h * 0.26, 0, 0, 7); g.fill();
        g.fillStyle = '#c99a73'; g.beginPath(); g.ellipse(w * 0.5, h * 0.27, w * 0.11, h * 0.09, 0, 0, 7); g.fill();
        g.fillStyle = '#2d6e4c'; g.fillRect(w * 0.33, h * 0.5, w * 0.3, h * 0.27);
        g.fillStyle = '#c99a73'; g.beginPath(); g.arc(w * 0.47, h * 0.47, w * 0.075, 0, 7); g.fill();
        g.strokeStyle = '#e7c963'; g.lineWidth = 5; for (const [x, y, r] of [[0.5, 0.27, 0.15], [0.47, 0.47, 0.1]]) { g.beginPath(); g.arc(w * x, h * y, w * r, 0, 7); g.stroke(); }
      });
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      S.box(M(0x8f6f2a, { metalness: 0.5, roughness: 0.4 }), 0.92, 1.2, 0.05, 7.08, 1.75, IZ + 0.025);
      const icon = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.08), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
      icon.position.set(7.08, 1.75, IZ + 0.06); group.add(icon);
    }
    S.box(M(0x35200f), 0.9, 0.12, 0.28, 7.08, 0.2, 2.62);          // the kneeler
    S.box(M(0x35200f), 0.9, 0.82, 0.07, 7.08, 0.41, 2.32);
    S.box(M(0x35200f), 0.95, 0.05, 0.2, 7.08, 0.85, 2.32);
    const votive = (x0, x1, z, dimmed) => {                        // tiers of little candles in red glass
      S.box(M(0x2d1b0c), x1 - x0, 0.75, 0.32, (x0 + x1) / 2, 0.38, z);
      const n = Math.max(4, Math.round((x1 - x0) * 8));
      for (let row = 0; row < 3; row++) {
        const y = 0.78 + row * 0.13, zz = z + 0.1 - row * 0.1;
        S.box(M(0x2d1b0c), x1 - x0, 0.05, 0.11, (x0 + x1) / 2, y - 0.03, zz);
        for (let k = 0; k < n; k++) {
          const x = x0 + (x1 - x0) * (k + 0.5) / n;
          S.cyl(M(0x8c1520, { emissive: 0x7a1010, roughness: 0.3 }), 0.028, 0.028, 0.07, x, y + 0.03, zz, 6);
          if ((k + row * 2) % (dimmed ? 5 : 3) === 0) S.cyl(glow, 0.008, 0.012, 0.03, x, y + 0.08, zz, 5);
        }
      }
    };
    votive(7.75, 8.65, 3.4);                                       // the candles the laity light, right side
    votive(-8.6, -7.7, 3.28);                                      // and by the sacristy-hall door
    const fontStone = Tex.mat('concrete', { color: 0xc9c2b2, rough: 0.6, normal: 0.4 });
    S.cyl(fontStone, 0.32, 0.42, 0.12, 7.5, 0.06, 4.1, 16);
    S.cyl(fontStone, 0.16, 0.24, 0.7, 7.5, 0.47, 4.1, 16);
    S.cyl(fontStone, 0.46, 0.2, 0.22, 7.5, 0.93, 4.1, 16);
    S.cyl(M(0x35200f), 0.1, 0.47, 0.14, 7.5, 1.11, 4.1, 16);
    S.cyl(M(0xd4ad48, { metalness: 0.6 }), 0.018, 0.018, 0.14, 7.5, 1.25, 4.1, 6);
    // the hymn board on the right wall, as in the photograph of 1 Nov 2026
    { const tex = canvasTex(128, 200, (g, w, h) => {
        g.fillStyle = '#2d1c10'; g.fillRect(0, 0, w, h); g.fillStyle = '#efe9da'; g.font = '700 40px Georgia, serif'; g.textAlign = 'center';
        ['788', '809', '787'].forEach((t, i) => g.fillText(t, w / 2, 58 + i * 58));
      });
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      const b = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.98), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
      b.position.set(8.66, 2.15, 3.75); b.rotation.y = -Math.PI / 2; group.add(b);
    }
    // the left-hand bay: a statue on its pedestal and the gilded stand
    S.box(M(0x38210f), 0.45, 0.95, 0.45, -7.25, 0.47, 2.45);
    const figStone = M(0xcfc4ae, { roughness: 0.6 });
    S.cyl(figStone, 0.1, 0.17, 0.85, -7.25, 1.37, 2.45, 12); S.cyl(figStone, 0.08, 0.09, 0.17, -7.25, 1.88, 2.45, 12);
    const gilt = M(0xc9a23a, { metalness: 0.75, roughness: 0.35 });
    S.cyl(gilt, 0.05, 0.16, 0.08, -6.42, 0.04, 2.47, 10); S.cyl(gilt, 0.03, 0.03, 1.0, -6.42, 0.55, 2.47, 8); S.cyl(gilt, 0.17, 0.05, 0.1, -6.42, 1.08, 2.47, 10);

    // confessionals against the side walls: a door either side of the curtained stall
    const confessional = (face, x0, x1, z0, z1) => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, L = z1 - z0, fx = face > 0 ? x1 : x0;
      S.box(oakMat, x1 - x0, 2.45, L, cx, 1.22, cz, { tex: 1.6 });
      S.box(trim, x1 - x0 + 0.1, 0.16, L + 0.12, cx, 2.5, cz);
      const third = L / 3;
      for (const [zz, curtain] of [[z0 + third / 2, false], [cz, true], [z1 - third / 2, false]]) {
        S.box(curtain ? M(0x3a0a0e, { roughness: 0.9 }) : trim, 0.04, 2.1, third - 0.14, fx + face * 0.015, 1.1, zz);
        if (!curtain) { S.box(pull0, 0.05, 0.03, 0.03, fx + face * 0.05, 1.02, zz + third * 0.32); S.box(M(0xd8c497), 0.02, 0.24, 0.03, fx + face * 0.04, 1.8, zz); S.box(M(0xd8c497), 0.02, 0.03, 0.14, fx + face * 0.04, 1.86, zz); }
        else for (let k = 0; k < 6; k++) S.box(M(0x24060a, { roughness: 0.9 }), 0.012, 2.05, 0.03, fx + face * 0.04, 1.1, zz - third * 0.36 + k * third * 0.145);
      }
    };
    const pull0 = M(0xc9b070, { metalness: 0.7, roughness: 0.3 });
    confessional(-1, 7.55, 8.7, 6.6, 9.3);
    confessional(1, -8.7, -7.55, 9.2, 11.9);

    // the choir benches: along the side walls, one end touching the back wall
    for (const s of [-1, 1]) {
      const zc = (-2.3 - 0.95) / 2, L = 1.35, seat = M(0x35200f, { roughness: 0.5 });
      S.box(seat, 0.34, 0.06, L, s * 5.03, 0.46, zc);
      S.box(seat, 0.05, 0.62, L, s * 5.17, 0.8, zc);
      for (const z of [-2.27, -0.98]) S.box(seat, 0.3, 0.44, 0.05, s * 5.03, 0.22, z);
      S.box(seat, 0.3, 0.3, 0.05, s * 5.03, 0.62, -0.98);
    }

    // ── the sacristy hall: framed pictures on the right as you come in ─────
    const ceil = new THREE.MeshStandardMaterial({ color: 0xf2efe6, emissive: 0x77746c, roughness: 1 });
    S.rect(ceil, [CH.hall[0], CH.hall[1], CH.hall[2], CH.hall[3] + 0.3], CH.roomCeil, CH.roomCeil + 0.05);
    S.rect(ceil, [CH.sacristy[0], CH.sacristy[1] + 0.01, CH.sacristy[2], CH.sacristy[3]], CH.roomCeil, CH.roomCeil + 0.05);
    S.rect(ceil, CH.servers, CH.roomCeil, CH.roomCeil + 0.05);
    const frameM = M(0xa98a48, { metalness: 0.4, roughness: 0.5 });
    [[-9.75, 0], [-10.7, 1], [-11.65, 2]].forEach(([x, i]) => {
      S.box(frameM, 0.56, 0.72, 0.04, x, 1.6, CH.hall[1] + 0.02);
      S.box(M([0x6f6a60, 0x7d7464, 0x5e6a72][i]), 0.46, 0.62, 0.02, x, 1.6, CH.hall[1] + 0.045);
      S.box(M(0xdcd4c2), 0.15, 0.2, 0.015, x, 1.72, CH.hall[1] + 0.055);   // a head and shoulders only suggested
    });

    // ── the sacristy: as you come in, the vault left, cabinets ahead, fridge and sink right, audio behind ──
    const cab = M(0x4a3620, { roughness: 0.55 }), counter = M(0x2b2015, { roughness: 0.45 }), pull = M(0xc9c4b8, { metalness: 0.6 });
    const SC = CH.sacristy, far = SC[3];
    const cabLen = SC[2] - SC[0], cabCx = (SC[0] + SC[2]) / 2;
    S.box(cab, cabLen, 0.88, 0.62, cabCx, 0.44, far - 0.32);              // wide drawers under the table
    S.box(counter, cabLen + 0.04, 0.04, 0.68, cabCx, 0.91, far - 0.35);   // the vesting table
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) {
      const dx = cabLen / 4, x = SC[0] + dx * (i + 0.5), y = 0.18 + row * 0.27;
      S.box(M(0x3e2c19, { roughness: 0.5 }), dx - 0.05, 0.23, 0.02, x, y, far - 0.64);
      S.box(pull, 0.28, 0.02, 0.03, x, y, far - 0.66);
    }
    S.box(cab, cabLen, 0.9, 0.4, cabCx, 1.95, far - 0.2);                 // tall cabinets above, out of easy reach
    for (let i = 0; i < 4; i++) { const dx = cabLen / 4, x = SC[0] + dx * (i + 0.5); S.box(M(0x3e2c19), dx - 0.05, 0.84, 0.02, x, 1.95, far - 0.41); S.box(pull, 0.02, 0.14, 0.03, x + dx * 0.32, 1.6, far - 0.43); }
    // the cross the servers bow to, and a chasuble laid out
    S.box(M(0x3d2715), 0.04, 0.46, 0.03, -10.8, 2.05, far - 0.44);
    S.box(M(0x3d2715), 0.28, 0.04, 0.03, -10.8, 2.13, far - 0.44);
    S.box(M(0xd4ad48, { metalness: 0.5 }), 0.06, 0.2, 0.03, -10.8, 2.1, far - 0.45);
    S.box(M(0x7d1a21, { roughness: 0.6 }), 0.75, 0.012, 0.5, -11.7, 0.94, far - 0.34);
    S.box(M(0xd4ad48, { metalness: 0.4 }), 0.75, 0.014, 0.12, -11.7, 0.942, far - 0.34);
    // to the left on entering, the big vault
    const vault = M(0x5e6266, { metalness: 0.5, roughness: 0.45 });
    S.rect(vault, [-9.65, 5.35, -9, 7.3], 0, 2.15);
    S.box(M(0x4b4e52, { metalness: 0.6 }), 0.03, 1.8, 1.1, -9.67, 1.05, 6.32);
    S.cyl(M(0xcfcab9, { metalness: 0.8, roughness: 0.3 }), 0.13, 0.13, 0.05, -9.7, 1.15, 6.0, 16);
    for (const a of [0, 2.1, 4.2]) S.box(M(0xcfcab9, { metalness: 0.8 }), 0.16, 0.03, 0.03, -9.75, 1.15 + Math.sin(a) * 0.12, 6.0 + Math.cos(a) * 0.12);
    // to the right, the fridge for the wine and water, and the priest's sink
    const fridge = M(0xe6e6e2, { roughness: 0.35 });
    S.rect(fridge, [-12.6, 6.75, -12.0, 7.5], 0, 1.75);
    S.box(pull, 0.03, 0.5, 0.03, -11.98, 1.2, 6.9);
    S.box(M(0x90918f), 0.012, 0.012, 0.75, -11.995, 1.2, 7.12);
    S.rect(cab, [-12.6, 5.5, -12.05, 6.7], 0, 0.86);
    S.rect(M(0xd9d4c8, { roughness: 0.35 }), [-12.6, 5.45, -12.0, 6.72], 0.86, 0.9);
    S.rect(M(0xf4f4f0, { roughness: 0.2 }), [-12.5, 5.75, -12.1, 6.4], 0.885, 0.905);
    S.cyl(M(0xc8c8c8, { metalness: 0.9, roughness: 0.2 }), 0.012, 0.012, 0.2, -12.52, 1.0, 6.08, 8);
    S.box(M(0xc8c8c8, { metalness: 0.9, roughness: 0.2 }), 0.16, 0.025, 0.025, -12.44, 1.1, 6.08);
    S.box(M(0xdedbd0), 0.02, 0.65, 0.5, -12.58, 1.55, 6.08);
    // turning right again, on the door's own wall, the stacks of audio equipment
    for (const [x0, x1, h] of [[-12.55, -12.15, 1.65], [-12.13, -11.75, 1.25], [-11.73, -11.35, 1.45]]) {
      S.rect(M(0x1d1e22, { roughness: 0.5 }), [x0, 5.05, x1, 5.45], 0, h);
      for (let y = 0.2; y < h - 0.08; y += 0.17) {
        S.box(M(0x303238, { metalness: 0.4 }), x1 - x0 - 0.06, 0.12, 0.015, (x0 + x1) / 2, y, 5.46);
        S.box(new THREE.MeshBasicMaterial({ color: y % 0.34 > 0.17 ? 0x46d17a : 0xe9a23b }), 0.012, 0.012, 0.012, x0 + 0.08, y + 0.03, 5.47);
      }
    }

    // ── the changing room: cassocks, candle lighters, incense ──────────────
    S.rect(M(0x9b9385, { metalness: 0.5 }), [7.95, -1.95, 8.0, 0.55], 1.8, 1.83);
    for (let i = 0; i < 9; i++) {
      const z = -1.85 + i * 0.29, sur = i % 2;
      S.box(M(0x15151b, { roughness: 0.9 }), 0.36, 1.2, 0.2, 8.2, 1.15, z);
      if (sur) S.box(M(0xf4f2ea, { roughness: 0.9 }), 0.38, 0.62, 0.24, 8.2, 1.45, z);
    }
    S.rect(M(0x3e2c19), [5.65, -2.6, 6.85, -2.1], 0, 0.85);
    S.rect(M(0x3e2c19), [5.65, -2.6, 6.85, -2.25], 1.45, 1.49);
    for (const x of [5.72, 5.86, 6.0]) {
      S.cyl(M(0xb8a35e, { metalness: 0.6 }), 0.012, 0.012, 2.05, x, 1.02, -2.5, 6);
      S.cyl(M(0xf2ead6), 0.012, 0.012, 0.1, x, 2.09, -2.5, 6);
    }
    S.cyl(M(0xb79a4a, { metalness: 0.7, roughness: 0.35 }), 0.09, 0.07, 0.16, 6.55, 0.94, -2.35, 10);   // thurible
    S.cyl(M(0xb79a4a, { metalness: 0.7, roughness: 0.35 }), 0.03, 0.09, 0.1, 6.55, 1.07, -2.35, 10);
    S.box(M(0xb79a4a, { metalness: 0.6 }), 0.14, 0.09, 0.09, 6.25, 0.9, -2.35);                         // incense boat
    S.rect(M(0x2d1f12), [5.65, 0.5, 6.05, 1.7], 0.42, 0.47);
    S.rect(M(0x2d1f12), [5.7, 0.55, 6.0, 1.65], 0, 0.42);

    // ── outside the church ─────────────────────────────────────────────────
    // railings and fences
    const picket = (f, h, step, mat, rail) => {
      const [ax, az] = f.from, [bx, bz] = f.to, L = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bx - ax, bz - az);
      const n = Math.max(1, Math.round(L / step));
      for (let i = 0; i <= n; i++) S.box(mat, 0.06, h, 0.03, ax + (bx - ax) * i / n, h / 2, az + (bz - az) * i / n, { ry: ang + Math.PI / 2 });
      for (const y of rail) S.box(mat, 0.03, 0.05, L, (ax + bx) / 2, y, (az + bz) / 2, { ry: ang });
    };
    const SK = 0.03;  // skins sit just proud of the structural walls
    const skinX = (mat, x, z0, z1, y0, y1, tex = 2) => S.box(mat, SK, y1 - y0, z1 - z0, x, (y0 + y1) / 2, (z0 + z1) / 2, { tex });
    const skinZ = (mat, z, x0, x1, y0, y1, tex = 2) => S.box(mat, x1 - x0, y1 - y0, SK, (x0 + x1) / 2, (y0 + y1) / 2, z, { tex });

    // south wall: stone at the west end, stucco on, with its doors
    const gapS = Plan.DOORS.filter(d => d.axis === 'z' && d.at === 8.85).map(d => [d.c - d.w / 2, d.c + d.w / 2]).sort((a, b) => a[0] - b[0]);
    let from = CH.east;
    for (const [a, b] of gapS) { skinX(stucco, 9.01, from, a, 0, CH.eave); from = b; skinX(stucco, 9.01, a, b, 2.2, CH.eave); }
    skinX(stucco, 9.01, from, 17, 0, CH.eave);
    skinX(stone, 9.04, 17, CH.west + 0.1, 0, 3.1, 1.4);
    skinX(stucco, 9.01, 17, CH.west, 3.1, CH.eave);
    S.box(glassOut, 0.03, 1.9, 3.3, 9.07, 1.45, 21.6);      // the big picture window
    for (const z of [19.9, 21.6, 23.3]) S.box(dark, 0.04, 1.96, 0.07, 9.08, 1.45, z);
    for (const y of [0.5, 2.4]) S.box(dark, 0.04, 0.07, 3.4, 9.08, y, 21.6);
    for (const z of [18.0, 25.2]) S.box(glassOut, 0.03, 1.2, 0.55, 9.07, 1.9, z);
    S.box(M(0xe2dccb), 0.06, 2.1, 1.0, 9.03, 1.05, 1.0);    // the white door seen from Superior, its use not yet known
    S.box(M(0xe2dccb), 0.06, 2.0, 1.0, 9.03, 1.0, -1.4);    // and the white arched one
    { const g = new THREE.CylinderGeometry(0.5, 0.5, 0.06, 14, 1, false, 0, Math.PI); g.rotateX(Math.PI / 2); g.rotateY(Math.PI / 2); S.add(M(0xe2dccb), g, new THREE.Matrix4().makeTranslation(9.03, 2.0, -1.4)); }
    // low wooden fascia running round the stone wing
    S.rect(fasciaM, [8.9, 16.8, 9.8, CH.west + 0.9], 3.1, 3.3);
    S.rect(M(0x9c8e78), [8.9, 16.8, 9.75, CH.west + 0.85], 3.3, 3.33);

    // north wall, the flat-roofed section with the hall's outside door, the east end with the changing room's
    const ADD = SITE.addition, hallOut = Plan.DOORS.find(d => d.id === 'hallOut'), srvOut = Plan.DOORS.find(d => d.id === 'serversOut');
    skinX(stucco, -9.01, ADD[3], CH.west, 0, CH.eave);
    const hg0 = hallOut.c - hallOut.w / 2, hg1 = hallOut.c + hallOut.w / 2;
    skinX(stucco, ADD[0] - 0.01, ADD[1], hg0, 0, 3.2); skinX(stucco, ADD[0] - 0.01, hg1, ADD[3], 0, 3.2); skinX(stucco, ADD[0] - 0.01, hg0, hg1, 2.15, 3.2);
    skinZ(stucco, ADD[3] + 0.01, ADD[0], -9, 0, 3.2);
    const eastZ = CH.east - 0.04, sg0 = srvOut.c - srvOut.w / 2, sg1 = srvOut.c + srvOut.w / 2;
    skinZ(stucco, eastZ, ADD[0], sg0, 0, 3.2); skinZ(stucco, eastZ, sg1, 9, 0, 3.2); skinZ(stucco, eastZ, sg0, sg1, 2.15, 3.2);
    S.rect(M(0xe9e9e4, { roughness: 1 }), [ADD[0] - 0.3, ADD[1] - 0.3, -8.8, ADD[3] + 0.3], 3.2, 3.3);       // its white flat roof
    // west front: stone south of the doors, stucco north, a flat canopy across, the gable above
    const wz = CH.west + 0.16;
    skinZ(stone, wz + 0.02, 1.9, 9.05, 0, 3.05, 1.4);
    skinZ(stucco, wz, -9.02, -1.9, 0, 3.05);
    S.box(M(0x7c684c), 1.9, 2.6, 0.16, -3.6, 1.3, wz + 0.02);  // the darker panel beside the doors
    S.rect(fasciaM, [-9.8, CH.west - 0.1, 9.8, CH.west + 1.05], 3.05, 3.28);
    S.rect(M(0x9c8e78), [-9.7, CH.west + 0.2, 9.75, CH.west + 1.0], 3.28, 3.31);
    // the glazing around the doors
    S.box(glassOut, 3.7, 0.5, 0.05, 0, 2.77, wz);
    for (const x of [-1.87, -1.5, 0, 1.5, 1.87]) S.box(dark, 0.08, 3.05, 0.1, x, 1.52, wz + 0.02);
    S.box(dark, 3.9, 0.08, 0.1, 0, 2.54, wz + 0.02);
    S.box(glassOut, 0.3, 2.5, 0.05, -1.7, 1.25, wz); S.box(glassOut, 0.3, 2.5, 0.05, 1.7, 1.25, wz);
    S.box(M(0x142310, { roughness: 1 }), 3.2, 0.75, 0.9, 5.2, 0.38, wz + 0.55);    // the hedge
    // the bushes along the south wall
    for (const z of [3, 7, 9.3, 12, 14.7, 17.3]) S.add(M(0x1d3515, { roughness: 1 }), new THREE.IcosahedronGeometry(0.42, 1), new THREE.Matrix4().makeTranslation(9.55, 0.34, z));

    // gable walls and the roof
    const rf = { over: 0.85, x: 9 + 0.85, eaveY: 3.48, ridge: CH.ridge, z0: CH.east - 0.35, z1: CH.west + 0.6 };
    const fascia = (x, y) => S.box(fasciaM, 0.1, 0.24, rf.z1 - rf.z0, x, y, (rf.z0 + rf.z1) / 2);
    const slopeR = Math.atan2(rf.ridge - rf.eaveY, rf.x), lenR = Math.hypot(rf.x, rf.ridge - rf.eaveY);
    for (const s of [-1, 1]) {
      S.box(shingle, lenR, 0.1, rf.z1 - rf.z0, s * rf.x / 2, (rf.eaveY + rf.ridge) / 2, (rf.z0 + rf.z1) / 2, { rz: -s * slopeR, tex: 1.4 });
      fascia(s * rf.x, rf.eaveY - 0.03);
      for (const z of [rf.z0, rf.z1]) S.box(fasciaM, lenR, 0.2, 0.1, s * rf.x / 2, (rf.eaveY + rf.ridge) / 2 - 0.08, z, { rz: -s * slopeR });
    }
    const roofAt = x => rf.eaveY + (rf.x - x) * Math.tan(slopeR) - 0.06;
    gable(stucco, CH.west + 0.1, 0.1, 3.28, 9, rf.ridge - 0.06, 0, roofAt(9));
    gable(stucco, CH.east - 0.01, 0.06, 3.2, 9, rf.ridge - 0.06, 0, roofAt(9));
    // the black-fenced bins beyond the east end
    picket({ from: [-1, -3.6], to: [-1, -7] }, 1.9, 0.12, iron, [0.2, 1.8]);
    picket({ from: [-1, -7], to: [3.5, -7] }, 1.9, 0.12, iron, [0.2, 1.8]);
    picket({ from: [3.5, -7], to: [3.5, -3.6] }, 1.9, 0.12, iron, [0.2, 1.8]);

    // ── the parish hall to the north: charcoal hip roof, brick arcade ──────
    const H = SITE.hall, HX0 = -37.8, HX1 = -17.2, HZ0 = 5.2, HZ1 = 26.8;
    const hallDoor = Plan.DOORS.find(d => d.id === 'hallFront'), hd0 = hallDoor.c - hallDoor.w / 2, hd1 = hallDoor.c + hallDoor.w / 2;
    skinZ(stucco, HZ1 + 0.02, HX0, hd0, 0, 3.5); skinZ(stucco, HZ1 + 0.02, hd1, HX1, 0, 3.5); skinZ(stucco, HZ1 + 0.02, hd0, hd1, 2.2, 3.5);
    skinZ(stucco, HZ0 - 0.02, HX0, HX1, 0, 3.5); skinX(stucco, HX0 - 0.02, HZ0, HZ1, 0, 3.5); skinX(stucco, HX1 + 0.02, HZ0, HZ1, 0, 3.5);
    const hallRoof = Tex.mat('shingle', { color: 0x6e6c68, rough: 1 });
    const c = [(H[0] + H[2]) / 2, 6.4, (H[1] + H[3]) / 2], a = [H[0], 2.95, H[1]], b = [H[2], 2.95, H[1]], d = [H[2], 2.95, H[3]], e = [H[0], 2.95, H[3]];
    S.tris(hallRoof, [a, c, b, b, c, d, d, c, e, e, c, a]);
    for (const [x, z] of Plan.PIERS) S.box(brick, 0.5, 2.95, 0.5, x, 1.47, z, { tex: 0.9 });
    // the soffit under the overhang, the fascia round it
    const soffit = new THREE.MeshStandardMaterial({ color: 0xc7b48a, emissive: 0x4a4332, roughness: 1 });
    S.rect(soffit, [H[0], H[1], H[2], H[3]], 2.97, 3.0);
    S.rect(fasciaM, [H[0], H[3] - 0.15, H[2], H[3]], 2.75, 2.97);
    S.rect(fasciaM, [H[2] - 0.15, H[1], H[2], H[3]], 2.75, 2.97);
    S.rect(fasciaM, [H[0], H[1], H[2], H[1] + 0.15], 2.75, 2.97);
    S.rect(fasciaM, [H[0], H[1], H[0] + 0.15, H[3]], 2.75, 2.97);
    // windows along the arcade, with dark frames; benches between them
    const hallWindow = (axis, u, w = 1.5) => {
      if (axis === 'west') { S.box(dark, w + 0.12, 1.92, 0.04, u, 1.32, HZ1 + 0.05); S.box(glassOut, w, 1.8, 0.05, u, 1.32, HZ1 + 0.065); S.box(dark, 0.05, 1.8, 0.06, u, 1.32, HZ1 + 0.08); }
      else { S.box(dark, 0.04, 1.92, w + 0.12, HX1 + 0.05, 1.32, u); S.box(glassOut, 0.05, 1.8, w, HX1 + 0.065, 1.32, u); S.box(dark, 0.06, 1.8, 0.05, HX1 + 0.08, 1.32, u); }
    };
    for (const x of [-35.5, -33, -30.6, -24.4, -22, -19.6]) hallWindow('west', x);
    for (const z of [7.5, 10.2, 12.9, 15.6, 18.3, 21, 23.7]) hallWindow('south', z);
    for (const x of [-33.5, -21.5]) { S.box(M(0x35200f), 1.6, 0.05, 0.42, x + 0.0, 0.46, 28.0); S.box(M(0x35200f), 1.6, 0.42, 0.05, x, 0.72, 27.8); for (const k of [-0.7, 0.7]) S.box(iron, 0.05, 0.46, 0.4, x + k, 0.23, 28); }
    // garage doors on its north side, facing the lot
    for (let i = 0; i < 3; i++) {
      const z0 = 9 + i * 4.2;
      S.box(M(0xd7d3c8, { roughness: 0.6 }), 0.05, 2.25, 3.4, HX0 - 0.05, 1.12, z0);
      for (let k = 1; k < 5; k++) S.box(M(0xb8b4a8), 0.02, 0.02, 3.3, HX0 - 0.085, k * 0.45, z0);
    }

    // inside: a hallway from the front door, and a basic auditorium behind
    const hallCeil = new THREE.MeshStandardMaterial({ color: 0xefebdf, emissive: 0x77746c, roughness: 1 });
    S.flat(Tex.mat('tile', { color: 0xd8d4c6, rough: 0.35, normal: 0.3 }), [-29, 19.3, -26, 26.8], 0.004, { tex: 1.6 });
    S.flat(Tex.mat('floorboard', { color: 0xd7b48a, rough: 0.35, normal: 0.3 }), [HX0, HZ0, HX1, 19.3], 0.004, { tex: 2.4 });
    S.rect(hallCeil, [-29, 19.3, -26, 26.5], 2.85, 2.9);
    S.rect(hallCeil, [HX0 + 0.3, HZ0 + 0.3, HX1 - 0.3, 19.0], 3.42, 3.48);
    for (const z of [20.8, 23.0, 25.2]) S.box(glow, 0.9, 0.03, 0.4, -27.5, 2.84, z);
    for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) S.box(glow, 1.3, 0.03, 0.4, -33.5 + i * 4.8 + 2.5, 3.4, 8.5 + k * 4.4);
    // doors off the hallway, and a notice board
    const sign = (txt, x, z, ry) => {
      const t = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#efe9da'; g.fillRect(0, 0, w, h); g.fillStyle = '#2d1c10'; g.font = '500 30px Georgia, serif'; g.textAlign = 'center'; g.fillText(txt, w / 2, 42); });
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.16), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
      m.position.set(x, 2.25, z); m.rotation.y = ry; group.add(m);
    };
    [[-28.98, 21.2, 'Parish Office', Math.PI / 2], [-28.98, 24.4, 'Classroom', Math.PI / 2], [-26.02, 21.2, 'Restrooms', -Math.PI / 2], [-26.02, 24.4, 'Kitchen', -Math.PI / 2]].forEach(([x, z, t, ry]) => {
      S.box(M(0x5a3517, { roughness: 0.55 }), 0.05, 2.08, 0.92, x, 1.04, z);
      S.box(pull0, 0.06, 0.04, 0.04, x + (ry > 0 ? 0.03 : -0.03), 1.0, z + 0.36);
      sign(t, x + (ry > 0 ? 0.03 : -0.03), z, ry);
    });
    S.box(M(0x8a6a42), 0.03, 1.0, 1.5, -28.98, 1.45, 22.8);
    S.box(M(0xb49a74), 0.04, 0.88, 1.38, -28.97, 1.45, 22.8);
    for (let k = 0; k < 7; k++) S.box(M([0xefe9da, 0xd9c98a, 0xb7cbe0][k % 3]), 0.045, 0.24, 0.18, -28.96, 1.32 + (k % 2) * 0.3, 22.25 + k * 0.17);
    // the stage: a platform, its steps and a curtain
    const stageWood = Tex.mat('floorboard', { color: 0xa97c50, rough: 0.5, normal: 0.3 });
    S.rect(stageWood, [-34, 5.5, -21, 8.4], 0, 0.8, { tex: 2.4 });
    S.rect(M(0x30080c, { roughness: 0.95 }), [-34, 5.5, -21, 5.65], 0.8, 3.4);
    for (const s of [-1, 1]) { S.rect(M(0x30080c, { roughness: 0.95 }), [-27.5 + (s > 0 ? 5.5 : -6.5), 5.65, -27.5 + (s > 0 ? 6.5 : -5.5), 7.9], 0.8, 3.4); S.rect(trim, [-27.5 + (s > 0 ? 6.5 : -6.8), 5.5, -27.5 + (s > 0 ? 6.8 : -6.5), 8.5], 0, 3.42); }
    for (let k = 0; k < 3; k++) S.rect(stageWood, [-29, 8.4 + k * 0.28, -26, 8.68 + k * 0.28], 0, 0.6 - k * 0.2);
    // rows of folding chairs either side of a centre aisle
    const chairM = M(0x3a3d42, { roughness: 0.5, metalness: 0.4 }), chairSeat = M(0x53453a, { roughness: 0.8 });
    for (let row = 0; row < 7; row++) for (const [x0, n] of [[-34.3, 11], [-26.2, 11]]) for (let k = 0; k < n; k++) {
      const x = x0 + k * 0.53, z = 10.7 + row * 1.0;
      S.box(chairSeat, 0.43, 0.04, 0.42, x, 0.45, z);
      S.box(chairM, 0.42, 0.42, 0.03, x, 0.74, z + 0.2);
      for (const dx of [-0.19, 0.19]) { S.box(chairM, 0.025, 0.45, 0.025, x + dx, 0.23, z - 0.18); S.box(chairM, 0.025, 0.96, 0.025, x + dx, 0.48, z + 0.2); }
    }
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) S.box(windowIn, s < 0 ? 0.02 : 0.02, 1.5, 1.4, s < 0 ? HX0 + 0.33 : HX1 - 0.33, 1.75, 8.6 + k * 2.9);

    // the covered walk: from the front lot, along under the hall's overhang, then a flat canopy to the church doors
    const CP = SITE.canopy;
    S.rect(fasciaM, [CP[0], CP[1], CP[2], CP[3]], 2.8, 2.98);
    S.rect(new THREE.MeshStandardMaterial({ color: 0xe0d7c0, emissive: 0x4a4332, roughness: 1 }), [CP[0] + 0.03, CP[1] + 0.03, CP[2] - 0.03, CP[3] - 0.03], 2.76, 2.8);
    for (let i = 0; i < 6; i++) S.box(brick, 0.42, 2.78, 0.42, CP[0] + 0.4 + i * (CP[2] - CP[0] - 0.8) / 5, 1.39, CP[3] - 0.26, { tex: 0.9 });
    S.rect(paintSolid, [CP[0], CP[3] - 0.1, CP[2], CP[3]], 2.98, 3.02);

    // ── the grounds ────────────────────────────────────────────────────────
    O.flat(grass, SITE.parcel, -0.035, { tex: 4 });
    for (const r of SITE.pavements) O.flat(asphalt, r, -0.02, { tex: 4 });
    for (const r of SITE.aprons) O.flat(concrete, r, -0.012, { tex: 2.5 });
    for (const r of SITE.walks) O.flat(concrete, r, -0.008, { tex: 2.5 });
    for (const r of SITE.lawns) O.flat(grass, r, -0.028, { tex: 4 });

    for (const st of SITE.stalls) {
      const [ax, az] = st.from, [bx, bz] = st.to;
      const dx = (bx - ax) / st.n, dz = (bz - az) / st.n, [ux, uz] = st.dir;
      for (let i = 0; i <= st.n; i++) {
        const x0 = ax + dx * i, z0 = az + dz * i;
        const lenx = ux * st.len + dx * st.skew, lenz = uz * st.len + dz * st.skew;
        const L = Math.hypot(lenx, lenz), ang = Math.atan2(lenx, lenz);
        const g = new THREE.PlaneGeometry(0.12, L);
        O.m.makeRotationFromEuler(new THREE.Euler(-Math.PI / 2, ang, 0, 'YXZ')); O.m.setPosition(x0 + lenx / 2, -0.004, z0 + lenz / 2);
        O.add(paint, g, O.m);
      }
    }
    for (const [x, z, r] of SITE.islands) {
      const g = new THREE.CircleGeometry(r, 20); O.m.makeRotationX(-Math.PI / 2); O.m.setPosition(x, 0.01, z); O.add(mulch, g, O.m);
    }

    for (const f of SITE.fences) picket(f, 1.05, 0.16, white, [0.3, 0.8]);
    for (const f of SITE.ironGates) picket(f, 1.3, 0.14, iron, [0.15, 1.2]);
    for (const f of SITE.boundary) {
      const [ax, az] = f.from, [bx, bz] = f.to;
      O.rect(Tex.mat('stucco', { color: 0xdcd9d0, rough: 1 }), [Math.min(ax, bx) - 0.08, Math.min(az, bz) - 0.08, Math.max(ax, bx) + 0.08, Math.max(az, bz) + 0.08], 0, f.h, { tex: 2.4 });
    }
    // lamp posts
    const lampM = M(0x25301f, { roughness: 0.5 });
    for (const [x, z] of SITE.lamps) {
      S.cyl(lampM, 0.05, 0.08, 3.8, x, 1.9, z, 10);
      S.cyl(lampM, 0.04, 0.2, 0.2, x, 4.0, z, 10);
      S.cyl(new THREE.MeshBasicMaterial({ color: 0xf2eedc }), 0.13, 0.13, 0.28, x, 3.8, z, 10);
    }
    // a sign by the walk
    { const tex = canvasTex(512, 256, (g, w, h) => {
        g.fillStyle = '#efe9d9'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#3f2a1a'; g.textAlign = 'center';
        g.font = '500 62px Georgia, serif'; g.fillText('St. Vitus', w / 2, 96);
        g.font = '34px Georgia, serif'; g.fillText('Catholic Church', w / 2, 150);
        g.font = 'italic 26px Georgia, serif'; g.fillText('9710 White Oak Avenue', w / 2, 208);
      });
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
      S.box(M(0x20160d), 0.1, 1.9, 0.1, SITE.sign[0] - 0.8, 0.95, SITE.sign[1]);
      S.box(M(0x20160d), 0.1, 1.9, 0.1, SITE.sign[0] + 0.8, 0.95, SITE.sign[1]);
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), m); pl.position.set(SITE.sign[0], 1.4, SITE.sign[1] + 0.03); group.add(pl);
    }

    S.flush(true); O.flush(true);

    // ── the doors: everything that moves ───────────────────────────────────
    const doors = {};
    const leafMat = col => M(col, { roughness: 0.55 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fb7bd, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.45 });
    for (const d of Plan.DOORS) {
      const items = [];
      const leaf = (hingeC, widthSigned, h, mat) => {
        const pivot = new THREE.Group();
        const face = d.at + (d.out ? d.out * 0.17 : 0);
        if (d.axis === 'x') pivot.position.set(hingeC, 0, face); else pivot.position.set(face, 0, hingeC);
        const w = Math.abs(widthSigned);
        const geom = d.axis === 'x' ? new THREE.BoxGeometry(w, h, 0.05) : new THREE.BoxGeometry(0.05, h, w);
        const m = new THREE.Mesh(geom, mat);
        if (d.axis === 'x') m.position.set(widthSigned / 2, h / 2, 0); else m.position.set(0, h / 2, widthSigned / 2);
        pivot.add(m);
        if (!d.glass) {
          const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), M(0xc9b070, { metalness: 0.7, roughness: 0.3 }));
          if (d.axis === 'x') knob.position.set(widthSigned * 0.9, 1.0, 0.05); else knob.position.set(0.05, 1.0, widthSigned * 0.9);
          pivot.add(knob);
        }
        group.add(pivot);
        items.push({ pivot, dir: 1 });
      };
      if (d.glass || d.pair) {
        const m = d.glass ? glassMat : leafMat(d.color);
        leaf(d.c - d.w / 2, d.w / 2 - 0.02, d.glass ? 2.45 : 2.1, m);
        leaf(d.c + d.w / 2, -(d.w / 2 - 0.02), d.glass ? 2.45 : 2.1, m);
        items[1].dir = -1;
      } else {
        leaf(d.c - d.w / 2, d.w, 2.1, leafMat(d.color || 0x3f2511));
      }
      doors[d.id] = { d, items, open: 0, target: 0 };
    }
    return { group, outGroup, doors, ceilAt, windowMat: windowIn, wetMats: [asphalt, concrete] };
  }

  root.Site = { build, Batch };
})(typeof self !== 'undefined' ? self : this);
