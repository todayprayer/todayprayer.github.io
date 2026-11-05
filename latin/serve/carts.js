/*
 * Golf carts in the church's lot: get in, sit down, and drive them anywhere the road goes.
 * Forward is +z, the driver sits on the left, which is +x when you face forward.
 */
(function (root) {
  'use strict';
  const THREE = root.THREE, Plan = root.Plan;
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const LEN = 2.5, WIDE = 1.22, WHEELBASE = 1.66, TRACK = 0.98, WHEEL = 0.215;
  const TOP = 7.5, BACK = 3, ACCEL = 2.6, BRAKE = 6, COAST = 1.5, STEER = 0.56, STEER_RATE = 1.9;
  const SEAT = [0.27, -0.2], SEAT_Y = 0.16;    // the driver's place, and how much higher than an ordinary chair

  function profile(points) { const s = new THREE.Shape(); points.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y))); s.closePath(); return s; }
  /** A side profile, given as (z, y), pushed sideways to the full width with its edges softened. */
  function hull(points, width, bevel = 0.03, x = 0) {
    const g = new THREE.ExtrudeGeometry(profile(points), { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, steps: 1, curveSegments: 6 });
    g.rotateY(-Math.PI / 2); g.translate(x + width / 2 - bevel, 0, 0); g.computeVertexNormals();
    return g;
  }
  function pipe(ax, ay, az, bx, by, bz, r, seg = 10) {
    const L = Math.hypot(bx - ax, by - ay, bz - az), g = new THREE.CylinderGeometry(r, r, L, seg);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(bx - ax, by - ay, bz - az).normalize()));
    g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    return g;
  }
  function wheel(mats) {
    const g = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL, WHEEL, 0.17, 26), mats.tire); tire.rotation.z = Math.PI / 2; g.add(tire);
    const side = new THREE.Mesh(new THREE.TorusGeometry(WHEEL - 0.035, 0.035, 8, 26), mats.tire); side.rotation.y = Math.PI / 2; side.position.x = 0.075; g.add(side);
    const side2 = side.clone(); side2.position.x = -0.075; g.add(side2);
    for (const s of [-1, 1]) {
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.125, 0.02, 20), mats.hub); hub.rotation.z = Math.PI / 2; hub.position.x = s * 0.086; g.add(hub);
      for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5, b = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.07, 0.022), mats.dark); b.position.set(s * 0.098, Math.cos(a) * 0.065, Math.sin(a) * 0.065); b.rotation.x = -a; g.add(b); }
    }
    return g;
  }
  function makeCart(paintHex, seatHex) {
    const g = new THREE.Group();
    const mats = {
      paint: new THREE.MeshStandardMaterial({ color: paintHex, roughness: 0.28, metalness: 0.15 }), frame: new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.45, metalness: 0.6 }),
      seat: new THREE.MeshStandardMaterial({ color: seatHex, roughness: 0.55 }), piping: new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.6 }), tire: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 }),
      hub: new THREE.MeshStandardMaterial({ color: 0xc8cacc, roughness: 0.3, metalness: 0.8 }), dark: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.65 }), floor: new THREE.MeshStandardMaterial({ color: 0x25272a, roughness: 0.95 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xc8dce4, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }),
      lamp: new THREE.MeshStandardMaterial({ color: 0xf4f0d8, roughness: 0.12, emissive: 0xfff6c8, emissiveIntensity: 0.25 }), tail: new THREE.MeshStandardMaterial({ color: 0xa81a14, roughness: 0.25, emissive: 0x500805, emissiveIntensity: 0.5 }),
      roof: new THREE.MeshStandardMaterial({ color: paintHex, roughness: 0.4, side: THREE.DoubleSide }),
    };
    const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
    // the body: a low nose, a cowl rising to the dash, the footwell, the deck under the seat, and a rounded tail
    add(hull([[-1.2, 0.24], [-1.24, 0.34], [-1.22, 0.5], [-1.14, 0.62], [-0.96, 0.66], [-0.54, 0.62], [-0.5, 0.3], [-0.5, 0.2], [-1.12, 0.2]], WIDE), mats.paint);
    add(hull([[0.58, 0.2], [0.58, 0.32], [0.62, 0.7], [0.72, 0.92], [0.86, 0.9], [1.06, 0.74], [1.2, 0.56], [1.25, 0.42], [1.22, 0.26], [1.1, 0.2]], WIDE), mats.paint);
    add(hull([[-0.55, 0.18], [-0.55, 0.28], [0.62, 0.28], [0.62, 0.18]], WIDE - 0.02, 0.01), mats.floor);
    // the rocker along each side and the bumpers
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.05, 0.1, 1.18), mats.frame, s * (WIDE / 2 - 0.02), 0.24, 0.03);
    add(new THREE.BoxGeometry(WIDE + 0.04, 0.1, 0.09), mats.dark, 0, 0.32, 1.27);
    add(new THREE.BoxGeometry(WIDE + 0.04, 0.1, 0.09), mats.dark, 0, 0.32, -1.27);
    // the lights
    for (const s of [-1, 1]) {
      const head = add(new THREE.SphereGeometry(0.068, 18, 12), mats.lamp, s * 0.36, 0.565, 1.238); head.scale.z = 0.5;
      const ring = add(new THREE.TorusGeometry(0.07, 0.012, 8, 20), mats.hub, s * 0.36, 0.565, 1.244);
      add(new THREE.BoxGeometry(0.15, 0.08, 0.02), mats.tail, s * 0.42, 0.56, -1.235);
    }
    // the seat: two cushions with piping, a back on each, and a hip rail
    for (const s of [-1, 1]) {
      const cushion = add(hull([[-0.42, 0.6], [-0.42, 0.68], [-0.38, 0.72], [0.04, 0.73], [0.1, 0.69], [0.1, 0.6]], 0.5, 0.035, s * 0.27), mats.seat);
      cushion.position.y = -0.02;
      const back = add(hull([[-0.56, 0.74], [-0.58, 1.14], [-0.53, 1.2], [-0.47, 1.18], [-0.45, 0.76]], 0.5, 0.035, s * 0.27), mats.seat);
      back.position.y = -0.02;
      add(new THREE.BoxGeometry(0.44, 0.012, 0.01), mats.piping, s * 0.27, 0.95, -0.452);
      add(pipe(s * 0.6, 0.72, -0.05, s * 0.6, 0.72, -0.4, 0.016), mats.frame);
      add(pipe(s * 0.6, 0.62, -0.4, s * 0.6, 0.72, -0.4, 0.016), mats.frame);
    }
    // the roof on its four struts, and the windscreen
    const roof = new THREE.Mesh(hull([[-0.92, 1.76], [-0.92, 1.8], [-0.82, 1.83], [0.62, 1.83], [0.74, 1.8], [0.74, 1.76]], WIDE - 0.02, 0.025), mats.roof); roof.castShadow = true; g.add(roof);
    for (const s of [-1, 1]) {
      add(pipe(s * 0.52, 0.86, 0.68, s * 0.52, 1.77, 0.52, 0.021), mats.frame);
      add(pipe(s * 0.52, 0.62, -0.8, s * 0.52, 1.77, -0.72, 0.021), mats.frame);
    }
    { const sc = new THREE.Mesh(new THREE.BufferGeometry(), mats.glass); const y0 = 0.94, y1 = 1.73, z0 = 0.66, z1 = 0.53, w = 0.5;
      sc.geometry.setAttribute('position', new THREE.Float32BufferAttribute([-w, y0, z0, w, y0, z0, w, y1, z1, -w, y0, z0, w, y1, z1, -w, y1, z1], 3)); sc.geometry.computeVertexNormals(); g.add(sc); }
    // the dash, the column and the wheel, which turns
    add(new THREE.BoxGeometry(WIDE - 0.14, 0.05, 0.16), mats.dark, 0, 0.9, 0.67);
    for (const k of [-0.1, 0.06]) add(new THREE.CylinderGeometry(0.04, 0.035, 0.02, 14), mats.frame, k, 0.925, 0.66);
    add(pipe(SEAT[0], 0.52, 0.68, SEAT[0], 0.96, 0.34, 0.02), mats.frame);
    const steer = new THREE.Group(); steer.position.set(SEAT[0], 0.97, 0.33); steer.rotation.x = -0.95; g.add(steer);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.015, 10, 32), mats.dark); rim.rotation.x = Math.PI / 2; rim.castShadow = true; steer.add(rim);
    for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3 + Math.PI / 2, sp = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.012, 0.022), mats.dark); sp.position.set(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08); sp.rotation.y = -a; steer.add(sp); }
    steer.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), mats.hub));
    // the pedals
    add(new THREE.BoxGeometry(0.1, 0.012, 0.15), mats.frame, 0.2, 0.34, 0.56).rotation.x = -0.6;
    add(new THREE.BoxGeometry(0.08, 0.012, 0.16), mats.hub, 0.36, 0.34, 0.56).rotation.x = -0.6;
    // a bag rack on the back
    add(pipe(-0.42, 0.68, -1.1, -0.42, 1.08, -1.0, 0.016), mats.frame); add(pipe(0.42, 0.68, -1.1, 0.42, 1.08, -1.0, 0.016), mats.frame);
    add(pipe(-0.42, 1.08, -1.0, 0.42, 1.08, -1.0, 0.016), mats.frame);
    add(new THREE.BoxGeometry(0.92, 0.03, 0.34), mats.floor, 0, 0.68, -1.04);
    // the wheels, the front pair on pivots
    const wheels = [], front = [];
    for (const [s, z, fr] of [[1, WHEELBASE / 2, true], [-1, WHEELBASE / 2, true], [1, -WHEELBASE / 2, false], [-1, -WHEELBASE / 2, false]]) {
      const pivot = new THREE.Group(); pivot.position.set(s * TRACK / 2, WHEEL, z); g.add(pivot);
      const w = wheel(mats); pivot.add(w); wheels.push(w); if (fr) front.push(pivot);
      w.traverse(o => { if (o.isMesh) o.castShadow = true; });
    }
    for (const z of [WHEELBASE / 2, -WHEELBASE / 2]) add(pipe(-TRACK / 2, WHEEL, z, TRACK / 2, WHEEL, z, 0.025, 8), mats.frame);
    return { group: g, wheels, front, steer, rim };
  }

  function build(parent, spots) {
    const PAINTS = [[0xeeebe0, 0x7d6d58], [0x2c4a3a, 0xd8ccb4], [0x223a5c, 0xd0ccc0]];
    const group = new THREE.Group(); parent.add(group);
    const list = spots.map((sp, i) => {
      const c = makeCart(...PAINTS[i % PAINTS.length]); group.add(c.group);
      return Object.assign(c, { x: sp.x, z: sp.z, h: sp.h, home: sp, speed: 0, steerA: 0, roll: 0, pitch: 0, sway: 0, hitT: 0 });
    });
    const place = c => { c.group.position.set(c.x, -0.02, c.z); c.group.rotation.set(c.pitch, c.h, c.sway, 'YXZ'); };
    list.forEach(place);
    const world = (c, lx, lz) => { const s = Math.sin(c.h), k = Math.cos(c.h); return [c.x + lx * k + lz * s, c.z - lx * s + lz * k]; };
    const inside = (c, x, z, rad) => { const dx = x - c.x, dz = z - c.z, s = Math.sin(c.h), k = Math.cos(c.h), along = dx * s + dz * k, side = dx * k - dz * s; return Math.abs(along) < LEN / 2 + rad && Math.abs(side) < WIDE / 2 + rad; };
    const API = {
      group, list, driving: null, LEN, WIDE, TOP, BACK,
      /** Is a walker's way blocked by a cart? The one you are driving does not count. */
      solidAt(x, z, rad) { for (const c of list) if (c !== this.driving && inside(c, x, z, rad)) return true; return false; },
      nearest(x, z, within) { let b = null, bd = within; for (const c of list) { const q = Math.hypot(x - c.x, z - c.z); if (q < bd) { bd = q; b = c; } } return b; },
      /** Where someone getting out stands: your own side if it is free, then the other, then behind. */
      getOutAt(c, free) { for (const [lx, lz] of [[WIDE / 2 + 0.42, SEAT[1]], [-(WIDE / 2 + 0.42), SEAT[1]], [0, -(LEN / 2 + 0.42)], [0, LEN / 2 + 0.42]]) { const [x, z] = world(c, lx, lz); if (free(x, z)) return [x, z]; } return null; },
      seat(c) { return world(c, SEAT[0], SEAT[1]); },
      seatLift: SEAT_Y,
      /** The rim of the wheel, in the world, where each hand holds it. */
      grips(c) {
        c.group.updateMatrixWorld();
        const a = c.steerA * 1.6, p = side => c.steer.localToWorld(new THREE.Vector3(Math.cos(a + (side > 0 ? 0 : Math.PI)) * 0.16, 0.02, Math.sin(a + (side > 0 ? 0 : Math.PI)) * 0.16));
        return { L: p(1), R: p(-1) };
      },
      /** One step of the road. keys: gas, brake, way (+1 left, -1 right). `open(x, z)` says whether the ground there is free. Returns how hard you hit anything. */
      drive(c, dt, keys, open) {
        let hit = 0;
        const goingBack = c.speed < -0.05, goingOn = c.speed > 0.05;
        if (keys.gas) c.speed += (goingBack ? BRAKE : ACCEL * (1 - Math.max(0, c.speed) / TOP * 0.5)) * dt;
        else if (keys.brake) c.speed -= (goingOn ? BRAKE : ACCEL * 0.7) * dt;
        else { const d = COAST * dt; c.speed = Math.abs(c.speed) < d ? 0 : c.speed - Math.sign(c.speed) * d; }
        c.speed = Math.max(-BACK, Math.min(TOP, c.speed));
        // the wheel comes back by itself, and locks less at speed
        const room = STEER * (1 - Math.min(1, Math.abs(c.speed) / TOP) * 0.45), goal = keys.way * room;
        c.steerA += Math.max(-STEER_RATE * dt, Math.min(STEER_RATE * dt, goal - c.steerA)) * (keys.way ? 1 : 1.5);
        const dh = c.speed * Math.tan(c.steerA) / WHEELBASE * dt;
        const nh = wrap(c.h + dh), nx = c.x + Math.sin(nh) * c.speed * dt, nz = c.z + Math.cos(nh) * c.speed * dt;
        const clear = (x, z, h) => {
          const s = Math.sin(h), k = Math.cos(h);
          for (const [lx, lz] of [[WIDE / 2, LEN / 2], [-WIDE / 2, LEN / 2], [WIDE / 2, -LEN / 2], [-WIDE / 2, -LEN / 2], [0, LEN / 2 + 0.02], [0, -LEN / 2 - 0.02], [WIDE / 2, 0], [-WIDE / 2, 0]]) if (!open(x + lx * k + lz * s, z - lx * s + lz * k, c)) return false;
          return true;
        };
        if (clear(nx, nz, nh)) { c.x = nx; c.z = nz; c.h = nh; c.hitT = 0; }
        else {
          // a glancing touch slides you along; head-on you stop and rebound a little
          const slide = clear(nx, c.z, nh) ? [nx, c.z] : clear(c.x, nz, nh) ? [c.x, nz] : null;
          if (slide && Math.abs(c.speed) < 4) { c.x = slide[0]; c.z = slide[1]; c.h = nh; c.speed *= 0.9; }
          else { if (clear(c.x, c.z, nh)) c.h = nh; if (Math.abs(c.speed) > 0.8) hit = Math.abs(c.speed); c.speed = -c.speed * 0.22; }
        }
        // the body leans into what it is doing
        const lean = goal => goal;
        c.pitch += (lean(keys.gas && c.speed >= 0 ? -0.012 : keys.brake && c.speed > 0.2 ? 0.02 : 0) - c.pitch) * Math.min(1, dt * 5);
        c.sway += (-c.steerA * Math.min(1, Math.abs(c.speed) / TOP) * 0.05 * Math.sign(c.speed || 1) - c.sway) * Math.min(1, dt * 5);
        return hit;
      },
      /** The look of each cart, whether anyone is driving it or not. */
      update(dt) {
        for (const c of list) {
          c.roll += c.speed * dt / WHEEL;
          for (const w of c.wheels) w.rotation.x = c.roll;
          for (const p of c.front) p.rotation.y = c.steerA;
          c.rim.parent.rotation.y = c.steerA * 1.6;
          if (c !== this.driving && Math.abs(c.speed) > 0.01) c.speed = 0;
          place(c);
        }
      },
      reset() { this.driving = null; for (const c of list) { c.x = c.home.x; c.z = c.home.z; c.h = c.home.h; c.speed = 0; c.steerA = 0; c.pitch = 0; c.sway = 0; place(c); } },
    };
    return API;
  }
  root.Carts = { build, makeCart };
})(typeof self !== 'undefined' ? self : this);
