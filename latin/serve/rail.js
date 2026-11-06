/*
 * The train: a locomotive and three bi-level coaches running the real line through Northridge and Chatsworth, stopping at both stations, and pushing back the other way.
 * You can get on at either platform. The crossings have their gates, and the traffic waits. Paint from memory: colours and lettering, no agency's actual artwork.
 * Forward is +z in each car; the track's own direction is the train's +z, so going the other way it is simply pushed from behind, as these trains are.
 */
(function (root) {
  'use strict';
  const THREE = root.THREE, Wide = root.WideData, Inner = root.SiteData, Q = root.Quality;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const W = 3.0, H = 4.72, COACH = 25.9, LOCO = 17.8, GAP = 0.9, FLOOR = 0.62;
  const canvas = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; return t; };

  // ─── the line ──────────────────────────────────────────────────────────────
  /** The whole length of the main track, from one edge of the map to the other, gathered from its pieces. */
  function mainLine() {
    const nodes = new Map(), key = (x, z) => x + ',' + z, node = (x, z) => { const k = key(x, z); let n = nodes.get(k); if (!n) nodes.set(k, n = { x, z, out: [], d: 1e12, prev: null }); return n; };
    for (const r of Wide.rails) {
      let prev = null;
      for (let i = 0; i < r.p.length; i += 2) { const n = node(r.p[i], r.p[i + 1]); if (prev && prev !== n) { const L = Math.hypot(n.x - prev.x, n.z - prev.z) * (r.s ? 4 : 1); prev.out.push({ to: n, L }); n.out.push({ to: prev, L }); } prev = n; }
    }
    // there are stubs and yards that join nothing: the line is the longest piece that hangs together
    const list = [...nodes.values()]; let main = [], longest = 0;
    { const seen = new Set(); for (const n of list) { if (seen.has(n)) continue; const part = [], st = [n]; seen.add(n); let len = 0; while (st.length) { const q = st.pop(); part.push(q); for (const e of q.out) { len += e.L; if (!seen.has(e.to)) { seen.add(e.to); st.push(e.to); } } } if (len > longest) { longest = len; main = part; } } }
    const ends = main.filter(n => n.out.length === 1);
    if (!ends.length) return null;
    let A = ends[0], B = ends[0], far = 0;
    for (const a of ends) for (const b of ends) { const d = Math.hypot(a.x - b.x, a.z - b.z); if (d > far) { far = d; A = a; B = b; } }
    A.d = 0; const open = new Set([A]);
    while (open.size) {
      let n = null; for (const q of open) if (!n || q.d < n.d) n = q;
      open.delete(n); if (n === B) break;
      for (const e of n.out) if (n.d + e.L < e.to.d) { e.to.d = n.d + e.L; e.to.prev = n; open.add(e.to); }
    }
    const flat = []; for (let n = B; n; n = n.prev) flat.push(n.x, n.z);
    return pathOf(flat);
  }
  function pathOf(flat) {
    const pts = []; for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return { pts, cum, len: cum[cum.length - 1] };
  }
  function at(path, s) {
    s = Math.max(0, Math.min(path.len - 0.001, s));
    let lo = 0, hi = path.cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (path.cum[m] <= s) lo = m; else hi = m; }
    const a = path.pts[lo], b = path.pts[hi], t = (s - path.cum[lo]) / ((path.cum[hi] - path.cum[lo]) || 1);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  function project(path, x, z) {
    let best = 0, bd = 1e12;
    for (let i = 0; i + 1 < path.pts.length; i++) { const a = path.pts[i], b = path.pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / ((dx * dx + dz * dz) || 1))), d = Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz); if (d < bd) { bd = d; best = path.cum[i] + t * Math.hypot(dx, dz); } }
    return { s: best, d: bd };
  }

  // ─── the cars ──────────────────────────────────────────────────────────────
  let MATS = null;
  function mats() {
    if (MATS) return MATS;
    const coachSide = canvas(2048, 400, (c, w, h) => {
      // silver, a dark window band on each deck, a broad blue and white stripe, the doors in the middle
      c.fillStyle = '#c9ced2'; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(0,0,0,.05)'; for (let x = 0; x < w; x += 14) c.fillRect(x, 0, 1.5, h);
      const band = (y0, y1) => { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#3a4650'); g.addColorStop(1, '#12181d'); c.fillStyle = g; c.fillRect(30, y0, w - 60, y1 - y0); c.fillStyle = 'rgba(180,186,190,.9)'; for (let k = 1; k < 16; k++) c.fillRect(30 + (w - 60) * k / 16 - 3, y0, 6, y1 - y0); };
      band(h * 0.13, h * 0.3); band(h * 0.46, h * 0.64);
      c.fillStyle = '#123a7a'; c.fillRect(0, h * 0.34, w, h * 0.09); c.fillStyle = '#f2f4f6'; c.fillRect(0, h * 0.325, w, h * 0.016); c.fillRect(0, h * 0.43, w, h * 0.016);
      c.fillStyle = '#123a7a'; c.fillRect(0, h * 0.72, w, h * 0.05);
      c.fillStyle = '#20262c'; c.fillRect(w / 2 - 92, h * 0.46, 184, h * 0.47); c.fillStyle = '#c9ced2'; c.fillRect(w / 2 - 92, h * 0.46, 4, h * 0.47); c.fillRect(w / 2 - 2, h * 0.46, 4, h * 0.47); c.fillRect(w / 2 + 88, h * 0.46, 4, h * 0.47);
      c.fillStyle = '#f2f4f6'; c.font = '700 30px Arial, sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'center'; c.fillText('METROLINK', w * 0.25, h * 0.385); c.fillText('METROLINK', w * 0.75, h * 0.385);
    });
    const end = canvas(256, 400, (c, w, h) => { c.fillStyle = '#b8bdc2'; c.fillRect(0, 0, w, h); c.fillStyle = '#20262c'; c.fillRect(w * 0.32, h * 0.46, w * 0.36, h * 0.47); c.fillStyle = '#123a7a'; c.fillRect(0, h * 0.34, w, h * 0.09); });
    const locoSide = canvas(1024, 256, (c, w, h) => {
      c.fillStyle = '#f0f2f2'; c.fillRect(0, 0, w, h); c.fillStyle = '#123a7a'; c.fillRect(0, h * 0.42, w, h * 0.3);
      c.fillStyle = '#8a1a22'; c.fillRect(0, h * 0.72, w, h * 0.05);
      c.fillStyle = '#f2f4f6'; c.font = '700 54px Arial, sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'center'; c.fillText('METROLINK', w * 0.42, h * 0.57);
      c.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 16; i++) c.fillRect(w * 0.06 + i * 26, h * 0.1, 18, h * 0.24);
    });
    const face = canvas(256, 256, (c, w, h) => { c.fillStyle = '#f0f2f2'; c.fillRect(0, 0, w, h); c.fillStyle = '#123a7a'; c.fillRect(0, h * 0.5, w, h * 0.24); c.fillStyle = '#14181c'; c.fillRect(w * 0.08, h * 0.1, w * 0.84, h * 0.3); c.fillStyle = '#fff8d8'; for (const s of [0.2, 0.8]) { c.beginPath(); c.arc(w * s, h * 0.84, 15, 0, 7); c.fill(); } });
    MATS = {
      side: new THREE.MeshStandardMaterial({ map: coachSide, roughness: 0.32, metalness: 0.35 }), end: new THREE.MeshStandardMaterial({ map: end, roughness: 0.4, metalness: 0.3 }),
      roof: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.4 }), under: new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.8 }),
      locoSide: new THREE.MeshStandardMaterial({ map: locoSide, roughness: 0.32, metalness: 0.2 }), face: new THREE.MeshStandardMaterial({ map: face, roughness: 0.3, metalness: 0.2 }),
      wheel: new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.55, metalness: 0.6 }),
      gap: new THREE.MeshStandardMaterial({ color: 0x4a5056, roughness: 0.7 }),
    };
    return MATS;
  }
  function truck(g, z) {
    const m = mats();
    const f = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.42, 2.7), m.under); f.position.set(0, 0.62, z); g.add(f);
    for (const dz of [-0.95, 0.95]) for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.14, 16), m.wheel); w.rotation.z = Math.PI / 2; w.position.set(s * 0.72, 0.44, z + dz); g.add(w); }
  }
  function makeCoach() {
    const g = new THREE.Group(), m = mats(), L = COACH;
    const body = new THREE.BoxGeometry(W, H - 0.72, L);
    const o = new THREE.Mesh(body, [m.side, m.side, m.roof, m.under, m.end, m.end]); o.position.y = 0.72 + (H - 0.72) / 2; o.castShadow = true; g.add(o);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(W / 2, W / 2, L - 0.3, 14, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(1, 0.14, 1), m.roof); crown.position.y = H; g.add(crown);
    truck(g, L / 2 - 3.6); truck(g, -L / 2 + 3.6);
    const doors = {};
    for (const s of [-1, 1]) { const d = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.26), new THREE.MeshStandardMaterial({ color: 0x4a4a44, emissive: 0x1c1b18, roughness: 0.9 })); d.position.set(s * (W / 2 + 0.012), 1.75, 0); d.rotation.y = s * Math.PI / 2; d.visible = false; g.add(d); doors[s] = d; }
    return { group: g, doors, L, coach: true, x: 0, z: 0, h: 0 };
  }
  function makeLoco() {
    const g = new THREE.Group(), m = mats(), L = LOCO, add = (w, h, d, x, y, z, mat) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
    const hood = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 2.75, L - 4.2), [m.locoSide, m.locoSide, m.roof, m.under, m.gap, m.gap]); hood.position.set(0, 2.45, -1.9); hood.castShadow = true; g.add(hood);
    add(W - 0.1, 3.05, 3.4, 0, 2.6, L / 2 - 2.9, m.locoSide);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.1, 3.05), m.face); front.position.set(0, 2.6, L / 2 - 1.19); g.add(front);
    add(W - 0.5, 1.1, 1.4, 0, 1.55, L / 2 - 0.5, m.face);
    add(W, 0.2, L, 0, 1.05, 0, m.under);
    add(0.1, 0.7, 2.6, -W / 2 + 0.2, 3.75, L / 2 - 2.9, m.under); add(0.1, 0.7, 2.6, W / 2 - 0.2, 3.75, L / 2 - 2.9, m.under);
    truck(g, L / 2 - 4); truck(g, -L / 2 + 4);
    return { group: g, doors: {}, L, coach: false, x: 0, z: 0, h: 0 };
  }

  /** The lower deck of a coach, seen from inside: the outside of the car shows nothing inwards, so what is left open here is window. */
  let inner = null;
  function coachInterior() {
    if (inner) return inner;
    const T = root.Transit, wall = { color: 0xd8d4c6 }, seatC = { color: 0x24406e }, floorC = { color: 0x5a5e62 }, ceil = { color: 0xe8e6dc, emissive: 0x4a4840 }, trim = { color: 0x8a8e92 }, list = [], L = COACH, HW = W / 2 - 0.09;
    const B = (mat, w, h, d, x, y, z) => list.push([mat, w, h, d, x, y, z]);
    B(floorC, W - 0.1, 0.06, L - 0.4, 0, FLOOR - 0.03, 0);
    B(ceil, W - 0.1, 0.05, L - 0.4, 0, 2.62, 0);
    for (const s of [-1, 1]) {
      B(wall, 0.05, 0.86, L - 0.4, s * HW, FLOOR + 0.43, 0);          // below the windows
      B(wall, 0.05, 0.36, L - 0.4, s * HW, 2.44, 0);                  // above them
      for (let k = -8; k <= 8; k++) if (Math.abs(k) > 0) B(trim, 0.04, 0.8, 0.12, s * HW, 1.88, k * L / 16);
      B(wall, 0.05, 2.0, 0.5, s * HW, FLOOR + 1.0, 1.4); B(wall, 0.05, 2.0, 0.5, s * HW, FLOOR + 1.0, -1.4);       // the door frames
      B(trim, 0.04, 0.3, L - 0.4, s * (HW - 0.02), FLOOR - 0.01 + 0.15, 0);
    }
    for (const e of [-1, 1]) { B(wall, W - 0.1, 2.0, 0.05, 0, FLOOR + 1.0, e * (L / 2 - 0.3)); for (let k = 0; k < 7; k++) B(trim, 1.1, 0.14, 0.3, 1.1 * e, FLOOR + 0.1 + k * 0.28, e * (5.4 + k * 0.3)); B(wall, 0.05, 2.0, 2.2, 0.48 * e, FLOOR + 1, e * 6.0); }
    const seats = [];
    for (let z = 2.6; z < L / 2 - 0.9; z += 1.0) for (const dir of [-1, 1]) {
      const zz = dir * z; if (Math.abs(zz) > 4.6 && Math.abs(zz) < 7.1) continue;
      for (const s of [-1, 1]) for (const x of [0.62, 1.12]) {
        B(seatC, 0.46, 0.1, 0.46, s * x, FLOOR + 0.44, zz); B(seatC, 0.46, 0.62, 0.09, s * x, FLOOR + 0.74, zz + dir * 0.24); B(trim, 0.05, 0.42, 0.05, s * x, FLOOR + 0.21, zz);
        seats.push({ x: s * x, z: zz, h: dir > 0 ? Math.PI : 0 });
      }
    }
    for (let z = -10; z <= 10; z += 2.5) for (const s of [-1, 1]) B(ceil, 0.3, 0.02, 1.2, s * 0.8, 2.59, z);
    const group = T.boxes(list);
    inner = { group, seats, floor: FLOOR, door: { x: W / 2 + 0.5, z: 0 }, bounds: { x: 0.42, z: L / 2 - 0.7 } };
    return inner;
  }

  // ─── all of it ─────────────────────────────────────────────────────────────
  function build(group, deps) {
    const { amb, focus } = deps, path = mainLine();
    const trains = [], stations = [], crossings = [], barriers = [];
    if (!path) return { trains, stations, barriers, update() {}, solidAt: () => false, boardable: () => null, closedNear: () => false, interior: coachInterior };
    // where it stops, and on which side the platform lies
    for (const name of ['Northridge', 'Chatsworth']) {
      const sign = Wide.signs.find(q => q.n === name + ' Station' && q.k !== 'bus'); if (!sign) continue;
      const near = Wide.platforms.filter(p => !p.bus && p.a).map(p => { let cx = 0, cz = 0; const n = p.p.length / 2; for (let i = 0; i < p.p.length; i += 2) { cx += p.p[i]; cz += p.p[i + 1]; } return { p, x: cx / n, z: cz / n, d: Math.hypot(cx / n - sign.x, cz / n - sign.z) }; }).filter(q => q.d < 400).sort((a, b) => a.d - b.d)[0];
      const q = near || { x: sign.x, z: sign.z }, on = project(path, q.x, q.z), c = at(path, on.s), e = at(path, on.s + 2), dx = e[0] - c[0], dz = e[1] - c[1];
      // (+x local is the left of the way the track runs)
      const side = (q.x - c[0]) * (dz) - (q.z - c[1]) * dx > 0 ? 1 : -1;
      const spots = [];
      if (near && near.p.furn) { const l = near.p.furn.line; for (let i = 0; i < l.length; i += 2) spots.push([l[i] + (near.x - l[i]) * 0.25, l[i + 1] + (near.z - l[i + 1]) * 0.25, Math.atan2(c[0] - near.x, c[1] - near.z)]); }
      stations.push({ name, s: on.s, x: c[0], z: c[1], side, spots });
    }
    stations.sort((a, b) => a.s - b.s);
    // where the streets cross it
    { const seen = [], roads = [...Inner.roads, ...Wide.roads].filter(r => r.w >= 8 && r.k !== 'service'), px0 = Math.min(...path.pts.map(p => p[0])) - 5, px1 = Math.max(...path.pts.map(p => p[0])) + 5, pz0 = Math.min(...path.pts.map(p => p[1])) - 5, pz1 = Math.max(...path.pts.map(p => p[1])) + 5;
      for (const r of roads) for (let k = 0; k + 3 < r.p.length; k += 2) {
        const ax = r.p[k], az = r.p[k + 1], bx = r.p[k + 2], bz = r.p[k + 3];
        if (Math.max(ax, bx) < px0 || Math.min(ax, bx) > px1 || Math.max(az, bz) < pz0 || Math.min(az, bz) > pz1) continue;
        for (let i = 0; i + 1 < path.pts.length; i++) {
          const c = path.pts[i], d = path.pts[i + 1], dn = (bx - ax) * (d[1] - c[1]) - (bz - az) * (d[0] - c[0]); if (Math.abs(dn) < 1e-6) continue;
          const u = ((c[0] - ax) * (d[1] - c[1]) - (c[1] - az) * (d[0] - c[0])) / dn, v = ((c[0] - ax) * (bz - az) - (c[1] - az) * (bx - ax)) / dn;
          if (u < 0 || u > 1 || v < 0 || v > 1) continue;
          const x = ax + (bx - ax) * u, z = az + (bz - az) * u; if (seen.some(q => Math.hypot(q[0] - x, q[1] - z) < 30)) continue; seen.push([x, z]);
          const L = Math.hypot(bx - ax, bz - az) || 1; crossings.push({ x, z, s: path.cum[i] + v * Math.hypot(d[0] - c[0], d[1] - c[1]), ux: (bx - ax) / L, uz: (bz - az) / L, w: r.w, closed: false, gate: null, down: 0 });
        }
      }
    }
    const barrier = c => { for (const way of [-1, 1]) for (const lane of [-1, 1]) { const nx = -c.uz, nz = c.ux, off = Math.min(c.w / 2 - 1, 2.8); c.block = c.block || []; c.block.push({ x: c.x + nx * lane * off - c.ux * way * 5, z: c.z + nz * lane * off - c.uz * way * 5 }); } };
    crossings.forEach(barrier);
    // a gate for each side of the track
    const stripes = () => canvas(256, 16, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#f2f2ee' : '#c0141a'; c.fillRect(i * 32, 0, 32, h); } });
    let armMat = null, poleMat = null, glow = null;
    function makeGate(c) {
      armMat = armMat || new THREE.MeshStandardMaterial({ map: stripes(), roughness: 0.5 }); poleMat = poleMat || new THREE.MeshStandardMaterial({ color: 0xc8cacc, roughness: 0.45, metalness: 0.5 });
      if (!glow) { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); glow = new THREE.CanvasTexture(cv); }
      const g = new THREE.Group(); c.arms = []; c.lights = [];
      const nx = -c.uz, nz = c.ux, reach = c.w / 2 + 0.7, len = Math.max(2.5, c.w / 2);
      for (const way of [-1, 1]) {
        const px = c.x - c.ux * way * 5.2 - nx * way * reach, pz = c.z - c.uz * way * 5.2 - nz * way * reach;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.6, 8), poleMat); pole.position.set(px, 1.8, pz); g.add(pole);
        const hinge = new THREE.Group(); hinge.position.set(px, 1.05, pz); hinge.rotation.y = Math.atan2(-nz * -way, nx * -way) ; g.add(hinge);
        const pivot = new THREE.Group(); hinge.add(pivot);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.05), armMat); arm.position.x = len / 2; pivot.add(arm);
        c.arms.push(pivot);
        for (const s of [-1, 1]) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xff2010, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 })); sp.position.set(px + c.ux * s * 0.32, 3.3, pz + c.uz * s * 0.32); sp.scale.setScalar(0.9); g.add(sp); c.lights.push(sp); }
      }
      c.gate = g; group.add(g);
    }

    const cars = [makeCoach(), makeCoach(), makeCoach(), makeLoco()];
    for (const c of cars) { group.add(c.group); c.group.visible = false; }
    const TL = cars.reduce((n, c) => n + c.L + GAP, -GAP);
    { let o = -TL / 2; for (const c of cars) { c.off = o + c.L / 2; o += c.L + GAP; } }
    const coaches = cars.filter(c => c.coach);
    const train = { cars, coaches, W, floor: FLOOR, s: TL / 2 + 2, v: 0, dir: 1, dwell: 0, state: 'away', wait: 8 + Math.random() * 25, station: null, side: 1, hornT: 0, doorsOpen: false, nextStop: null, ended: false };
    trains.push(train);
    function place(t) {
      for (const c of t.cars) {
        const a = at(path, t.s + c.off + c.L * 0.3), b = at(path, t.s + c.off - c.L * 0.3);
        c.x = (a[0] + b[0]) / 2; c.z = (a[1] + b[1]) / 2; c.h = Math.atan2(a[0] - b[0], a[1] - b[1]);
        c.group.position.set(c.x, 0, c.z); c.group.rotation.y = c.h;
      }
    }
    const setDoors = (t, open) => { if (t.doorsOpen === open) return; t.doorsOpen = open; for (const c of t.coaches) { c.doors[-1].visible = open && t.side < 0; c.doors[1].visible = open && t.side > 0; } if (amb.hiss && open) amb.hiss(t.coaches[1].x, t.coaches[1].z); };
    function launch(t) {
      t.ended = false; t.state = 'run'; t.v = 24; t.s = t.dir > 0 ? TL / 2 + 2 : path.len - TL / 2 - 2; t.nextStop = null;
      for (const c of t.cars) c.group.visible = true;
      place(t);
    }
    /** The next place to stop in the way it is going, or the end of the line if someone is aboard. */
    function nextStop(t) {
      const ahead = stations.filter(q => t.dir > 0 ? q.s > t.s + 1 : q.s < t.s - 1).sort((a, b) => t.dir > 0 ? a.s - b.s : b.s - a.s);
      return ahead[0] || null;
    }
    const rid = () => deps.riding && deps.riding();
    function updateTrain(t, dt) {
      if (t.state === 'away') {
        t.wait -= dt; if (t.wait < 0) launch(t);
        return;
      }
      if (t.dwell > 0) {
        const [fx, fz] = focus(), there = t.coaches.some(c => Math.hypot(c.x - fx, c.z - fz) < 14);
        t.dwell -= dt; if (there && !rid() && t.dwell < 3) t.dwell = 3;     // the doors wait for you if you are coming
        if (t.dwell <= 0) {
          setDoors(t, false); t.station = null;
          if (t.ended) { t.ended = false; t.dir = -t.dir; }
        }
        return;
      }
      const stop = nextStop(t), toStop = stop ? Math.abs(stop.s - t.s) : Infinity, end = t.dir > 0 ? path.len - TL / 2 - 2 : TL / 2 + 2, toEnd = Math.abs(end - t.s);
      let target = 25;
      target = Math.min(target, Math.sqrt(2 * 0.85 * Math.max(0, toStop - 0.5)) + 0.4);
      if (rid()) target = Math.min(target, Math.sqrt(2 * 0.85 * Math.max(0, toEnd - 0.5)) + 0.4);
      // someone on the line
      const [fx, fz] = focus(); let danger = false;
      if (!rid()) { const q = project(path, fx, fz); if (q.d < 2.1 && (q.s - t.s) * t.dir > TL / 2 - 3 && (q.s - t.s) * t.dir < TL / 2 + 170) { const room = (q.s - t.s) * t.dir - TL / 2 - 4; target = Math.min(target, Math.sqrt(2 * 1.9 * Math.max(0, room))); danger = true; } }
      const a = target > t.v ? 0.65 : danger ? 3.2 : 1.05;
      t.v += Math.max(-a * dt, Math.min(a * dt, target - t.v));
      t.s += t.v * t.dir * dt;
      place(t);
      if (stop && toStop < 1.6 && t.v < 2.2) { t.v = 0; t.s = stop.s; place(t); t.station = stop; t.side = stop.side; t.dwell = rnd(22, 34); setDoors(t, true); return; }
      if (toEnd < 1.2) {
        if (rid()) { t.v = 0; t.dwell = 9; t.ended = true; t.station = null; return; }
        for (const c of t.cars) c.group.visible = false; t.state = 'away'; t.dir = -t.dir; t.wait = rnd(25, 70); t.v = 0;
      }
    }
    return {
      trains, stations, crossings, barriers, path, TL, interior: coachInterior,
      /** Is this spot taken up by the train? */
      solidAt(x, z, r) {
        for (const t of trains) { if (t.state === 'away') continue; for (const c of t.cars) { const dx = x - c.x, dz = z - c.z, co = Math.cos(c.h), si = Math.sin(c.h), side = dx * co - dz * si, along = dx * si + dz * co; if (Math.abs(along) < c.L / 2 + r && Math.abs(side) < W / 2 + r) return true; } }
        return false;
      },
      /** Which car, if any, has this spot under it. */
      hitBy(x, z, rad) {
        for (const t of trains) { if (t.state === 'away') continue; for (const c of t.cars) { const dx = x - c.x, dz = z - c.z, fx = Math.sin(c.h), fz = Math.cos(c.h), along = dx * fx + dz * fz, side = dx * fz - dz * fx; if (Math.abs(along) < c.L / 2 + rad && Math.abs(side) < W / 2 + rad) return { h: c.h, speed: t.v * t.dir, along, side, half: W / 2 }; } }
        return null;
      },
      /** Standing at an open door? */
      boardable(x, z) {
        for (const t of trains) { if (!(t.dwell > 0) || !t.doorsOpen) continue; let best = null, bd = 6.5; for (const c of t.coaches) { const co = Math.cos(c.h), si = Math.sin(c.h), lx = t.side * (W / 2 + 0.3), wx = c.x + lx * co, wz = c.z - lx * si, d = Math.hypot(wx - x, wz - z); if (d < bd) { bd = d; best = c; } } if (best) return { t, car: best }; }
        return null;
      },
      closedNear(x, z) { for (const c of crossings) if (c.closed && Math.hypot(c.x - x, c.z - z) < c.w / 2 + 8) return true; return false; },
      update(dt) {
        const d = Math.min(dt, 0.1), [fx, fz] = focus(), now = performance.now() / 1000;
        for (const t of trains) updateTrain(t, d);
        const t = trains[0], running = t.state !== 'away' && !(t.dwell > 0 && Math.abs(t.v) < 0.1);
        barriers.length = 0; let bell = null;
        for (const c of crossings) {
          const rel = (c.s - t.s) * t.dir;
          c.closed = t.state !== 'away' && rel > -TL / 2 - 12 && rel < TL / 2 + (t.dwell > 0 ? 40 : 340) && !(t.dwell > 0 && rel > TL / 2 + 40);
          if (c.closed) { for (const b of c.block) barriers.push(b); if (!bell || Math.hypot(c.x - fx, c.z - fz) < Math.hypot(bell.x - fx, bell.z - fz)) bell = c; }
          const near = Math.hypot(c.x - fx, c.z - fz) < 420;
          if (near && !c.gate && Q.level !== 'low') makeGate(c);
          if (c.gate) {
            c.gate.visible = near;
            if (near) {
              c.down += ((c.closed ? 1 : 0) - c.down) * Math.min(1, d * 1.4);
              for (const a of c.arms) a.rotation.z = (1 - c.down) * 1.42;
              const on = Math.floor(now * 1.7) % 2;
              c.lights.forEach((l, i) => { l.material.opacity = c.closed && (i % 2 === on) ? 0.95 : 0; });
            }
          }
        }
        if (amb.rail) {
          const mid = t.coaches[1];
          amb.rail(t.state === 'away' ? 0 : t.v, mid.x, mid.z, d, !!rid(), bell);
          // the horn before a crossing: long, long, short, long
          t.hornT -= d;
          if (running && t.v > 8 && t.hornT < 0 && !rid()) { const soon = crossings.find(c => { const rel = (c.s - t.s) * t.dir - TL / 2; return rel > 80 && rel < 260; }); if (soon && Math.hypot(soon.x - fx, soon.z - fz) < 900) { amb.horn(cars[3].x, cars[3].z); t.hornT = 22; } }
        }
      },
    };
  }

  root.Rail = { build, FLOOR, W };
})(typeof self !== 'undefined' ? self : this);
