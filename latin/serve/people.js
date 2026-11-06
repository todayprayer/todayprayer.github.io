/*
 * The people of the parish and the town. They walk the sidewalks in ones and twos and as families, wait at bus stops and get on, stand on the platforms,
 * come to the church on foot or by van, go in, genuflect, kneel and sit; and at Mass they fill some of the pews. Now and then a baby cries.
 * All drawn as instances of a few parts, so that a street full of them costs about as much as one person.
 */
(function (root) {
  'use strict';
  const THREE = root.THREE, Plan = root.Plan, Q = root.Quality, Wide = root.WideData, Inner = root.SiteData;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = l => l[Math.floor(Math.random() * l.length)];
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const MAX = 130;

  // ─── how they look ─────────────────────────────────────────────────────────
  const SKIN = [0xf0c8a8, 0xe0b090, 0xc99570, 0xb07c58, 0x8f6042, 0x6a432c, 0xd8a884, 0xbd8a64];
  const HAIR = [0x17110c, 0x2a1b10, 0x3d2a18, 0x5a3f22, 0x8a6a3c, 0xa8a49c, 0xd8d4cc, 0x1e1712];
  const TOPS = [0xe8e4da, 0x3a4a6a, 0x7a2a2a, 0x2f5a44, 0xc8b070, 0x5a5a60, 0xa04c32, 0x2a2c34, 0x6a88a8, 0xd8c8d0, 0x4a3a5a, 0xf2f0ea];
  const LEGS = [0x23283a, 0x2a2c30, 0x3a3f4a, 0x5a4a38, 0x8a7a60, 0x1c1c20, 0x4a5a78];
  const BEST = [0x1f2430, 0x2a2a2e, 0x3a3540, 0x28344a, 0x4a4a50, 0x3c2c28];       // what one wears to church
  const DRESS = [0x2a3a5a, 0x5a2a3a, 0x3a4a3a, 0x8a8a90, 0x28283a, 0x6a5a7a, 0xc8c0b0];

  function person(o = {}) {
    const age = o.age || 'adult', girl = o.girl != null ? o.girl : Math.random() < 0.5, best = !!o.best;
    const tall = age === 'adult' ? (girl ? rnd(1.56, 1.72) : rnd(1.66, 1.88)) : age === 'teen' ? rnd(1.45, 1.7) : rnd(0.92, 1.3);
    const skirt = girl && (best ? Math.random() < 0.8 : Math.random() < 0.3);
    return Object.assign({
      age, girl, s: tall / 1.72, skirt, long: girl && Math.random() < 0.7,
      skin: pick(SKIN), hair: age === 'adult' && Math.random() < 0.2 ? pick([0xa8a49c, 0xd8d4cc]) : pick(HAIR.slice(0, 5)),
      top: skirt && best ? pick(DRESS) : best ? pick(BEST) : pick(TOPS), low: best ? pick(BEST) : pick(LEGS), shoe: best ? 0x14110e : pick([0x14110e, 0x3a2a1c, 0xd8d4cc, 0x2a2c30]),
      x: 0, y: 0, z: 0, h: 0, phase: rnd(0, 6), pose: 'stand', state: 'idle', baby: false, babyCol: pick([0xf4e8d8, 0xd8e4f0, 0xf0d8e0]), sp: rnd(1.15, 1.5), rock: 0, swayAt: rnd(0, 6),
    }, o);
  }

  // ─── drawing ───────────────────────────────────────────────────────────────
  function crowd(parent) {
    const geo = {
      pelvis: new THREE.SphereGeometry(0.16, 10, 7).scale(1, 0.72, 0.74),
      torso: new THREE.CylinderGeometry(0.175, 0.15, 0.56, 10).scale(1, 1, 0.68).translate(0, 0.28, 0),
      neck: new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8).translate(0, 0.6, 0),
      head: new THREE.SphereGeometry(0.106, 12, 9).scale(0.92, 1.08, 1),
      eyes: (() => { const g = (s) => new THREE.SphereGeometry(0.013, 6, 4).scale(1, 0.8, 0.5).translate(s * 0.036, 0.018, 0.094).toNonIndexed(), a = g(-1), b = g(1), m = new THREE.BufferGeometry(), cat = n => { const u = a.attributes[n].array, v = b.attributes[n].array, o = new Float32Array(u.length + v.length); o.set(u); o.set(v, u.length); return new THREE.BufferAttribute(o, 3); }; m.setAttribute('position', cat('position')); m.setAttribute('normal', cat('normal')); return m; })(),
      hair: new THREE.SphereGeometry(0.113, 12, 7, 0, 6.2832, 0, 1.5).scale(0.885, 1.0, 0.955).translate(0, 0.012, -0.006),
      long: new THREE.CylinderGeometry(0.09, 0.115, 0.3, 8).scale(1, 1, 0.6).translate(0, -0.13, -0.05),
      thigh: new THREE.CylinderGeometry(0.08, 0.058, 0.44, 8).translate(0, -0.22, 0),
      shin: new THREE.CylinderGeometry(0.056, 0.04, 0.44, 8).translate(0, -0.22, 0),
      shoe: new THREE.BoxGeometry(0.09, 0.07, 0.25).translate(0, -0.035, 0.05),
      upper: new THREE.CylinderGeometry(0.052, 0.044, 0.29, 7).translate(0, -0.145, 0),
      fore: new THREE.CylinderGeometry(0.043, 0.03, 0.26, 7).translate(0, -0.13, 0),
      hand: new THREE.SphereGeometry(0.038, 7, 5),
      skirt: new THREE.CylinderGeometry(0.165, 0.3, 0.6, 12, 1, true).scale(1, 1, 0.78).translate(0, -0.27, 0),
      bundle: new THREE.CapsuleGeometry(0.085, 0.2, 3, 8).rotateZ(Math.PI / 2),
      babyHead: new THREE.SphereGeometry(0.06, 9, 7),
    };
    const count = { thigh: 2, shin: 2, shoe: 2, upper: 2, fore: 2, hand: 2 };
    const parts = {}, plain = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82 }), both = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
    for (const name of Object.keys(geo)) {
      const n = MAX * (count[name] || 1), o = new THREE.InstancedMesh(geo[name], name === 'skirt' ? both : plain, n);
      o.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); o.frustumCulled = false; o.count = 0;
      o.castShadow = Q.level !== 'low' && /torso|thigh|skirt|head/.test(name); parent.add(o);
      parts[name] = { o, n: 0, cap: n };
    }
    const col = new THREE.Color(), cache = new Map(), rgb = h => { let c = cache.get(h); if (!c) { col.setHex(h).convertSRGBToLinear(); cache.set(h, c = [col.r, col.g, col.b]); } return c; };
    const put = (name, m, hex) => { const P = parts[name]; if (P.n >= P.cap) return; m.toArray(P.o.instanceMatrix.array, P.n * 16); const c = rgb(hex), a = P.o.instanceColor.array, i = P.n * 3; a[i] = c[0]; a[i + 1] = c[1]; a[i + 2] = c[2]; P.n++; };
    const M0 = new THREE.Matrix4(), T = new THREE.Matrix4(), R = new THREE.Matrix4(), A = new THREE.Matrix4(), B = new THREE.Matrix4(), C = new THREE.Matrix4(), sc = new THREE.Vector3();
    const joint = (out, parent, x, y, z, rx) => { R.makeRotationX(rx); R.elements[12] = x; R.elements[13] = y; R.elements[14] = z; return out.multiplyMatrices(parent, R); };
    function angles(p, now) {
      const a = { hipR: 0, hipL: 0, kneeR: 0, kneeL: 0, shR: 0, shL: 0, elR: -0.14, elL: -0.14, spine: 0, y: 0.95, armIn: 0 };
      switch (p.pose) {
        case 'walk': { const s = Math.sin(p.phase), kid = p.age === 'child' ? 1.15 : 1; a.hipR = -0.48 * s * kid; a.hipL = 0.48 * s * kid; a.kneeR = Math.max(0, s) * 0.85; a.kneeL = Math.max(0, -s) * 0.85; a.shR = 0.38 * s * kid; a.shL = -0.38 * s * kid; a.elR = -0.3; a.elL = -0.3; a.y = 0.945 + Math.abs(Math.cos(p.phase)) * 0.018; a.spine = 0.03; break; }
        case 'sit': a.hipR = a.hipL = -1.5; a.kneeR = a.kneeL = 1.5; a.y = 0.54; a.shR = a.shL = -0.32; a.elR = a.elL = -1.05; a.spine = -0.05; break;
        case 'kneel': a.hipR = a.hipL = 0; a.kneeR = a.kneeL = 1.56; a.y = 0.64; a.spine = 0.14; a.shR = a.shL = -1.0; a.elR = a.elL = -1.0; a.armIn = 0.45; break;
        case 'gen': a.hipR = -1.35; a.kneeR = 1.4; a.hipL = 0.18; a.kneeL = 1.4; a.y = 0.56; a.spine = 0.06; break;
        default: a.y = 0.95; a.spine = Math.sin(now * 0.5 + p.swayAt) * 0.012; a.shR = Math.sin(now * 0.4 + p.swayAt) * 0.03; a.shL = -a.shR;
      }
      if (p.baby) { a.shR = a.shL = -0.72; a.elR = a.elL = -1.5; a.armIn = 0.3; }
      return a;
    }
    function draw(p, now) {
      const a = angles(p, now), s = p.s, rock = p.rock > 0 ? Math.sin(now * 5) * 0.05 : 0;
      M0.makeRotationY(p.h + rock); sc.set(s, s, s); M0.scale(sc); M0.elements[12] = p.x; M0.elements[13] = p.y + a.y * s; M0.elements[14] = p.z;
      put('pelvis', M0, p.low);
      joint(A, M0, 0, 0.02, 0, a.spine);
      put('torso', A, p.top); put('neck', A, p.skin);
      const big = p.age === 'child' ? 1.26 : 1;
      joint(B, A, 0, 0.75, 0, 0); if (big !== 1) { sc.setScalar(big); B.scale(sc); }
      put('head', B, p.skin); put('eyes', B, 0x1a120c); put('hair', B, p.hair); if (p.long) put('long', B, p.hair);
      if (p.skirt) { if (a.y < 0.8) { joint(B, M0, 0, 0.02, 0, p.pose === 'sit' ? -1.3 : 0); sc.set(1, p.pose === 'sit' ? 0.8 : 1, 1); B.scale(sc); } else B.copy(M0); put('skirt', B, p.top); }
      for (const side of [-1, 1]) {
        const hip = side < 0 ? a.hipR : a.hipL, knee = side < 0 ? a.kneeR : a.kneeL, legC = p.skirt ? p.skin : p.low;
        joint(B, M0, side * 0.09, 0, 0, hip); put('thigh', B, legC);
        joint(C, B, 0, -0.44, 0, knee); put('shin', C, legC);
        joint(T, C, 0, -0.44, 0, -knee - hip * 0.2); put('shoe', T, p.shoe);
        const sh = side < 0 ? a.shR : a.shL, el = side < 0 ? a.elR : a.elL;
        joint(B, A, side * 0.215, 0.52, 0, sh);
        if (a.armIn) { R.makeRotationZ(side * -a.armIn * 0.5); B.multiply(R); }
        put('upper', B, p.top);
        joint(C, B, 0, -0.29, 0, el); if (a.armIn) { R.makeRotationZ(side * -a.armIn); C.multiply(R); }
        put('fore', C, p.top);
        joint(T, C, 0, -0.27, 0, 0); put('hand', T, p.skin);
      }
      if (p.baby) { joint(B, A, 0, 0.36, 0.17, 0); put('bundle', B, p.babyCol); joint(C, B, 0.14, 0.03, 0, 0); put('babyHead', C, p.skin); }
    }
    return {
      parts,
      frame(list, now) {
        for (const k of Object.keys(parts)) parts[k].n = 0;
        for (const p of list) if (p.visible !== false) draw(p, now);
        for (const k of Object.keys(parts)) {
          const P = parts[k]; P.o.count = P.n;
          if (P.n) { P.o.instanceMatrix.updateRange.count = P.n * 16; P.o.instanceMatrix.needsUpdate = true; P.o.instanceColor.updateRange.count = P.n * 3; P.o.instanceColor.needsUpdate = true; }
        }
      },
    };
  }

  // ─── where they walk ───────────────────────────────────────────────────────
  function sidewalks() {
    const nodes = new Map(), key = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2), node = (x, z) => { const k = key(x, z); let n = nodes.get(k); if (!n) nodes.set(k, n = { x, z, out: [] }); return n; };
    for (const r of [...Inner.roads, ...Wide.roads]) {
      if (r.w < 8 || !/residential|tertiary|secondary|primary|unclassified|living/.test(r.k) || /_link/.test(r.k)) continue;
      let prev = null;
      for (let i = 0; i < r.p.length; i += 2) { const n = node(r.p[i], r.p[i + 1]); if (prev && prev !== n) { prev.out.push({ to: n, w: r.w }); n.out.push({ to: prev, w: r.w }); } prev = n; }
    }
    const list = [...nodes.values()].filter(n => n.out.length), GC = 120, cells = new Map();
    for (const n of list) { const k = Math.floor(n.x / GC) + ',' + Math.floor(n.z / GC); let l = cells.get(k); if (!l) cells.set(k, l = []); l.push(n); }
    return { list, cells, GC };
  }

  // ─── all of it ─────────────────────────────────────────────────────────────
  function build(scene, deps) {
    const { cars, transit, rail, wide, amb, focus, inHouse, ride } = deps;
    const group = new THREE.Group(); scene.add(group);
    const C = crowd(group), people = [];
    let graph = null, spawnT = 0, stopT = 0, arriveT = rnd(5, 20), cryT = rnd(60, 160), lastPart = null, massOn = false, crying = null;
    const stopSeen = new Map();

    // ── the church: the way in, and the pews ──
    const P = Plan.PEWS, taken = new Set();
    const DOOR_WAY = [[-1.2, 28.4], [0, 27.2], [0, 24], [0, 22]];
    const seatAt = (side, row, i) => ({ x: side * (P.x0 + 0.55 + i * 0.6), rowZ: P.z0 + row * P.step });
    function seats(n) {
      for (let tries = 0; tries < 60; tries++) {
        const side = Math.random() < 0.5 ? -1 : 1, row = 1 + Math.floor(Math.random() * (P.rows - 1)), i0 = Math.floor(Math.random() * Math.max(1, 8 - n)), out = [];
        for (let k = 0; k < n; k++) { const key = `${side},${row},${i0 + k}`; if (taken.has(key) || i0 + k > 7) { out.length = 0; break; } out.push({ side, row, i: i0 + k, key }); }
        if (out.length === n) { for (const s of out) taken.add(s.key); return out; }
      }
      return null;
    }
    const inPews = () => people.filter(p => p.seat && /^(pew|toPew)$/.test(p.state)).length;
    const setSeated = (p, how) => {
      const a = seatAt(p.seat.side, p.seat.row, p.seat.i); p.pose = how; p.h = Math.PI;
      if (how === 'sit') { p.x = a.x; p.z = a.rowZ + 0.24; p.y = 0; }
      else if (how === 'kneel') { p.x = a.x; p.z = a.rowZ - 0.3; p.y = 0; }
      else { p.x = a.x; p.z = a.rowZ - 0.1; p.y = 0; }
    };
    const family = (n, best, withBaby) => {
      const out = [], mum = person({ age: 'adult', girl: true, best }), dad = person({ age: 'adult', girl: false, best }); out.push(dad);
      if (n >= 2) out.push(mum);
      for (let k = 2; k < n; k++) out.push(person({ age: Math.random() < 0.3 ? 'teen' : 'child', best }));
      if (withBaby) mum.baby = true;
      return out;
    };
    /** Along a list of points, then whatever comes next. */
    function route(p, pts, then, delay = 0) { p.state = 'route'; p.pts = pts.slice(); p.then = then; p.wait = delay; }
    function goToPew(p, from, seat) {
      p.seat = seat; const a = seatAt(seat.side, seat.row, seat.i);
      route(p, [...from, ...DOOR_WAY, [0, a.rowZ + 0.62]], () => {
        p.state = 'gen'; p.wait = 1.1; p.pose = 'gen'; p.h = Math.PI;
        p.then = () => route(p, [[a.x, a.rowZ + 0.62], [a.x, a.rowZ + 0.3]], () => { p.state = 'pew'; setSeated(p, Math.random() < 0.65 ? 'kneel' : 'sit'); p.wait = rnd(14, 40); p.left = rnd(50, 170); });
      });
    }
    function leavePew(p) {
      taken.delete(p.seat.key); const a = seatAt(p.seat.side, p.seat.row, p.seat.i), back = [...DOOR_WAY].reverse(), home = p.home ? p.home() : [[-13, 30.5], [-13, 49]];
      p.seat = null; p.pose = 'stand'; p.x = a.x; p.z = a.rowZ + 0.5;
      route(p, [[0, a.rowZ + 0.62], ...back, ...home], () => { if (p.onHome) p.onHome(p); else attachToWalk(p); });
    }

    // ── a car comes to church ──
    function unload(c) {
      const van = c.kind === 'van', n = van ? 3 + Math.floor(Math.random() * 4) : 1 + Math.floor(Math.random() * 3), party = family(n, true, van && Math.random() < 0.45);
      const way = cars.walkFromBay(c.bay), seatsFor = seats(party.length);
      if (!seatsFor || people.length + party.length > MAX * 0.9) return;
      c.hold = party.length;
      party.forEach((p, i) => {
        const side = i % 2 ? 1 : -1, fx = Math.sin(c.h), fz = Math.cos(c.h);
        p.x = c.x + fz * side * 1.3 + fx * (i - 1) * 0.5; p.z = c.z - fx * side * 1.3 + fz * (i - 1) * 0.5; p.h = c.h; people.push(p);
        const jig = (i - n / 2) * 0.45;
        goToPew(p, way.map(q => [q[0] + jig * 0.3, q[1] + jig * 0.3]), seatsFor[i]); p.wait = i * 0.5;
        p.home = () => [...way].reverse().concat([[c.x, c.z]]);
        p.onHome = q => { remove(q); c.hold--; if (c.hold <= 0) { c.hold = 0; c.until = rnd(1, 6); } };
      });
    }

    // ── walking ──
    function attachToWalk(p) {
      if (!graph) graph = sidewalks();
      const cx = Math.floor(p.x / graph.GC), cz = Math.floor(p.z / graph.GC); let best = null, bd = 1e9;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const n of graph.cells.get((cx + a) + ',' + (cz + b)) || []) { const d = Math.hypot(n.x - p.x, n.z - p.z); if (d < bd) { bd = d; best = n; } }
      if (!best) { remove(p); return; }
      p.state = 'walk'; p.at = best; p.prev = null; p.side = p.side || (Math.random() < 0.5 ? 1 : -1); p.pose = 'walk'; p.y = 0;
      nextEdge(p);
    }
    function way(n, e, side) { const dx = e.to.x - n.x, dz = e.to.z - n.z, L = Math.hypot(dx, dz) || 1, off = e.w / 2 + 1.25; return [e.to.x - dz / L * off * side, e.to.z + dx / L * off * side]; }
    function nextEdge(p) {
      const n = p.at, list = n.out.filter(e => e.to !== p.prev), opts = (list.length ? list : n.out).slice().sort(() => Math.random() - 0.5);
      for (const e of opts) { const w = way(n, e, p.side); if (!inHouse(w[0], w[1])) { p.prev = n; p.at = e.to; p.wx = w[0]; p.wz = w[1]; return; } }
      const e = n.out[0]; p.prev = n; p.at = e.to; p.side = -p.side; const w = way(n, e, p.side); p.wx = w[0]; p.wz = w[1];
    }
    function moveTo(p, tx, tz, sp, dt) {
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      if (d < 0.02) return 0;
      const want = Math.atan2(dx, dz); p.h += wrap(want - p.h) * Math.min(1, dt * 6);
      const step = Math.min(d, sp * dt); p.x += dx / d * step; p.z += dz / d * step;
      p.phase += step * 3.6 / Math.max(0.55, p.s); p.pose = 'walk';
      return d - step;
    }
    function remove(p) { const k = people.indexOf(p); if (k >= 0) people.splice(k, 1); if (p.seat) { taken.delete(p.seat.key); p.seat = null; } for (const q of people) if (q.lead === p) q.lead = null; if (p.vehicle && p.vehicle.seatsTaken) p.vehicle.seatsTaken.delete(p.place); }
    function spawnWalkers(fx, fz, want) {
      if (!graph) graph = sidewalks();
      const walkers = people.filter(p => p.state === 'walk' || p.state === 'follow').length;
      if (walkers >= want || people.length > MAX - 6) return;
      const cx = Math.floor(fx / graph.GC), cz = Math.floor(fz / graph.GC), pool = [];
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const l = graph.cells.get((cx + a) + ',' + (cz + b)); if (l) pool.push(l); }
      if (!pool.length) return;
      for (let t = 0; t < 12; t++) {
        const l = pick(pool), n = pick(l), d = Math.hypot(n.x - fx, n.z - fz); if (d < 70 || d > 250) continue;
        const u = Math.random(), party = u < 0.62 ? [person()] : u < 0.82 ? [person({ girl: true }), person({ girl: false })] : family(3 + Math.floor(Math.random() * 2), false, Math.random() < 0.25);
        const lead = party[0]; lead.x = n.x; lead.z = n.z; people.push(lead); lead.at = n; lead.prev = null; lead.side = Math.random() < 0.5 ? 1 : -1; lead.state = 'walk'; lead.pose = 'walk'; nextEdge(lead); const w0 = way(n, n.out[0], lead.side); lead.x = w0[0]; lead.z = w0[1];
        party.slice(1).forEach((q, i) => { q.x = lead.x - 0.8 - i * 0.5; q.z = lead.z - 0.6; q.lead = lead; q.state = 'follow'; q.gap = 0.9 + i * 0.75; q.lat = i % 2 ? 0.45 : -0.45; q.pose = 'walk'; people.push(q); });
        return;
      }
    }

    // ── waiting for the bus, and the train ──
    function waitAt(p, x, z, facing, sit, what) { p.state = 'wait'; p.x = x; p.z = z; p.h = facing; p.pose = sit ? 'sit' : 'stand'; p.wait = rnd(60, 220); p.what = what; p.y = 0; }
    function spawnWaiters(fx, fz) {
      for (const s of Wide.signs) {
        if (s.k !== 'bus') continue;
        const d = Math.hypot(s.x - fx, s.z - fz);
        if (d > 170 || d < 40) continue;
        const key = s, last = stopSeen.get(key) || -1e9, now = performance.now() / 1000;
        if (now - last < 90) continue;
        stopSeen.set(key, now);
        if (Math.random() > 0.45 || people.length > MAX - 8) continue;
        const spot = wide.busStop(s); if (!spot) continue;
        const n = Math.random() < 0.7 ? 1 : 2;
        for (let i = 0; i < n; i++) {
          const p = person(); people.push(p);
          if (spot.bench && i === 0) waitAt(p, spot.bx, spot.bz, spot.ry, true, 'bus');
          else waitAt(p, s.x + spot.ax * 0.3 + (i - 0.5) * rnd(1, 2.2) * spot.az, s.z + spot.az * 0.3 - (i - 0.5) * rnd(1, 2.2) * spot.ax, spot.ry + rnd(-0.5, 0.5), false, 'bus');
        }
      }
      for (const st of rail.stations) {
        const d = Math.hypot(st.x - fx, st.z - fz);
        if (d > 200 || !st.spots.length) continue;
        const have = people.filter(p => p.what === 'train' && p.state === 'wait' && Math.hypot(p.x - st.x, p.z - st.z) < 120).length;
        if (have >= 5 || people.length > MAX - 8) continue;
        const q = pick(st.spots), p = person({ age: Math.random() < 0.15 ? 'teen' : 'adult' }); people.push(p);
        waitAt(p, q[0] + rnd(-1.5, 1.5), q[1] + rnd(-1.5, 1.5), q[2] + rnd(-0.5, 0.5), false, 'train'); p.wait = rnd(200, 500);
      }
    }
    const doorOf = v => { const c = v.car || v; const h = c.h; return [c.x + (v.doorX || 0) * Math.cos(h) + (v.doorZ || 0) * Math.sin(h), c.z - (v.doorX || 0) * Math.sin(h) + (v.doorZ || 0) * Math.cos(h)]; };
    const toLocal = (c, x, z) => { const dx = x - c.x, dz = z - c.z, co = Math.cos(c.h), si = Math.sin(c.h); return [dx * co - dz * si, dx * si + dz * co]; };
    const toWorld = (c, lx, lz) => [c.x + lx * Math.cos(c.h) + lz * Math.sin(c.h), c.z - lx * Math.sin(c.h) + lz * Math.cos(c.h)];

    function vehicleEvents() {
      // buses at the kerb
      for (const sl of transit.slots) {
        const v = sl.v; if (!v) continue;
        if (v.dwell > 0 && !v.stopHandled) {
          v.stopHandled = true; v.riders = v.riders == null ? 2 + Math.floor(Math.random() * 7) : v.riders;
          const door = transit.door(v);
          // someone gets off
          const off = Math.min(v.riders, Math.random() < 0.55 ? 1 + Math.floor(Math.random() * 2) : 0);
          for (let i = 0; i < off; i++) {
            if (ride.v === v) { const seated = people.filter(p => p.vehicle === v && p.state === 'seat' && !p.driver); const p = pick(seated); if (p) { p.state = 'exit'; p.wait = i * 1.3; continue; } }
            if (people.length > MAX - 4) break;
            const p = person(); const w = toWorld(v, door.x, door.z); p.x = w[0]; p.z = w[1]; p.h = v.h - Math.PI / 2; people.push(p); p.side = 1; p.wait = i * 1.2; attachToWalk(p); v.riders--;
          }
          // and those waiting get on
          const [dx, dz] = toWorld(v, door.x, door.z);
          for (const p of people) if (p.state === 'wait' && p.what === 'bus' && Math.hypot(p.x - dx, p.z - dz) < 22) {
            p.state = 'toDoor'; p.vehicle = v; p.y = 0; p.delay = rnd(0, 1.5);
          }
        }
        if (v.dwell <= 0) v.stopHandled = false;
      }
      // the train at its platform
      for (const t of rail.trains) {
        if (t.dwell > 0 && !t.stopHandled) {
          t.stopHandled = true;
          const st = t.station; if (!st) continue;
          for (const p of people) if (p.state === 'wait' && p.what === 'train' && Math.hypot(p.x - st.x, p.z - st.z) < 130) { p.state = 'toTrain'; p.train = t; p.delay = rnd(0, 4); }
          const n = Math.floor(rnd(1, 6));
          for (let i = 0; i < n && people.length < MAX - 4; i++) {
            const c = pick(t.coaches), p = person(), w = toWorld(c, t.side * (t.W / 2 + 0.6), 0); p.x = w[0] + rnd(-1, 1); p.z = w[1] + rnd(-1, 1); p.h = 0; people.push(p); attachToWalk(p);
          }
        }
        if (!(t.dwell > 0)) t.stopHandled = false;
      }
    }

    // ── each one, each frame ──
    function step(p, dt, fx, fz) {
      p.y = p.vehicle && /seat|aisle|exit/.test(p.state) ? p.y : 0;
      if (p.rock > 0) p.rock -= dt;
      switch (p.state) {
        case 'walk': {
          const d = Math.hypot(p.wx - p.x, p.wz - p.z);
          if (d < 0.7) { nextEdge(p); return; }
          const fwdx = Math.sin(p.h), fwdz = Math.cos(p.h);
          p.look = (p.look || 0) - dt;
          if (p.look < 0) { p.look = 0.4; if (inHouse(p.x + fwdx * 0.7, p.z + fwdz * 0.7)) { p.side = -p.side; nextEdge(p); return; } }
          // look before stepping out: a car just there, or the crossing gates down
          p.onRoad = root.Outdoors.onStreet(p.x + fwdx * 0.5, p.z + fwdz * 0.5, null, 0.2);
          if (cars.solidAt(p.x + fwdx * 2.2, p.z + fwdz * 2.2, 0.4) || rail.closedNear(p.x, p.z)) { p.pose = 'stand'; return; }
          moveTo(p, p.wx, p.wz, p.sp, dt);
          // St. Vitus is on the way: some go in
          if (Math.abs(p.z - 49) < 7 && Math.abs(p.x + 13) < 5 && !p.lead && !p.passed) {
            p.passed = true;
            if (Math.random() < 0.4) { const s = seats(1); if (s) { p.onRoad = false; goToPew(p, [[-13, 48], [-13, 30.5]], s[0]); } }
          }
          return;
        }
        case 'follow': {
          const L = p.lead; if (!L) { attachToWalk(p); return; }
          const lx = L.x - Math.sin(L.h) * p.gap + Math.cos(L.h) * p.lat, lz = L.z - Math.cos(L.h) * p.gap - Math.sin(L.h) * p.lat, d = Math.hypot(lx - p.x, lz - p.z);
          p.onRoad = L.onRoad;
          if (d < 0.08 || L.pose !== 'walk') { p.pose = d < 0.5 ? 'stand' : 'walk'; if (d >= 0.5) moveTo(p, lx, lz, L.sp * 1.1, dt); return; }
          moveTo(p, lx, lz, Math.min(L.sp * 1.6, 2.6), dt);
          return;
        }
        case 'route': {
          if (p.wait > 0) { p.wait -= dt; p.pose = 'stand'; return; }
          const t = p.pts[0]; if (!t) { const f = p.then; p.then = null; if (f) f(); return; }
          const inside = Math.abs(p.x) < 9 && p.z < 26 && p.z > 3, sp = inside ? 0.95 : p.sp;
          if (moveTo(p, t[0], t[1], sp, dt) < 0.25) p.pts.shift();
          return;
        }
        case 'gen': p.h += wrap(Math.PI - p.h) * Math.min(1, dt * 6); p.wait -= dt; if (p.wait < 0) { p.pose = 'stand'; const f = p.then; p.then = null; f(); } return;
        case 'pew': {
          if (massOn && p.mass) return;
          p.wait -= dt; p.left -= dt;
          if (p.left < 0) { leavePew(p); return; }
          if (p.wait < 0) { setSeated(p, p.pose === 'kneel' ? 'sit' : 'kneel'); p.wait = rnd(14, 50); }
          return;
        }
        case 'wait': {
          p.wait -= dt;
          if (p.wait < 0 && Math.hypot(p.x - fx, p.z - fz) > 60) { remove(p); return; }
          if (p.wait < 0) { p.pose = 'walk'; attachToWalk(p); }
          return;
        }
        case 'toDoor': {
          const v = p.vehicle; if (!v || !v.group.parent || !(v.dwell > 0)) { p.state = 'wait'; p.wait = rnd(40, 120); p.pose = 'stand'; p.vehicle = null; return; }
          if (p.delay > 0) { p.delay -= dt; p.pose = 'stand'; return; }
          const door = transit.door(v), w = toWorld(v, door.x - 0.35, door.z);
          if (moveTo(p, w[0], w[1], 1.5, dt) < 0.3) {
            v.riders = (v.riders || 0) + 1; v.dwell = Math.max(v.dwell, 1.2);
            if (ride.v === v) { const seat = transit.freeSeat(v); if (seat) { v.seatsTaken.add(seat); p.place = seat; p.state = 'enter'; const l = toLocal(v, p.x, p.z); p.lx = l[0]; p.lz = l[1]; p.y = transit.floor; p.pts = [[0, door.z], [0, seat.z], [seat.x, seat.z]]; return; } }
            remove(p);
          }
          return;
        }
        case 'toTrain': {
          const t = p.train; if (!t || !(t.dwell > 0)) { p.state = 'wait'; p.wait = rnd(120, 300); p.pose = 'stand'; p.train = null; return; }
          if (p.delay > 0) { p.delay -= dt; p.pose = 'stand'; return; }
          let best = null, bd = 1e9; for (const c of t.coaches) { const w = toWorld(c, t.side * (t.W / 2 + 0.2), 0), d = Math.hypot(w[0] - p.x, w[1] - p.z); if (d < bd) { bd = d; best = w; } }
          if (moveTo(p, best[0], best[1], 1.6, dt) < 0.4) remove(p);
          return;
        }
        // riding: where they are is reckoned in the vehicle's own frame
        case 'seat': { const c = p.car || p.vehicle, w = toWorld(c, p.lx, p.lz); p.x = w[0]; p.z = w[1]; p.h = c.h + (p.lh || 0); p.pose = 'sit'; p.y = p.floor; return; }
        case 'enter': case 'exit': {
          const v = p.vehicle, c = p.car || v;
          if (p.state === 'exit' && !p.pts) { const door = transit.door(v); p.wait = p.wait || 0; p.pts = [[0, p.lz], [0, door.z], [door.x, door.z]]; }
          if (p.wait > 0) { p.wait -= dt; const w = toWorld(c, p.lx, p.lz); p.x = w[0]; p.z = w[1]; p.h = c.h; p.pose = 'sit'; p.y = p.floor != null ? p.floor : transit.floor; return; }
          const q = p.pts[0];
          if (!q) {
            if (p.state === 'enter') { p.state = 'seat'; p.lx = p.place.x; p.lz = p.place.z; p.lh = 0; p.floor = transit.floor; return; }
            v.seatsTaken.delete(p.place); p.vehicle = null; p.state = 'idle'; v.riders = Math.max(0, (v.riders || 1) - 1); attachToWalk(p); return;
          }
          const dx = q[0] - p.lx, dz = q[1] - p.lz, d = Math.hypot(dx, dz), stp = Math.min(d, 1.3 * dt);
          if (d < 0.05) { p.pts.shift(); return; }
          p.lx += dx / d * stp; p.lz += dz / d * stp; p.lh = Math.atan2(dx, dz); p.phase += stp * 3.6;
          const w = toWorld(c, p.lx, p.lz); p.x = w[0]; p.z = w[1]; p.h = c.h + p.lh; p.pose = 'walk'; p.y = transit.floor;
          return;
        }
        default:
      }
    }
    /** People already aboard when you get on: seated, and a driver at the wheel. */
    function fillVehicle(v, car, seatList, floor, driver, n) {
      const c = car || v; v.seatsTaken = v.seatsTaken || new Set();
      if (driver) { const d = person({ age: 'adult', top: 0x24344e, low: 0x1c2230 }); d.state = 'seat'; d.driver = true; d.vehicle = v; d.car = car; d.lx = driver.x; d.lz = driver.z; d.lh = 0; d.floor = floor; d.place = driver; people.push(d); }
      const free = seatList.filter(s => !v.seatsTaken.has(s)).sort(() => Math.random() - 0.5);
      for (let i = 0; i < Math.min(n, free.length); i++) {
        if (people.length > MAX - 2) break;
        const s = free[i], u = Math.random(), p = person({ age: u < 0.08 ? 'child' : u < 0.2 ? 'teen' : 'adult' });
        p.state = 'seat'; p.vehicle = v; p.car = car; p.lx = s.x; p.lz = s.z; p.lh = s.h || 0; p.floor = floor; p.place = s; v.seatsTaken.add(s); people.push(p);
        const w = toWorld(c, p.lx, p.lz); p.x = w[0]; p.z = w[1];
      }
    }
    function emptyVehicle(v) { for (const p of people.slice()) if (p.vehicle === v && /seat|enter|exit/.test(p.state)) remove(p); if (v.seatsTaken) v.seatsTaken.clear(); }

    // ── Mass: some pews filled, doing what the people do ──
    function fillPews() {
      clearChurch();
      const parties = 7 + Math.floor(Math.random() * 7);
      let babies = Math.random() < 0.4 ? 1 : 0;
      for (let k = 0; k < parties; k++) {
        const n = Math.random() < 0.3 ? 1 : Math.random() < 0.5 ? 2 : 3 + Math.floor(Math.random() * 3), s = seats(n); if (!s) continue;
        const party = n === 1 ? [person({ best: true, age: 'adult' })] : family(n, true, n >= 3 && babies > 0 && (babies--, true));
        party.forEach((p, i) => { p.seat = s[i]; p.state = 'pew'; p.mass = true; p.left = 1e9; p.wait = 1e9; setSeated(p, 'kneel'); people.push(p); });
      }
    }
    function clearChurch() { for (const p of people.slice()) if (p.seat || p.mass) remove(p); taken.clear(); }
    /** At Low Mass the people mostly kneel: they stand for the Gospels, and sit for the Epistle, the sermon and the Offertory. */
    function massPose(part) {
      const how = /Gospel/i.test(part) ? 'stand' : /Epistle|Sermon|Offertory|Gradual/i.test(part) ? 'sit' : 'kneel';
      for (const p of people) if (p.mass && p.state === 'pew' && p.pose !== how) { p.turnAt = rnd(0, 1.6); p.turnTo = how; }
    }
    function cryCheck(dt, fx, fz) {
      if (crying) { crying.t -= dt; crying.p.rock = 0.3; if (crying.t < 0) crying = null; return; }
      cryT -= dt; if (cryT > 0) return;
      cryT = rnd(70, 190);
      if (Math.random() > 0.35) return;      // most of the time, they sleep
      const babies = people.filter(p => p.baby && p.state === 'pew' && Math.hypot(p.x - fx, p.z - fz) < 45);
      if (!babies.length) return;
      const p = pick(babies), secs = rnd(3.5, 8.5);
      amb.cry(p.x, 1.1, p.z, secs);
      crying = { p, t: secs };
    }

    return {
      group, people, fillVehicle, emptyVehicle, crowd: C, fillPews, clearChurch, seats, unload,
      get crying() { return crying; },
      /** Anyone near this door? It opens for them as for anyone. */
      nearDoor(x, z, r = 1.7) { for (const p of people) if (Math.abs(p.x - x) < r && Math.abs(p.z - z) < r) return true; return false; },
      /** Those out in the roadway, for the traffic to stop for. */
      onRoad: () => people.filter(p => p.onRoad && p.pose === 'walk'),
      update(dt, opts) {
        const now = performance.now() / 1000, [fx, fz] = focus(), d = Math.min(dt, 0.1);
        const explore = !!opts.explore, wantMass = !!opts.mass;
        if (wantMass && !massOn) { massOn = true; fillPews(); lastPart = null; }
        if (!wantMass && massOn) { massOn = false; clearChurch(); }
        if (massOn && opts.part && opts.part !== lastPart) { lastPart = opts.part; massPose(opts.part); }
        if (massOn) for (const p of people) if (p.turnTo) { p.turnAt -= d; if (p.turnAt < 0) { setSeated(p, p.turnTo); p.turnTo = null; } }
        if (explore) {
          spawnT -= d; stopT -= d;
          const night = opts.night || 0, wet = opts.wet || 0, base = { low: 10, medium: 18, high: 28, ultra: 40 }[Q.level] || 18, want = Math.round(base * (1 - night * 0.75) * (1 - wet * 0.7));
          if (spawnT < 0) { spawnT = 0.4; spawnWalkers(fx, fz, want); }
          if (stopT < 0) { stopT = 3; spawnWaiters(fx, fz); }
          // the cars that come to church, while you are about to see them
          if (Math.hypot(fx, fz - 20) < 200 && night < 0.6) { arriveT -= d; if (arriveT < 0) { arriveT = rnd(35, 90); if (inPews() < 22) cars.arrive(); } }
          vehicleEvents();
        } else if (people.some(p => !p.mass)) for (const p of people.slice()) if (!p.mass) remove(p);
        for (const p of people.slice()) {
          step(p, d, fx, fz);
          if (explore && !p.seat && !p.vehicle && !/route|gen|enter|exit/.test(p.state) && Math.hypot(p.x - fx, p.z - fz) > 300) remove(p);
        }
        cryCheck(d, fx, fz);
        C.frame(people, now);
      },
    };
  }

  root.People = { build, person };
})(typeof self !== 'undefined' ? self : this);
