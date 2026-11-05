/*
 * Traffic: cars with lofted bodies drive the real street network on the right-hand side, turn at random, brake for each
 * other and for people, and now and then turn into the church lot, park a while and leave again.
 */
(function (root) {
  'use strict';
  const THREE = root.THREE, Plan = root.Plan, Data = root.SiteData, Q = root.Quality;
  const rng = seed => { let s = (seed % 2147483646) + 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  // ─── car bodies ────────────────────────────────────────────────────────────

  /** A smooth skin through cross-sections: each is { z, y0, y1, w, r } where r rounds the upper corners. Forward is +z. */
  function loft(st, ring = 12) {
    const pos = [], idx = [];
    const section = ({ z, y0, y1, w, r = 0.3, t = 0 }) => {
      const pts = [], hw = w / 2, h = y1 - y0, c = Math.min(hw, h) * r;
      // from bottom centre, round one side, over the top (t: the tumblehome pulling the top inwards), down the other
      const top = hw * (1 - t);
      const prof = [[0, y0], [hw * 0.82, y0], [hw, y0 + h * 0.18], [hw, y0 + h * 0.5], [(hw + top) / 2 + (hw - top) * 0.2, y1 - c], [top - c * 0.35, y1 - c * 0.12], [top * 0.55, y1], [0, y1 + h * 0.012]];
      for (const [x, y] of prof) pts.push([x, y, z]);
      for (let i = prof.length - 2; i >= 1; i--) pts.push([-prof[i][0], prof[i][1], z]);
      return pts;
    };
    const rings = st.map(section), n = rings[0].length;
    for (const r of rings) for (const p of r) pos.push(...p);
    for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < n; k++) {
      const a = i * n + k, b = i * n + (k + 1) % n, c = (i + 1) * n + k, d = (i + 1) * n + (k + 1) % n;
      idx.push(a, c, b, b, c, d);
    }
    // the two ends
    const capA = pos.length / 3; pos.push(0, (st[0].y0 + st[0].y1) / 2, st[0].z);
    const capB = pos.length / 3; const last = st[st.length - 1]; pos.push(0, (last.y0 + last.y1) / 2, last.z);
    for (let k = 0; k < n; k++) { idx.push(capA, k, (k + 1) % n); const o = (rings.length - 1) * n; idx.push(capB, o + (k + 1) % n, o + k); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }

  const smooth = (rows) => rows.map(([z, y0, y1, w, r, t]) => ({ z, y0, y1, w, r: r == null ? 0.3 : r, t: t || 0 }));
  const KINDS = {
    sedan: { len: 4.7, wheelbase: [1.36, -1.36], wr: 0.31, body: smooth([[-2.33, 0.48, 0.74, 1.46], [-2.25, 0.34, 0.92, 1.68], [-1.9, 0.26, 0.96, 1.8], [-1.0, 0.22, 0.95, 1.84], [0.3, 0.22, 0.92, 1.84], [1.1, 0.24, 0.86, 1.82], [1.9, 0.28, 0.78, 1.74], [2.3, 0.36, 0.68, 1.5], [2.37, 0.46, 0.58, 1.1]]),
      cabin: smooth([[-1.98, 0.9, 0.98, 1.5, 0.3, 0.05], [-1.55, 0.9, 1.3, 1.6, 0.3, 0.12], [-1.05, 0.9, 1.43, 1.62, 0.34, 0.18], [-0.2, 0.9, 1.46, 1.64, 0.34, 0.18], [0.35, 0.88, 1.38, 1.66, 0.34, 0.16], [0.95, 0.85, 1.06, 1.68, 0.3, 0.1], [1.22, 0.84, 0.9, 1.6, 0.3, 0.05]]), roof: [-1.05, 0.35], h: 1.46, belt: 0.92 },
    suv: { len: 4.75, wheelbase: [1.42, -1.38], wr: 0.37, body: smooth([[-2.36, 0.56, 0.95, 1.62], [-2.28, 0.38, 1.04, 1.8], [-1.9, 0.32, 1.08, 1.9], [-1.0, 0.3, 1.08, 1.92], [0.5, 0.3, 1.06, 1.92], [1.3, 0.32, 1.04, 1.9], [2.0, 0.36, 0.98, 1.82], [2.32, 0.44, 0.86, 1.62], [2.38, 0.56, 0.72, 1.2]]),
      cabin: smooth([[-2.3, 1.03, 1.2, 1.62, 0.3, 0.06], [-2.14, 1.03, 1.68, 1.68, 0.3, 0.12], [-1.2, 1.04, 1.76, 1.72, 0.34, 0.14], [0.2, 1.04, 1.76, 1.74, 0.34, 0.14], [0.72, 1.03, 1.6, 1.76, 0.34, 0.12], [1.2, 1.01, 1.2, 1.76, 0.3, 0.08], [1.42, 1.0, 1.06, 1.68, 0.3, 0.04]]), roof: [-2.1, 0.55], h: 1.76, belt: 1.06 },
    van: { len: 5.3, wheelbase: [1.7, -1.5], wr: 0.36, body: smooth([[-2.64, 0.5, 1.12, 1.8], [-2.58, 0.36, 1.2, 1.92], [-1.5, 0.34, 1.22, 1.98], [1.0, 0.34, 1.2, 1.98], [1.9, 0.36, 1.12, 1.94], [2.46, 0.42, 0.98, 1.76], [2.66, 0.56, 0.82, 1.28]]),
      cabin: smooth([[-2.6, 1.18, 1.3, 1.8, 0.2, 0.02], [-2.56, 1.18, 2.0, 1.86, 0.25, 0.05], [-0.8, 1.18, 2.08, 1.9, 0.25, 0.06], [0.9, 1.18, 2.06, 1.9, 0.28, 0.08], [1.38, 1.16, 1.84, 1.9, 0.3, 0.1], [1.92, 1.1, 1.26, 1.86, 0.3, 0.08], [2.1, 1.08, 1.12, 1.76, 0.3, 0.04]]), roof: [-2.56, 0.95], h: 2.08, belt: 1.2 },
    pickup: { len: 5.5, wheelbase: [1.7, -1.75], wr: 0.4, body: smooth([[-2.74, 0.5, 1.12, 1.84, 0.1], [-2.68, 0.42, 1.18, 1.92, 0.1], [-1.2, 0.4, 1.18, 1.94, 0.1], [0.8, 0.4, 1.18, 1.94], [1.6, 0.42, 1.14, 1.92], [2.4, 0.46, 1.04, 1.84], [2.74, 0.6, 0.88, 1.5]]),
      cabin: smooth([[-1.2, 1.15, 1.25, 1.72, 0.2, 0.04], [-1.12, 1.15, 1.78, 1.74, 0.3, 0.12], [0.1, 1.15, 1.84, 1.76, 0.32, 0.14], [0.62, 1.14, 1.68, 1.78, 0.3, 0.12], [1.12, 1.12, 1.22, 1.78, 0.3, 0.06], [1.34, 1.1, 1.14, 1.7, 0.3, 0.04]]), roof: [-1.12, 0.45], h: 1.84, belt: 1.18 },
  };

  function roofGeometry(k) {
    const inside = k.cabin.filter(s => s.z >= k.roof[0] - 0.02 && s.z <= k.roof[1] + 0.02);
    const st = inside.map(s => ({ z: s.z, y0: s.y1 - 0.09, y1: s.y1 + 0.012, w: s.w * (1 - s.t) * 0.98, r: 0.5, t: 0.1 }));
    return loft(st);
  }
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  function merge(parts) {
    let n = 0; const list = parts.map(g => g.index ? g.toNonIndexed() : g);
    for (const g of list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
    for (const g of list) { if (!g.attributes.normal) g.computeVertexNormals(); pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
    const G = new THREE.BufferGeometry(); G.setAttribute('position', new THREE.BufferAttribute(pos, 3)); G.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    return G;
  }

  const shared = {};
  function kindGeometry(name) {
    if (shared[name]) return shared[name];
    const k = KINDS[name], halfL = k.len / 2, w = k.body[Math.floor(k.body.length / 2)].w;
    // the paint: body and roof, pillars, mirrors
    const paint = [loft(k.body), roofGeometry(k)];
    for (const s of [-1, 1]) paint.push(box(0.2, 0.09, 0.1, s * (w / 2 + 0.08), k.belt + 0.04, k.roof[1] + 0.22));
    // the glass, which is the whole cabin
    const glass = loft(k.cabin);
    // dark trim: sills, bumpers, grille, door seams, wheel arches, plate
    const trim = [
      box(w * 0.6, 0.11, 0.06, 0, k.belt * 0.45, halfL - 0.03), box(w * 0.6, 0.11, 0.06, 0, k.belt * 0.45, -halfL + 0.03),
      box(w * 0.42, 0.11, 0.04, 0, k.belt * 0.62, halfL - 0.02),
    ];
    for (const s of [-1, 1]) {
      trim.push(box(0.03, 0.07, k.len * 0.62, s * (w / 2 - 0.01), 0.28, -0.05));
      for (const z of [k.roof[1] + 0.16, (k.roof[0] + k.roof[1]) / 2, k.roof[0] + 0.05]) trim.push(box(0.012, k.belt - 0.34, 0.012, s * (w / 2 + 0.002), (k.belt + 0.34) / 2, z));
      for (const z of [(k.roof[0] + k.roof[1]) / 2 - 0.45, k.roof[1] - 0.05]) trim.push(box(0.03, 0.025, 0.14, s * (w / 2 + 0.01), k.belt - 0.14, z));
    }
    const plate = [box(0.3, 0.13, 0.02, 0, k.belt * 0.6, -halfL + 0.03), box(0.3, 0.1, 0.02, 0, k.belt * 0.45, halfL + 0.01)];
    const head = [], tail = [];
    for (const s of [-1, 1]) {
      head.push(box(0.3, 0.1, 0.09, s * (w / 2 - 0.36), k.belt - 0.26, halfL - 0.22));
      tail.push(box(0.3, 0.13, 0.08, s * (w / 2 - 0.34), k.belt - 0.2, -halfL + 0.1));
    }
    if (name === 'pickup') {   // the open bed
      trim.push(box(1.56, 0.04, 1.3, 0, 1.17, -1.95));
    }
    return (shared[name] = { paint: merge(paint), glass, trim: merge(trim), plate: merge(plate), head: merge(head), tail: merge(tail) });
  }
  const wheelGeo = {};
  function wheelGeometry(r) {
    if (wheelGeo[r]) return wheelGeo[r];
    const tire = new THREE.CylinderGeometry(r, r, 0.2, 24).rotateZ(Math.PI / 2);
    const hub = [new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.21, 18).rotateZ(Math.PI / 2)];
    for (let i = 0; i < 5; i++) { const a = i * 1.2566; hub.push(box(0.215, 0.04, r * 0.72, 0, 0, 0).rotateX(a)); }
    return (wheelGeo[r] = { tire, hub: merge(hub) });
  }

  const MATS = {
    glass: new THREE.MeshStandardMaterial({ color: 0x1b2730, roughness: 0.08, metalness: 0.55 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.65 }),
    plate: new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.5 }),
    head: new THREE.MeshStandardMaterial({ color: 0xf0efe8, emissive: 0x555550, roughness: 0.15 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x8e1414, emissive: 0x3a0606, roughness: 0.25 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.95 }),
    hub: new THREE.MeshStandardMaterial({ color: 0xb4b8bc, roughness: 0.28, metalness: 0.85 }),
  };
  const PAINT = [0xc8cacc, 0x08090b, 0x3a3d40, 0x8a8c8e, 0x420a0a, 0x0a1426, 0xd6d6d4, 0x131519, 0x6a6458, 0x151f17, 0xbcbcbe, 0x26282a];

  function makeCar(kind, paintHex) {
    const k = KINDS[kind], G = kindGeometry(kind), g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: paintHex, roughness: 0.22, metalness: 0.5 });
    for (const [geo, m] of [[G.paint, paint], [G.glass, MATS.glass], [G.trim, MATS.trim], [G.plate, MATS.plate], [G.head, MATS.head], [G.tail, MATS.tail]]) g.add(new THREE.Mesh(geo, m));
    const wg = wheelGeometry(k.wr), w = k.body[Math.floor(k.body.length / 2)].w;
    const wheels = [], front = [];
    for (const [z, isFront] of [[k.wheelbase[0], true], [k.wheelbase[1], false]]) for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * (w / 2 - 0.15), k.wr, z); g.add(pivot);
      const spin = new THREE.Group(); pivot.add(spin);
      spin.add(new THREE.Mesh(wg.tire, MATS.tire), new THREE.Mesh(wg.hub, MATS.hub));
      wheels.push(spin); if (isFront) front.push(pivot);
    }
    return { group: g, wheels, front, kind, wr: k.wr, len: k.len };
  }

  // ─── the road network ──────────────────────────────────────────────────────

  function buildGraph(inHouse) {
    const throughHouse = (a, b) => { const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 1.5); for (let i = 1; i < n; i++) if (inHouse(a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n)) return true; return false; };
    const nodes = new Map(), key = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2);
    const node = (x, z) => { const k = key(x, z); if (!nodes.has(k)) nodes.set(k, { x, z, out: [] }); return nodes.get(k); };
    for (const r of [...Data.roads, ...((root.WideData && root.WideData.roads) || []).filter(q => q.w >= 8)]) {
      if (r.k === 'service') continue;
      let prev = null;
      for (let i = 0; i < r.p.length; i += 2) {
        const n = node(r.p[i], r.p[i + 1]);
        if (prev && prev !== n && !throughHouse(prev, n)) { prev.out.push({ to: n, w: r.w }); n.out.push({ to: prev, w: r.w }); }
        prev = n;
      }
    }
    // ways that meet part-way along a segment, without sharing a point: tie each dangling end to the nearest point
    const list = [...nodes.values()];
    for (const n of list) {
      if (n.out.length !== 1) continue;
      let best = null, bd = 16;
      for (const m of list) {
        if (m === n || n.out[0].to === m) continue;
        const d = Math.hypot(m.x - n.x, m.z - n.z);
        if (d < bd && !throughHouse(n, m)) { bd = d; best = m; }
      }
      if (best) { n.out.push({ to: best, w: 9 }); best.out.push({ to: n, w: 9 }); }
    }
    return list;
  }

  // ─── the church lot: aisles and bays ───────────────────────────────────────

  const W = Plan.world;
  const LOT = {
    A: W(6, 47.5), B: W(30, 47.5), C: W(53, 47.5), D: W(60, 47.5), E: W(60, 20), F: W(60, -14), G: W(31, -14), H: W(31, -25), I: W(83, -14), J: W(83, -25), K: W(6, 72), L: W(30, 65), M: W(53, 65),
    N: W(79, 47.5), O: W(79, 20), P: W(79, -14), S: W(53, 64.5), Q: W(30, 64.5),
  };
  const LINKS = 'A-B B-C C-D D-E E-F F-G G-H F-I I-J K-L L-M M-C D-N N-O O-P P-I P-F C-S S-Q'.split(' ').map(s => s.split('-'));
  const EXITS = [
    { name: 'A', road: W(-7, 47.5) }, { name: 'K', road: W(-7, 72) }, { name: 'H', road: W(31, -28) }, { name: 'J', road: W(83, -28) },
  ];
  function lotPath(from, to) {
    const adj = {}; for (const [a, b] of LINKS) { (adj[a] = adj[a] || []).push(b); (adj[b] = adj[b] || []).push(a); }
    const prev = { [from]: null }, q = [from];
    while (q.length) { const n = q.shift(); if (n === to) break; for (const m of adj[n] || []) if (!(m in prev)) { prev[m] = n; q.push(m); } }
    const out = []; for (let n = to; n != null; n = prev[n]) out.unshift(LOT[n]);
    return out;
  }
  /** Every parking bay: where a car sits, how it is turned, and which aisle point it opens onto. */
  function bays() {
    const out = [];
    for (const st of Plan.SITE.stalls) {
      const [ax, az] = st.from, [bx, bz] = st.to, dx = (bx - ax) / st.n, dz = (bz - az) / st.n, [ux, uz] = st.dir;
      for (let i = st.carts || 0; i < st.n; i++) {
        const x = ax + dx * (i + 0.5) + ux * st.len * 0.5 + dx * st.skew * 0.5, z = az + dz * (i + 0.5) + uz * st.len * 0.5 + dz * st.skew * 0.5;
        // nearest aisle point, and the spot directly in front of the bay on the aisle side
        let best = 'A', bd = 1e9;
        for (const [name, [px, pz]] of Object.entries(LOT)) { if ('HJ'.includes(name)) continue; const d = Math.hypot(px - x, pz - z); if (d < bd) { bd = d; best = name; } }
        out.push({ x, z, heading: Math.atan2(-ux - dx * st.skew / st.len, -uz - dz * st.skew / st.len), mouth: [x + ux * st.len * 1.2, z + uz * st.len * 1.2], aisle: best, used: false });      // nose in, the aisle behind
      }
    }
    return out;
  }

  /** Where the golf carts wait: the bays set aside for them. */
  function cartBays() {
    const out = [];
    for (const st of Plan.SITE.stalls) {
      if (!st.carts) continue;
      const [ax, az] = st.from, [bx, bz] = st.to, dx = (bx - ax) / st.n, dz = (bz - az) / st.n, [ux, uz] = st.dir;
      for (let i = 0; i < st.carts; i++) out.push({ x: ax + dx * (i + 0.5) + ux * st.len * 0.5 + dx * st.skew * 0.5, z: az + dz * (i + 0.5) + uz * st.len * 0.5 + dz * st.skew * 0.5, h: Math.atan2(ux + dx * st.skew / st.len, uz + dz * st.skew / st.len) });
    }
    return out;
  }

  // ─── the cars ──────────────────────────────────────────────────────────────

  function build(scene, isWalker, inHouse, carts) {
    const group = new THREE.Group(); scene.add(group);
    const walkers = () => { const w = isWalker(); return w ? [w] : []; };
    const standing = () => (carts && carts.list ? carts.list.filter(k => k !== carts.driving) : []);
    const graph = buildGraph(inHouse).filter(n => n.out.length);
    const r = rng(1962);
    const parking = bays();
    const cars = [];
    const KIND_LIST = ['sedan', 'sedan', 'suv', 'suv', 'van', 'pickup', 'sedan', 'suv'];

    const near = (x, z) => { let b = graph[0], d = 1e9; for (const n of graph) { const q = Math.hypot(n.x - x, n.z - z); if (q < d) { d = q; b = n; } } return b; };

    function setOnRoad(c, n, prev) {
      c.mode = 'road'; c.at = n; c.prev = prev;
      const opts = n.out.filter(e => e.to !== prev);
      const e = (opts.length ? opts : n.out)[Math.floor(r() * Math.max(1, (opts.length ? opts : n.out).length))];
      c.edge = e;
    }
    /** Where the traffic should be: round whoever is walking or driving, or else round the church. */
    const about = () => { const w = walkers()[0]; return w ? [w.x, w.z] : [0, 20]; };
    function spawnRoad(c) {
      const [ax, az] = about(), walking = walkers().length > 0;
      for (let tries = 0; tries < 400; tries++) {
        const n = graph[Math.floor(r() * graph.length)], away = Math.hypot(n.x - ax, n.z - az);
        if (away > 340 || (walking && away < 110)) continue;
        const e = n.out[Math.floor(r() * n.out.length)];
        const d = Math.atan2(e.to.x - n.x, e.to.z - n.z);
        c.x = n.x; c.z = n.z; c.h = d; c.speed = 6; setOnRoad(c, n, null); c.edge = e;
        return;
      }
    }
    function park(c, bay, instantly) {
      bay.used = true; c.bay = bay; c.mode = 'parked'; c.until = instantly ? 20 + r() * 240 : 40 + r() * 180;
      c.x = bay.x; c.z = bay.z; c.h = bay.heading; c.speed = 0;
    }
    const count = Q.cars;
    for (let i = 0; i < count; i++) {
      const c = makeCar(KIND_LIST[i % KIND_LIST.length], PAINT[Math.floor(r() * PAINT.length)]);
      Object.assign(c, { x: 0, z: 0, h: 0, speed: 0, top: 8 + r() * 3.5, roll: 0, steer: 0, path: null });
      group.add(c.group);
      cars.push(c);
      if (i % 3 === 0) { const free = parking.filter(b => !b.used); park(c, free[Math.floor(r() * free.length)], true); } else spawnRoad(c);
    }

    function enterLot(c, exit) {
      const free = parking.filter(b => !b.used);
      if (!free.length) return false;
      const bay = free[Math.floor(r() * free.length)];
      bay.used = true; c.bay = bay;
      c.path = [...lotPath(exit.name, bay.aisle), bay.mouth, [bay.x, bay.z]];
      c.pi = 0; c.mode = 'in'; c.edge = null;
      return true;
    }
    function leaveLot(c) {
      const bay = c.bay;
      const exit = EXITS[Math.floor(r() * EXITS.length)];
      // backing out first, then away along the aisles
      c.path = [...lotPath(bay.aisle, exit.name), exit.road];
      c.pi = 0; c.mode = 'backing'; c.backTo = bay.mouth; c.exit = exit;
      bay.used = false; c.bay = null;
    }

    function ahead(c) {
      // how far is anyone or anything directly in front?
      const fx = Math.sin(c.h), fz = Math.cos(c.h); let d = 99;
      for (const o of cars) {
        // only those moving the same way hold you up: parked cars sit in their bays and oncoming ones keep to their side
        if (o === c || o.mode === 'parked' || Math.sin(o.h) * fx + Math.cos(o.h) * fz < 0.3) continue;
        const dx = o.x - c.x, dz = o.z - c.z, along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
        if (along > 0 && side < 1.4 && along < d) d = along;
      }
      for (const w of walkers().concat(standing())) { const dx = w.x - c.x, dz = w.z - c.z, along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx); if (along > 0 && side < 1.9 && along < d) d = along; }
      return d;
    }

    function steerTo(c, tx, tz, dt, top) {
      const want = Math.atan2(tx - c.x, tz - c.z), dH = wrap(want - c.h);
      const gap = ahead(c), safe = gap < 6 + c.len / 2 ? 0 : gap < 13 + c.len / 2 ? top * 0.45 : top;
      // slow for a bend, and slower still for a sharp one, so the car can always turn in time
      const corner = Math.abs(dH) > 1.1 ? Math.min(top, 1.6) : Math.abs(dH) > 0.5 ? Math.min(top, 3.2) : top;
      const goal = Math.min(safe, corner);
      c.speed += Math.max(-9 * dt, Math.min(2.6 * dt, goal - c.speed));
      c.h += Math.max(-1, Math.min(1, dH * 2.4)) * Math.min(1.4, 0.55 + c.speed * 0.22) * dt * (c.speed > 0.05 ? 1 : 0);
      c.steer += (Math.max(-0.5, Math.min(0.5, dH)) - c.steer) * Math.min(1, dt * 6);
      c.x += Math.sin(c.h) * c.speed * dt; c.z += Math.cos(c.h) * c.speed * dt;
      return Math.hypot(tx - c.x, tz - c.z);
    }

    /** Aim to the right of an aisle's centre line, so cars meeting in the lot pass side by side. */
    function keepRight(c, tx, tz) {
      const dx = tx - c.x, dz = tz - c.z, L = Math.hypot(dx, dz) || 1;
      return [tx - dz / L * 1.3, tz + dx / L * 1.3];
    }

    function step(c, dt) {
      switch (c.mode) {
        case 'road': {
          const n = c.at, e = c.edge;
          if (!e) { spawnRoad(c); return; }
          const to = e.to, dx = to.x - n.x, dz = to.z - n.z, L = Math.hypot(dx, dz) || 1;
          // keep to the right of the road's middle
          const off = Math.max(1.7, Math.min(2.9, (e.w || 9) / 2 - 1.6)), rx = -dz / L, rz = dx / L;
          // on a lane squeezed against a building, keep to the middle of the way
          if (e.squeezed == null) {
            e.squeezed = false;
            const n2 = Math.ceil(L / 1.5);
            for (let i = 0; i <= n2 && !e.squeezed; i++) { const t = i / n2, px = n.x + dx * t, pz = n.z + dz * t; if (inHouse(px + rx * (off + 1.1), pz + rz * (off + 1.1))) e.squeezed = true; }
          }
          const tx = to.x + rx * (e.squeezed ? 0 : off), tz = to.z + rz * (e.squeezed ? 0 : off);
          const juncture = to.out.length > 2, dist = steerTo(c, tx, tz, dt, juncture && Math.hypot(to.x - c.x, to.z - c.z) < 14 ? Math.min(c.top, 4.5) : c.top);
          c.wd = (c.wd || 0) + dt;
          // lost, or wandered too far from anywhere it can go? start again somewhere else, out of sight of no one in particular
          { const [ax, az] = about(); if (c.wd > 30 && ahead(c) > 15 || Math.hypot(c.x - ax, c.z - az) > 430) { c.wd = 0; spawnRoad(c); return; } }
          // reached the point, or driven past it
          if (dist < 4.5 || (tx - c.x) * dx + (tz - c.z) * dz < 0) {
            c.wd = 0;
            // the church's driveways are right here: sometimes turn in
            for (const ex of EXITS) if (Math.hypot(ex.road[0] - to.x, ex.road[1] - to.z) < 16 && r() < 0.22 && enterLot(c, ex)) return;
            const prev = n; c.at = to; c.prev = prev;
            const opts = to.out.filter(q => q.to !== prev), list = opts.length ? opts : to.out;
            c.edge = list[Math.floor(r() * list.length)];
            { const [ax, az] = about(); if (Math.hypot(to.x - ax, to.z - az) > 410) spawnRoad(c); }
          }
          return;
        }
        case 'in': {
          const [tx0, tz0] = c.path[c.pi], last = c.pi === c.path.length - 1, nearEnd = c.pi >= c.path.length - 2;
          const [tx, tz] = nearEnd ? [tx0, tz0] : keepRight(c, tx0, tz0);
          const d = steerTo(c, tx, tz, dt, last ? 1.5 : 3.6);
          c.wd = (c.wd || 0) + dt;
          if (d < (last ? 0.7 : 2.6) || c.wd > 20) { c.pi++; c.wd = 0; if (last) park(c, c.bay); }
          return;
        }
        case 'parked': {
          c.speed = 0; c.until -= dt;
          // settle into the bay's line
          c.h += wrap(c.bay.heading - c.h) * Math.min(1, dt * 2);
          if (c.until < 0) leaveLot(c);
          return;
        }
        case 'backing': {
          const [tx, tz] = c.backTo, away = Math.atan2(c.x - tx, c.z - tz);
          c.h += wrap(away - c.h) * Math.min(1, dt * 1.6);
          c.speed = -1.3;
          c.x += Math.sin(c.h) * c.speed * dt; c.z += Math.cos(c.h) * c.speed * dt;
          if (Math.hypot(tx - c.x, tz - c.z) < 0.9) { c.mode = 'out'; c.speed = 0; }
          return;
        }
        case 'out': {
          const [tx0, tz0] = c.path[c.pi], last = c.pi === c.path.length - 1;
          const [tx, tz] = last ? [tx0, tz0] : keepRight(c, tx0, tz0);
          const d = steerTo(c, tx, tz, dt, last ? 3 : 3.6);
          c.wd = (c.wd || 0) + dt;
          if (d < 2.8 || c.wd > 20) {
            c.pi++; c.wd = 0;
            if (last) {
              const n = near(c.x, c.z);
              c.at = n; c.prev = null; c.edge = n.out[Math.floor(r() * n.out.length)];
              c.mode = 'road';
            }
          }
          return;
        }
      }
    }

    return {
      group, cars,
      /** Is this spot taken by a car, parked or moving? */
      solidAt(x, z, rad) {
        for (const c of cars) {
          const dx = x - c.x, dz = z - c.z, fx = Math.sin(c.h), fz = Math.cos(c.h), along = dx * fx + dz * fz, side = dx * fz - dz * fx;
          if (Math.abs(along) < c.len / 2 + rad && Math.abs(side) < 0.95 + rad) return true;
        }
        return false;
      },
      update(dt) {
        const d = Math.min(dt, 0.05);
        for (const c of cars) {
          step(c, d);
          c.group.position.set(c.x, -0.02, c.z);
          c.group.rotation.y = c.h;
          c.roll += c.speed * d / c.wr;
          for (const w of c.wheels) w.rotation.x = c.roll;
          for (const p of c.front) p.rotation.y = c.steer;
        }
      },
    };
  }

  root.Traffic = { build, KINDS, makeCar, cartBays };
})(typeof self !== 'undefined' ? self : this);
