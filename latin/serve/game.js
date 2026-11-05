/*
 * Serving Low Mass — the director, the props, the player's controls and the screens.
 *
 * Every Mass is a list of beats from Ceremony.build(). The director plays each beat: the priest, the other
 * server and the communicants act out their commands; the player's own commands become expectations that
 * the keys must satisfy, in order. Coach mode waits and explains; strict mode moves on and scores.
 */
(function () {
  'use strict';
  const C = window.Ceremony, Mass = window.Mass, THREE = window.THREE, Figure = window.Figure, Plan = window.Plan;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k.nodeType ? k : String(k));
    return el;
  };
  const fill = (el, ...kids) => el.replaceChildren(...kids.filter(k => k != null && k !== false));
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const flat = v => [v.x, v.z];

  // ─── options ───────────────────────────────────────────────────────────────
  const store = {
    get(k, d) { try { const v = localStorage.getItem('serve.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('serve.' + k, JSON.stringify(v)); } catch (e) { /* private window */ } },
  };
  const OPTS = {
    servers: 2, role: 'A1', respond: 'choose', mode: 'coach', speed: 1.25, quality: 'auto', weather: 'auto', camera: 'follow',
    communion: true, confiteor: true, gloria: true, creed: true, sermon: 'random', railCloth: 'none',
    bellMinorElevation: true, bellDomineNonSum: true, sacristyVersicle: 'procedamus',
    english: true, sound: true, labels: true, reminders: true, syllables: 4,
  };
  const params = new URLSearchParams(location.search);
  let opts = Object.assign({}, OPTS, store.get('opts', {}));
  delete opts.failing; delete opts.turn;      // no longer choices: anyone who once chose them gets what everyone gets
  const setOpt = (k, v) => { opts[k] = v; store.set('opts', opts); };

  // A full Mass at 1× runs about five minutes. Walking and kneeling keep their natural speed; what is
  // compressed is the reading — the priest's texts and the responses (SAY_SCALE) — and, a little, the gestures (PACE).
  const PACE = 1.5, SAY_SCALE = 0.3, WALK = 1.55, SLIP_LIMIT = 10, FACE_OFF = 1.2, TURN_RATE = 1.8, BACK = 0.7;

  // ─── renderer, camera, world ───────────────────────────────────────────────
  const canvas = $('#stage');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: params.has('test') });
  Tex.setAnisotropy(Math.min(16, renderer.capabilities.getMaxAnisotropy()));
  renderer.setPixelRatio(Math.min(window.Quality.dpr, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdfeaf0);
  scene.fog = new THREE.Fog(0xcfdde6, 150, 620);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.08, 900);
  const CAM = C.LAYOUT.camera;
  camera.position.set(...CAM.pos);
  camera.lookAt(V(...CAM.look));

  const world = World.build(scene);
  const FX = world.fx, PROPS = world.props;
  const SITE3D = Site.build(scene, World);
  const OUT3D = Outdoors.build(scene, World, SITE3D);
  const CARS = Traffic.build(scene, () => (Explore.active ? FIG.A1 : null), OUT3D.inHouse);
  const SKY = Weather.build(scene, World, world.lights, { windowMat: SITE3D.windowMat, wetMats: [...SITE3D.wetMats, ...(OUT3D.wetMats || [])] });

  function resize() {
    const w = window.innerWidth, ht = window.innerHeight;
    renderer.setSize(w, ht, false);
    camera.aspect = w / ht;
    // keep about 92° across, so the credence and both servers' places stay in view; allow taller on phones
    const hfov = 92 * Math.PI / 180;
    const vfov = 2 * Math.atan(Math.tan(hfov / 2) / camera.aspect) * 180 / Math.PI;
    Cam.massFov = Math.max(46, Math.min(78, vfov));
    Cam.walkFov = Math.max(52, Math.min(74, vfov * 0.92));
    camera.updateProjectionMatrix();
  }
  // ─── the camera ────────────────────────────────────────────────────────────
  // At the altar it is fixed, as if held above the gate. Everywhere else it follows on an arm behind the walker,
  // shortened whenever a wall would come between them.
  const Cam = {
    massFov: 60, walkFov: 60, fixed: true, yaw: 0, view: 0, offset: 0, armBase: 3.2, armRoom: 3.2, snap: true,
    goal: V(...CAM.pos), look: V(...CAM.look), lookNow: V(...CAM.look),
    /** How far back from you the camera can go before it meets anything taller than it looks over. */
    clearBehind(f, ax, az, arm) {
      if (!this.walls) this.walls = [...Plan.SIGHT, SOLID[0]];
      const shut = Object.values(SITE3D.doors).filter(o => o.open < 0.5).map(({ d }) => d.axis === 'x' ? [d.c - d.w / 2, d.at - 0.1, d.c + d.w / 2, d.at + 0.1] : [d.at - 0.1, d.c - d.w / 2, d.at + 0.1, d.c + d.w / 2]);
      const reach = arm + 0.2, t = Plan.crosses(f.x, f.z, f.x + ax * reach, f.z + az * reach, this.walls.concat(shut), 0.15);
      let room = t >= 0 ? Math.max(0, t * reach - 0.02) : arm;
      for (let d = 0.5; d < room; d += 0.5) if (OUT3D.inHouse(f.x + ax * d, f.z + az * d)) { room = d - 0.5; break; }
      return Math.min(room, arm);
    },
    /** Is someone at this place within view of the fixed camera? */
    atAltar(x, z) { return Math.abs(x) < 5.9 && z < 7.3; },
    update(dt, f, always) {
      this.fixed = !always && (!f || this.atAltar(f.x, f.z));
      if (this.fixed) {
        this.goal.set(...CAM.pos); this.look.set(...CAM.look);
      } else {
        // behind you and rigid, turning exactly as you turn; dragging swings it away from there until R brings it back
        const out = Plan.regionAt(f.x, f.z);
        const room = /sacristy|servers|narthex|parish hall$/i.test(out);
        const arm = room ? 2.6 : /nave|sanctuary|auditorium/i.test(out) ? 3.2 : 4.6;
        if (always) this.yaw = wrap(f.heading + Math.PI + this.offset);
        else {
          // watching someone else: no need to be behind them, only to have room to see them
          if (this.clearBehind(f, Math.sin(this.view), Math.cos(this.view), arm) < arm * 0.75) {
            let best = -1;
            for (let i = 0; i < 16; i++) {
              const y = i * Math.PI / 8, c = this.clearBehind(f, Math.sin(y), Math.cos(y), arm);
              if (c > best + 0.01) { best = c; this.view = y; }
            }
          }
          this.yaw = this.snap ? this.view : this.yaw + wrap(this.view - this.yaw) * Math.min(1, dt * 1.5);
        }
        const ax = Math.sin(this.yaw), az = Math.cos(this.yaw), clear = this.clearBehind(f, ax, az, arm);
        this.armBase = this.snap ? arm : this.armBase + (arm - this.armBase) * Math.min(1, dt * 3);
        // never through a wall: with one close behind you it comes in at once, and goes out again gently once there is room
        this.armRoom = this.snap || clear < this.armRoom ? clear : this.armRoom + (clear - this.armRoom) * Math.min(1, dt * 5);
        // close in, it rises just over your head and looks where you are going, not down at your feet
        const d = Math.min(this.armBase, this.armRoom), k = Math.min(1, d / 2.2), high = room ? 2.25 : 2.3 + (arm - 3.2) * 0.25, ahead = (1 - k) * 0.6;
        this.goal.set(f.x + ax * d, f.y + 1.95 + (high - 1.95) * k, f.z + az * d);
        this.look.set(f.x - ax * ahead, f.y + 1.0 + 0.1 * k, f.z - az * ahead);
      }
      const s = this.snap || !this.fixed && always ? 1 : 1 - Math.exp(-dt * (this.fixed ? 2.6 : 9));
      camera.position.lerp(this.goal, s);
      this.lookNow.lerp(this.look, this.snap || !this.fixed && always ? 1 : 1 - Math.exp(-dt * (this.fixed ? 2.6 : 11)));
      camera.lookAt(this.lookNow);
      let near = this.near0 || (this.near0 = camera.near);
      if (!this.fixed && always) {
        const ax = Math.sin(this.yaw), az = Math.cos(this.yaw), d = Math.min(this.armBase, this.armRoom);
        for (const [cx, cz] of C.LAYOUT.columns) {
          const along = (cx - f.x) * ax + (cz - f.z) * az, across = (cx - f.x) * az - (cz - f.z) * ax;
          if (along <= 0 || along > d || Math.abs(across) > 0.6) continue;
          const v = camera.getWorldDirection(new THREE.Vector3()), depth = (x, y, z) => (x - camera.position.x) * v.x + (y - camera.position.y) * v.y + (z - camera.position.z) * v.z;
          const b = Math.max(0, along - 0.32);
          near = Math.max(near, Math.min(depth(f.x + ax * b, f.y, f.z + az * b), depth(f.x, f.y + 1.75, f.z) - 0.3));
        }
      }
      if (Math.abs(camera.near - near) > 0.004) { camera.near = near; camera.updateProjectionMatrix(); }
      const fov = this.fixed ? this.massFov : this.walkFov;
      if (Math.abs(camera.fov - fov) > 0.02) { camera.fov += (fov - camera.fov) * (this.snap ? 1 : Math.min(1, dt * 3)); camera.updateProjectionMatrix(); }
      this.snap = false;
    },
  };
  window.addEventListener('resize', resize);
  resize();

  // ─── figures ───────────────────────────────────────────────────────────────
  const FIG = {
    P: new Figure('priest', { name: 'Priest', hair: 0x4a433c, hairStyle: 'short', skin: 0xc4977a }),
    A1: new Figure('server', { name: 'A1', hair: 0x1f140c, hairStyle: 'side', skin: 0xcfa283 }),
    A2: new Figure('server', { name: 'A2', hair: 0x5a3a1c, hairStyle: 'short', skin: 0xb98a68 }),
    C1: new Figure('lay', { name: 'C1', coat: 0x1d2a3c, trousers: 0x14161c, hair: 0x1a120c, skin: 0xa87a58 }),
    C2: new Figure('lay', { name: 'C2', coat: 0x4a2226, trousers: 0x1c1c22, hair: 0x120c08, hairStyle: 'long', skin: 0xcfa283 }),
    C3: new Figure('lay', { name: 'C3', coat: 0x2c3a24, trousers: 0x201c18, hair: 0x4a433c, skin: 0xc4977a }),
    C4: new Figure('lay', { name: 'C4', coat: 0x3a3028, trousers: 0x14161c, hair: 0x6a4a28, hairStyle: 'long', skin: 0x8a6044 }),
  };
  for (const f of Object.values(FIG)) scene.add(f.root);
  Figure.bodies = Object.values(FIG);

  // markers: who you are, and where to go
  const youRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.34, 40), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.85, depthWrite: false }));
  youRing.rotation.x = -Math.PI / 2; youRing.renderOrder = 2; scene.add(youRing); youRing.visible = false;
  const goRing = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.3, 40), new THREE.MeshBasicMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0.7, depthWrite: false }));
  goRing.rotation.x = -Math.PI / 2; goRing.renderOrder = 2; scene.add(goRing); goRing.visible = false;
  const goArrow = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 12), new THREE.MeshBasicMaterial({ color: 0x8fd3ff }));
  goArrow.rotation.x = Math.PI / 2; scene.add(goArrow); goArrow.visible = false;

  // ─── your own body, by hand ────────────────────────────────────────────────
  // Grab your hand, your head or your back and move it: to whatever you mean to do it to, and let go.
  const dotTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.beginPath(); g.arc(32, 32, 25, 0, 7); g.fillStyle = 'rgba(255,255,255,.35)'; g.fill();
    g.lineWidth = 11; g.strokeStyle = 'rgba(20,14,10,.85)'; g.stroke();
    g.lineWidth = 6; g.strokeStyle = '#fff'; g.stroke();
    const t = new THREE.CanvasTexture(c); return t;
  })();
  const dot = color => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
    sp.renderOrder = 60; sp.visible = false; scene.add(sp);
    return sp;
  };
  const SELF = { forehead: [0, 0.74, 0.13], lips: [0, 0.64, 0.15], breast: [0, 0.38, 0.18], shoulderL: [0.14, 0.5, 0.14], shoulderR: [-0.14, 0.5, 0.14] };
  const SELF_TEXT = { forehead: 'Forehead', lips: 'Lips', breast: 'Breast', shoulderL: 'Left shoulder', shoulderR: 'Right shoulder' };
  const PARTS = { R: ['Right hand', 0xffd36b], L: ['Left hand', 0xffd36b], head: ['Head', 0x8fd3ff], back: ['Back', 0x9be08f] };
  const CROSS = ['forehead', 'breast', 'shoulderL', 'shoulderR'], SMALL = ['forehead', 'lips', 'breast'];
  const inOrder = (seq, trail) => { let i = 0; for (const t of trail) if (t === seq[i]) i++; return i === seq.length; };
  const REACH = 1.9;
  const Grab = {
    handles: {}, pool: [], active: null, hover: null, x: 0, y: 0, tip: null,
    who() {
      if (Explore.active) return FIG.A1;
      if (!director || director.kind !== 'play' || window.__serve.autoplay || !director.player || director.failed) return null;
      return FIG[director.player];
    },
    scale() { return (canvas.clientHeight || 720) / 720; },
    /** A world point on the screen, or null if it is behind the camera. */
    screen(v) {
      camera.updateMatrixWorld();
      const p = v.clone().project(camera);
      if (p.z > 1 || p.z < -1) return null;
      const r = canvas.getBoundingClientRect();
      return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height];
    },
    /** Where the handle for a part shows: joined hands are spread apart so that each can be grabbed. */
    partAt(f, part) {
      if (part === 'head') { const v = V(0, 0.24, 0); f.neck.localToWorld(v); return v; }
      if (part === 'back') { f.spine.updateMatrixWorld(true); const v = V(0, 0.46, -0.14); f.spine.localToWorld(v); return v; }
      const v = f.handWorld(part);
      if (f.handWorld('R').distanceTo(f.handWorld('L')) < 0.2) {
        const k = part === 'L' ? 0.17 : -0.17;
        v.x += Math.cos(f.heading) * k; v.z -= Math.sin(f.heading) * k;
      }
      return v;
    },
    selfAt(f, name) { f.spine.updateMatrixWorld(true); const v = V(...SELF[name]); f.spine.localToWorld(v); return v; },
    /** Everything within reach of a hand. No more is marked than is really there: which of them is wanted is yours to know. */
    zones(f) {
      const out = [], add = (id, label, at, kind, who) => out.push({ id, label, at, kind, who });
      for (const n of Object.keys(SELF)) add(n, SELF_TEXT[n], this.selfAt(f, n), 'self');
      if (Explore.active || !director) return out;
      const me = director.player, close = (at, r = REACH) => Math.hypot(at.x - f.x, at.z - f.z) < r;
      const held = Props.held(me);
      // what is in your own hands can still be worked on: the veil folded, the pitcher set in the bowl
      for (const p of held) if (p === 'veil' || held.length > 1) add('prop:' + p, (PROP_TEXT[p] || p).replace(/^the /, '').replace(/^./, c => c.toUpperCase()), PROPS[p].obj.position.clone(), 'prop');
      for (const p of Object.keys(Props.loc)) {
        const who = Props.holder(p);
        if (who === me || (who && !(Props.out[who] && Props.out[who].has(p))) || !PROPS[p].obj.visible) continue;
        const at = PROPS[p].obj.position.clone();      // where it really is: two cruets on one tray are two things
        if (close(at)) add('prop:' + p, (PROP_TEXT[p] || p).replace(/^the /, '').replace(/^./, c => c.toUpperCase()), at, 'prop');
      }
      if (held.length) {
        const seen = [];
        for (const [k, q] of Object.entries(C.PLACES)) {
          const at = V(q[0], q[1], q[2]);
          if (k === 'font' || k === 'sbell' || !close(at) || seen.some(o => o.distanceTo(at) < 0.3) || out.some(z => z.kind === 'prop' && z.at.distanceTo(at) < 0.12)) continue;
          seen.push(at);
          add('place:' + k, 'Put it down here', at, 'place');
        }
      }
      for (const [role, o] of Object.entries(FIG)) {
        if (o === f || !o.root.visible || !close(o, role === 'P' ? 3.5 : REACH)) continue;
        if (Math.hypot(o.x - f.x, o.z - f.z) < REACH) add('person:' + role, role === 'P' ? 'The priest' : role === 'A1' || role === 'A2' ? 'The other server' : 'A communicant', o.handWorld('R'), 'person', role);
        if (role === 'P') { add('alb', 'His alb', o.albHemWorld(), 'vest'); add('hem', 'His chasuble', o.hemWorld(), 'vest'); }
      }
      const fixed = (id, label) => { const at = fixturePos(id); if (close(at)) add(id, label, at, 'fixture'); };
      fixed('gateE', 'The gate'); fixed('gateG', 'The gate'); fixed('font', 'The holy water'); fixed('sbell', 'The bell rope');
      if (director.o.railCloth !== 'none') { fixed('clothE', 'The rail cloth'); fixed('clothG', 'The rail cloth'); }
      return out;
    },
    /** The nearest of them under the pointer. */
    pick(list) {
      const k = this.scale();
      let best = null, bd = 1;
      for (const z of list) {
        const p = this.screen(z.at);
        z.px = p;
        if (!p) continue;
        const d = Math.hypot(p[0] - this.x, p[1] - this.y) / (z.kind === 'self' ? this.selfR || 15 * k : 38 * k);
        if (d < bd) { bd = d; best = z; }
      }
      return best;
    },
    /** Among all that is under the hand, what you came for, if it is there. */
    meant(zones) {
      const c = Player.cur;
      if (Explore.active) return null;
      const cmd = c && USE_FIT.has(c.verb) ? c : !c || c.verb === 'go' || c.verb === 'turn' || c.verb === 'faceto' ? Player.nextAction() : null;
      if (!cmd || !USE_FIT.has(cmd.verb)) return null;
      const reach = 38 * this.scale();
      let best = null, bd = reach;
      for (const z of zones) {
        if (z.kind === 'self' || !this.fits(cmd, z)) continue;
        const p = this.screen(z.at), d = p ? Math.hypot(p[0] - this.x, p[1] - this.y) : 1e9;
        if (d < bd) { bd = d; best = z; }
      }
      return best;
    },
    partUnder(f) {
      const k = this.scale() * (document.body.classList.contains('touch') ? 26 : 19);
      let best = null, bd = k;
      for (const part of Object.keys(PARTS)) {
        const p = this.screen(this.partAt(f, part));
        if (!p) continue;
        const d = Math.hypot(p[0] - this.x, p[1] - this.y);
        if (d < bd) { bd = d; best = part; }
      }
      return best;
    },
    down(x, y) {
      this.x = x; this.y = y;
      const f = this.who();
      if (!f || !f.root.visible || UI.paused || this.active) return false;
      const part = this.partUnder(f);
      if (!part) return false;
      this.startedAt = Player.t;
      this.active = { c0: Player.cur, part, f, x0: x, y0: y, trail: [], inside: null, moved: 0, spine0: f.spinePitch, neck0: f.neckPitch, last: y, dir: 0, run: 0, shakes: 0 };
      if (part === 'R' || part === 'L') {
        // already at your breast or wherever: that is not arriving there
        const A = this.active; A.sx = x; A.sy = y;
        for (const n of Object.keys(SELF)) if (this.selfAt(f, n).distanceTo(f.handWorld(part)) < 0.14) A.inside = n;
        // a blow begins from outside the breast: picking up a hand already there is not one
        const br = this.screen(this.selfAt(f, 'breast')), fh = this.screen(this.selfAt(f, 'forehead'));
        const r = br && fh ? Math.max(16 * this.scale(), Math.hypot(fh[0] - br[0], fh[1] - br[1]) * 0.3) : 16 * this.scale();
        A.drawnBack = !!br && Math.hypot(br[0] - x, br[1] - y) > r * 1.5;
      }
      canvas.style.cursor = 'grabbing';
      return true;
    },
    move(x, y) {
      const a = this.active, dx = x - this.x, dy = y - this.y;
      this.x = x; this.y = y;
      if (!a) {
        const f = this.who();
        canvas.style.cursor = f && f.root.visible && this.partUnder(f) ? 'grab' : '';
        return;
      }
      a.moved += Math.hypot(dx, dy);
      if (a.part === 'back' || a.part === 'head') this.swing(a, dx, dy);
      if (a.part === 'R' || a.part === 'L') this.trace(a, a.f);
      if ((a.part === 'R' || a.part === 'L') && Props.slot.bells === a.part && !Explore.active && Props.holder('bells') === director.player) this.shake(a, x, y);
    },
    /** Sideways, and you turn with it: on your feet or on your knees, bowed or not. */
    swing(a, dx, dy) {
      const k = this.scale(), f = a.f;
      if (a.part === 'head' && Player.cur && Player.cur.verb === 'kiss') return;
      a.across = Math.max(0, (a.across || 0) + Math.abs(dx) - Math.abs(dy) * 1.2);
      if (!a.swinging && a.across < 20 * k) return;
      a.swinging = a.across >= 4 * k;
      if (!a.swinging) return;
      if (f.posture !== 'stand' && f.posture !== 'kneel') return;
      if (f.turn) { const t = f.turn; f.turn = null; t.resolve(t.signed); }
      const by = -dx * 0.0065 / k;      // to the right is clockwise, as the arrows are
      f.heading = wrap(f.heading + by);
      const c = Player.cur;
      if (c && c.verb === 'turn') c.turned = (c.turned || 0) + by;
    },
    /** The hand with the bells, shaken: each change of direction is a ring. */
    shake(a, x, y) {
      const k = this.scale(), d = y - a.last, need = 22 * k;
      if (Math.abs(d) < 1) return;
      const dir = Math.sign(d);
      if (dir !== a.dir) {
        if (a.dir && a.run >= need) {
          const c = Player.cur;
          if (c && c.verb === 'ring') { a.rang = performance.now(); Player.act('ring'); }
          else if (!(a.rang && performance.now() - a.rang < 1500) && ++a.shakes >= 2) { a.shakes = 0; Player.act('ring'); }      // one wobble on the way to the credence is nothing
        }
        a.dir = dir; a.run = 0;
      }
      a.run += Math.abs(d); a.last = y;
    },
    /** Moving past the parts of your own body: every point of the way the hand went, not only where it is now. */
    trace(a, f) {
      const k = this.scale(), at = {};
      for (const n of Object.keys(SELF)) { const p = this.screen(this.selfAt(f, n)); if (!p) return; at[n] = p; }
      const r = this.selfR = Math.max(16 * k, Math.hypot(at.forehead[0] - at.breast[0], at.forehead[1] - at.breast[1]) * 0.3);
      const dist = Math.hypot(this.x - a.sx, this.y - a.sy), steps = Math.max(1, Math.ceil(dist / (4 * k)));
      for (let i = 1; i <= steps; i++) {
        const x = a.sx + (this.x - a.sx) * i / steps, y = a.sy + (this.y - a.sy) * i / steps;
        // a blow on the breast: it need only draw back a little and come again
        const db = Math.hypot(at.breast[0] - x, at.breast[1] - y);
        // (and it is a blow only coming in: drawing back off the breast is not another)
        if (a.drawnBack) { a.peak = Math.max(a.peak == null ? db : a.peak, db); if (db < r * 1.5 && a.peak - db >= 6 * k) { a.drawnBack = false; a.peak = null; a.nearest = db; this.blow(a, f); } }
        else { a.nearest = Math.min(a.nearest == null ? db : a.nearest, db); if (db - a.nearest > 12 * k) a.drawnBack = true; }
        // the part it is on: a shoulder if it is near one; otherwise, in line with you, the head above the shoulders and the breast below
        let on = null, best = r;
        for (const n of ['shoulderL', 'shoulderR']) { const d = Math.hypot(at[n][0] - x, at[n][1] - y); if (d < best) { best = d; on = n; } }
        const span = Math.hypot(at.forehead[0] - at.breast[0], at.forehead[1] - at.breast[1]);
        const shoulders = (at.shoulderL[1] + at.shoulderR[1]) / 2, neck = (at.lips[1] + shoulders) / 2;
        if (!on && Math.abs(x - at.breast[0]) < r * 2.4 && y > at.forehead[1] - span * 0.8 && y < at.breast[1] + span * 1.2)
          on = y >= neck ? 'breast' : y < (at.forehead[1] + at.lips[1]) / 2 ? 'forehead' : 'lips';
        if (on === a.inside) continue;
        a.inside = on;
        if (on) this.reached(a, f, on);
      }
      a.sx = this.x; a.sy = this.y;
    },
    /** Is this what is due now, or what comes next once you have finished what you are saying or walking? */
    due(type) {
      const c = Player.cur;
      if (c && c.verb === type) return true;
      if (c && !/^(go|turn|faceto)$/.test(c.verb)) return false;
      const nx = c ? Player.nextAction() : Player.next() || Player.comingUp();
      return !!nx && nx.verb === type;
    },
    /** Done, whether its moment has come or is just about to. */
    body(type) {
      const c = Player.cur;
      if (Explore.active || c) return Player.act(type);
      const nx = Player.next() || Player.comingUp();
      Player.then = { cmd: nx.cmd, run: () => Player.act(type), far: !Player.next() };
    },
    blow(a, f) {
      a.blows = (a.blows || 0) + 1;
      if (Explore.active) return Player.act('strike');
      const c = Player.cur;
      if (c && c.verb === 'strike') return Player.act('strike');
      const nx = this.due('strike') ? (c ? Player.nextAction() : Player.next() || Player.comingUp()) : null;
      if (!nx) return;
      Gest.strike(f);      // you are at the words already: it counts when its moment comes
      Player.banked = (Player.banked || 0) + 1;
    },
    reached(a, f, id) {
      a.trail.push(id);
      const c = Player.cur;
      if (this.due('cross') && inOrder(CROSS, a.trail)) { a.trail = []; a.done = true; return this.body('cross'); }
      if (this.due('small') && id === 'breast' && (a.trail.includes('forehead') || a.trail.includes('lips'))) { a.trail = []; a.done = true; return this.body('small'); }      // from the head to the breast: the lips are on the way
      if (c && c.verb === 'kiss' && id === 'lips' && c.args[0] !== 'hand' && Props.held(director.player).length) { a.trail = []; a.done = true; Player.act('kiss'); }
    },
    fits(c, z) {
      const [a0, a1] = c.args, person = who => z.kind === 'person' && (!who || z.who === who);
      switch (c.verb) {
        case 'take': return z.id === 'prop:' + a0 || person(Props.holder(a0));
        case 'put': {
          if (z.kind !== 'place' && z.kind !== 'prop') return false;
          const t = C.PLACES[a1] ? V(C.PLACES[a1][0], C.PLACES[a1][1], C.PLACES[a1][2]) : Props.worldPos(a1);
          return z.at.distanceTo(t) < 0.55;      // on the right table is near enough
        }
        case 'give': case 'touch': return person(c.verb === 'give' ? a1 : a0);
        case 'offer': case 'hold': case 'offerwater': return person();
        case 'pour': return person('P');
        case 'pinch': return z.id === 'alb' || person('P');
        case 'lift': return z.id === 'hem' || person('P');
        case 'dip': return z.id === 'font';
        case 'tug': return z.id === 'sbell';
        case 'open': case 'close': case 'flip': case 'unflip': return z.id === a0;
        case 'light': case 'snuff': return z.id === 'prop:sc';
        case 'fold': return z.id === 'prop:veil';
      }
      return false;
    },
    /** It is what was wanted: the Mass goes on. */
    perform(c) {
      const v = c.verb;
      if (v === 'take' && Props.holder(c.args[0]) === 'P') return Player.act('hand');
      if (v === 'tug') return Player.act('ring');
      if (v === 'pour') return Player.act('pour');
      if (v === 'pinch' || v === 'lift' || v === 'drop') return Player.act('vest');
      return Player.act(USE_AS[v]);
    },
    up() {
      const a = this.active;
      if (!a) return;
      const f = a.f, k = this.scale(), c = Player.cur, part = a.part, far = a.moved > 40 * k;
      this.justLet = true; setTimeout(() => { this.justLet = false; }, 0);
      this.active = null; this.hover = null; f.pose = {};
      canvas.style.cursor = '';
      if (this.tip) this.tip.hidden = true;
      for (const z of this.pool) z.visible = false;
      if (UI.paused || (!Explore.active && (!director || director.failed))) return;
      // when a bow is due, any honest move that way is the bow that is due, however deep it went
      const moved = (this.y - a.y0) / k, level = l => l === 3 ? 'deep' : l === 2 ? 'med' : 'head';
      if (part === 'back' || part === 'head') {
        if (part === 'head' && a.lips && c && c.verb === 'kiss') return Player.act('kiss');
        if (c && c.verb === 'bow' && moved > 12) { f.bowLevel = 0; return Player.act('bow', c.args[0]); }
        if (c && c.verb === 'up' && moved < -12 && f.bowLevel) return Player.act('bow', level(f.bowLevel));
        if (c && c.verb === 'nod' && moved > 12) return Player.act('nod');
      }
      if (part === 'back') {
        if (Math.abs(moved) < 25) return;      // a wobble on the way round
        const was = f.bowLevel, now = a.pitch == null ? was : a.pitch < 0.2 ? 0 : a.pitch < 0.68 ? 2 : 3;
        if (now === was) return;
        if (now === 0) return Player.act('bow', level(was));      // straighten
        if (was) f.bowLevel = 0;
        return Player.act('bow', level(now));
      }
      if (part === 'head') {
        if (a.swinging) return;      // you were turning, not bowing
        if (f.bowLevel === 1 && moved < -15) return Player.act('bow', 'head');      // up again
        if (moved > 25) return Player.act('nod');
        return;
      }
      if (a.done) return;
      // brought to the breast and let go there: that was the blow
      if ((part === 'R' || part === 'L') && !a.blows && far && this.due('strike')) {
        const br = this.screen(this.selfAt(f, 'breast'));
        if (br && Math.hypot(br[0] - this.x, br[1] - this.y) < (this.selfR || 16 * k) * 1.5) return this.blow(a, f);
      }
      if (c && c.verb === 'drop' && f.lift) return Player.act('vest');
      // whole signs made though they were not wanted are slips like any other
      if (inOrder(CROSS, a.trail) && (!c || !USE_FIT.has(c.verb))) return Player.act('cross');
      if (inOrder(SMALL, a.trail) && (!c || (c.verb !== 'cross' && !USE_FIT.has(c.verb)))) return Player.act('small');
      if (a.zone && a.zone.kind !== 'self') {
        if (Explore.active) return;
        if (c && USE_FIT.has(c.verb) && this.fits(c, a.zone)) return this.perform(c);
        // on your way to the spot, or waiting there: if this is what you came to do, you are there
        const nx = !c || c.verb === 'go' || c.verb === 'turn' || c.verb === 'faceto' ? Player.nextAction() : null;
        if (nx && USE_FIT.has(nx.verb) && this.fits(nx, a.zone)) return Player.skipTo(cur => this.perform(cur));
        window.__serve.lastMiss = { cmd: c && c.cmd, zone: a.zone.id };
        if (c) { c.mistakes++; return director.mistake('That is not what is wanted now', describe(c.cmd)[0], Player.beat); }
        if (a.c0) return;      // you were reaching for what has just gone by, and have paid for that already
        return director.mistake('Nothing to do with your hands now', 'Wait for your cue.', Player.beat);
      }
      // out into the air, for what is simply held out
      if (c && far && (c.verb === 'hold' || c.verb === 'offer' || c.verb === 'offerwater')) return this.perform(c);
      if (c && far && (c.verb === 'turn' || c.verb === 'faceto')) { const nx = Player.nextAction(); if (nx && /^(hold|offer|offerwater)$/.test(nx.verb)) return Player.skipTo(cur => this.perform(cur)); }
    },
    /** Each frame: the handles, the arm following the pointer, and what it is over. */
    update() {
      const f = this.who(), show = !!f && f.root.visible && !UI.paused;
      for (const part of Object.keys(PARTS)) {
        const h = this.handles[part] || (this.handles[part] = dot(PARTS[part][1]));
        h.visible = show && (!this.active || this.active.part === part);
        if (h.visible) { h.position.copy(this.partAt(f, part)); h.scale.setScalar(this.active && this.active.part === part ? 0.06 : 0.046); h.material.opacity = 1; }
      }
      const a = this.active;
      if (!a) return;
      if (!show || a.f !== f) { this.up(); return; }
      const k = this.scale(), dy = (this.y - a.y0) / k;
      let tip = PARTS[a.part][0];
      if (a.part === 'back') {
        a.pitch = Math.max(0, Math.min(1.15, a.spine0 + dy / 150));
        f.pose.spine = a.pitch; f.pose.neck = a.neck0 + a.pitch * 0.25;
        tip = (a.pitch < 0.2 ? 'Upright' : a.pitch < 0.68 ? 'Moderate bow' : 'Profound bow') + (a.swinging ? ', turning' : '');
      } else if (a.part === 'head') {
        const lipsAt = [];
        if (!Explore.active && director) {
          if (Math.hypot(FIG.P.x - f.x, FIG.P.z - f.z) < 1.8 && FIG.P.root.visible) lipsAt.push({ id: 'phand', label: 'The priest’s hand', at: FIG.P.handWorld('R'), kind: 'lips' });
          for (const p of Props.held(director.player)) lipsAt.push({ id: 'prop:' + p, label: (PROP_TEXT[p] || p).replace(/^the /, '').replace(/^./, c => c.toUpperCase()), at: PROPS[p].obj.position.clone(), kind: 'lips' });
        }
        const z = this.pick(lipsAt);
        a.lips = z;
        f.pose.neck = z ? 0.55 : Math.max(-0.3, Math.min(0.8, a.neck0 + dy / 90));
        f.pose.spine = z ? 0.32 : null;
        this.showZones(lipsAt, z);
        tip = z ? 'Kiss: ' + z.label : a.swinging ? 'Turning' : dy > 25 ? 'Bow the head' : 'Head';
      } else {
        const zones = this.zones(f);
        this.trace(a, f);
        const z = this.meant(zones) || this.pick(zones);
        a.zone = z;
        this.showZones(zones, z);
        // the hand follows the pointer across the front of you; over something, it goes to it
        let at;
        if (z) at = z.at.clone();
        else {
          const r = canvas.getBoundingClientRect(), ray = new THREE.Raycaster();
          ray.setFromCamera(new THREE.Vector2((this.x - r.left) / r.width * 2 - 1, 1 - (this.y - r.top) / r.height * 2), camera);
          const n = camera.getWorldDirection(V()), chest = V(f.x + Math.sin(f.heading) * 0.3, f.y + 1.2, f.z + Math.cos(f.heading) * 0.3);
          at = new THREE.Vector3();
          if (!ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(n, chest), at)) at.copy(chest);
        }
        const both = f.held && f.held.both;
        if (both) {
          const sx = Math.cos(f.heading) * 0.1, sz = Math.sin(f.heading) * 0.1;
          f.pose.R = at.clone().add(V(-sx, 0, sz)); f.pose.L = at.clone().add(V(sx, 0, -sz));
        } else f.pose[a.part] = at;
        if (z) tip = z.label;
      }
      this.showTip(tip);
    },
    showZones(list, hot) {
      for (const sp of this.pool) sp.visible = false;
      let i = 0;
      for (const z of list) {
        const sp = this.pool[i] || (this.pool[i] = dot(0xffffff));
        i++;
        sp.visible = true; sp.position.copy(z.at);
        sp.scale.setScalar(z === hot ? 0.05 : z.kind === 'self' ? 0.02 : 0.024);
        sp.material.color.setHex(z === hot ? 0xffd36b : z.kind === 'self' ? 0xbfe6ff : 0xffffff);
        sp.material.opacity = z === hot ? 1 : 0.75;
      }
    },
    showTip(text) {
      const t = this.tip || (this.tip = $('#grab-tip'));
      t.textContent = text; t.hidden = false;
      t.style.left = this.x + 16 + 'px'; t.style.top = this.y - 30 + 'px';
    },
    reset() { if (this.active) this.active.f.pose = {}; this.active = null; if (this.tip) this.tip.hidden = true; for (const z of this.pool) z.visible = false; },
  };
  /** What the two servers do at one moment: the same thing, with no walking of their own before it. */
  const TOGETHER = new Set(['kneel', 'stand', 'gen', 'genhold', 'rise', 'bow', 'up', 'nod', 'cross', 'small', 'strike']);
  function togetherKey(list, i) {
    const { verb } = C.parse(list[i]);
    if (!TOGETHER.has(verb)) return null;
    let from = 0;
    for (let j = 0; j < i; j++) if (list[j].startsWith('sync ')) from = j;
    const before = list.slice(from, i);
    if (before.some(c => /^(go|via|wait|pace|waitsig) /.test(c))) return null;
    return before.join(';') + '>' + list[i];
  }
  const BODY_VERBS = new Set(['kneel', 'stand', 'sit', 'gen', 'genhold', 'rise', 'bow', 'up', 'nod', 'small', 'strike', 'turn', 'faceto']);
  const USE_FIT = new Set(['take', 'put', 'give', 'offer', 'hold', 'pour', 'pinch', 'lift', 'light', 'snuff', 'open', 'close', 'flip', 'unflip', 'dip', 'offerwater', 'touch', 'tug', 'fold']);

  // ─── sound: small synthesized bells ────────────────────────────────────────
  let actx = null;
  function audio() {
    if (!opts.sound) return null;
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { return null; }
    return actx;
  }
  function chime(kind) {
    const a = audio(); if (!a) return;
    const t0 = a.currentTime, big = kind === 'sacristy', len = big ? 2.8 : 1.0;
    const bases = big ? [392, 588, 784] : [1310, 1560, 1750, 2090], level = big ? 0.2 : 0.09;
    for (const f of bases) for (const [m, g] of [[1, 0.5], [2.76, 0.2], [5.4, 0.08]]) {
      const o = a.createOscillator(), gn = a.createGain();
      o.frequency.value = f * m * (1 + (Math.random() - 0.5) * 0.004);
      gn.gain.setValueAtTime(0, t0); gn.gain.linearRampToValueAtTime(g * level, t0 + 0.005);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      o.connect(gn).connect(a.destination); o.start(t0); o.stop(t0 + len + 0.1);
    }
  }

  // ─── props: where everything is ────────────────────────────────────────────
  const CONTAINED = {     // offsets when one prop rests on or in another
    wine: { tray: [-0.065, 0.016, 0] }, water: { tray: [0.065, 0.016, 0] },
    pitcher: { bowl: [0, 0.02, 0] }, towel: { bowl: [0.02, 0.07, 0] },
    veil: { chalice: [0, 0, 0] }, burse: { chalice: [0, 0.262, 0] },
  };
  const Props = {
    loc: {}, slot: {}, out: {}, lit: false,
    reset() {
      for (const [p, l] of Object.entries(C.PROPS)) { this.loc[p] = l === 'P' ? 'hand:P' : l; this.slot[p] = null; }
      this.slot.chalice = 'both'; this.out = {};
      this.worn = true;
      FIG.P.setBiretta(true); FIG.P.setManiple(true);
      PROPS.missal.obj.userData.setOpen(false); PROPS.missal.obj.userData.maniple.visible = false;
      PROPS.veil.obj.userData.setState('draped');
      PROPS.towel.obj.userData.setDraped(true);
      PROPS.sc.obj.userData.setLit(false);
      PROPS.chalice.obj.userData.host.visible = false;
      this.tilt = {};
    },
    holder(p) { const l = this.loc[p]; return l && l.startsWith('hand:') ? l.slice(5) : null; },
    held(role) { return Object.keys(this.loc).filter(p => this.loc[p] === 'hand:' + role); },
    attach(p, role) {
      const prev = this.holder(p);
      if (prev && this.out[prev]) this.out[prev].delete(p);
      this.loc[p] = 'hand:' + role;
      const pr = PROPS[p], mine = this.held(role).filter(q => q !== p);
      const used = new Set(mine.map(q => this.slot[q]));
      let slot = pr.carry === 'book' || pr.carry === 'both' ? 'both' : pr.carry;
      if (p === 'towel' && mine.includes('pitcher')) slot = 'arm';
      else if (slot === 'both' && mine.length) slot = used.has('R') ? 'L' : 'R';
      else if (slot === 'R' && (used.has('R') || used.has('both'))) slot = 'L';
      else if (slot === 'L' && (used.has('L') || used.has('both'))) slot = 'R';
      this.slot[p] = slot;
      if (p === 'veil') PROPS.veil.obj.userData.setState(this.veilFolded ? 'folded' : 'held');
      if (p === 'towel') PROPS.towel.obj.userData.setDraped(slot === 'arm');
      this.syncHands(role); if (prev && prev !== role) this.syncHands(prev);
    },
    place(p, where) {
      const prev = this.holder(p);
      if (prev && this.out[prev]) this.out[prev].delete(p);
      this.loc[p] = where; this.slot[p] = null;
      if (p === 'towel') PROPS.towel.obj.userData.setDraped(where === 'bowl' || where === 'cred.towel');
      if (p === 'veil') PROPS.veil.obj.userData.setState(where === 'chalice' ? 'draped' : this.veilFolded ? 'folded' : 'flat');
      if (prev) this.syncHands(prev);
    },
    syncHands(role) {
      const f = FIG[role];
      if (!f) return;
      const held = this.held(role);
      f.held = { R: null, L: null, both: null, arm: null };
      for (const p of held) f.held[this.slot[p] || 'R'] = { name: p, carry: PROPS[p].carry };
      if (f.held.arm && !f.held.R) f.held.R = f.held.arm;
    },
    worldPos(p) {
      const l = this.loc[p];
      if (!l) return V();
      if (l.startsWith('hand:')) { const o = PROPS[p].obj; return o.position.clone(); }
      if (C.PLACES[l]) return V(C.PLACES[l][0], C.PLACES[l][1], C.PLACES[l][2]);
      return this.worldPos(l);
    },
    update() {
      const order = ['tray', 'bowl', 'chalice', 'missal'];   // what others rest on comes first
      const names = Object.keys(this.loc).sort((a, b) => (order.includes(b) ? 1 : 0) - (order.includes(a) ? 1 : 0));
      for (const p of names) {
        const o = PROPS[p].obj, l = this.loc[p];
        o.visible = true;
        if (l.startsWith('hand:') && !FIG[l.slice(5)].root.visible) { o.visible = false; continue; }
        if (PROPS[l] && !PROPS[l].obj.visible) { o.visible = false; continue; }
        if (p === 'biretta' && l === 'hand:P' && this.worn) { o.visible = false; continue; }
        if (l.startsWith('hand:')) {
          const role = l.slice(5), f = FIG[role], slot = this.slot[p] || 'R';
          let pos;
          if (slot === 'both') pos = f.handWorld('R').add(f.handWorld('L')).multiplyScalar(0.5);
          else if (slot === 'arm') pos = f.handWorld('R').add(V(0, 0.09, 0));
          else pos = f.handWorld(slot);
          if (p === 'missal') pos.y -= 0.12;
          if (p === 'tray' || p === 'bowl' || p === 'paten') pos.y -= 0.02;
          if (p === 'chalice' && slot === 'both') pos.y -= 0.12;
          o.position.copy(pos);
          o.rotation.set(this.tilt[p] || 0, f.heading + (p === 'missal' ? Math.PI : 0), 0, 'YXZ');
        } else if (C.PLACES[l]) {
          const [x, y, z, ry] = C.PLACES[l];
          o.position.set(x, y, z); o.rotation.set(0, ry, 0);
        } else {
          const base = PROPS[l].obj, off = (CONTAINED[p] && CONTAINED[p][l]) || [0, 0.03, 0];
          const v = V(...off).applyEuler(base.rotation).add(base.position);
          o.position.copy(v); o.rotation.copy(base.rotation);
        }
      }
    },
  };

  // fixtures that move: gates, rail cloths, tabernacle door, sacristy bell
  const Fix = {
    target: {},
    reset() {
      for (const g of Object.values(FX.gates)) g.open = 1;
      for (const c of Object.values(FX.cloths)) c.flipped = 0;
      this.tab = 0; this.bellSwing = 0;
    },
    update(dt) {
      const k = Math.min(1, dt * 5);
      for (const g of Object.values(FX.gates)) { const t = -g.side * 1.45 * g.open; g.pivot.rotation.y += (t - g.pivot.rotation.y) * k; }
      for (const c of Object.values(FX.cloths)) { const t = c.flipped * Math.PI * 0.95; c.pivot.rotation.x += (t - c.pivot.rotation.x) * k; }
      FX.tabDoor.rotation.y += ((this.tab ? -1.9 : 0) - FX.tabDoor.rotation.y) * k;
      this.bellSwing = Math.max(0, this.bellSwing - dt);
      FX.sbell.rotation.z = Math.sin(this.bellSwing * 25) * this.bellSwing * 0.6;
    },
  };

  // ─── words for hints ───────────────────────────────────────────────────────
  const SPOT_TEXT = {
    sacA1: 'your place in the sacristy', sacA2: 'your place in the sacristy',
    sacP: 'the priest’s place in the sacristy', thrA2: 'the door into the church, by the holy-water font', thrA1: 'the door into the church, behind A2',
    w_sac: 'the sacristy door', w_hall: 'the sacristy hall', w_thr: 'the sacristy hall, by the door', w_door: 'the door into the church, past the rail', w_cE: 'across, in the lower lane', w_cG: 'across, in the lower lane', w_low: 'down the steps, below the priest', w_stG: 'the Gospel corner of the steps', w_stE: 'the Epistle corner of the steps', w_sed: 'the near side of the column, on your way to the chair', w_sedOut: 'the far side of the column, on your way back',
    w_rail: 'the end of the altar rail', w_gos: 'the gates, on the Gospel side', w_gosIn: 'through the gates', w_epi: 'the gates, on the Epistle side', w_epiIn: 'through the gates',
    cfR: 'the priest’s right at the foot of the altar (close formation)', cfL: 'the priest’s left at the foot of the altar (close formation)',
    cfL2: 'a step out to the side on the Gospel side, giving the priest room',
    xE: 'your place on the Epistle side (extended formation)', xG: 'your place on the Gospel side (extended formation)',
    mid: 'the middle, at the foot of the altar', midR: 'the middle at the foot of the altar, right of centre', midL: 'the middle at the foot of the altar, left of centre',
    ftE: 'the foot of the steps on the Epistle side', topE: 'the top step at the Epistle corner', topG: 'the top step at the Gospel corner',
    st2G: 'the second step on the Gospel side, facing the priest', veilTop: 'the top step beside the priest', veilG: 'the top step at the priest’s left',
    gradE: 'the Epistle end of the altar, by the gradine', plateTop: 'the top step, right of centre',
    elR: 'the edge of the top step at the priest’s right', elL: 'the edge of the top step at the priest’s left',
    comR: 'the edge of the top step for Communion', comL: 'the edge of the top step for Communion', comS: 'the edge of the top step, at the centre',
    abl1: 'the top step, half way across', cruWait1: 'the foot of the steps at the Epistle corner', cruWait2: 'the foot of the steps at the Epistle corner',
    cruWaitS: 'the foot of the steps at the Epistle corner', cruA1: 'the second step at the Epistle corner', cruA2: 'the second step at the Epistle corner',
    cruS: 'the second step at the Epistle corner', cruA3: 'the second step, outside A1', cred: 'the credence table', cred1: 'the credence table', cred2: 'the credence table',
    sed: 'the sedilia (the priest’s chair)', stoolE: 'your stool', stoolG: 'your stool',
    gateE: 'the Epistle-side gate', gateG: 'the Gospel-side gate', midRail: 'the middle, by the gates',
    clothE: 'the rail cloth on the Epistle side', clothG: 'the rail cloth on the Gospel side',
    cornerG: 'round the Gospel end of the altar', floorG: 'the Gospel end of the altar', cornerE: 'round the Epistle end',
  };
  for (let i = 1; i <= 4; i++) { SPOT_TEXT['pr' + i] = 'the priest’s right, by the next communicant'; SPOT_TEXT['cr' + i] = 'the priest’s left, a little apart, with the candle'; }
  const PROP_TEXT = {
    missal: 'the Missal', biretta: 'the biretta', veil: 'the chalice veil', burse: 'the burse', wine: 'the wine cruet', water: 'the water cruet',
    cruets: 'the cruets', tray: 'the tray', bowl: 'the basin', pitcher: 'the water pitcher', towel: 'the lavabo towel', bells: 'the bells',
    sc: 'the Sanctus candle', paten: 'the paten', hand: 'the priest’s hand', chalice: 'the chalice',
  };
  const PLACE_TEXT = {
    'sed.chair': 'on the sedilia', 'altar.G': 'at the Gospel corner, angled about 30°', 'altar.E': 'at the Epistle corner, parallel to the edge',
    'altar.veil': 'on the altar, away from the edge', 'altar.veilG': 'on the altar at the Gospel side', 'altar.burseG': 'flat on the altar',
    'gradine.sc': 'on the gradine', tray: 'on the tray', bowl: 'in the basin',
  };
  const placeText = p => PLACE_TEXT[p] || (p.startsWith('cred') ? 'on the credence' : p);
  const ROLE_TEXT = r => r === 'P' ? 'the priest' : r;
  const DIR_TEXT = { altar: 'the altar', people: 'the people', wall: 'the wall', epistle: 'the Epistle side', gospel: 'the Gospel side', P: 'the priest', book: 'the Missal' };

  function describe(cmd) {
    const { verb, args } = C.parse(cmd);
    const a0 = args[0];
    switch (verb) {
      case 'go': return ['Go to ' + (SPOT_TEXT[a0] || a0), '← → ↑'];
      case 'turn': return [`Turn ${args[0] === 'cw' ? 'clockwise (to your right)' : 'counter-clockwise (to your left)'} to face ${DIR_TEXT[args[1]] || SPOT_TEXT[args[1]] || args[1]}`, args[0] === 'cw' ? '→' : '←'];
      case 'faceto': return ['Turn to face ' + (DIR_TEXT[a0] || a0), '← →, or drag your back sideways'];
      case 'kneel': return ['Kneel — right knee first', 'Shift'];
      case 'stand': return ['Stand up', 'Ctrl or ↑'];
      case 'gen': return ['Genuflect — right knee down, torso upright', '↓ ↓'];
      case 'genhold': return ['Genuflect and stay down', '↓ ↓'];
      case 'rise': return ['Rise from the genuflection', 'Ctrl or ↑'];
      case 'sit': return ['Sit down', 'Ctrl'];
      case 'bow': return a0 === 'head' ? ['Bow your head and keep it bowed', 'Drag your head down'] : [`Bow ${a0 === 'deep' ? 'profoundly' : 'moderately'}${args[1] === 'P' ? ' towards the priest' : ''}`, a0 === 'deep' ? 'Drag your back far down' : 'Drag your back down a little'];
      case 'up': return ['Straighten up', FIG[Player.d && Player.d.player] && FIG[Player.d.player].bowLevel === 1 ? 'Drag your head up' : 'Drag your back up'];
      case 'nod': return ['Bow your head' + (a0 === 'P' ? ' — turn towards the priest' : ''), 'Drag your head down'];
      case 'cross': return ['Make the sign of the cross', 'Space'];
      case 'small': return ['Small crosses with the thumb: forehead, lips, breast', 'Drag your hand: forehead, lips, breast'];
      case 'strike': return [`Strike your breast${+a0 > 1 ? ' ×' + a0 : ''}`, 'Drag your hand to your breast'];
      case 'kiss': return ['Kiss ' + (PROP_TEXT[a0] || a0), a0 === 'hand' ? 'Drag your head to his hand' : 'Drag it to your lips'];
      case 'take': return Props.holder(a0) === 'P' ? ['Hold out your hand for ' + (PROP_TEXT[a0] || a0), 'Drag a hand to it'] : ['Take ' + (PROP_TEXT[a0] || a0), 'Drag a hand to it'];
      case 'put': return [`Put ${PROP_TEXT[a0] || a0} ${placeText(args[1])}`, 'Drag it there, let go'];
      case 'give': return [`Hand ${PROP_TEXT[a0] || a0} to ${ROLE_TEXT(args[1])}`, 'Drag it to them'];
      case 'offer': return [`Hand ${PROP_TEXT[a0] || a0} over`, 'Drag it to them'];
      case 'hold': return [`Hold out ${PROP_TEXT[a0] || a0}`, 'Drag it out'];
      case 'pinch': return ['Pinch the side of his alb as he goes up', 'Drag a hand to his alb'];
      case 'lift': return ['Lift the back of the chasuble', 'Drag a hand to his chasuble'];
      case 'drop': return ['Let go of the chasuble', 'Grab that hand and let go'];
      case 'ring': return [`Ring the bells${+a0 > 1 ? ' ×' + a0 : ''}`, 'Shake the hand with the bells'];
      case 'pour': return [`Pour the ${a0 === 'pitcher' ? 'water over his fingers' : a0}`, 'Drag it to the priest'];
      case 'light': return ['Light the Sanctus candle', 'Drag a hand to the candle'];
      case 'snuff': return ['Put out the Sanctus candle', 'Drag a hand to the candle'];
      case 'open': return ['Open ' + SPOT_TEXT[a0], 'Drag a hand to it'];
      case 'close': return ['Close ' + SPOT_TEXT[a0], 'Drag a hand to it'];
      case 'flip': return ['Flip over ' + SPOT_TEXT[a0], 'Drag a hand to it'];
      case 'unflip': return ['Turn back ' + SPOT_TEXT[a0], 'Drag a hand to it'];
      case 'dip': return ['Dip your fingers in the holy water', 'Drag a hand to the font'];
      case 'offerwater': return ['Hold out your wet fingers', 'Drag a hand towards them'];
      case 'touch': return [`Touch ${a0 === 'P' ? 'the priest’s' : a0 + '’s'} fingers with the holy water`, 'Drag a hand to their fingers'];
      case 'tug': return ['Tug the sacristy bell', 'Drag a hand to the rope'];
      case 'fold': return ['Fold the veil in thirds', 'Drag a hand to the veil'];
      case 'say': return ['Answer', '1–4'];
      default: return [verb, ''];
    }
  }

  const KEY_VERBS = new Set(['go', 'turn', 'faceto', 'kneel', 'stand', 'gen', 'genhold', 'rise', 'sit', 'bow', 'up', 'nod', 'cross', 'small', 'strike', 'kiss',
    'take', 'put', 'give', 'offer', 'hold', 'pinch', 'lift', 'drop', 'ring', 'pour', 'light', 'snuff', 'open', 'close', 'flip', 'unflip',
    'dip', 'offerwater', 'touch', 'tug', 'fold', 'say']);
  const USE_AS = { take: 'take', put: 'put', give: 'give', offer: 'give', hold: 'give', light: 'candle', snuff: 'candle', open: 'gate', close: 'gate', flip: 'gate', unflip: 'gate',
    dip: 'touch', offerwater: 'touch', touch: 'touch', fold: 'fold', sit: 'sit' };      // which button each of these things is done with
  const SPACE_VERBS = new Set(['take', 'put', 'give', 'offer', 'hold', 'light', 'snuff', 'open', 'close', 'flip', 'unflip', 'dip', 'offerwater', 'touch', 'tug', 'fold', 'sit']);

  // ─── target positions and headings ────────────────────────────────────────
  const spot = n => C.SPOTS[n];
  function headingFor(role, target) {
    const f = FIG[role];
    if (target === 'altar') return Math.PI;
    if (target === 'people') return 0;
    if (target === 'epistle') return Math.PI / 2;
    if (target === 'gospel') return -Math.PI / 2;
    if (target === 'wall') return f.x >= 0 ? Math.PI / 2 : -Math.PI / 2;
    if (target === 'book') { const p = Props.worldPos('missal'); return Math.atan2(p.x - f.x, p.z - f.z); }
    if (FIG[target]) return Math.atan2(FIG[target].x - f.x, FIG[target].z - f.z);
    if (spot(target)) return Math.atan2(spot(target)[0] - f.x, spot(target)[1] - f.z);
    if (target === 'cred') return Math.PI / 2;
    return f.heading;
  }
  const fixturePos = name => {
    if (name === 'gateE' || name === 'gateG') {      // its free end, wherever it has swung to
      const g = FX.gates[name], v = V(-g.side * C.LAYOUT.gateHalf * 0.75, 0.84, 0);
      g.pivot.updateWorldMatrix(true, false);
      return g.pivot.localToWorld(v);
    }
    if (name === 'clothE' || name === 'clothG') { const s = spot(name); return V(s[0], 0.85, s[1] + 0.35); }
    if (name === 'font') return V(C.PLACES.font[0], C.PLACES.font[1], C.PLACES.font[2]);
    if (name === 'sbell') return V(C.PLACES.sbell[0], C.PLACES.sbell[1] - 0.6, C.PLACES.sbell[2]);
    return V();
  };

  // ─── the director ──────────────────────────────────────────────────────────
  class Stopped extends Error {}

  class Director {
    constructor(kind, o) {
      this.kind = kind;                     // 'demo' | 'watch' | 'play'
      this.o = Object.assign({}, o, { seed: o.seed || (Date.now() % 9973) + 1 });
      this.beats = C.build(Object.assign({}, this.o, { wholePrayer: kind === 'play' && this.o.respond === 'type' }));
      this.player = kind === 'play' ? (this.o.servers === 2 ? this.o.role : 'A1') : null;
      this.stopped = false;
      this.timers = [];
      this.time = 0;
      this.flags = new Set();
      this.results = { ok: 0, total: 0, mistakes: [] };
      this.hostFor = new Set();
      this.answered = {};
    }
    stop() { this.stopped = true; for (const t of this.timers) t.resolve(); this.timers = []; }
    /** Something essential went undone: the Mass cannot go on with you, and it is yours to start again. */
    fail(reason, expected, cite) {
      if (this.failed || this.kind !== 'play') return;
      this.failed = true;
      this.results.failure = { part: this.beats[this.index] ? this.beats[this.index].part : '', reason, expected };
      UI.failed(this, reason, expected, cite);
      this.stop();
    }
    check() { if (this.stopped) throw new Stopped(); }
    async step(p) { await p; this.check(); }
    sleep(s) { return new Promise(resolve => this.timers.push({ at: this.time + s, resolve })); }
    tick(dt) {
      this.time += dt;
      const due = this.timers.filter(t => t.at <= this.time);
      this.timers = this.timers.filter(t => t.at > this.time);
      due.forEach(t => t.resolve());
    }
    until(pred) { return new Promise(resolve => { const t = { at: Infinity, resolve, pred }; this.timers.push(t); }); }
    pollConditions() {
      for (const t of this.timers.filter(t => t.pred && t.pred())) { t.resolve(); }
      this.timers = this.timers.filter(t => !(t.pred && t.pred()));
    }

    async run() {
      try {
        for (let i = 0; i < this.beats.length; i++) {
          this.check();
          this.index = i;
          const b = this.beats[i];
          UI.beat(this, b, i);
          (this.log = this.log || []).push({ i, t: this.time, part: b.part });
          if (window.__serve.stopAt && window.__serve.stopAt(this, b, i)) {        // tests: freeze on a beat
            window.__serve.frozen = i;
            await this.step(this.until(() => window.__serve.frozen == null));
          }
          this.sync = {};
          this.syncNeed = {};
          for (const [r, list] of Object.entries(b.tracks)) for (const c of list) {
            const { verb, args } = C.parse(c);
            if (verb === 'sync') (this.syncNeed[args[0]] = this.syncNeed[args[0]] || new Set()).add(r);
          }
          this.answered = {};
          Player.stage = this.player && b.tracks[this.player] ? 0 : Infinity; Player.owed = [];
          await Promise.all(Object.entries(b.tracks).map(([r, list]) => this.track(r, list, b)));
          for (const f of Object.values(FIG)) f.keepBehind = null;
          await this.step(this.sleep(0.04));
        }
        UI.ended(this);
      } catch (e) {
        if (!(e instanceof Stopped)) { console.error(e); UI.toast('Something went wrong: ' + e.message); }
      }
    }

    async track(role, list, beat) {
      if (role === this.player) return Player.track(this, list, beat);
      for (let i = 0; i < list.length; i++) {
        if (this.player && (role === 'A1' || role === 'A2')) { const k = togetherKey(list, i); if (k) (beat.togetherAt = beat.togetherAt || {})[k] = Player.t; }
        await this.exec(role, list[i], beat);
      }
    }

    /** People do not reach across a room: go near enough to whoever you are dealing with, and turn to them. */
    async approach(role, other, reach) {
      if (role === this.player) return;       // you do your own walking
      const f = FIG[role], o = FIG[other];
      if (!o || !o.root.visible || f.posture !== 'stand') return;
      const d = Math.hypot(o.x - f.x, o.z - f.z);
      if (d > reach && d < 6) {
        const k = reach / d, x = o.x + (f.x - o.x) * k, z = o.z + (f.z - o.z) * k;
        await this.step(f.walkTo(x, z, { speed: WALK * 0.8, route: Nav.route(f.x, f.z, x, z) }));
      }
      await this.step(f.turnTo(Math.atan2(o.x - f.x, o.z - f.z)));
      if (role === this.player) Player.lastFace = f.heading;
    }
    /** Who in this beat takes this thing from the one holding it? */
    taker(beat, p, holder) {
      for (const [r, list] of Object.entries(beat.tracks)) if (r !== holder && list.some(c => c === 'take ' + p)) return r;
      return null;
    }

    // ── running one command ──────────────────────────────────────────────────
    async exec(role, cmd, beat) {
      this.check();
      const f = FIG[role];
      const { verb, args } = C.parse(cmd);
      const sp = this.o.speed;
      switch (verb) {
        case 'go': case 'via': {
          const s = spot(args[0]);
          const back = args[1] === 'back';
          await this.step(f.walkTo(s[0], s[1], { back, speed: args[1] === 'slow' ? WALK * 0.22 : WALK, route: back ? null : Nav.route(f.x, f.z, s[0], s[1]) }));
          if (verb === 'go' && !back && s[2] != null) await this.step(f.turnTo(s[2]));
          return;
        }
        case 'face': case 'faceto': return this.step(f.turnTo(headingFor(role, args[0])));
        case 'turn': return this.step(f.turnTo(headingFor(role, args[1]), args[0]));
        case 'pace': {
          // walking behind the player: not until they have cleared this point. The other server does this only behind you.
          if (!this.player || role === this.player || (role === 'A1' && this.player !== 'A2')) return;
          const n = +args[0];
          if (Player.stage !== Infinity) f.keepBehind = FIG[this.player];      // nobody waits on someone whose part is over
          await this.step(this.until(() => Player.stage >= n));
          if (args[1] === 'last') f.keepBehind = null;     // you have reached your place: now they go to theirs, beside you
          return;
        }
        case 'kneel': return this.step(f.kneel());
        case 'stand': case 'rise': return this.step(f.stand());
        case 'gen':
          if (role === this.player && Math.abs(f.x) < 0.8) Player.genSinceSide = true;
          return this.step(f.genuflect());
        case 'genhold': return this.step(f.genHold());
        case 'sit': {      // a seat faces the way it faces: you turn as you sit
          const seat = role === this.player ? Player.lastFace : null;
          if (seat != null) f.turnTo(seat);
          return this.step(f.sit());
        }
        case 'bow': return this.step(f.bow(args[0] === 'head' ? 1 : args[0] === 'deep' ? 3 : 2, args[1] && FIG[args[1]] ? FIG[args[1]].headWorld() : null));
        case 'up': return this.step(f.bow(0));
        case 'nod': return this.step(f.nod(args[0] && FIG[args[0]] ? FIG[args[0]].headWorld() : null));
        case 'cross': return this.step(Gest.cross(f));
        case 'small': return this.step(Gest.small(f));
        case 'strike': for (let i = 0; i < (+args[0] || 1); i++) await this.step(Gest.strike(f)); return;
        case 'kiss': return this.step(args[0] === 'hand' ? Gest.reach(f, () => FIG.P.handWorld('R'), 'R', 0.6, 0.2) : Gest.kiss(f));
        case 'take': {
          const p = args[0];
          // what you yourself are holding you cannot take: this means taking it back, once it has been given to someone and offered
          await this.step(this.until(() => { const hd = Props.holder(p); return !hd || (hd !== role && Props.out[hd] && Props.out[hd].has(p)); }));
          { const hd = Props.holder(p); if (hd && hd !== role) await this.approach(role, hd, 0.8); }
          await this.step(Gest.reach(f, () => Props.worldPos(p), Props.held(role).length ? 'L' : 'R'));
          Props.attach(p, role);
          if (p === 'biretta' && role === 'P') { Props.worn = false; }
          return;
        }
        case 'put': {
          const [p, where] = args;
          const at = C.PLACES[where] ? V(C.PLACES[where][0], C.PLACES[where][1], C.PLACES[where][2]) : Props.worldPos(where);
          await this.step(Gest.reach(f, () => at, Props.slot[p] === 'L' ? 'L' : 'R'));
          Props.place(p, where);
          return;
        }
        case 'give': {
          const [p, to] = args;
          await this.approach(role, to, 0.8);
          await this.step(Gest.reach(f, () => FIG[to].handWorld('R'), Props.slot[p] === 'L' ? 'L' : 'R'));
          Props.attach(p, to);
          if (p === 'biretta' && to === 'P') Props.worn = false;
          return;
        }
        case 'offer': case 'hold': {
          const p = args[0];
          if (p === 'biretta' && role === 'P' && Props.worn) { Props.worn = false; FIG.P.setBiretta(false); await this.step(Gest.doffBiretta(f)); }
          { const who = this.taker(beat, p, role); if (who) await this.approach(role, who, 0.85); }
          (Props.out[role] = Props.out[role] || new Set()).add(p);
          f.out = true; f.outHand = Props.slot[p] === 'L' ? 'L' : 'R';
          if (verb === 'offer') { await this.step(this.until(() => Props.holder(p) !== role)); f.out = false; }
          return;
        }
        case 'need': return this.step(this.until(() => Props.holder(args[0]) === role));
        case 'receive': {
          await this.step(this.until(() => this.hostFor.has(role)));
          return this.step(f.wait(0.6));
        }
        case 'pour': {
          const p = args[0];
          Props.tilt[p] = 0;
          await this.step(Gest.pour(f, p));
          return;
        }
        case 'ring': for (let i = 0; i < (+args[0] || 1); i++) { chime('hand'); await this.step(Gest.ring(f)); } return;
        case 'pinch': return this.step(Gest.reach(f, () => FIG.P.albHemWorld(), role === 'A2' ? 'R' : 'L', 0.9, 0.15));
        case 'lift': f.lift = () => FIG.P.hemWorld(); f.liftHand = role === 'A2' ? 'R' : 'L'; return this.step(f.wait(0.35));
        case 'drop': f.lift = null; return this.step(f.wait(0.3));
        case 'light': case 'snuff': await this.step(Gest.reach(f, () => Props.worldPos(args[0]).add(V(0, 0.25, 0)), 'L')); PROPS.sc.obj.userData.setLit(verb === 'light'); return;
        case 'open': case 'close': await this.step(Gest.reach(f, () => fixturePos(args[0]), args[0] === 'gateE' ? 'L' : 'R', 0.9)); FX.gates[args[0]].open = verb === 'open' ? 1 : 0; return;
        case 'flip': case 'unflip': await this.step(Gest.reach(f, () => fixturePos(args[0]), 'R', 1.0)); FX.cloths[args[0]].flipped = verb === 'flip' ? 1 : 0; return;
        case 'dip': return this.step(Gest.reach(f, () => fixturePos('font'), 'R', 0.6));
        case 'offerwater': f.out = true; f.outHand = 'R'; (Props.out[role] = Props.out[role] || new Set()).add('water-fingers'); return;
        case 'touch': {
          const who = args[0];
          await this.step(this.until(() => Props.out[who] && Props.out[who].has('water-fingers')));
          await this.step(Gest.reach(f, () => FIG[who].handWorld('R'), 'R', 0.6));
          Props.out[who].delete('water-fingers'); FIG[who].out = false;
          return;
        }
        case 'tug': Fix.bellSwing = 1.2; chime('sacristy'); return this.step(Gest.reach(f, () => fixturePos('sbell'), 'R', 0.8));
        case 'fold': Props.veilFolded = true; PROPS.veil.obj.userData.setState('folded'); return this.step(Gest.fold(f));
        case 'say': return this.say(role, args[0], beat);
        case 'wait': return this.step(this.sleep(+args[0]));
        case 'signal': this.flags.add(args[0]); return;
        case 'waitsig': return this.step(this.until(() => this.flags.has(args[0])));
        case 'sync': {
          (this.sync[args[0]] = this.sync[args[0]] || new Set()).add(role);
          return this.step(this.until(() => this.sync[args[0]].size >= this.syncNeed[args[0]].size));
        }
        case 'g': return this.step(PriestG[args[0]] ? PriestG[args[0]](this, f, args.slice(1)) : f.wait(0.5));
        default: return;
      }
    }

    /** Speak a line: the caption shows, and time passes in proportion to its length. */
    async say(role, ref, beat) {
      const t = C.lineText(ref, Mass);
      const isServer = role === 'A1' || role === 'A2';
      // the other server waits for the player before they answer together
      if (isServer && this.player && role !== this.player && (beat.tracks[this.player] || []).includes('say ' + ref)) {
        await this.step(this.until(() => this.answered[ref]));
        return;
      }
      const both = isServer && this.o.servers === 2 && (beat.tracks.A1 || []).includes('say ' + ref) && (beat.tracks.A2 || []).includes('say ' + ref);
      if (both && role === 'A2') return this.step(this.until(() => this.answered[ref]));
      const who = role === 'P' ? (t.who === 'A' ? 'All' : 'P.') : both ? 'A1 · A2' : this.o.servers === 2 ? role : 'S.';
      if (this.kind !== 'play' || role === 'P') UI.caption(who, t, role);      // serving, the top of the screen is for the priest alone
      const dur = (t.dur || Math.min(4.5, Math.max(0.8, t.la.length * 0.028))) * SAY_SCALE;
      // a line you have to answer: you hear it out, and meanwhile you can get your answer ready
      const mine = (beat.tracks[role] || []), lastSay = mine.filter(c => c.startsWith('say ')).pop() === 'say ' + ref;
      const answer = role !== this.player && lastSay && !window.__serve.autoplay ? this.nextSay() : null;
      if (answer) {
        const hold = Math.max(2.5, Math.min(10, 1.6 + t.la.length * 0.03));
        this.ready = { ref: answer, result: Player.ready(this, answer, /^confiteor-m\.0/.test(answer) ? 'You begin the Confiteor' : 'Your response') };
        await this.step(this.sleep(hold * this.o.speed));      // seconds as you feel them, whatever the speed of the Mass
        if (isServer) this.answered[ref] = true;
        return;
      }
      await this.step(this.sleep(dur));
      if (isServer) this.answered[ref] = true;
    }

    /** Is the next thing you have to do to answer? */
    nextSay() {
      const list = this.player && this.beats[this.index + 1] && this.beats[this.index + 1].tracks[this.player];
      if (!list) return null;
      const i = list.findIndex(c => c.startsWith('say '));
      return i >= 0 && i <= 2 && !list.slice(0, i).some(c => /^(go|via|take|put|give) /.test(c)) ? list[i].slice(4) : null;
    }

    mistake(text, expected, beat, major) {
      this.results.mistakes.push({ part: beat ? beat.part : '', text, expected: expected || '', note: beat ? beat.note : '', cite: beat ? beat.cite : '', major: !!major });
      this.results.slips = (this.results.slips || 0) + (major ? 3 : 1);      // a major slip counts for three
      UI.mistake(text, expected, major);
      if (this.results.slips > SLIP_LIMIT && this.o.failing !== false) this.fail('Too many slips: ' + this.results.slips + ', and only ' + SLIP_LIMIT + ' are allowed.', 'Fewer slips. The last was: ' + text.replace(/[.\s]+$/, '') + '.', beat && beat.cite);
    }
  }

  // ─── gestures (hand targets in spine space) ────────────────────────────────
  const J = { R: [-0.02, 0.36, 0.22], L: [0.02, 0.36, 0.22] }, FL = [0.03, 0.30, 0.17];
  const dur = s => s / PACE;
  const Gest = {
    cross: f => f.gesture([
      { t: 0, R: J.R, L: FL }, { t: 0.18, R: [0, 0.74, 0.13] }, { t: 0.42, R: [0, 0.33, 0.18] },
      { t: 0.64, R: [0.14, 0.5, 0.14] }, { t: 0.84, R: [-0.14, 0.5, 0.14] }, { t: 1, R: J.R, L: FL }], dur(1.1)),
    small: f => f.gesture([
      { t: 0, R: J.R, L: FL }, { t: 0.2, R: [0.0, 0.74, 0.15] }, { t: 0.32, R: [0.02, 0.74, 0.15] },
      { t: 0.5, R: [0.0, 0.64, 0.15] }, { t: 0.62, R: [0.02, 0.64, 0.15] }, { t: 0.8, R: [0.0, 0.44, 0.19] }, { t: 0.9, R: [0.02, 0.44, 0.19] }, { t: 1, R: J.R, L: FL }], dur(1.1)),
    strike: f => f.gesture([{ t: 0, R: [-0.06, 0.37, 0.33], L: FL }, { t: 0.55, R: [-0.02, 0.38, 0.17] }, { t: 1, R: [-0.06, 0.37, 0.3], L: FL }], dur(0.5)),
    kiss: f => {
      const side = f.held.R ? 'R' : f.held.L ? 'L' : 'R';
      return f.gesture([{ t: 0 }, { t: 0.45, [side]: [side === 'R' ? -0.03 : 0.03, 0.62, 0.17], neck: 0.15 }, { t: 1 }], dur(0.7));
    },
    reach: (f, worldFn, side = 'R', d = 0.7, spine = 0.12) => f.gesture([{ t: 0 }, { t: 0.5, [side]: worldFn, spine }, { t: 1 }], dur(d)),
    pour: (f, p) => {
      const side = Props.slot[p] === 'L' ? 'L' : 'R';
      return f.gesture([{ t: 0 }, { t: 0.25, [side]: [side === 'R' ? -0.06 : 0.06, 0.38, 0.46] }, { t: 0.75, [side]: [side === 'R' ? -0.06 : 0.06, 0.36, 0.46] }, { t: 1 }], dur(1.4),
        { onT: [[0.25, () => { Props.tilt[p] = side === 'R' ? 1.2 : -1.2; }], [0.8, () => { Props.tilt[p] = 0; }]] });
    },
    ring: f => {
      const side = Props.slot.bells === 'L' ? 'L' : 'R', x = side === 'R' ? -0.16 : 0.16;
      return f.gesture([{ t: 0, [side]: [x, 0.2, 0.3] }, { t: 0.3, [side]: [x - 0.05, 0.26, 0.32] }, { t: 0.6, [side]: [x + 0.03, 0.2, 0.3] }, { t: 1, [side]: [x, 0.2, 0.3] }], dur(0.45));
    },
    fold: f => f.gesture([{ t: 0 }, { t: 0.3, R: [-0.15, 0.25, 0.35], L: [0.15, 0.25, 0.35] }, { t: 0.6, R: [-0.04, 0.3, 0.32], L: [0.04, 0.3, 0.32] }, { t: 1 }], dur(1.0)),
    doffBiretta: f => f.gesture([{ t: 0 }, { t: 0.45, R: [-0.06, 0.82, 0.08] }, { t: 1, R: [-0.12, 0.3, 0.32] }], dur(0.7)),
  };

  // the priest's own actions
  const ALT = { R: [-0.17, 0.12, 0.42], L: [0.17, 0.12, 0.42] };
  const PriestG = {
    placeChalice: async (d, f) => {
      await f.gesture([{ t: 0 }, { t: 0.5, R: [-0.08, 0.15, 0.45], L: [0.08, 0.15, 0.45], spine: 0.2 }, { t: 1 }], dur(1.0));
      Props.place('chalice', 'altar.C'); Props.place('burse', 'altar.burseG');
      await f.gesture([{ t: 0 }, { t: 0.5, R: [-0.25, 0.14, 0.45], L: [0.25, 0.14, 0.45], spine: 0.15 }, { t: 1 }], dur(0.9));
    },
    openBook: async (d, f) => { await f.gesture([{ t: 0 }, { t: 0.5, R: [-0.05, 0.15, 0.45], L: [0.12, 0.15, 0.45] }, { t: 1 }], dur(0.8)); PROPS.missal.obj.userData.setOpen(true); },
    closeBook: async (d, f) => { await f.gesture([{ t: 0 }, { t: 0.5, R: [-0.05, 0.15, 0.45], L: [0.12, 0.15, 0.45] }, { t: 1 }], dur(0.7)); PROPS.missal.obj.userData.setOpen(false); },
    extendJoin: (d, f) => f.gesture([{ t: 0, ...J }, { t: 0.45, R: [-0.3, 0.42, 0.26], L: [0.3, 0.42, 0.26] }, { t: 1, ...J }], dur(0.9)),
    extendRaise: (d, f) => f.gesture([{ t: 0, ...J }, { t: 0.35, R: [-0.3, 0.42, 0.26], L: [0.3, 0.42, 0.26] }, { t: 0.65, R: [-0.24, 0.62, 0.2], L: [0.24, 0.62, 0.2], neck: -0.25 }, { t: 1, ...J }], dur(1.1)),
    kissAltar: (d, f) => f.gesture([{ t: 0 }, { t: 0.45, ...ALT, spine: 0.62, neck: 0.25 }, { t: 0.6, ...ALT, spine: 0.62, neck: 0.25 }, { t: 1 }], dur(1.0)),
    eyesUp: (d, f) => f.gesture([{ t: 0 }, { t: 0.4, neck: -0.35 }, { t: 1, neck: -0.3 }], dur(0.6)),
    orans: (d, f) => { f.base = 'orans'; return f.wait(dur(0.3)); },
    joined: (d, f) => { f.base = null; return f.wait(dur(0.3)); },
    handsOnBook: (d, f) => { f.base = 'onAltar'; return f.wait(dur(0.3)); },
    leftHandDown: async (d, f) => { f.base = null; await f.gesture([{ t: 0 }, { t: 0.5, L: ALT.L }, { t: 1, L: ALT.L }], dur(0.8)); },
    handsOnAltar: (d, f) => f.gesture([{ t: 0 }, { t: 0.4, ...ALT }, { t: 1, ...ALT }], dur(0.7)),
    signBook: (d, f) => f.gesture([{ t: 0 }, { t: 0.3, R: [-0.05, 0.2, 0.45] }, { t: 0.55, R: [-0.05, 0.12, 0.45] }, { t: 0.75, R: [-0.1, 0.16, 0.45] }, { t: 1 }], dur(0.8)),
    kissBook: (d, f) => f.gesture([{ t: 0 }, { t: 0.5, ...ALT, spine: 0.5, neck: 0.2 }, { t: 1 }], dur(1.0)),
    maniple: async (d, f) => {
      await f.gesture([{ t: 0 }, { t: 0.5, R: [0.12, 0.2, 0.25], L: [0.12, 0.2, 0.35] }, { t: 1 }], dur(0.9));
      f.setManiple(false); PROPS.missal.obj.userData.maniple.visible = true;
    },
    unManiple: async (d, f) => {
      await f.gesture([{ t: 0 }, { t: 0.5, R: [0.0, 0.18, 0.45], L: [0.15, 0.2, 0.35] }, { t: 1 }], dur(0.9));
      f.setManiple(true); PROPS.missal.obj.userData.maniple.visible = false;
    },
    donBiretta: async (d, f) => { await f.gesture([{ t: 0 }, { t: 0.6, R: [-0.06, 0.82, 0.08] }, { t: 1 }], dur(0.7)); Props.worn = true; FIG.P.setBiretta(true); Props.loc.biretta = 'hand:P'; Props.slot.biretta = null; Props.syncHands('P'); },
    doffBiretta: async (d, f) => { Props.worn = false; FIG.P.setBiretta(false); Props.attach('biretta', 'P'); await Gest.doffBiretta(f); },
    unveil: async (d, f) => {
      await f.gesture([{ t: 0 }, { t: 0.5, R: [-0.1, 0.18, 0.5], L: [0.1, 0.18, 0.5], spine: 0.2 }, { t: 1 }], dur(0.9));
      Props.attach('veil', 'P'); PROPS.veil.obj.userData.setState('held');
    },
    pour: async (d, f) => {
      const p = Props.held('P').find(q => q === 'wine' || q === 'water');
      if (p) { Props.tilt[p] = 1.3; await f.wait(dur(0.9)); Props.tilt[p] = 0; }
    },
    blessWater: (d, f) => f.gesture([{ t: 0 }, { t: 0.3, R: [-0.05, 0.3, 0.45] }, { t: 0.5, R: [-0.05, 0.18, 0.45] }, { t: 0.75, R: [-0.12, 0.24, 0.45] }, { t: 0.9, R: [0.02, 0.24, 0.45] }, { t: 1 }], dur(0.9)),
    wash: async (d, f) => { f.base = 'fingers'; await f.wait(dur(1.2)); },
    dry: async (d, f) => { await f.gesture([{ t: 0 }, { t: 0.3, R: [-0.04, 0.3, 0.3], L: [0.04, 0.3, 0.3] }, { t: 0.6, R: [0.02, 0.32, 0.3], L: [-0.02, 0.28, 0.3] }, { t: 1 }], dur(1.0)); f.base = null; },
    crossesOblata: (d, f) => f.gesture([{ t: 0 }, { t: 0.15, R: [-0.05, 0.3, 0.45] }, { t: 0.3, R: [-0.05, 0.16, 0.45] }, { t: 0.45, R: [-0.12, 0.23, 0.45] },
      { t: 0.6, R: [0.02, 0.23, 0.45] }, { t: 0.75, R: [-0.05, 0.3, 0.45] }, { t: 0.9, R: [-0.05, 0.16, 0.45] }, { t: 1 }], dur(1.2)),
    handsOver: async (d, f) => { f.base = 'overOblata'; await f.wait(dur(0.6)); },
    elevateHost: async (d, f) => {
      f.base = 'elevate'; PROPS.chalice.obj.userData.host.visible = false;
      d.hostUp = true; await f.wait(dur(1.6));
    },
    lowerHost: async (d, f) => { f.base = null; d.hostUp = false; await f.wait(dur(0.6)); },
    elevateChalice: async (d, f) => { Props.attach('chalice', 'P'); f.base = 'elevate'; await f.wait(dur(1.6)); },
    lowerChalice: async (d, f) => { f.base = null; await f.wait(dur(0.5)); Props.place('chalice', 'altar.C'); },
    minorElevation: async (d, f) => { Props.attach('chalice', 'P'); f.base = 'holdChalice'; await f.wait(dur(0.8)); f.base = null; Props.place('chalice', 'altar.C'); },
    uncoverChalice: (d, f) => f.gesture([{ t: 0 }, { t: 0.5, R: [-0.05, 0.16, 0.45] }, { t: 1 }], dur(0.6)),
    communicate: (d, f) => f.gesture([{ t: 0 }, { t: 0.4, R: [-0.02, 0.62, 0.22], L: [0.04, 0.52, 0.25], spine: 0.25 }, { t: 0.7, R: [-0.02, 0.62, 0.22], spine: 0.25 }, { t: 1 }], dur(1.4)),
    drink: async (d, f) => {
      Props.attach('chalice', 'P');
      await f.gesture([{ t: 0 }, { t: 0.4, R: [-0.03, 0.6, 0.2], L: [0.03, 0.56, 0.2], neck: -0.2 }, { t: 0.7, R: [-0.03, 0.6, 0.2], L: [0.03, 0.56, 0.2], neck: -0.2 }, { t: 1 }], dur(1.4));
      Props.place('chalice', 'altar.C');
    },
    openTabernacle: async (d, f) => { await f.gesture([{ t: 0 }, { t: 0.5, R: [-0.05, 0.42, 0.55], spine: 0.15 }, { t: 1 }], dur(0.8)); Fix.tab = 1; },
    closeTabernacle: async (d, f) => { await f.gesture([{ t: 0 }, { t: 0.5, R: [-0.05, 0.42, 0.55], spine: 0.15 }, { t: 1 }], dur(0.8)); Fix.tab = 0; },
    takeCiborium: async (d, f) => { await f.gesture([{ t: 0 }, { t: 0.5, R: [-0.02, 0.4, 0.55], L: [0.04, 0.38, 0.55] }, { t: 1 }], dur(0.8)); Props.attach('ciborium', 'P'); },
    showHost: (d, f) => f.gesture([{ t: 0 }, { t: 0.4, R: [-0.04, 0.5, 0.3] }, { t: 1, R: [-0.04, 0.5, 0.3] }], dur(1.0)),
    giveHost: async (d, f, [to]) => {
      const target = FIG[to];
      await d.approach('P', to, 0.72);
      await f.gesture([{ t: 0 }, { t: 0.4, R: () => target.headWorld().add(V(0, -0.03, 0.0)) }, { t: 0.7, R: () => target.headWorld().add(V(0, -0.03, 0.0)) }, { t: 1 }], dur(1.0),
        { onT: [[0.6, () => d.hostFor.add(to)]] });
      d.hostFor.add(to);
    },
    putPaten: async (d, f) => { await f.gesture([{ t: 0 }, { t: 0.5, R: [-0.15, 0.12, 0.45], spine: 0.15 }, { t: 1 }], dur(0.7)); if (Props.holder('paten') === 'P') Props.place('paten', 'altar.paten'); if (Props.holder('ciborium') === 'P') Props.place('ciborium', 'tab'); },
    holdChalice: async (d, f) => { Props.attach('chalice', 'P'); f.base = 'holdChalice'; await f.wait(dur(0.5)); },
    holdFingers: async (d, f) => { if (Props.holder('chalice') === 'P') Props.place('chalice', 'altar.C'); f.base = 'fingers'; await f.wait(dur(0.4)); },
    wipeChalice: async (d, f) => { f.base = null; if (Props.holder('chalice') === 'P') Props.place('chalice', 'altar.C'); await f.gesture([{ t: 0 }, { t: 0.5, R: [-0.05, 0.2, 0.42], L: [0.05, 0.2, 0.42] }, { t: 1 }], dur(1.0)); },
    foldCorporal: (d, f) => f.gesture([{ t: 0 }, { t: 0.3, R: [-0.15, 0.15, 0.45], L: [0.15, 0.15, 0.45], spine: 0.2 }, { t: 0.7, R: [-0.3, 0.2, 0.4], L: [-0.2, 0.2, 0.42], spine: 0.15 }, { t: 1 }], dur(1.2)),
    veilChalice: async (d, f) => { await f.wait(dur(0.6)); Props.veilFolded = false; Props.place('veil', 'chalice'); },
    burseOnChalice: async (d, f) => { await f.gesture([{ t: 0 }, { t: 0.5, R: [-0.04, 0.22, 0.45] }, { t: 1 }], dur(0.6)); Props.place('burse', 'chalice'); f.base = null; },
    takeChalice: async (d, f) => { await f.gesture([{ t: 0 }, { t: 0.5, R: [-0.06, 0.15, 0.45], L: [0.06, 0.15, 0.45] }, { t: 1 }], dur(0.8)); Props.attach('chalice', 'P'); },
    blessPeople: (d, f) => f.gesture([{ t: 0 }, { t: 0.2, R: [-0.08, 0.72, 0.32] }, { t: 0.45, R: [-0.08, 0.25, 0.4] }, { t: 0.65, R: [0.1, 0.48, 0.4] }, { t: 0.85, R: [-0.3, 0.48, 0.4] }, { t: 1 }], dur(1.3)),
  };

  // ─── the player ────────────────────────────────────────────────────────────
  const Player = {
    d: null, list: null, i: 0, cur: null, beat: null, count: 0, resolve: null, lastGo: null, lastFace: null,
    wrongInThis: false, autoing: false, since: 0, owed: [],

    /** Work through the player's commands in this beat. */
    async track(d, list, beat) {
      this.d = d; this.beat = beat;
      this.list = list; if (!(list[0] || '').startsWith('strike')) this.banked = 0;
      for (let i = 0; i < list.length; i++) {
        d.check();
        this.i = i;
        const c = list[i], { verb, args } = C.parse(c);
        if (verb === 'via' && /^w_/.test(args[0])) {      // a point on the way: a help to the player, cleared by going past it
          const after = list.slice(i + 1).map(C.parse).find(n => n.verb === 'go' || n.verb === 'via');
          this.nextPoint = after ? spot(after.args[0]) : null;
          this.lastFace = null;
          await this.expect(d, 'go ' + args[0], beat);
          continue;
        }
        this.nextPoint = null;
        if (verb === 'via' || verb === 'face' || verb === 'wait') { if (verb === 'face') this.lastFace = headingFor(d.player, args[0]); continue; }
        if (!KEY_VERBS.has(verb)) { await d.exec(d.player, c, beat); continue; }
        if (verb === 'say') { await this.respond(d, args[0], beat); continue; }
        // a bow that is already held only needs re-aiming
        // and you are already bowing: that is the bow wanted
        if (verb === 'bow' && (FIG[d.player].bowLevel === (args[0] === 'head' ? 1 : args[0] === 'deep' ? 3 : 2) || (args[0] !== 'head' && FIG[d.player].bowLevel >= 2))) {
          FIG[d.player].bowLevel = args[0] === 'head' ? 1 : args[0] === 'deep' ? 3 : 2;
          FIG[d.player].bowTarget = args[1] && FIG[args[1]] ? FIG[args[1]].headWorld() : null; continue;
        }
        if (verb === 'go') this.lastGo = args[0];
        this.nextTogether = togetherKey(list, i);
        await this.expect(d, c, beat);
        if (verb === 'go') { this.lastFace = spot(args[0])[2]; }
      }
      this.cur = null; this.list = null; if (this.then && !this.then.far) this.then = null; UI.remind(null);
      this.owed = []; this.stage = Infinity;      // your part in this beat is over: nobody waits on it any more
      for (const o of Object.values(FIG)) o.keepBehind = null;
    },

    expect(d, cmd, beat) {
      const { verb, args } = C.parse(cmd);
      if (verb === 'go') { const f = FIG[d.player]; this.legFrom = [f.x, f.z]; }
      this.cur = { cmd, verb, args, count: 0, need: verb === 'strike' || verb === 'ring' ? (+args[0] || 1) : 1, beat, mistakes: 0, start: d.time, left: this.allow(d, verb, args) };
      d.results.total++;
      UI.remind(this.cur, beat);
      this.cur.together = this.nextTogether; this.nextTogether = null;
      if (verb === 'strike' && this.banked) {
        const cur = this.cur; cur.count = Math.min(cur.need, this.banked); this.banked = 0;
        if (cur.count >= cur.need) setTimeout(() => { if (this.cur === cur) this.done(); }, 0);
      }
      if (this.then && this.then.cmd === cmd) { const run = this.then.run; this.then = null; setTimeout(() => { if (this.cur && this.cur.cmd === cmd) run(this.cur); }, 0); }
      else if (this.then && (verb === 'go' || verb === 'turn' || verb === 'faceto')) { const cur = this.cur; setTimeout(() => { if (this.cur === cur) this.doneEnough(); }, 0); }
      if (verb === 'go') { const s = spot(args[0]); goRing.position.set(s[0], C.heightAt(s[0], s[1]) + 0.01, s[1]); }
      if (this.cur) this.cur.next = verb === 'go' && /^w_/.test(args[0]) ? this.nextPoint : null;
      const p = new Promise(resolve => { this.resolve = resolve; });
      if (window.__serve.autoplay) setTimeout(() => this.runAuto(), 0);     // tests: a perfect server
      return p;
    },

    /** Alt, in typing mode: your hands are on the keyboard, so your body moves when you remember to tell it to. */
    moveBody() {
      const d = this.d, c = this.cur, f = d && d.player && FIG[d.player];
      if (!f || d.kind !== 'play' || d.failed || UI.paused || this.autoing || !UI.typing()) return;      // only while there is typing to be done
      if (c && !BODY_VERBS.has(c.verb)) return UI.toast(c.verb === 'go' ? 'You walk there yourself.' : c.verb === 'cross' ? 'Space makes the sign of the cross.' : 'That one is done by hand.');
      if (!c) return d.mistake('Nothing for your body to do now', 'Keep still until your cue.', this.beat);
      // kneeling or genuflecting, it faces you the right way first
      if (/^(kneel|gen|genhold)$/.test(c.verb)) { const want = c.verb === 'kneel' ? this.lastFace : Math.PI; if (want != null) f.turnTo(want); }
      d.exec(d.player, c.cmd, c.beat).catch(e => { if (!(e instanceof Stopped)) throw e; });      // it takes the time it takes; you have done your part, as with any key
      this.done();
    },

    /** The next thing you have to do yourself, past whatever simply happens on the way. */
    next() {
      if (!this.list) return null;
      for (let j = this.i + 1; j < this.list.length; j++) {
        const p = C.parse(this.list[j]);
        if (/^(sync|wait|face|signal|waitsig|pace)$/.test(p.verb)) continue;
        return Object.assign(p, { cmd: this.list[j] });
      }
      return null;
    },
    /** What is first for you in the moment after this one: you may well see it coming. */
    comingUp() {
      const d = this.d, b = d && d.beats[d.index + 1], list = b && d.player && b.tracks[d.player];
      if (!list || !list.length || this.next()) return null;
      return Object.assign(C.parse(list[0]), { cmd: list[0] });
    },
    /** The next real thing to do, past any walking and turning still to be done; and where that walking was going. */
    nextAction() {
      if (!this.list) return null;
      let to = this.cur && this.cur.verb === 'go' ? this.cur.args[0] : null;
      for (let j = this.i + 1; j < this.list.length; j++) {
        const p = C.parse(this.list[j]);
        if (/^(sync|wait|face|signal|waitsig|pace|turn|faceto)$/.test(p.verb)) continue;
        if (p.verb === 'go' || p.verb === 'via') { to = p.args[0]; continue; }
        return Object.assign(p, { cmd: this.list[j], to });
      }
      return null;
    },
    /** Getting on with it: whatever walking and turning lay between here and there, you have done enough of. */
    skipTo(run) {
      this.then = { cmd: this.nextAction().cmd, run };
      if (this.cur) this.doneEnough();
    },
    doneEnough() {
      const c = this.cur, f = FIG[this.d.player];
      this.done();
      if (c.verb === 'turn' || c.verb === 'faceto') this.lastFace = f.heading;      // facing the way you turned to is facing the right way
    },
    /** How long, in real seconds, the Mass gives you for this before it has gone on without you. */
    allow(d, verb, args) {
      const f = FIG[d.player];
      const rate = TURN_RATE;
      if (verb === 'go') { const s = spot(args[0]); return Math.hypot(f.x - s[0], f.z - s[1]) * 1.25 / (WALK * d.o.speed) + Math.abs(wrap(Math.atan2(s[0] - f.x, s[1] - f.z) - f.heading)) / rate + 4.5; }     // a little over the straight line: there are columns and rails to go round
      if (verb === 'turn') {
        let by = wrap(headingFor(d.player, args[1]) - f.heading);
        if (args[0] === 'cw' && by > 0) by -= 2 * Math.PI;
        if (args[0] === 'ccw' && by < 0) by += 2 * Math.PI;
        return Math.abs(by) / rate + 2.5;
      }
      if (verb === 'faceto') return Math.abs(wrap(headingFor(d.player, args[0]) - f.heading)) / rate + 2.5;
      if (verb === 'ring') return 4;
      if (verb === 'kneel' || verb === 'stand' || verb === 'gen' || verb === 'genhold' || verb === 'rise') return 3.5;
      return 7;
    },

    /** Which way you should be facing, in words. */
    faceWord() {
      const a = this.lastFace, is = t => Math.abs(wrap(a - t)) < 0.8, P = FIG.P, f = FIG[this.d.player];
      return is(Math.PI) ? 'the altar' : is(0) ? 'the people' : is(Math.PI / 2) ? 'the Epistle side' : is(-Math.PI / 2) ? 'the Gospel side' : Math.abs(wrap(a - Math.atan2(P.x - f.x, P.z - f.z))) < 0.8 ? 'the priest' : 'the way your place faces';
    },
    /** Standing the wrong way in your place: a word from the coach, then a slip. Nobody turns you. */
    checkFacing(d, f, c, dt) {
      if (this.lastFace == null || (c && (c.verb === 'go' || c.verb === 'turn' || c.verb === 'faceto' || USE_FIT.has(c.verb)))) { this.faceT = 0; this.faceSlipped = false; this.faceToasted = false; return; }
      if (this.autoing || f.walk || f.turn || f.manualWalk || f.posture === 'sit') return;      // busy with something, on the way round, or seated
      { const nx = this.next(); if (nx && nx.verb === 'faceto') { this.faceT = 0; return; } }      // already turning to where you are about to be facing
      for (const o of Object.values(FIG)) {      // face to face with someone is never the wrong way
        if (o === f || !o.root.visible) continue;
        const tx = o.x - f.x, tz = o.z - f.z;
        if (Math.hypot(tx, tz) < 1.3 && Math.abs(wrap(Math.atan2(tx, tz) - f.heading)) < FACE_OFF) { this.faceT = 0; return; }
      }
      if (this.lastGo && Math.hypot(f.x - spot(this.lastGo)[0], f.z - spot(this.lastGo)[1]) > 2.2) return;      // being out of place has its own reckoning
      if (Math.abs(wrap(f.heading - this.lastFace)) < FACE_OFF) { this.faceT = 0; this.faceSlipped = false; this.faceToasted = false; return; }
      this.faceT += dt;
      if (this.faceT > 1.2 && !this.faceToasted && !this.faceSlipped && UI.coach()) { this.faceToasted = true; UI.toast('Face ' + this.faceWord() + ' (← → turn you).'); }
      if (this.faceT > 3 && !this.faceSlipped) { this.faceSlipped = true; d.mistake('You were facing the wrong way', 'Face ' + this.faceWord() + '.', this.beat); }
    },

    /** At every moment of the Mass you have a place, or a way to the next: leaving it is a major slip, staying away a failure, and going up to the altar unbidden worse. */
    checkPlace(d, f, c, dt) {
      if (!this.anchor) this.anchor = [f.x, f.z];
      const seg = (px, pz, [ax, az], [bx, bz]) => {
        const ux = bx - ax, uz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * ux + (pz - az) * uz) / ((ux * ux + uz * uz) || 1)));
        return Math.hypot(px - ax - t * ux, pz - az - t * uz);
      };
      const going = c && c.verb === 'go', target = going ? spot(c.args[0]) : null;
      const off = going ? Math.min(seg(f.x, f.z, this.legFrom, target), Math.hypot(f.x - target[0], f.z - target[1])) : Math.hypot(f.x - this.anchor[0], f.z - this.anchor[1]);
      const limit = going ? 2.6 : 1.3;
      const closing = off < (this.lastOff == null ? off : this.lastOff) - 1e-4;     // coming back is always allowed
      this.lastOff = off;
      const canFail = d.o.failing !== false;
      const inAltar = (x, z) => Math.abs(x) < 2.65 && z < 0.9 && z > -2.3;      // the first step is where you kneel: above it is the altar's
      const entitled = going ? inAltar(target[0], target[1]) || inAltar(this.legFrom[0], this.legFrom[1]) : inAltar(this.anchor[0], this.anchor[1]);
      if (inAltar(f.x, f.z) && !entitled && off > 1.2) {     // on your way across the end of the steps is no offence; off it is
        this.altarT = (this.altarT || 0) + dt;
        if (this.altarT > 0.6 && !closing) {
          if (canFail) return d.fail('You walked up to the altar when you had no business there.', going ? describe(c.cmd)[0] : 'Keep your place.', this.beat && this.beat.cite), true;
          if (!this.altarSlip) { this.altarSlip = true; d.mistake('You walked up to the altar when you had no business there', '', this.beat, true); }
        }
      } else { this.altarT = 0; this.altarSlip = false; }
      if (off > limit) {
        if (!this.straying) { this.straying = true; this.strayT = 0; d.mistake('You left your place during the Mass', going ? describe(c.cmd)[0] : 'Stay where you belong until your next cue.', this.beat, true); }
        if (!closing) this.strayT += dt;
        if (canFail && (this.strayT > 3 || off > limit + 3)) return d.fail('You kept wandering about during the Mass.', 'Stay in your place, or on your way to the next one.', this.beat && this.beat.cite), true;
      } else if (off < limit * 0.6) this.straying = false;
      return false;
    },

    /** Walked square into someone. Always a major slip; it ends the Mass if it really knocks him. Returns true if it did. */
    bump(o, dt) {
      const d = this.d, f = FIG[d.player], role = Object.keys(FIG).find(r => FIG[r] === o), isP = role === 'P';
      const name = isP ? 'the priest' : role === 'A1' || role === 'A2' ? 'the other server' : 'a communicant';
      this.pushT = this.pushOn === o && this.t - this.pushLast < 0.3 ? this.pushT + dt : dt;
      this.pushOn = o; this.pushLast = this.t;
      const fresh = this.t - (o.bumpAt == null ? -99 : o.bumpAt) > 1.5;
      if (fresh) {
        o.bumps = this.t - (o.bumpAt == null ? -99 : o.bumpAt) < 30 ? (o.bumps || 0) + 1 : 1;
        o.bumpAt = this.t;
        o.stumble(false); chime('sacristy');
        d.mistake('You bumped into ' + name, 'Nobody walks through anybody: go round.', this.beat, true);
      }
      o.bumpAt = this.t;
      if (d.o.failing === false) return false;
      const carried = Props.held(role).filter(p => /^(chalice|ciborium|paten|wine|water|bowl|pitcher|missal|bells)$/.test(p) && !(p === 'biretta'));
      let why = null;
      if (isP) {
        if (carried.length && this.pushT > (o.stepping ? 0.7 : 0.25)) why = 'You knocked into the priest while he was carrying ' + (PROP_TEXT[carried[0]] || carried[0].replace(/^/, 'the ')) + '.';
        else if (o.y > 0.2 && this.pushT > 0.4) why = 'You shoved the priest on the altar steps.';
        else if (this.pushT > 0.5) why = 'You kept pushing into the priest until he nearly fell.';
        else if (o.bumps >= 2) why = 'You knocked into the priest a second time.';
      } else if (carried.length && this.pushT > 0.6) {
        why = 'You knocked ' + name + ' and ' + (PROP_TEXT[carried[0]] || carried[0]) + ' went flying.';
      }
      if (!why) return false;
      o.stumble(true);
      d.fail(why, 'Give the priest room, and go round people.');
      return true;
    },

    /** Without this the Mass cannot rightly go on: keeping with the priest, and what he needs brought to him. */
    essential(c) {
      const part = c.beat && c.beat.part, a0 = c.args[0];
      if (c.verb === 'go' && /^(Holy water at the door|Procession to the altar|Return to the sacristy)$/.test(part)) {
        // not for a missed mark: only for really not coming along
        const s = spot(c.args[0]), f = FIG[this.d.player];
        if (Math.hypot(f.x - s[0], f.z - s[1]) > 3) return 'You did not keep with the priest.';
      }
      if (/^(take|put|give|offer|hold)$/.test(c.verb) && /^(wine|water|pitcher|bowl|towel|missal|paten|biretta)$/.test(a0)) return 'The priest was left without ' + (PROP_TEXT[a0] || a0) + '.';
      if (c.verb === 'pour') return 'The priest was left waiting for the water to be poured.';
      if (c.verb === 'ring' && part === 'Consecration') return 'The bell was not rung at the Consecration.';
      return null;
    },

    /** The moment has passed. Most things the Mass can go on without, as a slip; some it cannot. */
    async miss() {
      const c = this.cur, d = this.d; if (!c || this.autoing) return;
      const why = d.o.failing !== false && this.essential(c);
      if (why) return d.fail(why, describe(c.cmd)[0], c.beat && c.beat.cite);
      this.autoing = true; c.mistakes++;
      d.mistake('Too late: ' + describe(c.cmd)[0], '', c.beat);
      const me = d.player, f = FIG[me], [a0, a1] = c.args;
      const out = name => { (Props.out[me] = Props.out[me] || new Set()).add(name); };
      switch (c.verb) {
        case 'take': Props.attach(a0, me); break;
        case 'put': Props.place(a0, a1); break;
        case 'give': Props.attach(a0, a1); if (a0 === 'biretta' && a1 === 'P') Props.worn = false; break;
        case 'offer': case 'hold': out(a0); break;
        case 'offerwater': out('water-fingers'); break;
        case 'light': case 'snuff': PROPS.sc.obj.userData.setLit(c.verb === 'light'); break;
        case 'open': case 'close': FX.gates[a0].open = c.verb === 'open' ? 1 : 0; break;
        case 'flip': case 'unflip': FX.cloths[a0].flipped = c.verb === 'flip' ? 1 : 0; break;
        case 'fold': Props.veilFolded = true; PROPS.veil.obj.userData.setState('folded'); break;
        case 'drop': f.lift = null; break;
        default: break;      // a bow or a step not made, a bell not rung: simply not done
      }
      this.autoing = false;
      this.done(false);
    },

    done(perfect = true) {
      const c = this.cur;
      if (!c) return;
      if (c.verb === 'turn') this.lastFace = headingFor(this.d.player, c.args[1]);
      if (c.verb === 'faceto') this.lastFace = headingFor(this.d.player, c.args[0]);
      if (c.verb === 'go') {
        if (/^w_/.test(c.args[0]) && c.next) this.owed.push({ at: spot(c.args[0]), next: c.next });
        else { this.stage += this.owed.length + 1; this.owed = []; }
        // arrived, your place is that spot; if the moment passed first you are judged from where you actually are
        const s = spot(c.args[0]), f = FIG[this.d.player];
        this.anchor = window.__serve.autoplay ? [s[0], s[1]] : [f.x, f.z];      // your place is where you came to stand
        this.lastOff = null; this.straying = false;
      }
      // together with the other server: a moment behind is human; a couple of seconds is a slip
      if (perfect && c.together && !window.__serve.autoplay) {
        const at = c.beat.togetherAt && c.beat.togetherAt[c.together], byHand = Grab.active || Grab.justLet;
        // by hand, what counts is when you began; and arriving side by side for a genuflection, you may still have to turn to the altar
        if (at != null && (byHand ? Grab.startedAt : this.t) - at > (byHand ? 3 : 1.6) + (c.need - 1) * 0.8 + (c.together.startsWith('sync ') ? 1.4 : 0)) {
          c.mistakes++;
          this.d.mistake('You were behind the other server', 'Move together with him: ' + describe(c.cmd)[0].toLowerCase() + '.', c.beat);
        }
      }
      if (perfect && !c.mistakes) this.d.results.ok++;
      this.cur = null; goRing.visible = false; goArrow.visible = false;
      UI.remind(null);
      const r = this.resolve; this.resolve = null;
      if (r) r();
    },

    /** Something the player did: does it match what is expected now? */
    act(type, arg) {
      if (Explore.active) return UI.paused ? undefined : Explore.act(type, arg);
      const d = this.d, f = d && FIG[d.player], c = this.cur;
      if (!d || d.kind !== 'play' || this.autoing || UI.paused) return;
      // not quite there, and getting on with what you came to do
      if (c && (c.verb === 'go' || c.verb === 'turn' || c.verb === 'faceto')) {
        const nx = this.nextAction(), s = nx && nx.to && spot(nx.to);
        if (nx && (nx.verb === type || (type === 'gen' && nx.verb === 'genhold')) && (!s || Math.hypot(f.x - s[0], f.z - s[1]) < 1.9)) return this.skipTo(() => this.act(type, arg));
      }
      const expect = c ? c.verb : null;
      const wrong = (msg) => {
        if (c) c.mistakes++;
        d.mistake(msg, c ? describe(c.cmd)[0] : 'Wait for your cue', this.beat);
      };
      const facing = (want, tol) => Math.abs(wrap(f.heading - want)) <= tol;
      const near = (n, r = 0.6) => { const s = spot(n); return Math.hypot(f.x - s[0], f.z - s[1]) <= r; };
      switch (type) {
        case 'kneel':
          if (f.posture !== 'stand' || f.walk) return;
          f.kneel();
          if (this.unknelt && expect !== 'kneel') { this.unknelt = false; return; }      // back on your knees: that is putting it right
          if (expect !== 'kneel') return wrong('You knelt — not now.');
          if (this.lastGo && !near(this.lastGo, 2.2)) return wrong('Kneel at ' + (SPOT_TEXT[this.lastGo] || this.lastGo) + ' — stand (↑) and go there.');
          if (this.lastFace != null && !facing(this.lastFace, FACE_OFF)) { this.faceSlipped = true; c.mistakes++; d.mistake('You knelt facing the wrong way', 'Face ' + this.faceWord() + ' (← → turn you).', this.beat); }
          return this.done();
        case 'stand':
          if (f.posture === 'stand') return;
          f.stand();
          if (expect === 'stand' || (expect === 'rise' && f.posture === 'stand')) return this.done();
          this.unknelt = true;
          return wrong('You stood up too early.');
        case 'gen':
          if (f.posture !== 'stand') return;
          if (expect === 'genhold') return this.act('genhold');      // the one button: you stay down when staying down is what comes next
          if (this.unheld && expect !== 'gen') { this.unheld = false; f.genHold(); return; }      // back down: that is putting it right
          f.genuflect();
          if (Math.abs(f.x) < 0.8) this.genSinceSide = true;
          if (expect !== 'gen') return wrong('A genuflection was not called for here.');
          if (this.lastGo && !near(this.lastGo, 2.2)) return wrong('Genuflect at ' + (SPOT_TEXT[this.lastGo] || this.lastGo) + '.');
          if (!facing(Math.PI, FACE_OFF)) { c.mistakes++; d.mistake('You genuflected facing the wrong way', 'Genuflect towards the altar.', this.beat); }
          return this.done();
        case 'genhold':
          if (f.posture !== 'stand') return;
          f.genHold();
          if (expect !== 'genhold') return wrong(expect === 'gen' ? 'Just genuflect and rise — no need to stay down.' : 'You genuflected — not now.');
          if (!facing(Math.PI, FACE_OFF)) { c.mistakes++; d.mistake('You genuflected facing the wrong way', 'Genuflect towards the altar.', this.beat); }
          return this.done();
        case 'rise':
          if (f.posture !== 'genhold') return;
          f.stand();
          if (expect === 'rise') return this.done();
          this.unheld = true;
          return wrong('Stay down until the priest reaches the top step.');
        case 'bow': {
          const lvl = arg === 'head' ? 1 : arg === 'deep' ? 3 : 2;
          if (f.bowLevel === lvl) {                 // second press: straighten up
            f.bow(0);
            if (expect === 'up') return this.done();
            this.unbowed = lvl;
            return wrong('You straightened up too early.');
          }
          if (this.unbowed && !f.bowLevel && expect !== 'bow') { f.bow(this.unbowed); this.unbowed = null; return; }      // going back down: that is putting it right
          const target = c && c.verb === 'bow' && c.args[1] && FIG[c.args[1]] ? FIG[c.args[1]].headWorld() : null;
          f.bow(lvl, target);
          if (expect === 'bow' && c.args[0] === arg) return this.done();
          if (expect === 'bow') return wrong(c.args[0] === 'head' ? 'Only your head is bowed here.' : `A ${c.args[0] === 'deep' ? 'profound' : 'moderate'} bow is wanted here.`);
          return wrong('No bow is called for here.');
        }
        case 'nod': {
          const target = c && c.verb === 'nod' && c.args[0] && FIG[c.args[0]] ? FIG[c.args[0]].headWorld() : null;
          f.nod(target);
          if (expect === 'nod') return this.done();
          return wrong('No bow of the head here — keep your head up.');
        }
        case 'cross': Gest.cross(f); return expect === 'cross' ? this.done() : wrong('No sign of the cross here.');
        case 'small': Gest.small(f); return expect === 'small' ? this.done() : wrong('The small crosses come only at the Gospel.');
        case 'strike':
          Gest.strike(f);
          if (expect !== 'strike') return wrong('No striking of the breast here.');
          if (++c.count >= c.need) this.done();
          return;
        case 'kiss': {
          Gest.kiss(f);
          if (expect !== 'kiss') return wrong('Nothing to kiss now.');
          const what = c.args[0];
          if (what === 'hand' && Math.hypot(f.x - FIG.P.x, f.z - FIG.P.z) > REACH) return UI.toast('Get close to the priest first.');
          if (what !== 'hand' && what !== 'cruets' && Props.holder(what) !== d.player) return UI.toast('You are not holding ' + (PROP_TEXT[what] || what) + '.');
          return this.done();
        }
        case 'ring': {
          if (expect === 'tug') return this.use();
          if (Props.holder('bells') !== d.player) return UI.toast('You don’t have the bells.');
          chime('hand'); Gest.ring(f);
          if (expect !== 'ring') return wrong('The bells are not rung here.');
          if (++c.count >= c.need) this.done();
          return;
        }
        case 'vest': {          // V: pinch the alb, lift or drop the chasuble
          if (expect === 'pinch') { this.d.exec(d.player, 'pinch'); return this.done(); }
          if (expect === 'lift') { if (Math.hypot(f.x - FIG.P.x, f.z - FIG.P.z) > REACH) return UI.toast('Go up beside the priest first.'); this.d.exec(d.player, 'lift'); return this.done(); }
          if (expect === 'drop') { f.lift = null; return this.done(); }
          if (f.lift) { f.lift = null; return wrong('You let go of the chasuble too soon.'); }
          return wrong('There is no vestment to hold now.');
        }
        case 'pour': {
          if (expect !== 'pour') return wrong('Nothing to pour now.');
          if (Props.holder(c.args[0]) !== d.player) return UI.toast('Pick up ' + (PROP_TEXT[c.args[0]] || c.args[0]) + ' first.');
          if (Math.hypot(f.x - FIG.P.x, f.z - FIG.P.z) > REACH) return UI.toast('Go closer to the priest.');
          this.runAuto();
          return;
        }
        case 'hand': {     // H: hold out your hand to receive what the priest gives
          if (expect === 'take' && Props.holder(c.args[0]) === 'P') {
            if (!(Props.out.P && Props.out.P.has(c.args[0]))) return UI.toast('Wait until the priest holds it out to you.');
            if (Math.hypot(f.x - FIG.P.x, f.z - FIG.P.z) > REACH) return UI.toast('Go closer to the priest.');
            this.runAuto();
            return;
          }
          f.out = true; f.outHand = 'R'; setTimeout(() => { if (!Props.held(d.player).length) f.out = false; }, 600);
          return wrong('You held out your hand when nothing was being given.');
        }
        case 'take': case 'put': case 'give': case 'touch': case 'gate': case 'candle': case 'fold': case 'sit':
          if (c && USE_AS[c.verb] === type) return this.use();
          return wrong('That is not what is wanted now.');
        case 'answer': return;
      }
    },

    /** A button for handling things: whatever the current task needs, if you are close enough. */
    use() {
      const d = this.d, f = FIG[d.player], c = this.cur;
      if (!c || !SPACE_VERBS.has(c.verb)) {
        if (c && c.verb === 'go') return UI.toast('First: ' + describe(c.cmd)[0].toLowerCase() + '.');
        if (c) { c.mistakes++; return d.mistake('Nothing to pick up or hand over now.', describe(c.cmd)[0], this.beat); }
        return d.mistake('Nothing to do with your hands now — wait for your cue.', '', this.beat);
      }
      const [a0, a1] = c.args;
      let target;
      switch (c.verb) {
        case 'take': {
          const hd = Props.holder(a0);
          if (hd === d.player) return UI.toast('You still have it: wait until the priest has taken it and holds it out to you.');
          if (hd === 'P') return UI.toast('Hold out your hand to the priest.');
          if (hd && hd !== d.player && !(Props.out[hd] && Props.out[hd].has(a0))) return UI.toast('Wait until ' + ROLE_TEXT(hd) + ' holds it out to you.');
          target = Props.worldPos(a0); break;
        }
        case 'put': target = C.PLACES[a1] ? V(C.PLACES[a1][0], C.PLACES[a1][1], C.PLACES[a1][2]) : Props.worldPos(a1); break;
        case 'give': target = V(FIG[a1].x, 1, FIG[a1].z); break;
        case 'offer': {     // to whoever is there to take it: usually the priest, or the other server
          const other = d.o.servers === 2 ? (d.player === 'A1' ? 'A2' : 'A1') : 'P';
          const near = [FIG.P, FIG[other]].sort((p, q) => Math.hypot(p.x - f.x, p.z - f.z) - Math.hypot(q.x - f.x, q.z - f.z))[0];
          target = V(near.x, 1, near.z); break;
        }
        case 'touch': target = V(FIG[a0].x, 1, FIG[a0].z); if (!(Props.out[a0] && Props.out[a0].has('water-fingers'))) return UI.toast('Wait for ' + ROLE_TEXT(a0) + ' to hold out his fingers.'); break;
        case 'light': case 'snuff': target = Props.worldPos('sc'); break;
        case 'open': case 'close': case 'flip': case 'unflip': target = fixturePos(a0); break;
        case 'dip': target = fixturePos('font'); break;
        case 'tug': target = fixturePos('sbell'); break;
        case 'sit': { const s = spot(this.lastGo || 'stoolE'); target = V(s[0], 0, s[1]); break; }
        default: target = null;
      }
      const short = target ? Math.hypot(f.x - target.x, f.z - target.z) : 0;
      if (target && short > 1.2 && short < 3.4 && f.posture === 'stand') {
        for (let reach = 0.9; reach < short - 0.05; reach += 0.1) {
          const k = reach / short, x = target.x + (f.x - target.x) * k, z = target.z + (f.z - target.z) * k;
          if (!Plan.free(x, z, 0.18, blocked)) continue;
          this.autoing = true;
          f.walkTo(x, z, { speed: WALK * d.o.speed, route: Nav.route(f.x, f.z, x, z) }).then(() => { this.autoing = false; if (this.cur === c) this.runAuto(); });
          return;
        }
      }
      if (target && short > 1.75) {
        const whom = c.verb === 'give' ? ROLE_TEXT(a1) : c.verb === 'offer' ? 'the one you are handing it to' : (PROP_TEXT[a0] || SPOT_TEXT[a0] || 'it');
        return UI.toast('Get closer to ' + whom + '.');
      }
      this.runAuto();
    },

    /** Carry out the current task's animation (keys that trigger a whole movement). */
    async runAuto() {
      const c = this.cur; if (!c || this.autoing) return;
      this.autoing = true;
      try { await this.d.exec(this.d.player, c.cmd, c.beat); } catch (e) { if (!(e instanceof Stopped)) throw e; }
      this.autoing = false;
      if (this.cur === c) this.done();
    },

    /** The answer offered while the priest is still speaking. */
    /** Typing a whole prayer: what your body has to do comes due as you reach the words for it. */
    cueUp(d, beat, t) {
      const a = UI.asking;
      if (!beat.cues || !a || !a.input) return;
      const words = Mass.words(t.la).map(w => soundOf(w.raw));
      const cues = beat.cues.map(({ at, cmd }) => {
        const w = at.split(' ').map(soundOf), i = words.findIndex((_, k) => w.every((x, m) => words[k + m] === x));
        return { cmd, n: words.slice(0, Math.max(0, i)).join('').length };
      });
      let next = 0;
      a.onType = n => {
        while (next < cues.length && n >= cues[next].n) {
          const { cmd } = cues[next++];
          if (this.cur && this.cur.isCue) this.miss();
          for (const r of ['A1', 'A2']) if (r !== d.player && beat.tracks[r]) d.exec(r, cmd, beat).catch(e => { if (!(e instanceof Stopped)) throw e; });
          this.expect(d, cmd, beat);
          this.cur.isCue = true;
        }
      };
      a.onType(a.progress);
    },
    /** A second and a half to choose or to start; going on with your own prayer, a little longer to find the next part. */
    timeFor(d, ref) { return /^confiteor-m\.0/.test(ref) || (d.o.respond !== 'type' && /^confiteor-m\.[1-7]$/.test(ref)) ? 3 : 1.5; },
    ready(d, ref, title) {
      const t = C.lineText(ref, Mass);
      return UI.ask(t, ref, d.o.respond, this.timeFor(d, ref), true, title);
    },
    /** Spoken responses: choose from four, or type. */
    async respond(d, ref, beat) {
      const t = C.lineText(ref, Mass);
      d.results.total++;
      const got = d.ready && d.ready.ref === ref ? d.ready.result : null;
      d.ready = null;
      UI.heard();      // he has finished: what you had ready is said now, and if nothing, your time starts
      const own = /^confiteor-m\.[0-7](-7)?$/.test(ref);      // going on with your own prayer: nobody has said anything to you
      const speaking = got || UI.ask(t, ref, d.o.respond, this.timeFor(d, ref), false, own ? 'You say' : 'Your response');
      this.cueUp(d, beat, t);
      const result = await speaking;
      if (this.cur && this.cur.isCue) this.miss();      // the line is over, and that moment with it
      d.check();
      if (result.ok) d.results.ok++;
      else if (result.stopped) d.mistake('You stopped speaking partway through', t.la, beat);
      else if (own) d.mistake(result.given == null ? 'You lost your place in the prayer' : 'Wrong words: “' + result.given + '”', t.la, beat);
      else d.mistake(result.given == null ? 'No response given in time' : 'Wrong response: “' + result.given + '”', t.la, beat);
      $('#caption').hidden = true;      // he has been answered
      // words take time to say, and while you say them you can look to the next
      if ((beat.tracks[d.player] || []).filter(c => c.startsWith('say ')).pop() === 'say ' + ref) {
        const next = d.nextSay();
        if (next) d.ready = { ref: next, result: this.ready(d, next, /^confiteor-m\.[0-7]$/.test(next) ? 'You say next' : 'Your response') };
      }
      if (own && d.o.respond !== 'type') await d.step(d.sleep((result.ok ? Math.max(1.4, t.la.length * 0.065) : 1) * d.o.speed));      // typed, it has already taken as long as it took
      else await d.step(d.sleep((t.dur || Math.min(4.5, Math.max(0.8, t.la.length * 0.028))) * SAY_SCALE * 0.6));
      d.answered[ref] = true;
    },

    /** Per-frame: walking, and whether "go" has been reached. */
    update(dt) {
      const d = this.d; if (!d || d.kind !== 'play' || d.failed) return;
      const f = FIG[d.player], c = this.cur;
      this.t = (this.t || 0) + dt;
      // have you really gone by the points the guide has cleared? only then may those behind you come on
      while (this.owed.length) {
        const { at, next } = this.owed[0];
        if (Math.hypot(f.x - at[0], f.z - at[1]) < 0.5 || Math.hypot(f.x - next[0], f.z - next[1]) < Math.hypot(at[0] - next[0], at[1] - next[1])) { this.stage++; this.owed.shift(); } else break;
      }
      // standing where someone has to pass
      if (!UI.paused) for (const [role, o] of Object.entries(FIG)) {
        if (o === f || o.blockedBy !== f) continue;
        const name = role === 'P' ? 'the priest' : 'the other server';
        if (o.blockedT > 1.2 && this.t - (o.blockSlipAt == null ? -99 : o.blockSlipAt) > 8) {
          o.blockSlipAt = this.t;
          d.mistake('You stood in ' + name + '’s way', 'Keep clear of where others have to walk.', this.beat, true);
        }
        if (o.blockedT > 6) {
          if (role === 'P' && d.o.failing !== false) return d.fail('The priest could not get past you.', 'Keep clear of where he has to walk.');
          if (o.walk) o.walk.ghost = f;      // otherwise they squeeze past at last, so that the Mass can go on
        }
      }
      // walking out of the Mass: from the procession until the return, your place is in the sanctuary
      if (d.o.failing !== false && !UI.paused) {
        const part = d.beats[d.index] ? d.beats[d.index].part : '', here = Plan.regionAt(f.x, f.z);
        const before = /^(Leaving the sacristy|Holy water at the door|Procession to the altar|Return to the sacristy|In the sacristy)$/.test(part);
        const allowed = before ? /sacristy|nave|sanctuary/i.test(here) : here === 'The sanctuary';
        this.away = allowed ? 0 : (this.away || 0) + dt;
        if (this.away > 2.5) { this.away = 0; return d.fail('You left ' + (before ? 'the church' : 'the sanctuary') + ' during the Mass.', 'Stay with the priest and in your place.'); }
      }
      if (!this.autoing && !UI.paused) {
        const turned = Input.turn(f, dt);
        if (turned && c && c.verb === 'turn') c.turned = (c.turned || 0) + turned;
      }
      // a turn wanted, made with ← → and come round to the right way: was it the right way round?
      if (c && c.verb === 'turn' && c.turned && !this.autoing && Math.abs(wrap(f.heading - headingFor(d.player, c.args[1]))) < 0.8) {
        if ((c.turned < 0) !== (c.args[0] === 'cw')) { c.mistakes++; d.mistake('You turned the wrong way round', 'Turn ' + (c.args[0] === 'cw' ? 'clockwise (→)' : 'counter-clockwise (←)') + '.', this.beat); }
        this.done();
        return;
      }
      if (c && !this.autoing && ((c.verb === 'up' && !f.bowLevel) || (c.verb === 'stand' && f.posture === 'stand') || (c.verb === 'kneel' && f.posture === 'kneel'))) { this.unbowed = null; this.unknelt = false; this.done(); return; }
      if (c && c.verb === 'faceto' && !this.autoing && !UI.paused && Math.abs(wrap(f.heading - headingFor(d.player, c.args[0]))) < 0.8) { this.done(); return; }
      const going = Input.walk();
      if (going && !this.autoing && f.posture === 'stand' && !UI.paused) {
        {
          const sp = WALK * d.o.speed * dt * (going < 0 ? BACK : 1);      // the same pace as everyone else in this Mass
          const wx = Math.sin(f.heading) * going, wz = Math.cos(f.heading) * going;
          const hit = Figure.blockedAt(f, f.x + wx * sp, f.z + wz * sp);
          if (hit) {
            // a glancing touch slides past; walking square into someone is a bump
            const tx = hit.x - f.x, tz = hit.z - f.z, tl = Math.hypot(tx, tz) || 1, square = (wx * tx + wz * tz) / tl;
            if (square > 0.6) { if (this.bump(hit, dt)) return; }
            else {
              const side = wx * -tz + wz * tx >= 0 ? 1 : -1, ax = -tz / tl * side, az = tx / tl * side;
              if (!Figure.blockedAt(f, f.x + ax * sp, f.z + az * sp)) { const [px, pz] = collide(f.x, f.z, f.x + ax * sp, f.z + az * sp); f.x = px; f.z = pz; }
            }
          } else {
            const [ox, oz] = collide(f.x, f.z, f.x + wx * sp, f.z + wz * sp);
            f.x = ox; f.z = oz;
          }
          f.phase += dt * 6.5 * going; f.walkingManual = 0.12;
          if (C.heightAt(f.x, f.z) >= 0.44 && c && c.verb === 'go' && C.heightAt(spot(c.args[0])[0], spot(c.args[0])[1]) < 0.3 && !this.warnedPace) {
            this.warnedPace = true; UI.toast('Go round the top step rather than across it, unless your task is up there.');
          }
        }
      }
      if (f.walkingManual > 0) { f.walkingManual -= dt; f.manualWalk = true; } else f.manualWalk = false;
      if (!this.autoing && !UI.paused && !window.__serve.autoplay && this.checkPlace(d, f, c, dt)) return;
      if (!UI.paused && !window.__serve.autoplay) { this.checkFacing(d, f, c, dt); if (d.failed) return; }
      // the moment for his alb is while he is on the steps: once he is at the top it has gone
      if (c && c.verb === 'pinch' && !this.autoing && !UI.paused && FIG.P.y >= C.heightAt(spot('P.mid')[0], spot('P.mid')[1]) - 0.03) { this.miss(); return; }
      if (c && c.verb === 'go' && !this.autoing) {
        const s = spot(c.args[0]);
        goRing.visible = UI.coach(); goArrow.visible = UI.coach();
        goArrow.position.set(s[0], C.heightAt(s[0], s[1]) + 0.5 + Math.sin(performance.now() / 250) * 0.05, s[1]);
        goArrow.rotation.set(Math.PI, 0, 0);
        // the circle is a guide, not a rule: near enough is there; and a point on the way is cleared once you are past it
        const away = Math.hypot(f.x - s[0], f.z - s[1]), isPoint = /^w_/.test(c.args[0]), nx = this.nextPoint;
        const past = isPoint && nx && Math.hypot(f.x - nx[0], f.z - nx[1]) < Math.hypot(s[0] - nx[0], s[1] - nx[1]);
        const handsOn = /^(el|com|cru|top|veil|st2|plate|abl|grad|cred|sed|pr\d|cr\d)/.test(c.args[0]);     // beside the priest or at the table you must be within reach
        if (f.posture === 'stand' && (away < (isPoint ? 1.1 : handsOn ? 0.55 : 0.9) || past)) this.done();
      }
      // nobody waits: what you have not done when its moment has passed is missed
      if (c && !this.autoing && !UI.paused) {
        const heldBy = c.verb === 'take' ? Props.holder(c.args[0]) : null;
        const waitingOnThem = (heldBy && (heldBy === d.player || !(Props.out[heldBy] && Props.out[heldBy].has(c.args[0]))))
          || (c.verb === 'touch' && !(Props.out[c.args[0]] && Props.out[c.args[0]].has('water-fingers')));
        if (!waitingOnThem && !window.__serve.autoplay) {
          c.left -= dt;
          if (c.left <= 0) {
            if (c.verb === 'go') {
              const s = spot(c.args[0]), away = Math.hypot(f.x - s[0], f.z - s[1]);
              const coming = c.lastAway == null || away < c.lastAway - 0.15;
              if (away < 1.9) {                 // close by, and nothing bad came of it; except where being in formation is the point
                if (/^cf/.test(c.args[0])) { c.mistakes++; d.mistake('You were not in close formation', describe(c.cmd)[0] + '.', c.beat); }
                this.done(false);
                return;
              }
              if (coming && (c.extra || 0) < 4) { c.extra = (c.extra || 0) + 1; c.lastAway = away; c.left = 1.5; }     // on your way: nobody minds
              else this.miss();
            } else this.miss();
          }
        }
      }
      // your answer, too, has its moment
      if (UI.asking && UI.asking.limit && !UI.asking.done && !UI.asking.hearing && !UI.paused) {
        UI.asking.left -= dt;
        const bar = document.querySelector('#respond .time-left');
        if (bar) bar.style.width = Math.max(0, Math.min(100, 100 * UI.asking.left / UI.asking.limit)).toFixed(1) + '%';
        if (UI.asking.left <= 0) UI.asking.expire();
      }
    },
    side: 0, genSinceSide: false,
  };

  // walls, altar, furniture: the walker cannot pass them (the plan knows the walls and the far furniture)
  const SOLID = [
    [-C.LAYOUT.mensa.x + 0.02, C.LAYOUT.wallBack, C.LAYOUT.mensa.x - 0.02, C.LAYOUT.mensa.z1 - 0.02],
    [C.LAYOUT.credence.x0 - 0.12, C.LAYOUT.credence.z0, C.LAYOUT.credence.x1 + 0.1, C.LAYOUT.credence.z1 + 0.1],
    [C.LAYOUT.sedilia.x - 0.35, C.LAYOUT.sedilia.z - 0.35, C.LAYOUT.sedilia.x + 0.35, C.LAYOUT.sedilia.z + 0.35],
    ...C.LAYOUT.columns.map(([x, z]) => [x - 0.28, z - 0.28, x + 0.28, z + 0.28]),
    [C.LAYOUT.lectern[0] - 0.25, C.LAYOUT.lectern[1] - 0.2, C.LAYOUT.lectern[0] + 0.25, C.LAYOUT.lectern[1] + 0.25],
    [2.32, -2.3, 2.88, -1.5], [-2.88, -2.3, -2.32, -1.5],
    [-C.LAYOUT.wallSide, C.LAYOUT.wallBack - 0.3, C.LAYOUT.wallSide, C.LAYOUT.wallBack],
  ];
  /** The altar and rail (whose gap closes with the gates), and the neighbouring houses. */
  function blocked(x, z, r) {
    for (const [a, b, c2, d2] of SOLID) if (x > a - r && x < c2 + r && z > b - r && z < d2 + r) return true;
    const rz = C.LAYOUT.rail;
    if (Math.abs(z - rz) < 0.1 + r && Math.abs(x) < Plan.CH.railX + 0.1) {
      const g = C.LAYOUT.gateHalf;
      if (Math.abs(x) > g - r) return true;
      if ((x >= 0 ? FX.gates.gateE : FX.gates.gateG).open < 0.5) return true;
    }
    if (CARS.solidAt(x, z, r)) return true;
    return OUT3D.inHouse(x, z);
  }
  function collide(x0, z0, x1, z1) {
    const free = (x, z) => Plan.free(x, z, 0.18, blocked);
    if (free(x1, z1)) return [x1, z1];
    if (!free(x0, z0)) {     // left tight against something: you can always walk out towards open floor
      for (const r of [0.1, 0.2, 0.3, 0.45, 0.6]) for (let i = 0; i < 16; i++) {
        const nx = x0 + r * Math.cos(i * Math.PI / 8), nz = z0 + r * Math.sin(i * Math.PI / 8);
        if (free(nx, nz)) return (x1 - x0) * (nx - x0) + (z1 - z0) * (nz - z0) > 0 ? [x1, z1] : [x0, z0];
      }
    }
    // slide along what is in the way, if that is mostly the way you are going
    const dx = x1 - x0, dz = z1 - z0, step = Math.hypot(dx, dz);
    if (Math.abs(dx) > step * 0.3 && free(x1, z0)) return [x1, z0];
    if (Math.abs(dz) > step * 0.3 && free(x0, z1)) return [x0, z1];
    // pressing against the wall just beside a door: it guides you into the doorway
    for (const d of Plan.DOORS) {
      const along = d.axis === 'x' ? x0 - d.c : z0 - d.c, off = d.axis === 'x' ? z0 - d.at : x0 - d.at;
      const into = (d.axis === 'x' ? dz : dx) * off < 0;
      if (!into || Math.abs(off) > 0.6 || Math.abs(along) > d.w / 2 + 0.8 || Math.abs(along) < 0.02) continue;
      const nudge = Math.sign(along) * Math.min(step, Math.abs(along));
      const [nx, nz] = d.axis === 'x' ? [x0 - nudge, z0] : [x0, z0 - nudge];
      if (free(nx, nz)) return [nx, nz];
    }
    // or ease round a corner
    for (const a of [0.7, -0.7, 1.3, -1.3]) {
      const c = Math.cos(a), s = Math.sin(a), nx = x0 + (dx * c + dz * s) * 0.7, nz = z0 + (dz * c - dx * s) * 0.7;
      if (free(nx, nz)) return [nx, nz];
    }
    // caught on a corner by a hand's breadth: you step round it
    for (const a of [0.06, 0.12, 0.18, 0.26]) for (const side of [1, -1]) {
      const px = -dz / step * side, pz = dx / step * side;
      if (free(x0 + px * a, z0 + pz * a) && free(x0 + px * a + dx, z0 + pz * a + dz) && free(x0 + px * step, z0 + pz * step)) return [x0 + px * step, z0 + pz * step];
    }
    // walking at the rail just beside an open gate: it guides you into the opening
    const g = C.LAYOUT.gateHalf, gap = g - 0.18;
    if (Math.abs(z0 - C.LAYOUT.rail) < 0.4 && Math.abs(x0) >= gap - 0.02 && Math.abs(x0) < g + 0.7 && (z1 - z0) * (z0 - C.LAYOUT.rail) < 0) {
      const nx = x0 - Math.sign(x0) * Math.max(Math.abs(z1 - z0), 0.01);
      if (free(nx, z0)) return [nx, z0];
    }
    return [x0, z0];
  }

  // ─── walking around the church and grounds ─────────────────────────────────
  const Explore = {
    active: false, region: '', runHeld: false,
    start() {
      if (director) director.stop();
      director = null; Player.d = null; Player.cur = null;
      UI.paused = false; $('#pause').hidden = true; $('#failed').hidden = true;
      Grab.reset();
      resetWorld({ servers: 1, communion: false });
      FIG.P.root.visible = false;
      this.active = true;
      const f = FIG.A1, [x, z] = Plan.world(8, 15);
      f.place(x, z, Math.PI); f.y = 0;
      camera.position.set(x, 3, z + 4.6);
      Cam.fixed = false; Cam.offset = 0; Cam.snap = true;
      youRing.visible = false; goRing.visible = false; goArrow.visible = false;
      for (const id of ['#caption', '#note', '#respond', '#remind']) $(id).hidden = true;
      $('#explore-bar').hidden = false;
      document.body.dataset.mode = 'explore';
      UI.show('hud');
      this.region = '';
      this.setRegion();
    },
    stop() { this.active = false; $('#explore-bar').hidden = true; FIG.P.root.visible = true; },
    setRegion() {
      const f = FIG.A1, r = Plan.regionAt(f.x, f.z);
      if (r !== this.region) {
        this.region = r; $('#part').textContent = r;
        $('#btn-serve-here').hidden = r !== 'The sacristy';
      }
    },
    update(dt) {
      if (!this.active || UI.paused) return;
      const f = FIG.A1;
      Input.turn(f, dt);
      const going = Input.walk();
      if (going && f.posture === 'stand') {
        const indoors = /sacristy|servers|sanctuary|nave|narthex|parish hall$|auditorium/i.test(this.region);
        const sp = (indoors ? 1.7 : 3.1) * (this.runHeld ? 2 : 1) * (going < 0 ? BACK : 1) * dt;
        const [ox, oz] = collide(f.x, f.z, f.x + Math.sin(f.heading) * going * sp, f.z + Math.cos(f.heading) * going * sp);
        f.x = ox; f.z = oz;
        f.phase += dt * (indoors ? 6.5 : 9) * (this.runHeld ? 1.5 : 1) * going;
        f.walkingManual = 0.12;
      }
      if (f.walkingManual > 0) { f.walkingManual -= dt; f.manualWalk = true; } else f.manualWalk = false;
      this.setRegion();
    },
    /** Kneeling, bowing and the rest are simply yours to do here: nothing is expected or marked. */
    act(type, arg) {
      const f = FIG.A1;
      switch (type) {
        case 'kneel': if (f.posture === 'stand') f.kneel(); return;
        case 'stand': case 'rise': if (f.posture !== 'stand') f.stand(); return;
        case 'gen': if (f.posture === 'stand') f.genuflect(); return;
        case 'genhold': if (f.posture === 'stand') f.genHold(); return;
        case 'nod': f.nod(); return;
        case 'bow': f.bow(f.bowLevel ? 0 : arg === 'deep' ? 3 : 2); return;
        case 'cross': Gest.cross(f); return;
        case 'small': Gest.small(f); return;
        case 'strike': Gest.strike(f); return;
        case 'sit': if (f.posture === 'stand') f.sit(); return;
      }
    },
  };

  /** Knowing the room: where one can walk, and how to get across it past whatever is in the way. */
  const Nav = {
    G: 0.2, x0: -14, z0: -4, nx: 125, nz: 70, cells: null,
    solid(x, z) {
      const r = 0.1;
      if (!Plan.free(x, z, r)) return true;
      for (const [a, b, c2, d2] of SOLID) if (x > a - r && x < c2 + r && z > b - r && z < d2 + r) return true;
      if (Math.abs(z - C.LAYOUT.rail) < 0.1 + r && Math.abs(x) < Plan.CH.railX + 0.1) {
        const g = C.LAYOUT.gateHalf;
        if (Math.abs(x) > g - r) return true;
        if ((x >= 0 ? FX.gates.gateE : FX.gates.gateG).open < 0.5) return true;
      }
      return false;
    },
    clear(ax, az, bx, bz, people) {
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 0.1));
      for (let i = 0; i <= n; i++) {
        const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
        if (this.solid(x, z)) return false;
        if (people) for (const o of people) if (Math.hypot(x - o.x, z - o.z) < 0.5) return false;
      }
      return true;
    },
    /** The way from a to b: null if the straight line will do, else the corners to go by. */
    route(ax, az, bx, bz, people) {
      if (this.clear(ax, az, bx, bz, people)) return null;
      const { G, x0, z0, nx, nz } = this, id = (i, j) => i + j * nx;
      const cell = (x, z) => [Math.round((x - x0) / G), Math.round((z - z0) / G)];
      const pos = (i, j) => [x0 + i * G, z0 + j * G];
      const open = (i, j) => { if (i < 0 || j < 0 || i >= nx || j >= nz) return false; const [x, z] = pos(i, j); if (this.solid(x, z)) return false; return !people || people.every(o => Math.hypot(x - o.x, z - o.z) > 0.5); };
      const [si, sj] = cell(ax, az), [ti, tj] = cell(bx, bz), came = new Map([[id(si, sj), -1]]), q = [[si, sj]];
      let end = null;
      for (let h = 0; h < q.length && h < 6000; h++) {
        const [i, j] = q[h];
        if (Math.abs(i - ti) <= 1 && Math.abs(j - tj) <= 1) { end = [i, j]; break; }
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const ni = i + a, nj = j + b;
          if (came.has(id(ni, nj)) || !open(ni, nj)) continue;
          came.set(id(ni, nj), id(i, j)); q.push([ni, nj]);
        }
      }
      if (!end) return null;
      const path = [];
      for (let k = id(end[0], end[1]); k !== -1 && k != null; k = came.get(k)) path.unshift(pos(k % nx, Math.floor(k / nx)));
      // draw the corners out of it: nobody walks a staircase across a room
      const out = []; let from = [ax, az], i = 0;
      while (i < path.length) {
        let far = i;
        for (let k = path.length - 1; k > i; k--) if (this.clear(from[0], from[1], path[k][0], path[k][1], people)) { far = k; break; }
        out.push(path[far]); from = path[far]; i = far + 1;
      }
      return out;
    },
  };
  Figure.freeAt = (x, z) => !Nav.solid(x, z);
  Figure.replan = (f, w) => Nav.route(f.x, f.z, w.x, w.z, Figure.bodies.filter(o => o !== f && o.root.visible));

  /** Doors swing open for anyone who comes near. */
  function updateDoors(dt) {
    for (const door of Object.values(SITE3D.doors)) {
      const d = door.d;
      const cx = d.axis === 'x' ? d.c : d.at, cz = d.axis === 'x' ? d.at : d.c;
      let near = false;
      for (const f of Object.values(FIG)) if (f.root.visible && Math.hypot(f.x - cx, f.z - cz) < 1.5) { near = true; break; }
      door.open += ((near ? 1 : 0) - door.open) * Math.min(1, dt * 7);
      for (const it of door.items) it.pivot.rotation.y = -door.open * 1.5 * it.dir;
    }
  }

  // ─── keyboard and touch ────────────────────────────────────────────────────
  const Input = {
    down: {},
    held(k) {
      const s = this.down[k];
      if (!s || s.gen) return false;
      return k !== 'ArrowDown' || s.bot || performance.now() - s.t > 130;      // a tap of ↓ may be the first half of a genuflection, and walks nowhere
    },
    /** ← and → turn you, on your feet or on your knees. Returns the amount turned. */
    turn(f, dt) {
      const way = (this.held('ArrowLeft') ? 1 : 0) - (this.held('ArrowRight') ? 1 : 0);
      if (!way || (f.posture !== 'stand' && f.posture !== 'kneel')) return 0;
      if (f.turn) { const t = f.turn; f.turn = null; t.resolve(t.signed); }      // your hand on the wheel now
      const by = way * TURN_RATE * dt;
      f.heading = wrap(f.heading + by);
      return by;
    },
    /** ↑ forward, ↓ back, always straight along the way you face: +1, -1 or 0. */
    walk() { return (this.held('ArrowUp') ? 1 : 0) - (this.held('ArrowDown') ? 1 : 0); },
    key(k, isDown) {
      const now = performance.now();
      if (isDown) {
        if (this.down[k]) return;
        this.down[k] = { t: now };
        if (k === 'ArrowDown' && this.tapAt != null && now - this.tapAt < 330) { this.tapAt = null; this.down[k].gen = true; audio(); Player.act('gen'); }
        return;
      }
      const s = this.down[k]; delete this.down[k];
      if (!s) return;
      if (k === 'ArrowUp' && now - s.t < 200 && !s.stood) this.rise();      // ↑ from your knees stands you up
      if (k === 'ArrowDown' && !s.gen && now - s.t < 200) this.tapAt = now;
    },
    rise() {
      const f = Explore.active ? FIG.A1 : Player.d && Player.d.player && FIG[Player.d.player];
      if (f && f.posture === 'genhold') { Player.act('rise'); return true; }
      if (f && (f.posture === 'kneel' || f.posture === 'sit')) { Player.act('stand'); return true; }
      return false;
    },
    update() {
      const up = this.down.ArrowUp;      // ↑ held from your knees stands you up, as a tap does
      if (up && !up.stood && performance.now() - up.t > 200) up.stood = this.rise() || 'walking';
    },
  };
  let altAlone = false;
  window.addEventListener('keydown', e => {
    if (e.key === 'Alt') { altAlone = !e.repeat || altAlone; e.preventDefault(); } else altAlone = false;
  }, true);
  window.addEventListener('keyup', e => {
    if (e.key !== 'Alt') return;
    e.preventDefault();
    if (altAlone) { altAlone = false; audio(); Player.moveBody(); }
  });
  window.addEventListener('blur', () => { altAlone = false; });
  window.addEventListener('keydown', e => {
    const box = UI.asking && UI.asking.input;
    if (box && document.activeElement !== box && e.key.length === 1 && /\p{L}/u.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) { box.focus(); return; }
    if (e.key.startsWith('Arrow') && e.target.closest && e.target.closest('textarea')) { Input.key(e.key, true); e.preventDefault(); return; }
    if (e.key === 'Control' && e.target.closest && e.target.closest('textarea')) { standOrSit(); e.preventDefault(); return; }
    if (e.key === 'Shift') Explore.runHeld = true;
    if ((e.key === 'w' || e.key === 'W') && !e.repeat && !(e.target.closest && e.target.closest('input, textarea, select'))) {
      const order = ['auto', 'clear', 'partly', 'overcast', 'rain'], m = order[(order.indexOf(SKY.mode) + 1) % order.length];
      SKY.setMode(m); setOpt('weather', m); audio();
      UI.toast('Weather: ' + (m === 'auto' ? 'changing by itself' : Weather.NAMES[m]));
      return;
    }
    if (e.target.closest && e.target.closest('input, textarea, select')) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.key === 'Escape') { UI.togglePause(); e.preventDefault(); return; }
    if (e.key === 'Shift' && !e.repeat && !Explore.active) { audio(); Player.act('kneel'); return; }
    if (e.key === 'Control' && !e.repeat) { audio(); standOrSit(); e.preventDefault(); return; }
    if (e.key === ' ') { if (!e.repeat) { audio(); Player.act('cross'); } e.preventDefault(); return; }
    if ((e.key === 'r' || e.key === 'R') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) { Cam.offset = 0; e.preventDefault(); return; }
    if (UI.asking && !UI.asking.input && /^[1-4]$/.test(e.key)) { UI.pick(+e.key - 1); e.preventDefault(); return; }
    if (e.key.startsWith('Arrow')) { Input.key(e.key, true); e.preventDefault(); return; }
  });
  window.addEventListener('keyup', e => { if (e.key === 'Shift') Explore.runHeld = false; if (e.key.startsWith('Arrow')) Input.key(e.key, false); });
  /** One thing for your legs: up if you are down, down onto a seat if there is one. */
  function standOrSit() {
    const f = Explore.active ? FIG.A1 : Player.d && Player.d.player && FIG[Player.d.player];
    if (!f) return;
    if (f.posture === 'genhold') return Player.act('rise');
    if (f.posture !== 'stand') return Player.act('stand');
    if (canSit(f)) Player.act('sit');
  }
  const canSit = f => (Player.cur && Player.cur.verb === 'sit') || ['stoolE', 'stoolG'].some(n => { const at = spot(n); return Math.hypot(f.x - at[0], f.z - at[1]) < 1.3; });
  // drag to look around; R or a double click brings the camera back behind you
  { let drag = null;
    canvas.addEventListener('dblclick', () => { Cam.offset = 0; });
    const capture = id => { try { canvas.setPointerCapture(id); } catch (err) { /* a test's made-up pointer */ } };
    canvas.addEventListener('pointerdown', e => {
      audio();
      if (Grab.down(e.clientX, e.clientY)) return capture(e.pointerId);      // your own body first
      if (!Cam.fixed) { drag = e.clientX; capture(e.pointerId); }
    });
    canvas.addEventListener('pointermove', e => {
      Grab.move(e.clientX, e.clientY);
      if (drag != null) { Cam.offset -= (e.clientX - drag) * 0.006; drag = e.clientX; }
    });
    const end = () => { drag = null; Grab.up(); };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  }
  window.addEventListener('blur', () => { for (const k of Object.keys(Input.down)) Input.key(k, false); });

  // ─── screens ───────────────────────────────────────────────────────────────
  const UI = {
    paused: false, asking: null,
    coach() { return director && director.kind === 'play' && director.o.mode === 'coach'; },

    show(id) {
      for (const s of $$('.screen')) s.hidden = s.id !== id;
      document.body.dataset.screen = id;
    },
    beat(d, b, i) {
      if (b.part !== this.lastPart) { this.lastPart = b.part; $('#caption').hidden = true; }
      $('#part').textContent = b.part;
      $('#progress').style.width = (100 * i / d.beats.length).toFixed(1) + '%';
      if (d.kind !== 'play' && b.note && d.kind === 'watch') this.note(b.note, b.cite);
    },
    note(text, cite) {
      const el = $('#note');
      fill(el, h('div', null, text), cite ? h('div', { class: 'cite' }, cite) : null);
      el.hidden = !text;
    },
    caption(who, t, role) {
      const el = $('#caption');
      fill(el,
        h('div', { class: 'cap-row' }, h('span', { class: 'cap-who ' + (role === 'P' ? 'p' : 's') }, who),
          h('span', { class: 'cap-la' + (t.silent ? ' silent' : '') + (t.la.length > 110 ? ' long' : '') }, t.la)),
        opts.english && t.en ? h('div', { class: 'cap-en' + (t.la.length > 110 ? ' long' : '') }, t.en) : null);
      el.hidden = false;
      el.classList.remove('fresh'); void el.offsetWidth; el.classList.add('fresh');
    },
    /** Is there a line waiting to be typed, or being typed, right now? */
    typing() { return !!(this.asking && this.asking.input); },
    /** One line: the button, what it is for, and if the moment has a short reason, that. */
    remind(c, beat) {
      const el = $('#remind'), on = !!c && opts.reminders && !window.__serve.autoplay && !!director && director.kind === 'play';
      el.hidden = !on; document.body.classList.toggle('reminding', on);
      if (!on) return;
      const [text, hint] = describe(c.cmd), button = this.typing() && BODY_VERBS.has(c.verb) ? 'Alt' : hint;
      // the reason, from the sentences that are about you: what the other server does is not your hint
      const me = director.player, other = me === 'A1' ? 'A2' : 'A1', note = beat && ((beat.notes && beat.notes[me]) || beat.note) || '';
      let why = (note.replace(/^[….\s]+/, '').split(/(?<=[.!?…])\s/).find(x => director.o.servers !== 2 || !new RegExp('\\b' + other + '\\b').test(x) || new RegExp('\\b' + me + '\\b').test(x)) || '').replace(/[….\s]+$/, '');
      why = why.length > 0 && why.length <= 90 && why.toLowerCase() !== text.toLowerCase() ? why[0].toUpperCase() + why.slice(1) + '.' : '';
      fill(el, h('b', { class: 'remind-btn' }, button), h('span', null, text + (text.endsWith('.') ? '' : '.')), why ? h('span', { class: 'remind-why' }, why) : null);
    },
    mistake(text, expected, major) {
      $('#mistakes').textContent = (director.results.slips || 0) + ' / ' + SLIP_LIMIT;
      if (major) { this.toast('Major slip: ' + text, 'bad major'); return; }
      if (director.o.mode === 'strict') return;
      this.toast(text + (expected ? ' — ' + expected : ''), 'bad');
    },
    toast(text, kind) {
      const el = h('div', { class: 'toast ' + (kind || '') }, text);
      $('#toasts').append(el);
      setTimeout(() => el.classList.add('out'), 2600);
      setTimeout(() => el.remove(), 3200);
    },
    /** Ask for a response; resolves { ok, given }. */
    ask(t, ref, mode, limit, hearing, title = 'Your response') {
      if (window.__serve.autoplay) return Promise.resolve({ ok: true, given: t.la });
      const el = $('#respond');
      el.hidden = false;
      return new Promise(resolve => {
        const finish = (ok, given, stopped) => { this.asking = null; el.hidden = true; if (mode === 'type') this.remind(Player.cur, Player.beat); resolve({ ok, given, stopped: !!stopped }); };
        const timer = h('div', { class: 'time' }, h('div', { class: 'time-left' }));
        const expire = () => finish(false, null);
        if (mode === 'type') {
          // like speaking: you have as long to begin as anyone choosing, and after that every letter keeps you going. Stop, and you have stopped.
          const said = Mass.words(t.la), expected = said.map(w => soundOf(w.raw));
          const input = h('textarea', { rows: 2, placeholder: 'Start typing…', spellcheck: 'false', autocapitalize: 'off', 'aria-label': 'What you say' });
          const fb = h('div', { class: 'fb' }), okSoFar = h('span', { class: 'typed-ok' }), rest = h('span', { class: 'typed-rest' });
          fill(fb, okSoFar, rest);
          // each letter is worth its share of the time the line takes to say, at four syllables a second
          const perLetter = syllables(t.la) / (opts.syllables || 4) / Math.max(1, expected.join('').length);
          const a = { limit, left: limit, perLetter, hearing: !!hearing, chosen: null, progress: 0, input, text: t.la, near: new Set(), muddled: 0, offLine: false,
            // going wrong and going quiet are different things, and you should be told which
            expire: () => a.offLine ? finish(false, input.value.trim()) : finish(false, null, a.progress > 0) };
          a.pick = () => {
            if (a.done) return;
            a.done = true;
            if (a.muddled) this.toast('Near enough. The line is: ' + t.la);
            else if (a.near.size) this.toast('Near enough. It is “' + [...a.near].map(i => said[i].raw.replace(/[^\p{L}]/gu, '')).join('”, “') + '”.');
            finish(true, input.value);
          };
          input.addEventListener('input', () => {
            const f = followLine(expected, input.value);
            a.near = f.near; a.muddled = f.muddled; a.offLine = f.lost;
            input.classList.toggle('off-line', f.lost);
            okSoFar.textContent = said.map(w => w.raw).join(' ').slice(0, Math.round(f.n / Math.max(1, f.total) * t.la.length));
            if (f.n > a.progress) { if (!a.hearing) a.left += (f.n - a.progress) * perLetter; a.progress = f.n; if (a.onType) a.onType(f.n); }      // only getting further along the line keeps you going
            if (f.done) { if (a.hearing) a.chosen = 0; else a.pick(); }
          });
          input.addEventListener('keydown', e => {
            if (e.key === 'Enter') e.preventDefault();
            if (e.key === ' ' && Player.cur && Player.cur.verb === 'cross') { e.preventDefault(); e.stopPropagation(); audio(); Player.act('cross'); return; }
            if (!e.key.startsWith('Arrow') && e.key !== 'Control' && e.key !== 'Escape') e.stopPropagation();      // you can still turn and walk while you speak
          });
          const hint = h('button', { class: 'btn', tabindex: -1, onmousedown: e => e.preventDefault(), onclick: () => { rest.textContent = '   ' + Mass.initials(t.la); } }, 'First letters');
          fill(el, timer, h('div', { class: 'ask-title' }, title), opts.english ? h('div', { class: 'ask-en' }, t.en) : null, input, fb, h('div', { class: 'ask-row' }, hint));
          this.asking = a;
          this.remind(Player.cur, Player.beat);
          if (!hearing) setTimeout(() => input.focus(), 30);
          return;
        }
        const choices = distractors(t, ref);
        const buttons = choices.map((c, i) => h('button', { class: 'choice', onclick: () => this.pick(i) }, h('span', { class: 'n' }, i + 1), c.la));
        fill(el, timer, h('div', { class: 'ask-title' }, title), h('div', { class: 'choices' }, buttons));
        this.asking = {
          limit, left: limit, expire, hearing: !!hearing, chosen: null,
          answer: choices.findIndex(c => c.la === t.la),
          pick: i => {
            if (this.asking.done) return;
            if (this.asking.hearing) {      // he has not finished: this is only what you have ready, and you can change your mind
              this.asking.chosen = i;
              buttons.forEach((b, j) => b.classList.toggle('picked', j === i));
              return;
            }
            this.asking.done = true;
            const ok = choices[i].la === t.la;
            buttons.forEach((b, j) => b.classList.add(choices[j].la === t.la ? 'right' : j === i ? 'wrong' : 'dim'));
            setTimeout(() => finish(ok, choices[i].la), ok ? 350 : 1400);
          },
        };
      });
    },
    pick(i) { if (this.asking && this.asking.pick) this.asking.pick(i); },
    /** He has finished speaking: what you had ready, you say; otherwise your time starts now. */
    heard() {
      const a = this.asking;
      if (!a || !a.hearing) return;
      a.hearing = false;
      if (a.input) a.input.focus();
      if (a.chosen != null) a.pick(a.chosen);
    },
    togglePause() {
      if (!Explore.active && (!director || director.kind === 'demo' || director.failed)) return;
      this.paused = !this.paused;
      $('#pause').hidden = !this.paused;
    },
    failed(d, reason, expected, cite) {
      this.asking = null; $('#respond').hidden = true; this.remind(null); goRing.visible = false; goArrow.visible = false;
      fill($('#failed-body'), h('p', { class: 'fail-why' }, reason), expected ? h('p', null, 'What was needed: ' + expected) : null, cite ? h('div', { class: 'cite' }, cite) : null,
        h('p', { class: 'fail-part' }, 'During: ' + (d.results.failure.part || '') + ' · ' + d.results.ok + ' of ' + d.results.total + ' done right so far.'));
      $('#failed').hidden = false;
      window.__serve.failedAt = d.results.failure;
    },
    ended(d) {
      window.__serve.finished = (window.__serve.finished || []).concat([{ kind: d.kind, o: d.o, time: d.time, results: d.results, log: d.log, beats: d.beats.length }]);
      if (d.kind === 'demo') { setTimeout(() => startDemo(), 1500); return; }
      if (d.kind === 'watch') { this.toast('The Mass has ended. Ite, missa est.'); setTimeout(() => toTitle(), 2500); return; }
      const r = d.results;
      const majors = r.mistakes.filter(m => m.major).length;
      const pct = r.total ? Math.max(0, Math.round(100 * (r.ok - majors * 3) / r.total)) : 0;     // a major slip costs three
      fill($('#summary-body'),
        h('div', { class: 'big' }, pct + '%'),
        h('p', null, `${r.ok} of ${r.total} actions and responses done right first time · ${r.mistakes.length} slip${r.mistakes.length === 1 ? '' : 's'}${majors ? `, ${majors} of them major` : ''}.`),
        r.mistakes.length ? h('ol', { class: 'slips' }, r.mistakes.slice(0, 60).map(m => h('li', null,
          h('div', { class: 'slip-part' }, m.part), h('div', null, (m.major ? 'Major: ' : '') + m.text), m.expected ? h('div', { class: 'slip-exp' }, 'Expected: ' + m.expected) : null,
          m.cite ? h('div', { class: 'cite' }, m.cite) : null))) : h('p', null, 'A flawless Mass. Deo grátias.'));
      this.show('summary');
    },
  };

  /** Four Latin choices for a response: the right one, and three plausible others. */
  /** Syllables of a Latin text: its vowels and diphthongs, leaving out the u of qu and of ngu before a vowel. */
  function syllables(text) {
    const plain = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/qu/g, 'q').replace(/ngu(?=[aeio])/g, 'ng');
    return (plain.match(/ae|oe|au|[aeiouy]/g) || []).length;
  }

  // Following what is typed as a listener follows speech: Latin is spelled many ways, and nobody hears a dropped letter.
  const soundOf = raw => Mass.normWord(raw).replace(/ae|oe/g, 'e').replace(/y/g, 'i').replace(/ph/g, 'f').replace(/h/g, '').replace(/k/g, 'c').replace(/t(?=i[aeiou])/g, 'c').replace(/(.)\1/g, '$1');
  const letGo = len => len <= 1 ? 0 : len <= 4 ? 1 : len <= 8 ? 2 : 3;      // letters a word of this length can be out by
  /** Differences between a and b; if prefix, against whichever beginning of b is nearest (a is still being typed). */
  function apart(a, b, prefix) {
    let row = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const next = [i];
      for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      row = next;
    }
    return prefix ? Math.min(...row) : row[b.length];
  }
  /** How far through a line someone has got: how many letters of it, whether they have finished, and whether they have lost it. */
  function followLine(expected, typed) {
    const parts = typed.trim().split(/\s+/).filter(p => soundOf(p)), open = !/\s$/.test(typed);
    const room = Math.floor(expected.length / 4);      // words of a long line that can be missed or muddled
    let i = 0, partial = 0, muddled = 0, lost = false;
    const near = new Set();
    parts.forEach((p, k) => {
      if (i >= expected.length) return;
      const key = soundOf(p), last = open && k === parts.length - 1;
      for (let j = i; j < Math.min(expected.length, i + 1 + (room ? 2 : 0)); j++) {
        const w = expected[j], whole = apart(key, w), fits = last ? apart(key, w, true) <= letGo(w.length) && key.length <= w.length + letGo(w.length) : whole <= letGo(w.length);
        if (!fits) continue;
        muddled += j - i;
        const endsLine = last && j === expected.length - 1 && whole <= letGo(w.length) && key.length >= w.length - 1;
        if (!last || endsLine) { if (whole) near.add(j); i = j + 1; partial = 0; } else { i = j; partial = Math.min(key.length, w.length); }
        return;
      }
      if (last) { lost = true; return; }
      muddled++;
      // a word in place of another: if what comes after carries on from the next one, that is one mistake and not two
      const after = parts[k + 1] && soundOf(parts[k + 1]), then = expected[i + 1];
      if (i + 1 < expected.length && (!after || apart(after, then, true) <= letGo(then.length))) i++;
    });
    if (muddled > room) lost = true;
    const total = expected.join('').length, n = expected.slice(0, i).join('').length + partial;
    return { n, total, done: i >= expected.length && !lost, lost, near, muddled };
  }

  function distractors(t, ref) {
    const pool = Mass.LINES.filter(l => (l.who === 'S' || l.who === 'A') && l.la !== t.la);
    const sec = /^([\w-]+)\./.exec(ref);
    const same = sec ? pool.filter(l => l.section === sec[1]) : [];
    const pickN = (arr, n) => { const a = arr.slice(); const out = []; while (a.length && out.length < n) out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]); return out; };
    const uniq = new Map();
    for (const l of [...pickN(same, 2), ...pickN(pool.filter(l => Math.abs(l.la.length - t.la.length) < 30), 6), ...pickN(pool, 6)]) if (!uniq.has(l.la)) uniq.set(l.la, l);
    const wrong = [...uniq.values()].slice(0, 3);
    const all = [t, ...wrong];
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    return all;
  }

  // ─── starting and stopping ─────────────────────────────────────────────────
  let director = null;
  window.__serve = { get director() { return director; }, FIG, Props, Player, C, UI, Input, autoplay: params.has('autoplay'),
    Cam, Grab, Fix, FX, headingFor, syllables, followLine, soundOf, Explore, Plan, Nav, camera, renderer, scene, collide, walkFree: (x, z) => Plan.free(x, z, 0.18, blocked), SKY, CARS, OUT3D, SITE3D,
    start: (kind, o) => { Object.assign(opts, o || {}); kind === 'play' ? beginPlay() : kind === 'explore' ? Explore.start() : startWatch(); } };

  function resetWorld(o) {
    Props.reset(); Fix.reset();
    const start = { P: 'sacP', A1: 'sacA1', A2: 'sacA2', C1: 'C1.out', C2: 'C2.out', C3: 'C3.out', C4: 'C4.out' };
    for (const [r, f] of Object.entries(FIG)) {
      for (const g of f.gestures) g.resolve();
      f.gestures = []; f.walk = null; f.turn = null; f.legAnim = null; f.lift = null; f.out = false; f.base = null;
      f.keepBehind = null; f.stepping = false; f.walkLook = null; f.tilt = 0; f.jolt = 0; f.blockedBy = null; f.blockedT = 0; f.isPlayer = false; f.bumps = 0; f.bumpAt = null; f.blockSlipAt = null;
      f.bowLevel = 0; f.nodT = 0; f.posture = 'stand'; f.legPose = [0, 0, 0, 0, window.FigureDims.hip, 0];
      const s = C.SPOTS[start[r]]; f.place(s[0], s[1], s[2]); f.y = 0;
      Props.syncHands(r);
    }
    FIG.A2.root.visible = o.servers === 2;
    for (const r of ['C1', 'C2', 'C3', 'C4']) FIG[r].root.visible = !!o.communion;
  }

  function begin(kind, o) {
    if (Explore.active) Explore.stop();
    Explore.region = '';
    Cam.snap = true; Cam.offset = 0; camera.position.set(-10.8, 2.2, 5.5); Cam.lookNow.set(-10.8, 1.2, 7);
    if (director) director.stop();
    UI.paused = false; $('#pause').hidden = true; $('#failed').hidden = true; Player.away = 0;
    resetWorld(o);
    director = new Director(kind, o);
    if (director.player) FIG[director.player].isPlayer = true;
    $('#mistakes').textContent = '0 / ' + SLIP_LIMIT;
    $('#caption').hidden = true; $('#note').hidden = true; $('#respond').hidden = true; UI.remind(null); UI.asking = null;
    youRing.visible = kind === 'play';
    Grab.reset();
    Player.d = director; Player.cur = null; Player.lastGo = null; Player.lastFace = null; Player.autoing = false; Player.warnedPace = false;
    Player.unbowed = null; Player.unknelt = false; Player.unheld = false; Player.then = null; Player.faceT = 0; Player.faceSlipped = false; Player.faceToasted = false; Player.side = 0; Player.genSinceSide = false; Player.anchor = null; Player.lastOff = null; Player.straying = false; Player.altarT = 0;
    document.body.dataset.mode = kind;
    document.body.dataset.coach = o.mode === 'coach' ? '1' : '0';
    director.run();
  }
  function startDemo() { begin('demo', Object.assign({}, opts, { servers: 2, speed: 1.25, communion: true, sermon: 'random' })); UI.show('title'); }
  function toTitle() { startDemo(); }
  function startWatch() { begin('watch', Object.assign({}, opts)); UI.show('hud'); }
  function beginPlay() { audio(); begin('play', Object.assign({}, opts)); document.body.classList.toggle('typing', opts.respond === 'type'); UI.show('hud'); }
  /** Coming to serve: with two servers, you have to say which you are. */
  function startPlay() {
    audio();
    if (opts.servers !== 2) return beginPlay();
    $('#failed').hidden = true;
    $('#which').hidden = false;
  }

  // ─── options screen ────────────────────────────────────────────────────────
  const OPTION_UI = [
    ['Servers', 'servers', [[1, 'One server'], [2, 'Two servers']]],
    ['Responses', 'respond', [['choose', 'Choose from four'], ['type', 'Type the Latin']]],
    ['Help (the Mass never waits for you, either way)', 'mode', [['coach', 'Circles on the floor and warnings'], ['strict', 'None']]],
    ['Typing: syllables you must keep up per second', 'syllables', [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']], () => opts.respond === 'type'],
    ['Reminders at the top: which button, and why', 'reminders', [[true, 'On'], [false, 'Off']]],
    ['Camera while serving', 'camera', [['follow', 'Behind you'], ['fixed', 'Fixed above the gate']]],
    ['Sermon from the lectern', 'sermon', [['off', 'Never'], ['random', 'Sometimes'], ['always', 'Always']]],
    ['Communion of the faithful', 'communion', [[true, 'Yes'], [false, 'Servers only']]],
    ['Confiteor before Communion', 'confiteor', [[true, 'Said'], [false, 'Omitted (1962 rubrics)']]],
    ['Gloria', 'gloria', [[true, 'Said'], [false, 'Not said']]],
    ['Creed', 'creed', [[true, 'Said'], [false, 'Not said']]],
    ['Altar-rail cloth', 'railCloth', [['none', 'Laid before Mass'], ['agnus', 'Flip after the Agnus Dei'], ['dnsd', 'Flip at the first Domine non sum dignus'], ['blood', 'Flip after the Precious Blood']]],
    ['Bell at the minor elevation', 'bellMinorElevation', [[true, 'Ring'], [false, 'No']]],
    ['Bell at Domine, non sum dignus', 'bellDomineNonSum', [[true, 'Ring'], [false, 'No']]],
    ['Sacristy versicle', 'sacristyVersicle', [['procedamus', 'Procedamus in pace'], ['adjutorium', 'Adjutorium nostrum']]],
    ['Weather', 'weather', [['auto', 'Changes by itself'], ['clear', 'Clear'], ['partly', 'Partly cloudy'], ['overcast', 'Overcast'], ['rain', 'Rain']]],
    ['Detail (takes effect when the page reloads)', 'quality', [['auto', 'Auto (' + window.Quality.level + ')'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']]],
    ['English captions', 'english', [[true, 'Show'], [false, 'Hide']]],
    ['Sound', 'sound', [[true, 'On'], [false, 'Off']]],
  ];
  function renderOptions() {
    const body = $('#options-body');
    fill(body, ...OPTION_UI.filter(([, , , when]) => !when || when()).map(([label, key, choices]) =>
      h('div', { class: 'opt' }, h('div', { class: 'opt-label' }, label),
        h('div', { class: 'seg' }, choices.map(([v, text]) => h('button', {
          'aria-pressed': String(opts[key] === v), onclick: () => { setOpt(key, v); if (key === 'weather') SKY.setMode(v); renderOptions(); },
        }, text))))),
      h('div', { class: 'opt' }, h('div', { class: 'opt-label' }, 'Speed of the Mass ', h('span', { id: 'speed-val' }, opts.speed + '×')),
        h('input', { type: 'range', min: 0.5, max: 4, step: 0.25, value: opts.speed, 'aria-label': 'Speed',
          oninput: e => { setOpt('speed', +e.target.value); $('#speed-val').textContent = opts.speed + '×'; if (director && director.kind !== 'demo') director.o.speed = opts.speed; } })));
  }

  // ─── touch controls ────────────────────────────────────────────────────────
  function buildTouch() {
    const pad = $('#dpad'), acts = $('#acts');
    const hold = (el, key) => {
      const down = e => { e.preventDefault(); el.setPointerCapture && el.setPointerCapture(e.pointerId); Input.key(key, true); el.classList.add('on'); };
      const up = e => { e.preventDefault(); Input.key(key, false); el.classList.remove('on'); };
      el.addEventListener('pointerdown', down); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    };
    for (const [k, label] of [['ArrowUp', '▲'], ['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['ArrowDown', '▼']]) {
      const b = h('button', { class: 'pad-' + k.slice(5).toLowerCase(), 'aria-label': k.slice(5) }, label); pad.append(b); hold(b, k);
    }
    // [label, what it does, its name, for touch screens only?]: the rest of you moves by hand
    const did = (...a) => () => Player.act(...a);
    const A = [
      ['Genu\u00adflect', did('gen'), 'gen', 1],
      ['Kneel', did('kneel'), 'kneel', 1], ['Stand', standOrSit, 'legs', 1], ['Sign of the cross', did('cross'), 'cross', 1], ['Move my body', () => Player.moveBody(), 'body', 1],
    ];
    for (const [label, tap, name, touchOnly] of A) {
      const b = h('button', { tabindex: -1, 'data-act': name, class: touchOnly ? 'touch-only' : '' }, label);
      b.addEventListener('mousedown', e => e.preventDefault());      // the keyboard stays with the game
      b.addEventListener('pointerdown', e => { e.preventDefault(); audio(); if (!b.classList.contains('off')) tap(); });
      acts.append(b);
    }
    const rem = $('#btn-remind'), mark = () => { rem.textContent = 'Reminders: ' + (opts.reminders ? 'on' : 'off'); };
    mark();
    rem.addEventListener('mousedown', e => e.preventDefault());
    rem.addEventListener('click', () => { setOpt('reminders', !opts.reminders); mark(); UI.remind(Player.cur, Player.beat); });
    UI.markRemind = mark;
  }
  /** Your legs: what the one button does depends on how you are, and it says so. */
  let actsAt = 0;
  function updateActs(dt) {
    actsAt -= dt;
    if (actsAt > 0) return;
    actsAt = 0.1;
    const f = Explore.active ? FIG.A1 : director && director.kind === 'play' && director.player ? FIG[director.player] : null;
    if (!f) return;
    for (const b of $('#acts').children) {
      const n = b.dataset.act, standing = f.posture === 'stand';
      if (n === 'legs') { b.textContent = standing ? 'Sit' : 'Stand'; b.classList.toggle('off', standing && !canSit(f)); }
      if (n === 'kneel' || n === 'gen') b.classList.toggle('off', !standing);
    }
  }

  // ─── the loop ──────────────────────────────────────────────────────────────
  let last = performance.now();
  const TURBO = +params.get('turbo') || 0;     // tests: many fixed steps per frame
  let frameNo = 0;
  if (TURBO) {
    // each step is its own task, so awaited animations resume between steps as they would at 60 fps
    const mc = new MessageChannel();
    let n = 0;
    mc.port1.onmessage = () => { step(1 / 60); if (++n % TURBO === 0) setTimeout(() => mc.port2.postMessage(0), 0); else mc.port2.postMessage(0); };
    mc.port2.postMessage(0);
  }
  function frame(now) {
    const real = Math.min(0.05, (now - last) / 1000); last = now;
    if (!TURBO) step(real);
    if (!TURBO || (frameNo++ % 8) === 0) renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  function step(real) {
    if (window.__serve.onStep) window.__serve.onStep(real);
    const speed = director ? (director.kind === 'demo' ? 1 : director.o.speed) : 1;
    const sim = UI.paused || window.__serve.frozen != null || (director && director.failed) ? 0 : real * speed;    // the Mass does not stop for anyone's answer
    Input.update();
    if (director) { director.tick(sim); director.pollConditions(); }
    Player.update(real);
    Explore.update(real);
    const me = director && director.player ? FIG[director.player] : null;
    for (const f of Object.values(FIG)) {
      // your own figure keeps moving while the Mass waits for your answer
      f.update((f === me && sim === 0 && !UI.paused) || (Explore.active && !UI.paused) ? real : sim, C.heightAt);
      if (f.manualWalk && f.posture === 'stand') {
        const s = Math.sin(f.phase);
        f.legs.R.hip.rotation.x = -0.4 * s; f.legs.L.hip.rotation.x = 0.4 * s;
        f.legs.R.knee.rotation.x = Math.max(0, -s) * 0.5; f.legs.L.knee.rotation.x = Math.max(0, s) * 0.5;
      }
    }
    Props.update(); Fix.update(sim || real); updateDoors(real);
    // who the camera follows when they are away from the altar
    const focus = Explore.active ? FIG.A1 : me || FIG.P;
    Cam.update(real, focus, Explore.active || (!!me && opts.camera !== 'fixed'));
    updateActs(real);
    Grab.update();
    const viewFrom = Plan.regionAt(camera.position.x, camera.position.z);
    const seeOut = !Cam.fixed && viewFrom !== 'The sanctuary';
    Sun.update(focus, seeOut && !SKY.indoors);
    OUT3D.group.visible = seeOut; CARS.group.visible = seeOut; SITE3D.outGroup.visible = seeOut;
    if (seeOut) { CARS.update(real); OUT3D.update(camera, performance.now() / 1000); }
    SKY.indoors = Cam.fixed || /sacristy|servers|sanctuary|nave|narthex|parish hall$|auditorium/i.test(viewFrom);
    SKY.update(real, camera, { audio, sound: opts.sound });
    if (director && director.player) {
      const f = FIG[director.player];
      youRing.position.set(f.x, f.y + 0.012, f.z);
    }
    // the host held up at the elevation
    hostMesh.visible = !!(director && director.hostUp);
    if (hostMesh.visible) { hostMesh.position.copy(FIG.P.handWorld('R').add(FIG.P.handWorld('L')).multiplyScalar(0.5)).add(V(0, 0.08, 0)); hostMesh.rotation.y = FIG.P.heading; }
  }
  const hostMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.004, 24), new THREE.MeshStandardMaterial({ color: 0xf8f1dc, emissive: 0x332a18 }));
  hostMesh.rotation.x = Math.PI / 2; scene.add(hostMesh);

  SKY.setMode(opts.weather || 'auto');

  /** Indoors the sun's shadow map stays on the sanctuary; outdoors it follows you, and the buildings and trees cast. */
  const Sun = {
    out: null, last: 0, key: world.lights.key,
    casts(on) {
      SITE3D.group.traverse(o => { if (o.isMesh && o.parent === SITE3D.group) o.castShadow = on; });
      if (window.Quality.level !== 'low') for (const o of OUT3D.casters) o.castShadow = on;
    },
    update(f, outside) {
      if (window.Quality.level === 'low') return;
      const k = this.key, cam = k.shadow.camera;
      if (outside !== this.out) {
        this.out = outside;
        this.casts(outside);
        Object.assign(cam, outside ? { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 220 } : { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 20 });
        cam.updateProjectionMatrix();
        k.shadow.bias = outside ? -0.0012 : -0.0008;
        if (!outside) { k.position.set(3.5, 7, 6); k.target.position.set(0, 0.5, -0.5); k.target.updateMatrixWorld(); renderer.shadowMap.autoUpdate = true; }
        else renderer.shadowMap.autoUpdate = false;
        this.last = 0;
      }
      if (!outside) return;
      const t = performance.now();
      if (t - this.last > 400) {     // the sun's shadows are slow to change: no need for every frame
        this.last = t;
        k.position.set(f.x + 35, 70, f.z + 60); k.target.position.set(f.x, 0, f.z); k.target.updateMatrixWorld();
        renderer.shadowMap.needsUpdate = true;
      }
    },
  };

  // ─── wiring the screens ────────────────────────────────────────────────────
  $('#btn-play').addEventListener('click', startPlay);
  $('#btn-watch').addEventListener('click', startWatch);
  $('#btn-explore').addEventListener('click', () => { audio(); Explore.start(); });
  $('#btn-serve-here').addEventListener('click', startPlay);
  $('#btn-options').addEventListener('click', () => { renderOptions(); $('#options').hidden = false; });
  $('#btn-controls').addEventListener('click', () => { $('#controls').hidden = false; });
  for (const b of $$('[data-close]')) b.addEventListener('click', () => { b.closest('.panel').hidden = true; });
  $('#btn-pause').addEventListener('click', () => UI.togglePause());
  $('#btn-resume').addEventListener('click', () => UI.togglePause());
  $('#btn-restart').addEventListener('click', () => { if (Explore.active) return Explore.start(); const k = director.kind; k === 'play' ? beginPlay() : startWatch(); });
  $('#btn-quit').addEventListener('click', toTitle);
  $('#btn-again').addEventListener('click', startPlay);
  $('#btn-fail-restart').addEventListener('click', beginPlay);      // the same Mass again: you are still who you were
  for (const b of $$('[data-role]')) b.addEventListener('click', () => { setOpt('role', b.dataset.role); $('#which').hidden = true; beginPlay(); });
  $('#btn-which-back').addEventListener('click', () => { $('#which').hidden = true; });
  $('#btn-fail-title').addEventListener('click', () => { $('#failed').hidden = true; toTitle(); });
  $('#btn-title').addEventListener('click', toTitle);
  $('#btn-pause-options').addEventListener('click', () => { renderOptions(); $('#options').hidden = false; });
  const touch = matchMedia('(pointer: coarse)').matches || params.has('touch');
  document.body.classList.toggle('touch', touch);
  buildTouch();

  if (params.get('mode') === 'play') startPlay();
  else if (params.get('mode') === 'watch') startWatch();
  else startDemo();
  if (params.has('speed') && director) director.o.speed = +params.get('speed');
  requestAnimationFrame(frame);
})();
