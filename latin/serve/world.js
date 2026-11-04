/*
 * Layout numbers come from Ceremony.LAYOUT / PLACES so the script and the scene agree.
 */
(function (root) {
  'use strict';
  const THREE = root.THREE;
  const C = root.Ceremony;
  const L = C.LAYOUT;

  const cache = {};
  const M = (color, o = {}) => {
    const k = color + JSON.stringify(o);
    return cache[k] || (cache[k] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.8 }, o)));
  };
  const GOLD = () => M(0xd4ad48, { metalness: 0.65, roughness: 0.35 });
  const WHITE = () => M(0xf3efe6, { roughness: 0.6 });

  function box(w, h, d, mat, parent, x, y, z, shadow = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true;
    parent.add(m); return m;
  }
  function cyl(rt, rb, h, mat, parent, x, y, z, seg = 14) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    parent.add(m); return m;
  }
  function lathe(points, mat, parent, x, y, z, seg = 20) {
    const m = new THREE.Mesh(new THREE.LatheGeometry(points.map(([a, b]) => new THREE.Vector2(a, b)), seg), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    parent.add(m); return m;
  }

  // ── textures drawn on canvases ─────────────────────────────────────────────
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeat) t.repeat.set(repeat[0], repeat[1]);
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
  const oak = () => root.Tex.get('oak', 'd');
  const rug = () => canvasTex(512, 384, (g, w, h) => {
    g.fillStyle = '#cbbd9f'; g.fillRect(0, 0, w, h);                       // ivory outer border
    g.fillStyle = '#7e1a1f'; g.fillRect(34, 34, w - 68, h - 68);           // red field
    g.strokeStyle = '#c8b48a'; g.lineWidth = 2; g.strokeRect(46, 46, w - 92, h - 92);
    const rosette = (x, y, s, c1, c2) => {
      g.fillStyle = c1;
      for (let k = 0; k < 6; k++) { g.beginPath(); g.ellipse(x + Math.cos(k) * s * 0.6, y + Math.sin(k) * s * 0.6, s * 0.5, s * 0.25, k, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = c2; g.beginPath(); g.arc(x, y, s * 0.35, 0, Math.PI * 2); g.fill();
    };
    g.strokeStyle = 'rgba(200,180,138,.35)'; g.lineWidth = 1.5;
    for (let y = 70; y < h - 60; y += 34) { g.beginPath(); for (let x = 60; x < w - 60; x += 8) g.lineTo(x, y + Math.sin(x / 18) * 6); g.stroke(); }
    for (let y = 80; y < h - 60; y += 46) for (let x = 80 + ((y / 46) % 2) * 23; x < w - 70; x += 46) rosette(x, y, 7, '#b99a62', '#2c3a5c');
    g.fillStyle = '#d9c9a6'; g.beginPath(); g.ellipse(w / 2, h / 2, 86, 58, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7e1a1f'; g.beginPath(); g.ellipse(w / 2, h / 2, 74, 48, 0, 0, Math.PI * 2); g.fill();
    rosette(w / 2, h / 2, 26, '#c8a96a', '#273558');
    for (let x = 20; x < w; x += 22) { rosette(x, 17, 5, '#8c6b3c', '#7e1a1f'); rosette(x, h - 17, 5, '#8c6b3c', '#7e1a1f'); }
    for (let y = 40; y < h - 30; y += 22) { rosette(17, y, 5, '#8c6b3c', '#7e1a1f'); rosette(w - 17, y, 5, '#8c6b3c', '#7e1a1f'); }
  });

  /** Build the chapel into `scene`. Returns fixtures and the props by name. */
  function build(scene) {
    const room = new THREE.Group(); scene.add(room);
    const fx = {};

    // the sanctuary's oak walls; the floor and everything beyond belong to Site
    const wallTex = root.Tex.get('oak', 'd', { repeat: [3, 2] });
    const wallMat = M(0xc49a70, { map: wallTex, roughness: 0.55 });
    const W = L.wallSide, wallH = root.Plan.CH.sanctuaryCeil, frontZ = root.Plan.CH.front - 0.16, wallLen = frontZ - L.wallBack;
    box(2 * W, wallH, 0.1, wallMat, room, 0, wallH / 2, L.wallBack - 0.05, false);
    box(0.1, wallH, wallLen, wallMat, room, -W - 0.05, wallH / 2, L.wallBack + wallLen / 2, false);
    // the Epistle wall, with the door to the changing room in it
    const srv = root.Plan.DOORS.find(d => d.id === 'servers'), srv0 = srv.c - srv.w / 2, srv1 = srv.c + srv.w / 2;
    box(0.1, wallH, srv0 - L.wallBack, wallMat, room, W + 0.05, wallH / 2, (L.wallBack + srv0) / 2, false);
    box(0.1, wallH, frontZ - srv1, wallMat, room, W + 0.05, wallH / 2, (srv1 + frontZ) / 2, false);

    // altar steps: lowest, second, top (footpace), in bare wood as the photographs show
    const stepMat = M(0xffffff, { map: root.Tex.get('floorboard', 'd'), roughness: 0.45 });
    for (const [xh, zf, h] of L.steps) {
      const d = zf - L.wallBack;
      box(2 * xh, h, d, stepMat, room, 0, h / 2, L.wallBack + d / 2);
    }
    const rugM = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 2.9), M(0xffffff, { map: rug(), roughness: 0.95 }));
    rugM.rotation.x = -Math.PI / 2; rugM.position.set(0, 0.004, 2.65); rugM.receiveShadow = true; room.add(rugM);

    // the altar: white with gilded columns, linen cloth with lace front
    const mz = L.mensa, alt = new THREE.Group(); room.add(alt);
    const mw = 2 * mz.x, md = mz.z1 - mz.z0, top = mz.top, base = 0.45;
    box(mw, top - base - 0.04, md, WHITE(), alt, 0, (top + base - 0.04) / 2, (mz.z0 + mz.z1) / 2);
    for (const x of [-1.05, -0.62, 0.62, 1.05]) {
      cyl(0.055, 0.055, top - base - 0.25, GOLD(), alt, x, (top + base) / 2 - 0.05, mz.z1 + 0.04);
      box(0.18, 0.08, 0.12, WHITE(), alt, x, base + 0.05, mz.z1 + 0.04);
      box(0.18, 0.08, 0.12, WHITE(), alt, x, top - 0.22, mz.z1 + 0.04);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 28), GOLD()); ring.position.set(0, (top + base) / 2, mz.z1 + 0.02); alt.add(ring);
    box(mw + 0.08, 0.02, md + 0.04, M(0xfcfbf7), alt, 0, top - 0.01, (mz.z0 + mz.z1) / 2);
    box(mw + 0.08, 0.26, 0.01, M(0xfcfbf7, { transparent: true, opacity: 0.92 }), alt, 0, top - 0.14, mz.z1 + 0.025);
    box(0.01, 0.9, md, M(0xfcfbf7), alt, mz.x + 0.04, top - 0.45, (mz.z0 + mz.z1) / 2);
    box(0.01, 0.9, md, M(0xfcfbf7), alt, -mz.x - 0.04, top - 0.45, (mz.z0 + mz.z1) / 2);

    // gradine, reredos, tabernacle, crucifix, candlesticks, altar cards
    const gr = L.gradine;
    box(mw, gr.top - top, gr.z1 - gr.z0, WHITE(), alt, 0, (gr.top + top) / 2, (gr.z0 + gr.z1) / 2);
    box(3.6, 1.85, 0.45, WHITE(), alt, 0, gr.top + 0.92, L.wallBack + 0.27);
    for (const x of [-1.6, -0.95, 0.95, 1.6]) for (const xx of [-0.08, 0.08]) cyl(0.035, 0.035, 1.3, GOLD(), alt, x + xx, gr.top + 0.95, L.wallBack + 0.52);
    box(0.7, 0.5, 0.2, WHITE(), alt, 0, gr.top + 1.95, L.wallBack + 0.4);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), WHITE()); dome.position.set(0, gr.top + 2.2, L.wallBack + 0.4); alt.add(dome);
    for (const x of [-1.1, -0.7, 0.7, 1.1]) {                      // reliquaries on the top
      box(0.16, 0.22, 0.1, GOLD(), alt, x, gr.top + 1.96, L.wallBack + 0.35);
      box(0.08, 0.1, 0.02, M(0x8c1a1e), alt, x, gr.top + 1.96, L.wallBack + 0.41);
    }
    const tab = new THREE.Group(); tab.position.set(0, top, -1.6); alt.add(tab);
    box(0.56, 0.55, 0.32, WHITE(), tab, 0, 0.275, 0);
    for (const x of [-0.24, 0.24]) cyl(0.03, 0.03, 0.5, GOLD(), tab, x, 0.28, 0.17);
    const tabDoor = new THREE.Group(); tabDoor.position.set(-0.17, 0.27, 0.165); tab.add(tabDoor);
    box(0.34, 0.36, 0.02, M(0xb11e2b, { roughness: 0.6 }), tabDoor, 0.17, 0, 0);    // the red veil over the door
    fx.tabDoor = tabDoor;
    const niche = box(0.42, 0.75, 0.05, M(0xe9e2d2), alt, 0, gr.top + 1.25, L.wallBack + 0.52);
    const cru = new THREE.Group(); cru.position.set(0, gr.top + 1.15, L.wallBack + 0.58); alt.add(cru);
    box(0.035, 0.62, 0.03, GOLD(), cru, 0, 0.1, 0); box(0.3, 0.035, 0.03, GOLD(), cru, 0, 0.25, 0);
    box(0.05, 0.18, 0.04, M(0xe6d8bd), cru, 0, 0.18, 0.02);
    cyl(0.07, 0.1, 0.08, GOLD(), cru, 0, -0.24, 0);
    fx.candles = {};
    for (const x of [-1.2, -0.85, -0.5, 0.5, 0.85, 1.2]) {
      const g = new THREE.Group(); g.position.set(x, gr.top, -1.6); alt.add(g);
      lathe([[0.0, 0], [0.09, 0], [0.09, 0.03], [0.04, 0.08], [0.025, 0.2], [0.04, 0.24], [0.022, 0.42], [0.04, 0.47], [0.05, 0.5], [0, 0.5]], GOLD(), g, 0, 0, 0);
      cyl(0.022, 0.022, 0.38, M(0xf2ead6), g, 0, 0.69, 0);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
      flame.scale.set(1, 2, 1); flame.position.set(0, 0.9, 0); g.add(flame);
      flame.visible = Math.abs(x) === 0.5;       // Low Mass: the two candles nearest the cross
      fx.candles[x] = flame;
    }
    const cardMat = M(0xf7f2e4), frame = GOLD();
    for (const [x, w, h] of [[0, 0.5, 0.36], [-1.15, 0.22, 0.28], [1.15, 0.22, 0.28]]) {
      const g = new THREE.Group(); g.position.set(x, top, -1.33); g.rotation.x = -0.18; alt.add(g);
      box(w + 0.04, h + 0.04, 0.02, frame, g, 0, h / 2 + 0.02, 0);
      box(w, h, 0.005, cardMat, g, 0, h / 2 + 0.02, 0.012);
    }
    // white-draped stands at either end, as in the photograph
    for (const x of [-2.6, 2.6]) box(0.55, 0.85, 0.55, M(0xf1eee8), room, x, 0.425, -1.85);

    // sanctuary lamp (Gospel side)
    const lamp = new THREE.Group(); lamp.position.set(-2.5, 2.25, -1.7); room.add(lamp);
    cyl(0.006, 0.006, 1.6, GOLD(), lamp, 0, 0.8, 0);
    lathe([[0, 0], [0.07, 0.02], [0.08, 0.12], [0.06, 0.22], [0, 0.24]], M(0xb3121d, { emissive: 0x6a0a10, transparent: true, opacity: 0.85 }), lamp, 0, -0.2, 0);
    cyl(0.1, 0.05, 0.06, GOLD(), lamp, 0, -0.22, 0);
    const lampLight = new THREE.PointLight(0xff5a3c, 0.25, 2.5); lampLight.position.set(0, -0.1, 0); lamp.add(lampLight);

    // credence: dark carved table with a lace cloth
    const cr = L.credence;
    const cred = new THREE.Group(); room.add(cred);
    const woodDark = M(0x2b1710, { roughness: 0.55 });
    box(cr.x1 - cr.x0, 0.06, cr.z1 - cr.z0, woodDark, cred, (cr.x0 + cr.x1) / 2, cr.top - 0.05, (cr.z0 + cr.z1) / 2);
    box(cr.x1 - cr.x0 + 0.04, 0.012, cr.z1 - cr.z0 + 0.04, M(0xece4d0), cred, (cr.x0 + cr.x1) / 2, cr.top - 0.012, (cr.z0 + cr.z1) / 2);
    box(0.012, 0.1, cr.z1 - cr.z0 + 0.04, M(0xece4d0, { transparent: true, opacity: 0.85 }), cred, cr.x0 - 0.02, cr.top - 0.06, (cr.z0 + cr.z1) / 2);
    for (const [x, z] of [[cr.x0 + 0.05, cr.z0 + 0.05], [cr.x0 + 0.05, cr.z1 - 0.05], [cr.x1 - 0.05, cr.z0 + 0.05], [cr.x1 - 0.05, cr.z1 - 0.05]])
      box(0.06, cr.top - 0.08, 0.06, woodDark, cred, x, (cr.top - 0.08) / 2, z);
    box(cr.x1 - cr.x0 - 0.05, 0.04, cr.z1 - cr.z0 - 0.05, woodDark, cred, (cr.x0 + cr.x1) / 2, 0.15, (cr.z0 + cr.z1) / 2);
    // the purple paten cover stays on the credence
    box(0.3, 0.02, 0.36, M(0x4c2a7a, { roughness: 0.4 }), room, C.PLACES['cred.paten'][0] + 0.02, cr.top + 0.005, C.PLACES['cred.paten'][2]);

    // sedilia, servers' stools, columns, lectern
    const chair = new THREE.Group(); chair.position.set(L.sedilia.x, 0, L.sedilia.z); room.add(chair);
    const chairWood = M(0x5a3418, { roughness: 0.6 });
    box(0.55, 0.08, 0.55, M(0x3a0a0e), chair, 0, 0.46, 0);
    box(0.08, 1.1, 0.6, chairWood, chair, 0.28, 0.75, 0);
    for (const [x, z] of [[-0.24, -0.24], [-0.24, 0.24], [0.24, -0.24], [0.24, 0.24]]) box(0.06, 0.44, 0.06, chairWood, chair, x, 0.22, z);
    // the two big columns at the corners of the altar steps: round oak shafts, moulded base and capital
    const columnM = M(0xa87c54, { map: oak(), roughness: 0.42 });
    for (const [x, z] of L.columns) {
      const shaftH = wallH - 0.62;
      cyl(0.24, 0.27, shaftH, columnM, room, x, 0.3 + shaftH / 2, z, 28);
      box(0.72, 0.16, 0.72, columnM, room, x, 0.08, z);
      cyl(0.31, 0.34, 0.14, columnM, room, x, 0.23, z, 28);
      cyl(0.34, 0.25, 0.2, columnM, room, x, wallH - 0.22, z, 28);
      box(0.76, 0.12, 0.76, columnM, room, x, wallH - 0.06, z);
    }
    const lect = new THREE.Group(); lect.position.set(L.lectern[0], 0, L.lectern[1]); room.add(lect);
    box(0.08, 1.1, 0.08, chairWood, lect, 0, 0.55, 0); box(0.4, 0.04, 0.4, chairWood, lect, 0, 0.02, 0);
    box(0.5, 0.03, 0.36, chairWood, lect, 0, 1.12, 0).rotation.x = -0.35;

    // communion rail with two gates, and the rail cloths
    const railWood = M(0x8a6240, { map: oak(), roughness: 0.45 });
    const rz = L.rail, gh = L.gateHalf;
    for (const s of [-1, 1]) {
      const RX = root.Plan.CH.railX, x0 = s * gh, x1 = s * RX, cx = (x0 + x1) / 2, len = Math.abs(x1 - x0);
      box(len, 0.08, 0.2, railWood, room, cx, 0.86, rz);
      box(0.3, 1.02, 0.3, railWood, room, s * (gh + 0.15), 0.51, rz);      // the broad posts either side of the gates
      box(len, 0.82, 0.1, railWood, room, cx, 0.41, rz);
      // the rail's left and right sides, back to the panelled wall
      box(0.2, 0.08, rz - root.Plan.CH.front - 0.15, railWood, room, s * RX, 0.86, (rz + root.Plan.CH.front + 0.15) / 2);
      box(0.1, 0.82, rz - root.Plan.CH.front - 0.15, railWood, room, s * RX, 0.41, (rz + root.Plan.CH.front + 0.15) / 2);
    }
    fx.gates = {};
    for (const [name, s] of [['gateE', 1], ['gateG', -1]]) {
      const pivot = new THREE.Group(); pivot.position.set(s * gh, 0, rz); room.add(pivot);
      const leaf = new THREE.Group(); pivot.add(leaf);
      box(gh - 0.02, 0.07, 0.07, WHITE(), leaf, -s * gh / 2, 0.84, 0);
      box(gh - 0.02, 0.05, 0.06, WHITE(), leaf, -s * gh / 2, 0.12, 0);
      for (let i = 1; i < 4; i++) cyl(0.016, 0.016, 0.7, GOLD(), leaf, -s * gh * i / 4, 0.47, 0, 8);
      fx.gates[name] = { pivot, side: s, open: 1 };
      pivot.rotation.y = -s * 1.45;       // open "as much as possible without touching back" before Mass
    }
    fx.cloths = {};
    for (const [name, s] of [['clothE', 1], ['clothG', -1]]) {
      const x0 = s * (gh + 0.32), x1 = s * (root.Plan.CH.railX - 0.1), cx = (x0 + x1) / 2, len = Math.abs(x1 - x0);
      const pivot = new THREE.Group(); pivot.position.set(cx, 0.905, rz - 0.1); room.add(pivot);
      box(len, 0.008, 0.2, M(0xfdfcf8), pivot, 0, 0, 0.1, false);
      const drape = box(len, 0.3, 0.008, M(0xfdfcf8), pivot, 0, -0.15, 0, false);
      fx.cloths[name] = { pivot, flipped: 0, drape };
    }

    // holy water font and sacristy bell by the door
    const fnt = C.PLACES.font, sb = C.PLACES.sbell;
    lathe([[0, 0], [0.09, 0.02], [0.11, 0.08], [0.1, 0.1], [0, 0.07]], M(0xd8d2c4), room, fnt[0], fnt[1] - 0.08, fnt[2]);
    box(0.04, 0.3, 0.12, M(0xd8d2c4), room, fnt[0] - 0.05, fnt[1] - 0.2, fnt[2]);
    const sbell = new THREE.Group(); sbell.position.set(sb[0], sb[1], sb[2]); room.add(sbell);
    lathe([[0, 0.1], [0.04, 0.09], [0.06, 0.02], [0.07, 0], [0, 0]], GOLD(), sbell, 0, 0, 0);
    box(0.06, 0.03, 0.03, GOLD(), sbell, 0.03, 0.11, 0);
    cyl(0.008, 0.008, 0.9, M(0xa2312a), sbell, 0, -0.45, 0, 6);
    fx.sbell = sbell;

    // light
    const hemi = new THREE.HemisphereLight(0xfff1dc, 0x5a3b22, 0.75); scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff0dc, 0.95);
    key.position.set(3.5, 7, 6); key.target.position.set(0, 0.5, -0.5);
    key.castShadow = true; key.shadow.mapSize.set(root.Quality.shadow, root.Quality.shadow);
    Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 20 });
    key.shadow.bias = -0.0008;
    scene.add(key); scene.add(key.target);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.25); fill.position.set(-5, 4, 3); scene.add(fill);
    const altarGlow = new THREE.PointLight(0xffc98a, 0.35, 4); altarGlow.position.set(0, 2.3, -1.2); scene.add(altarGlow);

    return { room, fx, props: buildProps(scene), lights: { hemi, key, hemiBase: hemi.intensity, keyBase: key.intensity } };
  }

  // ── props ──────────────────────────────────────────────────────────────────

  function buildProps(scene) {
    const P = {};
    const make = (name, carry, build) => {
      const g = new THREE.Group(); g.name = name; scene.add(g);
      build(g);
      P[name] = { name, obj: g, carry, state: {} };
      return P[name];
    };
    const green = M(0x0c3016, { roughness: 0.6 });

    make('missal', 'book', g => {
      // folding X-stand with the Missal on its left half, back cover up
      const wood = M(0x6a3d1f, { roughness: 0.5 });
      box(0.34, 0.02, 0.04, wood, g, 0, 0.12, -0.12).rotation.x = -0.9;
      box(0.34, 0.02, 0.04, wood, g, 0, 0.12, 0.06).rotation.x = 0.9;
      const book = new THREE.Group(); book.position.set(0, 0.13, 0); book.rotation.x = -0.75; g.add(book);
      const closed = box(0.23, 0.31, 0.06, M(0x7b1520, { roughness: 0.5 }), book, -0.06, 0.02, 0.0);
      const open = new THREE.Group(); book.add(open);
      box(0.24, 0.31, 0.03, M(0x7b1520), open, -0.125, 0.02, -0.01);
      box(0.24, 0.31, 0.03, M(0x7b1520), open, 0.125, 0.02, -0.01);
      box(0.22, 0.29, 0.01, M(0xf8f3e3), open, -0.12, 0.02, 0.012);
      box(0.22, 0.29, 0.01, M(0xf8f3e3), open, 0.12, 0.02, 0.012);
      for (const [c, x] of [[0xb3121d, -0.02], [0x2f6b3a, 0.0], [0xf0e8d0, 0.02]]) box(0.008, 0.18, 0.003, M(c), book, x, -0.18, 0.02);
      open.visible = false;
      P.missal && 0;
      g.userData.setOpen = on => { open.visible = on; closed.visible = !on; };
      g.userData.maniple = box(0.07, 0.008, 0.34, green, g, 0.05, 0.2, 0.02); g.userData.maniple.visible = false;
    });
    make('chalice', 'R', g => {
      lathe([[0, 0], [0.07, 0], [0.065, 0.015], [0.015, 0.05], [0.012, 0.11], [0.025, 0.13], [0.012, 0.15], [0.02, 0.16], [0.055, 0.2], [0.06, 0.24], [0.055, 0.24], [0, 0.17]], GOLD(), g, 0, 0, 0);
      g.userData.pall = box(0.13, 0.008, 0.13, M(0xfdfcf8), g, 0, 0.245, 0); g.userData.pall.visible = false;
      g.userData.host = cyl(0.04, 0.04, 0.004, M(0xf6efd8), g, 0, 0.26, 0, 16); g.userData.host.visible = false;
    });
    make('veil', 'both', g => {
      const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.17, 0.24, 4, 1, true), M(0x0c3016, { side: THREE.DoubleSide, roughness: 0.6 }));
      drape.rotation.y = Math.PI / 4; drape.position.y = 0.13; drape.castShadow = true; g.add(drape);
      box(0.17, 0.01, 0.17, green, g, 0, 0.255, 0);
      box(0.03, 0.002, 0.11, M(0xd4ad48, { metalness: 0.6 }), g, 0, 0.262, 0.02);
      const folded = box(0.18, 0.025, 0.12, green, g, 0, 0.013, 0); folded.visible = false;
      const flat = box(0.42, 0.01, 0.42, green, g, 0, 0.005, 0); flat.visible = false;
      g.userData.setState = s => { drape.visible = s === 'draped'; g.children[1].visible = s === 'draped'; g.children[2].visible = s === 'draped' || s === 'flat'; folded.visible = s === 'folded'; flat.visible = s === 'flat' || s === 'held'; };
      g.userData.setState('draped');
    });
    make('burse', 'L', g => { box(0.2, 0.025, 0.2, green, g, 0, 0.012, 0); box(0.05, 0.003, 0.05, M(0xd4ad48, { metalness: 0.6 }), g, 0, 0.026, 0); });
    make('biretta', 'R', g => {
      box(0.19, 0.09, 0.19, M(0x101010), g, 0, 0.045, 0);
      for (const [x, z, ry] of [[0, -0.05, 0], [-0.05, 0.03, Math.PI / 2], [0.05, 0.03, Math.PI / 2]]) box(0.15, 0.05, 0.012, M(0x101010), g, x, 0.11, z).rotation.y = ry;
      cyl(0.022, 0.022, 0.03, M(0x101010), g, 0, 0.15, 0, 8);
    });
    make('ciborium', 'R', g => {
      lathe([[0, 0], [0.06, 0], [0.012, 0.05], [0.012, 0.09], [0.06, 0.13], [0.07, 0.17], [0.06, 0.2], [0.02, 0.23], [0.01, 0.27], [0, 0.27]], GOLD(), g, 0, 0, 0);
    });
    make('sc', 'R', g => {       // Sanctus candle
      lathe([[0, 0], [0.07, 0], [0.07, 0.02], [0.02, 0.05], [0.015, 0.09], [0.04, 0.11], [0, 0.11]], GOLD(), g, 0, 0, 0);
      cyl(0.02, 0.02, 0.14, M(0xf2ead6), g, 0, 0.18, 0, 10);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffcf6a }));
      flame.scale.set(1, 2, 1); flame.position.y = 0.275; flame.visible = false; g.add(flame);
      const light = new THREE.PointLight(0xffb45a, 0, 1.6); light.position.y = 0.3; g.add(light);
      g.userData.setLit = on => { flame.visible = on; light.intensity = on ? 0.35 : 0; };
    });
    make('lighter', 'R', g => { box(0.02, 0.1, 0.025, M(0xdedede), g, 0, 0.05, 0); box(0.012, 0.03, 0.012, M(0xb08060, { metalness: 0.5 }), g, 0, 0.115, 0); });
    make('bells', 'R', g => {
      cyl(0.008, 0.008, 0.16, GOLD(), g, 0, 0.08, 0, 6);
      const ringT = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 16), GOLD()); ringT.position.y = 0.2; g.add(ringT);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        lathe([[0, 0.07], [0.02, 0.065], [0.035, 0.02], [0.04, 0], [0, 0]], GOLD(), g, Math.cos(a) * 0.06, 0.02, Math.sin(a) * 0.06);
      }
    });
    make('tray', 'both', g => {
      box(0.26, 0.015, 0.13, M(0xcfe3ea, { transparent: true, opacity: 0.55, roughness: 0.1 }), g, 0, 0.008, 0);
      g.userData.cover = box(0.17, 0.004, 0.11, M(0xfdfcf8), g, 0, 0.175, 0); g.userData.cover.visible = false;
    });
    const cruet = (name, liquid) => make(name, 'R', g => {
      lathe([[0, 0], [0.032, 0], [0.036, 0.04], [0.03, 0.1], [0.012, 0.13], [0.014, 0.16], [0, 0.16]], M(0xe6f2f4, { transparent: true, opacity: 0.5, roughness: 0.05 }), g, 0, 0, 0);
      lathe([[0, 0.003], [0.028, 0.003], [0.031, 0.04], [0.026, 0.085], [0, 0.085]], M(liquid, { transparent: true, opacity: 0.75, roughness: 0.2 }), g, 0, 0, 0);
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 12, Math.PI), M(0xe6f2f4, { transparent: true, opacity: 0.6 }));
      h.rotation.z = -Math.PI / 2; h.position.set(0.035, 0.08, 0); g.add(h);
    });
    cruet('wine', 0xd29a3c); cruet('water', 0xdcecf0);
    make('bowl', 'L', g => { lathe([[0, 0], [0.05, 0], [0.04, 0.02], [0.11, 0.05], [0.12, 0.06], [0, 0.03]], M(0xbfc3c6, { metalness: 0.7, roughness: 0.3 }), g, 0, 0, 0); });
    make('pitcher', 'R', g => {
      lathe([[0, 0], [0.04, 0], [0.045, 0.05], [0.035, 0.1], [0.03, 0.13], [0.04, 0.14], [0, 0.14]], M(0xc9cdd0, { metalness: 0.7, roughness: 0.3 }), g, 0, 0, 0);
      box(0.02, 0.02, 0.04, M(0xc9cdd0, { metalness: 0.7 }), g, 0, 0.13, 0.04);
    });
    make('towel', 'R', g => {
      const t = box(0.22, 0.006, 0.34, M(0xfbfaf6), g, 0, 0.004, 0);
      const draped = box(0.16, 0.2, 0.01, M(0xfbfaf6), g, 0, -0.09, 0.0); draped.visible = false;
      g.userData.setDraped = on => { draped.visible = on; t.visible = !on; };
    });
    make('paten', 'R', g => {
      cyl(0.09, 0.08, 0.008, GOLD(), g, 0, 0.004, 0, 24);
      box(0.025, 0.006, 0.12, GOLD(), g, 0, 0.004, 0.14);
    });
    for (const p of Object.values(P)) p.obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return P;
  }

  root.World = { build, M, oak, canvasTex };
})(typeof self !== 'undefined' ? self : this);
