/*
 * The neighbourhood: the aerial on the ground, the streets with their curbs, every house from its real outline and
 * roof colour (the walls, windows and roof forms are generated in the local ranch style), the trees where the aerial
 * shows them, the Marian garden, and the street furniture.
 */
(function (root) {
  'use strict';
  const THREE = root.THREE, Plan = root.Plan, Tex = root.Tex, Data = root.SiteData, Q = root.Quality;
  const { SITE } = Plan;
  const rng = seed => { let s = (seed % 2147483646) + 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

  // ─── houses ────────────────────────────────────────────────────────────────

  function inPoly(pts, x, z) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, zi] = pts[i], [xj, zj] = pts[j];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  }

  /** Break a footprint into up to `max` rectangles, in the frame of its longest wall: ranch houses are made of such wings. */
  function wings(pts, max) {
    let best = 0, ang = 0;
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length], L = Math.hypot(bx - ax, bz - az);
      if (L > best) { best = L; ang = Math.atan2(bz - az, bx - ax); }
    }
    const c = Math.cos(-ang), s = Math.sin(-ang);
    const loc = pts.map(([x, z]) => [x * c - z * s, x * s + z * c]);
    const u0 = Math.min(...loc.map(p => p[0])), u1 = Math.max(...loc.map(p => p[0])), v0 = Math.min(...loc.map(p => p[1])), v1 = Math.max(...loc.map(p => p[1]));
    const cell = Math.max(0.6, Math.max(u1 - u0, v1 - v0) / 40), nu = Math.ceil((u1 - u0) / cell), nv = Math.ceil((v1 - v0) / cell);
    const grid = [];
    for (let j = 0; j < nv; j++) { grid[j] = []; for (let i = 0; i < nu; i++) grid[j][i] = inPoly(loc, u0 + (i + 0.5) * cell, v0 + (j + 0.5) * cell); }
    const out = [];
    for (let n = 0; n < max; n++) {
      // the largest rectangle still free, by histogram
      const hist = new Array(nu).fill(0);
      let top = null, area = 0;
      for (let j = 0; j < nv; j++) {
        for (let i = 0; i < nu; i++) hist[i] = grid[j][i] ? hist[i] + 1 : 0;
        for (let i = 0; i < nu; i++) {
          let h = hist[i];
          for (let k = i; k < nu && hist[k]; k++) {
            h = Math.min(h, hist[k]);
            const a = h * (k - i + 1);
            if (a > area) { area = a; top = [i, j - h + 1, k, j]; }
          }
        }
      }
      if (!top || area * cell * cell < (n ? 14 : 2)) break;
      const [i0, j0, i1, j1] = top;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) grid[j][i] = false;
      out.push({ u0: u0 + i0 * cell, u1: u0 + (i1 + 1) * cell, v0: v0 + j0 * cell, v1: v0 + (j1 + 1) * cell });
    }
    return { ang, rects: out };
  }

  /** The nearest road's point to (x, z), for turning a house's front towards its street. */
  function nearestRoad(x, z) {
    let best = null, bd = Infinity;
    for (const r of Data.roads) {
      if (r.k === 'service') continue;
      for (let k = 0; k < r.p.length - 2; k += 2) {
        const ax = r.p[k], az = r.p[k + 1], bx = r.p[k + 2], bz = r.p[k + 3], dx = bx - ax, dz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / ((dx * dx + dz * dz) || 1)));
        const px = ax + t * dx, pz = az + t * dz, d = Math.hypot(x - px, z - pz);
        if (d < bd) { bd = d; best = { x: px, z: pz, d, w: r.w }; }
      }
    }
    return best;
  }

  function buildHouses(B, W) {
    const M = W.M, L = Q.houses;
    const walls = Tex.mat('stucco', { vertexColors: true, rough: 1, normal: 0.7 });
    const roofs = Tex.mat('shingle', { vertexColors: true, rough: 1, side: THREE.DoubleSide });
    const glass = M(0x1a2228, { roughness: 0.12, metalness: 0.35 }), frame = M(0xe4e1d8, { roughness: 0.6 }), fascia = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    const garage = M(0xd8d4c8, { roughness: 0.55 }), garageLine = M(0xb0ac9f, { roughness: 0.7 }), solar = M(0x10161f, { roughness: 0.2, metalness: 0.5 });
    const fenceW = Tex.mat('oak', { color: 0xa98a68, rough: 1, normal: 0.6 }), brick = Tex.mat('brick', { color: 0xb08068, rough: 1 });
    const hedge = M(0x18300f, { roughness: 1 });
    const drive = new THREE.MeshStandardMaterial({ map: Tex.get('concrete', 'd'), roughness: 1, depthWrite: false, side: THREE.DoubleSide, color: 0xe2ddd0 }); drive.userData.layer = -3.5;
    const WALL = [0xf6efe0, 0xeee0c4, 0xfafaf4, 0xe2cca8, 0xe8e4da, 0xd8dfd9, 0xf2e6d0, 0xdcc6a0, 0xe9e0d4, 0xc6d0d6];
    const DOOR = [0x5a3517, 0x2f4a3a, 0x7a2522, 0xe6e2d6, 0x2a3546, 0x3b2a1a];
    const lawnM = Tex.mat('grass', { vertexColors: true, rough: 1, depthWrite: false, side: THREE.DoubleSide }); lawnM.userData.layer = -3.8;
    const solids = new Map(), CELL = 24;

    const moved = (root.WideData && root.WideData.moved) || [];
    Data.buildings.forEach((bd, n) => {
      const pts = []; for (let i = 0; i < bd.p.length; i += 2) pts.push([bd.p[i], bd.p[i + 1]]);
      if (pts.length < 3) return;
      // the flats, shops and halls among them are drawn with the rest of Northridge, as what they are
      { const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length, mz = pts.reduce((a, p) => a + p[1], 0) / pts.length; bd.isMoved = moved.some(q => Math.hypot(q[0] - mx, q[1] - mz) < 2.5); }
      const r = rng(n * 7919 + 13);
      const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
      for (let gx = Math.floor(Math.min(...xs) / CELL); gx <= Math.floor(Math.max(...xs) / CELL); gx++) for (let gz = Math.floor(Math.min(...zs) / CELL); gz <= Math.floor(Math.max(...zs) / CELL); gz++) {
        const k = gx + ',' + gz; if (!solids.has(k)) solids.set(k, []); solids.get(k).push(pts);
      }
      if (root.WideData && root.WideData.tile) return;      // drawn with the rest of the town
      const { ang, rects } = wings(pts, L >= 2 ? 3 : 1);
      if (!rects.length) return;
      const wallC = WALL[n % WALL.length], roofC = bd.c == null ? 0x6a625a : bd.c, trimC = n % 3 === 0 ? 0x5a4632 : 0xe8e4da;
      const c = Math.cos(ang), s = Math.sin(ang);
      const toWorld = (u, v) => [u * c - v * s, u * s + v * c];
      const ry = -ang;
      const tall = bd.h > 6.2;
      const eave = tall ? 5.2 : 2.7;
      const pitch = 0.3 + r() * 0.12;

      rects.forEach((w, wi) => {
        const lu = w.u1 - w.u0, lv = w.v1 - w.v0, cu = (w.u0 + w.u1) / 2, cv = (w.v0 + w.v1) / 2, [cx, cz] = toWorld(cu, cv);
        B.box(walls, lu, eave, lv, cx, eave / 2, cz, { ry, tex: 2.4, color: wallC });
        // the roof: hip on most, a gable on some, with eaves and a fascia
        const o = 0.5, a0 = w.u0 - o, a1 = w.u1 + o, b0 = w.v0 - o, b1 = w.v1 + o;
        const alongU = lu >= lv, run = (alongU ? b1 - b0 : a1 - a0) / 2, rise = run * pitch, y0 = eave - 0.04, y1 = y0 + rise;
        const P = (u, v, y) => { const [x, z] = toWorld(u, v); return [x, y, z]; };
        const gable = wi === 0 ? r() < 0.25 : r() < 0.4;
        const inset = gable ? 0 : run;
        const tris = [];
        if (alongU) {
          const vm = (b0 + b1) / 2, ua = a0 + inset, ub = a1 - inset;
          tris.push(P(a0, b0, y0), P(ua, vm, y1), P(a1, b0, y0), P(a1, b0, y0), P(ua, vm, y1), P(ub, vm, y1));
          tris.push(P(a1, b1, y0), P(ub, vm, y1), P(a0, b1, y0), P(a0, b1, y0), P(ub, vm, y1), P(ua, vm, y1));
          tris.push(P(a0, b1, y0), P(ua, vm, y1), P(a0, b0, y0), P(a1, b0, y0), P(ub, vm, y1), P(a1, b1, y0));
        } else {
          const um = (a0 + a1) / 2, va = b0 + inset, vb = b1 - inset;
          tris.push(P(a0, b0, y0), P(um, va, y1), P(a0, b1, y0), P(a0, b1, y0), P(um, va, y1), P(um, vb, y1));
          tris.push(P(a1, b1, y0), P(um, vb, y1), P(a1, b0, y0), P(a1, b0, y0), P(um, vb, y1), P(um, va, y1));
          tris.push(P(a1, b0, y0), P(um, va, y1), P(a0, b0, y0), P(a0, b1, y0), P(um, vb, y1), P(a1, b1, y0));
        }
        B.tris(roofs, tris, roofC);
        if (gable) {    // the gable ends, in the wall colour
          const g = alongU
            ? [P(w.u0, b0 + o, eave), P(w.u0, (b0 + b1) / 2, y1 - 0.08), P(w.u0, b1 - o, eave), P(w.u1, b1 - o, eave), P(w.u1, (b0 + b1) / 2, y1 - 0.08), P(w.u1, b0 + o, eave)]
            : [P(a0 + o, w.v0, eave), P((a0 + a1) / 2, w.v0, y1 - 0.08), P(a1 - o, w.v0, eave), P(a1 - o, w.v1, eave), P((a0 + a1) / 2, w.v1, y1 - 0.08), P(a0 + o, w.v1, eave)];
          B.tris(walls, g, wallC);
        }
        if (L >= 2) {
          for (const [bu, bv, wu, wv] of [[cu, b0, a1 - a0, 0.05], [cu, b1, a1 - a0, 0.05], [a0, cv, 0.05, b1 - b0], [a1, cv, 0.05, b1 - b0]]) {
            const [fx, fz] = toWorld(bu, bv);
            B.box(fascia, wu, 0.2, wv, fx, y0 - 0.06, fz, { ry, color: trimC });
          }
        }
        // windows on each wall that is not buried in another wing
        const stories = tall ? [1.0, 3.6] : [1.0];
        const wallsHere = [[w.u0, w.u1, w.v0, -1, 'v'], [w.u0, w.u1, w.v1, 1, 'v'], [w.v0, w.v1, w.u0, -1, 'u'], [w.v0, w.v1, w.u1, 1, 'u']];
        for (const [t0, t1, at, sgn, axis] of wallsHere) {
          const len = t1 - t0, count = Math.floor(len / (L >= 3 ? 2.9 : 4));
          for (let k = 0; k < count; k++) {
            if (r() < 0.2) continue;
            const t = t0 + (k + 0.5) * len / count;
            const lu2 = axis === 'v' ? t : at + sgn * 0.25, lv2 = axis === 'v' ? at + sgn * 0.25 : t;
            if (rects.some((q, qi) => qi !== wi && lu2 > q.u0 && lu2 < q.u1 && lv2 > q.v0 && lv2 < q.v1)) continue;
            for (const y of stories) {
              const u = axis === 'v' ? t : at + sgn * 0.035, v = axis === 'v' ? at + sgn * 0.035 : t;
              const [wx, wz] = toWorld(u, v), W1 = 1.25, H1 = 1.15;
              const dims = axis === 'v' ? [W1, H1, 0.05] : [0.05, H1, W1], dimsF = axis === 'v' ? [W1 + 0.14, H1 + 0.14, 0.04] : [0.04, H1 + 0.14, W1 + 0.14];
              if (L >= 2) B.box(frame, dimsF[0], dimsF[1], dimsF[2], wx, y + 0.55, wz, { ry });
              const [gx, gz] = toWorld(axis === 'v' ? t : at + sgn * 0.06, axis === 'v' ? at + sgn * 0.06 : t);
              B.box(glass, dims[0], dims[1], dims[2], gx, y + 0.55, gz, { ry });
              if (L >= 3) {
                const [mx, mz] = toWorld(axis === 'v' ? t : at + sgn * 0.09, axis === 'v' ? at + sgn * 0.09 : t);
                B.box(frame, axis === 'v' ? 0.04 : 0.02, H1, axis === 'v' ? 0.02 : 0.04, mx, y + 0.55, mz, { ry });
              }
            }
          }
        }
      });

      // the front: towards the nearest street, with a door, and a garage and driveway on the main wing
      const w = rects[0], cu = (w.u0 + w.u1) / 2, cv = (w.v0 + w.v1) / 2, [cx, cz] = toWorld(cu, cv);
      const road = nearestRoad(cx, cz);
      if (!road || bd.k === 'yes' || bd.k === 'apartments') return;
      const dx = road.x - cx, dz = road.z - cz;
      const du = dx * c + dz * s, dv = -dx * s + dz * c;
      const facesU = Math.abs(du) > Math.abs(dv), sgn = facesU ? Math.sign(du) : Math.sign(dv);
      const frontAt = facesU ? (sgn > 0 ? w.u1 : w.u0) : (sgn > 0 ? w.v1 : w.v0);
      const t0 = facesU ? w.v0 : w.u0, t1 = facesU ? w.v1 : w.u1, span = t1 - t0;
      const onFront = (t, off) => toWorld(facesU ? frontAt + sgn * off : t, facesU ? t : frontAt + sgn * off);
      const dims = (along, h, thick) => (facesU ? [thick, h, along] : [along, h, thick]);
      // the front yard, between the house and the sidewalk: mostly lawn, some gone to dry ground
      { const [ax, az] = onFront((t0 + t1) / 2, 0.1), toRoad = Math.hypot(road.x - ax, road.z - az) - road.w / 2 - 2.6;
        if (toRoad > 1.5 && toRoad < 22) {
          const [nx, nz] = facesU ? [sgn * c, sgn * s] : [-sgn * s, sgn * c], half = span / 2 + 3;
          const px = -nz * half, pz = nx * half, bx = ax + nx * toRoad, bz = az + nz * toRoad;
          const tone = r() < 0.72 ? [0xf0f0e8, 0xd8e8c8, 0xc8d8b8][n % 3] : 0xc8a878;
          B.tris(lawnM, [[ax + px, -0.018, az + pz], [ax - px, -0.018, az - pz], [bx + px, -0.018, bz + pz], [bx + px, -0.018, bz + pz], [ax - px, -0.018, az - pz], [bx - px, -0.018, bz - pz]], tone);
        } }
      // door
      const doorT = t0 + span * (0.35 + r() * 0.3), [dox, doz] = onFront(doorT, 0.04), dd = dims(1.0, 2.1, 0.08);
      B.box(M(DOOR[n % DOOR.length], { roughness: 0.5 }), dd[0], dd[1], dd[2], dox, 1.05, doz, { ry });
      if (L >= 2) { const de = dims(1.22, 2.26, 0.05), [fx, fz] = onFront(doorT, 0.02); B.box(frame, de[0], de[1], de[2], fx, 1.13, fz, { ry }); }
      if (L >= 3 && r() < 0.5) { const st = dims(1.5, 0.14, 0.9), [fx, fz] = onFront(doorT, 0.45); B.box(brick, st[0], st[1], st[2], fx, 0.07, fz, { ry, tex: 0.9 }); }
      // garage, at one end of the front, with its driveway running to the curb
      if (span > 8 && bd.h < 7.5 && r() < 0.88) {
        const gw = span > 12 && r() < 0.6 ? 4.8 : 2.7, end = r() < 0.5, gt = end ? t0 + gw / 2 + 0.4 : t1 - gw / 2 - 0.4;
        const [gx, gz] = onFront(gt, 0.04), gd = dims(gw, 2.1, 0.07);
        B.box(garage, gd[0], gd[1], gd[2], gx, 1.05, gz, { ry });
        if (L >= 2) for (let k = 1; k < 4; k++) { const [lx, lz] = onFront(gt, 0.08), ld = dims(gw - 0.1, 0.02, 0.02); B.box(garageLine, ld[0], ld[1], ld[2], lx, k * 0.52, lz, { ry }); }
        // the driveway
        const [ax, az] = onFront(gt, 0.1), toRoad = Math.hypot(road.x - ax, road.z - az) - road.w / 2 - 0.3;
        if (toRoad > 1 && toRoad < 26) {
          const [nx, nz] = facesU ? [sgn * c, sgn * s] : [-sgn * s, sgn * c];
          const [bx, bz] = [ax + nx * toRoad, az + nz * toRoad], half = gw / 2 + 0.3;
          const px = -nz * half, pz = nx * half;
          B.tris(drive, [[ax + px, -0.016, az + pz], [ax - px, -0.016, az - pz], [bx + px, -0.016, bz + pz], [bx + px, -0.016, bz + pz], [ax - px, -0.016, az - pz], [bx - px, -0.016, bz - pz]]);
        }
      }
      if (L < 2) return;
      // what makes one Northridge house unlike the next: chimneys, solar panels, hedges, a side fence
      if (r() < 0.35) {
        const t = w.u0 + (w.u1 - w.u0) * (0.2 + r() * 0.6), v = w.v0 + (w.v1 - w.v0) * (0.2 + r() * 0.6), [hx, hz] = toWorld(t, v);
        B.box(brick, 0.7, bd.h > 6 ? 3.2 : 1.9, 0.5, hx, eave + (bd.h > 6 ? 1.1 : 0.7), hz, { ry, tex: 0.9 });
      }
      if (r() < 0.28) {   // the street views show plenty of panels
        const lu = w.u1 - w.u0, lv = w.v1 - w.v0, alongU = lu >= lv, rise = (alongU ? lv + 1 : lu + 1) / 2 * pitch;
        const side = r() < 0.5 ? -1 : 1, count = 2 + Math.floor(r() * 3);
        for (let k = 0; k < count; k++) {
          const tt = (k - (count - 1) / 2) * 1.8;
          const u = alongU ? cu + tt : cu + side * (lu * 0.24), v = alongU ? cv + side * (lv * 0.24) : cv + tt;
          const [hx, hz] = toWorld(u, v);
          B.box(solar, alongU ? 1.7 : 2.2, 0.05, alongU ? 2.2 : 1.7, hx, eave + rise * 0.56, hz, { ry, rx: alongU ? side * Math.atan(pitch) * 0.98 : 0, rz: alongU ? 0 : -side * Math.atan(pitch) * 0.98 });
        }
      }
      if (L >= 3 && r() < 0.5) {
        const [hx, hz] = onFront(t0 + span * (0.5 + r() * 0.4), 0.55), hd = dims(Math.min(5, span * 0.4), 0.85, 0.65);
        B.box(hedge, hd[0], hd[1], hd[2], hx, 0.42, hz, { ry });
      }
      // a wood fence from the back of the house towards the side of the lot
      if (r() < 0.75) {
        const backAt = facesU ? (sgn > 0 ? w.u0 : w.u1) : (sgn > 0 ? w.v0 : w.v1), reach = 6 + r() * 4;
        const [fx, fz] = toWorld(facesU ? backAt : t1 + reach / 2, facesU ? t1 + reach / 2 : backAt);
        B.box(fenceW, facesU ? 0.06 : reach, 1.8, facesU ? reach : 0.06, fx, 0.9, fz, { ry, tex: 1.8 });
      }
    });

    /** Is (x, z) inside a neighbouring building? */
    return (x, z) => {
      const list = solids.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
      if (!list) return false;
      for (const pts of list) if (inPoly(pts, x, z)) return true;
      return false;
    };
  }

  // ─── streets ───────────────────────────────────────────────────────────────

  function ribbonPts(p) { const pts = []; for (let i = 0; i < p.length; i += 2) pts.push([p[i], p[i + 1]]); return pts; }
  function ribbon(B, mat, p, w, y, off = 0, y1) {
    const pts = ribbonPts(p);
    const normal = i => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
      return [-dz / L, dx / L];
    };
    const tri = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [nax, naz] = normal(i), [nbx, nbz] = normal(i + 1), [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const yy = y1 == null ? y : y1;
      const A = [ax + nax * (off + w / 2), yy, az + naz * (off + w / 2)], Bb = [ax + nax * (off - w / 2), y, az + naz * (off - w / 2)];
      const C = [bx + nbx * (off + w / 2), yy, bz + nbz * (off + w / 2)], D = [bx + nbx * (off - w / 2), y, bz + nbz * (off - w / 2)];
      tri.push(A, Bb, C, C, Bb, D);
    }
    if (tri.length) B.tris(mat, tri);
  }

  function buildStreets(B, W) {
    const M = W.M;
    const layer = (n, name, o) => { const m = Tex.mat(name, Object.assign({ rough: 1, depthWrite: false, side: THREE.DoubleSide }, o)); m.userData.layer = n; return m; };
    const walk = layer(-8, 'concrete', { color: 0xdcd8cc }), road = layer(-7, 'asphalt', { color: 0x8c8c8c });
    B.wetMats = [road, walk];
    const yellow = new THREE.MeshStandardMaterial({ color: 0xb79a2c, roughness: 1, depthWrite: false, side: THREE.DoubleSide }); yellow.userData.layer = -6.5;
    const curb = Tex.mat('concrete', { color: 0xd8d4c8, rough: 1, side: THREE.DoubleSide });
    const redCurb = M(0x5a1a14, { roughness: 1, side: THREE.DoubleSide });
    for (const r of Data.roads) {
      if (r.w > 5) ribbon(B, walk, r.p, r.w + 5, -0.03);
      ribbon(B, road, r.p, r.w, -0.026);
      if (r.w >= 11) { ribbon(B, yellow, r.p, 0.1, -0.022, 0.09); ribbon(B, yellow, r.p, 0.1, -0.022, -0.09); }
      if (r.w > 5 && Q.houses >= 2) for (const side of [-1, 1]) {
        const off = side * (r.w / 2 + 0.08), mat = /White Oak/.test(r.n) && r.p[0] < -72 && r.p[0] > -110 ? redCurb : curb;
        ribbon(B, mat, r.p, 0.16, 0.13, off);
        ribbon(B, mat, r.p, 0.02, -0.02, off - side * 0.08, 0.13);
      }
    }
  }

  // ─── things along the street ───────────────────────────────────────────────

  function buildFurniture(B, W, group) {
    const M = W.M;
    const pole = Tex.mat('oak', { color: 0x5a4632, rough: 1 }), steel = M(0x8d9094, { metalness: 0.7, roughness: 0.45 });
    const lines = [];
    const tops = [];
    for (const [x, z] of SITE.poles) {
      B.cyl(pole, 0.11, 0.16, 10.5, x, 5.25, z, 10);
      B.box(pole, 0.1, 0.12, 2.6, x, 9.6, z);
      B.box(pole, 0.1, 0.12, 2.0, x, 8.7, z);
      for (const k of [-1.2, 0, 1.2]) { B.cyl(M(0x8a7c6a), 0.03, 0.04, 0.16, x, 9.72, z + k, 6); tops.push([x, 9.8, z + k]); }
      B.cyl(M(0x6f6f6a, { metalness: 0.3 }), 0.24, 0.24, 0.8, x, 7.5, z + 0.32, 10);
    }
    // the wires along Superior and White Oak, sagging a little between the poles
    const groups = [SITE.poles.slice(0, 3), SITE.poles.slice(3)];
    for (const g of groups) for (let i = 0; i + 1 < g.length; i++) for (const k of [-1.2, 0, 1.2]) {
      const [ax, az] = g[i], [bx, bz] = g[i + 1];
      for (let t = 0; t < 8; t++) {
        const s0 = t / 8, s1 = (t + 1) / 8, sag = q => 9.8 - 0.55 * 4 * q * (1 - q);
        lines.push(ax + (bx - ax) * s0, sag(s0), az + (bz - az) * s0 + k, ax + (bx - ax) * s1, sag(s1), az + (bz - az) * s1 + k);
      }
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x1a1a1a })));
    // street lights, stop signs, the speed-hump sign and a hydrant, where the 2025 views show them
    const lamp = (E, N, dir) => {
      const [x, z] = Plan.world(E, N);
      B.cyl(steel, 0.07, 0.12, 8.5, x, 4.25, z, 10);
      B.box(steel, Math.abs(dir[0]) * 2.2 + 0.07, 0.07, Math.abs(dir[1]) * 2.2 + 0.07, x + dir[0] * 1.1, 8.5, z + dir[1] * 1.1);
      B.box(M(0xdcd8cc), 0.5, 0.1, 0.24, x + dir[0] * 2.2, 8.44, z + dir[1] * 2.2);
    };
    lamp(0, 72, [0, 1]); lamp(0, -19, [0, 1]); lamp(40, -22, [-1, 0]); lamp(76, -22, [-1, 0]);
    const signTex = (draw) => { const t = W.canvasTex(128, 128, draw); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };
    const stop = signTex((g, w, h) => {
      g.fillStyle = '#ffffff'; g.beginPath(); for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; g.lineTo(w / 2 + Math.cos(a) * 62, h / 2 + Math.sin(a) * 62); } g.fill();
      g.fillStyle = '#b4161c'; g.beginPath(); for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; g.lineTo(w / 2 + Math.cos(a) * 57, h / 2 + Math.sin(a) * 57); } g.fill();
      g.fillStyle = '#fff'; g.font = '700 38px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('STOP', w / 2, h / 2 + 13);
    });
    const hump = signTex((g, w, h) => {
      g.fillStyle = '#e8b018'; g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI / 4); g.fillRect(-44, -44, 88, 88); g.restore();
      g.fillStyle = '#111'; g.font = '700 17px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('SPEED', w / 2, h / 2 - 4); g.fillText('HUMPS', w / 2, h / 2 + 15);
    });
    const postSign = (E, N, tex, ry) => {
      const [x, z] = Plan.world(E, N);
      B.cyl(steel, 0.03, 0.03, 2.6, x, 1.3, z, 8);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.78), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }));
      m.position.set(x, 2.45, z); m.rotation.y = ry; group.add(m);
    };
    postSign(-3, -21, stop, -Math.PI / 2); postSign(-13.5, -33, stop, 0); postSign(-3, 72, hump, -Math.PI / 2);
    { const [x, z] = Plan.world(-1, 80), red = M(0xb5a33a, { roughness: 0.5, metalness: 0.2 });
      B.cyl(red, 0.09, 0.11, 0.6, x, 0.3, z, 10); B.cyl(red, 0.07, 0.09, 0.15, x, 0.66, z, 10); B.box(red, 0.34, 0.1, 0.1, x, 0.42, z); }
    // the tall wood fences along the lot's north neighbour and over White Oak
    const fence = Tex.mat('oak', { color: 0xa98a68, rough: 1, normal: 0.6 });
    const seg = (a, b, h = 1.9) => {
      const [ax, az] = Plan.world(a[0], a[1]), [bx, bz] = Plan.world(b[0], b[1]), L = Math.hypot(bx - ax, bz - az);
      B.box(fence, 0.06, h, L, (ax + bx) / 2, h / 2, (az + bz) / 2, { ry: Math.atan2(bx - ax, bz - az), tex: 1.8 });
      for (let i = 0; i <= L / 2.4; i++) { const t = i * 2.4 / L; B.box(M(0x3e3226), 0.1, h + 0.08, 0.1, ax + (bx - ax) * t, h / 2, az + (bz - az) * t); }
    };
    seg([4, 77], [4, 96]); seg([-17, -8], [-17, 40]);
  }

  // ─── the Marian garden ─────────────────────────────────────────────────────

  function buildGarden(B, W, group) {
    const M = W.M, G = SITE.garden, r = rng(4242);
    const mid = [(G[0] + G[2]) / 2, (G[1] + G[3]) / 2];
    const soil = new THREE.MeshStandardMaterial({ map: Tex.get('mulch', 'd'), roughness: 1, depthWrite: false, side: THREE.DoubleSide }); soil.userData.layer = -3.2;
    const gravel = new THREE.MeshStandardMaterial({ map: Tex.get('concrete', 'd'), color: 0xc9bea6, roughness: 1, depthWrite: false, side: THREE.DoubleSide }); gravel.userData.layer = -3.1;
    B.flat(soil, G, -0.01, { tex: 3 });
    const [sx, sz] = SITE.statue;
    B.flat(gravel, [sx - 1.0, sz, sx + 1.0, Math.max(G[3], sz + 7)], -0.005, { tex: 2 });        // the path in from the little gate
    // a curb round the bed
    const curb = Tex.mat('concrete', { color: 0xcfcabb, rough: 1 });
    B.rect(curb, [G[0], G[1], G[0] + 0.14, G[3]], 0, 0.16); B.rect(curb, [G[2] - 0.14, G[1], G[2], G[3]], 0, 0.16);
    B.rect(curb, [G[0], G[1], G[2], G[1] + 0.14], 0, 0.16);
    // boulders, ringing the statue and along the bed
    const rock = Tex.mat('stone', { color: 0xa79c8b, rough: 1 });
    const boulder = (x, z, s) => {
      const g = new THREE.IcosahedronGeometry(s, 2), a = g.attributes.position;
      for (let i = 0; i < a.count; i++) { const k = 0.82 + 0.3 * Math.abs(Math.sin(a.getX(i) * 7 + x) * Math.cos(a.getZ(i) * 6 + z)); a.setXYZ(i, a.getX(i) * k, a.getY(i) * k * 0.72, a.getZ(i) * k); }
      g.computeVertexNormals();
      B.m.makeTranslation(x, s * 0.3, z); B.add(rock, g, B.m);
    };
    for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283; boulder(sx + Math.cos(a) * 1.75, sz + Math.sin(a) * 1.75, 0.22 + r() * 0.2); }
    for (let i = 0; i < 18; i++) boulder(G[0] + 0.5 + r() * (G[2] - G[0] - 1), G[1] + 0.5 + r() * (G[3] - G[1] - 1), 0.14 + r() * 0.22);

    // planting: lavender, roses, grasses, agave, each a clump of crossed stems with flowers on top
    const stemM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
    const clump = (x, z, h, spread, n, stemC, flowerC) => {
      for (let i = 0; i < n; i++) {
        const a = r() * 6.283, d = r() * spread, bx = x + Math.cos(a) * d * 0.3, bz = z + Math.sin(a) * d * 0.3, tx = x + Math.cos(a) * d, tz = z + Math.sin(a) * d, H = h * (0.65 + r() * 0.5);
        const wx = Math.sin(a) * 0.02, wz = -Math.cos(a) * 0.02;
        B.tris(stemM, [[bx - wx, 0, bz - wz], [bx + wx, 0, bz + wz], [tx, H, tz]], stemC);
        if (flowerC != null) {
          const fs = h * 0.09;
          B.m.makeTranslation(tx, H, tz); B.add(stemM, new THREE.IcosahedronGeometry(fs, 0), B.m, flowerC);
        }
      }
    };
    const place = (fn) => { for (let t = 0; t < 40; t++) { const x = G[0] + 0.5 + r() * (G[2] - G[0] - 1), z = G[1] + 0.5 + r() * (G[3] - G[1] - 1); if (Math.hypot(x - sx, z - sz) > 2.0 && !(Math.abs(x - sx) < 1.2 && z > sz)) return fn(x, z); } };
    const n = Math.round(44 * Q.cards);
    for (let i = 0; i < n; i++) place((x, z) => clump(x, z, 0.65, 0.45, 26, 0x4a6a48, 0x7d5cc4));              // lavender
    for (let i = 0; i < n / 2; i++) place((x, z) => clump(x, z, 0.8, 0.4, 20, 0x2f5a26, [0xc92f4a, 0xe8c14a, 0xf2e2e6][i % 3]));   // roses
    for (let i = 0; i < n / 3; i++) place((x, z) => clump(x, z, 0.9, 0.5, 18, 0x7c8f4a, null));                  // grasses
    for (let i = 0; i < n / 5; i++) place((x, z) => clump(x, z, 0.75, 0.55, 12, 0x6c8f7a, null));                // agave

    // the iron fence, with finials, and its gate
    const iron = M(0x14151a, { roughness: 0.45, metalness: 0.4 });
    const ironRun = (f, h) => {
      const [ax, az] = f.from, [bx, bz] = f.to, L = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bx - ax, bz - az), n2 = Math.round(L / 0.13);
      for (let i = 0; i <= n2; i++) {
        const x = ax + (bx - ax) * i / n2, z = az + (bz - az) * i / n2;
        B.cyl(iron, 0.008, 0.008, h, x, h / 2, z, 5);
        B.m.makeTranslation(x, h + 0.03, z); B.add(iron, new THREE.ConeGeometry(0.018, 0.07, 5), B.m);
      }
      for (const y of [0.14, h - 0.08]) B.box(iron, 0.025, 0.03, L, (ax + bx) / 2, y, (az + bz) / 2, { ry: ang });
      for (const [x, z] of [[ax, az], [bx, bz]]) B.box(M(0x6b4a2f, { roughness: 0.8 }), 0.14, h + 0.2, 0.14, x, (h + 0.2) / 2, z);
    };
    for (const f of SITE.gardenFence) ironRun(f, 1.05);
    ironRun(SITE.gardenGate, 1.0);
    { const [x, z] = Plan.world(4.6, 60); const ring = new THREE.TorusGeometry(0.22, 0.012, 6, 24); B.m.makeRotationY(Math.PI / 2); B.m.setPosition(x, 0.6, z); B.add(iron, ring, B.m); }
    // a bench facing the statue
    const wood = Tex.mat('oak', { color: 0x8a6a48, rough: 0.8 });
    B.box(wood, 0.45, 0.05, 1.5, sx + 2.9, 0.45, sz); B.box(wood, 0.05, 0.42, 1.5, sx + 3.12, 0.72, sz);
    for (const k of [-0.65, 0.65]) B.box(iron, 0.4, 0.45, 0.05, sx + 2.9, 0.22, sz + k);

    B.statue = root.Statue.build(group, sx, sz);
  }

  // ─── trees ─────────────────────────────────────────────────────────────────

  function leafTexture(draw) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    draw(c.getContext('2d'), 256);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    return t;
  }
  const texBroad = () => leafTexture((g, S) => {
    const r = rng(11);
    for (let i = 0; i < 420; i++) {
      const a = r() * 6.283, d = Math.sqrt(r()) * S * 0.47, x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d;
      const k = 130 + r() * 125; g.fillStyle = `rgb(${k},${k},${k * 0.82})`;
      g.save(); g.translate(x, y); g.rotate(r() * 6.283); g.beginPath(); g.ellipse(0, 0, 8 + r() * 5, 3.6 + r() * 2, 0, 0, 6.283); g.fill(); g.restore();
    }
  });
  const texNeedle = () => leafTexture((g, S) => {
    const r = rng(23);
    g.strokeStyle = '#3a2a1c'; g.lineWidth = 4; g.beginPath(); g.moveTo(S / 2, S); g.lineTo(S / 2, S * 0.05); g.stroke();
    for (let i = 0; i < 560; i++) {
      const t = r(), y = S - t * S * 0.95, half = (1 - t) * S * 0.46 * (0.5 + r() * 0.5), side = r() < 0.5 ? -1 : 1, L = half * (0.4 + r() * 0.6);
      const k = 120 + r() * 135; g.strokeStyle = `rgb(${k * 0.92},${k},${k * 0.88})`; g.lineWidth = 1.5 + r() * 1.5;
      g.beginPath(); g.moveTo(S / 2, y); g.lineTo(S / 2 + side * L, y - L * 0.25 - r() * 12); g.stroke();
    }
  });
  const texFrond = () => leafTexture((g, S) => {
    const r = rng(37);
    g.strokeStyle = '#6b5a35'; g.lineWidth = 4; g.beginPath(); g.moveTo(S / 2, S); g.lineTo(S / 2, 4); g.stroke();
    for (let i = 0; i < 80; i++) {
      const t = i / 80, y = S - t * S, L = S * 0.48 * Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.1));
      const k = 150 + r() * 100; g.strokeStyle = `rgb(${k},${k},${k * 0.72})`; g.lineWidth = 2.4;
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(S / 2, y); g.lineTo(S / 2 + s * L, y + L * 0.5); g.stroke(); }
    }
  });

  /** Quads scattered as a tree's foliage, each with normals pointing out from the crown so it shades like a solid mass. */
  function foliageGeometry(cards, shape) {
    const pos = [], nor = [], uv = [], r = rng(99);
    for (let i = 0; i < cards; i++) {
      const c = shape(r, i), [cx, cy, cz, s, stretchUp = 1] = c;
      const ux = r() - 0.5, uy = r() - 0.5, uz = r() - 0.5, uL = Math.hypot(ux, uy, uz) || 1;
      const a = new THREE.Vector3(ux / uL, uy / uL, uz / uL);
      let b = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).cross(a).normalize();
      if (c[5]) { a.copy(c[5]); b.copy(c[6]); }
      a.multiplyScalar(s); b.multiplyScalar(s * stretchUp);
      const n = new THREE.Vector3(cx, (cy - 0.5) * 1.1, cz).normalize();
      const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([p, q]) => [cx + a.x * p + b.x * q, cy + a.y * p + b.y * q, cz + a.z * p + b.z * q]);
      const U = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...P[k]); nor.push(n.x, n.y, n.z); uv.push(...U[k]); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  }
  /** A trunk and limbs, as tapered cylinders, for a tree of height 1. */
  function woodGeometry(limbs, trunkH, trunkR, seed) {
    const parts = [], r = rng(seed);
    const cyl = (a, b, ra, rb, seg) => {
      const d = new THREE.Vector3().subVectors(b, a), L = d.length();
      const g = new THREE.CylinderGeometry(rb, ra, L, seg, 1, true).toNonIndexed();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
      g.applyMatrix4(new THREE.Matrix4().compose(a.clone().addScaledVector(d, 0.5), q, new THREE.Vector3(1, 1, 1)));
      parts.push(g);
    };
    const top = new THREE.Vector3(0, trunkH, 0);
    cyl(new THREE.Vector3(0, 0, 0), top, trunkR, trunkR * 0.72, 8);
    for (let i = 0; i < limbs; i++) {
      const y = trunkH * (0.6 + r() * 0.4), a = r() * 6.283, L = 0.18 + r() * 0.2;
      const s = new THREE.Vector3(0, y, 0), e = new THREE.Vector3(Math.cos(a) * L, y + 0.14 + r() * 0.2, Math.sin(a) * L);
      cyl(s, e, trunkR * 0.45, trunkR * 0.15, 5);
      const a2 = a + (r() - 0.5) * 1.2, e2 = e.clone().add(new THREE.Vector3(Math.cos(a2) * 0.12, 0.08 + r() * 0.1, Math.sin(a2) * 0.12));
      cyl(e, e2, trunkR * 0.15, trunkR * 0.05, 4);
    }
    let n = 0; for (const g of parts) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0; for (const g of parts) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; }
    const G = new THREE.BufferGeometry();
    G.setAttribute('position', new THREE.BufferAttribute(pos, 3)); G.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); G.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return G;
  }

  const SPECIES = {
    oak: { wood: [9, 0.48, 0.03, 1], cards: 120, tex: 'broad', crown: (r) => { const a = r() * 6.283, p = Math.acos(2 * r() - 1), d = Math.cbrt(r()) * 0.46; return [Math.sin(p) * Math.cos(a) * d, 0.63 + Math.cos(p) * d * 0.68, Math.sin(p) * Math.sin(a) * d, 0.078]; } },
    maple: { wood: [7, 0.55, 0.024, 2], cards: 100, tex: 'broad', crown: (r) => { const a = r() * 6.283, p = Math.acos(2 * r() - 1), d = Math.cbrt(r()) * 0.34; return [Math.sin(p) * Math.cos(a) * d, 0.68 + Math.cos(p) * d * 0.95, Math.sin(p) * Math.sin(a) * d, 0.066]; } },
    myrtle: { wood: [10, 0.5, 0.02, 3], cards: 70, tex: 'broad', crown: (r) => { const a = r() * 6.283, p = Math.acos(2 * r() - 1), d = Math.cbrt(r()) * 0.34; return [Math.sin(p) * Math.cos(a) * d, 0.7 + Math.cos(p) * d * 0.8, Math.sin(p) * Math.sin(a) * d, 0.075]; } },
    // tiers of drooping sprays up a straight trunk: the tall pines round the lot
    pine: { wood: [0, 0.97, 0.018, 4], cards: 90, tex: 'needle', crown: (r, i) => {
      const t = i / 90, y = 0.12 + t * 0.86, rad = (1 - t) * 0.2 + 0.015, a = i * 2.399 + r() * 0.4, L = rad * 0.6;
      const out = new THREE.Vector3(Math.cos(a), -0.28, Math.sin(a)).normalize().multiplyScalar(L);
      const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(L * 0.75);
      return [Math.cos(a) * rad * 0.5, y, Math.sin(a) * rad * 0.5, 1, 1, side, out];
    } },
    cypress: { wood: [0, 0.95, 0.012, 5], cards: 56, tex: 'needle', crown: (r, i) => {
      const t = i / 56, y = 0.08 + t * 0.9, rad = Math.sin(Math.min(1, t * 1.1 + 0.08) * Math.PI) * 0.06 + 0.012, a = r() * 6.283, L = 0.09;
      return [Math.cos(a) * rad, y, Math.sin(a) * rad, 1, 1, new THREE.Vector3(-Math.sin(a) * L * 0.6, 0, Math.cos(a) * L * 0.6), new THREE.Vector3(0, L, 0)];
    } },
    palm: { wood: [0, 0.9, 0.02, 6], cards: 22, tex: 'frond', crown: (r, i) => {
      const a = i * 2.399, droop = 0.2 + r() * 0.5, L = 0.13;
      const out = new THREE.Vector3(Math.cos(a), 0.55 - droop, Math.sin(a)).normalize().multiplyScalar(L);
      const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(L * 0.42);
      return [Math.cos(a) * L, 0.9 + out.y, Math.sin(a) * L, 1, 1, side, out];
    } },
  };

  /** Every tree as instances, redrawn in detail only near the camera. */
  function buildTrees(group, W, inHouse) {
    const list = [];
    const put = (x, z, h, sp, tint, wide) => list.push({ x, z, h, sp, tint, wide });
    const r = rng(2024);
    const GREEN = [0x234a1c, 0x2c5522, 0x1c4018, 0x365c24, 0x264a1c];
    // on the church's grounds, by hand from the 2025 views
    for (const [x, z] of SITE.pines) put(x, z, 16 + r() * 6, 'pine', 0x16361f);
    for (const [x, z] of SITE.broadleaf) put(x, z, 7 + r() * 3, 'maple', 0x2c5522);
    put(...Plan.world(38, 14), 6, 'maple', 0x8a7414);
    SITE.streetTrees.forEach(([x, z], i) => put(x, z, 5.2 + r(), i > 2 ? 'myrtle' : 'maple', i > 2 ? 0x54203a : 0x6a2c14));
    for (const [E, N] of [[92, 30], [92, 8], [40, 86], [24, 80]]) { const [x, z] = Plan.world(E, N); put(x, z, 9, 'palm', 0x2c5522); }
    // the rest, where the aerial shows crowns
    const share = Q.trees;
    const laser = root.WideData && root.WideData.trees && root.WideData.trees[0] && root.WideData.trees[0].length >= 5;
    for (const t of laser ? [] : Data.trees) {
      if (r() > share) continue;
      const [x, z, h, kind] = t;
      if (inHouse(x, z)) continue;
      const u = r();
      const sp = kind === 1 || u < 0.16 ? 'pine' : u < 0.22 ? 'palm' : u < 0.27 ? 'cypress' : u < 0.62 ? 'oak' : 'maple';
      put(x, z, sp === 'palm' ? 7 + r() * 5 : sp === 'cypress' ? 6 + r() * 5 : sp === 'pine' ? Math.max(11, h * 1.15) : h, sp, sp === 'pine' || sp === 'cypress' ? 0x16361f : GREEN[Math.floor(r() * GREEN.length)]);
    }
    // every other tree where the laser found it: its true height and spread, its colour from the photograph, its kind guessed from its shape
    if (laser) for (const [x, z, h, cr, col] of root.WideData.trees) {
      if (r() > share) continue;
      const ratio = cr / Math.max(1, h), red = (col >> 16) & 255, gr = (col >> 8) & 255, bl = col & 255, dark = red + gr + bl < 190;
      const sp = h > 9 && cr < 2.6 ? 'palm' : h > 7 && cr < 1.8 ? 'cypress' : dark && ratio < 0.3 ? 'pine' : ratio > 0.42 ? 'oak' : 'maple';
      const tint = (Math.round(red * 0.42) << 16) | (Math.round(Math.min(255, gr * 0.74)) << 8) | Math.round(bl * 0.38);
      put(x, z, h, sp, tint, Math.max(0.55, Math.min(1.7, cr / (h * 0.36))));
    }
    const tex = { broad: texBroad(), needle: texNeedle(), frond: texFrond() };
    const bark = Tex.mat('bark', { rough: 1, normal: 1 });
    const meshes = {};
    const dummy = new THREE.Object3D();
    for (const [name, sp] of Object.entries(SPECIES)) {
      const items = list.filter(t => t.sp === name);
      if (!items.length) continue;
      const leaves = new THREE.MeshStandardMaterial({ map: tex[sp.tex], alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.85 });
      leaves.onBeforeCompile = sh => {     // both faces of a card take the crown's light: no dark backs
        sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'));
      };
      const leafDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex[sp.tex], alphaTest: 0.42, side: THREE.DoubleSide });
      const cards = Math.max(12, Math.round(sp.cards * Q.cards));
      const shape = (rr, i) => { const c = sp.crown(rr, Math.round(i * sp.cards / cards)); return c; };
      const near = foliageGeometry(cards, shape), far = foliageGeometry(Math.max(8, Math.round(cards * 0.32)), (rr, i) => { const c = sp.crown(rr, Math.round(i * sp.cards / Math.max(8, Math.round(cards * 0.32)))); if (c[5]) { c[5].multiplyScalar(1.7); c[6].multiplyScalar(1.7); } else c[3] *= 1.9; return c; });
      const woodG = woodGeometry(...sp.wood);
      const mk = (g, m) => { const o = new THREE.InstancedMesh(g, m, items.length); o.frustumCulled = false; o.count = 0; group.add(o); return o; };
      const set = { items, nearL: mk(near, leaves), farL: mk(far, leaves), wood: mk(woodG, bark) };
      set.nearL.customDepthMaterial = leafDepth; set.nearL.castShadow = true; set.wood.castShadow = true;
      meshes[name] = set;
      const col = new THREE.Color();
      for (const m of [set.nearL, set.farL]) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(items.length * 3), 3);
      void col;
    }
    const color = new THREE.Color();
    let last = -1e9, lx = 1e9, lz = 1e9;
    /** Put each tree in the detailed or the cheap set according to its distance. */
    function refresh(x, z, far) {
      for (const set of Object.values(meshes)) {
        let n = 0, f = 0, w = 0;
        for (const t of set.items) {
          const d = Math.hypot(t.x - x, t.z - z);
          if (d > far || (d > 650 && (Math.round(t.x * 3) & 1))) continue;      // far off, half of them will do
          dummy.position.set(t.x, 0, t.z); dummy.rotation.set(0, (t.x * 13.7 + t.z * 7.1) % 6.283, 0);
          const wide = t.wide || 0.86 + ((t.x * 3.1 + t.z) % 1 + 1) % 1 * 0.3;
          dummy.scale.set(t.h * wide, t.h, t.h * wide); dummy.updateMatrix();
          color.setHex(t.tint);
          if (d < 110) { set.nearL.setMatrixAt(n, dummy.matrix); set.nearL.setColorAt(n, color); n++; } else { set.farL.setMatrixAt(f, dummy.matrix); set.farL.setColorAt(f, color); f++; }
          if (d < 240) { if (t.wide) { dummy.scale.set(t.h * 0.62, t.h, t.h * 0.62); dummy.updateMatrix(); } set.wood.setMatrixAt(w++, dummy.matrix); }
        }
        set.nearL.count = n; set.farL.count = f; set.wood.count = w;
        set.nearL.instanceMatrix.needsUpdate = set.farL.instanceMatrix.needsUpdate = set.wood.instanceMatrix.needsUpdate = true;
        if (set.nearL.instanceColor) set.nearL.instanceColor.needsUpdate = true;
        if (set.farL.instanceColor) set.farL.instanceColor.needsUpdate = true;
      }
    }
    let lastFar = 0;
    return { count: list.length, update(camera, t, far = 620) {
      const moved = Math.hypot(camera.position.x - lx, camera.position.z - lz);
      if (moved > 25 || t - last > 30 || far !== lastFar) { lx = camera.position.x; lz = camera.position.z; last = t; lastFar = far; refresh(lx, lz, far); }
    } };
  }

  // ─── everything ────────────────────────────────────────────────────────────

  /** The aerial on the ground, sharpened close up by a tiling grass detail. */
  function groundMat(aerial) {
    const groundM = new THREE.MeshStandardMaterial({ map: aerial, roughness: 1, depthWrite: false, side: THREE.DoubleSide });
    const detail = Tex.get('grass', 'd'), paved = Tex.get('concrete', 'd');
    groundM.onBeforeCompile = sh => {
      sh.uniforms.detailMap = { value: detail }; sh.uniforms.pavedMap = { value: paved };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWorldXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldXZ = position.xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D detailMap;\nuniform sampler2D pavedMap;\nvarying vec2 vWorldXZ;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec3 tile = texture2D(detailMap, vWorldXZ * 0.31).rgb;
          float dt = dot(tile, vec3(0.34));
          float green = smoothstep(-0.015, 0.05, diffuseColor.g - max(diffuseColor.r, diffuseColor.b));
          vec3 lawn = tile * (0.45 + dot(diffuseColor.rgb, vec3(0.9))) * vec3(0.92, 1.05, 0.72);
          vec3 hard = diffuseColor.rgb * (0.5 + 1.25 * dot(texture2D(pavedMap, vWorldXZ * 0.23).rgb, vec3(0.34)));
          diffuseColor.rgb = mix(hard * (0.8 + dt * 0.45), lawn, green * 0.8);
`);
    };
    return groundM;
  }

  function build(scene, W, site) {
    const group = new THREE.Group(); scene.add(group);
    const B = new root.Site.Batch(group);

    const A = root.AerialData, img = new Image();
    const aerial = new THREE.Texture(img); aerial.encoding = THREE.sRGBEncoding; aerial.anisotropy = 8;
    img.onload = () => { aerial.needsUpdate = true; }; img.src = A.src;
    const groundM = groundMat(aerial);
    groundM.userData.layer = -9;
    const R = A.r, x0 = A.cx - R, x1 = A.cx + R, z0 = A.cz - R, z1 = A.cz + R;
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute([x0, -0.05, z1, x1, -0.05, z1, x1, -0.05, z0, x0, -0.05, z0], 3));
    gg.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    gg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 1, 1], 2));
    gg.setIndex([0, 1, 2, 0, 2, 3]);
    const ground = new THREE.Mesh(gg, groundM); ground.renderOrder = -9; ground.frustumCulled = false; group.add(ground);
    // beyond the photograph, a plain ground into the haze
    const far = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshStandardMaterial({ color: 0x5c6242, roughness: 1, depthWrite: false }));
    far.rotation.x = -Math.PI / 2; far.position.y = -0.06; far.renderOrder = -10; far.frustumCulled = false; group.add(far);

    const inHouse = buildHouses(B, W);
    buildStreets(B, W);
    const wet = B.wetMats;
    buildFurniture(B, W, group);
    buildGarden(B, W, group);
    B.flush(false);
    const casters = group.children.filter(o => o.isMesh);
    const trees = buildTrees(group, W, inHouse);
    const statue = B.statue;
    return { group, inHouse, trees, casters, statue, treeFar: 620, wetMats: wet, update(camera, t, walking) { trees.update(camera, t, this.treeFar); statue.update(camera, walking); } };
  }

  root.Outdoors = { build, wings, groundMat };
})(typeof self !== 'undefined' ? self : this);
