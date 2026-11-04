/*
 * Detail levels, and the photographic CC0 textures from tex-data.js as three.js textures.
 * The images are inlined as data URIs so that the page keeps working when opened straight from a file.
 */
(function (root) {
  'use strict';
  const THREE = root.THREE;

  // ── how much the device is asked to do ─────────────────────────────────────
  const LEVELS = {
    low: { dpr: 1, shadow: 1024, houses: 1, trees: 0.25, cars: 6, clouds: 3, rain: 700, cards: 0.5 },
    medium: { dpr: 1.5, shadow: 1536, houses: 2, trees: 0.55, cars: 12, clouds: 4, rain: 1400, cards: 0.75 },
    high: { dpr: 2, shadow: 2048, houses: 3, trees: 1, cars: 22, clouds: 5, rain: 2600, cards: 1 },
    ultra: { dpr: 2.5, shadow: 4096, houses: 3, trees: 1, cars: 36, clouds: 6, rain: 4500, cards: 1.4 },
  };
  function pick() {
    let want = 'auto';
    try { want = (JSON.parse(localStorage.getItem('serve.opts') || '{}').quality) || 'auto'; } catch (e) { /* private window */ }
    const q = new URLSearchParams(location.search).get('quality') || want;
    if (LEVELS[q]) return q;
    const phone = matchMedia('(pointer: coarse)').matches, mem = navigator.deviceMemory || 8, cpu = navigator.hardwareConcurrency || 8;
    if (phone) return mem >= 6 && cpu >= 8 ? 'medium' : 'low';
    return mem >= 8 && cpu >= 8 ? 'high' : 'medium';
  }
  const level = pick();
  root.Quality = Object.assign({ level }, LEVELS[level], { LEVELS });

  // ── textures ───────────────────────────────────────────────────────────────
  const images = {}, waiting = {};
  let anisotropy = 8;
  function image(key) {
    if (images[key]) return images[key];
    const img = new Image();
    images[key] = img; waiting[key] = [];
    img.onload = () => { for (const t of waiting[key]) t.needsUpdate = true; waiting[key] = null; };
    img.src = root.TexData[key];
    return img;
  }
  /** A repeating texture. kind 'd' is colour, 'n' a normal map. Each call gets its own repeat setting. */
  function get(name, kind = 'd', opts = {}) {
    const key = name + '_' + kind, img = image(key);
    const t = new THREE.Texture(img);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = anisotropy;
    if (kind === 'd') t.encoding = THREE.sRGBEncoding;
    if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
    if (waiting[key]) waiting[key].push(t); else t.needsUpdate = true;
    return t;
  }
  /** A lit material with colour and relief from one photographic texture. */
  function mat(name, o = {}) {
    const { color = 0xffffff, rough = 0.85, normal = 0.8, repeat, ...rest } = o;
    return new THREE.MeshStandardMaterial(Object.assign({
      map: get(name, 'd', { repeat }), normalMap: get(name, 'n', { repeat }),
      normalScale: new THREE.Vector2(normal, normal), color, roughness: rough,
    }, rest));
  }
  root.Tex = { get, mat, setAnisotropy(a) { anisotropy = a; } };
})(typeof self !== 'undefined' ? self : this);
