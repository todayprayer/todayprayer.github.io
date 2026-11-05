/*
 * The sky and the weather: drifting clouds drawn in a shader, the light that goes with them, rain falling round the
 * camera, and the sound of it, which you can only vaguely hear from inside the church.
 */
(function (root) {
  'use strict';
  const THREE = root.THREE, Q = root.Quality;

  const STATES = {
    clear: { cover: 0.16, sun: 1.0, ambient: 1.0, dark: 0.0, rain: 0, tint: 1.0 },
    partly: { cover: 0.46, sun: 0.92, ambient: 1.0, dark: 0.04, rain: 0, tint: 1.0 },
    overcast: { cover: 0.86, sun: 0.42, ambient: 0.82, dark: 0.3, rain: 0, tint: 0.86 },
    rain: { cover: 1.0, sun: 0.22, ambient: 0.66, dark: 0.55, rain: 1, tint: 0.7 },
  };
  // the rain's sound: a light shower. A soft even hush, the patter of separate drops in it, no rumble at all
  const RAIN_OUT = 0.2, RAIN_IN = 0.007;
  function rainBed(ctx) {
    const sr = ctx.sampleRate, len = sr * 12, xf = sr * 2, buf = ctx.createBuffer(2, len + xf, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0, lp2 = 0;
      for (let i = 0; i < len + xf; i++) {
        const w = Math.random() * 2 - 1;
        lp += (w - lp) * 0.34; lp2 += (lp - lp2) * 0.012;
        d[i] = (lp - lp2) * 0.34;                // the hush: airy, with the bottom taken away
      }
      // the drops: thousands of tiny soft ticks, each a little ring, none loud enough to stand out
      for (let k = 0; k < 9000; k++) {
        const at = Math.floor(Math.random() * (len + xf - 900)), hz = 1400 + Math.random() * Math.random() * 5200, amp = 0.012 + Math.pow(Math.random(), 5) * 0.06, dur = 0.002 + Math.random() * 0.005;
        for (let i = 0, n = Math.floor(dur * 6 * sr); i < n; i++) d[at + i] += Math.sin(2 * Math.PI * hz * i / sr) * Math.exp(-i / (dur * sr)) * amp;
      }
      for (let i = 0; i < xf; i++) { const k = i / xf; d[i] = d[i] * k + d[len + i] * (1 - k); }      // no seam to hear in the loop
    }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.loopEnd = len / sr;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 5200; filter.Q.value = 0.3;
    const swell = ctx.createGain(); swell.gain.value = 0.86;
    const lfo = ctx.createOscillator(), depth = ctx.createGain(); lfo.frequency.value = 0.05; depth.gain.value = 0.14;
    lfo.connect(depth).connect(swell.gain); lfo.start();
    const gain = ctx.createGain(); gain.gain.value = 1;
    src.connect(filter).connect(swell).connect(gain); src.start();
    return { out: gain, gain, filter };
  }

  const NAMES = { clear: 'Clear', partly: 'Partly cloudy', overcast: 'Overcast', rain: 'Rain' };

  const SKY_VERT = `
    varying vec3 vDir;
    void main() {
      vDir = position;
      vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
      gl_Position = p.xyww;
    }`;
  const SKY_FRAG = (octaves) => `
    precision highp float;
    varying vec3 vDir;
    uniform float uTime, uCover, uDark, uDay, uDusk, uMoonLit;
    uniform vec3 uSun, uMoon;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < ${octaves}; i++) { v += a * noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.3; a *= 0.5; }
      return v;
    }
    void main() {
      vec3 d = normalize(vDir);
      float h = max(d.y, 0.0);
      // the clear sky, deep overhead and pale at the horizon, greyed by the weather
      vec3 zenith = mix(vec3(0.20, 0.42, 0.78), vec3(0.34, 0.37, 0.41), uDark);
      vec3 horizon = mix(vec3(0.80, 0.87, 0.93), vec3(0.62, 0.64, 0.66), uDark);
      vec3 col = mix(horizon, zenith, pow(h, 0.55));
      float sd = max(dot(d, uSun), 0.0);
      // the night, with the city's own glow low on the horizon, and the colour of sunrise and sunset towards the sun
      vec3 nightZ = vec3(0.012, 0.022, 0.058), nightH = vec3(0.10, 0.085, 0.10);
      vec3 night = mix(nightH, nightZ, pow(h, 0.4));
      col = mix(night, col, uDay);
      float low = pow(1.0 - h, 5.0), toSun = pow(max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSun.x, 0.0, uSun.z))), 0.0), 2.5);
      col += uDusk * (vec3(0.95, 0.42, 0.14) * low * (0.3 + toSun) + vec3(0.42, 0.14, 0.26) * pow(1.0 - h, 2.5) * 0.3) * (1.0 - uCover * 0.65);
      col += vec3(1.0, 0.92 - uDusk * 0.3, 0.78 - uDusk * 0.5) * (pow(sd, 900.0) * 4.0 + pow(sd, 24.0) * 0.22) * (1.0 - uCover * 0.9) * smoothstep(-0.06, 0.02, uSun.y);
      // the moon: a disc with its dark seas, a phase, and a little halo
      float md = dot(d, uMoon);
      if (uMoon.y > -0.1) {
        float disc = smoothstep(0.99988, 0.99993, md);
        vec3 side = normalize(cross(uMoon, vec3(0.0, 1.0, 0.0))), up2 = cross(side, uMoon);
        vec2 q = vec2(dot(d, side), dot(d, up2)) * 95.0;
        float seas = 0.72 + 0.28 * noise(q * 2.4 + 4.0) - 0.16 * noise(q * 6.0);
        float rr = dot(q, q), z2 = sqrt(max(0.0, 1.0 - rr));
        float lit = smoothstep(-0.04, 0.08, q.x * sqrt(max(0.0, 1.0 - uMoonLit * uMoonLit)) + z2 * uMoonLit);
        float haze = 1.0 - uCover * 0.92;
        col = mix(col, vec3(0.96, 0.96, 0.9) * seas * (0.05 + 1.2 * lit), disc * haze * (1.0 - uDay * 0.75));
        col += vec3(0.5, 0.55, 0.7) * pow(max(md, 0.0), 500.0) * 0.16 * (1.0 - uDay) * haze;
      }
      if (d.y > 0.0) {
        // two drifting layers, spread flat and vanishing towards the horizon
        vec2 uv = d.xz / (d.y + 0.14);
        float t = uTime * 0.006;
        float big = fbm(uv * 0.55 + vec2(t, t * 0.4));
        float fine = fbm(uv * 1.7 + vec2(t * 1.9, -t) + big * 1.5);
        float n = big * 0.68 + fine * 0.42;
        float edge = 0.86 - uCover * 0.62;
        float c = smoothstep(edge, edge + 0.26, n);
        // lit tops, darker bellies, a brighter rim near the sun
        float dens = smoothstep(edge, edge + 0.55, n);
        vec3 lit = mix(vec3(1.0, 0.99, 0.96), vec3(0.68, 0.70, 0.73), uDark);
        vec3 shade = mix(vec3(0.60, 0.64, 0.70), vec3(0.28, 0.30, 0.33), uDark);
        vec3 cloud = mix(lit, shade, dens * 0.85) + vec3(0.2, 0.17, 0.12) * pow(sd, 6.0) * (1.0 - dens) * (1.0 - uDark);
        // clouds go gold and rose at the ends of the day, and at night they are only a dim shape over the city's glow
        cloud = mix(cloud * vec3(0.05, 0.055, 0.08) + vec3(0.035, 0.03, 0.035), cloud, uDay);
        cloud += uDusk * vec3(0.5, 0.2, 0.08) * (0.4 + pow(sd, 3.0)) * (1.0 - dens * 0.6) * (1.0 - uDark * 0.7);
        float fade = smoothstep(0.0, 0.14, d.y);
        col = mix(col, cloud, c * fade);
      } else {
        col = mix(nightH, horizon, uDay) * 0.8;
      }
      gl_FragColor = vec4(col, 1.0);
      #include <encodings_fragment>
    }`;

  /** The sun in the sky of Northridge at a moment of a day of 20 minutes: phase 0 sunrise, .25 noon, .5 sunset, .75 midnight. */
  const LAT = 34.247 * Math.PI / 180;
  function bodyDir(H, out) {     // hour angle: east is -z, south is +x
    const east = -Math.sin(H), south = Math.sin(LAT) * Math.cos(H), up = Math.cos(LAT) * Math.cos(H);
    return out.set(south, up, -east).normalize();
  }

  function build(scene, W, lights, site) {
    let self_stars = null;
    const uniforms = { uTime: { value: 0 }, uCover: { value: 0.3 }, uDark: { value: 0 }, uSun: { value: new THREE.Vector3(0.35, 0.72, 0.6).normalize() }, uMoon: { value: new THREE.Vector3(0, -1, 0) }, uDay: { value: 1 }, uDusk: { value: 0 }, uMoonLit: { value: 0.7 } };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 16), new THREE.ShaderMaterial({ uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG(Q.clouds), side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false }));
    sky.frustumCulled = false; sky.renderOrder = -20; scene.add(sky);

    // the stars: the bright ones where they really are, and a dust of fainter ones, wheeling round the pole
    const STAR_LIST = [[6.75, -16.7, -1.46], [6.4, -52.7, -0.74], [14.26, 19.2, -0.05], [18.62, 38.8, 0.03], [5.28, 46, 0.08], [5.24, -8.2, 0.13], [7.65, 5.2, 0.34], [5.92, 7.4, 0.5], [1.63, -57.2, 0.46], [19.85, 8.9, 0.76], [4.6, 16.5, 0.86], [16.49, -26.4, 0.96], [13.42, -11.2, 0.97], [7.76, 28, 1.14], [22.96, -29.6, 1.16], [20.69, 45.3, 1.25], [10.14, 12, 1.35], [6.98, -29, 1.5], [7.58, 31.9, 1.58], [5.42, 6.3, 1.64], [5.44, 28.6, 1.65], [5.6, -1.2, 1.69], [12.9, 56, 1.77], [11.06, 61.8, 1.79], [3.41, 49.9, 1.79], [13.79, 49.3, 1.86], [5.68, -1.9, 1.74], [5.53, -0.3, 2.23], [2.53, 89.3, 1.98], [9.46, -8.7, 1.98], [2.12, 23.5, 2], [0.73, -18, 2.02], [14.85, 74.2, 2.08], [17.58, 12.6, 2.08], [13.4, 54.9, 2.23], [11.03, 56.4, 2.37], [12.26, 57, 3.3], [11.9, 53.7, 2.44], [12.0, 57, 3.3], [13.8, 49.3, 1.85], [17.94, 51.5, 2.24], [20.37, 40.3, 2.2], [19.75, 45.1, 2.87], [19.5, 28, 3.05], [5.79, 9.4, 3], [0.68, 56.5, 2.24], [0.15, 59.1, 2.28], [0.95, 60.7, 2.47], [1.43, 60.2, 2.68], [1.9, 63.7, 3.35], [16.6, -28.2, 2.9], [17.56, -37.1, 1.63], [18.4, -34.4, 1.85], [19.05, -29.9, 2.6], [10.33, 19.8, 2.0], [11.82, 14.6, 2.14], [16.0, -22.6, 2.3], [15.58, 26.7, 2.23], [23.08, 15.2, 2.42], [23.06, 28.1, 2.42], [0.22, 15.2, 2.83], [0.14, 29.1, 2.06], [2.07, 42.3, 2.1], [1.16, 35.6, 2.05], [3.14, 41, 2.1], [6.38, 22.5, 2.87], [6.63, 16.4, 1.93], [7.34, 21.98, 3.5], [18.08, -30.4, 2.7]];
    { const faint = Q.level === 'low' ? 500 : 2200, n = STAR_LIST.length + faint, a = new Float32Array(n * 3), m = new Float32Array(n), rr = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(4217);
      STAR_LIST.forEach(([ra, dec, mag], i) => { const R = ra / 24 * 6.28318, D = dec * Math.PI / 180; a.set([Math.cos(D) * Math.cos(R), Math.cos(D) * Math.sin(R), Math.sin(D)], i * 3); m[i] = mag; });
      for (let i = STAR_LIST.length; i < n; i++) { const z = rr() * 2 - 1, R = rr() * 6.28318, c = Math.sqrt(1 - z * z); a.set([c * Math.cos(R), c * Math.sin(R), z], i * 3); m[i] = 3.2 + Math.pow(rr(), 0.6) * 2.8; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3)); g.setAttribute('mag', new THREE.BufferAttribute(m, 1));
      self_stars = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: { uLst: { value: 0 }, uShow: { value: 0 }, uLat: { value: 34.247 * Math.PI / 180 }, uPx: { value: Math.min(root.devicePixelRatio || 1, 2) } }, transparent: false, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, fog: false,
        vertexShader: `attribute float mag; uniform float uLst, uShow, uLat, uPx; varying float vA;
          void main() {
            // right ascension, declination -> the sky of Northridge at this sidereal time
            float ra = atan(position.y, position.x), dec = asin(position.z), h = uLst - ra;
            vec3 E = vec3(-cos(dec) * sin(h), 0.0, 0.0);
            float north = cos(uLat) * sin(dec) - sin(uLat) * cos(dec) * cos(h), up = sin(uLat) * sin(dec) + cos(uLat) * cos(dec) * cos(h);
            vec3 world = vec3(-north, up, -E.x);
            vA = uShow * pow(2.512, -(mag - 1.0) * 0.72) * smoothstep(-0.02, 0.18, up);
            gl_PointSize = uPx * clamp(3.2 - mag * 0.48, 1.0, 3.6);
            vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * world * 5.0, 1.0);
            gl_Position = p.xyww;
          }`,
        fragmentShader: `varying float vA; void main() { vec2 c = gl_PointCoord - 0.5; float f = smoothstep(0.5, 0.15, length(c)); gl_FragColor = vec4(vec3(0.92, 0.95, 1.0) * vA * f, 1.0); }`,
      }));
      self_stars.frustumCulled = false; self_stars.renderOrder = -19; scene.add(self_stars); }

    // rain: long thin streaks that wrap round a box kept about the camera
    const N = Q.rain, BOX = 34;
    const pos = new Float32Array(N * 6), seed = new Float32Array(N * 2), r = Math.random;
    for (let i = 0; i < N; i++) {
      const x = r() * BOX, y = r() * BOX, z = r() * BOX;
      pos.set([x, y, z, x, y, z], i * 6);
      seed[i * 2] = 0; seed[i * 2 + 1] = 1;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rg.setAttribute('end', new THREE.BufferAttribute(seed, 1));
    const rainU = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAmount: { value: 0 } };
    const rain = new THREE.LineSegments(rg, new THREE.ShaderMaterial({
      uniforms: rainU, transparent: true, depthWrite: false,
      vertexShader: `
        attribute float end; uniform float uTime, uAmount; uniform vec3 uCam; varying float vA;
        const float B = ${BOX.toFixed(1)};
        void main() {
          vec3 p = position;
          p.y = mod(p.y - uTime * 9.5 * (0.8 + fract(position.x * 7.1) * 0.4), B);
          p.x = mod(p.x - uCam.x + uTime * 0.7, B); p.z = mod(p.z - uCam.z + uTime * 0.35, B);
          vec3 w = vec3(uCam.x + p.x - B * 0.5, max(0.0, uCam.y + p.y - B * 0.35), uCam.z + p.z - B * 0.5);
          w.y += end * 0.5; w.x += end * 0.035; w.z += end * 0.018;
          vA = end * 0.5 + 0.1;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: `uniform float uAmount; varying float vA; void main() { gl_FragColor = vec4(0.8, 0.85, 0.92, vA * uAmount * 0.5); }`,
    }));
    rain.frustumCulled = false; rain.visible = false; rain.renderOrder = 5; scene.add(rain);

    const sound = { ctx: null, gain: null, filter: null, want: -1, tone: -1 };
    function startSound(ctx) {
      if (sound.ctx || !ctx) return;
      sound.ctx = ctx;
      const bed = rainBed(ctx);
      bed.out.connect(ctx.destination);
      sound.gain = bed.gain; sound.filter = bed.filter;
      sound.gain.gain.value = 0;
    }

    const now = { cover: 0.3, sun: 1, ambient: 1, dark: 0, rain: 0, tint: 1 };
    const self = {
      mode: 'auto', state: 'partly', nextChange: 40, t: 0, indoors: true,
      NAMES, STATES,
      DAY_LENGTH: 1200,                     // ten minutes of day, ten of night
      phase: 0.12,                          // we begin in the morning
      daylight: 1, dawnDusk: 0, night: 0, sunDir: new THREE.Vector3(0.3, 0.7, -0.6), moonDir: new THREE.Vector3(0, -1, 0), lightDir: new THREE.Vector3(0.3, 0.7, -0.6),
      setPhase(p) { this.phase = ((p % 1) + 1) % 1; },
      setMode(m) { this.mode = m; if (m !== 'auto') this.state = m; else this.nextChange = 0; },
      get raining() { return now.rain > 0.5; },
      get wetness() { return now.rain; },
      update(dt, camera, opts) {
        this.t += dt;
        // the day goes round
        this.phase = (this.phase + dt / this.DAY_LENGTH) % 1;
        const H = (this.phase - 0.25) * Math.PI * 2;
        bodyDir(H, this.sunDir); bodyDir(H + Math.PI - 0.45, this.moonDir);
        const alt = this.sunDir.y;
        this.daylight = Math.max(0, Math.min(1, (alt + 0.1) / 0.26));
        this.daylight = this.daylight * this.daylight * (3 - 2 * this.daylight);
        this.dawnDusk = Math.max(0, 1 - Math.abs(alt - 0.03) / 0.2);
        this.night = 1 - this.daylight;
        if (this.mode === 'auto' && this.t > this.nextChange) {
          const u = Math.random();
          this.state = u < 0.34 ? 'clear' : u < 0.68 ? 'partly' : u < 0.86 ? 'overcast' : 'rain';
          this.nextChange = this.t + 120 + Math.random() * 180;
        }
        const goal = STATES[this.state], k = Math.min(1, dt * 0.35);
        for (const key of Object.keys(now)) now[key] += (goal[key] - now[key]) * k;
        uniforms.uTime.value = this.t; uniforms.uCover.value = now.cover; uniforms.uDark.value = now.dark;
        uniforms.uSun.value.copy(this.sunDir); uniforms.uMoon.value.copy(this.moonDir); uniforms.uDay.value = this.daylight; uniforms.uDusk.value = this.dawnDusk;
        if (self_stars) { const U = self_stars.material.uniforms; U.uLst.value = H + 1.2; U.uShow.value = Math.max(0, 1 - this.daylight * 1.8) * (1 - now.cover * 0.92); self_stars.visible = U.uShow.value > 0.01; }
        const day = this.daylight, sunUp = this.sunDir.y > 0.015;
        // what lights the world outdoors: the sun, reddening as it sinks, or else the moon
        this.lightDir.copy(sunUp ? this.sunDir : this.moonDir.y > 0.02 ? this.moonDir : this.sunDir);
        // how far inside you are, eased: going through a door is not a switch being thrown
        const wantIn = this.indoors ? 1 : 0;
        this.inK = this.inK == null ? wantIn : this.inK + (wantIn - this.inK) * Math.min(1, dt * 3.5);
        // indoors the lamps carry on as ever, kept bright: what changes is the light at the windows
        const inKey = lights.keyBase * (1 - (1 - now.sun) * 0.55) * (0.86 + 0.14 * day), inHemi = lights.hemiBase * (1 - (1 - now.ambient) * 0.55);
        // outdoors it is the sun and the sky's light, reddening as the sun sinks, or else the moon
        const low = Math.max(0, Math.min(1, this.sunDir.y / 0.22)), moon = sunUp ? 0 : Math.max(0, this.moonDir.y) * 0.32;
        const outKey = sunUp ? lights.keyBase * (1 - (1 - now.sun)) * (0.25 + 0.75 * low) * Math.min(1, this.sunDir.y / 0.03) * 1.05 : moon * now.sun, outHemi = lights.hemiBase * (1 - (1 - now.ambient)) * (0.2 + 0.8 * day);
        const K = this.inK, mix = (o, i) => o + (i - o) * K;
        lights.key.intensity = mix(outKey, inKey); lights.hemi.intensity = mix(outHemi, inHemi);
        lights.key.color.setRGB(mix(sunUp ? 1 : 0.62, 1), mix(sunUp ? 0.66 + 0.28 * low : 0.72, 0.871), mix(sunUp ? 0.42 + 0.44 * low : 1, 0.749));
        lights.hemi.color.setRGB(mix(0.55 + 0.45 * day, 1), mix(0.6 + 0.35 * day, 0.882), mix(0.85 + 0.01 * day, 0.749));
        lights.hemi.groundColor.setRGB(mix(0.12 + 0.23 * day, 0.102), mix(0.11 + 0.12 * day, 0.044), mix(0.14 - 0.01 * day, 0.016));
        if (scene.fog) {
          const fr = 0.81 - now.dark * 0.28, fg = 0.87 - now.dark * 0.3, fb = 0.9 - now.dark * 0.3, dusk = this.dawnDusk * (1 - now.dark);
          scene.fog.color.setRGB(0.05 + (fr - 0.05 + dusk * 0.12) * day, 0.052 + (fg - 0.052 - dusk * 0.14) * day, 0.08 + (fb - 0.08 - dusk * 0.3) * day);
          const reach = this.fogFar || 620; scene.fog.near = reach * (0.242 - now.rain * 0.145); scene.fog.far = reach * (1 - now.rain * 0.45);
        }
        if (site && site.windowMat) { const w = now.tint * (0.1 + 0.9 * this.daylight); site.windowMat.color.setRGB(0.91 * w + 0.03 * (1 - this.daylight), 0.95 * w + 0.02 * (1 - this.daylight), 0.96 * w + 0.06 * (1 - this.daylight)); }
        // rain falls where there is no roof over the camera
        rain.visible = now.rain > 0.02 && !this.indoors;
        if (rain.visible) { rainU.uTime.value = this.t; rainU.uCam.value.copy(camera.position); rainU.uAmount.value = now.rain; }
        // wet ground shines and darkens
        if (site && site.wetMats) for (const m of site.wetMats) { m.roughness = 1 - now.rain * 0.55; }
        // the sound of it
        if (opts && opts.audio && opts.sound) startSound(opts.audio());
        if (sound.gain) {
          const on = opts && opts.sound ? now.rain : 0;
          // never a jolt: it swells and fades over seconds, starting, stopping, and going in or out of doors alike
          const inside = this.heardIndoors != null ? this.heardIndoors : this.indoors, want = on * (inside ? RAIN_IN : RAIN_OUT), tone = inside ? 520 : 5200, t = sound.ctx.currentTime;
          if (Math.abs(want - sound.want) > 0.0005) { sound.want = want; sound.gain.gain.setTargetAtTime(want, t, opts && opts.sound ? 3 : 0.2); }
          if (tone !== sound.tone) { sound.tone = tone; sound.filter.frequency.setTargetAtTime(tone, t, 2.5); }
        }
      },
    };
    return self;
  }

  root.Weather = { build, NAMES, rainBed, RAIN_OUT, RAIN_IN };
})(typeof self !== 'undefined' ? self : this);
