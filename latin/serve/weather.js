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
  // the rain's sound: soft, low and steady, with a very slow swell, like rain heard from under cover
  const RAIN_OUT = 0.09, RAIN_IN = 0.02;
  function rainBed(ctx) {
    const sr = ctx.sampleRate, len = sr * 12, xf = sr * 2, buf = ctx.createBuffer(2, len + xf, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let brown = 0, pink = 0;
      for (let i = 0; i < len + xf; i++) {
        const w = Math.random() * 2 - 1;
        brown = (brown + w * 0.02) / 1.02;      // the deep, even body of it
        pink = pink * 0.86 + w * 0.14;          // a little of the patter on top
        d[i] = brown * 3.2 + pink * 0.22;
      }
      for (let i = 0; i < xf; i++) { const k = i / xf; d[i] = d[i] * k + d[len + i] * (1 - k); }      // no seam to hear in the loop
    }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.loopEnd = len / sr;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1100; filter.Q.value = 0.3;
    const swell = ctx.createGain(); swell.gain.value = 0.88;
    const lfo = ctx.createOscillator(), depth = ctx.createGain(); lfo.frequency.value = 0.06; depth.gain.value = 0.12;
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
    uniform float uTime, uCover, uDark;
    uniform vec3 uSun;
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
      col += vec3(1.0, 0.92, 0.78) * (pow(sd, 700.0) * 3.0 + pow(sd, 24.0) * 0.22) * (1.0 - uCover * 0.9);
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
        float fade = smoothstep(0.0, 0.14, d.y);
        col = mix(col, cloud, c * fade);
      } else {
        col = horizon * 0.8;
      }
      gl_FragColor = vec4(col, 1.0);
      #include <encodings_fragment>
    }`;

  function build(scene, W, lights, site) {
    const uniforms = { uTime: { value: 0 }, uCover: { value: 0.3 }, uDark: { value: 0 }, uSun: { value: new THREE.Vector3(0.35, 0.72, 0.6).normalize() } };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 16), new THREE.ShaderMaterial({ uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG(Q.clouds), side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false }));
    sky.frustumCulled = false; sky.renderOrder = -20; scene.add(sky);

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
      setMode(m) { this.mode = m; if (m !== 'auto') this.state = m; else this.nextChange = 0; },
      get raining() { return now.rain > 0.5; },
      get wetness() { return now.rain; },
      update(dt, camera, opts) {
        this.t += dt;
        if (this.mode === 'auto' && this.t > this.nextChange) {
          const u = Math.random();
          this.state = u < 0.34 ? 'clear' : u < 0.68 ? 'partly' : u < 0.86 ? 'overcast' : 'rain';
          this.nextChange = this.t + 120 + Math.random() * 180;
        }
        const goal = STATES[this.state], k = Math.min(1, dt * 0.35);
        for (const key of Object.keys(now)) now[key] += (goal[key] - now[key]) * k;
        uniforms.uTime.value = this.t; uniforms.uCover.value = now.cover; uniforms.uDark.value = now.dark;
        // the sun and the sky's light, kept brighter indoors where the lamps do most of the work
        const inside = this.indoors ? 0.55 : 1;
        lights.key.intensity = lights.keyBase * (1 - (1 - now.sun) * inside);
        lights.hemi.intensity = lights.hemiBase * (1 - (1 - now.ambient) * inside);
        if (scene.fog) {
          scene.fog.color.setRGB(0.81 - now.dark * 0.28, 0.87 - now.dark * 0.3, 0.9 - now.dark * 0.3);
          const reach = this.fogFar || 620; scene.fog.near = reach * (0.242 - now.rain * 0.145); scene.fog.far = reach * (1 - now.rain * 0.45);
        }
        if (site && site.windowMat) site.windowMat.color.setRGB(0.91 * now.tint, 0.95 * now.tint, 0.96 * now.tint);
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
          const want = on * (this.indoors ? RAIN_IN : RAIN_OUT), tone = this.indoors ? 320 : 1100, t = sound.ctx.currentTime;
          if (Math.abs(want - sound.want) > 0.001) { sound.want = want; sound.gain.gain.setTargetAtTime(want, t, 3); }
          if (tone !== sound.tone) { sound.tone = tone; sound.filter.frequency.setTargetAtTime(tone, t, 2.5); }
        }
      },
    };
    return self;
  }

  root.Weather = { build, NAMES, rainBed, RAIN_OUT, RAIN_IN };
})(typeof self !== 'undefined' ? self : this);
