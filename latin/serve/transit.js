/*
 * The vehicles with somewhere particular to be. Buses run the real lines of the San Fernando Valley on their real streets and stop at their real stops;
 * and now and then a police car, a fire engine or a rescue ambulance goes by, lights and siren, on one of the big streets.
 * Paint is matched from public descriptions and photographs from memory: colours and lettering, no agency's actual seal or logo artwork.
 */
(function (root) {
  'use strict';
  const THREE = root.THREE, Bus = root.BusData || [], Wide = root.WideData, Inner = root.SiteData;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  // street names only where a published line description gives them
  const LINE_NAME = { 158: 'Devonshire', 166: 'Nordhoff', 167: 'Plummer', 240: 'Reseda' };

  function glowTexture() { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); }
  const canvasMat = (w, h, draw, extra) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; return new THREE.MeshStandardMaterial(Object.assign({ map: t, roughness: 0.35, metalness: 0.1 }, extra)); };
  function wheelSet(g, zs, track, r, w, tire, hub) {
    const wheels = [], front = [];
    zs.forEach((z, i) => { for (const s of [-1, 1]) {
      const p = new THREE.Group(); p.position.set(s * track / 2, r, z); g.add(p);
      const hold = new THREE.Group(); p.add(hold);
      const T = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 24), tire); T.rotation.z = Math.PI / 2; T.castShadow = true; hold.add(T);
      const H = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.58, w + 0.02, 18), hub); H.rotation.z = Math.PI / 2; hold.add(H);
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, b = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, r * 0.07, r * 0.07), tire); b.position.set(0, Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42); hold.add(b); }
      wheels.push(hold); if (i === 0) front.push(p);
    } });
    return { wheels, front };
  }
  const roundedSide = (w, h, r) => { const s = new THREE.Shape(), x = -w / 2, y = 0; s.moveTo(x + r * 0.5, y); s.lineTo(x + w - r * 0.5, y); s.quadraticCurveTo(x + w, y, x + w, y + r * 0.5); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r * 0.5); s.quadraticCurveTo(x, y, x + r * 0.5, y); return s; };

  /** A forty-foot low-floor city bus, with the natural-gas tanks in a hump on its roof. */
  function makeBus(route, length = 12.2) {
    const g = new THREE.Group(), net = route.net, W = 2.59, H = 2.72, y0 = 0.36, L = length;
    const metro = /Metro/.test(net), cx = /Commuter/.test(net), csun = /CSUN/.test(net);
    const baseCol = metro ? 0xef6a1f : csun ? 0xe6e6e0 : 0xeef0ee;
    const body = new THREE.MeshStandardMaterial({ color: baseCol, roughness: 0.3, metalness: 0.2 });
    const shell = new THREE.ExtrudeGeometry(roundedSide(W, H, 0.34), { depth: L, bevelEnabled: false, curveSegments: 6 }); shell.translate(0, y0, -L / 2);
    const m = new THREE.Mesh(shell, body); m.castShadow = true; g.add(m);
    const tire = new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.95 }), hub = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.8 });
    const ref = route.ref === 'CSUN Campus Tram Route' ? 'CSUN Tram' : route.ref, name = LINE_NAME[route.ref] || '';
    const sideDraw = flip => (c, w, h) => {
      // each side a picture the length of the bus
      const win0 = h * 0.17, win1 = h * 0.53;
      if (metro) { c.fillStyle = '#ef6a1f'; c.fillRect(0, 0, w, h); c.fillStyle = '#c5c8cb'; c.fillRect(0, h * 0.62, w, h * 0.38); c.fillStyle = '#7f8387'; c.fillRect(0, h * 0.61, w, 4); }
      else if (cx) { c.fillStyle = '#f0f2f0'; c.fillRect(0, 0, w, h); c.fillStyle = '#0d5aa7'; c.fillRect(0, h * 0.62, w, h * 0.1); c.fillStyle = '#39a845'; c.fillRect(0, h * 0.72, w, h * 0.08); }
      else { c.fillStyle = '#e9e9e4'; c.fillRect(0, 0, w, h); c.fillStyle = '#b5121b'; c.fillRect(0, h * 0.64, w, h * 0.1); }
      // the windows run the whole way along in one dark band
      const gr = c.createLinearGradient(0, h * win0 / h, 0, win1); gr.addColorStop(0, '#39454e'); gr.addColorStop(1, '#10161b');
      c.fillStyle = gr; c.fillRect(w * 0.015, win0, w * 0.97, win1 - win0);
      c.fillStyle = 'rgba(0,0,0,.55)'; for (let k = 1; k < 8; k++) c.fillRect(w * k / 8, win0, 7, win1 - win0);
      // the doors: on the curb side only
      if (!flip) for (const d of [0.1, 0.5]) { c.fillStyle = '#1a2026'; c.fillRect(w * d, win0 - 6, w * 0.085, h - win0 - 18); c.fillStyle = '#6a6e72'; c.fillRect(w * (d + 0.041), win0 - 6, 5, h - win0 - 18); c.strokeStyle = '#7a7e82'; c.lineWidth = 4; c.strokeRect(w * d, win0 - 6, w * 0.085, h - win0 - 18); }
      // the lettering: the agency's name and the line
      c.fillStyle = metro ? '#ffffff' : cx ? '#0d5aa7' : '#b5121b'; c.textBaseline = 'middle'; c.textAlign = 'center';
      c.font = `700 ${Math.round(h * 0.2)}px Arial, Helvetica, sans-serif`;
      c.fillText(metro ? 'Metro' : cx ? 'Commuter Express' : 'CSUN', w * 0.72, h * 0.81);
      c.font = `700 ${Math.round(h * 0.08)}px Arial, Helvetica, sans-serif`; c.fillStyle = metro ? '#22262a' : '#333';
      c.fillText(metro ? 'Metro Local' : cx ? 'LADOT' : 'Campus Tram', w * 0.33, h * 0.8);
      // the amber line sign above the windows
      c.fillStyle = '#0a0a0a'; c.fillRect(w * 0.26, h * 0.04, w * 0.16, h * 0.11); c.fillStyle = '#ffb000'; c.font = `700 ${Math.round(h * 0.085)}px Courier New, monospace`; c.fillText(ref + (name ? ' ' + name : ''), w * 0.34, h * 0.095, w * 0.15);
    };
    const side = canvasMat(2048, 450, sideDraw(false)), other = canvasMat(2048, 450, sideDraw(true));
    const plate = (mat, x, ry) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.995, H * 0.97), mat); p.position.set(x, y0 + H / 2 - 0.02, 0); p.rotation.y = ry; g.add(p); return p; };
    plate(side, W / 2 + 0.012, Math.PI / 2 * -1 + Math.PI);    // curb side (right of the driver: -x going +z)
    plate(side, -W / 2 - 0.012, -Math.PI / 2);
    // the front: a great curved windscreen and the destination sign, and the back with its engine doors
    const front = canvasMat(512, 512, (c, w, h) => {
      c.fillStyle = metro ? '#ef6a1f' : cx ? '#f0f2f0' : '#e9e9e4'; c.fillRect(0, 0, w, h);
      const gr = c.createLinearGradient(0, h * 0.13, 0, h * 0.68); gr.addColorStop(0, '#5a6a76'); gr.addColorStop(1, '#141a20'); c.fillStyle = gr; c.fillRect(w * 0.04, h * 0.14, w * 0.92, h * 0.54);
      c.fillStyle = '#0a0a0a'; c.fillRect(w * 0.1, h * 0.03, w * 0.8, h * 0.1); c.fillStyle = '#ffb000'; c.font = '700 40px Courier New, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ref + (name ? ' ' + name : ''), w / 2, h * 0.085, w * 0.76);
      if (metro) { c.fillStyle = '#c5c8cb'; c.fillRect(0, h * 0.76, w, h * 0.24); c.fillStyle = '#ffffff'; c.font = '700 44px Arial, sans-serif'; c.fillText('Metro', w / 2, h * 0.72); }
      c.fillStyle = '#111'; c.fillRect(w * 0.02, h * 0.93, w * 0.96, h * 0.07);
      for (const s of [0.13, 0.87]) { c.fillStyle = '#f4f2e6'; c.beginPath(); c.arc(w * s, h * 0.84, 22, 0, 7); c.fill(); }
    });
    const F = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.99, H), front); F.position.set(0, y0 + H / 2, L / 2 + 0.01); g.add(F);
    const backM = canvasMat(256, 256, (c, w, h) => { c.fillStyle = metro ? '#ef6a1f' : '#e9e9e4'; c.fillRect(0, 0, w, h); c.fillStyle = '#20252a'; c.fillRect(w * 0.1, h * 0.14, w * 0.8, h * 0.28); c.fillStyle = '#2a2d30'; c.fillRect(w * 0.08, h * 0.54, w * 0.84, h * 0.3); c.fillStyle = 'rgba(255,255,255,.15)'; for (let k = 0; k < 8; k++) c.fillRect(w * 0.08, h * (0.56 + k * 0.035), w * 0.84, 2); c.fillStyle = '#c0141a'; c.fillRect(w * 0.02, h * 0.56, w * 0.05, h * 0.2); c.fillRect(w * 0.93, h * 0.56, w * 0.05, h * 0.2); });
    const B = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.99, H), backM); B.position.set(0, y0 + H / 2, -L / 2 - 0.01); B.rotation.y = Math.PI; g.add(B);
    // the roof: the fuel hump and the air conditioner
    const roofM = new THREE.MeshStandardMaterial({ color: metro ? 0xd8dadc : 0xe6e6e2, roughness: 0.5 });
    const hump = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedSide(W * 0.84, 0.46, 0.2), { depth: L * 0.56, bevelEnabled: false }), roofM); hump.position.set(0, y0 + H - 0.03, -L * 0.3); hump.castShadow = true; g.add(hump);
    const ac = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.26, 2.2), roofM); ac.position.set(0, y0 + H + 0.12, L * 0.33); g.add(ac);
    // the mirrors out on arms, and the bike rack folded up in front
    const dark = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.5 });
    for (const s of [-1, 1]) { const a = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.03), dark); a.position.set(s * (W / 2 + 0.16), y0 + H - 0.7, L / 2 - 0.2); g.add(a); const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.44, 0.18), dark); b.position.set(s * (W / 2 + 0.34), y0 + H - 0.86, L / 2 - 0.2); g.add(b); }
    const rack = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.86, 0.1), dark); rack.position.set(0, 1.0, L / 2 + 0.12); g.add(rack);
    const ws = wheelSet(g, [L * 0.27, -L * 0.2], W - 0.3, 0.5, 0.34, tire, hub);
    return { group: g, wheels: ws.wheels, front: ws.front, len: L, wr: 0.5, roll: 0, steer: 0, top: csun ? 7 : 11, heavy: true };
  }

  /** A black-and-white: black with white doors, pillars and roof; a light bar; a push bar. */
  function makePolice() {
    const c = root.Traffic.makeCar('suv', 0x0a0a0c), g = c.group;
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.25, metalness: 0.15 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.5 });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.03, 2.3), white); roof.position.set(0, 1.775, -0.55); g.add(roof);
    const door = canvasMat(512, 256, (x, w, h) => { x.fillStyle = '#f2f2f0'; x.fillRect(0, 0, w, h); x.fillStyle = '#0b1838'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '700 62px Arial, sans-serif'; x.fillText('POLICE', w / 2, h * 0.33); x.font = '700 26px Arial, sans-serif'; x.fillText('LOS ANGELES', w / 2, h * 0.62); x.fillText('TO PROTECT AND TO SERVE', w / 2, h * 0.8, w * 0.92); });
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(2.05, 0.68), door); p.position.set(s * 0.968, 0.72, -0.25); p.rotation.y = s * Math.PI / 2; g.add(p); }
    const pb = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 0.06), dark); pb.position.set(0, 0.72, 2.46); g.add(pb);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.09, 0.3), dark); bar.position.set(0, 1.84, -0.1); g.add(bar);
    return Object.assign(c, { bars: lights(g, [[-0.42, 1.92, -0.1, 0xff1010], [0.42, 1.92, -0.1, 0x1a40ff], [-0.15, 1.92, -0.1, 0xff1010], [0.15, 1.92, -0.1, 0x1a40ff]]), top: 18, kind: 'police', heavy: false });
  }
  /** An engine of the LAFD: fire-engine red, long cab, hose bed, chrome. */
  function makeEngine() {
    const g = new THREE.Group(), L = 9.6, W = 2.5, red = new THREE.MeshStandardMaterial({ color: 0xb00f14, roughness: 0.2, metalness: 0.25 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dade, roughness: 0.18, metalness: 0.95 }), dark = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.5 }), white = new THREE.MeshStandardMaterial({ color: 0xf0efe8, roughness: 0.4 });
    const add = (w, h, d, x, y, z, m = red) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
    add(W, 2.32, 3.0, 0, 1.76, L / 2 - 1.5);        // the cab
    add(W - 0.05, 0.08, 3.0, 0, 2.97, L / 2 - 1.5, white);
    add(W - 0.1, 0.85, 0.05, 0, 2.2, L / 2 + 0.01, dark);       // windscreen
    for (const s of [-1, 1]) { add(0.03, 0.8, 1.06, s * (W / 2 + 0.002), 2.18, L / 2 - 0.65, dark); add(0.03, 0.72, 0.96, s * (W / 2 + 0.002), 2.2, L / 2 - 2.1, dark); }
    add(W, 1.9, L - 3.2, 0, 1.55, -1.5);         // the body with its lockers
    for (const s of [-1, 1]) { for (let k = 0; k < 4; k++) add(0.03, 1.24, 1.26, s * (W / 2 + 0.002), 1.44, -4.0 + k * 1.4, chrome); add(0.04, 0.22, L - 3.2, s * (W / 2 + 0.01), 2.28, -1.5, chrome); }
    add(W - 0.3, 0.3, L - 3.6, 0, 2.62, -1.6, new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.8 }));        // hose bed
    add(0.3, 0.2, 4, 0.9, 2.86, -1.6, chrome);          // a ladder on the side
    add(W + 0.1, 0.34, 0.2, 0, 0.72, L / 2 + 0.05, chrome);         // bumper
    const word = canvasMat(1024, 128, (x, w, h) => { x.clearRect(0, 0, w, h); x.fillStyle = '#b00f14'; x.fillRect(0, 0, w, h); x.fillStyle = '#f0d66e'; x.font = '700 62px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('LOS ANGELES FIRE DEPT', w / 2, h / 2, w * 0.95); });
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.36), word); p.position.set(s * (W / 2 + 0.006), 1.25, L / 2 - 1.5); p.rotation.y = s * Math.PI / 2; g.add(p); }
    const ws = wheelSet(g, [L / 2 - 1.3, -L / 2 + 2], W - 0.25, 0.5, 0.36, new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.95 }), chrome);
    return { group: g, wheels: ws.wheels, front: ws.front, len: L, wr: 0.5, roll: 0, steer: 0, top: 15, heavy: true, kind: 'fire', bars: lights(g, [[-0.8, 3.1, L / 2 - 0.4, 0xff1010], [0.8, 3.1, L / 2 - 0.4, 0xff1010], [0, 3.1, L / 2 - 0.4, 0xffffff], [-1.2, 2.5, -L / 2 + 0.2, 0xff1010], [1.2, 2.5, -L / 2 + 0.2, 0xff1010]]) };
  }
  /** A rescue ambulance: a white box on a truck chassis with a red band. */
  function makeAmbulance() {
    const g = new THREE.Group(), L = 7, W = 2.3;
    const white = new THREE.MeshStandardMaterial({ color: 0xf1f1ec, roughness: 0.28, metalness: 0.1 }), dark = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.5 });
    const add = (w, h, d, x, y, z, m = white) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
    add(W, 2.08, 4.1, 0, 1.82, -L / 2 + 2.05);    // the box
    add(W - 0.2, 1.4, 2.8, 0, 1.3, L / 2 - 1.4);        // the cab
    add(W - 0.34, 0.5, 0.02, 0, 1.68, L / 2 + 0.0, dark);
    add(W - 0.2, 0.5, 0.7, 0, 0.82, L / 2 - 0.3);
    for (const s of [-1, 1]) add(0.02, 0.5, 1, s * (W / 2 - 0.09), 1.68, L / 2 - 1.2, dark);
    const band = canvasMat(1024, 256, (x, w, h) => { x.fillStyle = '#f1f1ec'; x.fillRect(0, 0, w, h); x.fillStyle = '#c21620'; x.fillRect(0, h * 0.58, w, h * 0.24); x.fillStyle = '#c21620'; x.font = '700 92px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('RESCUE', w / 2, h * 0.28); x.fillStyle = '#fff'; x.font = '700 40px Arial, sans-serif'; x.fillText('LOS ANGELES FIRE DEPARTMENT', w / 2, h * 0.7, w * 0.9); });
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(4.08, 1), band); p.position.set(s * (W / 2 + 0.006), 1.65, -L / 2 + 2.05); p.rotation.y = s * Math.PI / 2; g.add(p); }
    const ws = wheelSet(g, [L / 2 - 1.1, -L / 2 + 1.5], W - 0.3, 0.42, 0.26, new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.95 }), new THREE.MeshStandardMaterial({ color: 0xc8cacc, roughness: 0.3, metalness: 0.8 }));
    return { group: g, wheels: ws.wheels, front: ws.front, len: L, wr: 0.42, roll: 0, steer: 0, top: 16, heavy: true, kind: 'ems', bars: lights(g, [[-1, 2.98, -L / 2 + 3.9, 0xff1010], [1, 2.98, -L / 2 + 3.9, 0xff1010], [0, 2.98, -L / 2 + 3.9, 0xffffff], [-1, 2.9, -L / 2 + 0.1, 0xff1010], [1, 2.9, -L / 2 + 0.1, 0xff1010]]) };
  }
  let _gt = null;
  function lights(g, list) {
    _gt = _gt || glowTexture();
    return list.map(([x, y, z, color]) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: _gt, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })); s.position.set(x, y, z); s.scale.setScalar(0.9); g.add(s); return s; });
  }

  // ─── following a line ──────────────────────────────────────────────
  function pathOf(flat) {
    const pts = []; for (let i = 0; i < flat.length; i += 2) { const q = [flat[i], flat[i + 1]]; if (!pts.length || Math.hypot(q[0] - pts[pts.length - 1][0], q[1] - pts[pts.length - 1][1]) > 0.5) pts.push(q); }
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return { pts, cum, len: cum[cum.length - 1] };
  }
  function at(path, s) {
    s = Math.max(0, Math.min(path.len - 0.001, s));
    let lo = 0, hi = path.cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (path.cum[m] <= s) lo = m; else hi = m; }
    const a = path.pts[lo], b = path.pts[hi], t = (s - path.cum[lo]) / ((path.cum[hi] - path.cum[lo]) || 1), dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    return { x: a[0] + dx * t, z: a[1] + dz * t, ux: dx / L, uz: dz / L };
  }
  const reversed = path => { const flat = []; for (let i = path.pts.length - 1; i >= 0; i--) flat.push(path.pts[i][0], path.pts[i][1]); return pathOf(flat); };
  /** A big street end to end, gathered from its ways by name. */
  function arterial(name) {
    const ways = [...Inner.roads, ...Wide.roads].filter(r => r.n === name && r.w >= 8);
    if (!ways.length) return null;
    const xs = ways.flatMap(w => w.p.filter((_, i) => i % 2 === 0)), zs = ways.flatMap(w => w.p.filter((_, i) => i % 2 === 1));
    const alongX = Math.max(...xs) - Math.min(...xs) > Math.max(...zs) - Math.min(...zs);
    // one point at each place, in order along the street's own direction; divided carriageways count once
    const pts = []; for (const w of ways) for (let i = 0; i < w.p.length; i += 2) pts.push([w.p[i], w.p[i + 1]]);
    pts.sort((a, b) => alongX ? a[0] - b[0] : a[1] - b[1]);
    const flat = []; let last = -1e9; for (const p of pts) { const v = alongX ? p[0] : p[1]; if (v - last > 22) { flat.push(p[0], p[1]); last = v; } }
    return flat.length > 8 ? pathOf(flat) : null;
  }

  function build(group, deps) {
    const { cars, focus, ahead, amb, nearestRoad } = deps;
    const paths = Bus.map(r => ({ r, path: pathOf(r.p) })).filter(p => p.path.len > 400);
    // the stops: those the route itself lists, or bus-stop signs from the map right beside its path
    const signStops = Wide.signs.filter(s => s.k === 'bus');
    for (const p of paths) {
      const stops = [];
      const consider = (x, z) => { let best = 1e9, bs = 0; for (let i = 0; i + 1 < p.path.pts.length; i++) { const a = p.path.pts[i], b = p.path.pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / ((dx * dx + dz * dz) || 1))), d = Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz); if (d < best) { best = d; bs = p.path.cum[i] + t * Math.hypot(dx, dz); } } if (best < 16) stops.push(bs); };
      for (const q of p.r.stops) consider(q[0], q[1]);
      for (const s of signStops) consider(s.x, s.z);
      p.stops = [...new Set(stops.map(v => Math.round(v / 20) * 20))].sort((a, b) => a - b);
    }
    const ACTIVE = root.Quality.level === 'low' ? 2 : 4, buses = [];
    /** Put a bus on some line that runs near where you are, far enough off that you do not see it appear. */
    function launch(b, first) {
      const [fx, fz] = focus(), near = paths.map(p => { let d = 1e9, s = 0; for (let k = 0; k < p.path.len; k += 40) { const q = at(p.path, k), e = Math.hypot(q.x - fx, q.z - fz); if (e < d) { d = e; s = k; } } return { p, d, s }; }).filter(n => n.d < 700).sort((a, b) => a.d - b.d);
      // a line not already out, and the campus tram only now and then: most of what you meet is Metro
      const inUse = new Set(buses.map(s => s.v && s.v.route.ref));
      const out = slots.filter(s => s.v).map(s => s.v.route);
      const fits = n => !out.some(r => r.ref === n.p.r.ref) && (!/CSUN/.test(n.p.r.net) || Math.random() < 0.15);
      const pool = (near.length ? near : paths.map(p => ({ p, d: 0, s: p.path.len / 2 }))).filter(fits);
      void inUse;
      const list = pool.length ? pool : near.length ? near : paths.map(p => ({ p, d: 0, s: p.path.len / 2 }));
      return list[Math.floor(Math.random() * Math.min(6, list.length))];
    }
    function startBus(slot) {
      const c = launch(); const rev = Math.random() < 0.5, path = rev ? reversed(c.p.path) : c.p.path, s0 = rev ? c.p.path.len - c.s : c.s;
      if (slot.v) { group.remove(slot.v.group); const k = cars.indexOf(slot.v); if (k >= 0) cars.splice(k, 1); slot.v = null; }
      const short = /CSUN/.test(c.p.r.net), v = makeBus(c.p.r, short ? 7.6 : 12.2); group.add(v.group);
      const stops = c.p.stops.map(q => rev ? c.p.path.len - q : q).sort((a, b) => a - b);
      Object.assign(v, { mode: 'route', path, s: Math.max(0, s0 - rnd(220, 480)), speed: 7, h: 0, x: 0, z: 0, stops, dwell: 0, off: 3, route: c.p.r });
      place(v, 1); cars.push(v); slot.v = v;
    }
    function place(v, dt) {
      const p = at(v.path, v.s), near = nearestRoad(p.x, p.z), off = near ? Math.max(1.9, near.r.w / 2 - 1.7) : 3;
      v.off += (Math.min(off, v.kind ? 2.2 : 6.2) - v.off) * Math.min(1, dt * 1.2);
      const look = at(v.path, v.s + v.len * 0.6), want = Math.atan2(look.x - p.x, look.z - p.z);
      const old = v.h; v.h = v.__placed ? v.h + wrap(want - v.h) * Math.min(1, dt * 2.6) : want; v.__placed = true;
      v.steer += (Math.max(-0.5, Math.min(0.5, wrap(want - v.h) * 3)) - v.steer) * Math.min(1, dt * 4);
      void old;
      // on the right of the way it is going
      v.x = p.x - p.uz * v.off; v.z = p.z + p.ux * v.off;
    }
    function drive(v, dt, goal) {
      const gap = ahead(v), safe = gap < v.len / 2 + 5 ? 0 : gap < v.len / 2 + 16 ? goal * 0.45 : goal;
      const look = at(v.path, v.s + 16), bend = Math.abs(wrap(Math.atan2(look.ux, look.uz) - v.h)), corner = bend > 0.7 ? Math.min(goal, 4.5) : bend > 0.3 ? Math.min(goal, 8) : goal;
      const target = Math.min(safe, corner);
      v.speed += Math.max(-5.5 * dt, Math.min((v.heavy ? 1.3 : 2.6) * dt, target - v.speed));
      v.s += Math.max(0, v.speed) * dt;
      place(v, dt);
    }
    const slots = []; for (let i = 0; i < ACTIVE; i++) slots.push({ v: null, wait: i * 25 + rnd(0, 20) });

    // ── sirens, rarely ──
    const STREETS = { police: ['Nordhoff Street', 'Reseda Boulevard', 'Zelzah Avenue', 'Devonshire Street', 'Plummer Street', 'White Oak Avenue', 'Lassen Street'], fire: ['Reseda Boulevard', 'Plummer Street', 'Nordhoff Street', 'Devonshire Street'], ems: ['Reseda Boulevard', 'Nordhoff Street', 'Plummer Street', 'Zelzah Avenue'] };
    const cache = {};
    const street = n => (n in cache ? cache[n] : (cache[n] = arterial(n)));
    let run = null, nextRun = rnd(70, 200), flash = 0;
    function startRun(kind) {
      const [fx, fz] = focus(), names = STREETS[kind].map(street).filter(Boolean);
      if (!names.length) return;
      // the street it comes along passes as close as any
      const scored = names.map(path => { let d = 1e9, s = 0; for (let k = 0; k < path.len; k += 30) { const q = at(path, k), e = Math.hypot(q.x - fx, q.z - fz); if (e < d) { d = e; s = k; } } return { path, d, s }; }).sort((a, b) => a.d - b.d);
      const pick = scored[Math.floor(Math.random() * Math.min(3, scored.length))], rev = Math.random() < 0.5, path = rev ? reversed(pick.path) : pick.path, nearS = rev ? pick.path.len - pick.s : pick.s;
      const v = kind === 'police' ? makePolice() : kind === 'fire' ? makeEngine() : makeAmbulance();
      Object.assign(v, { kind, mode: 'route', path, s: Math.max(0, nearS - rnd(650, 900)), speed: 12, h: 0, x: 0, z: 0, off: 2.2, steer: 0, roll: v.roll || 0 });
      group.add(v.group); place(v, 1); cars.push(v);
      run = { v, sound: amb.siren(kind) };
    }
    function endRun() {
      if (run.sound) run.sound.stop();
      group.remove(run.v.group); const k = cars.indexOf(run.v); if (k >= 0) cars.splice(k, 1);
      run = null;
    }
    return {
      slots, startRun, startBus, get run() { return run; }, paths, street, makeBus, makePolice, makeEngine, makeAmbulance,
      update(dt, ctx) {
        const d = Math.min(dt, 0.05);
        for (const sl of slots) {
          if (!sl.v) { sl.wait -= d; if (sl.wait < 0) startBus(sl); continue; }
          const v = sl.v, [fx, fz] = focus();
          // stops
          if (v.dwell > 0) { v.dwell -= d; v.speed = 0; place(v, d); if (v.dwell <= 0 && amb.hiss) amb.hiss(v.x, v.z); }
          else {
            const next = v.stops.find(q => q > v.s + 0.5), to = next == null ? 1e9 : next - v.s;
            if (to < 26 && v.speed > 0) { const goal = Math.max(1.2, to * 0.34); drive(v, d, Math.min(v.top, goal)); if (to < 1.5) { v.dwell = rnd(5, 14); v.s += 2; if (amb.hiss) amb.hiss(v.x, v.z); } }
            else drive(v, d, v.top);
          }
          if (v.s > v.path.len - 2 || Math.hypot(v.x - fx, v.z - fz) > 1200) { sl.wait = rnd(5, 30); group.remove(v.group); const k = cars.indexOf(v); if (k >= 0) cars.splice(k, 1); sl.v = null; }
        }
        // a run with lights and siren: every few minutes out of doors, seldom enough during Mass
        nextRun -= d;
        if (!run && nextRun < 0) { const u = Math.random(), kind = u < 0.45 ? 'police' : u < 0.72 ? 'ems' : 'fire'; startRun(kind); nextRun = ctx.explore ? rnd(190, 420) : rnd(420, 960); }
        if (run) {
          const v = run.v; drive(v, d, v.top);
          flash += d;
          const on = Math.floor(flash * 7) % 2;
          v.bars.forEach((b, i) => { b.material.opacity = (i % 2 === on ? 1 : 0.06) * (0.45 + (ctx.night || 0) * 0.55); b.scale.setScalar(0.8 + (ctx.night || 0) * 2.4); });
          if (run.sound) run.sound.update(v.x, v.z, d);
          // it has gone by and is well away: that is the last anyone here hears of it
          { const [fx, fz] = focus(), away = Math.hypot(v.x - fx, v.z - fz); run.closest = Math.min(run.closest == null ? away : run.closest, away); if (v.s > v.path.len - 2 || away > run.closest + 450) endRun(); }
        }
      },
    };
  }
  root.Transit = { build, makeBus, makePolice, makeEngine, makeAmbulance };
})(typeof self !== 'undefined' ? self : this);
