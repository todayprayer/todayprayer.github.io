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
  const rug = () => canvasTex(1024, 300, (g, w, h) => {
    g.fillStyle = '#b9ab90'; g.fillRect(0, 0, w, h);                       // pale outer guard
    g.fillStyle = '#2e2a33'; g.fillRect(10, 10, w - 20, h - 20);           // dark border
    g.fillStyle = '#5e211c'; g.fillRect(36, 36, w - 72, h - 72);           // brick-red field
    g.strokeStyle = '#a08a62'; g.lineWidth = 2; g.strokeRect(30, 30, w - 60, h - 60);
    const R = rng(7);
    const flower = (x, y, sz, c) => { g.fillStyle = c; for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(x, y, sz, sz * 0.35, k * Math.PI / 4, 0, 7); g.fill(); } };
    for (let x = 18; x < w; x += 19) { flower(x, 22, 5, '#94804f'); flower(x, h - 22, 5, '#94804f'); }
    for (let y = 40; y < h - 30; y += 19) { flower(22, y, 5, '#94804f'); flower(w - 22, y, 5, '#94804f'); }
    for (let i = 0; i < 260; i++) {                                        // all-over small figures
      const x = 44 + R() * (w - 88), y = 44 + R() * (h - 88);
      flower(x, y, 3 + R() * 4, ['#8a7040', '#2e2a33', '#7d3a2c', '#a58f62'][Math.floor(R() * 4)]);
    }
    g.fillStyle = '#2e2a33'; g.beginPath(); g.ellipse(w / 2, h / 2, 120, 62, 0, 0, 7); g.fill();     // the medallion
    g.fillStyle = '#6d2a22'; g.beginPath(); g.ellipse(w / 2, h / 2, 104, 50, 0, 0, 7); g.fill();
    flower(w / 2, h / 2, 40, '#a58f62'); flower(w / 2, h / 2, 20, '#2e2a33');
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '255,240,210' : '20,10,5'},${R() * 0.08})`; g.fillRect(R() * w, R() * h, 2, 2); }     // wear
  });
  /** A wooden gate panel: a gilt grille with a cross, or the blue shield with the crossed keys. */
  const gatePanel = keys => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#6a5a44'; g.fillRect(0, 0, w, h);
    if (keys) {
      g.fillStyle = '#26478f'; g.beginPath(); g.moveTo(44, 26); g.lineTo(212, 26); g.lineTo(212, 136); g.quadraticCurveTo(208, 200, 128, 236); g.quadraticCurveTo(48, 200, 44, 136); g.closePath(); g.fill();
      g.strokeStyle = '#d9c06a'; g.lineWidth = 5; g.stroke();
      g.strokeStyle = '#e6c95f'; g.lineWidth = 9; g.lineCap = 'round';
      for (const k of [1, -1]) {
        g.beginPath(); g.moveTo(128 + k * 58, 62); g.lineTo(128 - k * 50, 182); g.stroke();
        g.beginPath(); g.arc(128 + k * 62, 56, 15, 0, 7); g.stroke();
        g.beginPath(); g.moveTo(128 - k * 50, 182); g.lineTo(128 - k * 30, 190); g.stroke();
        g.beginPath(); g.moveTo(128 - k * 42, 164); g.lineTo(128 - k * 24, 172); g.stroke();
      }
    } else {
      g.fillStyle = '#39352c'; g.fillRect(26, 26, 204, 204);
      g.strokeStyle = '#a58a4c'; g.lineWidth = 4;
      for (const [x, y] of [[78, 78], [178, 78], [78, 178], [178, 178]]) { for (const r of [34, 20]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); } }
      g.strokeRect(30, 30, 196, 196);
      g.strokeStyle = '#c9ab5e'; g.lineWidth = 12; g.beginPath(); g.moveTo(128, 56); g.lineTo(128, 204); g.moveTo(88, 104); g.lineTo(168, 104); g.stroke();
    }
  });

  /** Build the chapel into `scene`. Returns fixtures and the props by name. */
  function build(scene) {
    const room = new THREE.Group(); scene.add(room);
    const fx = {};

    // the sanctuary's oak walls; the floor and everything beyond belong to Site
    const wallTex = root.Tex.get('oak', 'd', { repeat: [3, 2] });
    const wallMat = M(0xa9aeae, { map: wallTex, roughness: 0.55 });
    const W = L.wallSide, wallH = root.Plan.CH.sanctuaryCeil, frontZ = root.Plan.CH.front - 0.16, wallLen = frontZ - L.wallBack;
    box(2 * W, wallH, 0.1, wallMat, room, 0, wallH / 2, L.wallBack - 0.05, false);
    box(0.1, wallH, wallLen, wallMat, room, -W - 0.05, wallH / 2, L.wallBack + wallLen / 2, false);
    // the Epistle wall, with the door to the changing room in it
    const srv = root.Plan.DOORS.find(d => d.id === 'servers'), srv0 = srv.c - srv.w / 2, srv1 = srv.c + srv.w / 2;
    box(0.1, wallH, srv0 - L.wallBack, wallMat, room, W + 0.05, wallH / 2, (L.wallBack + srv0) / 2, false);
    box(0.1, wallH, frontZ - srv1, wallMat, room, W + 0.05, wallH / 2, (srv1 + frontZ) / 2, false);

    // altar steps: lowest, second, top (footpace), in bare wood as the photographs show
    const stepMat = M(0xffffff, { map: root.Tex.get('floorboard', 'd'), roughness: 0.45 });
    const riser = M(0x3a2a1c, { roughness: 0.6 }), nosing = M(0x8d7558, { map: oak(), roughness: 0.45 });
    for (const [xh, zf, h] of L.steps) {
      const d = zf - L.wallBack;
      box(2 * xh, h, d, stepMat, room, 0, h / 2, L.wallBack + d / 2);
      box(2 * xh + 0.012, 0.13, 0.012, riser, room, 0, h - 0.085, zf, false);
      box(2 * xh + 0.04, 0.02, 0.05, nosing, room, 0, h - 0.009, zf - 0.015, false);
      for (const k of [-1, 1]) {
        box(0.012, 0.13, d, riser, room, k * xh, h - 0.085, L.wallBack + d / 2, false);
        box(0.05, 0.02, d, nosing, room, k * (xh - 0.015), h - 0.009, L.wallBack + d / 2, false);
      }
    }
    // the carpet lies on the footpace, from the altar to the edge of the top step, a little wider than the altar
    const [topX, topZ, topH] = L.steps[2], rugFrom = L.mensa.z1 + 0.03;
    const rugM = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(2 * topX - 0.08, 2 * L.mensa.x + 0.4), topZ - rugFrom - 0.03), M(0xffffff, { map: rug(), roughness: 0.95 }));
    rugM.rotation.x = -Math.PI / 2; rugM.position.set(0, topH + 0.006, (rugFrom + topZ - 0.03) / 2); rugM.receiveShadow = true; room.add(rugM);

    // the altar: white with gilded columns, linen cloth with lace front
    const mz = L.mensa, alt = new THREE.Group(); room.add(alt);
    const mw = 2 * mz.x, md = mz.z1 - mz.z0, top = mz.top, base = 0.45;
    box(mw, top - base - 0.04, md, WHITE(), alt, 0, (top + base - 0.04) / 2, (mz.z0 + mz.z1) / 2);
    for (const x of [-0.84, -0.48, 0.48, 0.84]) {
      cyl(0.055, 0.055, top - base - 0.25, GOLD(), alt, x, (top + base) / 2 - 0.05, mz.z1 + 0.04);
      box(0.18, 0.08, 0.12, WHITE(), alt, x, base + 0.05, mz.z1 + 0.04);
      box(0.18, 0.08, 0.12, WHITE(), alt, x, top - 0.22, mz.z1 + 0.04);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.028, 8, 32), GOLD()); ring.position.set(0, (top + base) / 2, mz.z1 + 0.02); ring.scale.y = 1.15; alt.add(ring);
    const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.19, 28), M(0xe8e2d0)); emblem.position.set(0, (top + base) / 2, mz.z1 + 0.012); emblem.scale.y = 1.15; alt.add(emblem);
    box(0.05, 0.26, 0.012, GOLD(), alt, 0, (top + base) / 2, mz.z1 + 0.018); box(0.2, 0.05, 0.012, GOLD(), alt, 0, (top + base) / 2 + 0.03, mz.z1 + 0.018);
    box(mw + 0.08, 0.02, md + 0.04, M(0xfcfbf7), alt, 0, top - 0.01, (mz.z0 + mz.z1) / 2);
    box(mw + 0.08, 0.26, 0.01, M(0xfcfbf7, { transparent: true, opacity: 0.92 }), alt, 0, top - 0.14, mz.z1 + 0.025);
    box(0.01, 0.9, md, M(0xfcfbf7), alt, mz.x + 0.04, top - 0.45, (mz.z0 + mz.z1) / 2);
    box(0.01, 0.9, md, M(0xfcfbf7), alt, -mz.x - 0.04, top - 0.45, (mz.z0 + mz.z1) / 2);

    // gradine, reredos, tabernacle, crucifix, candlesticks, altar cards
    const gr = L.gradine;
    box(mw, gr.top - top, gr.z1 - gr.z0, WHITE(), alt, 0, (gr.top + top) / 2, (gr.z0 + gr.z1) / 2);
    const rz0 = L.wallBack + 0.24;
    box(1.9, 0.2, 0.4, WHITE(), alt, 0, gr.top + 0.1, rz0);                        // the base it stands on
    box(1.94, 0.025, 0.44, GOLD(), alt, 0, gr.top + 0.21, rz0);
    for (const s of [-1, 1]) {                                                     // stepped wings
      box(0.38, 0.3, 0.34, WHITE(), alt, s * 0.71, gr.top + 0.37, rz0);
      box(0.41, 0.025, 0.38, GOLD(), alt, s * 0.71, gr.top + 0.53, rz0);
      for (const x of [0.54, 0.87]) cyl(0.02, 0.02, 0.28, GOLD(), alt, s * x, gr.top + 0.37, rz0 + 0.18, 10);
      lathe([[0, 0], [0.06, 0], [0.04, 0.04], [0.012, 0.09], [0.024, 0.13], [0, 0.17]], GOLD(), alt, s * 0.71, gr.top + 0.54, rz0, 12);
      box(0.25, 0.18, 0.28, WHITE(), alt, s * 0.4, gr.top + 0.31, rz0);
    }
    box(0.72, 0.72, 0.42, WHITE(), alt, 0, gr.top + 0.56, rz0);                    // the middle, up to the dome
    for (const x of [-0.31, -0.22, 0.22, 0.31]) cyl(0.022, 0.022, 0.66, GOLD(), alt, x, gr.top + 0.56, rz0 + 0.22, 10);
    box(0.78, 0.035, 0.46, GOLD(), alt, 0, gr.top + 0.93, rz0);
    box(0.58, 0.1, 0.38, WHITE(), alt, 0, gr.top + 1.0, rz0);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.26, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), WHITE()); dome.position.set(0, gr.top + 1.05, rz0); alt.add(dome);
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, rib = box(0.016, 0.19, 0.016, GOLD(), alt, Math.sin(a) * 0.19, gr.top + 1.14, rz0 + Math.cos(a) * 0.19); rib.rotation.set(Math.cos(a) * 0.75, 0, -Math.sin(a) * 0.75); }
    lathe([[0, 0], [0.045, 0], [0.028, 0.04], [0.035, 0.08], [0, 0.1]], GOLD(), alt, 0, gr.top + 1.3, rz0, 12);
    box(0.014, 0.14, 0.014, GOLD(), alt, 0, gr.top + 1.46, rz0); box(0.08, 0.014, 0.014, GOLD(), alt, 0, gr.top + 1.49, rz0);
    const tab = new THREE.Group(); tab.position.set(0, top, -1.6); alt.add(tab);
    box(0.56, 0.55, 0.32, WHITE(), tab, 0, 0.275, 0);
    for (const x of [-0.24, 0.24]) cyl(0.03, 0.03, 0.5, GOLD(), tab, x, 0.28, 0.17);
    const tabDoor = new THREE.Group(); tabDoor.position.set(-0.17, 0.27, 0.165); tab.add(tabDoor);
    box(0.34, 0.36, 0.02, M(0xb11e2b, { roughness: 0.6 }), tabDoor, 0.17, 0, 0);    // the red veil over the door
    fx.tabDoor = tabDoor;
    box(0.36, 0.56, 0.03, M(0xe9e2d2), alt, 0, gr.top + 0.56, rz0 + 0.21);
    const cru = new THREE.Group(); cru.position.set(0, gr.top + 0.5, rz0 + 0.25); cru.scale.setScalar(0.8); alt.add(cru);
    box(0.035, 0.62, 0.03, GOLD(), cru, 0, 0.1, 0); box(0.3, 0.035, 0.03, GOLD(), cru, 0, 0.25, 0);
    box(0.05, 0.18, 0.04, M(0xe6d8bd), cru, 0, 0.18, 0.02);
    cyl(0.07, 0.1, 0.08, GOLD(), cru, 0, -0.24, 0);
    fx.candles = {};
    for (const x of [-0.86, -0.65, -0.44, 0.44, 0.65, 0.86]) {
      const g = new THREE.Group(); g.position.set(x, gr.top, -1.6); alt.add(g);
      lathe([[0.0, 0], [0.09, 0], [0.09, 0.03], [0.04, 0.08], [0.025, 0.2], [0.04, 0.24], [0.022, 0.42], [0.04, 0.47], [0.05, 0.5], [0, 0.5]], GOLD(), g, 0, 0, 0);
      cyl(0.022, 0.022, 0.38, M(0xf2ead6), g, 0, 0.69, 0);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
      flame.scale.set(1, 2, 1); flame.position.set(0, 0.9, 0); g.add(flame);
      flame.visible = Math.abs(x) === 0.44;       // Low Mass: the two candles nearest the cross
      fx.candles[x] = flame;
    }
    const cardMat = M(0xf7f2e4), frame = GOLD();
    for (const [x, w, h] of [[0, 0.5, 0.36], [-0.82, 0.22, 0.28], [0.82, 0.22, 0.28]]) {
      const g = new THREE.Group(); g.position.set(x, top, -1.33); g.rotation.x = -0.18; alt.add(g);
      box(w + 0.04, h + 0.04, 0.02, frame, g, 0, h / 2 + 0.02, 0);
      box(w, h, 0.005, cardMat, g, 0, h / 2 + 0.02, 0.012);
    }
    // flowers in white vases, on small dark stands either side of the altar
    { const standWood = M(0x2b1710, { roughness: 0.55 }), leaf = M(0x2f5a2c, { roughness: 0.75 }), petal = M(0xf4f0e2, { roughness: 0.7 });
      const pick = rng(11);
      for (const x of [-1.45, 1.45]) {
        const z = -1.9;
        box(0.42, 0.05, 0.42, standWood, room, x, 0.8, z);
        for (const [a, b] of [[-0.17, -0.17], [-0.17, 0.17], [0.17, -0.17], [0.17, 0.17]]) box(0.045, 0.78, 0.045, standWood, room, x + a, 0.39, z + b);
        box(0.36, 0.03, 0.36, standWood, room, x, 0.2, z);
        lathe([[0, 0], [0.07, 0], [0.05, 0.05], [0.09, 0.16], [0.075, 0.28], [0.1, 0.32], [0, 0.32]], WHITE(), room, x, 0.825, z, 16);
        for (let i = 0; i < 26; i++) {
          const a = pick() * 6.283, r = 0.03 + pick() * 0.2, y = 1.18 + pick() * 0.36 - r * 0.5;
          const m = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.2, 5), leaf);
          m.position.set(x + Math.cos(a) * r, y, z + Math.sin(a) * r); m.rotation.set(Math.sin(a) * 0.9 * r * 5, 0, -Math.cos(a) * 0.9 * r * 5); room.add(m);
        }
        for (let i = 0; i < 9; i++) {
          const a = pick() * 6.283, r = 0.02 + pick() * 0.15;
          const m = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.09, 6), petal);
          m.position.set(x + Math.cos(a) * r, 1.32 + pick() * 0.28, z + Math.sin(a) * r); m.rotation.x = Math.PI; room.add(m);
        }
      }
    }

    // sanctuary lamp (Gospel side)
    const lamp = new THREE.Group(); lamp.position.set(-1.35, 2.4, L.wallBack + 0.3); room.add(lamp);
    cyl(0.007, 0.007, 0.5, GOLD(), lamp, 0, 0.25, 0, 8);
    box(0.03, 0.03, 0.34, GOLD(), lamp, 0, 0.5, -0.15);                            // the arm
    box(0.12, 0.22, 0.02, GOLD(), lamp, 0, 0.5, -0.3);                             // and its plate on the wall
    box(0.024, 0.024, 0.24, GOLD(), lamp, 0, 0.42, -0.18).rotation.x = -0.6;
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
    // the servers' chairs: plainer and lower-backed than the sedilia, their backs away from the way they face
    for (const [x, z, facing] of L.chairs) {
      const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = facing; room.add(c);
      box(0.44, 0.05, 0.42, M(0x3a0a0e), c, 0, 0.45, 0); box(0.44, 0.5, 0.04, chairWood, c, 0, 0.72, -0.2);
      for (const [a, b] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) box(0.04, 0.44, 0.04, chairWood, c, a, 0.22, b);
    }
    // the two big columns at the corners of the altar steps: round oak shafts, moulded base and capital
    const columnM = M(0x927a5c, { map: oak(), roughness: 0.42 }), beamBottom = 3.1;
    for (const [x, z] of L.columns) {
      const y0 = C.heightAt(x, z);      // they stand on the front corners of the footpace
      const shaftH = beamBottom - 0.34 - 0.3 - y0;
      cyl(0.22, 0.26, shaftH, columnM, room, x, y0 + 0.3 + shaftH / 2, z, 28);
      box(0.56, 0.16, 0.56, columnM, room, x, y0 + 0.08, z);
      cyl(0.26, 0.28, 0.14, columnM, room, x, y0 + 0.23, z, 28);
      const capY = y0 + 0.3 + shaftH;
      cyl(0.25, 0.22, 0.05, columnM, room, x, capY + 0.025, z, 24);
      cyl(0.34, 0.24, 0.16, columnM, room, x, capY + 0.13, z, 24);
      for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {                  // the scrolls at the corners
        const v = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.022, 8, 14), columnM);
        v.position.set(x + a * 0.25, capY + 0.17, z + b * 0.25); v.rotation.y = Math.atan2(a, b) + Math.PI / 2; room.add(v);
      }
      box(0.72, 0.1, 0.72, columnM, room, x, beamBottom - 0.05, z);
    }
    // the moulded beam across the front of the alcove, with a carved frieze above it
    { const beam = M(0xa8967a, { map: oak(), roughness: 0.5 }), bz = L.columns[0][1];
      box(2 * W, 0.22, 0.62, beam, room, 0, beamBottom + 0.11, bz, false);
      box(2 * W, 0.06, 0.72, beam, room, 0, beamBottom + 0.25, bz, false);
      box(2 * W, wallH - beamBottom - 0.28, 0.5, beam, room, 0, (wallH + beamBottom + 0.28) / 2, bz, false);
      for (let x = -4.4; x <= 4.41; x += 1.1) box(0.84, 0.2, 0.02, M(0x8f7c62, { map: oak() }), room, x, (wallH + beamBottom + 0.28) / 2, bz + 0.26, false);
    }
    // the side walls are panelled
    { const stile = M(0x9c8a6e, { map: oak(), roughness: 0.5 });
      for (const s of [-1, 1]) {
        box(0.04, 0.12, wallLen, stile, room, s * (W - 0.02), 2.4, L.wallBack + wallLen / 2, false);
        for (let z = L.wallBack + 0.5; z < frontZ; z += 1.2) box(0.04, wallH - 2.4, 0.1, stile, room, s * (W - 0.02), (wallH + 2.4) / 2, z, false);
      }
    }
    // a processional staff against the Gospel wall
    { cyl(0.012, 0.012, 2.1, GOLD(), room, -4.92, 1.05, 0.5, 8); lathe([[0, 0], [0.08, 0], [0.05, 0.03], [0, 0.05]], GOLD(), room, -4.92, 0, 0.5, 10);
      box(0.018, 0.22, 0.018, GOLD(), room, -4.92, 2.2, 0.5); box(0.14, 0.018, 0.018, GOLD(), room, -4.92, 2.24, 0.5); }
    const lect = new THREE.Group(); lect.position.set(L.lectern[0], 0, L.lectern[1]); room.add(lect);
    lathe([[0, 0], [0.2, 0], [0.2, 0.02], [0.08, 0.07], [0.035, 0.16], [0.03, 0.42], [0.06, 0.48], [0.03, 0.54], [0.025, 0.86], [0.05, 0.92], [0.03, 0.98], [0.06, 1.06], [0, 1.08]], GOLD(), lect, 0, 0, 0, 20);
    const desk = new THREE.Group(); desk.position.set(0, 1.12, 0); desk.rotation.x = -0.35; lect.add(desk);
    box(0.54, 0.018, 0.38, GOLD(), desk, 0, 0, 0); box(0.54, 0.05, 0.016, GOLD(), desk, 0, 0.025, 0.19);
    for (const s of [-1, 1]) box(0.012, 0.04, 0.38, GOLD(), desk, s * 0.27, 0.02, 0);

    // communion rail with two gates, and the rail cloths
    const railWood = M(0x927b60, { map: oak(), roughness: 0.45 });
    const rz = L.rail, gh = L.gateHalf;
    for (const s of [-1, 1]) {
      const RX = root.Plan.CH.railX, x0 = s * gh, x1 = s * RX, cx = (x0 + x1) / 2, len = Math.abs(x1 - x0);
      box(len, 0.08, 0.2, railWood, room, cx, 0.86, rz);
      box(0.3, 1.02, 0.3, railWood, room, s * (gh + 0.15), 0.51, rz);      // the broad posts either side of the gates
      box(len, 0.82, 0.1, railWood, room, cx, 0.41, rz);
      // the rail's left and right sides, back to the panelled wall
      box(0.2, 0.08, rz - root.Plan.CH.front - 0.15, railWood, room, s * RX, 0.86, (rz + root.Plan.CH.front + 0.15) / 2);
      box(0.1, 0.82, rz - root.Plan.CH.front - 0.15, railWood, room, s * RX, 0.41, (rz + root.Plan.CH.front + 0.15) / 2);
      // the cloth laid along the side rail too
      const sideLen = rz - root.Plan.CH.front - 0.25, sideZ = (rz + root.Plan.CH.front + 0.05) / 2;
      box(0.24, 0.008, sideLen, M(0xfdfcf8), room, s * RX, 0.905, sideZ, false);
      box(0.008, 0.46, sideLen, M(0xfdfcf8), room, s * (RX + 0.12), 0.675, sideZ, false);
    }
    fx.gates = {};
    for (const [name, s] of [['gateE', 1], ['gateG', -1]]) {
      const pivot = new THREE.Group(); pivot.position.set(s * gh, 0, rz); room.add(pivot);
      const leaf = new THREE.Group(); pivot.add(leaf);
      box(gh - 0.02, 0.82, 0.05, railWood, leaf, -s * gh / 2, 0.45, 0);
      box(gh + 0.02, 0.06, 0.09, railWood, leaf, -s * gh / 2, 0.88, 0);
      const art = M(0xffffff, { map: gatePanel(s > 0), roughness: 0.6 }), side = Math.min(gh - 0.2, 0.62);
      for (const z of [0.027, -0.027]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(side, side), art);
        p.position.set(-s * gh / 2, 0.46, z); if (z < 0) p.rotation.y = Math.PI; leaf.add(p);
      }
      fx.gates[name] = { pivot, side: s, open: 1 };
      pivot.rotation.y = -s * 1.45;       // open "as much as possible without touching back" before Mass
    }
    fx.cloths = {};
    for (const [name, s] of [['clothE', 1], ['clothG', -1]]) {
      const x0 = s * (gh + 0.32), x1 = s * (root.Plan.CH.railX - 0.1), cx = (x0 + x1) / 2, len = Math.abs(x1 - x0);
      const pivot = new THREE.Group(); pivot.position.set(cx, 0.905, rz - 0.1); room.add(pivot);
      box(len, 0.008, 0.2, M(0xfdfcf8), pivot, 0, 0, 0.1, false);
      const drape = box(len, 0.46, 0.008, M(0xfdfcf8), pivot, 0, -0.23, 0, false);
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
      // the chalice veil is a square of silk, half a metre across, a cross worked on its front and a braid round its edge.
      // One cloth, shaped by three things: how far it is draped over the chalice, and its two folds into thirds
      const S = 0.5, N = 24, third = S / 6;
      const silk = canvasTex(256, 256, (c, w, h) => {
        c.fillStyle = '#0c3016'; c.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 2) { c.fillStyle = 'rgba(255,255,255,0.025)'; c.fillRect(0, y, w, 1); }
        c.strokeStyle = '#c9a23a'; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12);
        c.fillStyle = '#d4ad48'; c.fillRect(w / 2 - 7, h * 0.69, 14, h * 0.25); c.fillRect(w / 2 - 26, h * 0.745, 52, 12);      // the cross, on the front fall: all of it within the front third, its head towards the middle
      });
      const geo = new THREE.PlaneGeometry(S, S, N, N); geo.rotateX(-Math.PI / 2);
      const base = geo.attributes.position.array.slice();
      // the face, with its cross and braid, on top as it lies (and outward over the chalice); underneath, the plain lining
      const cloth = new THREE.Mesh(geo, M(0xffffff, { map: silk, side: THREE.FrontSide, roughness: 0.55 }));
      cloth.castShadow = true; cloth.receiveShadow = true; g.add(cloth);
      const lining = new THREE.Mesh(geo, M(0x1c4a2a, { side: THREE.BackSide, roughness: 0.7 }));
      lining.receiveShadow = true; g.add(lining);
      // hold: how far it is taken up by its back edge (0: as the other three say). Held up there, at (px, py, pz) in its own frame, it hangs from that edge:
      // straight down to the mensa (its top is y 0 here, its front edge at z = edge), along it, and over the front; or, held out beyond the edge, straight down
      const st = { drape: 1, f1: 0, f2: 0, lift: 0, hold: 0, px: 0, py: 0, pz: -S / 2, edge: 99, table: 1, rest: 0, roll: -1, side: 99, sideK: 0 }, smooth = t => t * t * (3 - 2 * t);
      const hung = (x, z, out) => {
        const rel = z + S / 2, over = st.table && st.pz < st.edge;
        const d1 = over ? Math.max(0, st.py) : Infinity, d2 = over ? st.edge - st.pz : 0;
        if (rel <= d1) return out.set(x + st.px, st.py - rel + 0.004, st.pz);
        if (rel <= d1 + d2) return out.set(x + st.px, 0.004, st.pz + rel - d1);
        return out.set(x + st.px, 0.004 - (rel - d1 - d2), st.edge + OUT);
      };
      // over the front, it hangs clear of the altar cloth's lace (2.5 cm out) and of the capitals below
      const OUT = 0.038;
      // roll: opened from its fold where it lies at the front of the mensa, the cross third on top. Its front edge is drawn down over the edge, and the cloth follows
      // it off the folded strip: the front third slides over and hangs, face out, and the rest comes out from under the strip, face up, to lie back on the mensa.
      // What is still folded stays hidden under the strip. At 1 it is the cloth hung over the edge (hold with pz −S/2), exactly
      const rolled = (x, z, out) => {
        const l = S / 2 - z, H = S / 2 - st.edge, s = st.roll, h = s * H, vis = S / 3 + s * (S - H - S / 3), top = 0.004 + 0.0105 * (1 - s);
        if (l < h) return out.set(x, 0.004 - (h - l), st.edge + OUT);
        if (l < h + vis) return out.set(x, top, st.edge - (l - h));
        const rem = S - h - vis, k = rem > 1e-6 ? (l - h - vis) / rem : 1;
        return out.set(x * 0.97, 0.003, st.edge - vis + 0.01 + k * (vis - 0.02));
      };
      const q = new THREE.Vector3();
      /** Where a point of the cloth (x, z across it, from its centre) lies now, in the veil's own frame. */
      const shape = (x, z, out) => {
        if (st.roll >= 0) return rolled(x, z, out);
        // laid flat, and folded in thirds into a strip lying across, the face kept outward: the back third turned down and under the middle (f1), then
        // the middle, with the back third inside it, turned down and under the front third (f2). The front third, the cross on it upright, stays on top
        // face up where it was; the lining is never seen. What is folded under lifts it a little. Resting on something (rest), nothing goes below the
        // surface: opened out there, the folds slide out from under the front third, face up, rather than swinging down through the altar
        const k1 = st.f1 / Math.PI, k2 = st.f2 / Math.PI, lift = 0.0035 * k1 + 0.007 * k2, floor = 0.004;
        let fx = x, fy = floor + lift, fz = z;
        if (z < third) {
          let mz = z, my = 0, lowest = floor;      // in the middle third's own frame, before it turns
          if (z < -third) { const u = -third - z; mz = -third - u * Math.cos(st.f1); my = -u * Math.sin(st.f1) - 0.0035 * k1; }
          else lowest = floor + 0.0035 * k1;      // the middle lies on the back third while that is under it
          const dz = mz - third, c = Math.cos(st.f2), s = Math.sin(st.f2);
          fz = third + dz * c - my * s; fy = floor + lift - 0.007 * k2 + dz * s + my * c;
          if (st.rest) fy = Math.max(fy, lowest);
        }
        // laid near the end of the altar, what lies beyond its side edge (local x = side) bends down over it, sideK of the way to hanging straight;
        // the layers keep their order, the top one outermost
        if (st.sideK > 0 && fx > st.side) { const dd = fx - st.side, th = st.sideK * Math.PI / 2, c = Math.cos(th), sn = Math.sin(th); fx = st.side + dd * c + fy * sn; fy = fy * c - dd * sn; }
        // over the chalice: flat on the pall, then falling all round, a little out from the cup
        const r = Math.max(Math.abs(x), Math.abs(z)), pall = 0.066;
        let dx = x, dz = z, dy = 0.258;
        if (r > pall) { const e = r - pall, hz = pall + e * 0.17; dx = x * hz / r; dz = z * hz / r; dy = 0.258 - e * 1.33; }
        dy -= 0.25 * st.lift;      // held up by the hands, it hangs from them rather than standing on a cup
        const k = smooth(st.drape);
        out.set(fx + (dx - fx) * k, fy + (dy - fy) * k, fz + (dz - fz) * k);
        if (st.hold > 0) { hung(x, z, q); out.lerp(q, smooth(Math.min(1, st.hold))); }
        return out;
      };
      const p = new THREE.Vector3();
      const apply = () => {
        const a = geo.attributes.position;
        for (let i = 0; i < a.count; i++) { shape(base[i * 3], base[i * 3 + 2], p); a.setXYZ(i, p.x, p.y, p.z); }
        a.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
      };
      const STATES = { draped: { drape: 1, f1: 0, f2: 0, lift: 0 }, held: { drape: 0, f1: 0, f2: 0, lift: 0 }, flat: { drape: 0, f1: 0, f2: 0, lift: 0 }, folded: { drape: 0, f1: Math.PI, f2: Math.PI, lift: 0 } };
      const UNHELD = { hold: 0, px: 0, py: 0, pz: -S / 2, edge: 99, table: 1, rest: 0, roll: -1, side: 99, sideK: 0 };
      g.userData.setState = s => { Object.assign(st, UNHELD, STATES[s] || STATES.flat); apply(); };
      g.userData.S = S;
      /** Laid on the altar, opened out, the cross panel hanging over its front edge: `edge` is that edge in the veil's own frame. */
      g.userData.lay = edge => { Object.assign(st, STATES.flat, { hold: 1, px: 0, py: 0, pz: -S / 2, edge, table: 1, rest: 0, roll: -1, side: 99, sideK: 0 }); apply(); };
      /** Part way between shapes, as a hand moves it. */
      g.userData.set = o => { Object.assign(st, o); apply(); };
      g.userData.shape = () => Object.assign({}, st);
      /** Where the middle of its left or right edge is now, in the world: where a hand takes hold of it. */
      g.userData.edgeWorld = side => { g.updateMatrixWorld(true); return shape(side === 'L' ? -S / 2 : S / 2, 0, new THREE.Vector3()).applyMatrix4(g.matrixWorld); };
      g.userData.pointWorld = (x, z) => { g.updateMatrixWorld(true); return shape(x, z, new THREE.Vector3()).applyMatrix4(g.matrixWorld); };
      g.userData.setState('draped');
    });
    make('burse', 'L', g => {
      // two stiff boards in green silk, joined along the bottom: a pocket for the corporal, the front one worked with a cross.
      // Lying down, the mouth is towards the back (−z); stood up in the hand, the mouth is at the top and the cross faces out
      const gold = M(0xd4ad48, { metalness: 0.6, roughness: 0.4 }), lining = M(0xf2efe6, { roughness: 0.8 }), W = 0.21;
      const body = new THREE.Group(); g.add(body);
      box(W, 0.007, W, green, body, 0, -0.004, 0);
      box(W - 0.01, 0.002, W - 0.01, lining, body, 0, 0.0005, 0);      // the inside
      const hinge = new THREE.Group(); hinge.position.set(0, 0, W / 2); body.add(hinge);
      box(W, 0.007, W, green, hinge, 0, 0.005, -W / 2);
      box(W - 0.01, 0.002, W - 0.01, lining, hinge, 0, 0.0005, -W / 2);
      box(0.03, 0.002, 0.12, gold, hinge, 0, 0.0095, -W / 2); box(0.09, 0.002, 0.03, gold, hinge, 0, 0.0095, -W / 2 - 0.025);      // the cross
      const inside = box(W - 0.03, 0.004, W * 0.75, M(0xfdfcf8, { roughness: 0.9 }), body, 0, 0.004, W * 0.1); inside.visible = false;      // the corporal, folded within
      // up: 0 lying flat, 1 stood on its folded edge; open: the front board drawn away from the back, the mouth gaping
      g.userData.setPose = (up, open) => {
        body.rotation.x = up * Math.PI / 2; body.position.set(0, 0.012 + up * (W / 2 - 0.012), 0);
        hinge.rotation.x = open * 0.42;
      };
      g.userData.setFull = on => { inside.visible = on; };
      g.userData.W = W;
      /** The middle of its mouth, in the world: where the corporal goes in. */
      g.userData.mouthWorld = () => { g.updateMatrixWorld(true); return new THREE.Vector3(0, 0.004, -W / 2 + 0.01).applyMatrix4(body.matrixWorld); };
      g.userData.setPose(0, 0);
    });
    make('corporal', 'R', g => {
      // the square of linen the Host and chalice stand on: spread from the burse at the Offertory, folded in three each way after the Ablutions.
      // A small cross is worked near its front edge, towards the priest
      const S = 0.5, N = 18, third = S / 6;
      const linen = canvasTex(128, 128, (c, w, h) => {
        c.fillStyle = '#fbfaf4'; c.fillRect(0, 0, w, h);
        c.strokeStyle = 'rgba(120,110,90,0.45)'; c.lineWidth = 2; c.strokeRect(3, 3, w - 6, h - 6);      // its hem, which is what shows it on a white altar cloth
        for (let y = 0; y < h; y += 3) { c.fillStyle = 'rgba(0,0,0,0.018)'; c.fillRect(0, y, w, 1); }
        c.fillStyle = '#b8302a'; c.fillRect(w / 2 - 2, h * 0.8, 4, h * 0.12); c.fillRect(w / 2 - 6, h * 0.83, 12, 3);
      });
      const geo = new THREE.PlaneGeometry(S, S, N, N); geo.rotateX(-Math.PI / 2);
      const base = geo.attributes.position.array.slice();
      const cloth = new THREE.Mesh(geo, M(0xffffff, { map: linen, side: THREE.DoubleSide, roughness: 0.85 }));
      cloth.receiveShadow = true; g.add(cloth);
      // fz: the front third, then the back third, laid over the middle; fx: then the right and the left
      const st = { fz: 0, fx: 0 };
      // the outer third of one coordinate (a across the crease, b up) turned up and over its crease at +third, onto what lies inside it
      const p = { a: 0, b: 0 };
      const fold = (t, lift) => {
        if (t <= 0 || p.a <= third) return;
        const d = p.a - third, c = Math.cos(t * Math.PI), s = Math.sin(t * Math.PI);
        p.a = third + d * c - p.b * s; p.b = d * s + p.b * c + lift * t;
      };
      const apply = () => {
        const a = geo.attributes.position, z1 = Math.min(1, st.fz * 2), z2 = Math.max(0, st.fz * 2 - 1), x1 = Math.min(1, st.fx * 2), x2 = Math.max(0, st.fx * 2 - 1);
        for (let i = 0; i < a.count; i++) {
          let x = base[i * 3], z = base[i * 3 + 2];
          p.a = z; p.b = 0.002; fold(z1, 0.0065); p.a = -p.a; fold(z2, 0.009); z = -p.a;      // front over, then back over
          p.a = x; fold(x1, 0.0165); p.a = -p.a; fold(x2, 0.024); x = -p.a;      // then right over, then left: each fold well above the layers beneath
          a.setXYZ(i, x, p.b, z);
        }
        a.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
      };
      g.userData.set = o => { Object.assign(st, o); apply(); };
      g.userData.state = () => Object.assign({}, st);
      g.userData.third = third;
      g.userData.set({ fz: 0, fx: 0 });
    });
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
