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
    servers: 2, role: 'A1', respond: 'type', typeHelp: 'easy', mode: 'coach', speed: 1, pace: 'natural', quality: 'auto', weather: 'auto', camera: 'follow',
    communion: true, confiteor: true, gloria: true, creed: true, sermon: 'random', railCloth: 'none',
    bellMinorElevation: true, bellDomineNonSum: true, sacristyVersicle: 'procedamus',
    english: true, sound: true, labels: true, reminders: true, syllables: 4,
    volume: 1, volBells: 1, volSteps: 1, volOutdoors: 1, volRain: 1, testSkip: false,
  };
  const params = new URLSearchParams(location.search);
  const saved = store.get('opts', {});
  let opts = Object.assign({}, OPTS, saved);
  delete opts.failing; delete opts.turn;      // no longer choices: anyone who once chose them gets what everyone gets
  if (!('typeHelp' in saved)) opts.respond = OPTS.respond;      // every option is saved together, so an old "choose" was no choice: typing, the easy way, is where everyone now starts
  if (!('pace' in saved) && saved.speed === 1.25) opts.speed = 1;      // the old starting speed, saved along with everything else: not a choice either
  const setOpt = (k, v) => { opts[k] = v; store.set('opts', opts); };

  // What is compressed is the reading — the priest's texts and the responses (SAY_SCALE). Everything the body does goes at a person's
  // pace at Mass: an unhurried walk, a genuflection of about two seconds, gestures at their written length. Nothing is sudden.
  // Figure.slow (the Pace option) stretches the gestures, and GAPS is the breath taken before each thing you have to do, while the
  // reminder of it is already showing: what is never sudden is the moment, not the walk. The speed of the Mass runs the whole clock.
  const PACE = 1, SAY_SCALE = 0.3, WALK = 1.4, SLIP_LIMIT = 10, FACE_OFF = 1.2, TURN_RATE = 1.8, BACK = 0.7;
  const PACES = { unhurried: 1.25, natural: 1, brisk: 0.8 };
  const GAPS = { unhurried: 2.4, natural: 1.5, brisk: 0.7 };
  const walk = () => WALK;      // how fast a server walks in this Mass, before its speed: a person's ordinary walk, whatever the pace
  Figure.slow = PACES[opts.pace] || 1;
  /** Facing the way asked. Where that is the altar, looking at the altar itself from off to one side of it (from the credence, say) is facing it too. */
  const facesWay = (f, want, tol = FACE_OFF) => {
    if (Math.abs(wrap(f.heading - want)) <= tol) return true;
    if (Math.abs(wrap(want - Math.PI)) > 0.2) return false;
    const m = C.LAYOUT.mensa;
    return Math.abs(wrap(f.heading - Math.atan2(-f.x, (m.z0 + m.z1) / 2 - f.z))) <= tol;
  };
  const SERVER_PAUSE = 0.35, SERVER_TEMPO = 0.75;      // the other server: a moment between one thing and the next, and hands at a person's pace, not the compressed gestures

  // ─── renderer, camera, world ───────────────────────────────────────────────
  const canvas = $('#stage');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: params.has('test') });
  Tex.setAnisotropy(Math.min(16, renderer.capabilities.getMaxAnisotropy()));
  // at the higher levels a plain screen is drawn finer than its own pixels and scaled down, so thin edges (candles, fingers, lace) do not step;
  // if that costs too much the picture eases back towards the screen's own resolution, never below it
  const Sharp = {
    floor: Math.min(window.Quality.dpr, window.devicePixelRatio || 1),
    want: Math.min(window.Quality.dpr, Math.max(window.devicePixelRatio || 1, window.Quality.ss || 1)),
    t: 0, n: 0, slow: 0,
    watch(real) {
      if (this.want <= this.floor) return;
      this.t += real; this.n++;
      if (this.t < 2) return;
      const ms = this.t / this.n * 1000; this.t = 0; this.n = 0;
      this.slow = ms > 24 ? this.slow + 1 : 0;
      if (this.slow >= 2) { this.slow = 0; this.want = Math.max(this.floor, this.want - 0.25); renderer.setPixelRatio(this.want); resize(); }
    },
  };
  renderer.setPixelRatio(Sharp.want);
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
  const WIDE = Northridge.build(scene, World, OUT3D);
  { const near = OUT3D.inHouse; OUT3D.inHouse = (x, z) => near(x, z) || WIDE.solidAt(x, z); }
  const CART = Carts.build(OUT3D.group, Traffic.cartBays());
  let walkerOut = null;         // whoever is out and about, for the traffic to mind
  const CARS = Traffic.build(scene, () => walkerOut, OUT3D.inHouse, CART);
  const SKY = Weather.build(scene, World, world.lights, { windowMat: SITE3D.windowMat, wetMats: [...SITE3D.wetMats, ...(OUT3D.wetMats || []), ...WIDE.wetMats] });
  // a little sky for the paint and glass of every vehicle to reflect
  const TRANSIT_DEPS = () => ({ cars: CARS.cars, focus: () => { const f = walkerOut; return f ? [f.x, f.z] : [0, 20]; }, ahead: CARS.ahead, amb: AMB, nearestRoad: WIDE.nearestRoad });
  { const pm = new THREE.PMREMGenerator(renderer), sc = new THREE.Scene(), sph = new THREE.Mesh(new THREE.SphereGeometry(20, 24, 12), new THREE.ShaderMaterial({ side: THREE.BackSide, vertexShader: 'varying vec3 v; void main() { v = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'varying vec3 v; void main() { float h = normalize(v).y; vec3 sky = mix(vec3(0.82, 0.88, 0.95), vec3(0.28, 0.48, 0.82), pow(max(h, 0.0), 0.5)), ground = mix(vec3(0.34, 0.33, 0.3), vec3(0.14, 0.14, 0.13), min(1.0, -h * 2.0)); gl_FragColor = vec4(h > 0.0 ? sky : ground, 1.0); }' })); sc.add(sph); Traffic.setEnv(pm.fromScene(sc, 0.02).texture); pm.dispose(); }
  const AMB = Ambient.build(scene, { audio: () => audio(), stepLevel: () => opts.volSteps, camera, figures: () => Object.values(FIG), sky: SKY, statue: OUT3D.statue, parent: OUT3D.group, inHouse: OUT3D.inHouse });
  const Ride = {
    on: false, kind: '', v: null, car: null, lx: 0, lz: 0, seated: true, inside: null, seat: null,
    /** What you are riding in, for where to put you: the bus, or this coach of the train. */
    get frame() { return this.kind === 'train' ? this.car : this.v; },
  };
  const TRANSIT = Transit.build(CARS.group, Object.assign(TRANSIT_DEPS(), { gone: v => { if (PEOPLE) PEOPLE.emptyVehicle(v); } }));
  const RAIL = Rail.build(CARS.group, { amb: AMB, focus: () => { const f = walkerOut; return f ? [f.x, f.z] : [0, 20]; }, riding: () => Ride.on && Ride.kind === 'train' });
  const PEOPLE = People.build(scene, { cars: CARS, transit: TRANSIT, rail: RAIL, wide: WIDE, amb: AMB, inHouse: OUT3D.inHouse, ride: Ride, focus: () => { const f = walkerOut; return f ? [f.x, f.z] : [0, 20]; } });
  CARS.hooks.parked = c => PEOPLE.unload(c);
  CARS.hooks.people = () => PEOPLE.onRoad();
  CARS.hooks.barriers = () => RAIL.barriers;

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
  // from above and between the server and the priest, over their heads, looking down on to the Gospel half of the mensa: from the end of the altar
  // the server's own back hides his hands; from here both men's hands, the burse, the corporal and the veil's face over the front edge are all in sight
  const SHOT_VEIL = { pos: V(-0.36, 3.0, 0.22), look: V(-0.34, 1.36, -0.66), fov: 46 };
  const SHOT_OFFER = { pos: V(0.42, 3.0, 0.42), look: V(0.5, 1.38, -0.62), fov: 46 };      // the Offertory: high between the priest and the server, over the veil handed across and folded
  const Cam = {
    massFov: 60, walkFov: 60, fixed: true, yaw: 0, view: 0, offset: 0, pitch: 0, armBase: 3.2, armRoom: 3.2, snap: true,
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
    /** Where to look from while your hands are at a task within reach: you, the thing and where it goes in the picture, from above the shoulder of your working hand.
     *  Chosen once as the task begins, from what stands still: never from your moving hands, or the view would chase them while you drag them. Null when there is none. */
    taskView(f) {
      const d = director, c = Player.cur;
      if (!d || d.kind !== 'play' || f !== FIG[d.player]) return null;
      if (Grab.active && this.taskFixed) return this.taskFixed;      // while you have hold of a hand the view never moves, even as one task gives way to the next
      if (!(c && TASK_VIEW.has(c.verb))) return null;
      if (this.taskCue === c && this.taskFixed && Math.hypot(f.x - this.taskFrom[0], f.z - this.taskFrom[1]) < 0.35) return this.taskFixed;
      this.taskCue = c; this.taskFrom = [f.x, f.z]; this.taskFixed = null;
      const mine = p => Props.holder(p) === d.player;      // in your hands it goes where they go: they are framed already
      const at = p => (!p || mine(p) || !(Props.loc[p] || C.PLACES[p]) ? null : C.PLACES[p] && !Props.loc[p] ? V(C.PLACES[p][0], C.PLACES[p][1], C.PLACES[p][2]) : Props.worldPos(p));
      const [a0, a1] = c.args, things = [];
      switch (c.verb) {
        case 'put': things.push(at(a1)); break;
        case 'light': case 'snuff': things.push(at('sc')); break;
        case 'give': case 'offer': case 'hold': case 'pour': things.push(at(a0), Math.hypot(FIG.P.x - f.x, FIG.P.z - f.z) < 2 ? V(FIG.P.x, FIG.P.y + 1.1, FIG.P.z) : null); break;
        case 'fold': things.push(V(f.x + Math.sin(f.heading) * 0.35, f.y + 1.0, f.z + Math.cos(f.heading) * 0.35)); break;
        default: things.push(at(a0));      // take
      }
      const near = things.filter(p => p && Number.isFinite(p.x) && Math.hypot(p.x - f.x, p.z - f.z) < 2.2);
      if (!near.length) return null;      // the thing is not near yet
      const ps = [V(f.x + Math.sin(f.heading) * 0.3, f.y + 0.95, f.z + Math.cos(f.heading) * 0.3), ...near, ...near];      // the things count twice: it is them you need to see, close
      const mid = ps.reduce((s, p) => s.add(p), V()).multiplyScalar(1 / ps.length);
      if (Math.hypot(mid.x - f.x, mid.z - f.z) > 1.4) return null;
      const r = Math.max(0.3, ...ps.map(p => p.distanceTo(mid)));
      let ux = mid.x - f.x, uz = mid.z - f.z, ul = Math.hypot(ux, uz);
      if (ul < 0.1) { ux = Math.sin(f.heading); uz = Math.cos(f.heading); ul = 1; }
      ux /= ul; uz /= ul;
      const hR = f.handWorld('R'), hL = f.handWorld('L'), side = (hR.x - hL.x) * uz - (hR.z - hL.z) * ux >= 0 ? 1 : -1, px = uz * side, pz = -ux * side;      // the right-hand side, whatever the arms are doing
      const D = Math.max(0.8, Math.min(2.0, r / Math.tan(camera.fov * Math.PI / 360 * 0.85) + 0.3)), down = 1.1;
      const bx = -ux * Math.cos(down) + px * 0.6, bz = -uz * Math.cos(down) + pz * 0.6, bl = Math.hypot(bx, bz, Math.sin(down));
      this.taskFixed = { goal: V(mid.x + bx / bl * D, mid.y + Math.sin(down) / bl * D, mid.z + bz / bl * D), look: mid };
      return this.taskFixed;
    },
    /** At the Offertory, while the veil is handed across and folded; and after the Ablutions, while the veil, the burse and the corporal are seen to on the Gospel side: from high at that end of the altar, the priest's
     *  hands, the chalice, the burse held open and the veil over the front edge all in the one picture, whoever you are and wherever the camera was. */
    shot() {
      const d = director, b = d && d.beats && d.beats[d.index];
      if (!b || d.failed || d.ended) return null;
      const cmds = Object.values(b.tracks).map(l => l.join(';')).join(';');
      // at the Offertory: from when the server comes up for the veil the priest holds out, until he has laid it down, folded, on the Epistle side
      if (/fold veil/.test(cmds)) {
        if (Props.loc.veil === 'altar.veil') return null;
        if (Props.holder('veil') === 'P') {      // only once the server coming for it is nearly there
          const who = Object.keys(b.tracks).find(r => b.tracks[r].includes('fold veil')), f = FIG[who], at = spot('veilTop');
          if (!f || Math.hypot(f.x - at[0], f.z - at[1]) > 1.2) return null;
        }
        return SHOT_OFFER;
      }
      if (!/put veil altar\.veilG|hold burse|g foldCorporal|g veilChalice|g burseOnChalice/.test(cmds)) return null;
      if (/g burseOnChalice/.test(cmds) && Props.loc.burse === 'chalice') return null;      // done: back to the Mass
      if (/put veil altar\.veilG/.test(cmds) && Props.loc.veil !== 'altar.veilG') {      // only once the server bringing it is nearly there
        const who = Object.keys(b.tracks).find(r => b.tracks[r].includes('put veil altar.veilG')), f = FIG[who], at = spot('veilG');
        if (!f || Math.hypot(f.x - at[0], f.z - at[1]) > 1.2) return null;
      }
      return SHOT_VEIL;
    },
    /** Is someone at this place within view of the fixed camera? */
    atAltar(x, z) { return Math.abs(x) < 5.9 && z < C.LAYOUT.rail + 1.5; },
    update(dt, f, always) {
      if (Ride.on) {
        const c = Ride.frame, co = Math.cos(c.h), si = Math.sin(c.h), eye = Ride.inside.floor + (Ride.seated ? 1.12 : 1.58);
        const x = c.x + Ride.lx * co + Ride.lz * si, z = c.z - Ride.lx * si + Ride.lz * co;
        const yw = c.h + f.heading - this.offset, a = Math.max(-1.3, Math.min(1.3, this.pitch));
        this.fixed = false; camera.position.set(x, eye, z);
        camera.lookAt(x + Math.sin(yw) * Math.cos(a), eye + Math.sin(a), z + Math.cos(yw) * Math.cos(a));
        if (Math.abs(camera.near - 0.06) > 0.004) { camera.near = 0.06; camera.updateProjectionMatrix(); }
        if (Math.abs(camera.fov - this.walkFov) > 0.02) { camera.fov = this.walkFov; camera.updateProjectionMatrix(); }
        this.snap = false; return;
      }
      this.fixed = !always && (!f || this.atAltar(f.x, f.z));
      if (this.fixed) {
        this.goal.set(...CAM.pos); this.look.set(...CAM.look);
        if (this.offset || this.pitch) {      // dragged: it turns where it stands
          const dx = this.look.x - this.goal.x, dy = this.look.y - this.goal.y, dz = this.look.z - this.goal.z, flat = Math.hypot(dx, dz), r = Math.hypot(flat, dy);
          const yw = Math.atan2(dx, dz) + this.offset, a = Math.max(-1.5, Math.min(1.5, Math.atan2(dy, flat) + this.pitch));
          this.look.set(this.goal.x + Math.sin(yw) * Math.cos(a) * r, this.goal.y + Math.sin(a) * r, this.goal.z + Math.cos(yw) * Math.cos(a) * r);
        }
      } else {
        // behind you and rigid, turning exactly as you turn; dragging swings it away from there until R brings it back
        const out = Plan.regionAt(f.x, f.z);
        const room = /sacristy|servers|narthex|parish hall$/i.test(out);
        const arm = room ? 2.6 : /nave|sanctuary|auditorium/i.test(out) ? 3.2 : CART.driving ? 5.4 : 4.6;
        this.near0 = room || /nave|sanctuary|auditorium/i.test(out) ? 0.08 : 0.2;
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
        const swung = always ? this.yaw : wrap(this.yaw + this.offset), ax = Math.sin(swung), az = Math.cos(swung), clear = this.clearBehind(f, ax, az, arm);
        this.armBase = this.snap ? arm : this.armBase + (arm - this.armBase) * Math.min(1, dt * 3);
        // never through a wall: with one close behind you it comes in at once, and goes out again gently once there is room
        this.armRoom = this.snap || clear < this.armRoom ? clear : this.armRoom + (clear - this.armRoom) * Math.min(1, dt * 5);
        // close in, it rises just over your head and looks where you are going, not down at your feet
        const d = Math.min(this.armBase, this.armRoom), k = Math.min(1, d / 2.2), high = room ? 2.25 : 2.3 + (arm - 3.2) * 0.25 + (CART.driving ? 0.45 : 0), ahead = (1 - k) * 0.6;
        this.goal.set(f.x + ax * d, f.y + 1.95 + (high - 1.95) * k, f.z + az * d);
        this.look.set(f.x - ax * ahead, f.y + 1.0 + 0.1 * k, f.z - az * ahead);
        // seated or kneeling with a wall right at your back: up over your shoulder, above your head and to one side of it, never level
        // behind it, looking down over you and on into the room. With any room at all behind you the usual view, which looks down over you, sees more
        if ((f.posture === 'sit' || f.posture === 'kneel') && !CART.driving && d < 0.75) {
          const back = Math.min(d, 0.35), sx = az, sz = -ax;      // high enough to keep your own head in the picture, to bow it
          this.goal.set(f.x + ax * back + sx * 0.25, Math.min(f.y + 2.05, 2.55), f.z + az * back + sz * 0.25);
          this.look.set(f.x - ax * 0.9, f.y + 0.55, f.z - az * 0.9);
        }
        // dragged up or down: it swings round your head, low to look up at the sky, high to look down on you
        if (this.pitch) {
          const hx = this.look.x - this.goal.x, hy = this.look.y - this.goal.y, hz = this.look.z - this.goal.z;
          const a = Math.max(-1.45, Math.min(1.45, Math.atan2(hy, Math.hypot(hx, hz)) + this.pitch)), ca = Math.cos(a), sa = Math.sin(a), w = Math.min(1, Math.abs(this.pitch) / 0.3);
          const head = f.y + 1.45, r = Math.max(d, 0.6), gy = Math.max(f.y + 0.3, Math.min(room ? 2.4 : head + r, head - sa * r));
          const gx = f.x + ax * r * ca, gz = f.z + az * r * ca;
          this.goal.set(this.goal.x + (gx - this.goal.x) * w, this.goal.y + (gy - this.goal.y) * w, this.goal.z + (gz - this.goal.z) * w);
          this.look.set(this.look.x + (gx - ax * ca * 6 - this.look.x) * w, this.look.y + (gy + sa * 6 - this.look.y) * w, this.look.z + (gz - az * ca * 6 - this.look.z) * w);
        }
        // your hands at work: from above your shoulder, so that you see what you hold and where it goes; it glides there and back. A drag of your own comes first
        const task = always && !this.offset && !this.pitch ? this.taskView(f) : null;
        if (task && !Grab.active) {      // from one task's view to the next it glides too; but the moment you take hold of a hand, it stops where it is
          if (!this.taskGoal || this.snap || !this.taskW) { this.taskGoal = task.goal.clone(); this.taskLook = task.look.clone(); }
          else { const k = 1 - Math.exp(-dt * 5); this.taskGoal.lerp(task.goal, k); this.taskLook.lerp(task.look, k); }
        }
        if (this.snap) this.taskW = task ? 1 : 0;
        else if (!Grab.active) this.taskW = Math.max(0, Math.min(1, (this.taskW || 0) + (task ? dt : -dt) * 2.2));
        if (this.taskW > 0 && this.taskGoal) {
          const w = this.taskW * this.taskW * (3 - 2 * this.taskW);
          this.goal.lerp(this.taskGoal, w); this.look.lerp(this.taskLook, w);
        }
      }
      // a close shot of the work in hand: it glides there and back, and a drag of your own takes it away
      const sh = this.offset || this.pitch ? null : this.shot();
      if (sh) this.shotIs = sh;      // gliding back out, from the shot it was
      const SH = this.shotIs || SHOT_VEIL;
      this.shotW = this.snap ? (sh ? 1 : 0) : Math.max(0, Math.min(1, (this.shotW || 0) + (sh ? dt : -dt) * 0.9));
      if (this.shotW > 0) { const w = this.shotW * this.shotW * (3 - 2 * this.shotW); this.goal.lerp(SH.pos, w); this.look.lerp(SH.look, w); }
      const s = this.snap || !this.fixed && always ? 1 : 1 - Math.exp(-dt * (this.fixed ? 2.6 : 9));
      camera.position.lerp(this.goal, s);
      this.lookNow.lerp(this.look, this.snap || !this.fixed && always ? 1 : 1 - Math.exp(-dt * (this.fixed ? (this.offset || this.pitch ? 18 : 2.6) : 11)));
      camera.lookAt(this.lookNow);
      let near = this.near0 || (this.near0 = camera.near);
      if (!this.fixed && always && !this.taskW && !this.shotW) {      // over your shoulder at a task the camera is not on the arm behind you, and nothing of yours may be cut away
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
      const fov0 = this.fixed ? this.massFov : this.walkFov, fov = this.shotW > 0 ? fov0 + (SH.fov - fov0) * this.shotW * this.shotW * (3 - 2 * this.shotW) : fov0;
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
    K: new Figure('server', { name: 'In choir', hair: 0x2c2018, hairStyle: 'side', skin: 0xcfa283 }),
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
        if (/^C\d+$/.test(role) && Props.holder('paten') === me && o.posture === 'kneel') add('chin:' + role, 'Under the chin', underChin(o), 'person', role);
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
        case 'under': return z.id === 'chin:' + a1;
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
      if (UI.paused || CART.driving || (!Explore.active && (!director || director.failed))) return;
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
        // the next thing, a moment early: it is done when its moment comes; or what you were too late for, put right
        if (Player.excuse(cue => USE_FIT.has(cue.verb) && this.fits(cue, a.zone), cur => this.perform(cur))) return;
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
      const f = this.who(), show = !!f && f.root.visible && !UI.paused && !CART.driving;
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
        // a kiss is to your own lips: nothing on the table behind you may come between, however it lies on the screen
        const kissing = Player.cur && Player.cur.verb === 'kiss' && Player.cur.args[0] !== 'hand', zones = this.zones(f).filter(z => !kissing || z.kind === 'self');
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
    // done on the other server's sign (A2 stands as A1 genuflects with the Missal): together with the moment he gives it
    if (i && /^waitsig /.test(list[i - 1])) return 'sig:' + list[i - 1].slice(8);
    let from = 0;
    for (let j = 0; j < i; j++) if (list[j].startsWith('sync ')) from = j;
    const before = list.slice(from, i);
    if (before.some(c => /^(go|via|wait|pace|waitsig) /.test(c))) return null;
    return before.join(';') + '>' + list[i];
  }
  /** What a server does after the priest, not with him: he hears the priest begin, or sees him begin the same thing, and then does it.
   *  What in the priest's part it waits for; failing that, his first line, if nothing but a gesture or two comes before it. */
  const FOLLOW = { cross: /^(cross|g bless)/, strike: /^strike/, bow: /^bow /, up: /^up$/, nod: /^(nod|bow)/, small: /^small/, gen: /^gen/, genhold: /^gen/, kneel: null, stand: null, rise: null };
  const LEADS_INTO = /^(bow|up|cross|small|strike|nod|kiss|g) ?/;      // what the priest does as his line begins, not before it
  // a posture still owed is settled once a cue asks for something it does not lead into: a missed stand by kneeling or sitting (a genuflection needs you standing), and so on
  /** A walk with another straight after it is walked on from, not arrived at: no turning first to the way that spot faces. */
  const onward = (list, i) => /^go /.test(list[i]) && /^(go|via) (?!.* back$)/.test(list[i + 1] || '') ?list[i].replace(/^go /, 'via ') : list[i];
  /** The walk that list[i] is part of (the walking on either side of it, unbroken): where in the list it begins, and its steps; null if list[i] is no walk. */
  const walkOf = (list, i) => {
    const walking = j => /^(go|via) /.test(list[j] || '');
    if (!walking(i)) return null;
    let a = i, b = i;
    while (walking(a - 1)) a--;
    while (walking(b + 1)) b++;
    return { a, steps: list.slice(a, b + 1) };
  };
  /** If that walk goes by the side of the altar, where in the list it begins; else −1. */
  const bySide = (list, i) => { const w = walkOf(list, i); return w && w.steps.some(c => /^via w_side[EG]\b/.test(c)) ? w.a : -1; };
  /** Whether that walk goes round to or from the table. */
  const byTable = (list, i) => { const w = walkOf(list, i); return !!w && w.steps.some(c => /^via w_tab/.test(c)); };
  const OWED = /^(stand|rise|kneel|up)$/;
  const SETTLES = { stand: /^(stand|rise|kneel|sit)$/, rise: /^(stand|rise|kneel|sit)$/, kneel: /^(kneel|stand|rise|sit|gen|genhold)$/, up: /^(bow|up)$/ };
  const BODY_VERBS = new Set(['kneel', 'stand', 'sit', 'gen', 'genhold', 'rise', 'bow', 'up', 'nod', 'small', 'strike', 'turn', 'faceto']);
  const TASK_VIEW = new Set(['take', 'put', 'fold', 'give', 'offer', 'hold', 'pour', 'light', 'snuff', 'under']);      // tasks the camera comes in close for
  const USE_FIT = new Set(['take', 'put', 'give', 'offer', 'hold', 'pour', 'pinch', 'lift', 'light', 'snuff', 'open', 'close', 'flip', 'unflip', 'dip', 'offerwater', 'touch', 'tug', 'fold', 'under']);
  /** Where the paten goes for a communicant kneeling at the rail: level, just under the chin and a little before it. */
  function underChin(o) {
    const v = o.headWorld();
    return v.add(V(Math.sin(o.heading) * 0.12, -0.17, Math.cos(o.heading) * 0.12));
  }

  // ─── sound: small synthesized bells ────────────────────────────────────────
  let actx = null, hushed = false, frozen = false;
  function audio() {
    if (!opts.sound) return null;
    try {
      if (!actx) {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        // everything you hear comes through here: the volumes in Options, and silence when the Mass is stopped
        const m = actx.mix = { master: actx.createGain(), bells: actx.createGain(), outdoors: actx.createGain(), rain: actx.createGain() };
        for (const k of ['bells', 'outdoors', 'rain']) m[k].connect(m.master);
        m.master.connect(actx.destination);
        // set as events, not bare values: once a ramp follows, Firefox ignores a bare value and ramps from full
        const t = actx.currentTime, set = (g, v) => { g.gain.value = v; g.gain.setValueAtTime(v, t); g.gain.__lv = v; };
        set(m.master, hushed ? 0 : opts.volume); set(m.bells, opts.volBells); set(m.outdoors, opts.volOutdoors); set(m.rain, opts.volRain);
      }
      if (actx.state === 'suspended' && !frozen) actx.resume();
    } catch (e) { return null; }
    return inDemo() ? null : actx;      // the Mass behind the title plays in silence
  }
  // levels are set as straight ramps from where they are (kept here), never by setTargetAtTime: Firefox does not reliably follow that
  function rampTo(g, v, t, dur) { const p = g.gain, from = p.__lv == null ? p.value : p.__lv; p.cancelScheduledValues(t); p.setValueAtTime(from, t); p.linearRampToValueAtTime(v, t + dur); p.__lv = v; }
  function setLevels() {
    if (!actx) return;
    const m = actx.mix, t = actx.currentTime;
    rampTo(m.master, hushed ? 0 : opts.volume, t, 0.05);
    rampTo(m.bells, opts.volBells, t, 0.05); rampTo(m.outdoors, opts.volOutdoors, t, 0.05); rampTo(m.rain, opts.volRain, t, 0.05);
  }
  /** Smoothed here and handed over as a short straight ramp, frame by frame (see ambient.js). */
  function glide(a, param, target, tc) {
    const t = a.currentTime, first = param.__t == null, from = first ? target : param.__lv;
    const lv = first ? target : from + (target - from) * (1 - Math.exp(-Math.max(0, t - param.__t) / tc));
    param.__t = t; param.__lv = lv;
    param.cancelScheduledValues(t); param.setValueAtTime(from, t); param.linearRampToValueAtTime(lv, t + 0.06);
  }
  /** quiet: nothing to be heard, though the world may go on. stop: the sound itself stops where it is, and picks up from there. */
  function setStill(quiet, stop) {
    if (quiet !== hushed) { hushed = quiet; setLevels(); }
    if (actx && stop && actx.state === 'running') actx.suspend();
    if (actx && frozen && !stop && opts.sound) actx.resume();
    frozen = stop;
  }
  const inDemo = () => !!director && director.kind === 'demo';
  function chime(kind) {
    const a = audio(); if (!a) return;
    const t0 = a.currentTime, big = kind === 'sacristy', len = big ? 2.8 : 1.0;
    const bases = big ? [392, 588, 784] : [1310, 1560, 1750, 2090], level = big ? 0.2 : 0.09;
    for (const f of bases) for (const [m, g] of [[1, 0.5], [2.76, 0.2], [5.4, 0.08]]) {
      const o = a.createOscillator(), gn = a.createGain();
      o.frequency.value = f * m * (1 + (Math.random() - 0.5) * 0.004);
      gn.gain.setValueAtTime(0, t0); gn.gain.linearRampToValueAtTime(g * level, t0 + 0.005);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      o.connect(gn).connect(a.mix.bells); o.start(t0); o.stop(t0 + len + 0.1);
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
      this.pinVeil = null; this.pinBurse = null; this.keepVeil = false; this.burseOpen = 0; this.burseUp = null;
      this.corp = 'burse'; PROPS.corporal.obj.userData.set({ fz: 0, fx: 0 }); PROPS.burse.obj.userData.setFull(true);      // the corporal comes to the altar in the burse
      PROPS.towel.obj.userData.setDraped(true);
      PROPS.sc.obj.userData.setLit(false);
      PROPS.chalice.obj.userData.host.visible = false;
      this.tilt = {};
    },
    holder(p) { const l = this.loc[p]; return l && l.startsWith('hand:') ? l.slice(5) : null; },
    held(role) { return Object.keys(this.loc).filter(p => this.loc[p] === 'hand:' + role); },
    /** It has left this person's hands: if they were holding out nothing else, the arm comes back. */
    notOut(who, p) { if (who && this.out[who] && this.out[who].delete(p) && !this.out[who].size) FIG[who].out = false; },
    attach(p, role) {
      const prev = this.holder(p);
      this.notOut(prev, p); this.letGo(prev, p);
      this.loc[p] = 'hand:' + role;
      const pr = PROPS[p], mine = this.held(role).filter(q => q !== p);
      const used = new Set(mine.map(q => this.slot[q]));
      let slot = pr.carry === 'book' || pr.carry === 'both' ? 'both' : pr.carry;
      if (p === 'towel' && mine.includes('pitcher')) slot = 'arm';
      else if (slot === 'both' && mine.length) slot = used.has('R') ? 'L' : 'R';
      else if (slot === 'R' && (used.has('R') || used.has('both'))) slot = 'L';
      else if (slot === 'L' && (used.has('L') || used.has('both'))) slot = 'R';
      this.slot[p] = slot;
      if (p === 'veil' && !this.keepVeil && !this.hanging()) PROPS.veil.obj.userData.setState(this.veilFolded ? 'folded' : 'held');
      if (p === 'towel') PROPS.towel.obj.userData.setDraped(slot === 'arm');
      this.syncHands(role); if (prev && prev !== role) this.syncHands(prev);
    },
    place(p, where, keepShape) {
      const prev = this.holder(p);
      this.notOut(prev, p); this.letGo(prev, p);
      if (p === 'burse') { this.pinBurse = null; this.burseOpen = 0; }
      this.loc[p] = where; this.slot[p] = null;
      if (p === 'towel') PROPS.towel.obj.userData.setDraped(where === 'bowl' || where === 'cred.towel');
      if (p === 'veil' && !keepShape) {
        this.pinVeil = null;
        if (where === 'altar.veilG') { this.veilFolded = false; PROPS.veil.obj.userData.lay(this.veilEdge()); }      // laid out, the cross over the front: however it got there
        else PROPS.veil.obj.userData.setState(where === 'chalice' ? 'draped' : this.veilFolded ? 'folded' : 'flat');
        if (where === 'altar.veil') PROPS.veil.obj.userData.set({ side: this.veilSide(), sideK: 1 });      // its end over the side of the altar
      }
      if (prev) this.syncHands(prev);
    },
    /** Whoever had it in a hold lets go of it. */
    letGo(role, p) { const f = role && FIG[role]; if (f && f.grip && f.grip.prop === p) f.grip = null; },
    /** The veil taken up by its back edge, hanging from it. */
    /** Folded on the Epistle side at the Offertory, where the side edge of the altar (over its cloth) falls in the veil's own frame. */
    veilSide() { return C.LAYOUT.mensa.x + 0.045 - C.PLACES['altar.veil'][0]; },
    hanging() { return PROPS.veil.obj.userData.shape().hold > 0.5 && !!this.pinVeil; },
    /** Where the front edge of the altar is, in the frame of the veil laid on the Gospel side. */
    veilEdge() { return C.LAYOUT.mensa.z1 - C.PLACES['altar.veilG'][2]; },
    /** Where the corporal is: 'burse' (inside it), 'altar' (spread or folded on the mensa), or 'hand:P'. */
    corp: 'burse',
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
        if (p === 'veil' && this.pinVeil) {      // held still while it is folded or laid out; taken up by its back edge, it hangs from the hands that hold it
          if (this.pinVeil.by) { const f = FIG[this.pinVeil.by], c = Veil.carry(f); this.pinVeil.at.copy(c.at); this.pinVeil.heading = c.heading; }      // carried flat before him
          o.position.copy(this.pinVeil.at); o.rotation.set(0, this.pinVeil.heading, 0);
          const who = this.holder('veil'), U = o.userData;
          if (who && U.shape().hold > 0.5 && !this.pinVeil.still) {
            const f = FIG[who], m = f.handWorld('R').add(f.handWorld('L')).multiplyScalar(0.5);
            o.updateMatrixWorld(true); o.worldToLocal(m);
            U.set({ px: m.x, py: m.y - 0.012, pz: m.z });      // the back edge is where the hands are
          }
          continue;
        }
        if (p === 'burse') {
          const up = this.burseUp != null ? this.burseUp : this.pinBurse || l.startsWith('hand:') ? 1 : 0;
          o.userData.setPose(up, this.burseOpen);
          if (this.pinBurse) {
            if (this.pinBurse.by) { const c = Burse.carry(FIG[this.pinBurse.by], this.pinBurse.flip); this.pinBurse.at.copy(c.at); this.pinBurse.heading = c.heading; }      // in his hands, before him
            o.position.copy(this.pinBurse.at); o.rotation.set(0, this.pinBurse.heading, 0); continue;
          }
        }
        if (l.startsWith('hand:')) {
          const role = l.slice(5), f = FIG[role], slot = this.slot[p] || 'R';
          let pos;
          if (slot === 'both') pos = f.handWorld('R').add(f.handWorld('L')).multiplyScalar(0.5);
          else if (slot === 'arm') pos = f.handWorld('R').add(V(0, 0.09, 0));
          else pos = f.handWorld(slot);
          if (p === 'missal') pos.y -= 0.12;
          if (p === 'tray' || p === 'bowl' || p === 'paten') pos.y -= 0.02;
          if (p === 'paten') { const ahead = f.patenFor ? FIG[f.patenFor] : null, k = 0.09;      // held by its handle: the dish itself is out beyond the hand, towards whoever it is under
            const dx = ahead ? underChin(ahead).x - pos.x : Math.sin(f.heading), dz = ahead ? underChin(ahead).z - pos.z : Math.cos(f.heading), l = Math.hypot(dx, dz) || 1;
            pos.x += dx / l * k; pos.z += dz / l * k; }
          if (p === 'chalice' && slot === 'both') pos.y -= 0.12;
          if (p === 'veil' && role !== 'P' && this.veilFolded) { const k = PROPS.veil.obj.userData.S / 3; pos.x += Math.sin(f.heading) * k; pos.z += Math.cos(f.heading) * k; }      // the folded strip lies off its centre: bring it into his hands
          o.position.copy(pos);
          o.rotation.set(this.tilt[p] || 0, p === 'burse' && role !== 'P' ? Math.atan2(FIG.P.x - f.x, FIG.P.z - f.z) : f.heading + (p === 'missal' || (p === 'veil' && role !== 'P') ? Math.PI : 0), 0, 'YXZ');      // a server carries the veil cross end towards him, so it goes down the right way round      // the burse held out with its cross towards him
        } else if (C.PLACES[l]) {
          const [x, y, z, ry] = C.PLACES[l];
          o.position.set(x, y, z); o.rotation.set(0, ry, 0);
        } else {
          const base = PROPS[l].obj, off = (CONTAINED[p] && CONTAINED[p][l]) || [0, 0.03, 0];
          const v = V(...off).applyEuler(base.rotation).add(base.position);
          o.position.copy(v); o.rotation.copy(base.rotation);
        }
      }
      // the corporal: inside the burse, spread on the altar (or folded there), or in the priest's hand on its way into the burse
      const co = PROPS.corporal.obj;
      co.visible = this.corp !== 'burse';
      if (this.corp === 'altar') { const [x, y, z, ry] = C.PLACES['altar.corp']; co.position.set(x, y, z); co.rotation.set(0, ry, 0); }
      else if (this.corp === 'hand:P') { const h = FIG.P.handWorld('R'); co.position.set(h.x, h.y - 0.034, h.z); co.rotation.set(0, FIG.P.heading, 0); }      // folded small, between his fingers
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
    w_sac: 'the sacristy door', w_hall: 'the sacristy hall', w_thr: 'the sacristy hall, by the door', w_door: 'the door into the church, past the rail', w_cE: 'across, in the lower lane', w_cG: 'across, in the lower lane', w_passG: 'a step back, to pass behind the other server', w_tabA: 'between the column and the sedilia, on your way round to the table', w_tabA2: 'out in front of the chairs, on your way round to the table', w_tabB: 'behind the chairs, on your way round', w_tabB2: 'past the last chair, by the wall', w_tabC: 'through the frame, towards the table', w_tabC2: 'past the frame, towards the table', w_stG: 'the Gospel corner of the steps', w_stE: 'the Epistle corner of the steps', w_sed: 'the near side of the column, on your way to the chair', w_sedOut: 'the far side of the column, on your way back',
    w_rail: 'the end of the altar rail', w_gos: 'the gates, on the Gospel side', w_gosIn: 'through the gates', w_epi: 'the gates, on the Epistle side', w_epiIn: 'through the gates',
    cfR: 'the priest’s right at the foot of the altar (close formation)', cfL: 'the priest’s left at the foot of the altar (close formation)',
    cfL2: 'a step out to the side on the Gospel side, giving the priest room',
    xE: 'your place on the Epistle side (extended formation)', xG: 'your place on the Gospel side (extended formation)',
    mid: 'the middle, at the foot of the altar', midR: 'the middle at the foot of the altar, right of centre', midL: 'the middle at the foot of the altar, left of centre',
    ftE: 'the foot of the steps on the Epistle side', topE: 'the top step at the Epistle corner', topG: 'the top step at the Gospel corner',
    st2G: 'the second step on the Gospel side, facing the priest', bookG: 'the top step at the Gospel side, turned to the Missal', veilTop: 'the top step, on the priest’s Epistle side', veilG: 'the top step at the priest’s left',
    gradE: 'the Epistle end of the altar, by the gradine', plateTop: 'the top step, right of centre',
    elR: 'the edge of the top step at the priest’s right', elL: 'the edge of the top step at the priest’s left',
    comR: 'the edge of the top step for Communion', comL: 'the edge of the top step for Communion', comS: 'the edge of the top step, at the centre',
    abl1: 'the top step, half way across', cruWait1: 'the side of the steps, by the table', cruWait2: 'the side of the steps, by the table, beside A1',
    cruWaitS: 'the side of the steps, by the table', cruA1: 'the second step at the Epistle end', cruA2: 'the second step at the Epistle end',
    'P.cruet': 'where the priest will stand, at the end of the top step', 'P.abl': 'the Epistle corner of the altar', ablA2: 'the second step at the Epistle end', cruS: 'the second step at the Epistle end', ablA1: 'the second step at the Epistle end', ablS: 'the second step at the Epistle end', cred: 'the credence table', cred1: 'the credence table', cred2: 'the credence table',
    sed: 'the sedilia (the priest’s chair)', stoolE: 'your chair, beside the sedilia', stoolG: 'your chair, in the corner by the lectern', 'K.E': 'your place on the choir bench', 'K.G': 'your place on the choir bench', comKE: 'the top step, beside the servers', comKG: 'the top step, beside the servers',
    gateE: 'the Epistle-side gate', gateG: 'the Gospel-side gate', midRail: 'the middle, by the gates',
    clothE: 'the rail cloth on the Epistle side', clothG: 'the rail cloth on the Gospel side',
    cornerG: 'round the Gospel end of the altar', floorG: 'the Gospel end of the altar', cornerE: 'round the Epistle end',
    w_dnE: 'the foot of the steps, before the column', w_colE: 'round the outside of the column', w_sideE: 'the side of the steps, at the Epistle end', sideE: 'the side of the steps, at the Epistle end', w_colG: 'round the outside of the column', w_sideG: 'the side of the steps, at the Gospel end',
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
      case 'go': return args[1] === 'back' ? ['Step backwards down to ' + (SPOT_TEXT[a0] || a0) + ', still facing the altar', '↓ (held)'] : ['Go to ' + (SPOT_TEXT[a0] || a0), '← → ↑'];
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
      case 'under': return ['Hold the paten under his chin', 'Drag the paten to his chin'];
      case 'say': return ['Answer', '1–4'];
      default: return [verb, ''];
    }
  }

  const KEY_VERBS = new Set(['go', 'turn', 'faceto', 'kneel', 'stand', 'gen', 'genhold', 'rise', 'sit', 'bow', 'up', 'nod', 'cross', 'small', 'strike', 'kiss',
    'take', 'put', 'give', 'offer', 'hold', 'pinch', 'lift', 'drop', 'ring', 'pour', 'light', 'snuff', 'open', 'close', 'flip', 'unflip',
    'dip', 'offerwater', 'touch', 'tug', 'fold', 'under', 'say']);
  const USE_AS = { take: 'take', put: 'put', give: 'give', offer: 'give', hold: 'give', light: 'candle', snuff: 'candle', open: 'gate', close: 'gate', flip: 'gate', unflip: 'gate',
    dip: 'touch', offerwater: 'touch', touch: 'touch', fold: 'fold', sit: 'sit', under: 'give' };      // which button each of these things is done with
  const PRIEST_HANDS = new Set(['take', 'put', 'give', 'offer', 'hold', 'offerwater', 'touch', 'dip', 'pour', 'open', 'close', 'flip', 'unflip', 'kiss', 'light', 'snuff', 'tug', 'fold', 'pinch', 'lift', 'drop', 'ring', 'sit']);      // as the priest: what happens by itself
  const SPACE_VERBS = new Set(['take', 'put', 'give', 'offer', 'hold', 'light', 'snuff', 'open', 'close', 'flip', 'unflip', 'dip', 'offerwater', 'touch', 'tug', 'fold', 'sit', 'under']);

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
      this.player = kind === 'play' ? (this.o.priest ? 'P' : this.o.choir ? 'K' : this.o.servers === 2 ? this.o.role : 'A1') : null;
      this.stopped = false;
      this.timers = [];
      this.time = 0;
      this.flags = new Set();
      this.results = { ok: 0, total: 0, mistakes: [] };
      this.hostFor = new Set();
      this.patenSeen = new Set();       // the communicants whose paten has been looked at
      this.answered = {};
      this.steps = 0;                       // watching: how many fixed steps of time have gone by
      this.quiet = false;                   // watching: running on to a moment, unseen and unheard
      this.line = null;                     // watching: the Mass as a line in time
      this.cap = null; this.capPart = null; this.noteNow = null;      // what the screen says now, for a moment gone back to
    }
    stop() { this.stopped = true; for (const t of this.timers) t.resolve(); this.timers = []; }
    /** Something essential went undone: the Mass cannot go on with you, and it is yours to start again. */
    fail(reason, expected, cite) {
      if (this.failed || this.kind !== 'play' || this.o.casual) return;
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

    async run(from = 0) {
      try {
        for (let i = from; i < this.beats.length; i++) {
          this.check();
          this.index = i;
          const b = this.beats[i];
          if (this.line) this.line.reached(i);
          if (b.part !== this.capPart) { this.capPart = b.part; this.cap = null; }
          if (b.note) this.noteNow = [b.note, b.cite];
          if (!this.quiet) UI.beat(this, b, i);
          if (!this.line) (this.log = this.log || []).push({ i, t: this.time, part: b.part });
          if (!this.line && window.__serve.stopAt && window.__serve.stopAt(this, b, i)) {        // tests: freeze on a beat
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
          if (i > from && this.leadIn(b)) { if (!this.quiet && !Player.cur) UI.remind(null); await this.step(this.sleep(GAPS[opts.pace] || GAPS.natural)); }
          this.pAt = {}; this.heardAt = null; this.preCap = null;
          Player.stage = this.player && b.tracks[this.player] ? 0 : Infinity; Player.owed = [];
          await Promise.all(Object.entries(b.tracks).map(([r, list]) => this.track(r, list, b)));
          for (const f of Object.values(FIG)) f.keepBehind = null;
          await this.step(this.sleep(0.04));
        }
        this.ended = true;
        if (!this.quiet) UI.ended(this);
      } catch (e) {
        if (!(e instanceof Stopped)) { this.broke = e; console.error(e); UI.toast('Something went wrong: ' + e.message); }
      }
    }

    async track(role, list, beat) {
      if (role === this.player) return Player.track(this, list, beat);
      const server = role === 'A1' || role === 'A2';
      for (let i = 0; i < list.length; i++) {
        // a server is a person: a moment to take in what comes next before doing it, not the instant the last thing ends
        if (server && i && !/^(via|sync|signal|waitsig|wait|pace) /.test(list[i]) && !/^(via|sync) /.test(list[i - 1])) await this.step(this.sleep(SERVER_PAUSE));      // after waiting for the other, straight on together
        if (server) await this.keepStep(list, i, beat);
        if (server) await this.follow(beat, list[i]);
        if (this.player && server) { const k = togetherKey(list, i); if (k) (beat.togetherAt = beat.togetherAt || {})[k] = Player.t; }
        if (role === 'P') {
          this.pAt[i] = this.time;
          // he begins his line as he bows or signs himself: the words are up as soon as he moves, never after
          if (/^say /.test(list[i + 1] || '') && LEADS_INTO.test(list[i]) && this.player !== 'P') this.priestLine(list[i + 1].slice(4));
          // "(the sermon)" and the like tell what he is doing: once he walks away from it, it is done, and the top of the screen is empty until he next speaks
          if (/^(go|via) /.test(list[i]) && this.cap && this.cap[2] === 'P' && this.cap[1].la.startsWith('(')) { this.cap = null; if (!this.quiet) $('#caption').hidden = true; }
        }
        // his whole walk, through the points on the way: how far along it he is, to keep step with yours
        if (server && /^(go|via) /.test(list[i]) && !/^(go|via|pace) /.test(list[i - 1] || '')) {
          let j = i; while (/^(go|via|pace) /.test(list[j + 1] || '')) j++;
          const last = list.slice(i, j + 1).filter(c => /^(go|via) /.test(c)).pop(), f = FIG[role];
          f.legEnd = spot(C.parse(last).args[0]); f.legTotal = Math.hypot(f.legEnd[0] - f.x, f.legEnd[1] - f.z) || 1;
        }
        await this.exec(role, onward(list, i), beat);
      }
    }

    /** A sign given: whoever waits on it may go on. Given by a server, it is the moment the other does his part with it. */
    signal(role, name, beat) {
      this.flags.add(name);
      if (this.player && /^A[12]$/.test(role) && beat) (beat.togetherAt = beat.togetherAt || {})['sig:' + name] = Player.t;
    }

    /** The priest's line goes up at the top: from now he has been heard. */
    priestLine(ref) {
      const t = C.lineText(ref, Mass);
      this.cap = [t.who === 'A' ? 'All' : 'P.', t, 'P']; if (!this.quiet) UI.caption(...this.cap);
      this.preCap = ref;
      if (this.heardAt == null) this.heardAt = this.time;
    }
    /** In this moment, what the priest has to have begun before a server does this: his same gesture, or failing that his first line.
     *  Never anything he could himself be waiting on a server for. Returns when he began it (null until he has), or null if the server simply goes ahead. */
    leadFor(beat, cmd) {
      const P = beat.tracks.P, { verb } = C.parse(cmd);
      if (!P || !(verb in FOLLOW) || this.player === 'P') return null;
      const same = FOLLOW[verb];
      let quick = true, said = null;
      for (let k = 0; k < P.length; k++) {
        const p = P[k];
        if (/^(sync|waitsig|need|take|receive|offer|hold|under|touch|give) /.test(p)) break;      // from here on he may be waiting for us
        if (same && same.test(p)) return () => this.pAt[k];
        if (/^say /.test(p)) { if (quick && said == null) said = k; }
        else if (!LEADS_INTO.test(p) && !/^(turn|faceto|face) /.test(p)) quick = false;
      }
      return said == null ? null : () => this.heardAt;
    }
    /** The other server, a moment after the priest: as long as it takes to see it. */
    async follow(beat, cmd) {
      const lead = this.leadFor(beat, cmd);
      if (!lead) return;
      if (lead() == null) await this.step(this.until(() => lead() != null));
      const at = lead() + 0.6;
      if (this.time < at) await this.step(this.sleep(at - this.time));
    }

    /** Serving with you, the other server keeps step: what the two of you do together he does when you come to it, and the two of you set off together.
     *  He waits only so long; then he goes on, and being behind him is your slip. */
    async keepStep(list, i, beat) {
      if (!/^A[12]$/.test(this.player || '')) return;
      const mine = beat.tracks[this.player];
      if (!mine || Player.list !== mine) return;
      const k = togetherKey(list, i);
      let j = -1;
      if (k) j = mine.findIndex((c, n) => togetherKey(mine, n) === k);
      else if (/^(go|via) /.test(list[i]) && !list.slice(0, i).some(c => /^(go|via) /.test(c))) j = mine.findIndex(c => /^(go|via) /.test(c));
      if (j < 0) return;
      const patience = (k ? 3 : 2.5) * Figure.slow;
      for (let waited = 0; Player.list === mine && Player.i < j && waited < patience && !this.failed; waited += 0.1) await this.step(this.sleep(0.1));
    }

    /** Walking alongside you, he does not stride ahead: once he is further along his way than you are along yours, he eases off. */
    pacerFor(role, s) {
      if (!/^A[12]$/.test(this.player || '') || !/^A[12]$/.test(role) || role === this.player) return null;
      // both measured over the whole walk, points on the way and all: his part of a walk to the next point against your part of a walk
      // across the church would always look ahead, and keep him at his slowest
      const me = FIG[role], you = FIG[this.player], end = me.legEnd || s, total = me.legEnd ? me.legTotal : Math.hypot(s[0] - me.x, s[1] - me.z) || 1;
      let yours = null;
      return () => {
        const c = Player.cur;
        if (!c || c.verb !== 'go' || UI.paused) return 1;      // you are not walking: he goes at his own pace
        const goal = Player.legOpen && Player.legGoal ? Player.legGoal : spot(c.args[0]), from = Player.legOpen && Player.legStart;
        if (!yours || yours.goal !== goal) yours = { goal, d: (from ? Math.hypot(goal[0] - from[0], goal[1] - from[1]) : Math.hypot(goal[0] - you.x, goal[1] - you.z)) || 1 };
        const ahead = (1 - Math.hypot(end[0] - me.x, end[1] - me.z) / total) - (1 - Math.hypot(goal[0] - you.x, goal[1] - you.z) / yours.d) - 0.12;
        return ahead > 0 ? Math.max(0.65, 1 - ahead * 1.5) : 1;      // easing off, never crawling
      };
    }

    /** People do not reach across a room: go near enough to whoever you are dealing with, and turn to them. */
    async approach(role, other, reach) {
      if (role === this.player && role !== 'P') return;       // you do your own walking; the priest's hands are the game's
      const f = FIG[role], o = FIG[other];
      if (!o || !o.root.visible || f.posture !== 'stand') return;
      const d = Math.hypot(o.x - f.x, o.z - f.z);
      if (d > reach && d < 6) {
        const k = reach / d, x = o.x + (f.x - o.x) * k, z = o.z + (f.z - o.z) * k;
        await this.step(f.walkTo(x, z, { speed: walk() * 0.8, route: Nav.route(f.x, f.z, x, z) }));
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
          // a server stepping backwards down the steps looks over his outer shoulder, at where he is going
          const look = back && role !== 'P' ? { x: s[0] + (f.x >= 0 ? 1.5 : -1.5), z: s[1] } : null;
          await this.step(f.walkTo(s[0], s[1], { back, look, speed: args[1] === 'slow' ? walk() * 0.22 : back && role !== 'P' ? walk() * BACK : walk(), route: back ? null : Nav.route(f.x, f.z, s[0], s[1]), pacer: this.pacerFor(role, s), through: verb === 'via' && !back }));      // on the way, he keeps walking: a point passed, not a stop
          if (verb === 'go' && !back && s[2] != null) await this.step(f.turnTo(s[2]));
          return;
        }
        case 'face': case 'faceto': return this.step(f.turnTo(headingFor(role, args[0])));
        case 'turn': return this.step(f.turnTo(headingFor(role, args[1]), args[0]));
        case 'pace': {
          // walking behind the player: they keep walking, at their own steady pace, and never overtake you; nobody stands and waits for you
          // to clear a point. Only if you stop in their way do they stop, and that is yours to answer for. The other server does this only behind you.
          if (!this.player || role === this.player || (role === 'A1' && this.player !== 'A2') || this.player === 'P' || this.player === 'K') return;
          if (Player.stage !== Infinity) f.keepBehind = FIG[this.player];      // nobody keeps behind someone whose part is over
          if (args[1] === 'last') f.keepBehind = null;     // the last stretch, to their own place: beside you, not behind
          return;
        }
        case 'kneel': return this.step(f.kneel());
        case 'stand': case 'rise': return this.step(f.stand());
        case 'gen':
          if (role === this.player && Math.abs(f.x) < 0.8) Player.genSinceSide = true;
          await this.step(f.turnTo(Math.PI));      // always to the altar, whoever you were just dealing with
          return this.step(f.genuflect());
        case 'genhold':
          await this.step(f.turnTo(Math.PI));
          return this.step(f.genHold());
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
          if (p === 'veil' && role !== 'P' && Props.loc.veil === 'altar.veilG') return this.step(Gest.liftVeil(f, role));      // up by its back corners, to hold out to him
          // what you yourself are holding you cannot take: this means taking it back, once it has been given to someone and offered
          await this.step(this.until(() => { const hd = Props.holder(p); return !hd || (hd !== role && Props.out[hd] && Props.out[hd].has(p)); }));
          { const hd = Props.holder(p); if (hd && hd !== role) await this.approach(role, hd, 0.8); }
          if (p === 'veil' && Props.hanging()) {      // held out to him by its corners: he takes the top edge from the server's hands
            const U = PROPS.veil.obj.userData, corner = sx => () => U.pointWorld(sx * U.S / 2 * 0.85, -U.S / 2);
            await this.step(f.gesture([{ t: 0 }, { t: 1, R: corner(1), L: corner(-1), spine: 0.15, hands: { R: 'pinchAt', L: 'pinchAt' } }], dur(0.8)));
            Props.keepVeil = true; Props.attach(p, role); Props.keepVeil = false;
            return;
          }
          if (p === 'veil' && role !== 'P' && Props.holder('veil') === 'P' && Props.pinVeil) return this.step(Gest.takeVeil(f, role));
          if (p === 'burse' && role !== 'P' && Props.loc.burse === 'altar.burseG') return this.step(Gest.takeBurse(f, role));      // up off the altar into both hands      // at the Offertory: flat, from his hands
          await this.step(Gest.reach(f, () => Props.worldPos(p), Props.held(role).length ? 'L' : 'R'));
          Props.attach(p, role);
          if (p === 'biretta' && role === 'P') { Props.worn = false; }
          return;
        }
        case 'put': {
          const [p, where] = args;
          if (p === 'veil' && where === 'altar.veilG' && Props.holder('veil') === role) return this.step(Gest.layVeil(f));
          if (p === 'burse' && Props.pinBurse && Props.holder('burse') === role) return this.step(Gest.burseDown(f, where));
          if (p === 'veil' && Props.pinVeil && Props.holder('veil') === role) return this.step(Gest.setVeil(f, where));      // folded, laid down face up
          const at = C.PLACES[where] ? V(C.PLACES[where][0], C.PLACES[where][1], C.PLACES[where][2]) : Props.worldPos(where);
          await this.step(Gest.reach(f, () => at, Props.slot[p] === 'L' ? 'L' : 'R'));
          Props.place(p, where);
          return;
        }
        case 'give': {
          const [p, to] = args;
          if (p === 'burse' && to === 'P' && role !== 'P' && Props.pinBurse && Props.pinBurse.by === role) return this.step(Gest.presentBurse(f, role));      // face to face, upright, its cross to him
          await this.approach(role, to, 0.8);
          await this.step(Gest.reach(f, () => FIG[to].handWorld('R'), Props.slot[p] === 'L' ? 'L' : 'R'));
          Props.attach(p, to);
          if (p === 'biretta' && to === 'P') Props.worn = false;
          return;
        }
        case 'offer': case 'hold': {
          const p = args[0];
          if (verb === 'hold' && role !== 'P' && p === 'burse' && Props.corp !== 'burse' && Props.holder('burse') === role) return this.step(Gest.holdBurse(f, role));
          if (verb === 'hold' && p === 'veil' && f.grip && f.grip.prop === 'veil') { (Props.out[role] = Props.out[role] || new Set()).add(p); return; }      // held out already, as he lifted it
          if (p === 'biretta' && role === 'P' && Props.worn) { Props.worn = false; FIG.P.setBiretta(false); await this.step(Gest.doffBiretta(f)); }
          { const who = this.taker(beat, p, role); if (who) await this.approach(role, who, 0.85); }
          (Props.out[role] = Props.out[role] || new Set()).add(p);
          f.out = true; f.outHand = Props.slot[p] === 'L' ? 'L' : 'R';
          if (verb === 'offer') { await this.step(this.until(() => Props.holder(p) !== role)); f.out = false; }
          return;
        }
        case 'need': return this.step(this.until(() => Props.holder(args[0]) === role));
        case 'under': {      // the paten raised under the chin, and kept there until the Host has been given (giveHost lowers it)
          const [p, to] = args, o = FIG[to], s = spot('pr' + to.slice(1));
          await this.step(this.until(() => o.posture === 'kneel'));
          if (s && Math.hypot(f.x - s[0], f.z - s[1]) > 0.15) await this.step(f.walkTo(s[0], s[1], { speed: walk() * 0.8, route: Nav.route(f.x, f.z, s[0], s[1]) }));      // a step into place at his right, close to the rail
          if (s) await this.step(f.turnTo(s[2]));
          f.lift = () => underChin(o); f.liftHand = Props.slot[p] === 'L' ? 'L' : 'R'; f.patenFor = to;
          return this.step(f.wait(0.5));
        }
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
        case 'ring': for (let i = 0; i < (+args[0] || 1); i++) { if (!this.quiet) chime('hand'); await this.step(Gest.ring(f)); } return;
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
        case 'tug': Fix.bellSwing = 1.2; if (!this.quiet) chime('sacristy'); return this.step(Gest.reach(f, () => fixturePos('sbell'), 'R', 0.8));
        case 'fold': await this.step(Gest.fold(f)); Props.veilFolded = true; return;
        case 'say': return this.say(role, args[0], beat);
        case 'wait': return this.step(this.sleep(+args[0]));
        case 'signal': this.signal(role, args[0], beat); return;
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
      if (role === 'P' && this.preCap === ref) this.preCap = null;      // up already, since he began to move
      else if (this.kind !== 'play' || role === 'P' || this.player === 'P' || this.player === 'K') { this.cap = [who, t, role]; if (!this.quiet) UI.caption(who, t, role); }      // serving, the top of the screen is for the priest alone
      if (role === 'P' && this.heardAt == null) this.heardAt = this.time;
      const dur = (t.dur || Math.min(4.5, Math.max(0.8, t.la.length * 0.028))) * SAY_SCALE;
      // a line you have to answer: you hear it out, and meanwhile you can get your answer ready
      const mine = (beat.tracks[role] || []), lastSay = mine.filter(c => c.startsWith('say ')).pop() === 'say ' + ref;
      // not while you are saying a line yourself in this moment (said together, as the Salve): your own answer gets the next one ready when it is over
      const yours = (beat.tracks[this.player] || []).some(c => c.startsWith('say '));
      const answer = role !== this.player && lastSay && !yours && !window.__serve.autoplay ? this.nextSay() : null;
      if (answer) {
        const hold = Math.max(2.5, Math.min(10, 1.6 + t.la.length * 0.03));
        // but only once your hands are free: while you still have something to handle in this moment (the gates at the Last Gospel), the box
        // would only take your keys from it. Walking is no matter, for the arrows still walk you as you type; nor a bow or a cross, which the
        // button in the middle does. If you are not free by the time he has finished, the answer is asked for in its own moment
        const mine = beat.tracks[this.player] || [], handsOn = c => USE_FIT.has(C.parse(c).verb);
        const free = () => !(Player.beat === beat && Player.list !== mine ? [] : Player.beat === beat ? mine.slice(Player.i) : mine).some(handsOn);
        let waited = 0;
        for (; !free() && waited < hold; waited += 0.1) await this.step(this.sleep(0.1 * this.o.speed));
        if (free()) this.ready = { ref: answer, result: Player.ready(this, answer, /^confiteor-m\.0/.test(answer) ? 'You begin the Confiteor' : 'Your response') };
        if (hold > waited) await this.step(this.sleep((hold - waited) * this.o.speed));      // seconds as you feel them, whatever the speed of the Mass
        if (isServer) this.answered[ref] = true;
        return;
      }
      await this.step(this.sleep(dur));
      if (isServer) this.answered[ref] = true;
    }

    /** The Host is given: was your paten under the chin? */
    patenCheck(to) {
      if (!/^C\d+$/.test(to) || this.kind !== 'play' || window.__serve.autoplay || this.patenSeen.has(to)) return;
      this.patenSeen.add(to);
      const me = this.player, c = Player.cur;
      if (!me || Props.holder('paten') !== me) return;
      const waiting = c && c.verb === 'under' && c.args[1] === to;
      if (FIG[me].patenFor === to) return;
      if (c && waiting) c.mistakes++;
      this.mistake('He received with no paten under his chin', 'When the priest is in front of him, drag the paten under his chin.', this.beats[this.index]);
      if (waiting && !Player.autoing) Player.done(false);
    }

    /** Does this moment ask you to do something with your body or hands, that you need a moment to see coming? Not while watching, nor in the tests. */
    leadIn(b) {
      if (this.kind !== 'play' || !/^A[12]$/.test(this.player || '') || window.__serve.autoplay) return false;
      const list = b.tracks[this.player];
      return !!list && list.some(c => { const v = C.parse(c).verb; return KEY_VERBS.has(v) && v !== 'say'; });
    }

    /** Is the next thing you have to do to answer? */
    nextSay() {
      const list = this.player && this.beats[this.index + 1] && this.beats[this.index + 1].tracks[this.player];
      if (!list) return null;
      const i = list.findIndex(c => c.startsWith('say '));
      if (i >= 0 && this.player === 'P' && C.lineText(list[i].slice(4), Mass).silent) return null;      // what he says under his breath is simply said
      return i >= 0 && i <= 2 && !list.slice(0, i).some(c => /^(go|via|take|put|give) /.test(c)) ? list[i].slice(4) : null;
    }

    mistake(text, expected, beat, major) {
      if (this.o.casual) return;      // only for fun
      if (this.o.choir && !(this.beats[this.index] && this.beats[this.index].tracks.K)) return;      // nothing is asked of you in choir but the Confiteor and Communion
      this.results.mistakes.push({ part: beat ? beat.part : '', text, expected: expected || '', note: beat ? beat.note : '', cite: beat ? beat.cite : '', major: !!major });
      this.results.slips = (this.results.slips || 0) + (major ? 3 : 1);      // a major slip counts for three
      UI.mistake(text, expected, major);
      if (this.results.slips > SLIP_LIMIT && this.o.failing !== false) this.fail('Too many slips: ' + this.results.slips + ', and only ' + SLIP_LIMIT + ' are allowed.', 'Fewer slips. The last was: ' + text.replace(/[.\s]+$/, '') + '.', beat && beat.cite);
    }
  }

  // ─── the Mass as a line in time ────────────────────────────────────────────
  /**
   * Watching, nothing is asked of anyone, so every moment follows from the one before by the same code and a fixed step
   * of time. Between beats nothing is under way: no one is walking or gesturing and nothing is waiting, so all of the Mass
   * there is plain data. To go to any moment is to go to the start of its beat and run the director on from there.
   */
  const STEP = 1 / 60, STALL = 300;      // a beat this many seconds long has stuck
  const nextTask = (() => {              // awaited promises resume between steps, as they do between frames
    const mc = new MessageChannel(), waiting = [];
    mc.port1.onmessage = () => waiting.shift()();
    return () => new Promise(resolve => { waiting.push(resolve); mc.port2.postMessage(0); });
  })();

  class Timeline {
    constructor(d) {
      this.d = d;
      this.saves = [];                   // by beat: where everything stood as it began
      this.total = 0; this.target = 0; this.owed = 0;
      this.preparing = true; this.playing = true; this.seeking = false; this.scrubbing = false; this.pumping = false;
      this.pieces = []; this.glows = [];
      for (const p of Object.values(PROPS)) p.obj.traverse(o => { if (o !== p.obj) { this.pieces.push(o); if (o.isLight) this.glows.push(o); } });
    }
    get ready() { return !this.preparing; }

    /** The director has come to the start of this beat. */
    reached(i) { if (!this.saves[i]) this.saves[i] = this.save(); }
    save() {
      const d = this.d;
      return {
        steps: d.steps, time: d.time, flags: new Set(d.flags), hostFor: new Set(d.hostFor), hostUp: d.hostUp, cap: d.cap, capPart: d.capPart, note: d.noteNow,
        figs: Object.fromEntries(Object.entries(FIG).map(([r, f]) => [r, f.save()])),
        loc: Object.assign({}, Props.loc), slot: Object.assign({}, Props.slot), tilt: Object.assign({}, Props.tilt), worn: Props.worn, veilFolded: Props.veilFolded, veil: PROPS.veil.obj.userData.shape(),
        pinVeil: Props.pinVeil && Object.assign({}, Props.pinVeil, { at: Props.pinVeil.at.clone() }), pinBurse: Props.pinBurse && Object.assign({}, Props.pinBurse, { at: Props.pinBurse.at.clone() }),
        burseOpen: Props.burseOpen, corp: Props.corp, corpFold: PROPS.corporal.obj.userData.state(),
        out: Object.fromEntries(Object.entries(Props.out).map(([r, s]) => [r, new Set(s)])),
        placed: Object.values(PROPS).map(p => [p.obj.position.clone(), p.obj.quaternion.clone()]),      // a worn biretta is left where it last was
        shown: this.pieces.map(o => o.visible), glow: this.glows.map(o => o.intensity),
        gates: Object.values(FX.gates).map(g => [g.open, g.pivot.rotation.y]), cloths: Object.values(FX.cloths).map(c => [c.flipped, c.pivot.rotation.x]),
        tab: Fix.tab, bell: Fix.bellSwing, tabDoor: FX.tabDoor.rotation.y, sbell: FX.sbell.rotation.z,
        loose: Object.values(FIG).filter(f => f.walk || f.turn || f.legAnim || f.gestures.length).length + d.timers.length,      // must be none
      };
    }
    /** Back to the start of a beat, with the director running again from there. What was running before is dropped, and never resumes. */
    restore(i) {
      const d = this.d, s = this.saves[i];
      d.timers = []; d.ended = false; d.index = i;
      d.steps = s.steps; d.time = s.time; d.flags = new Set(s.flags); d.hostFor = new Set(s.hostFor); d.hostUp = s.hostUp; d.cap = s.cap; d.capPart = s.capPart; d.noteNow = s.note;
      for (const [r, f] of Object.entries(FIG)) f.load(s.figs[r]);
      Object.assign(Props, { loc: Object.assign({}, s.loc), slot: Object.assign({}, s.slot), tilt: Object.assign({}, s.tilt), worn: s.worn, veilFolded: s.veilFolded, keepVeil: false,
        pinVeil: s.pinVeil && Object.assign({}, s.pinVeil, { at: s.pinVeil.at.clone() }), pinBurse: s.pinBurse && Object.assign({}, s.pinBurse, { at: s.pinBurse.at.clone() }), burseOpen: s.burseOpen || 0, corp: s.corp || 'burse' });
      PROPS.corporal.obj.userData.set(s.corpFold || { fz: 0, fx: 0 }); PROPS.burse.obj.userData.setFull(Props.corp === 'burse');
      PROPS.veil.obj.userData.set(s.veil);
      Props.out = Object.fromEntries(Object.entries(s.out).map(([r, o]) => [r, new Set(o)]));
      Object.values(PROPS).forEach((p, k) => { p.obj.position.copy(s.placed[k][0]); p.obj.quaternion.copy(s.placed[k][1]); });
      this.pieces.forEach((o, k) => { o.visible = s.shown[k]; });
      this.glows.forEach((o, k) => { o.intensity = s.glow[k]; });
      Object.values(FX.gates).forEach((g, k) => { g.open = s.gates[k][0]; g.pivot.rotation.y = s.gates[k][1]; });
      Object.values(FX.cloths).forEach((c, k) => { c.flipped = s.cloths[k][0]; c.pivot.rotation.x = s.cloths[k][1]; });
      Fix.tab = s.tab; Fix.bellSwing = s.bell; FX.tabDoor.rotation.y = s.tabDoor; FX.sbell.rotation.z = s.sbell;
      for (const f of Object.values(FIG)) f.update(0, C.heightAt);
      Props.update();
      d.run(i);
    }
    /** One step of time. This is all that moves the Mass while you watch. */
    stepOnce() {
      const d = this.d;
      d.tick(STEP); d.pollConditions();
      for (const f of Object.values(FIG)) if (f.root.visible) f.update(STEP, C.heightAt);
      Props.update(); Fix.update(STEP);
      d.steps++;
    }
    /** Which beat a moment falls in. */
    beatAt(step) {
      let a = 0, b = this.saves.length - 1;
      while (a < b) { const m = (a + b + 1) >> 1; if (this.saves[m].steps <= step) a = m; else b = m - 1; }
      return a;
    }
    /** Run the real Mass through once, to learn how long it is and where each beat begins. */
    async prepare() {
      const d = this.d;
      d.quiet = true; d.run();
      await nextTask();
      let index = 0, since = 0;
      while (!d.stopped && !d.ended && !d.broke) {
        this.stepOnce();
        await nextTask();
        if (d.index !== index) { index = d.index; since = d.steps; }
        else if ((d.steps - since) * STEP > STALL) { UI.toast('The Mass stuck at beat ' + (index + 1) + ' (' + d.beats[index].part + ')'); break; }
      }
      if (d.stopped) return;
      this.total = d.steps;
      this.preparing = false; d.quiet = false;
      this.restore(0);
      Bar.laidOut(this);
    }
    /** Time going by: only while it is playing. */
    advance(real) {
      if (this.preparing || !this.playing || this.scrubbing || this.seeking || UI.paused) return;
      this.owed += real * this.d.o.speed / STEP;
      const n = Math.floor(this.owed);
      if (!n) return;
      this.owed -= n;
      this.target = Math.min(this.total, this.target + n);
      if (this.target >= this.total) this.playing = false;
      this.pump();
    }
    seek(step) {
      if (this.preparing) return;
      this.target = Math.round(Math.max(0, Math.min(this.total, step)));
      if (this.target === this.d.steps) return;
      this.owed = 0; this.seeking = true; this.d.quiet = true;
      this.pump();
    }
    toggle() {
      if (this.preparing) return;
      if (!this.playing && this.d.steps >= this.total) this.seek(0);
      this.playing = !this.playing;
    }
    /** Bring the Mass to the moment wanted: straight there if it is just ahead in this beat, by way of the start of its beat if not. */
    async pump() {
      if (this.pumping) return;
      this.pumping = true;
      const d = this.d;
      while (!d.stopped && d.steps !== this.target) {
        const b = this.beatAt(this.target);
        if (this.target < d.steps || b > d.index) this.restore(b);
        else this.stepOnce();
        await nextTask();
      }
      this.pumping = false;
      if (this.seeking && !d.stopped) { this.seeking = false; d.quiet = false; this.showNow(); }
    }
    /** The screen, as it was at this moment. */
    showNow() {
      const d = this.d, b = d.beats[d.index];
      UI.lastPart = b.part;
      UI.beat(d, b, d.index);
      if (d.noteNow) UI.note(d.noteNow[0], d.noteNow[1]); else $('#note').hidden = true;
      const cap = $('#caption'), la = cap.querySelector('.cap-la'), who = cap.querySelector('.cap-who');
      if (!d.cap) cap.hidden = true;
      else if (cap.hidden || !la || la.textContent !== d.cap[1].la || who.textContent !== d.cap[0]) UI.caption(...d.cap);      // no flicker while dragging across one line
      Cam.snap = true;
    }
  }

  /** The bar along the bottom, as on a video. */
  const Bar = {
    line() { return director && director.line; },
    clock: s => { s = Math.max(0, Math.floor(s)); const m = Math.floor(s / 60), x = s % 60; return m + ':' + (x < 10 ? '0' : '') + x; },
    /** The start of each part of the Mass, marked along the bar. */
    laidOut(line) {
      const d = line.d, ticks = [];
      line.saves.forEach((s, i) => { if (i && d.beats[i].part !== d.beats[i - 1].part) ticks.push(h('i', { style: 'left:' + (100 * s.steps / line.total).toFixed(3) + '%' })); });
      fill($('#tb-marks'), ...ticks);
    },
    paint() {
      const line = this.line(); if (!line) return;
      const d = line.d, bar = $('#timebar');
      bar.classList.toggle('preparing', line.preparing);
      if (line.preparing) {
        $('#tb-fill').style.width = (100 * (d.index || 0) / d.beats.length).toFixed(1) + '%';
        $('#tb-time').textContent = 'Going through the Mass…';
        return;
      }
      const at = (line.seeking || line.scrubbing ? line.target : d.steps), pc = 100 * at / line.total + '%', bt = line.beatAt(at);
      $('#tb-fill').style.width = pc; $('#tb-knob').style.left = pc;
      $('#tb-time').textContent = this.clock(at * STEP) + ' / ' + this.clock(line.total * STEP);
      $('#tb-beat').textContent = 'Beat ' + (bt + 1) + ' of ' + d.beats.length;
      $('#tb-track').setAttribute('aria-valuenow', Math.round(at * STEP));
      $('#tb-track').setAttribute('aria-valuemax', Math.round(line.total * STEP));
      bar.classList.toggle('playing', line.playing);
      for (const b of $('#tb-speed').children) b.setAttribute('aria-pressed', String(+b.dataset.v === d.o.speed));
    },
    /** A beat's start, or the one before if you are well into this one, as the back button of a player goes. */
    toBeat(way) {
      const line = this.line(), d = line.d, here = line.beatAt(line.target);
      if (way > 0) return line.seek(here + 1 < line.saves.length ? line.saves[here + 1].steps : line.total);
      line.seek(line.saves[line.target - line.saves[here].steps > 30 ? here : Math.max(0, here - 1)].steps);
    },
    /** Keys while watching: true if it was one of these. */
    key(e) {
      const line = this.line();
      if (!line || !line.ready) return false;
      const by = s => line.seek(line.target + s / STEP);
      switch (e.key) {
        case ' ': if (!e.repeat) line.toggle(); return true;
        case 'ArrowLeft': by(e.shiftKey ? -0.5 : -5); return true;
        case 'ArrowRight': by(e.shiftKey ? 0.5 : 5); return true;
        case 'ArrowUp': this.toBeat(1); return true;
        case 'ArrowDown': this.toBeat(-1); return true;
        case ',': line.playing = false; line.seek(line.target - 1); return true;
        case '.': line.playing = false; line.seek(line.target + 1); return true;
        case 'Home': line.seek(0); return true;
        case 'End': line.seek(line.total); return true;
        default: return false;
      }
    },
    init() {
      const track = $('#tb-track'), tip = $('#tb-tip');
      const stepAt = e => { const r = track.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * this.line().total; };
      let drag = false;
      track.addEventListener('pointerdown', e => {
        const line = this.line(); if (!line || !line.ready) return;
        drag = true; line.scrubbing = true; try { track.setPointerCapture(e.pointerId); } catch (err) { /* a test's made-up pointer */ }
        line.seek(stepAt(e)); e.preventDefault();
      });
      track.addEventListener('pointermove', e => {
        const line = this.line(); if (!line || !line.ready) return;
        const at = stepAt(e), b = line.beatAt(at);
        if (drag) line.seek(at);
        tip.hidden = false; tip.style.left = (100 * at / line.total) + '%';
        tip.textContent = this.clock(at * STEP) + ' · ' + (b + 1) + ' · ' + line.d.beats[b].part;
      });
      const end = () => { drag = false; const line = this.line(); if (line) line.scrubbing = false; };
      track.addEventListener('pointerup', end); track.addEventListener('pointercancel', end);
      track.addEventListener('pointerleave', () => { tip.hidden = true; });
      const button = (id, fn) => { const b = $(id); b.addEventListener('mousedown', e => e.preventDefault()); b.addEventListener('click', () => { const line = this.line(); if (line && line.ready) fn(line); }); };
      button('#tb-play', line => line.toggle());
      button('#tb-prev', () => this.toBeat(-1));
      button('#tb-next', () => this.toBeat(1));
      button('#tb-back', line => { line.playing = false; line.seek(line.target - 1); });
      button('#tb-on', line => { line.playing = false; line.seek(line.target + 1); });
      for (const v of [0.25, 0.5, 1, 1.25, 2, 4]) {
        const b = h('button', { tabindex: -1, 'data-v': v, 'aria-pressed': 'false', onmousedown: e => e.preventDefault(), onclick: () => { const line = this.line(); if (line) line.d.o.speed = v; } }, v + '×');
        $('#tb-speed').append(b);
      }
    },
  };

  // ─── gestures (hand targets in spine space) ────────────────────────────────
  const J = { R: [-0.02, 0.36, 0.22], L: [0.02, 0.36, 0.22] }, FL = [0.03, 0.30, 0.17];
  const dur = s => s / PACE;
  const Gest = {
    cross: f => f.gesture([
      { t: 0, R: J.R, L: FL }, { t: 0.18, R: [0, 0.74, 0.13] }, { t: 0.42, R: [0, 0.33, 0.18] },
      { t: 0.64, R: [0.14, 0.5, 0.14] }, { t: 0.84, R: [-0.14, 0.5, 0.14] }, { t: 1, R: J.R, L: FL }], dur(1.1), { hands: { R: 'cross', L: 'breast' } }),
    small: f => f.gesture([
      { t: 0, R: J.R, L: FL }, { t: 0.2, R: [0.0, 0.74, 0.15] }, { t: 0.32, R: [0.02, 0.74, 0.15] },
      { t: 0.5, R: [0.0, 0.64, 0.15] }, { t: 0.62, R: [0.02, 0.64, 0.15] }, { t: 0.8, R: [0.0, 0.44, 0.19] }, { t: 0.9, R: [0.02, 0.44, 0.19] }, { t: 1, R: J.R, L: FL }], dur(1.1), { hands: { R: 'thumb', L: 'breast' } }),
    strike: f => f.gesture([{ t: 0, R: [-0.06, 0.37, 0.33], L: FL }, { t: 0.55, R: [-0.02, 0.38, 0.17] }, { t: 1, R: [-0.06, 0.37, 0.3], L: FL }], dur(0.8), { hands: { R: 'strike', L: 'breast' } }),
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
    // ── the veil at the Offertory: lifted off, handed across flat and face up, folded in thirds with the face kept outward, laid down cross end to the front ──
    /** Taken from the priest's hands: by the two sides near the end towards you, the priest holding the middles; then brought before you. */
    takeVeil: async (f, role) => {
      const U = PROPS.veil.obj.userData, S = U.S, pin = Props.pinVeil, ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
      const r = Veil.rightSide(f, pin.heading), side = sx => () => U.pointWorld(sx * S / 2 * 0.96, S * 0.26);
      await f.gesture([{ t: 0 }, { t: 1, R: side(r), L: side(-r), spine: 0.15, hands: { R: 'pinchAt', L: 'pinchAt' } }], dur(0.9));
      Props.keepVeil = true; Props.attach('veil', role); Props.keepVeil = false;      // he lets go of it
      f.grip = { prop: 'veil', R: side(r), L: side(-r), hands: { R: 'pinchAt', L: 'pinchAt' }, spine: 0.1 };
      const from = pin.at.clone(), h0 = pin.heading;
      await f.gesture([], dur(0.8), { onTick: t => { const c = Veil.carry(f), e = ease(t); pin.at.lerpVectors(from, c.at, e); pin.heading = h0 + wrap(c.heading - h0) * e; } });
      pin.by = role;
    },
    /** In thirds into a strip lying across, the face kept outward: the far third turned down and under the middle, then the middle, with it, down and
     *  under the third nearest him. That third, the cross on it upright, stays where it was, face up; the lining is never seen. */
    fold: async f => {
      const U = PROPS.veil.obj.userData, S = U.S, a = S / 6, ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
      const role = Props.holder('veil');
      if (!Props.pinVeil) { const c = Veil.carry(f); Props.pinVeil = { at: c.at, heading: c.heading, by: role }; }
      const r = Veil.rightSide(f, Props.pinVeil.heading), at = (x, z) => () => U.pointWorld(x, z), P = { R: 'pinchAt', L: 'pinchAt' };
      const ends = s => at(s * r * S / 2 * 0.92, S / 3);      // the folded strip, by its two ends
      const keys = [
        { t: 0, R: at(r * S / 2 * 0.96, 0.13), L: at(-r * S / 2 * 0.96, 0.13), spine: 0.1, hands: P },
        { t: 0.1, R: at(r * 0.2, -S / 2), L: at(-r * 0.2, -S / 2), spine: 0.2, hands: P },      // over to the far edge
        { t: 0.42, R: at(r * 0.2, -S / 2), L: at(-r * 0.2, -S / 2), spine: 0.16, hands: P },      // the far third down, and under the middle
        { t: 0.5, R: at(r * 0.2, -a), L: at(-r * 0.2, -a), spine: 0.16, hands: P },      // the new far edge
        { t: 0.86, R: at(r * 0.2, -a), L: at(-r * 0.2, -a), spine: 0.1, hands: P },      // and that down, and under the near third
        { t: 1, R: ends(1), L: ends(-1), spine: 0.1, hands: P },
      ];
      await f.gesture(keys, dur(3.6), { onTick: x => U.set({ drape: 0, lift: 0, hold: 0, rest: 0, f1: Math.PI * ease((x - 0.12) / 0.3), f2: Math.PI * ease((x - 0.52) / 0.34) }) });
      U.set({ f1: Math.PI, f2: Math.PI });
      Props.veilFolded = true;
      f.grip = { prop: 'veil', R: ends(1), L: ends(-1), hands: P, spine: 0.1 };
    },
    /** Laid down folded, across the altar, face up, the cross upright to the front, back from the edge; set down, not dropped. */
    setVeil: async (f, where) => {
      const U = PROPS.veil.obj.userData, S = U.S, pin = Props.pinVeil, [x, y, z, ry] = C.PLACES[where], ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
      pin.by = null;
      const from = pin.at.clone(), to = V(x, y, z), h0 = pin.heading, r = Veil.rightSide(f, pin.heading), at = (lx, lz) => () => U.pointWorld(lx, lz), P = { R: 'pinchAt', L: 'pinchAt' };
      const ends = s => at(s * r * S / 2 * 0.92, S / 3);
      f.grip = null;
      await f.gesture([
        { t: 0, R: ends(1), L: ends(-1), spine: 0.1, hands: P },
        { t: 1, R: ends(1), L: ends(-1), spine: 0.4, hands: P },
      ], dur(1.4), { onTick: t => { const e = ease(t), lift = Math.sin(Math.PI * Math.min(1, t * 1.2)) * 0.04 * (1 - t); pin.at.lerpVectors(from, to, e); pin.at.y += lift; pin.heading = h0 + wrap(ry - h0) * e; } });
      Props.place('veil', where, true); Props.pinVeil = null;
      // and let go of, its end settling down over the side of the altar
      if (where === 'altar.veil') { const side = Props.veilSide(); return f.gesture([{ t: 0 }, { t: 1 }], dur(0.6), { onTick: t => U.set({ side, sideK: ease(t / 0.8) }) }); }
      await f.gesture([{ t: 0 }, { t: 1 }], dur(0.5));      // and the hands come away
    },
    doffBiretta: f => f.gesture([{ t: 0 }, { t: 0.45, R: [-0.06, 0.82, 0.08] }, { t: 1, R: [-0.12, 0.3, 0.32] }], dur(0.7)),

    // ── the veil and burse after the Ablutions: what each is for should be plain to see ──
    /** The folded veil set down on the Gospel side, opened out of its thirds, and its cross panel let down over the front edge, facing out. */
    layVeil: async f => {
      const veil = PROPS.veil.obj, U = veil.userData, [x, y, z, ry] = C.PLACES['altar.veilG'], ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
      const at = (lx, lz) => () => U.pointWorld(lx, lz), S = U.S, a = S / 6, P2 = { R: 'pinchAt', L: 'pinchAt' };
      // set down folded across the front of the mensa, the cross third on top and the strip's front edge at the altar's edge: by its two ends
      const edge = Props.veilEdge(), back = S / 2 - edge, from = veil.position.clone(), h0 = veil.rotation.y, down = V(x, y, z - back);
      const pin = Props.pinVeil = { at: from.clone(), heading: h0, still: true };
      const r = Veil.rightSide(f, ry), ends = s => at(s * r * S / 2 * 0.92, S / 3), front = s => at(s * r * 0.2, S / 2 - 0.02);
      U.setState('folded');
      await f.gesture([{ t: 0 }, { t: 1, R: ends(1), L: ends(-1), spine: 0.3, hands: P2 }], dur(0.9),
        { onTick: t => { const e = ease(t); pin.at.lerpVectors(from, down, e); pin.at.y += Math.sin(Math.PI * t) * 0.05; pin.heading = h0 + wrap(ry - h0) * e; } });
      Props.place('veil', 'altar.veilG', true);
      // then opened by its bottom edge: he takes the front edge near its ends and draws it down over the edge of the altar. The cross third goes over
      // and hangs, face out; the rest comes out from under it face up, to lie back on the mensa. The lining is never seen
      pin.at.set(x, y, z);
      U.set({ f1: 0, f2: 0, drape: 0, lift: 0, hold: 0, rest: 0, edge, roll: 0 });
      await f.gesture([
        { t: 0, R: ends(1), L: ends(-1), spine: 0.3, hands: P2 },
        { t: 0.18, R: front(1), L: front(-1), spine: 0.34, hands: P2 },
        { t: 0.26, R: front(1), L: front(-1), spine: 0.34 },
        { t: 1, R: front(1), L: front(-1), spine: 0.42 },
      ], dur(2.2), { onTick: t => U.set({ roll: ease((t - 0.26) / 0.74) }) });
      Props.place('veil', 'altar.veilG');      // the same cloth, now simply hung over the edge
      await f.gesture([{ t: 0 }, { t: 1 }], dur(0.4));
    },
    /** Taken up from the altar by its two back corners, and held out over the front of it, a little low, the cross side towards the priest. */
    liftVeil: async (f, role) => {
      const veil = PROPS.veil.obj, U = veil.userData, S = U.S, [x, y, z, ry] = C.PLACES['altar.veilG'];
      Props.pinVeil = { at: V(x, y, z), heading: ry, still: true };
      const corner = s => () => U.pointWorld(s * S / 2, -S / 2);
      await f.gesture([{ t: 0 }, { t: 1, R: corner(1), L: corner(-1), spine: 0.42, hands: { R: 'pinchAt', L: 'pinchAt' } }], dur(0.9));
      Props.keepVeil = true; Props.attach('veil', role); Props.keepVeil = false;
      Props.pinVeil.still = false;      // from now on it hangs from his hands
      const c = Veil.present(), hi = (s) => V(c.x + s * 0.24, y + 0.34, z - 0.12), out = s => V(c.x + s * 0.24, c.y, c.z);
      await f.gesture([
        { t: 0, R: corner(1), L: corner(-1), spine: 0.42, hands: { R: 'pinchAt', L: 'pinchAt' } },
        { t: 0.5, R: () => hi(1), L: () => hi(-1), spine: 0.25 },
        { t: 1, R: () => out(1), L: () => out(-1), spine: 0.15 },
      ], dur(1.6), { onT: [[0.97, () => { f.grip = { prop: 'veil', R: () => out(1), L: () => out(-1), hands: { R: 'pinchAt', L: 'pinchAt' }, spine: 0.15 }; }]] });
    },
    /** The burse stood on its edge and held open over the veil, at the priest's left, its mouth up for the corporal. */
    /** Taken up off the mensa in both hands, stood on its edge as it comes up, and held before him. */
    takeBurse: async (f, role) => {
      const o = PROPS.burse.obj, ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t), Pp = { R: 'pinchAt', L: 'pinchAt' };
      const pin = Props.pinBurse = { at: o.position.clone(), heading: o.rotation.y };
      Props.burseUp = 0;
      await f.gesture([{ t: 0 }, { t: 1, R: Burse.hold(f, 1), L: Burse.hold(f, -1), spine: 0.5, hands: Pp }], dur(0.9));
      Props.attach('burse', role);
      f.grip = { prop: 'burse', R: Burse.hold(f, 1), L: Burse.hold(f, -1), hands: Pp, spine: 0.15 };
      const from = pin.at.clone(), h0 = pin.heading;
      await f.gesture([], dur(1.1), { onTick: t => { const e = ease(t), c = Burse.carry(f); pin.at.lerpVectors(from, c.at, e); pin.at.y += Math.sin(Math.PI * t) * 0.05; pin.heading = h0 + wrap(c.heading - h0) * e; Props.burseUp = ease((t - 0.1) / 0.7); } });
      Props.burseUp = null; pin.by = role;
    },
    /** Held out over the veil, at the priest's left, standing on its edge, open, its mouth up and its face to him: he slips the folded corporal in. */
    holdBurse: async (f, role) => {
      const ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
      if (!Props.pinBurse) await Gest.takeBurse(f, role);
      const pin = Props.pinBurse, to = Veil.burseAt(), h1 = Math.atan2(FIG.P.x - to.x, FIG.P.z - to.z);
      pin.by = null;
      const from = pin.at.clone(), h0 = pin.heading;
      f.grip = Object.assign({}, f.grip, { spine: 0.3 });
      await f.gesture([], dur(1.0), { onTick: t => { const e = ease(t); pin.at.lerpVectors(from, to, e); pin.heading = h0 + wrap(h1 - h0) * e; Props.burseOpen = ease((t - 0.4) / 0.6); } });
      (Props.out[role] = Props.out[role] || new Set()).add('burse');
    },
    /** With the corporal in it, closed and laid flat at the back of the mensa, just behind the veil: his hands with it all the way. */
    burseDown: async (f, where) => {
      const pin = Props.pinBurse, [x, y, z, ry] = C.PLACES[where], from = pin.at.clone(), to = V(x, y, z), h0 = pin.heading, ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
      pin.by = null; Props.burseOpen = 0;
      f.grip = Object.assign({}, f.grip, { spine: 0.5 });
      await f.gesture([], dur(1.2), { onTick: t => { const e = ease(t); pin.at.lerpVectors(from, to, e); pin.at.y += Math.sin(Math.PI * t) * 0.04; pin.heading = h0 + wrap(ry - h0) * e; Props.burseUp = 1 - ease((t - 0.45) / 0.55); } });
      Props.burseUp = null; f.grip = null;
      Props.place('burse', where);
      await f.gesture([{ t: 0 }, { t: 1 }], dur(0.4));
    },
    /** The server turns to the priest, and the priest to him; the burse held up between them, upright, its cross to the priest. He takes it by its sides. */
    presentBurse: async (f, role) => {
      const P = FIG.P, pin = Props.pinBurse, Pp = { R: 'pinchAt', L: 'pinchAt' };
      await Promise.all([f.turnTo(Math.atan2(P.x - f.x, P.z - f.z)), P.turnTo(Math.atan2(f.x - P.x, f.z - P.z))]);
      (Props.out[role] = Props.out[role] || new Set()).add('burse');
      await P.gesture([{ t: 0 }, { t: 1, R: Burse.hold(P, 1), L: Burse.hold(P, -1), spine: 0.1, hands: Pp }], dur(0.8));
      pin.by = null;
      const from = pin.at.clone();
      Props.attach('burse', 'P');      // the server lets go
      P.grip = { prop: 'burse', R: Burse.hold(P, 1), L: Burse.hold(P, -1), hands: Pp, spine: 0.05 };
      const ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
      await P.gesture([], dur(0.5), { onTick: t => { const c = Burse.carry(P, true); pin.at.lerpVectors(from, c.at, ease(t)); } });
      pin.by = 'P'; pin.flip = true;      // before him now, still facing him
      await f.gesture([{ t: 0 }, { t: 1 }], dur(0.4));
    },
  };
  /** The burse in someone's hands: before him at chest height, its face (and cross) the way he faces, or towards him (flip). */
  const Burse = {
    carry: (f, flip) => ({ at: V(f.x + Math.sin(f.heading) * 0.34, f.y + 1.06, f.z + Math.cos(f.heading) * 0.34), heading: f.heading + (flip ? Math.PI : 0) }),
    /** Where his hand on that side (1 right, −1 left) holds it: by its edge, half way up as it stands, at the side as it lies. */
    hold: (f, s) => () => {
      const pin = Props.pinBurse, o = PROPS.burse.obj, W = o.userData.W, u = Props.burseUp == null ? 1 : Props.burseUp, h = pin ? pin.heading : o.rotation.y, at = pin ? pin.at : o.position;
      const side = s * Veil.rightSide(f, h) * (W / 2 + 0.006);
      return V(at.x + Math.cos(h) * side, at.y + 0.012 + u * (W * 0.45 - 0.012), at.z - Math.sin(h) * side);
    },
  };
  /** Where the veil and burse are held for the priest, on the Gospel side, between him and the server. */
  const Veil = {
    // at the Offertory: held out flat by the priest, at his right, for the server to take; and carried flat before the server, the cross end towards him, face up
    handOver: () => V(0.4, C.LAYOUT.mensa.top + 0.21, -0.5),
    carry: f => ({ at: V(f.x + Math.sin(f.heading) * 0.42, f.y + 1.2, f.z + Math.cos(f.heading) * 0.42), heading: f.heading + Math.PI }),
    /** Which side of the cloth (+1 its +x edge, −1 its −x) is at his right hand, as it lies now. */
    rightSide: (f, heading) => (-Math.cos(f.heading) * Math.cos(heading) - Math.sin(f.heading) * Math.sin(heading)) >= 0 ? 1 : -1,
    present: () => V(-0.45, C.LAYOUT.mensa.top + 0.26, C.LAYOUT.mensa.z1 + 0.05),       // just out over the front edge, held low: the top half above the mensa, the cross panel below
    burseAt: () => V(-0.44, C.LAYOUT.mensa.top + 0.04, C.LAYOUT.mensa.z1 - 0.14),     // over the veil where it lies on the mensa, standing on its edge
  };

  // the priest's own actions
  const ALT = { R: [-0.17, 0.12, 0.42], L: [0.17, 0.12, 0.42] };
  const PriestG = {
    placeChalice: async (d, f) => {
      await f.gesture([{ t: 0 }, { t: 0.5, R: [-0.08, 0.15, 0.45], L: [0.08, 0.15, 0.45], spine: 0.2 }, { t: 1 }], dur(1.0));
      Props.corp = 'altar'; PROPS.corporal.obj.userData.set({ fz: 0, fx: 0 }); PROPS.burse.obj.userData.setFull(false);      // the corporal out of the burse, spread
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
      const o = PROPS.veil.obj, U = o.userData, S = U.S, ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
      const side = s => () => U.pointWorld(s * 0.2, 0), edge = s => () => U.pointWorld(s * S / 2 * 0.94, 0), P = { R: 'pinchAt', L: 'pinchAt' };
      await f.gesture([{ t: 0 }, { t: 0.55, R: side(1), L: side(-1), spine: 0.2, hands: P }, { t: 1, R: side(1), L: side(-1), spine: 0.2 }], dur(1.2));
      const pin = Props.pinVeil = { at: o.position.clone(), heading: o.rotation.y };
      Props.keepVeil = true; Props.attach('veil', 'P'); Props.keepVeil = false;
      // straight up off the cup, then opened out flat as it comes to his right hand side, face up
      const from = pin.at.clone(), up = from.clone().add(V(0, 0.3, 0)), to = Veil.handOver();
      await f.gesture([
        { t: 0, R: side(1), L: side(-1), spine: 0.2, hands: P },
        { t: 0.35, R: side(1), L: side(-1), spine: 0.15 },
        { t: 0.75, R: edge(1), L: edge(-1), spine: 0.1 },
        { t: 1, R: edge(1), L: edge(-1), spine: 0.08 },
      ], dur(1.9), { onTick: x => {
        const a = ease(x / 0.35), b = ease((x - 0.3) / 0.7);
        U.set({ drape: 1 - ease((x - 0.3) / 0.45), lift: 0, f1: 0, f2: 0, hold: 0 });
        pin.at.lerpVectors(from, up, a).lerp(to, b);
      } });
      f.grip = { prop: 'veil', R: edge(1), L: edge(-1), hands: P, spine: 0.08 };
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
      if (Math.abs(f.x) < 0.45) Props.place('chalice', 'altar.C');      // at the corner he keeps it, and sets it down in the middle
    },
    openTabernacle: async (d, f) => { await f.gesture([{ t: 0 }, { t: 0.5, R: [-0.05, 0.42, 0.55], spine: 0.15 }, { t: 1 }], dur(0.8)); Fix.tab = 1; },
    closeTabernacle: async (d, f) => { await f.gesture([{ t: 0 }, { t: 0.5, R: [-0.05, 0.42, 0.55], spine: 0.15 }, { t: 1 }], dur(0.8)); Fix.tab = 0; },
    takeCiborium: async (d, f) => { await f.gesture([{ t: 0 }, { t: 0.5, R: [-0.02, 0.4, 0.55], L: [0.04, 0.38, 0.55] }, { t: 1 }], dur(0.8)); Props.attach('ciborium', 'P'); },
    showHost: (d, f) => f.gesture([{ t: 0 }, { t: 0.4, R: [-0.04, 0.5, 0.3] }, { t: 1, R: [-0.04, 0.5, 0.3] }], dur(1.0)),
    giveHost: async (d, f, [to]) => {
      const target = FIG[to];
      await d.approach('P', to, 0.72);
      const beat = d.beats[d.index], holder = beat && Object.keys(beat.tracks).find(r => beat.tracks[r].includes('under paten ' + to));
      if (holder) { const t0 = d.time; await d.step(d.until(() => FIG[holder].patenFor === to || d.time - t0 > 6 * Figure.slow)); }      // the paten under his chin first; he will not wait for ever
      await f.gesture([{ t: 0 }, { t: 0.4, R: () => target.headWorld().add(V(0, -0.03, 0.0)) }, { t: 0.7, R: () => target.headWorld().add(V(0, -0.03, 0.0)) }, { t: 1 }], dur(1.0),
        { onT: [[0.6, () => { d.patenCheck(to); d.hostFor.add(to); }]] });
      d.patenCheck(to); d.hostFor.add(to);
      for (const r of ['A1', 'A2']) if (FIG[r].patenFor === to) { await f.wait(0.3); FIG[r].lift = null; FIG[r].patenFor = null; }      // and the paten comes down
    },
    putPaten: async (d, f) => { await f.gesture([{ t: 0 }, { t: 0.5, R: [-0.15, 0.12, 0.45], spine: 0.15 }, { t: 1 }], dur(0.7)); if (Props.holder('paten') === 'P') Props.place('paten', 'altar.paten'); if (Props.holder('ciborium') === 'P') Props.place('ciborium', 'tab'); },
    holdChalice: async (d, f) => { Props.attach('chalice', 'P'); f.base = 'holdChalice'; await f.wait(dur(0.5)); },
    holdFingers: async (d, f) => { f.base = 'fingers'; await f.wait(dur(0.4)); },      // the chalice kept in his hands, his fingers over it
    wipeChalice: async (d, f) => { f.base = null; if (Props.holder('chalice') === 'P') Props.place('chalice', 'altar.C'); await f.gesture([{ t: 0 }, { t: 0.5, R: [-0.05, 0.2, 0.42], L: [0.05, 0.2, 0.42] }, { t: 1 }], dur(1.0)); },
    /** The chalice set aside; the corporal folded in three, front and back, then right and left; and slipped into the burse the server holds open. */
    foldCorporal: async (d, f) => {
      const ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t), CU = PROPS.corporal.obj.userData, [cx, cy, cz] = C.PLACES['altar.corp'];
      const on = (x, y, z) => () => V(cx + x, cy + y, cz + z), chalice = () => PROPS.chalice.obj.position.clone().add(V(0, 0.02, 0));      // by its foot
      await f.gesture([{ t: 0 }, { t: 1, R: chalice, L: chalice, spine: 0.45, hands: { R: 'grip', L: 'grip' } }], dur(0.6));
      Props.attach('chalice', 'P');
      const [ax, ay, az] = C.PLACES['altar.CE'];
      await f.gesture([{ t: 0, R: chalice, L: chalice, spine: 0.45 }, { t: 1, R: () => V(ax, ay + 0.02, az), L: () => V(ax, ay + 0.02, az), spine: 0.45 }], dur(0.7));
      Props.place('chalice', 'altar.CE');
      if (Props.corp !== 'altar') return;      // nothing spread to fold
      const T = 0.25, M = 0.04;
      await f.gesture([
        { t: 0, R: on(0.12, 0.01, T), L: on(-0.12, 0.01, T), spine: 0.3, hands: { R: 'pinchAt', L: 'pinchAt' } },
        { t: 0.22, R: on(0.12, 0.05, 0), L: on(-0.12, 0.05, 0), spine: 0.3 },
        { t: 0.28, R: on(0.12, 0.01, -T), L: on(-0.12, 0.01, -T), spine: 0.55 },
        { t: 0.5, R: on(0.12, 0.05, 0), L: on(-0.12, 0.05, 0), spine: 0.32 },
        { t: 0.56, R: on(T * 0.9, 0.02, 0), L: on(-M, 0.02, 0), spine: 0.3, hands: { R: 'pinchAt', L: 'altar' } },
        { t: 0.76, R: on(0, 0.06, 0), L: on(-M, 0.02, 0), spine: 0.3 },
        { t: 0.8, R: on(M, 0.03, 0), L: on(-T * 0.9, 0.02, 0), spine: 0.3, hands: { R: 'altar', L: 'pinchAt' } },
        { t: 1, R: on(M, 0.03, 0), L: on(0, 0.07, 0), spine: 0.3 },
      ], dur(3.6), { onTick: t => CU.set({ fz: 0.5 * ease(t / 0.22) + 0.5 * ease((t - 0.28) / 0.22), fx: 0.5 * ease((t - 0.56) / 0.2) + 0.5 * ease((t - 0.8) / 0.2) }) });
      // picked up, and into the burse
      await f.gesture([{ t: 0 }, { t: 1, R: on(0, 0.04, 0), spine: 0.3, hands: { R: 'pinchAt' } }], dur(0.5));
      Props.corp = 'hand:P';
      const mouth = () => PROPS.burse.obj.userData.mouthWorld();
      await f.gesture([{ t: 0, R: on(0, 0.04, 0), spine: 0.3, hands: { R: 'pinchAt' } }, { t: 0.65, R: () => mouth().add(V(0, 0.09, 0)), spine: 0.15 }, { t: 1, R: () => mouth().add(V(0, 0.035, 0)), spine: 0.15 }], dur(1.2));
      Props.corp = 'burse'; PROPS.burse.obj.userData.setFull(true);
      await f.gesture([{ t: 0, R: () => mouth().add(V(0, 0.035, 0)) }, { t: 1 }], dur(0.5), { onTick: t => { if (Props.pinBurse) Props.burseOpen = 1 - ease(t); } });
    },
    /** And the chalice back in the middle, where the veil is to go over it. */
    chaliceBack: async (d, f) => {
      if (Props.loc.chalice !== 'altar.CE') return;
      const [x, y, z] = C.PLACES['altar.C'], chalice = () => PROPS.chalice.obj.position.clone().add(V(0, 0.02, 0));      // by its foot
      await f.gesture([{ t: 0 }, { t: 1, R: chalice, L: chalice, spine: 0.45, hands: { R: 'grip', L: 'grip' } }], dur(0.6));
      Props.attach('chalice', 'P');
      await f.gesture([{ t: 0, R: chalice, L: chalice, spine: 0.45 }, { t: 1, R: () => V(x, y + 0.02, z), L: () => V(x, y + 0.02, z), spine: 0.45 }], dur(0.7));
      Props.place('chalice', 'altar.C');
      await f.gesture([{ t: 0 }, { t: 1 }], dur(0.4));
    },
    veilChalice: async (d, f) => {
      if (Props.hanging() && Props.holder('veil') === 'P') {
        // taken from the server by its top edge, the cross side towards him: lifted over the chalice, its back edge laid down behind it,
        // and the rest let fall over the front, so that the cross is to the people and the lining never shows
        const U = PROPS.veil.obj.userData, ch = PROPS.chalice.obj.position.clone(), ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
        Props.pinVeil = { at: ch.clone(), heading: 0 }; U.set({ edge: C.LAYOUT.mensa.z1 - ch.z, drape: 1, f1: 0, f2: 0, lift: 0 });
        const over = (sx, y, z) => () => ch.clone().add(V(sx, y, z));
        await f.gesture([{ t: 0 }, { t: 0.4, R: over(0.2, 0.46, 0.08), L: over(-0.2, 0.46, 0.08), spine: 0.3, hands: { R: 'pinchAt', L: 'pinchAt' } },
          { t: 0.75, R: over(0.17, 0.3, -0.14), L: over(-0.17, 0.3, -0.14), spine: 0.42 }, { t: 1, R: over(0.12, 0.24, 0.05), L: over(-0.12, 0.24, 0.05), spine: 0.25, hands: { R: 'altar', L: 'altar' } }], dur(2.0),
          { onTick: x => U.set({ hold: 1 - ease((x - 0.5) / 0.45) }) });
        Props.pinVeil = null; Props.veilFolded = false; Props.place('veil', 'chalice', true); U.setState('draped');
        await f.gesture([{ t: 0 }, { t: 1 }], dur(0.4));
        return;
      }
      // the folded veil opened out and laid over the chalice, falling evenly all round
      const U = PROPS.veil.obj.userData, from = U.shape(), ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
      Props.veilFolded = false; Props.place('veil', 'chalice', true);
      await f.gesture([{ t: 0 }, { t: 0.3, R: [-0.12, 0.2, 0.46], L: [0.12, 0.2, 0.46], spine: 0.15, hands: { R: 'pinchAt', L: 'pinchAt' } }, { t: 0.8, R: [-0.15, 0.12, 0.46], L: [0.15, 0.12, 0.46], spine: 0.15 }, { t: 1 }], dur(1.6),
        { onTick: x => U.set({ f2: from.f2 * (1 - ease(x / 0.35)), f1: from.f1 * (1 - ease((x - 0.2) / 0.35)), drape: ease((x - 0.5) / 0.45), lift: 0 }) });
      U.setState('draped');
    },
    burseOnChalice: async (d, f) => {
      const pin = Props.pinBurse;
      if (pin && pin.by === 'P') {      // handed to him: back round to the altar with it, and laid flat on the veiled chalice
        await f.turnTo(Math.PI);
        const ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t), ch = PROPS.chalice.obj, to = ch.position.clone().add(V(0, 0.262, 0)), h1 = ch.rotation.y;
        pin.by = null; pin.flip = false;
        const from = pin.at.clone(), h0 = pin.heading;
        await f.gesture([], dur(1.0), { onTick: t => { const e = ease(t); pin.at.lerpVectors(from, to, e); pin.at.y += Math.sin(Math.PI * t) * 0.05; pin.heading = h0 + wrap(h1 - h0) * e; Props.burseUp = 1 - ease((t - 0.35) / 0.65); } });
        Props.burseUp = null; f.grip = null;
        Props.place('burse', 'chalice');
        await f.gesture([{ t: 0 }, { t: 1 }], dur(0.4)); f.base = null; return;
      }
      await f.gesture([{ t: 0 }, { t: 0.5, R: [-0.04, 0.22, 0.45] }, { t: 1 }], dur(0.6)); Props.place('burse', 'chalice'); f.base = null;
    },
    takeChalice: async (d, f) => { await f.gesture([{ t: 0 }, { t: 0.5, R: [-0.06, 0.15, 0.45], L: [0.06, 0.15, 0.45] }, { t: 1 }], dur(0.8)); Props.attach('chalice', 'P'); },
    blessPeople: (d, f) => f.gesture([{ t: 0 }, { t: 0.2, R: [-0.08, 0.72, 0.32] }, { t: 0.45, R: [-0.08, 0.25, 0.4] }, { t: 0.65, R: [0.1, 0.48, 0.4] }, { t: 0.85, R: [-0.3, 0.48, 0.4] }, { t: 1 }], dur(1.3)),
  };

  // ─── the player ────────────────────────────────────────────────────────────
  const Player = {
    d: null, list: null, i: 0, cur: null, beat: null, count: 0, resolve: null, lastGo: null, lastFace: null,
    wrongInThis: false, autoing: false, since: 0, owed: [], early: [],

    /** Work through the player's commands in this beat. */
    async track(d, list, beat) {
      this.d = d; this.beat = beat;
      this.list = list; if (!(list[0] || '').startsWith('strike')) this.banked = 0;
      for (let i = 0; i < list.length; i++) {
        d.check();
        this.i = i;
        const c = list[i], { verb, args } = C.parse(c);
        if ((verb === 'via' && /^w_/.test(args[0])) || verb === 'go') this.openLeg(list, i);
        if (verb === 'via' && /^w_/.test(args[0])) {      // a point on the way: a help to the player, cleared by going past it
          const after = list.slice(i + 1).map(C.parse).find(n => n.verb === 'go' || n.verb === 'via');
          this.nextPoint = after ? spot(after.args[0]) : null;
          this.lastFace = null;
          await this.expect(d, 'go ' + args[0], beat);
          continue;
        }
        this.nextPoint = null;
        if (d.player === 'P' && (PRIEST_HANDS.has(verb) || verb === 'face' || verb === 'wait')) { if (verb === 'face') this.faceTo(args[0]); await this.auto(d, c, beat); continue; }
        if (verb === 'via' || verb === 'face' || verb === 'wait') { if (verb === 'face') this.faceTo(args[0]); continue; }
        // a sign given by doing something (A1's genuflection with the Missal) is given when you do it, not when you arrive to do it
        if (verb === 'signal' && list[i + 1] && BODY_VERBS.has(C.parse(list[i + 1]).verb)) { this.sigOnDone = args[0]; continue; }
        if (!KEY_VERBS.has(verb)) { await d.exec(d.player, c, beat); continue; }
        if (verb === 'say' && d.player === 'P' && C.lineText(args[0], Mass).silent) { await d.exec('P', c, beat); continue; }
        if (verb === 'say') { await this.respond(d, args[0], beat); continue; }
        // a bow that is already held only needs re-aiming
        // and you are already bowing: that is the bow wanted
        if (verb === 'bow' && (FIG[d.player].bowLevel === (args[0] === 'head' ? 1 : args[0] === 'deep' ? 3 : 2) || (args[0] !== 'head' && FIG[d.player].bowLevel >= 2))) {
          FIG[d.player].bowLevel = args[0] === 'head' ? 1 : args[0] === 'deep' ? 3 : 2;
          FIG[d.player].bowTarget = args[1] && FIG[args[1]] ? FIG[args[1]].headWorld() : null; continue;
        }
        if (verb === 'go') this.lastGo = args[0];
        // what you do after the priest is asked of you once he has begun it, or been heard: you cannot be behind someone who has not yet moved.
        // Done before that, it is done early, and counts when it comes
        const lead = /^A[12]$/.test(d.player) && d.leadFor(beat, c);
        if (lead && lead() == null) { this.held = true; try { await d.step(d.until(() => lead() != null)); } finally { this.held = false; } }
        this.nextTogether = togetherKey(list, i);
        await this.expect(d, c, beat);
        if (d.player === 'P' && /^(go|turn|faceto)$/.test(verb)) await this.auto(d, onward(list, i).replace(/ slow$/, ''), beat);      // the last steps into place, so that his hands find the altar
        if (verb === 'go') { this.lastFace = spot(args[0])[2]; this.facePerson = false; this.legOpen = false; }
      }
      this.cur = null; this.list = null; if (this.then && !this.then.far) this.then = null; UI.remind(null);
      this.owed = []; this.stage = Infinity; this.legOpen = false;      // your part in this beat is over: nobody waits on it any more
      for (const o of Object.values(FIG)) o.keepBehind = null;
    },

    /** Where this walk began and where it ends: the points the guide shows between are help, not the way you must take. */
    openLeg(list, i) {
      if (this.legOpen) return;
      const f = FIG[this.d.player], end = list.slice(i).map(C.parse).find(n => n.verb === 'go' || (n.verb === 'via' && !/^w_/.test(n.args[0])));
      this.legOpen = true; this.legStart = [f.x, f.z];
      this.legGoal = end ? spot(end.args[0]) : null;
    },

    expect(d, cmd, beat) {
      const { verb, args } = C.parse(cmd);
      if (verb === 'go') { const f = FIG[d.player]; this.legFrom = [f.x, f.z]; }
      // the moment for putting right what you missed has gone by. But a stand, a kneel or a straightening up that was missed is still owed
      // through the walking and turning after it, until it is done or another posture is asked for: doing it then is putting it right, not a second slip
      if ((BODY_VERBS.has(verb) || verb === 'cross' || verb === 'go') && !(this.late && OWED.test(this.late.verb) && !SETTLES[this.late.verb].test(verb) && this.owes(d, this.late))) this.late = null;
      this.cur = { cmd, verb, args, count: 0, need: verb === 'strike' || verb === 'ring' ? (+args[0] || 1) : 1, beat, mistakes: 0, start: d.time, left: this.allow(d, verb, args) };
      d.results.total++;
      UI.remind(this.cur, beat);
      this.cur.together = this.nextTogether; this.nextTogether = null;
      if (verb === 'strike' && this.banked) {
        const cur = this.cur; cur.count = Math.min(cur.need, this.banked); this.banked = 0;
        if (cur.count >= cur.need) setTimeout(() => { if (this.cur === cur) this.done(); }, 0);
      }
      // done a moment before it was asked for: now that it is asked for, it is done
      this.early = this.early.filter(e => d.beats.indexOf(e.beat) >= d.index);
      const e = this.early.findIndex(e => e.beat === beat && e.j === this.i && e.cmd === cmd);
      if (e >= 0) {
        const [x] = this.early.splice(e, 1), cur = this.cur; cur.early = true; cur.earlyAt = x.at;
        setTimeout(() => {
          if (this.cur !== cur) return;
          if (x.run) return x.run(cur);
          cur.count = Math.min(cur.need, cur.count + x.n);
          if (cur.count >= cur.need) this.done();
        }, 0);
      }
      else if (this.then && this.then.cmd === cmd) { const run = this.then.run; this.then = null; setTimeout(() => { if (this.cur && this.cur.cmd === cmd) run(this.cur); }, 0); }
      else if (this.then && (verb === 'go' || verb === 'turn' || verb === 'faceto')) { const cur = this.cur; setTimeout(() => { if (this.cur === cur) this.doneEnough(); }, 0); }
      if (verb === 'go') { const s = spot(args[0]); goRing.position.set(s[0], C.heightAt(s[0], s[1]) + 0.01, s[1]); }
      if (this.cur) this.cur.next = verb === 'go' && /^w_/.test(args[0]) ? this.nextPoint : null;
      const p = new Promise(resolve => { this.resolve = resolve; });
      if (window.__serve.autoplay) setTimeout(() => this.runAuto(), 0);     // tests: a perfect server
      return p;
    },

    /** Something done for you, while you wait for it. */
    async auto(d, c, beat) {
      this.autoing = true;
      try { await d.exec(d.player, c, beat); } finally { this.autoing = false; }
    },

    /** The button in the middle of the screen, while you type: your hands are on the keyboard, so your body moves when you press it. */
    moveBody() {
      const d = this.d, c = this.cur, f = d && d.player && FIG[d.player];
      if (!f || d.kind !== 'play' || d.failed || UI.paused || this.autoing || !UI.typing()) return;      // only while there is typing to be done
      if (!c || !this.bodyCue()) return;      // it is only there when there is something to do
      // kneeling or genuflecting, it faces you the right way first
      if (/^(kneel|gen|genhold)$/.test(c.verb)) { const want = c.verb === 'kneel' ? this.lastFace : Math.PI; if (want != null) f.turnTo(want); }
      d.exec(d.player, c.cmd, c.beat).catch(e => { if (!(e instanceof Stopped)) throw e; });      // it takes the time it takes; you have done your part, as with any key
      this.done();
    },

    /** What the button in the middle of the screen does now, while you type, in a word or three; null if there is nothing for it. */
    bodyCue() {
      const c = this.cur, d = this.d;
      if (!c || !d || d.kind !== 'play' || d.failed || this.autoing || c.count >= c.need || !UI.typing() || !/^A[12]$|^K$/.test(d.player || '')) return null;
      const a0 = c.args[0], to = a => a === 'P' ? 'the priest' : DIR_TEXT[a] || SPOT_TEXT[a] || a;
      switch (c.verb) {
        case 'cross': return 'Sign of the cross';
        case 'small': return 'Small crosses';
        case 'strike': return 'Strike your breast' + (c.need - c.count > 1 ? ' ×' + (c.need - c.count) : '');
        case 'bow': return a0 === 'head' ? 'Bow your head' : a0 === 'deep' ? 'Bow deeply' : 'Bow';
        case 'up': return 'Straighten up';
        case 'nod': return 'Bow your head';
        case 'kneel': return 'Kneel';
        case 'stand': return 'Stand';
        case 'sit': return 'Sit';
        case 'gen': return 'Genuflect';
        case 'genhold': return 'Genuflect';
        case 'rise': return 'Rise';
        case 'faceto': return 'Turn to ' + to(a0);
        case 'turn': return 'Turn to ' + to(c.args[1]);
        default: return null;
      }
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
    /** What is still yours to do, in order: the rest of this moment, then the next one. Each with the moment it is in and its place there. */
    yetToDo() {
      const d = this.d, out = [];
      if (!d || !d.player || !d.beats) return out;
      const now = d.beats[d.index], next = d.beats[d.index + 1];
      const from = (beat, j) => { const list = beat && beat.tracks[d.player]; if (list) for (; j < list.length; j++) out.push({ cmd: list[j], beat, j }); };
      if (now && this.beat === now) { if (this.list) from(now, this.held ? this.i : this.i + 1); }      // under way: what is after this (or this, while it waits on the priest)
      else from(now, 0);      // the moment before it, while you see it coming
      from(next, 0);
      return out;
    },
    /** The next thing for your body or hands, past walking and answering and what you have already done ahead of time. */
    aheadAction() {
      for (const x of this.yetToDo()) {
        const p = C.parse(x.cmd);
        if (!KEY_VERBS.has(p.verb) || /^(say|go|turn|faceto)$/.test(p.verb)) continue;
        if (this.early.some(e => e.beat === x.beat && e.j === x.j)) continue;
        return Object.assign(p, x);
      }
      return null;
    },
    /** Where you walk next, if walking is the next thing for you (past what you are about now): setting off a moment early is no straying. */
    nextLeg() {
      const r = this.nextRoute();
      return r.length ? r[0] : null;
    },
    /** And the whole of that walk, point by point to the place it ends: following the priest from your chair to the foot of the altar is all one way. */
    nextRoute() {
      const out = [];
      for (const x of this.yetToDo()) {
        const p = C.parse(x.cmd);
        if (p.verb === 'via' && /^w_/.test(p.args[0])) { out.push(spot(p.args[0])); continue; }
        if (p.verb === 'go') { out.push(spot(p.args[0])); return out; }
        if (KEY_VERBS.has(p.verb) && !/^(say|turn|faceto)$/.test(p.verb) && !this.early.some(e => e.beat === x.beat && e.j === x.j)) return out;
      }
      return out;
    },
    /** A missed posture you have still not taken. */
    owes(d, l) {
      const f = d && FIG[d.player];
      if (!f || !l) return false;
      if (l.verb === 'stand' || l.verb === 'rise') return f.posture !== 'stand';
      if (l.verb === 'kneel') return f.posture !== 'kneel';
      if (l.verb === 'up') return f.bowLevel > 0;
      return false;
    },
    /** People do not move on the instant. Done a moment before it is asked for, it counts when it is asked for; done after it was missed,
     *  it is putting that right, and the slip for lateness was already counted. Neither is a slip. True if this was one of those.
     *  `fits(cue)`: whether this would be doing that cue; `run(cur)`: what to do when an early one's moment comes, if it is not done already. */
    excuse(fits, run, n = 1) {
      const l = this.late;
      if (l && (this.t - l.at < 20 || OWED.test(l.verb)) && fits(l)) {      // a posture still owed has no time limit (the key has already put you in it, so ask the verb, not the body)
        this.late = null;
        // stood up at last, with the walk already under way: the walk's time starts now, not while you were still on your knees
        const c = this.cur; if (c && c.verb === 'go' && /^(stand|rise)$/.test(l.verb)) c.left = Math.max(c.left, this.allow(this.d, 'go', c.args));
        return true;
      }
      const nx = this.aheadAction(), POSTURE = /^(kneel|stand|rise|genhold|bow|up)$/;
      if (nx && POSTURE.test(nx.verb) && this.early.some(e => POSTURE.test(C.parse(e.cmd).verb))) return false;      // up, then down again before either was asked for: that is not being early
      if (nx && fits(nx)) { this.early.push({ cmd: nx.cmd, beat: nx.beat, j: nx.j, run, n, at: this.t }); return true; }
      return false;
    },
    /** The next thing you will be asked to do, in this moment or one of the next few: for the reminder before it is due. */
    upcoming() {
      const d = this.d;
      if (!d || !d.player || !d.beats) return null;
      const pick = (list, from, beat) => {
        for (let j = from; j < list.length; j++) { const v = C.parse(list[j]).verb; if (KEY_VERBS.has(v) && v !== 'say') return { cmd: list[j], beat }; }
        return null;
      };
      const now = d.beats[d.index];
      if (now && this.list && this.list === now.tracks[d.player]) { const r = pick(this.list, this.i + 1, now); if (r) return r; }
      for (let k = d.index + 1; k < Math.min(d.beats.length, d.index + 4); k++) {
        const list = d.beats[k].tracks[d.player];
        if (list && list.length) { const r = pick(list, 0, d.beats[k]); if (r) return r; }
      }
      return null;
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
      if (c.verb === 'turn' || c.verb === 'faceto') { this.faceTo(c.verb === 'turn' ? c.args[1] : c.args[0]); this.lastFace = f.heading; }      // facing the way you turned to is facing the right way
    },
    /** How long, in real seconds, the Mass gives you for this before it has gone on without you. */
    allow(d, verb, args) {
      const f = FIG[d.player];
      const rate = TURN_RATE / Figure.slow;
      if (verb === 'go') { const s = spot(args[0]); return Math.hypot(f.x - s[0], f.z - s[1]) * 1.25 / (walk() * d.o.speed) + Math.abs(wrap(Math.atan2(s[0] - f.x, s[1] - f.z) - f.heading)) / rate + 4.5; }     // a little over the straight line: there are columns and rails to go round
      if (verb === 'turn') {
        let by = wrap(headingFor(d.player, args[1]) - f.heading);
        if (args[0] === 'cw' && by > 0) by -= 2 * Math.PI;
        if (args[0] === 'ccw' && by < 0) by += 2 * Math.PI;
        return Math.abs(by) / rate + 2.5;
      }
      if (verb === 'faceto') return Math.abs(wrap(headingFor(d.player, args[0]) - f.heading)) / rate + 2.5;
      if (verb === 'ring') return 4;
      if (verb === 'kneel' || verb === 'stand' || verb === 'gen' || verb === 'genhold' || verb === 'rise') return 5 * Figure.slow;
      return 7 * Figure.slow;
    },

    /** Out of church (the sacristy, the hall, the door), facing someone, or the place someone stands, is for that moment only: once the Mass has
     *  moved on you may turn as you need. In church it holds, as everything else does, until the next cue says otherwise. */
    faceTo(target) {
      this.lastFace = headingFor(this.d.player, target);
      this.facePerson = /^(P|A1|A2|C\d)$/.test(target) || /^P\./.test(target) || /A[12]$/.test(target);
      this.faceWho = this.facePerson ? (target === 'P' || /^P\./.test(target) ? 'the priest' : /^C/.test(target) ? 'the communicant' : 'the other server') : null;
      this.faceIdx = this.d.index;
    },
    /** Which way you should be facing, in words: the altar, the people and the sides only in church; elsewhere, what is actually there. */
    faceWord() {
      if (this.facePerson && this.faceWho) return this.faceWho;
      { const f = FIG[this.d.player], here = Plan.regionAt(f.x, f.z);
        if (here === 'The sacristy') return 'the cross on the sacristy wall';
        if (!/sanctuary|nave/i.test(here)) return this.lastGo && /thr/.test(this.lastGo) ? 'the door into the church' : 'the way your place faces'; }
      const a = this.lastFace, is = t => Math.abs(wrap(a - t)) < 0.8, P = FIG.P, f = FIG[this.d.player];
      return is(Math.PI) ? 'the altar' : is(0) ? 'the people' : is(Math.PI / 2) ? 'the Epistle side' : is(-Math.PI / 2) ? 'the Gospel side' : Math.abs(wrap(a - Math.atan2(P.x - f.x, P.z - f.z))) < 0.8 ? 'the priest' : 'the way your place faces';
    },
    /** Standing the wrong way in your place: a word from the coach, then a slip. Nobody turns you. */
    checkFacing(d, f, c, dt) {
      if (this.facePerson && d.index !== this.faceIdx && !/sanctuary|nave/i.test(Plan.regionAt(f.x, f.z))) { this.lastFace = null; this.facePerson = false; }      // out of church, turning to someone was for that moment, and it has passed
      if (this.lastFace == null || (c && (c.verb === 'go' || c.verb === 'turn' || c.verb === 'faceto' || USE_FIT.has(c.verb)))) { this.faceT = 0; this.faceSlipped = false; this.faceToasted = false; return; }
      if (this.autoing || f.walk || f.turn || f.manualWalk || f.posture === 'sit') return;      // busy with something, on the way round, or seated
      { const nx = this.next(); if (nx && nx.verb === 'faceto') { this.faceT = 0; return; } }      // already turning to where you are about to be facing
      for (const o of Object.values(FIG)) {      // face to face with someone is never the wrong way
        if (o === f || !o.root.visible) continue;
        const tx = o.x - f.x, tz = o.z - f.z;
        if (Math.hypot(tx, tz) < 1.3 && Math.abs(wrap(Math.atan2(tx, tz) - f.heading)) < FACE_OFF) { this.faceT = 0; return; }
      }
      if (this.lastGo && Math.hypot(f.x - spot(this.lastGo)[0], f.z - spot(this.lastGo)[1]) > 2.2) return;      // being out of place has its own reckoning
      { const leg = this.nextLeg(); if (leg && (Math.abs(wrap(Math.atan2(leg[0] - f.x, leg[1] - f.z) - f.heading)) < 0.9 || (this.anchor && Math.hypot(f.x - this.anchor[0], f.z - this.anchor[1]) > 0.4))) { this.faceT = 0; return; } }      // turned to set off for where you go next
      if (facesWay(f, this.lastFace)) { this.faceT = 0; this.faceSlipped = false; this.faceToasted = false; return; }
      this.faceT += dt;
      if (this.faceT > 1.2 && !this.faceToasted && !this.faceSlipped && UI.coach()) { this.faceToasted = true; UI.toast('Face ' + this.faceWord() + ' (← → turn you).'); }
      if (this.faceT > 3 && !this.faceSlipped) { this.faceSlipped = true; d.mistake('You were facing the wrong way', 'Face ' + this.faceWord() + '.', this.beat); }
    },

    /** To the table you go round on the floor; coming down from the altar with the cruets is another matter. */
    tableLeg(from, id) {
      return /^(w_tab|cred|cruWait|cruOut)/.test(id) && C.heightAt(from[0], from[1]) <= C.LAYOUT.step + 0.01;
    },

    /** At every moment of the Mass you have a place, or a way to the next: leaving it is a major slip, staying away a failure, and going up to the altar unbidden worse. */
    checkPlace(d, f, c, dt) {
      if (!this.anchor) this.anchor = [f.x, f.z];
      const seg = (px, pz, [ax, az], [bx, bz]) => {
        const ux = bx - ax, uz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * ux + (pz - az) * uz) / ((ux * ux + uz * uz) || 1)));
        return Math.hypot(px - ax - t * ux, pz - az - t * uz);
      };
      const going = c && c.verb === 'go', target = going ? spot(c.args[0]) : null;
      const goal = going && this.legOpen && this.legGoal ? this.legGoal : target, start = going && this.legOpen && this.legStart ? this.legStart : this.legFrom;
      const detour = going ? (Math.hypot(f.x - start[0], f.z - start[1]) + Math.hypot(f.x - goal[0], f.z - goal[1]) - Math.hypot(goal[0] - start[0], goal[1] - start[1])) / 2 : Infinity;
      let off = going ? Math.min(seg(f.x, f.z, this.legFrom, target), Math.hypot(f.x - target[0], f.z - target[1]), detour) : Math.hypot(f.x - this.anchor[0], f.z - this.anchor[1]);
      if (!going && this.toPlace) off = Math.min(off, seg(f.x, f.z, this.toPlace, this.anchor));      // where the cue left you, your place, or between
      const route = !going && off > 0.5 ? this.nextRoute() : [];      // setting off a moment early for where you go next, all the way there
      for (let k = 0, from = this.anchor; k < route.length; from = route[k++]) off = Math.min(off, seg(f.x, f.z, from, route[k]));
      // to or from the table, close round the steps is the way; the long way, round behind the chairs and in by the wall, is no slip either
      if (going && this.list && byTable(this.list, this.i)) {
        const wide = ['w_tabA2', 'w_tabB2', 'w_tabC2'].map(spot);
        for (const way of [[start, ...wide, goal], [start, ...wide.reverse(), goal]]) for (let k = 1; k < way.length; k++) off = Math.min(off, seg(f.x, f.z, way[k - 1], way[k]));
      }
      const limit = going ? 2.6 : 1.3;
      const closing = off < (this.lastOff == null ? off : this.lastOff) - 1e-4;     // coming back is always allowed
      this.lastOff = off;
      const canFail = d.o.failing !== false;
      if (going && !c.crossed && this.tableLeg(this.legFrom, c.args[0]) && Nav.onSteps(f.x, f.z) && C.heightAt(f.x, f.z) > 0.01
        && Math.hypot(f.x - this.legFrom[0], f.z - this.legFrom[1]) > 0.45 && Math.hypot(f.x - target[0], f.z - target[1]) > 0.45) {
        c.crossed = true;
        d.mistake('You crossed the altar steps', 'The altar steps are for the altar: go round on the floor.', this.beat);
      }
      // a way that goes by the side of the altar (down after the Ablutions, up for the veil, down with the candle) is not to be cut short down the front:
      // in front of the footpace, on the lower steps, is only ever the front. A slip, but no more: the Mass is not left
      // Once you are out at the side, past the end of the second step, you went by the side, and the rest of the way is yours
      const walk = going && this.list && this.list === (this.beat && this.beat.tracks[d.player]) ? bySide(this.list, this.i) : -1;
      if (walk >= 0) {
        const key = d.index + ':' + walk, [, second, top] = C.LAYOUT.steps;
        if (this.sideKey !== key) { this.sideKey = key; this.sideReached = false; this.sideSlip = false; }
        if (Math.abs(f.x) > second[0]) this.sideReached = true;
        // up or down the front crosses the second step; along the first, where the servers kneel, is only on the way round the column
        if (!this.sideReached && !this.sideSlip && C.heightAt(f.x, f.z) > C.LAYOUT.step + 0.01 && Math.abs(f.x) < top[0] && f.z > top[1] + 0.05) {
          this.sideSlip = true;
          const down = C.heightAt(this.legFrom[0], this.legFrom[1]) > C.heightAt(target[0], target[1]);
          d.mistake(down ? 'You came down the front of the altar steps' : 'You went up the front of the altar steps', 'Go by the side of the altar, round the outside of the column.', this.beat);
        }
      }
      const [low, second] = C.LAYOUT.steps;
      const inAltar = (x, z) => Math.abs(x) < low[0] + 0.05 && z < second[1] + 0.1 && z > C.LAYOUT.wallBack;      // the first step is where you kneel: above it is the altar's
      const entitled = going ? inAltar(target[0], target[1]) || inAltar(this.legFrom[0], this.legFrom[1]) : inAltar(this.anchor[0], this.anchor[1]) || route.some(p => inAltar(p[0], p[1]));
      if (inAltar(f.x, f.z) && !entitled && off > 1.2) {     // on your way across the end of the steps is no offence; off it is
        this.altarT = (this.altarT || 0) + dt;
        if (this.altarT > 0.6 && !closing) {
          if (canFail && !going) return d.fail('You walked up to the altar when you had no business there.', 'Keep your place.', this.beat && this.beat.cite), true;
          if (!this.altarSlip) { this.altarSlip = true; d.mistake('You walked up to the altar when you had no business there', '', this.beat, true); }
        }
      } else { this.altarT = 0; this.altarSlip = false; }
      if (off > limit) {
        if (!this.straying) { this.straying = true; this.strayT = 0; d.mistake('You left your place during the Mass', going ? describe(c.cmd)[0] : 'Stay where you belong until your next cue.', this.beat, true); }
        if (!closing) this.strayT += dt;
        if (canFail && (this.strayT > 3 || (off > limit + 3 && !closing))) return d.fail('You kept wandering about during the Mass.', 'Stay in your place, or on your way to the next one.', this.beat && this.beat.cite), true;
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
        if (!d.o.choir) d.mistake('You bumped into ' + name, 'Nobody walks through anybody: go round.', this.beat, true);
      }
      o.bumpAt = this.t;
      if (d.o.failing === false && !d.o.choir) return false;
      const carried = Props.held(role).filter(p => /^(chalice|ciborium|paten|wine|water|bowl|pitcher|missal|bells)$/.test(p) && !(p === 'biretta'));
      let why = null;
      if (isP) {
        if (carried.length && this.pushT > (o.stepping ? 0.7 : 0.25)) why = 'You knocked into the priest while he was carrying ' + (PROP_TEXT[carried[0]] || carried[0].replace(/^/, 'the ')) + '.';
        else if (o.y > 0.2 && this.pushT > 0.4) why = 'You shoved the priest on the altar steps.';
        else if (this.pushT > 0.5) why = 'You kept pushing into the priest until he nearly fell.';
        else if (o.bumps >= 2) why = 'You knocked into the priest a second time.';
      } else if (carried.length && this.pushT > 1.5) {      // a brush in passing is a slip; only a real shove spills what he carries
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
      // only where the priest is kept waiting on you: handing to him, or taking back what he holds out. Late at the credence is a slip, and the Mass goes on
      const his = /^(wine|water|pitcher|bowl|towel|missal|paten|biretta)$/.test(a0);
      if (his && (/^(give|offer|hold)$/.test(c.verb) || (c.verb === 'take' && Props.holder(a0) === 'P'))) return 'The priest was left without ' + (PROP_TEXT[a0] || a0) + '.';
      if (c.verb === 'pour') return 'The priest was left waiting for the ' + (a0 === 'wine' ? 'wine' : 'water') + ' to be poured.';
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
      this.late = { cmd: c.cmd, verb: c.verb, args: c.args, at: this.t };      // doing it now is putting it right, not another slip
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
        case 'under': d.patenSeen.add(a1); break;      // the Host is given all the same, and being late was the slip
        case 'drop': f.lift = null; break;
        default: break;      // a bow or a step not made, a bell not rung: simply not done
      }
      this.autoing = false;
      this.done(false);
    },

    done(perfect = true) {
      const c = this.cur;
      if (!c) return;
      if (this.sigOnDone) { this.d.signal(this.d.player, this.sigOnDone, c.beat); this.sigOnDone = null; }
      if (c.verb === 'turn') this.faceTo(c.args[1]);
      if (c.verb === 'faceto') this.faceTo(c.args[0]);
      if (c.verb === 'go') {
        if (/^w_/.test(c.args[0]) && c.next) this.owed.push({ at: spot(c.args[0]), next: c.next, goal: this.legOpen ? this.legGoal : null });
        else { this.stage += this.owed.length + 1; this.owed = []; }
        // arrived, your place is that spot. Near enough, or not there yet when the moment passed, it is still your place: where you stand
        // and the rest of the way there are yours, and walking on to it is never wandering off
        const s = spot(c.args[0]), f = FIG[this.d.player];
        if (window.__serve.autoplay) { this.anchor = [s[0], s[1]]; this.toPlace = null; }
        else if (/^w_/.test(c.args[0])) { this.anchor = [f.x, f.z]; this.toPlace = null; }      // a point on the way is only a help
        else { this.anchor = [s[0], s[1]]; this.toPlace = [f.x, f.z]; }
        this.lastOff = null; this.straying = false;
      }
      // together with the other server: a moment behind is human, and so is taking a second or two to see it; clearly behind is a slip
      if (perfect && c.together && !c.early && !window.__serve.autoplay) {
        const at = c.beat.togetherAt && c.beat.togetherAt[c.together], byHand = Grab.active || Grab.justLet;
        // by hand, what counts is when you began; and arriving side by side for a genuflection, you may still have to turn to the altar
        if (at != null && (byHand ? Grab.startedAt : this.t) - at > (byHand ? 3 : 2.5) + (c.need - 1) * 0.6 + (c.together.startsWith('sync ') ? 1 : 0)) {
          c.mistakes++;
          this.d.mistake('You were behind the other server', 'Move together with him: ' + describe(c.cmd)[0].toLowerCase() + '.', c.beat);
        }
      }
      // on his sign, done well before he gave it: not together either
      if (perfect && c.early && c.together && c.together.startsWith('sig:') && c.earlyAt != null && !window.__serve.autoplay) {
        const at = c.beat.togetherAt && c.beat.togetherAt[c.together];
        if (at != null && at - c.earlyAt > 2.5) {
          c.mistakes++;
          this.d.mistake('You were ahead of the other server', 'Wait for him: ' + describe(c.cmd)[0].toLowerCase() + ' as he does his part.', c.beat);
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
      // in choir, with nothing asked of you, your body is your own
      if (d.o.choir && !c) {
        switch (type) {
          case 'kneel': if (f.posture === 'stand' && !f.walk) f.kneel(); return;
          case 'stand': case 'rise': if (f.posture !== 'stand') f.stand(); return;
          case 'sit': { if (f.posture !== 'stand') return; const n = seatNear(f); if (n) { const s = spot(n); f.x = s[0]; f.z = s[1]; f.heading = s[2]; } f.sit(); return; }
          case 'gen': if (f.posture === 'stand') f.genuflect(); return;
          case 'cross': Gest.cross(f); return;
          case 'strike': Gest.strike(f); return;
          case 'nod': f.nod(); return;
          case 'bow': f.bow(f.bowLevel ? 0 : arg === 'deep' ? 3 : 2); return;
          default: return;
        }
      }
      // not quite there, and getting on with what you came to do
      if (c && (c.verb === 'go' || c.verb === 'turn' || c.verb === 'faceto')) {
        const nx = this.nextAction(), s = nx && nx.to && spot(nx.to);
        if (nx && (nx.verb === type || (type === 'gen' && nx.verb === 'genhold')) && (!s || Math.hypot(f.x - s[0], f.z - s[1]) < 1.9)) return this.skipTo(() => this.act(type, arg));
      }
      const expect = c ? c.verb : null;
      // what this would be doing, of the things asked of you; and, done before its moment, what is left to do when the moment comes
      const is = (...verbs) => cue => verbs.includes(cue.verb);
      const posed = (want, done) => cur => { if (this.cur === cur && (done ? done() : f.posture === want)) this.done(); };
      /** Not what is asked now: a slip, unless it is the next thing, a moment early, or putting right what you were late for. */
      const wrong = (msg, fits = is(type), run) => {
        if (fits && this.excuse(fits, run)) return;
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
          if (expect !== 'kneel') return wrong('You knelt — not now.', is('kneel'), posed('kneel'));
          if (this.lastGo && !near(this.lastGo, 2.2)) return wrong('Kneel at ' + (SPOT_TEXT[this.lastGo] || this.lastGo) + ' — stand (↑) and go there.', null);
          if (this.lastFace != null && !facesWay(f, this.lastFace)) { this.faceSlipped = true; c.mistakes++; d.mistake('You knelt facing the wrong way', 'Face ' + this.faceWord() + ' (← → turn you).', this.beat); }
          return this.done();
        case 'stand':
          if (f.posture === 'stand') return;
          f.stand();
          if (expect === 'stand' || (expect === 'rise' && f.posture === 'stand')) return this.done();
          if (this.excuse(is('stand', 'rise'), posed('stand'))) return;
          this.unknelt = true;
          return wrong('You stood up too early.', null);
        case 'gen':
          if (f.posture !== 'stand') return;
          if (expect === 'genhold') return this.act('genhold');      // the one button: you stay down when staying down is what comes next
          if (this.unheld && expect !== 'gen') { this.unheld = false; f.genHold(); return; }      // back down: that is putting it right
          if (expect !== 'gen') { const nx = this.aheadAction(); if (nx && nx.verb === 'genhold') return this.act('genhold'); }      // and staying down, if that is what is coming
          f.genuflect();
          if (Math.abs(f.x) < 0.8) this.genSinceSide = true;
          if (expect !== 'gen') return wrong('A genuflection was not called for here.', is('gen'));
          if (this.lastGo && !near(this.lastGo, 2.2)) return wrong('Genuflect at ' + (SPOT_TEXT[this.lastGo] || this.lastGo) + '.', null);
          if (!facesWay(f, Math.PI)) { c.mistakes++; d.mistake('You genuflected facing the wrong way', 'Genuflect towards the altar.', this.beat); }
          return this.done();
        case 'genhold':
          if (f.posture !== 'stand') return;
          f.genHold();
          if (expect !== 'genhold') return wrong(expect === 'gen' ? 'Just genuflect and rise — no need to stay down.' : 'You genuflected — not now.', expect === 'gen' ? null : is('genhold', 'gen'), posed('genhold'));
          if (!facesWay(f, Math.PI)) { c.mistakes++; d.mistake('You genuflected facing the wrong way', 'Genuflect towards the altar.', this.beat); }
          return this.done();
        case 'rise':
          if (f.posture !== 'genhold') return;
          f.stand();
          if (expect === 'rise') return this.done();
          if (this.excuse(is('rise', 'stand'), posed('stand'))) return;
          this.unheld = true;
          return wrong('Stay down until the priest reaches the top step.', null);
        case 'bow': {
          const lvl = arg === 'head' ? 1 : arg === 'deep' ? 3 : 2;
          if (f.bowLevel === lvl) {                 // second press: straighten up
            f.bow(0);
            if (expect === 'up') return this.done();
            if (this.excuse(is('up'), posed(null, () => !f.bowLevel))) return;
            this.unbowed = lvl;
            return wrong('You straightened up too early.', null);
          }
          if (this.unbowed && !f.bowLevel && expect !== 'bow') { f.bow(this.unbowed); this.unbowed = null; return; }      // going back down: that is putting it right
          const target = c && c.verb === 'bow' && c.args[1] && FIG[c.args[1]] ? FIG[c.args[1]].headWorld() : null;
          f.bow(lvl, target);
          if (expect === 'bow' && c.args[0] === arg) return this.done();
          if (expect === 'bow') return wrong(c.args[0] === 'head' ? 'Only your head is bowed here.' : `A ${c.args[0] === 'deep' ? 'profound' : 'moderate'} bow is wanted here.`, null);
          return wrong('No bow is called for here.', is('bow'), posed(null, () => f.bowLevel > 0));
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
          if (expect !== 'kiss') return wrong('Nothing to kiss now.');      // a kiss a moment early counts when its moment comes
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
          if (f.lift) { f.lift = null; return wrong('You let go of the chasuble too soon.', null); }
          return wrong('There is no vestment to hold now.', is('pinch', 'lift'), () => this.act('vest'));
        }
        case 'pour': {
          if (expect !== 'pour') return wrong('Nothing to pour now.', is('pour'), () => this.act('pour'));
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
          return wrong('You held out your hand when nothing was being given.', is('take'), () => this.act('hand'));
        }
        case 'take': case 'put': case 'give': case 'touch': case 'gate': case 'candle': case 'fold': case 'sit':
          if (c && USE_AS[c.verb] === type) return this.use();
          return wrong('That is not what is wanted now.', cue => USE_AS[cue.verb] === type, () => this.act(type, arg));
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
        case 'under': {      // you have to be there: beside the priest, at the rail, near enough to reach under the chin
          if (Props.holder(a0) !== d.player) return UI.toast('You are not holding the paten.');
          if (FIG[a1].posture !== 'kneel') return UI.toast('Wait for the communicant to kneel at the rail.');
          const at = underChin(FIG[a1]);
          if (Math.hypot(f.x - at.x, f.z - at.z) > 1.8 || f.posture !== 'stand') return UI.toast('Go up to the rail, at the priest’s right.');
          return this.runAuto();
        }
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
          f.walkTo(x, z, { speed: walk() * d.o.speed, route: Nav.route(f.x, f.z, x, z) }).then(() => { this.autoing = false; if (this.cur === c) this.runAuto(); });
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
      if (this.sigOnDone) { this.d.signal(this.d.player, this.sigOnDone, c.beat); this.sigOnDone = null; }      // the sign is in the doing, as it begins
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
    timeFor(d, ref) { if (d.player === 'P') return 5; return /^confiteor-m\.0/.test(ref) || (d.o.respond !== 'type' && /^confiteor-m\.[1-7]$/.test(ref)) ? 3 : 1.5; },
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
      const own = d.player === 'P' || /^confiteor-m\.[0-7](-7)?$/.test(ref);      // going on with your own prayer: nobody has said anything to you
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
      if (own && d.player !== 'P' && d.o.respond !== 'type') await d.step(d.sleep((result.ok ? Math.max(1.4, t.la.length * 0.065) : 1) * d.o.speed));      // typed, it has already taken as long as it took
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
        // gone by it: at it, or further on than it, towards the next point or (going your own way, ahead) towards where the walk ends
        const { at, next, goal } = this.owed[0], gone = (p, m = 0) => p && Math.hypot(f.x - p[0], f.z - p[1]) < Math.hypot(at[0] - p[0], at[1] - p[1]) - m;
        if (Math.hypot(f.x - at[0], f.z - at[1]) < 0.5 || gone(next) || gone(goal, 0.3)) { this.stage++; this.owed.shift(); } else break;
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
      // as the priest you are led by the Mass: you move when it is yours to move, and otherwise stay at the altar
      const mayMove = d.player !== 'P' || (c && /^(go|turn|faceto)$/.test(c.verb));
      if (!this.autoing && !UI.paused && mayMove) {
        const turned = Input.turn(f, dt);
        if (turned && c && c.verb === 'turn') c.turned = (c.turned || 0) + turned;
        if (turned && c) c.turnedAt = this.t;
      }
      // a turn wanted, made with ← → and come round to the right way: was it the right way round?
      if (c && c.verb === 'turn' && c.turned && !this.autoing && Math.abs(wrap(f.heading - headingFor(d.player, c.args[1]))) < 0.8) {
        if (Math.abs(c.turned) > 1.2 && (c.turned < 0) !== (c.args[0] === 'cw')) { c.mistakes++; d.mistake('You turned the wrong way round', 'Turn ' + (c.args[0] === 'cw' ? 'clockwise (→)' : 'counter-clockwise (←)') + '.', this.beat); }
        this.done();
        return;
      }
      if (c && !this.autoing && ((c.verb === 'up' && !f.bowLevel) || (c.verb === 'stand' && f.posture === 'stand') || (c.verb === 'kneel' && f.posture === 'kneel'))) { this.unbowed = null; this.unknelt = false; this.done(); return; }
      if (c && c.verb === 'faceto' && !this.autoing && !UI.paused && Math.abs(wrap(f.heading - headingFor(d.player, c.args[0]))) < 0.8) { this.done(); return; }
      const going = Input.walk();
      if (going && !this.autoing && f.posture === 'stand' && !UI.paused && mayMove) {
        {
          const sp = walk() * d.o.speed * dt * (going < 0 ? BACK : 1);      // the same pace as everyone else in this Mass
          const way = Input.steer(f, dt), wx = Math.sin(way) * going, wz = Math.cos(way) * going;
          // how a server does not move: backwards, beyond a step; or away from your place when nothing asks you to walk.
          // Walking on to the very spot you were going to is no fault, however the cue had already counted you there; nor is a step closer for a task in your hands
          if (!(d.o.casual || d.o.choir || d.o.priest)) {
            if (this.moveCue !== c) {
              const s = this.lastGo && spot(this.lastGo);
              this.moveCue = c; this.backed = 0; this.backSlip = this.shuffleSlip = false;
              this.moveBase = s ? [s[0], s[1]] : [f.x, f.z]; this.moveRoom = Math.hypot(f.x - this.moveBase[0], f.z - this.moveBase[1]) + 0.7;
            }
            if (going < 0 && !(c && c.verb === 'go' && c.args[1] === 'back')) this.backed += sp;
            if (this.backed > 0.6 && !this.backSlip) { this.backSlip = true; d.mistake('You walked backwards', 'Turn and walk the way you are going: a single step back at most.', this.beat); }
            // and the other way about: down from the altar after the Consecration you step back, never turning your back on it
            if (c && c.verb === 'go' && c.args[1] === 'back' && going > 0 && !c.turnedBack && Math.abs(wrap(f.heading - Math.PI)) > 1.6) {
              c.turnedBack = true; c.mistakes++; d.mistake('You turned your back on the altar', describe(c.cmd)[0] + '.', this.beat);
            }
            const away = Math.hypot(f.x + wx * sp - this.moveBase[0], f.z + wz * sp - this.moveBase[1]);
            if (!(c && (c.verb === 'go' || USE_FIT.has(c.verb))) && away > this.moveRoom && !this.shuffleSlip && !this.nextLeg()) { this.shuffleSlip = true; d.mistake('You moved about when you should have kept still', c ? describe(c.cmd)[0] : 'Stay where you are until your next cue.', this.beat); }
          }
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
      f.lookBack = going < 0 && f.manualWalk ? (f.x >= 0 ? -1.1 : 1.1) : null;      // stepping backwards, you look over your shoulder
      const atLiberty = d.o.casual || d.o.choir || d.o.priest;
      if (this.late && OWED.test(this.late.verb) && this.t - this.late.at > 20 && !this.owes(d, this.late)) this.late = null;      // taken some other way: nothing left to put right
      if (!atLiberty && !this.autoing && !UI.paused && !window.__serve.autoplay && this.checkPlace(d, f, c, dt)) return;
      if (!atLiberty && !UI.paused && !window.__serve.autoplay) { this.checkFacing(d, f, c, dt); if (d.failed) return; }
      // the moment for his alb is while he is on the steps: once he is at the top it has gone
      if (c && c.verb === 'pinch' && !this.autoing && !UI.paused && FIG.P.y >= C.heightAt(spot('P.mid')[0], spot('P.mid')[1]) - 0.03) { this.miss(); return; }
      if (c && c.verb === 'go' && !this.autoing) {
        const s = spot(c.args[0]);
        goRing.visible = UI.coach(); goArrow.visible = UI.coach();
        goArrow.position.set(s[0], C.heightAt(s[0], s[1]) + 0.5 + Math.sin(performance.now() / 250) * 0.05, s[1]);
        goArrow.rotation.set(Math.PI, 0, 0);
        // the circle is a guide, not a rule: near enough is there; and a point on the way is cleared once you are past it
        const away = Math.hypot(f.x - s[0], f.z - s[1]), isPoint = /^w_/.test(c.args[0]), nx = this.nextPoint;
        const goal = this.legOpen && this.legGoal ? this.legGoal : nx;
        const past = isPoint && goal && Math.hypot(f.x - goal[0], f.z - goal[1]) < Math.hypot(s[0] - goal[0], s[1] - goal[1]) - 0.1;
        const handsOn = /^(el|com|cru|top|veil|st2|plate|abl|grad|cred|sed|pr\d|cr\d)/.test(c.args[0]);     // beside the priest or at the table you must be within reach
        const atFoot = /^(mid[LR]?|x[EG])$/.test(c.args[0]);     // the foot of the altar is on the floor: from here the servers cross, and the other one's way is the step above; and you kneel head on, not on the corner
        if (f.posture === 'stand' && (away < (isPoint ? 1.1 : atFoot ? 0.4 : handsOn ? 0.55 : 0.9) || past)) this.done();
      }
      // nobody waits: what you have not done when its moment has passed is missed
      if (c && !this.autoing && !UI.paused) {
        const heldBy = c.verb === 'take' ? Props.holder(c.args[0]) : null;
        const waitingOnThem = (heldBy && (heldBy === d.player || !(Props.out[heldBy] && Props.out[heldBy].has(c.args[0]))))
          || (c.verb === 'touch' && !(Props.out[c.args[0]] && Props.out[c.args[0]].has('water-fingers')))
          || c.verb === 'under';
        if (!waitingOnThem && !window.__serve.autoplay) {
          c.left -= dt;
          if (c.left <= 0) {
            if (c.verb === 'go' && /^w_/.test(c.args[0])) { this.done(); return; }
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
            } else if ((c.verb === 'turn' || c.verb === 'faceto') && this.t - (c.turnedAt == null ? -9 : c.turnedAt) < 0.4 && (c.extra || 0) < 8) { c.extra = (c.extra || 0) + 1; c.left = 0.75; }      // still coming round
            else this.miss();
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
    [C.LAYOUT.sedilia.x - 0.3, C.LAYOUT.sedilia.z - 0.3, C.LAYOUT.sedilia.x + 0.3, C.LAYOUT.sedilia.z + 0.3],
    ...C.LAYOUT.chairs.map(([x, z]) => [x - 0.23, z - 0.23, x + 0.23, z + 0.23]),
    ...C.LAYOUT.columns.map(([x, z]) => [x - 0.28, z - 0.28, x + 0.28, z + 0.28]),
    [C.LAYOUT.lectern[0] - 0.25, C.LAYOUT.lectern[1] - 0.2, C.LAYOUT.lectern[0] + 0.25, C.LAYOUT.lectern[1] + 0.25],
    [2.32, -2.3, 2.88, -1.5], [-2.88, -2.3, -2.32, -1.5],
    [-C.LAYOUT.wallSide, C.LAYOUT.wallBack - 0.3, C.LAYOUT.wallSide, C.LAYOUT.wallBack],
  ];
  /** The altar and rail (whose gap closes with the gates), and the neighbouring houses. */
  let throughCars = false;       // once a vehicle is on top of you, it no longer stops you walking out of it
  function blocked(x, z, r) {
    for (const [a, b, c2, d2] of SOLID) if (x > a - r && x < c2 + r && z > b - r && z < d2 + r) return true;
    const rz = C.LAYOUT.rail;
    if (Math.abs(z - rz) < 0.1 + r && Math.abs(x) < Plan.CH.railX + 0.1) {
      const g = C.LAYOUT.gateHalf;
      if (Math.abs(x) > g - r) return true;
      if ((x >= 0 ? FX.gates.gateE : FX.gates.gateG).open < 0.5) return true;
    }
    if (!throughCars && (CARS.solidAt(x, z, r) || CART.solidAt(x, z, r) || RAIL.solidAt(x, z, r))) return true;
    return OUT3D.inHouse(x, z);
  }
  function collide(x0, z0, x1, z1) {
    throughCars = CARS.solidAt(x0, z0, 0.1) || CART.solidAt(x0, z0, 0.1) || RAIL.solidAt(x0, z0, 0.1);
    const out = collideFree(x0, z0, x1, z1);
    throughCars = false;
    return out;
  }
  function collideFree(x0, z0, x1, z1) {
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
    active: false, region: '', runHeld: false, seat: null, down: null, tipAt: 0,
    start(at) {
      if (director) director.stop();
      director = null; Player.d = null; Player.cur = null;
      UI.paused = false; $('#pause').hidden = true; $('#failed').hidden = true;
      Grab.reset();
      resetWorld({ servers: 1, communion: false });
      FIG.P.root.visible = false;
      this.active = true; walkerOut = FIG.A1;
      this.leaveRide(true); this.leaveCart(true); CART.reset(); this.getUp();
      this.wide(true);
      const f = FIG.A1, [x, z] = Plan.world(8, 15);
      f.place(x, z, Math.PI); f.y = 0;
      if (at) f.place(at[0], at[1], at[2]);
      this.seat = null;
      camera.position.set(f.x, 3, f.z + 4.6);
      Cam.fixed = false; Cam.offset = Cam.pitch = 0; Cam.snap = true;
      youRing.visible = false; goRing.visible = false; goArrow.visible = false;
      for (const id of ['#caption', '#note', '#respond', '#remind']) $(id).hidden = true;
      $('#explore-bar').hidden = false;
      document.body.dataset.mode = 'explore';
      UI.show('hud');
      this.region = '';
      this.setRegion();
    },
    stop() { this.getUp(); this.leaveRide(true); this.leaveCart(true); this.wide(false); this.active = false; this.seat = null; walkerOut = null; $('#explore-bar').hidden = true; FIG.P.root.visible = true; },
    /** The choir bench you are beside. */
    benchSide(f) { for (const k of ['E', 'G']) { const s = spot('K.' + k); if (Math.hypot(f.x - s[0], f.z - s[1]) < 1.5) return k; } return null; },
    sitInChoir(k) {
      const f = FIG.A1, s = spot('K.' + k);
      f.walk = null; f.turn = null; f.manualWalk = false; f.walkingManual = 0; f.x = s[0]; f.z = s[1]; f.heading = s[2]; f.sit();
      this.seat = k; Cam.offset = Cam.pitch = 0;
    },
    /** Enter, or the button: sit down in choir, and once there, begin. Says whether it did anything. */
    choirKey() {
      const f = FIG.A1; if (CART.driving) return false;
      if (this.seat && f.posture === 'sit') { startChoir(this.seat, [f.x, f.z, f.heading]); return true; }
      const k = f.posture === 'stand' && this.benchSide(f);
      if (k) { this.sitInChoir(k); return true; }
      return false;
    },
    choirButton() {
      const b = $('#btn-choir'), f = FIG.A1, seated = this.seat && f.posture === 'sit', near = seated || (!CART.driving && f.posture === 'stand' && !!this.benchSide(f));
      if (near === b.hidden) b.hidden = !near;
      const text = seated ? 'Start the Mass (Enter)' : 'Sit in choir (Enter)';
      if (b.textContent !== text) b.textContent = text;
    },
    /** Outdoors on foot or on wheels you can see across the whole town; at Mass there is no need. */
    wide(on) {
      const reach = on ? WIDE.fogFar : 620;
      SKY.fogFar = reach; OUT3D.treeFar = reach; camera.far = on ? reach * 1.15 : 900; camera.updateProjectionMatrix();
      if (on) WIDE.wake();
    },
    /** Into the cart beside you, or back out of the one you are in. */
    toggleCart() {
      if (!this.active || UI.paused || this.down) return;
      const f = FIG.A1;
      if (CART.driving) {
        const c = CART.driving, out = CART.getOutAt(c, (x, z) => Plan.free(x, z, 0.18, blocked));
        if (!out) { UI.toast('There is no room to get out here.'); return; }
        if (Math.abs(c.speed) > 2) { UI.toast('Stop first.'); return; }
        this.leaveCart(false, out);
      } else {
        const c = CART.nearest(f.x, f.z, 2.6);
        if (!c || f.posture !== 'stand') return;
        CART.driving = c; f.pose = {}; f.walk = null; f.turn = null; f.manualWalk = false; f.walkingManual = 0;
        f.heading = c.h; f.rideY = CART.seatLift; f.sit('sit');
        Cam.offset = 0;
        audio();
      }
      this.cartButton(true);
    },
    leaveCart(quiet, at) {
      const f = FIG.A1, c = CART.driving;
      if (!c) return;
      c.speed = 0; c.steerA = 0; CART.driving = null;
      f.rideY = 0; f.pose = {};
      if (at) { f.x = at[0]; f.z = at[1]; }
      if (!quiet) f.stand(); else if (f.posture !== 'stand') f.stand();
      Cam.offset = 0;
      if (this.hum) { const g = this.hum.gain.gain, t = this.hum.a.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(0, t); g.__lv = 0; g.__t = t; }
    },
    /** Something on wheels has reached you. Moving, it knocks you flat and clear of it; barely moving, it just shoves you aside. */
    struck(hit) {
      const f = FIG.A1, fx = Math.sin(hit.h), fz = Math.cos(hit.h), rx = fz, rz = -fx, way = hit.side >= 0 ? 1 : -1, sp = Math.abs(hit.speed);
      if (sp < 2.2) {
        // out by the shortest way, at a stumbling pace
        const step = Math.min(hit.half + 0.3 - Math.abs(hit.side), 0.06), nx = f.x + rx * way * step, nz = f.z + rz * way * step;
        throughCars = true; if (Plan.free(nx, nz, 0.18, blocked)) { f.x = nx; f.z = nz; } throughCars = false;
        return;
      }
      const on = Math.sign(hit.speed) * Math.min(sp, 14) * 0.55, off = way * (3.2 + Math.min(sp, 14) * 0.35), vx = fx * on + rx * off, vz = fz * on + rz * off;
      f.walk = null; f.turn = null; f.manualWalk = false; f.walkingManual = 0;
      f.heading = Math.atan2(-vx, -vz);        // facing what hit you, and going over backwards
      this.down = { t: 0, vx, vz };
      this.bump(Math.min(8, sp));
    },
    /** On the ground, and up again. */
    fallen(dt) {
      const f = FIG.A1, D = this.down, FLY = 0.55, LIE = 1.7, UP = 2.5;
      D.t += dt;
      if (D.t < FLY) {
        const nx = f.x + D.vx * dt, nz = f.z + D.vz * dt;
        throughCars = true; const open = Plan.free(nx, nz, 0.18, blocked); throughCars = false;
        if (open) { f.x = nx; f.z = nz; } else { D.vx = 0; D.vz = 0; }
        const k = Math.max(0, 1 - dt * 2.4); D.vx *= k; D.vz *= k;
      }
      // never left lying under it
      const under = CARS.hitBy(f.x, f.z, 0.1) || RAIL.hitBy(f.x, f.z, 0.1);
      if (under) { const way = under.side >= 0 ? 1 : -1, nx = f.x + Math.cos(under.h) * way * dt * 3, nz = f.z - Math.sin(under.h) * way * dt * 3; throughCars = true; if (Plan.free(nx, nz, 0.18, blocked)) { f.x = nx; f.z = nz; } throughCars = false; if (D.t > LIE - 0.2) D.t = LIE - 0.2; }
      const tilt = D.t < 0.42 ? (t => t * t * (3 - 2 * t))(D.t / 0.42) : D.t < LIE ? 1 : Math.max(0, 1 - (D.t - LIE) / (UP - LIE));
      f.body.rotation.x = -1.5 * tilt;
      f.body.position.y = 0.14 * tilt + (D.t < FLY ? Math.sin(Math.PI * D.t / FLY) * 0.22 : 0);
      if (D.t >= UP) this.getUp();
      this.setRegion();
    },
    getUp() { const f = FIG.A1; this.down = null; f.body.rotation.x = 0; f.body.position.y = 0; },
    /** Getting on: the bus or train whose open door you are standing at. */
    canBoard() {
      const f = FIG.A1; if (Ride.on || CART.driving || this.down || f.posture !== 'stand') return null;
      const v = TRANSIT.boardable(f.x, f.z); if (v) return { kind: 'bus', v };
      const q = RAIL.boardable(f.x, f.z); if (q) return { kind: 'train', v: q.t, car: q.car };
      return null;
    },
    board(b) {
      const f = FIG.A1;
      f.walk = null; f.turn = null; f.manualWalk = false; f.walkingManual = 0; f.root.visible = false; f.aboard = true;
      Object.assign(Ride, { on: true, kind: b.kind, v: b.v, car: b.car || null, seated: true });
      Ride.inside = b.kind === 'bus' ? TRANSIT.interior(b.v) : RAIL.interior();
      Ride.frame.group.add(Ride.inside.group);
      const c = Ride.frame; b.v.aboard = true; b.v.seatsTaken = new Set();
      PEOPLE.fillVehicle(b.v, b.car, Ride.inside.seats, Ride.inside.floor, b.kind === 'bus' ? Ride.inside.driver : null, b.kind === 'bus' ? (b.v.riders == null ? (b.v.riders = 2 + Math.floor(Math.random() * 7)) : b.v.riders) : 4 + Math.floor(Math.random() * 12));
      // the free seat nearest the door, by a window for choice
      const door = b.kind === 'bus' ? Ride.inside.door[1] : Ride.inside.door, free = Ride.inside.seats.filter(q => !b.v.seatsTaken.has(q)).sort((p, q) => (Math.hypot(p.z - door.z, p.x) - Math.abs(p.x) * 0.5) - (Math.hypot(q.z - door.z, q.x) - Math.abs(q.x) * 0.5));
      Ride.seat = free[0] || Ride.inside.seats[0]; b.v.seatsTaken.add(Ride.seat);
      Ride.lx = Ride.seat.x; Ride.lz = Ride.seat.z; f.heading = Ride.seat.h || 0; void c;
      Cam.offset = Cam.pitch = 0; Cam.snap = true;
      audio();
      if (AMB.hiss) AMB.hiss(f.x, f.z);
    },
    /** Off at the door, onto the sidewalk or the platform. `quiet` when the whole thing is being reset. */
    leaveRide(quiet) {
      if (!Ride.on) return;
      const f = FIG.A1, c = Ride.frame, v = Ride.v;
      const door = Ride.kind === 'bus' ? Ride.inside.door[1] : { x: v.side * (Rail.W / 2 + 0.7), z: 0 };
      const co = Math.cos(c.h), si = Math.sin(c.h), wx = (lx, lz) => [c.x + lx * co + lz * si, c.z - lx * si + lz * co];
      let spot = null;
      for (const reach of [0, 0.6, 1.2, 2, 3]) for (const along of [0, 1, -1, 2, -2, 3, -3]) { const out = Math.sign(door.x) * (Math.abs(door.x) + reach), q = wx(out, door.z + along); if (Plan.free(q[0], q[1], 0.18, blocked)) { spot = q; break; } if (spot) break; }
      spot = spot || wx(door.x, door.z);
      f.x = spot[0]; f.z = spot[1]; f.y = 0; f.heading = c.h + (door.x < 0 ? -Math.PI / 2 : Math.PI / 2); f.root.visible = true; f.aboard = false;
      Ride.frame.group.remove(Ride.inside.group);
      PEOPLE.emptyVehicle(v); v.aboard = false; v.ended = false;
      Object.assign(Ride, { on: false, kind: '', v: null, car: null, inside: null, seat: null });
      AMB.riding('', 0);
      Cam.offset = Cam.pitch = 0; Cam.snap = true;
      if (!quiet && AMB.hiss) AMB.hiss(f.x, f.z);
    },
    /** Enter: on, or off. Says whether it did anything. */
    rideKey() {
      if (Ride.on) {
        if (Ride.v.dwell > 0) { this.leaveRide(false); return true; }
        UI.toast(Ride.kind === 'bus' ? 'The doors open at the next stop.' : 'The doors open at the next station.');
        return true;
      }
      const b = this.canBoard(); if (b) { this.board(b); return true; }
      return false;
    },
    rideButton() {
      const b = $('#btn-ride'); let text = '';
      if (Ride.on) { if (Ride.v.dwell > 0) text = Ride.kind === 'bus' ? 'Get off here (Enter)' : `Get off${Ride.v.station ? ' at ' + Ride.v.station.name : ''} (Enter)`; }
      else { const q = this.canBoard(); if (q) text = q.kind === 'bus' ? `Get on the ${q.v.route.ref} bus (Enter)` : 'Get on the train (Enter)'; }
      if (!!text === b.hidden) b.hidden = !text;
      if (text && b.textContent !== text) b.textContent = text;
    },
    /** Riding: your place moves with the vehicle; you can look about, and walk the aisle. */
    updateRide(dt) {
      const f = FIG.A1, c = Ride.frame, I = Ride.inside, v = Ride.v;
      Input.turn(f, dt);
      const going = Input.walk();
      if (going) {
        Ride.seated = false; if (Ride.seat) { v.seatsTaken.delete(Ride.seat); Ride.seat = null; }
        const sp = 1.5 * going * dt; let nx = Ride.lx + Math.sin(f.heading) * sp, nz = Ride.lz + Math.cos(f.heading) * sp;
        const B = I.bounds, zlo = B.z0 != null ? B.z0 : -B.z, zhi = B.z1 != null ? B.z1 : B.z;
        Ride.lx = Math.abs(Ride.lx) > B.x ? Ride.lx + (Math.sign(-Ride.lx)) * Math.min(Math.abs(Ride.lx) - B.x, dt * 2) : Math.max(-B.x, Math.min(B.x, nx));
        Ride.lz = Math.max(zlo, Math.min(zhi, nz));
      }
      const co = Math.cos(c.h), si = Math.sin(c.h);
      f.x = c.x + Ride.lx * co + Ride.lz * si; f.z = c.z - Ride.lx * si + Ride.lz * co; f.y = 0;
      AMB.riding(Ride.kind, v.speed != null && Ride.kind === 'bus' ? v.speed : v.v || 0);
      if (v.ended) {
        if (Ride.kind === 'bus') { UI.toast('End of the line: everybody off.'); this.leaveRide(false); return; }
        if (!Ride.endNoted) { Ride.endNoted = true; UI.toast('The line goes on beyond the map, so this train turns back here.'); }
      } else Ride.endNoted = false;
      const street = Plan.regionAt(f.x, f.z) === 'Northridge' || Plan.regionAt(f.x, f.z) === 'Chatsworth' ? (WIDE.streetAt(f.x, f.z) || Plan.regionAt(f.x, f.z)) : Plan.regionAt(f.x, f.z);
      const r = Ride.kind === 'bus' ? `On the ${v.route.ref} bus · ${street}` : `On the train · ${Plan.regionAt(f.x, f.z)}`;
      if (r !== this.region) { this.region = r; $('#part').textContent = r; $('#btn-serve-here').hidden = true; }
    },
    /** The button shows only when it would do something. */
    cartButton(force) {
      const b = $('#btn-cart'), f = FIG.A1, driving = !!CART.driving, near = !Ride.on && (driving || (f.posture === 'stand' && !!CART.nearest(f.x, f.z, 2.6)));
      if (force || near !== !b.hidden) b.hidden = !near;
      const text = driving ? 'Get out of the golf cart (Enter)' : 'Get in the golf cart (Enter)';
      if (b.textContent !== text) b.textContent = text;
      const tip = Ride.on ? '↑ ↓ walk the aisle · Ctrl sit or stand' : driving ? '↑ drive · ↓ brake · ← → steer' : '↑ ↓ walk · ← → turn · Shift run', tipEl = $('#explore-tip'), now = performance.now();
      if (tipEl.textContent !== tip) { tipEl.textContent = tip; this.tipAt = now; }
      tipEl.classList.toggle('faded', now - this.tipAt > 9000);
    },
    /** A cart's motor: a low electric hum that rises with the speed. */
    motor(speed) {
      if (!opts.sound) return;
      const a = audio(); if (!a) return;
      if (!this.hum) {
        const o = a.createOscillator(), gain = a.createGain(), filter = a.createBiquadFilter();
        o.type = 'sawtooth'; filter.type = 'lowpass'; filter.frequency.value = 420; gain.gain.value = 0; gain.gain.setValueAtTime(0, a.currentTime); gain.gain.__lv = 0; gain.gain.__t = a.currentTime;
        o.connect(filter); filter.connect(gain); gain.connect(a.mix.master); o.start();
        this.hum = { o, gain, a };
      }
      const s = Math.abs(speed) / CART.TOP;
      glide(a, this.hum.o.frequency, 58 + s * 150, 0.08);
      glide(a, this.hum.gain.gain, CART.driving ? 0.012 + s * 0.022 : 0, 0.1);
    },
    bump(hard) {
      if (!opts.sound) return;
      const a = audio(); if (!a) return;
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(90, a.currentTime); o.frequency.exponentialRampToValueAtTime(38, a.currentTime + 0.16);
      g.gain.setValueAtTime(Math.min(0.5, 0.1 + hard * 0.05), a.currentTime); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.2);
      o.connect(g); g.connect(a.mix.master); o.start(); o.stop(a.currentTime + 0.22);
    },
    setRegion() {
      const f = FIG.A1; let r = Plan.regionAt(f.x, f.z);
      if (r === 'Northridge' || r === 'Chatsworth') r = WIDE.streetAt(f.x, f.z) || r;
      if (r !== this.region) {
        this.region = r; $('#part').textContent = r;
        $('#btn-serve-here').hidden = r !== 'The sacristy';
      }
    },
    update(dt) {
      if (!this.active || UI.paused) return;
      const f = FIG.A1;
      this.cartButton(); this.choirButton(); this.rideButton();
      if (Ride.on) { this.updateRide(dt); return; }
      if (this.down) { this.fallen(Math.min(dt, 0.05)); return; }
      if (!CART.driving) { const hit = CARS.hitBy(f.x, f.z, 0.12) || RAIL.hitBy(f.x, f.z, 0.12); if (hit) { this.struck(hit); if (this.down) return; } }
      if (CART.driving) {
        const c = CART.driving, d = Input.down, open = (x, z) => Plan.free(x, z, 0.02, blocked) && !WIDE.trunkAt(x, z, 0.02) && !/sacristy|servers|sanctuary|nave|narthex|parish hall$|auditorium|arcade|covered walk/i.test(Plan.regionAt(x, z));
        const hit = CART.drive(c, Math.min(dt, 0.05), { gas: !!d.ArrowUp, brake: !!d.ArrowDown, way: (d.ArrowLeft ? 1 : 0) - (d.ArrowRight ? 1 : 0) }, open);
        if (hit) this.bump(hit);
        this.motor(c.speed);
        const [sx, sz] = CART.seat(c);
        f.x = sx; f.z = sz; f.heading = c.h; f.y = 0;
        this.setRegion();
        return;
      }
      Input.turn(f, dt);
      const going = Input.walk();
      if (going && f.posture === 'stand') {
        const indoors = /sacristy|servers|sanctuary|nave|narthex|parish hall$|auditorium/i.test(this.region);
        const sp = (indoors ? 1.7 : 3.1) * (this.runHeld ? 2 : 1) * (going < 0 ? BACK : 1) * dt;
        const way = Input.steer(f, dt), [ox, oz] = collide(f.x, f.z, f.x + Math.sin(way) * going * sp, f.z + Math.cos(way) * going * sp);
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
      if (this.down) return;
      if (Ride.on) {
        if (type === 'sit' || type === 'stand' || type === 'rise') {
          if (Ride.seated) { Ride.seated = false; if (Ride.seat) { Ride.v.seatsTaken.delete(Ride.seat); Ride.seat = null; } Ride.lx = Math.max(-Ride.inside.bounds.x, Math.min(Ride.inside.bounds.x, Ride.lx)); return; }
          let best = null, bd = 1.6; for (const s of Ride.inside.seats) { if (Ride.v.seatsTaken.has(s)) continue; const d = Math.hypot(s.x - Ride.lx, s.z - Ride.lz); if (d < bd) { bd = d; best = s; } }
          if (best) { Ride.seat = best; Ride.v.seatsTaken.add(best); Ride.lx = best.x; Ride.lz = best.z; Ride.seated = true; f.heading = best.h || 0; } else UI.toast('No free seat just here.');
        }
        return;
      }
      if (CART.driving) return;           // both hands on the wheel
      switch (type) {
        case 'kneel': if (f.posture === 'stand') f.kneel(); return;
        case 'stand': case 'rise': if (f.posture !== 'stand') f.stand(); this.seat = null; return;
        case 'gen': if (f.posture === 'stand') f.genuflect(); return;
        case 'genhold': if (f.posture === 'stand') f.genHold(); return;
        case 'nod': f.nod(); return;
        case 'bow': f.bow(f.bowLevel ? 0 : arg === 'deep' ? 3 : 2); return;
        case 'cross': Gest.cross(f); return;
        case 'small': Gest.small(f); return;
        case 'strike': Gest.strike(f); return;
        case 'sit': if (f.posture === 'stand') { const k = this.benchSide(f); if (k) this.sitInChoir(k); else f.sit(); } return;
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
    /** Is this on the altar steps? */
    onSteps: (x, z) => Math.abs(x) < C.LAYOUT.steps[0][0] + 0.12 && z < C.LAYOUT.steps[0][1] + 0.12,
    clear(ax, az, bx, bz, people, off) {
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 0.1));
      for (let i = 0; i <= n; i++) {
        const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
        if (this.solid(x, z) || (off && off(x, z))) return false;
        if (people) for (const o of people) if (Math.hypot(x - o.x, z - o.z) < 0.5) return false;
      }
      return true;
    },
    /** The way from a to b: null if the straight line will do, else the corners to go by. */
    route(ax, az, bx, bz, people) {
      // the altar steps are for the altar: from the floor (or the first step, where you kneel) to the floor, you walk round them
      const low = (x, z) => C.heightAt(x, z) <= C.LAYOUT.step + 0.01;
      const off = low(ax, az) && low(bx, bz) ? (x, z) => this.onSteps(x, z) && Math.hypot(x - ax, z - az) > 0.45 && Math.hypot(x - bx, z - bz) > 0.45 : null;
      if (this.clear(ax, az, bx, bz, people, off)) return null;
      const { G, x0, z0, nx, nz } = this, id = (i, j) => i + j * nx;
      const cell = (x, z) => [Math.round((x - x0) / G), Math.round((z - z0) / G)];
      const pos = (i, j) => [x0 + i * G, z0 + j * G];
      const open = (i, j) => { if (i < 0 || j < 0 || i >= nx || j >= nz) return false; const [x, z] = pos(i, j); if (this.solid(x, z) || (off && off(x, z))) return false; return !people || people.every(o => Math.hypot(x - o.x, z - o.z) > 0.5); };
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
        for (let k = path.length - 1; k > i; k--) if (this.clear(from[0], from[1], path[k][0], path[k][1], people, off)) { far = k; break; }
        out.push(path[far]); from = path[far]; i = far + 1;
      }
      return out;
    },
  };
  Figure.freeAt = (x, z) => !Nav.solid(x, z);
  Figure.replan = (f, w) => Nav.route(f.x, f.z, w.x, w.z, Figure.bodies.filter(o => o !== f && o.root.visible));

  /** Doors swing open for whoever is going through them: not for someone walking past along the wall, as the servers do on their way to the table. */
  function updateDoors(dt) {
    for (const door of Object.values(SITE3D.doors)) {
      const d = door.d;
      const cx = d.axis === 'x' ? d.c : d.at, cz = d.axis === 'x' ? d.at : d.c;
      let near = false;
      // only someone on their feet goes through a door: sitting or kneeling beside one, as in choir by the changing room, leaves it shut
      for (const f of Object.values(FIG)) {
        if (!f.root.visible || f.posture !== 'stand') continue;
        const along = (d.axis === 'x' ? f.x : f.z) - d.c, across = d.at - (d.axis === 'x' ? f.z : f.x);      // along the wall, and how far short of it
        if (Math.abs(along) > d.w / 2 + 0.6 || Math.abs(across) > 1.5) continue;
        const toward = (d.axis === 'x' ? Math.cos(f.heading) : Math.sin(f.heading)) * Math.sign(across);      // facing into the doorway, not along the wall
        const moving = (f.walk && !f.walk.back) || f.manualWalk;
        // in the doorway; making for it, or standing at it to go through; or still beside it, once it is open
        if (Math.abs(across) < 0.45 || (toward > 0.5 && (moving || Math.abs(across) < 0.8)) || (door.open > 0.5 && Math.hypot(along, across) < 1.2)) { near = true; break; }
      }
      if (!near && PEOPLE.nearDoor(cx, cz)) near = true;
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
    /** Walking with the camera dragged round: you go the way it looks, and turn to face there as you go while it holds still, until it is behind you again. The heading to walk along. */
    steer(f, dt) {
      if (Cam.fixed || !Cam.offset) return f.heading;
      const by = Math.sign(Cam.offset) * Math.min(Math.abs(Cam.offset), 6 * dt);
      f.heading = wrap(f.heading + by); Cam.offset = wrap(Cam.offset - by);
      return wrap(f.heading + Cam.offset);
    },
    /** ↑ forward, ↓ back, along the way you face (or the camera looks: see steer): +1, -1 or 0. */
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
  { const b = $('#bodybtn');
    b.addEventListener('mousedown', e => e.preventDefault());      // the typing stays where it is
    b.addEventListener('pointerdown', e => { e.preventDefault(); audio(); Player.moveBody(); UI.bodyButton(); }); }
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
    if (!UI.paused && Bar.key(e)) { e.preventDefault(); return; }
    if (e.key === 'Enter' && !e.repeat && Explore.active && !(e.target.closest && e.target.closest('button'))) { audio(); if (!Explore.rideKey() && !Explore.choirKey()) Explore.toggleCart(); e.preventDefault(); return; }
    if (e.key === 'Shift' && !e.repeat && !Explore.active) { audio(); Player.act('kneel'); return; }
    if (e.key === 'Control' && !e.repeat) { audio(); standOrSit(); e.preventDefault(); return; }
    if (e.key === ' ') { if (!e.repeat) { audio(); Player.act('cross'); } e.preventDefault(); return; }
    if ((e.key === 'r' || e.key === 'R') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) { Cam.offset = Cam.pitch = 0; e.preventDefault(); return; }
    if (UI.asking && !UI.asking.input && /^[1-4]$/.test(e.key)) { UI.pick(+e.key - 1); e.preventDefault(); return; }
    if (e.key.startsWith('Arrow')) { Input.key(e.key, true); e.preventDefault(); return; }
  });
  window.addEventListener('keyup', e => { if (e.key === 'Shift') Explore.runHeld = false; if (e.key.startsWith('Arrow')) Input.key(e.key, false); });
  /** One thing for your legs: up if you are down, down onto a seat if there is one. */
  function standOrSit() {
    const f = Explore.active ? FIG.A1 : Player.d && Player.d.player && FIG[Player.d.player];
    if (!f) return;
    if (Ride.on) return Explore.act('sit');
    if (f.posture === 'genhold') return Player.act('rise');
    if (f.posture !== 'stand') return Player.act('stand');
    if (canSit(f)) Player.act('sit');
  }
  const seatNear = f => ['K.E', 'K.G', 'stoolE', 'stoolG'].find(n => { const at = spot(n); return Math.hypot(f.x - at[0], f.z - at[1]) < 1.3; });
  const canSit = f => (Player.cur && Player.cur.verb === 'sit') || !!seatNear(f);
  // drag to look around; R or a double click brings the camera back behind you
  { let drag = null;
    canvas.addEventListener('dblclick', () => { Cam.offset = Cam.pitch = 0; });
    const capture = id => { try { canvas.setPointerCapture(id); } catch (err) { /* a test's made-up pointer */ } };
    canvas.addEventListener('pointerdown', e => {
      audio();
      if (Grab.down(e.clientX, e.clientY)) return capture(e.pointerId);      // your own body first
      drag = [e.clientX, e.clientY]; capture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      Grab.move(e.clientX, e.clientY);
      if (drag) { Cam.offset = wrap(Cam.offset - (e.clientX - drag[0]) * 0.006); Cam.pitch = Math.max(-1.2, Math.min(1.7, Cam.pitch - (e.clientY - drag[1]) * 0.005)); drag = [e.clientX, e.clientY]; }
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
      if (d.kind === 'play' && !Player.cur) this.remind(null);      // what is coming, as soon as the moment before it begins
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
    /** While you type, what your body has to do comes up as a button in the middle of the screen, the moment it is due and not before. */
    bodyButton() {
      const el = $('#bodybtn'), label = UI.paused ? null : Player.bodyCue();
      if ((label || '') === (el.dataset.label || '')) return;
      el.dataset.label = label || '';
      el.hidden = !label;
      if (label) { el.textContent = label; el.classList.remove('fresh'); void el.offsetWidth; el.classList.add('fresh'); }
    },
    /** One line: the button, what it is for, and if the moment has a short reason, that. */
    remind(c, beat) {
      const el = $('#remind'), playing = opts.reminders && !window.__serve.autoplay && !!director && director.kind === 'play';
      // with nothing to do this instant, what you will do next, so that it never comes on you suddenly
      const up = !c && playing ? Player.upcoming() : null, on = playing && (!!c || !!up);
      el.hidden = !on; el.classList.toggle('next', !c); document.body.classList.toggle('reminding', on);
      if (!on) return;
      if (!c) { c = C.parse(up.cmd); c.cmd = up.cmd; beat = up.beat; }
      const [text, hint] = describe(c.cmd), button = up ? 'Next' : Player.bodyCue() ? 'Button' : hint;
      // the reason, from the sentences that are about you: what the other server does is not your hint
      const me = director.player, other = me === 'A1' ? 'A2' : 'A1', note = beat && ((beat.notes && beat.notes[me]) || beat.note) || '';
      let why = (note.replace(/^[….\s]+/, '').split(/(?<=[.!?…])\s/).find(x => director.o.servers !== 2 || !new RegExp('\\b' + other + '\\b').test(x) || new RegExp('\\b' + me + '\\b').test(x)) || '').replace(/[….\s]+$/, '');
      why = why.length > 0 && why.length <= 90 && why.toLowerCase() !== text.toLowerCase() ? why[0].toUpperCase() + why.slice(1) + '.' : '';
      fill(el, h('b', { class: 'remind-btn' }, button), h('span', null, text + (text.endsWith('.') ? '' : '.')), why ? h('span', { class: 'remind-why' }, why) : null);
    },
    mistake(text, expected, major) {
      $('#mistakes').textContent = (director.results.slips || 0) + (director.o.failing === false ? '' : ' / ' + SLIP_LIMIT);
      // what the slip was is always said, whatever help or reminders you have chosen: those are about what is coming, this is what has happened
      this.toast((major ? 'Major slip: ' : 'Slip: ') + text.replace(/[.\s]+$/, '') + (expected ? ' — ' + expected : ''), major ? 'bad major' : 'bad', 7000);
    },
    toast(text, kind, ms = 2600) {
      const el = h('div', { class: 'toast ' + (kind || '') }, text);
      $('#toasts').append(el);
      setTimeout(() => el.classList.add('out'), ms);
      setTimeout(() => el.remove(), ms + 600);
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
          const said = Mass.words(t.la), expected = said.map(w => soundOf(w.raw)), easy = opts.typeHelp === 'easy';
          const input = h('textarea', { rows: 2, placeholder: easy ? 'Type the line above…' : 'Start typing…', spellcheck: 'false', autocapitalize: 'off', 'aria-label': 'What you say' });
          const fb = h('div', { class: 'fb' }), okSoFar = h('span', { class: 'typed-ok' }), rest = h('span', { class: 'typed-rest' });
          fill(fb, okSoFar, rest);
          // the easy way: the whole line is there in the box in grey, and what you type takes its place.
          // The box only takes the keys; what you see is drawn behind it, your letters and then the rest of the line from where you have got to
          const line = said.map(w => w.raw).join(' '), mine = h('span'), caret = h('span', { class: 'caret' }), ghostRest = h('span', { class: 'typed-rest' }, line);
          const ghost = easy ? h('div', { class: 'ghost', 'aria-hidden': 'true' }, mine, caret, ghostRest) : null;
          const showGhost = f => {
            const w = said[f.word], upTo = said.slice(0, f.word).map(x => x.raw).join(' ').length + (f.word ? 1 : 0)
              + (w && f.partial ? Math.round(f.partial / Math.max(1, expected[f.word].length) * w.raw.length) : 0);
            mine.textContent = input.value; ghostRest.textContent = line.slice(Math.min(line.length, upTo));
            ghost.classList.toggle('off-line', f.lost);
            const lh = parseFloat(getComputedStyle(ghost).lineHeight) || 26;      // a long prayer scrolls, keeping the line you are on in view
            ghost.scrollTop = Math.max(0, caret.offsetTop - lh);
          };
          // each letter is worth its share of the time the line takes to say, at four syllables a second; a whole long prayer, like the Confiteor, at half that
          const perLetter = syllables(t.la) / ((opts.syllables || 4) * (t.la.length > 150 ? 0.5 : 1)) / Math.max(1, expected.join('').length);
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
          const judge = typed => {
            const f = followLine(expected, typed);
            a.near = f.near; a.muddled = f.muddled; a.offLine = f.lost;
            input.classList.toggle('off-line', f.lost);
            okSoFar.textContent = said.map(w => w.raw).join(' ').slice(0, Math.round(f.n / Math.max(1, f.total) * t.la.length));
            if (ghost) showGhost(f);
            if (f.n > a.progress) { if (!a.hearing) a.left += (f.n - a.progress) * perLetter; a.progress = f.n; if (a.onType) a.onType(f.n); }      // only getting further along the line keeps you going
            if (f.done) { if (a.hearing) { a.chosen = 0; input.blur(); } else a.pick(); }      // ready before he has finished: your keys are the game's again
          };
          input.addEventListener('input', () => judge(input.value));
          input.addEventListener('keydown', e => {
            // the line ends at its last letter; Enter (or a space) says you have finished a last word you did not quite get right
            if (e.key === 'Enter') { e.preventDefault(); if (input.value.trim()) judge(input.value + ' '); }
            if (!e.key.startsWith('Arrow') && e.key !== 'Control' && e.key !== 'Escape') e.stopPropagation();      // you can still turn and walk while you speak
          });
          const hint = h('button', { class: 'btn', tabindex: -1, onmousedown: e => e.preventDefault(), onclick: () => { rest.textContent = '   ' + Mass.initials(t.la); } }, 'First letters');
          fill(el, timer, h('div', { class: 'ask-title' }, title), opts.english ? h('div', { class: 'ask-en' }, t.en) : null, easy ? h('div', { class: 'typebox' }, input, ghost) : input, easy ? null : fb, easy ? null : h('div', { class: 'ask-row' }, hint));
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
      const slips = director && director.kind === 'play' ? director.results.mistakes : [];
      fill($('#pause-slips'), slips.length ? h('div', { class: 'slip-part' }, 'Your slips so far') : null,
        slips.length ? h('ol', { class: 'slips' }, slips.slice(-12).map(m => h('li', null, h('div', { class: 'slip-part' }, m.part), h('div', null, (m.major ? 'Major: ' : '') + m.text),
          m.expected ? h('div', { class: 'slip-exp' }, 'Expected: ' + m.expected) : null))) : null);
      $('#btn-walk-on').hidden = !(director && director.o.fromExplore && director.player);
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
      if (d.kind === 'watch') { this.toast('The Mass has ended. Ite, missa est.'); return; }      // and it stays here, to go back through
      if (d.o.fromExplore) {      // you came here walking around: on you go
        const f = FIG[d.player], at = [f.x, f.z, f.heading];
        this.toast('The Mass has ended. Ite, missa est.'); setTimeout(() => { if (director === d) Explore.start(at); }, 2500); return;
      }
      $('#btn-again').textContent = d.o.choir ? 'Sit in choir again' : d.o.priest ? 'Say Mass again' : 'Serve again';
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
        const endsLine = last && j === expected.length - 1 && whole <= letGo(w.length) && key.length >= w.length;      // all of the last word: not a letter short of it
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
    return { n, total, done: i >= expected.length && !lost, lost, near, muddled, word: i, partial };
  }

  function distractors(t, ref) {
    const priest = director && director.player === 'P';
    const pool = (priest ? [...Mass.LINES.filter(l => l.who === 'P'), ...Object.values(C.T).filter(l => l.who === 'P' && !l.silent)] : Mass.LINES.filter(l => l.who === 'S' || l.who === 'A')).filter(l => l.la !== t.la && !l.la.startsWith('('));
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
  window.__serve = { get director() { return director; }, FIG, Props, Player, C, UI, Input, WIDE, CART, AMB, TRANSIT, RAIL, PEOPLE, Ride, autoplay: params.has('autoplay'),
    Cam, Grab, Fix, FX, headingFor, syllables, followLine, soundOf, Explore, Plan, Nav, camera, renderer, scene, collide, walkFree: (x, z) => Plan.free(x, z, 0.18, blocked), SKY, CARS, OUT3D, SITE3D,
    start: (kind, o) => { Object.assign(opts, o || {}); playAs = {}; kind === 'play' ? beginPlay() : kind === 'explore' ? Explore.start() : kind === 'priest' ? startPriest() : kind === 'choir' ? startChoir((o && o.side) || 'E') : kind === 'casual' ? (playAs = { casual: true, failing: false, fromExplore: true }, beginPlay()) : startWatch(); } };

  function resetWorld(o) {
    Props.reset(); Fix.reset();
    const start = { P: 'sacP', A1: 'sacA1', A2: 'sacA2', C1: 'C1.out', C2: 'C2.out', C3: 'C3.out', C4: 'C4.out', K: 'K.' + (o.choir || 'E') };
    for (const [r, f] of Object.entries(FIG)) {
      f.gestures = []; f.walk = null; f.turn = null; f.legAnim = null; f.lift = null; f.out = false; f.base = null;
      f.keepBehind = null; f.stepping = false; f.walkLook = null; f.tilt = 0; f.jolt = 0; f.blockedBy = null; f.blockedT = 0; f.isPlayer = false; f.bumps = 0; f.bumpAt = null; f.blockSlipAt = null;
      f.bowLevel = 0; f.nodT = 0; f.grip = null; f.posture = 'stand'; f.legPose = [0, 0, 0, 0, window.FigureDims.hip, 0];
      const s = C.SPOTS[start[r]]; f.place(s[0], s[1], s[2]); f.y = 0;
      Props.syncHands(r);
    }
    FIG.A2.root.visible = o.servers === 2;
    FIG.K.root.visible = !!o.choir;
    for (const r of ['C1', 'C2', 'C3', 'C4']) FIG[r].root.visible = !!o.communion;
  }

  function begin(kind, o) {
    if (Explore.active) Explore.stop();
    Explore.region = '';
    Cam.snap = true; Cam.offset = Cam.pitch = 0; camera.position.set(-10.8, 2.2, 5.5); Cam.lookNow.set(-10.8, 1.2, 7);
    if (director) director.stop();
    UI.paused = false; $('#pause').hidden = true; $('#failed').hidden = true; Player.away = 0;
    resetWorld(o);
    director = new Director(kind, o);
    if (director.player) FIG[director.player].isPlayer = true;
    for (const r of ['A1', 'A2']) FIG[r].tempo = r === director.player ? 1 : SERVER_TEMPO;
    if (o.choir) FIG.K.sit();
    $('#mistakes').textContent = o.failing === false ? '0' : '0 / ' + SLIP_LIMIT;
    document.body.classList.toggle('no-score', !!o.casual);
    $('#caption').hidden = true; $('#note').hidden = true; $('#respond').hidden = true; UI.remind(null); UI.asking = null;
    youRing.visible = kind === 'play' && !o.choir;
    Grab.reset();
    Player.d = director; Player.cur = null; Player.lastGo = null; Player.lastFace = null; Player.autoing = false; Player.warnedPace = false; Player.late = null; Player.early = [];
    Player.unbowed = null; Player.unknelt = false; Player.unheld = false; Player.then = null; Player.faceT = 0; Player.faceSlipped = false; Player.faceToasted = false; Player.side = 0; Player.genSinceSide = false; Player.anchor = null; Player.toPlace = null; Player.sigOnDone = null; Player.lastOff = null; Player.straying = false; Player.altarT = 0; Player.sideKey = null; Player.facePerson = false;
    document.body.dataset.mode = kind;
    document.body.dataset.coach = o.mode === 'coach' ? '1' : '0';
    $('#timebar').hidden = kind !== 'watch';
    if (kind === 'watch') { director.line = new Timeline(director); director.line.prepare(); }
    else if (o.skipTo) skipTo(director, o.skipTo);
    else director.run();
  }
  /** Testing: the Mass runs on unseen and unheard, as it does to lay out a watched Mass, to the start of beat k, and you take it up from there. */
  async function skipTo(d, k) {
    const ahead = new Director('watch', d.o);
    ahead.beats = d.beats; ahead.quiet = true;
    const line = ahead.line = new Timeline(ahead);
    director = ahead;      // meanwhile the screen waits, as it does while a watched Mass is laid out
    Player.d = null;      // and you are not yet serving: where the Mass carries you on the way is not you wandering
    UI.toast('Going on to ' + d.beats[k].part + '…');
    ahead.run();
    await nextTask();
    while (!line.saves[k] && !ahead.stopped && !ahead.ended && !ahead.broke) { line.stepOnce(); await nextTask(); }      // a step at a time, as prepare does, so that what is awaited resumes between steps
    if (director !== ahead) return;      // something else was started meanwhile
    ahead.stop();
    director = d; Player.d = d;
    Object.assign(Player, { anchor: null, toPlace: null, sigOnDone: null, lastOff: null, straying: false, altarT: 0, sideKey: null, lastGo: null, lastFace: null, cur: null });      // your place is where you are taken up
    if (!line.saves[k]) { UI.toast('The Mass did not reach ' + d.beats[k].part + ': starting from the beginning.'); return d.run(); }
    line.d = d; line.restore(k);
  }
  function startDemo() { begin('demo', Object.assign({}, opts, { servers: 2, speed: 1.25, communion: true, sermon: 'random' })); UI.show('title'); }
  function toTitle() { startDemo(); }
  function startWatch() { begin('watch', Object.assign({}, opts)); UI.show('hud'); }
  /** Who you are at this Mass, beyond your options: {} to serve; or in choir, or the priest, or only for fun. */
  let playAs = {};
  function startChoir(side, from) { playAs = { choir: side, failing: false, confiteor: true, fromExplore: !!from }; beginPlay(); }
  function startPriest(from, casual) { playAs = { priest: true, failing: false, casual: !!casual, fromExplore: !!from }; beginPlay(); }
  function beginPlay(o) {
    audio();
    if (!o && opts.testSkip) return askSkip(Object.assign({}, opts, playAs));
    begin('play', o || Object.assign({}, opts, playAs)); document.body.classList.toggle('typing', opts.respond === 'type'); UI.show('hud');
  }
  /** Testing: which part to start from. The same seed, so the Mass laid out here is the one you get. */
  function askSkip(o) {
    o.seed = o.seed || (Date.now() % 9973) + 1;
    const beats = C.build(Object.assign({}, o, { wholePrayer: o.respond === 'type' })), parts = [];
    beats.forEach((b, i) => { if (!i || b.part !== beats[i - 1].part) parts.push([b.part, i]); });
    fill($('#skipto-body'), ...parts.map(([part, i]) => h('button', { class: 'btn', onclick: () => { $('#skipto').hidden = true; beginPlay(Object.assign(o, { skipTo: i })); } }, part)));
    const from = ['#failed', '#pause'].find(s => !$(s).hidden);      // asked from the failed or the paused Mass: this takes that panel's place, and Back brings it back
    if (from) $(from).hidden = true;
    $('#skipto').dataset.back = from || '';
    $('#skipto').hidden = false;
  }
  /** Coming to serve: with two servers, you have to say which you are. */
  function startPlay() {
    audio();
    const two = opts.servers === 2;
    for (const b of $$('[data-role]')) b.hidden = !two;
    $('#btn-serve-one').hidden = two;
    $('#failed').hidden = true;
    $('#which').hidden = false;
  }

  // ─── options screen ────────────────────────────────────────────────────────
  const OPTION_UI = [
    ['Servers', 'servers', [[1, 'One server'], [2, 'Two servers']]],
    ['Responses', 'respond', [['choose', 'Choose from four'], ['type', 'Type the Latin']]],
    ['Typing', 'typeHelp', [['easy', 'Easy: the line shown in grey'], ['memory', 'From memory']], () => opts.respond === 'type'],
    ['Pace: the pause before each thing you do, and every gesture', 'pace', [['unhurried', 'Unhurried'], ['natural', 'Natural'], ['brisk', 'Brisk']]],
    ['Help (the priest never waits for you; the other server keeps step with you)', 'mode', [['coach', 'Circles on the floor and warnings'], ['strict', 'None']]],
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
    ['Testing: choose a part to start from', 'testSkip', [[false, 'Off'], [true, 'On']]],
  ];
  const VOLUME_UI = [['All sound', 'volume'], ['Bells', 'volBells'], ['Footsteps', 'volSteps'], ['Outdoors: traffic, birds, trains, sirens', 'volOutdoors'], ['Rain', 'volRain']];
  const percent = v => Math.round(v * 100) + '%';
  function renderOptions() {
    const body = $('#options-body');
    fill(body, ...OPTION_UI.filter(([, , , when]) => !when || when()).map(([label, key, choices]) =>
      h('div', { class: 'opt' }, h('div', { class: 'opt-label' }, label),
        h('div', { class: 'seg' }, choices.map(([v, text]) => h('button', {
          'aria-pressed': String(opts[key] === v), onclick: () => { setOpt(key, v); if (key === 'weather') SKY.setMode(v); if (key === 'pace') Figure.slow = PACES[v] || 1; renderOptions(); },
        }, text))))),
      ...(opts.sound ? VOLUME_UI : []).map(([label, key]) => {
        const val = h('span', null, percent(opts[key]));
        return h('div', { class: 'opt' }, h('div', { class: 'opt-label' }, label + ' ', val),
          h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: opts[key], 'aria-label': label,
            oninput: e => { setOpt(key, +e.target.value); val.textContent = percent(opts[key]); setLevels(); } }));
      }),
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
      ['Kneel', did('kneel'), 'kneel', 1], ['Stand', standOrSit, 'legs', 1], ['Sign of the cross', did('cross'), 'cross', 1],
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
  let frameNo = 0, worldTime = performance.now() / 1000;      // the clock of what sways and flutters: it stops when everything stops
  if (TURBO) {
    // each step is its own task, so awaited animations resume between steps as they would at 60 fps
    const mc = new MessageChannel();
    let n = 0;
    mc.port1.onmessage = () => { step(1 / 60); if (++n % TURBO === 0) setTimeout(() => mc.port2.postMessage(0), 0); else mc.port2.postMessage(0); };
    mc.port2.postMessage(0);
  }
  function frame(now) {
    const real = Math.min(0.05, (now - last) / 1000); last = now;
    if (!TURBO) { step(real); Sharp.watch((now - (frame.prev || now)) / 1000); frame.prev = now; }
    const line = director && director.line;
    if (line && (line.preparing || line.seeking)) Bar.paint();      // the picture stays until there is a moment to show
    else if (!TURBO || (frameNo++ % 8) === 0) renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  function step(real) {
    if (window.__serve.onStep) window.__serve.onStep(real);
    const line = director && director.line;
    // behind the pause menu everything stops; a Mass stopped on its time bar is silent, though the street goes on
    setStill(UI.paused || !!line && (line.preparing || !line.playing || line.scrubbing || line.seeking), UI.paused);
    if (line && line.preparing) return;
    if (UI.paused) { Input.update(); updateActs(real); Grab.update(); Bar.paint(); return; }
    worldTime += real;
    const speed = director ? (director.kind === 'demo' ? 1 : director.o.speed) : 1;
    const sim = window.__serve.frozen != null || (director && director.failed) ? 0 : real * speed;    // the Mass does not stop for anyone's answer
    Input.update();
    if (line) line.advance(real);
    else if (director) { director.tick(sim); director.pollConditions(); }
    Player.update(real);
    UI.bodyButton();
    RAIL.update(real);
    Explore.update(real);
    const me = director && director.player ? FIG[director.player] : null;
    if (!line) for (const f of Object.values(FIG)) {
      // your own figure keeps moving while the Mass waits for your answer
      f.update((f === me && sim === 0) || Explore.active ? real : sim, C.heightAt);
      if (f.manualWalk && f.posture === 'stand') {
        const s = Math.sin(f.phase);
        f.legs.R.hip.rotation.x = -0.4 * s; f.legs.L.hip.rotation.x = 0.4 * s;
        f.legs.R.knee.rotation.x = Math.max(0, -s) * 0.5; f.legs.L.knee.rotation.x = Math.max(0, s) * 0.5;
      }
    }
    if (!line) { Props.update(); Fix.update(sim || real); }
    updateDoors(real);
    // who the camera follows when they are away from the altar
    const focus = Explore.active ? FIG.A1 : me || FIG.P;
    Cam.update(real, focus, Explore.active || (!!me && opts.camera !== 'fixed'));
    updateActs(real);
    Grab.update();
    const standing = Plan.regionAt(focus.x, focus.z);
    const seeOut = !Cam.fixed && standing !== 'The sanctuary';
    Sun.update(focus, seeOut && !SKY.indoors);
    OUT3D.group.visible = seeOut; CARS.group.visible = seeOut; SITE3D.outGroup.visible = seeOut;
    if (seeOut) {
      CARS.update(real); OUT3D.update(camera, worldTime, Explore.active); WIDE.update(camera, Explore.active, worldTime, { night: SKY.night }); CART.update(real);
      // the hands stay on the wheel
      if (CART.driving) { const g = CART.grips(CART.driving), f = FIG.A1; f.pose.R = g.R; f.pose.L = g.L; }
    }
    // what you see and hear goes by where you are, not by where the camera has swung to; the arcade is open to the air
    SKY.indoors = SKY.heardIndoors = !!Cam.fixed || (/sacristy|servers|sanctuary|nave|narthex|parish hall$|auditorium/i.test(standing) && !/arcade/i.test(standing));
    const sounding = opts.sound && !inDemo();
    SKY.update(real, camera, { audio, sound: sounding });
    Traffic.setNight(SKY.night);
    TRANSIT.update(real, { explore: Explore.active, night: SKY.night });
    { const part = director && director.beats && director.beats[director.index] ? director.beats[director.index].part : null;
      PEOPLE.update(real, { explore: Explore.active, mass: !!director && !Explore.active, part, night: SKY.night, wet: SKY.wetness || 0 }); }
    AMB.update(real, { now: worldTime, cars: CARS.cars, sound: sounding, seeOut, aboard: Ride.on, explore: Explore.active, me: me || (Explore.active ? FIG.A1 : null), indoorsAt: (x, z) => /sacristy|servers|sanctuary|nave|narthex|parish hall$|auditorium|arcade|covered/i.test(Plan.regionAt(x, z)) });
    if (director && director.player) {
      const f = FIG[director.player];
      youRing.position.set(f.x, f.y + 0.012, f.z);
    }
    // the host held up at the elevation
    hostMesh.visible = !!(director && director.hostUp);
    Bar.paint();
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
        const L = SKY.lightDir; k.position.set(f.x + L.x * 100, Math.max(12, L.y * 100), f.z + L.z * 100); k.target.position.set(f.x, 0, f.z); k.target.updateMatrixWorld();
        renderer.shadowMap.needsUpdate = true;
      }
    },
  };

  // ─── wiring the screens ────────────────────────────────────────────────────
  $('#btn-play').addEventListener('click', () => { playAs = {}; startPlay(); });
  $('#btn-serve-one').addEventListener('click', () => { $('#which').hidden = true; beginPlay(); });
  $('#btn-as-priest').addEventListener('click', () => { $('#which').hidden = true; startPriest(playAs.fromExplore, playAs.casual); });
  $('#btn-as-choir').addEventListener('click', () => { $('#which').hidden = true; startChoir('E', playAs.fromExplore); });
  $('#btn-choir').addEventListener('click', e => { audio(); Explore.choirKey(); e.currentTarget.blur(); });
  $('#btn-watch').addEventListener('click', startWatch);
  $('#btn-explore').addEventListener('click', () => { audio(); Explore.start(); });
  $('#btn-cart').addEventListener('click', e => { audio(); Explore.toggleCart(); e.currentTarget.blur(); });
  $('#btn-ride').addEventListener('click', e => { audio(); Explore.rideKey(); e.currentTarget.blur(); });
  $('#btn-serve-here').addEventListener('click', () => { playAs = { casual: true, failing: false, fromExplore: true }; startPlay(); });      // you came to walk around: this one is only for fun
  $('#btn-options').addEventListener('click', () => { renderOptions(); $('#options').hidden = false; });
  $('#btn-controls').addEventListener('click', () => { $('#controls').hidden = false; });
  for (const b of $$('[data-close]')) b.addEventListener('click', () => { b.closest('.panel').hidden = true; });
  $('#skipto [data-close]').addEventListener('click', () => { const s = $('#skipto').dataset.back; if (s) $(s).hidden = false; });
  $('#btn-pause').addEventListener('click', () => UI.togglePause());
  $('#btn-resume').addEventListener('click', () => UI.togglePause());
  $('#btn-restart').addEventListener('click', () => { if (Explore.active) return Explore.start(); const k = director.kind; k === 'play' ? beginPlay() : startWatch(); });
  $('#btn-quit').addEventListener('click', toTitle);
  $('#btn-walk-on').addEventListener('click', () => { const f = FIG[director.player]; Explore.start([f.x, f.z, f.heading]); });
  $('#btn-again').addEventListener('click', () => { if (playAs.choir || playAs.priest) beginPlay(); else startPlay(); });
  $('#btn-fail-restart').addEventListener('click', () => beginPlay());      // the same Mass again: you are still who you were
  for (const b of $$('[data-role]')) b.addEventListener('click', () => { setOpt('role', b.dataset.role); $('#which').hidden = true; beginPlay(); });
  $('#btn-which-back').addEventListener('click', () => { $('#which').hidden = true; });
  $('#btn-fail-title').addEventListener('click', () => { $('#failed').hidden = true; toTitle(); });
  $('#btn-title').addEventListener('click', toTitle);
  $('#btn-pause-options').addEventListener('click', () => { renderOptions(); $('#options').hidden = false; });
  const touch = matchMedia('(pointer: coarse)').matches || params.has('touch');
  document.body.classList.toggle('touch', touch);
  buildTouch();
  Bar.init();

  if (params.get('mode') === 'play') startPlay();
  else if (params.get('mode') === 'watch') startWatch();
  else startDemo();
  if (params.has('speed') && director) director.o.speed = +params.get('speed');
  requestAnimationFrame(frame);
})();
