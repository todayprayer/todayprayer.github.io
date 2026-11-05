/*
 * Our Lady in white marble, hands joined: every fold, finger and feature is a surface computed here, with no data behind it.
 * A plain version stands in from far off; the fine one is made when you first come near.
 * In her own frame +z is the way she faces and the figure's feet are at y = 0, on top of the pedestal.
 */
(function (root) {
  'use strict';
  const THREE = root.THREE, Q = root.Quality;
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const g2 = (dx, sx, dy, sy) => Math.exp(-(dx * dx) / (sx * sx) - (dy * dy) / (sy * sy));
  /** Smoothly through a table of [key, ...values]: no flat spot at any key, or the cloth comes out in steps. */
  function table(rows) {
    const ys = rows.map(r => r[0]), n = rows.length;
    const slope = (i, k) => { const a = rows[Math.max(0, i - 1)], b = rows[Math.min(n - 1, i + 1)]; return (b[k] - a[k]) / ((b[0] - a[0]) || 1); };
    return y => {
      let i = 0; while (i < n - 2 && y > ys[i + 1]) i++;
      const a = rows[i], b = rows[i + 1], h = ys[i + 1] - ys[i], t = Math.max(0, Math.min(1, (y - ys[i]) / h)), t2 = t * t, t3 = t2 * t, out = [];
      for (let k = 1; k < a.length; k++) out.push((2 * t3 - 3 * t2 + 1) * a[k] + (t3 - 2 * t2 + t) * h * slope(i, k) + (-2 * t3 + 3 * t2) * b[k] + (t3 - t2) * h * slope(i + 1, k));
      return out;
    };
  }
  /** A fold: round on top, its valley tight but never a crease the grid would saw at. */
  const fold = (x, sharp = 0.31) => Math.min(1, Math.pow(Math.sin(x) * Math.sin(x) + 0.014, sharp));
  /** A grid of points into a surface, with shading baked into the folds. `at(u, v)` returns [x, y, z, shade]; closed joins u's ends. */
  function surface(nu, nv, at, closed) {
    const n = (closed ? nu : nu + 1) * (nv + 1), pos = new Float32Array(n * 3), col = new Float32Array(n * 3), idx = [];
    let k = 0;
    for (let j = 0; j <= nv; j++) for (let i = 0; i < (closed ? nu : nu + 1); i++) {
      const p = at(i / nu, j / nv); pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
      const s = p[3] == null ? 1 : p[3]; col[k * 3] = s; col[k * 3 + 1] = s; col[k * 3 + 2] = s * 0.985 + 0.015; k++;
    }
    const W = closed ? nu : nu + 1, id = (i, j) => (closed ? i % nu : i) + j * W;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = id(i, j), b = id(i + 1, j), c = id(i, j + 1), d = id(i + 1, j + 1); idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(n > 65535 ? new THREE.BufferAttribute(new Uint32Array(idx), 1) : new THREE.BufferAttribute(new Uint16Array(idx), 1));
    g.computeVertexNormals();
    return g;
  }

  // the body under the robe: half width, half depth, how far forward
  const BODY = table([
    [0, 0.355, 0.295, 0.025], [0.14, 0.33, 0.27, 0.022], [0.4, 0.285, 0.225, 0.016], [0.7, 0.238, 0.178, 0.006], [0.92, 0.214, 0.152, 0], [1.03, 0.186, 0.128, 0.002],
    [1.085, 0.158, 0.11, 0.006], [1.2, 0.172, 0.118, 0.012], [1.32, 0.194, 0.126, 0.02], [1.41, 0.214, 0.122, 0.018], [1.47, 0.205, 0.105, 0.008], [1.52, 0.135, 0.088, 0.006], [1.565, 0.068, 0.058, 0.006], [1.62, 0.046, 0.046, 0.012], [1.66, 0.044, 0.044, 0.016],
  ]);
  const radial = (a, b, th, n = 2.3) => { const s = Math.abs(Math.sin(th)) / a, c = Math.abs(Math.cos(th)) / b; return 1 / Math.pow(Math.pow(s, n) + Math.pow(c, n), 1 / n); };

  function robe(nu, nv) {
    return surface(nu, nv, (u, v) => {
      const y = 1.66 * v, th = u * Math.PI * 2 - Math.PI, [a, b, zc] = BODY(y);
      let r = radial(a, b, th), shade = 1;
      // the skirt falls in deep pipes from the belt to the hem, wandering a little as cloth does
      const below = smooth(1.08, 0.1, y), wander = 0.26 * Math.sin(y * 2.7 + th * 2) + 0.08 * Math.sin(y * 6.1 + th * 3);
      const pipes = fold((th + wander) * 5.5), knee = g2(th - 0.34, 0.55, y - 0.56, 0.32);
      const depth = (0.008 + 0.092 * Math.pow(below, 1.1)) * (1 - knee * 0.3);
      r += depth * (pipes - 0.72) + 0.02 * knee;
      r += 0.0036 * below * Math.sin((th + wander * 0.5) * 17 + y * 4);
      shade -= 0.74 * Math.pow(1 - pipes, 1.5) * Math.min(1, depth / 0.03);
      // the bodice is gathered at the belt and opens towards the shoulders
      const bodice = smooth(1.08, 1.13, y) * smooth(1.46, 1.3, y), gather = fold((th + 0.12 * Math.sin(y * 9)) * 9);
      r += bodice * 0.009 * (gather - 0.66) * smooth(1.42, 1.1, y);
      shade -= bodice * 0.14 * Math.pow(1 - gather, 2);
      // the belt: a rounded band, with its shadow on either side
      const belt = g2(y - 1.085, 0.021, 0, 1); r += 0.012 * belt; shade -= 0.3 * (g2(y - 1.057, 0.008, 0, 1) + g2(y - 1.113, 0.008, 0, 1));
      // the neckline
      const collar = g2(y - 1.545, 0.009, 0, 1) * smooth(1.6, 0.5, Math.abs(th)); r += 0.005 * collar; shade -= 0.14 * g2(y - 1.56, 0.006, 0, 1) * smooth(1.6, 0.5, Math.abs(th));
      // the hem lifts and falls with the pipes
      const hem = smooth(0.05, 0, y) * 0.012 * (pipes - 0.6);
      return [r * Math.sin(th), y + hem, r * Math.cos(th) + zc, shade];
    }, true);
  }

  // the outer shape of the veil and mantle
  const SHAWL = table([
    [0.04, 0.4, 0.335, 0], [0.5, 0.345, 0.272, 0], [0.9, 0.3, 0.222, 0.002], [1.15, 0.288, 0.198, 0], [1.3, 0.285, 0.182, 0], [1.44, 0.27, 0.166, -0.004], [1.5, 0.234, 0.15, -0.006], [1.55, 0.158, 0.134, -0.008],
    [1.6, 0.112, 0.116, -0.008], [1.65, 0.1, 0.118, -0.006], [1.725, 0.1, 0.122, -0.004], [1.8, 0.1, 0.116, -0.004], [1.845, 0.08, 0.09, -0.004], [1.872, 0.04, 0.046, -0.004], [1.884, 0.004, 0.004, -0.004],
  ]);
  // how far round from the front the cloth's edge comes, height by height
  const OPEN = table([[0.04, 1.36], [0.6, 1.24], [1, 1.18], [1.2, 1.3], [1.36, 1.16], [1.5, 0.98], [1.6, 0.9], [1.66, 0.86], [1.74, 0.74], [1.8, 0.52], [1.85, 0.26], [1.884, 0.1]]);
  function mantle(nu, nv) {
    const RIM = 0.035;
    return surface(nu, nv, (u, v) => {
      const y = 1.884 - (1.884 - 0.04) * v, [a, b, zc] = SHAWL(y), [open] = OPEN(y);
      // past either end of the sheet the cloth turns under on itself, so the edge has a thickness
      const uu = Math.max(0, Math.min(1, (u - RIM) / (1 - 2 * RIM))), under = u < RIM ? 1 - u / RIM : u > 1 - RIM ? (u - (1 - RIM)) / RIM : 0;
      const edge = Math.min(uu, 1 - uu);
      const wob = 0.04 * Math.sin(y * 5 + (uu > 0.5 ? 1.4 : 0)) * smooth(1.45, 1, y);
      const th = open + wob + uu * (Math.PI * 2 - 2 * (open + wob));
      const tt = th > Math.PI ? th - 2 * Math.PI : th;
      let r = radial(a, b, tt, 2.1), shade = 1;
      const low = smooth(1.5, 0.3, y), turn = 0.12 * Math.sin(y * 3.1 + th * 2) + 0.04 * Math.sin(y * 7 + th * 3);
      const pipes = fold((th + turn) * 4.5), depth = 0.005 + 0.074 * low;
      r += depth * (pipes - 0.7);
      shade -= 0.66 * Math.pow(1 - pipes, 1.5) * Math.min(1, depth / 0.026);
      // a few long soft folds down from the crown
      const head = smooth(1.55, 1.68, y), long = fold(th * 3.5 + 0.5, 0.5); r += head * 0.003 * (long - 0.7); shade -= head * 0.08 * Math.pow(1 - long, 2);
      // the elbows push it out on each side
      r += 0.042 * g2(Math.abs(tt) - 1.55, 0.5, y - 1.24, 0.2);
      // the rolled edge
      const roll = smooth(0.09, 0, edge); r += 0.011 * roll * Math.sin(Math.min(1, edge / 0.09) * Math.PI) + 0.005 * roll;
      shade -= 0.14 * g2(edge - 0.1, 0.02, 0, 1);
      r -= under * 0.016;
      return [r * Math.sin(th), y, r * Math.cos(th) + zc, shade * (1 - 0.15 * under)];
    }, false);
  }

  /** Her face: a skull and jaw, then every feature pressed into it. Measures are in metres, at about life size. */
  function head(nu, nv) {
    return surface(nu, nv, (u, v) => {
      const ph = u * Math.PI * 2 - Math.PI, ps = v * Math.PI, sp = Math.sin(ps), cp = Math.cos(ps);
      const Y = cp * 0.114;
      // the lower face stays full down to a rounded chin instead of running to a point
      const lowHalf = smooth(0.01, -0.06, Y), wide = Math.pow(sp, 1 - 0.34 * lowHalf);
      const ux = wide * Math.sin(ph), uz = wide * Math.cos(ph);
      const jaw = smooth(0.0, -0.105, Y);
      const rx = 0.0735 * (1 - 0.3 * jaw), rzF = 0.095 * (1 - 0.13 * jaw), rzB = 0.092 * (1 - 0.42 * jaw);
      const X = ux * rx; let Z = uz * (uz > 0 ? rzF : rzB);
      // the front of the face is flatter than the skull behind it
      const mask = smooth(0.1, 0.62, uz), Ax = Math.abs(X);
      Z -= mask * 0.013 * smooth(0.004, 0.058, Ax) * smooth(-0.112, -0.02, Y);
      let d = 0, dark = 0;
      // the eyes, looking down: a socket, the ball in it, an upper lid and a lower one making the almond between them
      const ex = Ax - 0.0318, ey = Y - 0.0115, arc = (ex / 0.0135) * (ex / 0.0135) * 0.0042;
      const sock = g2(ex, 0.0192, ey + 0.0005, 0.0128); d -= 0.0104 * sock; dark += 0.16 * sock;
      d += 0.0072 * g2(ex, 0.0112, ey + 0.001, 0.0084);
      const wing = Math.abs(ex) < 0.0135 ? 1 : Math.exp(-((Math.abs(ex) - 0.0135) ** 2) / 0.00001);
      d += 0.0031 * wing * g2(ey - 0.0064 + arc * 0.9, 0.0036, 0, 1);                              // upper lid, half over the eye
      const top = wing * g2(ey - 0.0024 + arc * 0.85, 0.0011, 0, 1); d -= 0.0021 * top; dark += 0.62 * top;       // the shadow under it
      const fold2 = wing * g2(ey - 0.0112 + arc * 0.8, 0.001, 0, 1); d -= 0.001 * fold2; dark += 0.16 * fold2;
      const bot = wing * g2(ey + 0.0058 - arc * 0.62, 0.00085, 0, 1); d -= 0.0009 * bot; dark += 0.28 * bot;
      d += 0.0013 * wing * g2(ey + 0.0074 - arc * 0.62, 0.0017, 0, 1);                            // lower lid
      // the iris, just cut, under the lid
      dark += 0.24 * g2(ex + 0.0004, 0.0044, ey + 0.0016, 0.003);
      // the brow runs out of the bridge of the nose
      const browY = Y - 0.0345 + (Ax - 0.03) * (Ax - 0.03) * 2.2, brow = g2(Ax - 0.034, 0.024, browY, 0.0062); d += 0.0032 * brow;
      // the nose: straight and narrow, a soft tip, small wings, a shadow beneath
      const t = Math.max(0, Math.min(1, (0.024 - Y) / 0.058)), nw = 0.0066 + 0.0048 * t;
      const bridge = Math.exp(-(X * X) / (nw * nw)) * smooth(-0.0418, -0.0342, Y) * smooth(0.04, 0.02, Y);
      d += bridge * (0.0052 + 0.0146 * Math.pow(t, 1.3));
      d += 0.0046 * g2(Ax - 0.0108, 0.0044, Y + 0.0345, 0.0046);
      const nostril = g2(Ax - 0.0056, 0.0024, Y + 0.0402, 0.0016); d -= 0.0028 * nostril; dark += 0.55 * nostril;
      dark += 0.22 * g2(X, 0.012, Y + 0.0434, 0.0018);
      // the mouth, closed, a little smaller than a broad gaussian would make it
      d -= 0.0012 * g2(X, 0.0031, Y + 0.048, 0.0052);
      d += 0.0042 * g2(X, 0.0148, Y + 0.0562, 0.0034) + 0.0011 * g2(Ax - 0.0048, 0.0048, Y + 0.0542, 0.0016);
      d += 0.0054 * g2(X, 0.0122, Y + 0.0664, 0.0046);
      const line = g2(X, 0.0148, Y + 0.0602 - X * X * 1.3, 0.00095); d -= 0.0028 * line; dark += 0.58 * line;
      dark += 0.09 * g2(Ax - 0.0158, 0.0016, Y + 0.0600, 0.0024);
      const lip = g2(X, 0.0108, Y + 0.0742, 0.0028); d -= 0.0024 * lip; dark += 0.16 * lip;
      // chin and cheek
      d += 0.0052 * g2(X, 0.0165, Y + 0.0885, 0.0092);
      d += 0.0032 * g2(Ax - 0.0405, 0.02, Y + 0.0205, 0.021);
      Z += mask * d;
      // only a little hair shows, parted, under the veil
      const hair = smooth(0.078, 0.094, Y + Ax * 0.28) * smooth(0.0015, 0.005, Ax);
      Z += mask * hair * (0.0034 + 0.0009 * Math.sin((Y - Ax * 1.4) * 260));
      dark += mask * 0.3 * g2(Ax, 0.002, Y - 0.095, 0.014);
      return [X, Y, Z, 1 - Math.min(0.66, dark * mask)];
    }, true);
  }

  /** A tube through the given centres, each with a radius; `drop` lets a sleeve hang below its arm. */
  function tube(path, nu, nv, shapeAt) {
    const curve = new THREE.CatmullRomCurve3(path.map(p => new THREE.Vector3(p[0], p[1], p[2])));
    const prev = new THREE.Vector3(1, 0, 0);
    const frames = [];
    for (let j = 0; j <= nv; j++) {
      const t = j / nv, T = curve.getTangentAt(t), N = prev.clone().sub(T.clone().multiplyScalar(prev.dot(T))).normalize(), B = T.clone().cross(N);
      prev.copy(N); frames.push({ C: curve.getPointAt(t), N: N.clone(), B: B.clone(), t });
    }
    return surface(nu, nv, (u, v) => {
      const j = Math.round(v * nv), f = frames[j], a = u * Math.PI * 2, [ox, oy, s] = shapeAt(f.t, a, f);
      const p = f.C.clone().addScaledVector(f.N, Math.cos(a) * ox).addScaledVector(f.B, Math.sin(a) * oy);
      if (s && s.y) p.y += s.y;
      return [p.x, p.y, p.z, s && s.shade != null ? s.shade : 1];
    }, true);
  }

  function sleeve(side, nu, nv) {
    const path = [[side * 0.2, 1.45, 0], [side * 0.232, 1.3, 0.028], [side * 0.226, 1.17, 0.085], [side * 0.14, 1.215, 0.165], [side * 0.058, 1.272, 0.218]];
    return tube(path, nu, nv, (t, a, f) => {
      const r = 0.058 + 0.013 * smooth(0.55, 1, t), wr = 0.0028 * Math.sin(a * 5 + t * 9) + 0.0018 * Math.sin(a * 9 - t * 15);
      // beyond the elbow it falls a little from the forearm in a soft point
      const up = f.N.y * Math.cos(a) + f.B.y * Math.sin(a), down = Math.max(0, -up);
      const hang = smooth(0.5, 0.98, t) * down * down * down * 0.085;
      const pleat = fold(a * 3.5 + t * 6);
      // the mouth of the sleeve turns in on itself, for a thickness
      const lip = smooth(0.965, 1, t);
      return [(r + wr) * (1 - lip * 0.2), (r + wr) * (1 - lip * 0.2), { y: -hang, shade: (1 - 0.22 * Math.pow(1 - pleat, 3) * smooth(0.4, 0.9, t) - 0.16 * g2(t - 0.5, 0.05, 0, 1)) * (1 - 0.4 * lip) }];
    });
  }

  /** The two hands, palms together, fingers up: each finger one smooth length, thin at its joints, rounded at its tip. */
  function hands(group, marble, q) {
    const tilt = 0.5, d = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt)), w = new THREE.Vector3(0, -Math.sin(tilt), Math.cos(tilt));
    const base = new THREE.Vector3(0, 1.296, 0.232);
    const nu = q > 0.6 ? 14 : 8, nv = q > 0.6 ? 26 : 12;
    const put = geo => { const m = new THREE.Mesh(geo, marble); m.castShadow = true; group.add(m); return m; };
    for (const s of [-1, 1]) {
      const side = new THREE.Vector3(s, 0, 0);
      // palm, a flattened pad, fuller at the heel of the hand
      const pad = surface(q > 0.6 ? 32 : 16, q > 0.6 ? 24 : 12, (u, v) => {
        const a = u * Math.PI * 2, b = v * Math.PI, L = Math.cos(b), rad = Math.pow(Math.sin(b), 0.55);
        const P = base.clone().addScaledVector(d, 0.03 + L * 0.036).addScaledVector(w, Math.cos(a) * rad * 0.0295).addScaledVector(side, 0.0098 + Math.sin(a) * rad * (0.0098 + 0.002 * (1 - L)));
        return [P.x, P.y, P.z, 1];
      }, true);
      put(pad);
      // the wrist, back into the sleeve
      const wr = base.clone().addScaledVector(d, -0.004).addScaledVector(side, 0.011), el = new THREE.Vector3(s * 0.08, 1.262, 0.2);
      put(tube([[el.x, el.y, el.z], [(el.x + wr.x) / 2, (el.y + wr.y) / 2 + 0.002, (el.z + wr.z) / 2], [wr.x, wr.y, wr.z]], nu, 10, t => { const r = 0.024 - 0.0085 * t; return [r, r, { shade: 1 }]; }));
      // four fingers together
      [[-0.0205, 0.041], [-0.0068, 0.05], [0.0068, 0.047], [0.0205, 0.037]].forEach(([off, len]) => {
        const from = base.clone().addScaledVector(d, 0.056).addScaledVector(w, off).addScaledVector(side, 0.0074);
        const pts = [0, 0.33, 0.66, 1].map(k => from.clone().addScaledVector(d, len * k).addScaledVector(w, off * 0.09 * k).addScaledVector(side, -0.0018 * k));
        put(tube(pts.map(p => [p.x, p.y, p.z]), nu, nv, t => {
          const taper = 0.0069 - 0.0016 * t, joint = 1 - 0.05 * (g2(t - 0.46, 0.05, 0, 1) + g2(t - 0.76, 0.05, 0, 1)) * -1, tip = t > 0.92 ? Math.sqrt(Math.max(0.0001, 1 - ((t - 0.92) / 0.08) ** 2)) : 1;
          const r = taper * joint * tip;
          return [r, r, { shade: 1 - 0.1 * (g2(t - 0.46, 0.012, 0, 1) + g2(t - 0.76, 0.012, 0, 1)) }];
        }));
      });
      // the thumb lies along the side of the palm
      { const a = base.clone().addScaledVector(d, 0.002).addScaledVector(w, 0.03).addScaledVector(side, 0.0135), b = a.clone().addScaledVector(d, 0.03).addScaledVector(w, 0.008).addScaledVector(side, -0.002), c = b.clone().addScaledVector(d, 0.027).addScaledVector(w, 0.002).addScaledVector(side, -0.004);
        put(tube([[a.x, a.y, a.z], [b.x, b.y, b.z], [c.x, c.y, c.z]], nu, nv, t => { const tip = t > 0.9 ? Math.sqrt(Math.max(0.0001, 1 - ((t - 0.9) / 0.1) ** 2)) : 1, r = (0.0102 - 0.002 * t) * tip; return [r, r, { shade: 1 }]; })); }
    }
  }

  /** One finished figure at a given fineness. */
  function figure(q) {
    const g = new THREE.Group();
    const marble = new THREE.MeshStandardMaterial({ color: 0xf1ece0, vertexColors: true, roughness: 0.4 });
    const plain = marble;
    const sheet = marble.clone(); sheet.side = THREE.DoubleSide;
    const add = (geo, mat = marble, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
    const stone = new THREE.MeshStandardMaterial({ color: 0x9c9689, roughness: 0.85 });
    // a moulded pedestal, turned
    const prof = [[0.84, 0], [0.84, 0.05], [0.8, 0.075], [0.8, 0.17], [0.76, 0.19], [0.72, 0.205], [0.72, 0.26], [0.66, 0.29], [0.62, 0.31], [0.585, 0.35], [0.56, 0.385], [0.5, 0.4], [0.46, 0.42], [0.435, 0.46], [0.42, 0.51], [0.41, 0.84], [0.42, 0.86], [0.455, 0.885], [0.475, 0.915], [0.5, 0.93], [0.52, 0.945], [0.52, 1.0], [0.5, 1.02], [0, 1.02]];
    const pts = []; prof.forEach(([r, y]) => pts.push(new THREE.Vector2(r, y)));
    const ped = new THREE.LatheGeometry(pts, Math.round(40 + 88 * q)); ped.computeVertexNormals();
    add(ped, stone);
    const base = 1.02;
    const nb = Math.round(160 + 340 * q), nh = Math.round(90 + 230 * q);
    add(robe(nb, nh), marble, 0, base);
    add(mantle(Math.round(110 + 280 * q), Math.round(80 + 210 * q)), sheet, 0, base);
    const hd = add(head(Math.round(56 + 224 * q), Math.round(48 + 232 * q)), marble, 0, base + 1.722, 0.024);
    hd.rotation.x = 0.13; hd.rotation.z = 0.035;
    const ns = sheet;
    for (const s of [-1, 1]) add(sleeve(s, Math.round(30 + 54 * q), Math.round(28 + 50 * q)), ns, 0, base);
    // hands and feet are close work; the plain version gets by with less
    const hg = new THREE.Group(); hg.position.y = base; g.add(hg); hands(hg, plain, q);
    // the cord of the belt, knotted and hanging, and her feet under the hem
    const cord = tube([[0, 1.08, 0.122], [0.012, 0.98, 0.15], [-0.006, 0.84, 0.168], [0.005, 0.72, 0.19]], 10, Math.round(14 + 30 * q), t => { const r = 0.0085 - 0.002 * t; return [r, r, { shade: 1 }]; });
    add(cord, plain, 0, base);
    add(new THREE.TorusKnotGeometry(0.014, 0.0065, Math.round(30 + 40 * q), 8), new THREE.MeshStandardMaterial({ color: 0xf1ece0, roughness: 0.4 }), 0, base + 1.08, 0.125);
    for (const s of [-1, 1]) {
      const foot = add(surface(28, 18, (u, v) => {
        const a = u * Math.PI * 2, b = v * Math.PI, Fx = Math.sin(b) * Math.sin(a), Fy = Math.cos(b), Fz = Math.sin(b) * Math.cos(a);
        const toe = smooth(0.35, 0.95, Fz), bumps = 1 + 0.07 * toe * Math.abs(Math.sin(Fx * 9));
        return [Fx * 0.046 * (1 - 0.1 * toe) * bumps, Math.max(0, Fy) * 0.03 * (1 - 0.5 * toe), Fz * 0.078 * bumps, 1 - 0.3 * toe * Math.pow(1 - Math.abs(Math.sin(Fx * 9)), 3)];
      }, true), plain, s * 0.095, base + 0.002, 0.285);
      foot.rotation.y = s * 0.13;
    }
    return g;
  }

  function build(parent, x, z) {
    const holder = new THREE.Group(); holder.position.set(x, 0, z); parent.add(holder);
    const far = figure(0.05); holder.add(far);
    let near = null;
    return {
      holder, far,
      update(camera, allowed) {
        const d = Math.hypot(camera.position.x - x, camera.position.z - z);
        if (!near && allowed && d < 40) { near = figure(Math.min(1, Math.max(0.25, Q.cards))); near.visible = false; holder.add(near); }
        if (near) { near.visible = d < 26; far.visible = !near.visible; }
      },
      get near() { return near; },
    };
  }
  root.Statue = { build, figure };
})(typeof self !== 'undefined' ? self : this);
