/*
 * What you hear and the small things you notice: boots on hard floors, birds by day and crickets by night, the far hum of the Valley,
 * sirens, aeroplanes; butterflies over the garden and ladybirds that settle on Our Lady.
 * The boots are recordings (steps-data.js); every other sound is synthesised here. Whatever is outdoors comes through one bus, all but shut when you are inside the church; only a siren carries through the walls.
 */
(function (root) {
  'use strict';
  const THREE = root.THREE, Plan = root.Plan;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = l => l[Math.floor(Math.random() * l.length)];

  function build(scene, deps) {
    const { audio, camera, figures, sky, statue, parent } = deps;
    let ctx = null, outBus = null, sirenBus = null, outFilter = null, roomIn = null, dryIn = null, hum = null, crickets = null, stepsBuf = [], lastStepBuf = null;

    // ── the bus, and a room for the church ──
    function start() {
      const a = audio(); if (!a) return null;
      if (ctx) return ctx;
      ctx = a;
      outFilter = a.createBiquadFilter(); outFilter.type = 'lowpass'; outFilter.frequency.value = 18000; outFilter.Q.value = 0.3;
      outBus = a.createGain(); outBus.gain.value = 1;
      outBus.connect(outFilter).connect(a.destination);
      sirenBus = a.createGain(); sirenBus.gain.value = 1; sirenBus.connect(outFilter);
      // a stone room: a short, soft tail of about a second and a half
      const sr = a.sampleRate, len = Math.floor(sr * 1.5), ir = a.createBuffer(2, len, sr);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let lp = 0; for (let i = 0; i < len; i++) { const t = i / len; lp += ((Math.random() * 2 - 1) - lp) * (0.5 - t * 0.42); d[i] = lp * Math.pow(1 - t, 3.2) * (i < sr * 0.004 ? 0 : 1); } }
      const conv = a.createConvolver(); conv.buffer = ir;
      roomIn = a.createGain(); roomIn.gain.value = 0.07; roomIn.connect(conv).connect(a.destination);
      dryIn = a.createGain(); dryIn.gain.value = 1; dryIn.connect(a.destination);
      stepsBuf = loadSteps(a);
      hum = cityHum(a); crickets = cricketBed(a);
      return ctx;
    }

    /** The recorded steps, from their raw samples. */
    function loadSteps(a) {
      const D = root.StepData;
      return D.steps.map(s => {
        const raw = atob(s), n = raw.length >> 1, b = a.createBuffer(1, n, D.rate), d = b.getChannelData(0);
        for (let i = 0; i < n; i++) { const v = raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8); d[i] = (v > 32767 ? v - 65536 : v) / 32768; }
        return b;
      });
    }

    /** One footfall, wherever it fell. */
    function footstep(x, y, z, indoors, loud, you) {
      if (!ctx) return;
      if (!indoors && sky.heardIndoors) return;              // no one hears a step through the wall of a church
      const dx = x - camera.position.x, dz = z - camera.position.z, dist = Math.hypot(dx, y - camera.position.y, dz);
      // your own steps stay level, wherever the camera has swung to; the others' fall away with distance
      const gain = you ? loud : loud / (1 + dist * dist * 0.06);
      if (gain < 0.004) return;
      // never the same recording twice running
      const s = ctx.createBufferSource(); let buf = pick(stepsBuf); if (buf === lastStepBuf) buf = stepsBuf[(stepsBuf.indexOf(buf) + 1) % stepsBuf.length];
      lastStepBuf = buf; s.buffer = buf; s.playbackRate.value = rnd(0.97, 1.03);
      const g = ctx.createGain(); g.gain.value = gain * rnd(0.92, 1.04);
      const p = ctx.createStereoPanner(); p.pan.value = you ? 0 : panOf(x, z) * 0.4;
      s.connect(g).connect(p);
      p.connect(dryIn); if (indoors) p.connect(roomIn);
      s.start();
    }
    const panOf = (x, z) => {
      const d = camera.getWorldDirection(new THREE.Vector3()), rx = -d.z, rz = d.x, dx = x - camera.position.x, dz = z - camera.position.z, L = Math.hypot(dx, dz) || 1;
      return Math.max(-1, Math.min(1, (dx * rx + dz * rz) / L));
    };

    // ── the Valley, far off, and the crickets of a warm night ──
    function noiseBuf(a, seconds, fn) {
      const sr = a.sampleRate, n = Math.floor(sr * seconds), xf = Math.floor(sr * 1.5), b = a.createBuffer(2, n + xf, sr);
      for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); fn(d, n + xf, sr); for (let i = 0; i < xf; i++) { const k = i / xf; d[i] = d[i] * k + d[n + i] * (1 - k); } }
      return { b, loopEnd: n / sr };
    }
    function loopOf(a, nb) { const s = a.createBufferSource(); s.buffer = nb.b; s.loop = true; s.loopEnd = nb.loopEnd; s.start(); return s; }
    function cityHum(a) {
      const nb = noiseBuf(a, 10, (d, n) => { let b = 0; for (let i = 0; i < n; i++) { b = (b + (Math.random() * 2 - 1) * 0.02) / 1.02; d[i] = b * 3; } });
      const f = a.createBiquadFilter(), h = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 150; h.type = 'highpass'; h.frequency.value = 45;
      const g = a.createGain(); g.gain.value = 0;
      loopOf(a, nb).connect(f).connect(h).connect(g).connect(outBus);
      return g;
    }
    function cricketBed(a) {
      // a few of them, each with its own stutter, a little apart
      const nb = noiseBuf(a, 8, (d, n, sr) => {
        for (const [hz, rate, off] of [[4400, 2.1, 0.1], [4700, 1.7, 0.7], [4150, 2.6, 0.35], [5000, 1.3, 0.9]]) {
          const phaseOff = off * sr, per = sr / rate, amp = 0.05 + Math.random() * 0.05;
          for (let i = 0; i < n; i++) {
            const p = (i + phaseOff) % per, burst = p / sr;
            if (burst > 0.2) continue;
            const pulse = Math.pow(Math.sin(Math.PI * ((burst * 38) % 1)), 2) * Math.sin(Math.PI * burst / 0.2);
            d[i] += Math.sin(2 * Math.PI * hz * i / sr) * pulse * amp;
          }
        }
      });
      const g = a.createGain(); g.gain.value = 0;
      loopOf(a, nb).connect(g).connect(outBus);
      return g;
    }

    // ── what the road sounds like: tyres on asphalt, rising and falling as they pass; and the air brakes of a bus ──
    let tyres = null;
    function tyreBed(a) {
      const nb = noiseBuf(a, 6, (d, n) => { let b = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b = (b + w * 0.09) / 1.09; d[i] = b * 1.5; } });
      const f = a.createBiquadFilter(), g = a.createGain(), p = a.createStereoPanner(); f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 0.5; g.gain.value = 0;
      loopOf(a, nb).connect(f).connect(g).connect(p).connect(outBus);
      return { f, g, p };
    }
    function hiss(x, z) {
      if (!ctx) return;
      const d = Math.hypot(x - camera.position.x, z - camera.position.z); if (d > 120) return;
      const nb = noiseBuf(ctx, 1, (b, n) => { for (let i = 0; i < n; i++) b[i] = Math.random() * 2 - 1; });
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = nb.b; f.type = 'highpass'; f.frequency.value = 2400;
      const t = ctx.currentTime, lvl = 0.08 / (1 + d * d * 0.004); g.gain.setValueAtTime(lvl, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.8);
      s.connect(f).connect(g).connect(outBus); s.start(t); s.stop(t + 0.85);
    }
    // ── birds: real-sounding phrases made from sweeps ──
    function tone(f0s, times, amp, type, pan) {
      const t0 = ctx.currentTime + 0.02, o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner(); p.pan.value = pan;
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f0s[0], t0); g.gain.setValueAtTime(0, t0);
      let t = t0;
      f0s.forEach((f, i) => { if (i) o.frequency.exponentialRampToValueAtTime(f, t0 + times[i]); });
      const end = t0 + times[times.length - 1];
      g.gain.linearRampToValueAtTime(amp, t0 + Math.min(0.012, (end - t0) * 0.2));
      g.gain.setValueAtTime(amp, Math.max(t0 + 0.012, end - 0.012));
      g.gain.linearRampToValueAtTime(0.0001, end);
      o.connect(g).connect(p).connect(outBus); o.start(t0); o.stop(end + 0.02);
      void t;
    }
    const later = (ms, fn) => setTimeout(fn, ms);
    const SONGS = {
      sparrow(a, p) { let t = 0; const hi = rnd(3400, 4400), n = 3 + Math.floor(Math.random() * 4); for (let i = 0; i < n; i++) { later(t, () => tone([hi, hi * 0.72, hi * 0.92], [0, 0.05, 0.09], a, 'sine', p)); t += rnd(115, 170); } },
      finch(a, p) { // a house finch: a long bright warble that falls, ending in a burr
        let t = 0, f = rnd(3800, 4800); for (let i = 0; i < 9; i++) { const hi = f * rnd(0.95, 1.2), lo = f * rnd(0.72, 0.9); later(t, () => tone([hi, lo, hi * 0.95], [0, 0.04, 0.078], a, 'sine', p)); t += rnd(78, 105); f *= 0.975; }
        later(t, () => tone([f * 0.75, f * 0.5], [0, 0.2], a * 0.8, 'triangle', p));
      },
      mocking(a, p) { // a mockingbird: each phrase said three times, then another
        const hi = rnd(2400, 4200), lo = hi * rnd(0.55, 0.8), up = Math.random() < 0.5; let t = 0;
        for (let i = 0; i < 3; i++) { later(t, () => tone(up ? [lo, hi, lo * 1.1] : [hi, lo, hi * 0.9], [0, 0.1, 0.22], a, 'sine', p)); t += 290; }
        later(t + 120, () => { const h2 = rnd(1800, 3400); for (let k = 0; k < 3; k++) later(k * 220, () => tone([h2, h2 * 1.5], [0, 0.13], a, 'sine', p)); });
      },
      dove(a, p) { // the mourning dove, at dawn and dusk: coo-OO, oo, oo
        tone([480, 620, 500], [0, 0.22, 0.56], a * 1.4, 'sine', p);
        later(760, () => tone([540, 500, 440], [0, 0.3, 0.72], a * 1.3, 'sine', p));
        later(1660, () => tone([520, 480, 420], [0, 0.3, 0.68], a * 1.2, 'sine', p));
      },
      hummer(a, p) { for (let i = 0; i < 5; i++) later(i * 120, () => tone([6400, 7600], [0, 0.04], a * 0.5, 'sine', p)); },
    };
    let nextBird = 3, nextPlane = rnd(40, 110);

    // ── sirens: a pair of voices, moving, with the pitch of whatever comes and goes ──
    /** kind: 'police' wail and yelp, 'fire' a deep mechanical wail and air horn, 'ems' yelp and hi-lo. Returns { update(x, z, vx, vz), stop() }. */
    function siren(kind) {
      if (!ctx) return null;
      const a = ctx, master = a.createGain(), pan = a.createStereoPanner(), lp = a.createBiquadFilter(); master.gain.value = 0;
      lp.type = 'lowpass'; lp.frequency.value = 3200; lp.Q.value = 0.5;
      const o1 = a.createOscillator(), o2 = a.createOscillator(); o1.type = 'square'; o2.type = 'sawtooth';
      const m1 = a.createGain(), m2 = a.createGain(); m1.gain.value = 0.34; m2.gain.value = 0.2;
      const lfo = a.createOscillator(), depth = a.createGain();
      const base = kind === 'fire' ? 620 : kind === 'ems' ? 900 : 950, reach = kind === 'fire' ? 480 : 480;
      lfo.type = 'sine'; lfo.frequency.value = kind === 'fire' ? 0.16 : 0.24; depth.gain.value = reach;
      o1.frequency.value = base; o2.frequency.value = base * 1.008;
      lfo.connect(depth); depth.connect(o1.frequency); depth.connect(o2.frequency);
      o1.connect(m1); o2.connect(m2); m1.connect(lp); m2.connect(lp); lp.connect(master).connect(pan).connect(sirenBus);
      o1.start(); o2.start(); lfo.start();
      const horn = () => {          // an air horn, for a fire engine or a rescue at a junction
        const t = a.currentTime + 0.01, g = a.createGain(), f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1100;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.32, t + 0.03); g.gain.setValueAtTime(0.32, t + 0.9); g.gain.linearRampToValueAtTime(0, t + 1);
        for (const hz of [185, 233, 277]) { const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.connect(f); o.start(t); o.stop(t + 1.05); }
        f.connect(g).connect(master);
      };
      let t = 0, mode = 0, nextMode = rnd(5, 9), nextHorn = rnd(3, 8), prevD = null, going = 0;
      return {
        update(x, z, dt) {
          t += dt;
          const dx = x - camera.position.x, dz = z - camera.position.z, d = Math.hypot(dx, dz);
          pan.pan.setTargetAtTime(panOf(x, z) * 0.75, a.currentTime, 0.2);
          // the pitch falls as it passes
          const closing = prevD == null ? 0 : (prevD - d) / Math.max(dt, 0.001); prevD = d;
          // once it has gone by it drops away quickly, and the buildings take the top off it the further it gets
          going += ((closing < -1 ? 1 : 0) - going) * Math.min(1, dt * 1.2);
          master.gain.setTargetAtTime(0.11 / (1 + (d / 85) * (d / 85)) * (1 - going * 0.65), a.currentTime, 0.25);
          lp.frequency.setTargetAtTime(900 + 2300 * Math.exp(-d / 260), a.currentTime, 0.3);
          const dop = 340 / (340 - Math.max(-30, Math.min(30, closing)));
          if (t > nextMode) { mode = (mode + 1) % 2; t = 0; nextMode = rnd(4, 8); lfo.frequency.setValueAtTime(mode ? (kind === 'ems' ? 2.6 : 3.2) : (kind === 'fire' ? 0.16 : 0.24), a.currentTime); depth.gain.setTargetAtTime(mode ? 340 : reach, a.currentTime, 0.1); }
          o1.detune.setTargetAtTime(1200 * Math.log2(dop), a.currentTime, 0.15); o2.detune.setTargetAtTime(1200 * Math.log2(dop) + 14, a.currentTime, 0.15);
          nextHorn -= dt; if (kind !== 'police' && nextHorn < 0) { nextHorn = rnd(6, 14); if (d < 900) horn(); }
        },
        stop() { const end = a.currentTime + 1.2; master.gain.setTargetAtTime(0, a.currentTime, 0.3); o1.stop(end); o2.stop(end); lfo.stop(end); },
      };
    }

    // ── aeroplanes: over the Valley from Van Nuys, Burbank and on the way to LAX ──
    const flying = [];
    function planeMesh(kind) {
      const g = new THREE.Group(), fog = false;
      const body = new THREE.MeshBasicMaterial({ color: kind === 'small' ? 0xeeeeea : 0xdfe2e6, fog }), wing = new THREE.MeshBasicMaterial({ color: 0xb8bcc2, fog }), tail = new THREE.MeshBasicMaterial({ color: kind === 'jet' ? 0x2a4a8a : 0xb0403a, fog });
      const L = kind === 'jet' ? 38 : kind === 'biz' ? 19 : 8.5, R = kind === 'jet' ? 2.1 : kind === 'biz' ? 1 : 0.65;
      const f = new THREE.Mesh(new THREE.CapsuleGeometry(R, L - 2 * R, 4, 10), body); f.rotation.x = Math.PI / 2; g.add(f);
      const w = new THREE.Mesh(new THREE.BoxGeometry(L * 0.95, 0.22, L * 0.13), wing); w.position.z = kind === 'small' ? 0.2 : -L * 0.04; if (kind === 'small') w.position.y = R; g.add(w);
      const h = new THREE.Mesh(new THREE.BoxGeometry(L * 0.34, 0.14, L * 0.07), wing); h.position.z = -L * 0.45; g.add(h);
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.2, L * 0.18, L * 0.11), tail); v.position.set(0, L * 0.09 + R * 0.6, -L * 0.44); g.add(v);
      if (kind === 'jet') for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 3, 10), wing); e.rotation.x = Math.PI / 2; e.position.set(s * L * 0.18, -1.3, L * 0.03); g.add(e); }
      const lamp = (c, x, y, z) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: c, map: glowTex(), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true })); s.position.set(x, y, z); s.scale.setScalar(L * 0.22); g.add(s); return s; };
      g.userData.nav = [lamp(0xff2020, L * 0.48, 0, 0), lamp(0x20ff40, -L * 0.48, 0, 0)];
      g.userData.strobe = lamp(0xffffff, 0, R + 0.4, -L * 0.1);
      return g;
    }
    let _glow = null;
    function glowTex() { if (_glow) return _glow; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return (_glow = new THREE.CanvasTexture(c)); }
    function launchPlane() {
      const kind = pick(['jet', 'jet', 'biz', 'biz', 'small', 'small']), m = planeMesh(kind);
      // right across the sky, passing some way off to one side
      const a = rnd(0, 6.283), span = 2600, off = rnd(-500, 500), speed = kind === 'jet' ? 95 : kind === 'biz' ? 75 : 48, alt = kind === 'jet' ? rnd(1000, 1500) : kind === 'biz' ? rnd(480, 900) : rnd(260, 480);
      const ux = Math.sin(a), uz = Math.cos(a), cx = camera.position.x - uz * off, cz = camera.position.z + ux * off;
      m.position.set(cx - ux * span, alt, cz - uz * span); m.rotation.y = a; scene.add(m);
      const p = { m, ux, uz, speed, alt, kind, left: 2 * span / speed, t: rnd(0, 1), snd: null };
      flying.push(p);
      if (ctx) {
        const nb = noiseBuf(ctx, 6, (d, n) => { let b = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b = (b + w * 0.05) / 1.05; d[i] = b * 1.8 + w * 0.05; } });
        const s = loopOf(ctx, nb), f = ctx.createBiquadFilter(), g = ctx.createGain(), pn = ctx.createStereoPanner(); f.type = 'lowpass'; f.frequency.value = kind === 'small' ? 600 : 900; g.gain.value = 0;
        s.connect(f).connect(g).connect(pn).connect(outBus);
        let prop = null;
        if (kind === 'small') { prop = ctx.createOscillator(); prop.type = 'sawtooth'; prop.frequency.value = 86; const pg = ctx.createGain(); pg.gain.value = 0.16; prop.connect(pg).connect(f); prop.start(); }
        p.snd = { s, f, g, pn, prop };
      }
    }

    // ── butterflies over the garden ──
    const SITE = Plan.SITE, G = SITE.garden;
    const GARDEN = { x: (G[0] + G[2]) / 2, z: (G[1] + G[3]) / 2, rx: Math.abs(G[2] - G[0]) / 2, rz: Math.abs(G[3] - G[1]) / 2 };
    const wingTex = kind => {
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      const body = kind === 'monarch' ? '#d9701a' : kind === 'white' ? '#f2f0e4' : '#c9a23a';
      g.fillStyle = body; g.beginPath(); g.moveTo(0, 32); g.bezierCurveTo(12, -4, 60, -2, 62, 20); g.bezierCurveTo(62, 34, 44, 34, 40, 36); g.bezierCurveTo(52, 50, 40, 64, 24, 58); g.bezierCurveTo(14, 54, 6, 44, 0, 32); g.fill();
      g.strokeStyle = kind === 'white' ? '#8a8878' : '#1a120a'; g.lineWidth = kind === 'monarch' ? 3.2 : 1.6; g.stroke();
      if (kind === 'monarch') { g.lineWidth = 1.5; for (const [x, y] of [[50, 10], [44, 24], [30, 12], [24, 42], [34, 52]]) { g.beginPath(); g.moveTo(2, 32); g.lineTo(x, y); g.stroke(); } g.fillStyle = '#f4f0e4'; for (const [x, y] of [[56, 14], [54, 22], [48, 28], [36, 56]]) { g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); } }
      if (kind !== 'monarch') { g.fillStyle = kind === 'white' ? '#3a3a34' : '#2a1a0a'; g.beginPath(); g.arc(46, 15, 3, 0, 7); g.fill(); }
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
    };
    const flies = new THREE.Group(); parent.add(flies);
    const butterflies = [];
    { const mats = {}; for (const k of ['monarch', 'white', 'sulphur']) mats[k] = new THREE.MeshStandardMaterial({ map: wingTex(k), side: THREE.DoubleSide, alphaTest: 0.4, roughness: 0.7 });
      const wg = new THREE.PlaneGeometry(0.052, 0.052); wg.translate(0.026, 0, 0); wg.rotateX(-Math.PI / 2);
      const bodyM = new THREE.MeshStandardMaterial({ color: 0x1a120a, roughness: 0.8 });
      ['monarch', 'white', 'monarch', 'sulphur', 'white', 'sulphur', 'monarch'].forEach(k => {
        const g = new THREE.Group(), L = new THREE.Mesh(wg, mats[k]), R = new THREE.Mesh(wg, mats[k]); R.scale.x = -1;
        const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.0028, 0.026, 3, 6), bodyM); b.rotation.x = Math.PI / 2;
        g.add(L, R, b); flies.add(g);
        butterflies.push({ g, L, R, x: GARDEN.x + rnd(-GARDEN.rx, GARDEN.rx), y: rnd(0.5, 1.3), z: GARDEN.z + rnd(-GARDEN.rz, GARDEN.rz), vx: 0, vy: 0, vz: 0, tx: 0, ty: 0.7, tz: 0, t: 0, flap: rnd(0, 6), rest: 0 });
      }); }

    // ── ladybirds ──
    const ladyTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 32; const g = c.getContext('2d'); g.fillStyle = '#b8120c'; g.fillRect(0, 0, 64, 32); g.fillStyle = '#100808'; for (const [x, y] of [[10, 10], [22, 22], [34, 8], [48, 18], [58, 8], [4, 24], [42, 26], [16, 4]]) { g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill(); } g.fillRect(0, 15, 64, 2); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; })();
    const ladybugs = [];
    let perches = null;
    /** Places a ladybird can land on the statue: real points of her surface, facing outward and upward enough to sit on, in the world's frame. */
    function findPerches() {
      perches = [];
      const fig = statue.near || statue.far; if (!fig) return;
      const v = new THREE.Vector3(), n = new THREE.Vector3(), m3 = new THREE.Matrix3();
      fig.updateMatrixWorld(true);
      fig.traverse(o => {
        if (!o.isMesh || !o.geometry.attributes.normal) return;
        o.updateWorldMatrix(true, false);
        m3.getNormalMatrix(o.matrixWorld);
        o.geometry.computeBoundingSphere(); const P = o.geometry.attributes.position, N = o.geometry.attributes.normal, step = Math.max(1, Math.floor(P.count / Math.max(3, Math.min(600, o.geometry.boundingSphere.radius * o.geometry.boundingSphere.radius * 700))));
        for (let i = 0; i < P.count; i += step) {
          v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); n.fromBufferAttribute(N, i).applyMatrix3(m3).normalize();
          if (o.material.side === THREE.DoubleSide && n.dot(v.clone().setY(0).sub(new THREE.Vector3(statue.holder.position.x, 0, statue.holder.position.z))) < 0) n.negate();
          if (v.y < 1.05 || n.y < -0.25) continue;
          perches.push({ x: v.x, y: v.y, z: v.z, n: n.clone() });
        }
      });
    }
    { const g = new THREE.SphereGeometry(0.0072, 12, 8); g.scale(1, 0.62, 1.25);
      const m = new THREE.MeshStandardMaterial({ map: ladyTex, roughness: 0.3 }), hd = new THREE.MeshStandardMaterial({ color: 0x0c0806, roughness: 0.5 }), hg = new THREE.SphereGeometry(0.0034, 8, 6);
      for (let i = 0; i < 9; i++) {
        const o = new THREE.Group(), s = new THREE.Mesh(g, m), h = new THREE.Mesh(hg, hd); h.position.set(0, 0.0005, 0.0092); o.add(s, h); o.scale.setScalar(1.25); flies.add(o);
        ladybugs.push({ o, mode: 'wait', t: rnd(0.5, 30), x: 0, y: 0, z: 0, from: null, to: null, f: 0, life: 0 });
      } }

    function updateFlies(dt, now, daylight, wet) {
      const cx = camera.position.x, cz = camera.position.z, near = Math.hypot(cx - GARDEN.x, cz - GARDEN.z) < 90;
      flies.visible = near;
      if (!near) return;
      const out = daylight > 0.25 && wet < 0.3;
      for (const b of butterflies) {
        b.g.visible = out; if (!out) continue;
        b.t -= dt;
        if (b.t < 0) { b.tx = GARDEN.x + rnd(-GARDEN.rx, GARDEN.rx) * 1.05; b.tz = GARDEN.z + rnd(-GARDEN.rz, GARDEN.rz) * 1.05; b.ty = rnd(0.35, 1.5); b.t = rnd(1.5, 5); b.rest = Math.random() < 0.25 ? rnd(1, 5) : 0; }
        if (b.rest > 0) { b.rest -= dt; b.vx *= 0.9; b.vy *= 0.9; b.vz *= 0.9; }
        else {
          // a butterfly never flies straight: it pulls towards where it is going, and bobs
          const dx = b.tx - b.x, dy = b.ty - b.y, dz = b.tz - b.z, L = Math.hypot(dx, dy, dz) || 1;
          b.vx += (dx / L * 1.2 + rnd(-2.2, 2.2)) * dt * 2; b.vy += (dy / L * 1 + Math.sin(now * 13 + b.flap) * 2.4) * dt * 2; b.vz += (dz / L * 1.2 + rnd(-2.2, 2.2)) * dt * 2;
          const sp = Math.hypot(b.vx, b.vy, b.vz); if (sp > 1.3) { b.vx *= 1.3 / sp; b.vy *= 1.3 / sp; b.vz *= 1.3 / sp; }
        }
        b.x += b.vx * dt; b.y = Math.max(0.2, b.y + b.vy * dt); b.z += b.vz * dt;
        b.g.position.set(b.x, b.y, b.z);
        if (Math.hypot(b.vx, b.vz) > 0.05) b.g.rotation.y = Math.atan2(b.vx, b.vz);
        const a = b.rest > 0 ? 0.25 + Math.sin(now * 2) * 0.15 : 0.15 + Math.abs(Math.sin(now * 16 + b.flap)) * 1.15;
        b.L.rotation.z = a; b.R.rotation.z = -a;
      }
      // the ladybirds: fly up, settle, walk a little, and go
      if (!perches || (statue.near && !perches.fine)) { findPerches(); if (statue.near && perches) perches.fine = true; }
      for (const l of ladybugs) {
        l.o.visible = out && l.mode !== 'wait';
        if (!out || !perches || !perches.length) continue;
        l.t -= dt;
        if (l.mode === 'wait') {
          if (l.t < 0) { l.mode = 'fly'; const p = pick(perches); l.to = p; l.from = new THREE.Vector3(GARDEN.x + rnd(-GARDEN.rx, GARDEN.rx), 0.3, GARDEN.z + rnd(-GARDEN.rz, GARDEN.rz)); l.f = 0; l.dur = rnd(3, 7); }
        } else if (l.mode === 'fly') {
          l.f += dt / l.dur;
          const f = Math.min(1, l.f), e = f * f * (3 - 2 * f), s = l.to;
          l.x = l.from.x + (s.x - l.from.x) * e + Math.sin(f * 17) * 0.06 * (1 - f); l.y = l.from.y + (s.y - l.from.y) * e + Math.sin(f * Math.PI) * 0.25 + Math.sin(f * 23) * 0.03 * (1 - f); l.z = l.from.z + (s.z - l.from.z) * e + Math.cos(f * 13) * 0.06 * (1 - f);
          l.o.position.set(l.x, l.y, l.z); l.o.rotation.set(0.4, now * 3 % 6.28, 0);
          if (f >= 1) { l.mode = 'sit'; l.t = rnd(8, 45); const n = s.n; l.o.position.set(s.x + n.x * 0.007, s.y + n.y * 0.007, s.z + n.z * 0.007); l.o.up.copy(n); l.o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n); l.yaw = rnd(0, 6.28); l.walk = rnd(0.2, 1); }
        } else if (l.mode === 'sit') {
          if (l.t < 0) { l.mode = 'wait'; l.t = rnd(5, 25); }
        }
      }
    }

    // ── each frame ──
    const prevPhase = new Map(), lastStep = new Map();
    const self = {
      footstep, siren, hiss, flying, launchPlane, butterflies, ladybugs,
      get perches() { return perches; },
      update(dt, opts) {
        const now = performance.now() / 1000, indoors = sky.indoors, daylight = sky.daylight == null ? 1 : sky.daylight, wet = sky.wetness || 0;
        if (opts.seeOut) updateFlies(dt, now, daylight, wet);
        // the aeroplanes fly whether anyone is listening or not
        nextPlane -= dt;
        if (nextPlane < 0 && opts.explore) { nextPlane = rnd(150, 300); launchPlane(); }
        for (let i = flying.length - 1; i >= 0; i--) {
          const p = flying[i];
          p.left -= dt; p.t += dt;
          p.m.position.x += p.ux * p.speed * dt; p.m.position.z += p.uz * p.speed * dt;
          const night = 1 - daylight, flash = (p.t % 1.4) < 0.08;
          for (const n of p.m.userData.nav) n.material.opacity = 0.3 + night * 0.7;
          p.m.userData.strobe.material.opacity = flash ? 1 : 0;
          p.m.visible = !indoors && opts.seeOut;
          if (p.snd && ctx) {
            const dx = p.m.position.x - camera.position.x, dz = p.m.position.z - camera.position.z, d = Math.hypot(dx, dz, p.alt);
            const lvl = (p.kind === 'jet' ? 0.07 : p.kind === 'biz' ? 0.05 : 0.035) / (1 + d * d / 500000);
            p.snd.g.gain.setTargetAtTime(lvl * Math.min(1, p.left / 8), ctx.currentTime, 0.5);
            p.snd.pn.pan.setTargetAtTime(panOf(p.m.position.x, p.m.position.z) * 0.6, ctx.currentTime, 0.5);
            p.snd.f.frequency.setTargetAtTime(p.kind === 'small' ? 600 : 500 + 900 * Math.exp(-d / 1400), ctx.currentTime, 0.5);
          }
          if (p.left < 0) {
            scene.remove(p.m); flying.splice(i, 1);
            if (p.snd && ctx) { p.snd.g.gain.setTargetAtTime(0, ctx.currentTime, 0.2); p.snd.s.stop(ctx.currentTime + 1); if (p.snd.prop) p.snd.prop.stop(ctx.currentTime + 1); }
          }
        }
        if (!opts.sound) { if (outBus) { outBus.gain.setTargetAtTime(0, ctx.currentTime, 0.2); sirenBus.gain.setTargetAtTime(0, ctx.currentTime, 0.2); } return; }
        if (!start()) return;
        // a church keeps the world out: inside, the beds stop and all that comes through the walls is a siren, dimly
        const inside = !!sky.heardIndoors;
        outBus.gain.setTargetAtTime(inside ? 0.025 : 1, ctx.currentTime, 0.6);
        sirenBus.gain.setTargetAtTime(inside ? 0.2 : 1, ctx.currentTime, 0.6);
        outFilter.frequency.setTargetAtTime(inside ? 520 : 18000, ctx.currentTime, 0.6);
        hum.gain.setTargetAtTime(inside ? 0 : (0.004 + daylight * 0.005) * (1 - wet * 0.4), ctx.currentTime, 2);
        crickets.gain.setTargetAtTime(inside ? 0 : Math.max(0, 1 - daylight * 2.4) * (1 - wet) * 0.18, ctx.currentTime, 3);
        // the road: the nearest moving vehicles
        if (!tyres) tyres = tyreBed(ctx);
        { let nx = 0, nz = 0, best = 0; for (const c of opts.cars || []) { if (Math.abs(c.speed || 0) < 0.5) continue; const dx = c.x - camera.position.x, dz = c.z - camera.position.z, e = Math.min(1, Math.abs(c.speed) / 10) * (c.heavy ? 1.5 : 1) / (1 + (dx * dx + dz * dz) * 0.02); if (e > best) { best = e; nx = c.x; nz = c.z; } }
          tyres.g.gain.setTargetAtTime(inside ? 0 : Math.min(0.03, best * 0.03), ctx.currentTime, 0.25); if (best) tyres.p.pan.setTargetAtTime(panOf(nx, nz) * 0.7, ctx.currentTime, 0.25); }
        // boots
        for (const f of figures()) {
          if (!f.root.visible) { prevPhase.delete(f); continue; }
          const moving = (f.stepping || f.manualWalk) && f.posture === 'stand';
          const s = Math.sin(f.phase), was = prevPhase.get(f);
          if (moving && was != null && (was < 0) !== (s < 0)) {
            const inHouse = opts.indoorsAt ? opts.indoorsAt(f.x, f.z) : false, you = f === opts.me;
            if (now - (lastStep.get(f) || 0) > 0.2) { lastStep.set(f, now); footstep(f.x, f.y, f.z, inHouse, you ? 0.11 : 0.05, you); }
          }
          prevPhase.set(f, s);
        }
        // birds, most at dawn and evening, none in the rain or the dark
        nextBird -= dt;
        if (nextBird < 0) {
          const dawn = sky.dawnDusk || 0;
          nextBird = rnd(2, 8) / (1 + dawn * 1.6);
          if (!inside && daylight > 0.12 && wet < 0.55) {
            const a = rnd(0.012, 0.05) * (0.5 + daylight * 0.5), pan = rnd(-0.85, 0.85), r = Math.random();
            if (dawn > 0.3 && r < 0.3) SONGS.dove(a, pan); else if (r < 0.34) SONGS.sparrow(a, pan); else if (r < 0.66) SONGS.finch(a, pan); else if (r < 0.93) SONGS.mocking(a, pan); else SONGS.hummer(a, pan);
          }
        }
      },
    };
    return self;
  }
  root.Ambient = { build };
})(typeof self !== 'undefined' ? self : this);
