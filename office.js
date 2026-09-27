/* Build a morning prayer page in the browser.
 *
 * A port of generate_page.build_page, to the bar that the page it makes is
 * byte-for-byte the page generate_page.py would have made for that date. That
 * bar is the whole point: a day generated here and a day generated later by
 * the script must not be two different offices, because one of them will have
 * been prayed.
 *
 * Only the part that is an algorithm lives here — the seeded weighted draw
 * from readings.json, and the assembly. Everything that does not depend on
 * chance was rendered by the real renderers and shipped in office_data.json;
 * see export_office_data.py. So there is no second copy of the prayers here,
 * and no second calendar to keep in step with the first.
 *
 * Three pieces have to agree with CPython exactly, and each is a place this
 * could go quietly wrong:
 *
 *   - random.Random. Mersenne Twister with CPython's init_by_array seeding,
 *     its genrand_res53 double, and the bisect-on-cumulative-weights that
 *     random.choices performs. Checked against CPython in verify_office_js.py.
 *   - hashlib.sha1, for the reading key. Every reading is keyed by the digest
 *     of its own text, and the keys decide what has been spent.
 *   - html.escape, which escapes the apostrophe as &#x27; where the obvious
 *     JavaScript would leave it alone.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.Office = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---- CPython's random.Random ------------------------------------------

  function PyRandom(seed) {
    this.mt = new Uint32Array(624);
    this.mti = 625;
    // random_seed(): abs(n) as 32-bit little-endian words, then init_by_array.
    var n = seed < 0 ? -seed : seed;
    var key = [];
    if (n === 0) { key.push(0); }
    while (n > 0) { key.push(n % 4294967296); n = Math.floor(n / 4294967296); }
    this._initByArray(key);
  }

  PyRandom.prototype._initGenrand = function (s) {
    var mt = this.mt;
    mt[0] = s >>> 0;
    for (var i = 1; i < 624; i++) {
      var prev = (mt[i - 1] ^ (mt[i - 1] >>> 30)) >>> 0;
      mt[i] = (Math.imul(1812433253, prev) + i) >>> 0;
    }
    this.mti = 624;
  };

  PyRandom.prototype._initByArray = function (key) {
    this._initGenrand(19650218);
    var mt = this.mt, i = 1, j = 0;
    var k = Math.max(624, key.length);
    for (; k; k--) {
      var prev = (mt[i - 1] ^ (mt[i - 1] >>> 30)) >>> 0;
      mt[i] = (((mt[i] ^ Math.imul(1664525, prev)) >>> 0) + key[j] + j) >>> 0;
      i++; j++;
      if (i >= 624) { mt[0] = mt[623]; i = 1; }
      if (j >= key.length) { j = 0; }
    }
    for (k = 623; k; k--) {
      var p2 = (mt[i - 1] ^ (mt[i - 1] >>> 30)) >>> 0;
      mt[i] = (((mt[i] ^ Math.imul(1566083941, p2)) >>> 0) - i) >>> 0;
      i++;
      if (i >= 624) { mt[0] = mt[623]; i = 1; }
    }
    mt[0] = 0x80000000;
  };

  PyRandom.prototype._uint32 = function () {
    var mt = this.mt, y;
    if (this.mti >= 624) {
      for (var k = 0; k < 623; k++) {
        y = ((mt[k] & 0x80000000) | (mt[k + 1] & 0x7fffffff)) >>> 0;
        mt[k] = (mt[(k + 397) % 624] ^ (y >>> 1) ^ ((y & 1) ? 0x9908b0df : 0)) >>> 0;
      }
      y = ((mt[623] & 0x80000000) | (mt[0] & 0x7fffffff)) >>> 0;
      mt[623] = (mt[396] ^ (y >>> 1) ^ ((y & 1) ? 0x9908b0df : 0)) >>> 0;
      this.mti = 0;
    }
    y = mt[this.mti++];
    y = (y ^ (y >>> 11)) >>> 0;
    y = (y ^ ((y << 7) & 0x9d2c5680)) >>> 0;
    y = (y ^ ((y << 15) & 0xefc60000)) >>> 0;
    y = (y ^ (y >>> 18)) >>> 0;
    return y >>> 0;
  };

  // genrand_res53: two draws into one 53-bit double.
  PyRandom.prototype.random = function () {
    var a = this._uint32() >>> 5, b = this._uint32() >>> 6;
    return (a * 67108864 + b) * (1.0 / 9007199254740992.0);
  };

  PyRandom.prototype.getrandbits = function (k) {
    if (k > 32) { throw new Error("getrandbits > 32 not needed"); }
    return this._uint32() >>> (32 - k);
  };

  PyRandom.prototype._randbelow = function (n) {
    if (n === 0) { return 0; }
    var k = 32 - Math.clz32(n);            // n.bit_length()
    var r = this.getrandbits(k);
    while (r >= n) { r = this.getrandbits(k); }
    return r;
  };

  PyRandom.prototype.choice = function (seq) {
    return seq[this._randbelow(seq.length)];
  };

  function bisectRight(a, x, lo, hi) {
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (x < a[mid]) { hi = mid; } else { lo = mid + 1; }
    }
    return lo;
  }

  // Random.choices(population, weights=w, k=1).
  PyRandom.prototype.choices = function (population, weights, k) {
    var n = population.length, cum = new Array(n), running = 0, i;
    for (i = 0; i < n; i++) { running += weights[i]; cum[i] = running; }
    var total = cum[n - 1] + 0.0, hi = n - 1, out = [];
    for (i = 0; i < (k || 1); i++) {
      out.push(population[bisectRight(cum, this.random() * total, 0, hi)]);
    }
    return out;
  };

  // ---- hashlib.sha1 ------------------------------------------------------

  function utf8Bytes(str) {
    if (typeof TextEncoder !== "undefined") { return new TextEncoder().encode(str); }
    var out = [], i, c;
    for (i = 0; i < str.length; i++) {
      c = str.codePointAt(i);
      if (c > 0xffff) { i++; }
      if (c < 0x80) { out.push(c); }
      else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
      else if (c < 0x10000) { out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
      else { out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
    }
    return new Uint8Array(out);
  }

  function sha1Hex(str) {
    var bytes = utf8Bytes(str);
    var len = bytes.length;
    // Message + 0x80 + zero padding + 64-bit big-endian bit length.
    var withPad = ((len + 8) >> 6) + 1;
    var words = new Int32Array(withPad * 16);
    for (var i = 0; i < len; i++) { words[i >> 2] |= bytes[i] << (24 - (i % 4) * 8); }
    words[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
    words[withPad * 16 - 2] = Math.floor(len / 536870912);
    words[withPad * 16 - 1] = (len << 3) | 0;

    var h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
    var w = new Int32Array(80), a, b, c, d, e, t, j;
    for (i = 0; i < words.length; i += 16) {
      for (j = 0; j < 16; j++) { w[j] = words[i + j]; }
      for (j = 16; j < 80; j++) {
        t = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16];
        w[j] = (t << 1) | (t >>> 31);
      }
      a = h0; b = h1; c = h2; d = h3; e = h4;
      for (j = 0; j < 80; j++) {
        var f, kk;
        if (j < 20) { f = (b & c) | (~b & d); kk = 0x5a827999; }
        else if (j < 40) { f = b ^ c ^ d; kk = 0x6ed9eba1; }
        else if (j < 60) { f = (b & c) | (b & d) | (c & d); kk = 0x8f1bbcdc; }
        else { f = b ^ c ^ d; kk = 0xca62c1d6; }
        t = (((a << 5) | (a >>> 27)) + f + e + kk + w[j]) | 0;
        e = d; d = c; c = ((b << 30) | (b >>> 2)) | 0; b = a; a = t;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0;
      h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
    }
    var hex = "";
    [h0, h1, h2, h3, h4].forEach(function (h) {
      hex += ("00000000" + (h >>> 0).toString(16)).slice(-8);
    });
    return hex;
  }

  // book_excerpts.reading_key
  function readingKey(text) { return sha1Hex(text).slice(0, 12); }

  // ---- html.escape, and the rest of Python's string behaviour -----------

  // Python escapes the apostrophe too, as &#x27;. Missing that would put a
  // bare ' into every attribution that has one and break byte-identity.
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;");
  }

  // book_excerpts._fold: lowercase, then strip the combining marks.
  function fold(text) {
    return String(text).toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "");
  }

  // json.dumps(obj, ensure_ascii=False) — Python's separators are ", " and
  // ": ", where JSON.stringify uses "," and ":".
  function pyJson(value) {
    if (Array.isArray(value)) {
      return "[" + value.map(pyJson).join(", ") + "]";
    }
    if (value !== null && typeof value === "object") {
      return "{" + Object.keys(value).map(function (k) {
        return JSON.stringify(k) + ": " + pyJson(value[k]);
      }).join(", ") + "}";
    }
    return JSON.stringify(value);
  }

  // ---- the day ----------------------------------------------------------

  var ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
    "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];
  var WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
    "Saturday", "Sunday"];

  // date.toordinal(). Proleptic Gregorian, day 1 being 0001-01-01; the same
  // count Python uses, which is what seeds the draw.
  function toOrdinal(y, m, d) {
    var a = Math.floor((14 - m) / 12);
    var yy = y + 4800 - a;
    var mm = m + 12 * a - 3;
    var jdn = d + Math.floor((153 * mm + 2) / 5) + 365 * yy
      + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
    return jdn - 1721425;
  }

  // strftime("%A, %B %d, %Y").replace(" 0", " ") — the leading zero is
  // stripped from the day of the month, as generate_page does.
  function datePretty(y, m, d) {
    var weekday = WEEKDAYS[(toOrdinal(y, m, d) - 1) % 7];
    return (weekday + ", " + MONTHS[m - 1] + " " + (d < 10 ? "0" + d : d) + ", " + y)
      .replace(" 0", " ");
  }

  function isoDate(y, m, d) {
    return y + "-" + (m < 10 ? "0" + m : m) + "-" + (d < 10 ? "0" + d : d);
  }

  function shiftIso(y, m, d, by) {
    var dt = new Date(Date.UTC(y, m - 1, d + by));
    return isoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  // generate_page.render_section
  function renderSection(numeral, title, body, extra, id, shown) {
    return '  <section data-section="' + id + '"' + (shown ? "" : " hidden") + ">\n"
      + '    <h2><span class="numeral">' + numeral + ".</span>" + esc(title)
      + (extra || "") + "</h2>\n"
      + body + "\n"
      + "  </section>";
  }

  // generate_page.render_excerpt
  function renderExcerpt(entry, spentFlag) {
    var paragraphs = entry.text.split("\n\n").map(function (p) {
      return "    <p>" + esc(p).replace(/\n/g, "<br>") + "</p>";
    }).join("\n");
    var attr = spentFlag ? "data-reading" : "data-reading-unspent";
    var attribution = entry.creator
      ? entry.title + " — " + entry.creator
      : entry.title;
    return "  <blockquote " + attr + '="' + readingKey(entry.text) + '">\n'
      + paragraphs + "\n  </blockquote>\n"
      + '  <p class="attribution">&mdash; ' + esc(attribution) + "</p>";
  }

  // generate_page.render_neighbours
  function renderNeighbours(y, m, d) {
    return "    <nav>\n"
      + '      <a href="' + shiftIso(y, m, d, -1) + '.html" rel="prev">&larr; Yesterday</a>\n'
      + '      <a href="' + shiftIso(y, m, d, 1) + '.html" rel="next">Tomorrow &rarr;</a>\n'
      + "    </nav>\n";
  }

  /* book_excerpts.reading_excerpt. The filters run in the order the Python
   * does and each preserves the order of readings.json, because the order is
   * what the weighted draw indexes into. */
  function readingExcerpt(entries, keyOf, opts) {
    var i, e;
    var out = entries;

    function hasAny(topics, wanted) {
      for (var j = 0; j < topics.length; j++) {
        if (wanted.indexOf(topics[j]) !== -1) { return true; }
      }
      return false;
    }

    if (opts.excluded_topics && opts.excluded_topics.length) {
      out = out.filter(function (x) { return !hasAny(x.topics, opts.excluded_topics); });
    }
    if (opts.included_topics && opts.included_topics.length) {
      out = out.filter(function (x) {
        for (var j = 0; j < opts.included_topics.length; j++) {
          if (x.topics.indexOf(opts.included_topics[j]) === -1) { return false; }
        }
        return true;
      });
    }
    if (opts.any_topics && opts.any_topics.length) {
      out = out.filter(function (x) { return hasAny(x.topics, opts.any_topics); });
    }

    var preferTopics = opts.prefer_topics || null;
    if (opts.only_sources && opts.only_sources.length) {
      var wantedNames = opts.only_sources.map(fold);
      var own = out.filter(function (x) {
        var creator = fold(x.creator || ""), title = fold(x.title || "");
        return wantedNames.some(function (w) {
          return creator.indexOf(w) !== -1 || title.indexOf(w) !== -1;
        });
      });
      if (own.length) { out = own; preferTopics = null; }
    }

    if (preferTopics && preferTopics.length) {
      for (var width = 1; width <= preferTopics.length; width++) {
        var slice = preferTopics.slice(0, width);
        var matching = out.filter(function (x) { return hasAny(x.topics, slice); });
        if (matching.length >= (opts.prefer_min || 1)) { out = matching; break; }
      }
    }

    if (!out.length) { throw new Error("No readings match the filter criteria"); }

    if (opts.exclude_keys && opts.exclude_keys.size) {
      var fresh = out.filter(function (x) { return !opts.exclude_keys.has(keyOf(x)); });
      if (fresh.length) { out = fresh; }
    }

    var weights;
    if (opts.weighted_topics && opts.weighted_topics.length) {
      var boost = opts.weight_boost || 1;
      weights = out.map(function (x) {
        var hits = 0;
        for (var j = 0; j < x.topics.length; j++) {
          if (opts.weighted_topics.indexOf(x.topics[j]) !== -1) { hits++; }
        }
        return 1 + boost * hits;
      });
    } else {
      weights = out.map(function () { return 1; });
    }

    return opts.rng.choices(out, weights, 1)[0];
  }

  /* generate_page.build_page.
   *
   * `data` is office_data.json, `readings` is readings.json. `iso` is the day
   * wanted. `linked` writes the neighbour arrows, as the days/ folder has. */
  function buildPage(data, readings, iso, linked) {
    var parts = iso.split("-");
    var y = Number(parts[0]), m = Number(parts[1]), d = Number(parts[2]);
    var ordinal = toOrdinal(y, m, d);
    // Monday is 0 in Python; ordinal 1 was a Monday.
    var weekday = (ordinal - 1) % 7;
    var sunday = weekday === 6;

    // Keys are wanted for every entry and wanted repeatedly, so they are
    // hashed once. Three thousand digests is the bulk of the work here.
    var keyCache = new Map();
    function keyOf(entry) {
      var k = keyCache.get(entry);
      if (k === undefined) { k = readingKey(entry.text); keyCache.set(entry, k); }
      return k;
    }

    var steer = data.steering[iso] || { topics: [], prefer_min: null, boost: 1, works: [] };
    var spent = new Set(data.spent);

    function take(opts) {
      opts.weighted_topics = steer.topics;
      opts.prefer_topics = (steer.prefer_min && steer.topics.length) ? steer.topics : null;
      opts.prefer_min = steer.prefer_min || 1;
      opts.weight_boost = steer.boost;
      opts.only_sources = opts.days_own ? steer.works : null;
      opts.exclude_keys = spent;
      // A fresh Random per slot, seeded the same: generate_page calls
      // pick_excerpt three times and each builds Random(day.toordinal()).
      opts.rng = new PyRandom(ordinal);
      var chosen = readingExcerpt(readings, keyOf, opts);
      spent.add(keyOf(chosen));
      return chosen;
    }

    var cexcerpt = take({
      any_topics: ["catechism", "council", "encyclical"],
      excluded_topics: ["historical"],
      days_own: true
    });
    var excerpt = take({
      excluded_topics: ["historical", "catechism", "council", "encyclical"],
      days_own: true
    });
    var hexcerpt = take({ included_topics: ["historical"] });

    var fixed = data.fixed;
    var hymnIndex = data.hymns.byDate[iso];
    var hasHoliday = hymnIndex !== undefined;
    var verseBody = data.verses.pool[data.verses.byDate[iso]];
    if (verseBody === undefined) {
      throw new Error("office_data.json does not cover " + iso
        + " (it covers " + data.covers.first + " to " + data.covers.last + ")");
    }

    var saints = data.saints;
    var rotation = saints.rotation;
    var first = ordinal % rotation.length;
    var second = (first + Math.floor(rotation.length / 2)) % rotation.length;
    var saintsBody = [saints.prefix, rotation[first], rotation[second], saints.suffix]
      .join("\n");

    var sections = [
      { id: "sign-open", title: "Sign of the Cross", body: fixed["sign-open"],
        label: "Sign of the Cross (opening)", required: true },
      { id: "holy-spirit", title: "Invocation of the Holy Spirit",
        body: fixed["holy-spirit"], required: true },
      { id: "creed", title: "Tridentine Creed", body: fixed.creed,
        extra: data.lang_button, auto: sunday, rule: "Sundays" },
      { id: "acts", title: "Acts of Faith, Hope, and Love", body: fixed.acts,
        auto: !sunday, rule: "weekdays" },
      { id: "contrition", title: "Act of Contrition", body: fixed.contrition },
      { id: "lords-prayer", title: "Kyrie and Lord's Prayer",
        body: fixed["lords-prayer"], required: true },
      { id: "offering", title: "Morning Offering", body: fixed.offering, required: true },
      { id: "saints", title: "Invocation of the Saints", body: saintsBody },
      { id: "reading-doctrinal", title: "From “" + cexcerpt.title + "”",
        body: renderExcerpt(cexcerpt, true),
        label: "First reading — catechism, council, encyclical", required: true },
      { id: "reading-general", title: "From “" + excerpt.title + "”",
        body: renderExcerpt(excerpt, true),
        label: "Second reading — spiritual writing" },
      { id: "reading-historical", title: "From “" + hexcerpt.title + "”",
        body: renderExcerpt(hexcerpt, !sunday),
        label: "Third reading — history and lives", auto: !sunday, rule: "weekdays" },
      { id: "suffrage", title: "Suffrage", body: fixed.suffrage },
      { id: "closing-prayer", title: "Closing Prayer", body: fixed["closing-prayer"] },
      { id: "doxology", title: "Doxology", body: fixed.doxology, required: true },
      { id: "verse-of-the-day", title: "Verse for the Day", body: verseBody },
      { id: "pledge", title: "Pledge of Allegiance", body: fixed.pledge,
        auto: hasHoliday || !sunday, rule: "weekdays and holidays" }
    ];
    if (hasHoliday) {
      var hymn = data.hymns.pool[hymnIndex];
      sections.push({ id: "holiday-hymn", title: hymn.title, body: hymn.body,
        rule: "holidays" });
    }
    sections.push(
      { id: "closing-verses", title: "Closing Verses", body: fixed["closing-verses"],
        required: true },
      { id: "sign-close", title: "Sign of the Cross", body: fixed["sign-close"],
        label: "Sign of the Cross (closing)", required: true }
    );

    var numeral = 0;
    var rendered = sections.map(function (s) {
      var shown = !!(s.required || (s.auto === undefined ? true : s.auto));
      if (shown) { numeral += 1; }
      return renderSection(shown ? ROMAN[numeral - 1] : "", s.title, s.body,
        s.extra || "", s.id, shown);
    });

    var meta = sections.map(function (s) {
      return {
        id: s.id,
        label: s.label || s.title,
        auto: !!(s.required || (s.auto === undefined ? true : s.auto)),
        required: !!s.required,
        rule: s.rule || ""
      };
    });

    // split/join rather than replace, on two counts. The date sentinel occurs
    // twice — once in the <title> and once in the header — and a string
    // pattern given to replace only takes the first. And a replacement string
    // is not inert: "$&" and "$'" in it would be substitution patterns, and
    // the readings do contain dollar signs.
    function fill(text, sentinel, value) {
      return text.split(sentinel).join(value);
    }

    var out = data.shell;
    out = fill(out, data.sentinels.date, datePretty(y, m, d));
    out = fill(out, data.sentinels.nav, linked ? renderNeighbours(y, m, d) : "");
    out = fill(out, data.sentinels.sections, rendered.join("\n"));
    out = fill(out, data.sentinels.meta, pyJson(meta));
    return out;
  }

  // ---- the night --------------------------------------------------------

  var NIGHT_ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

  // generate_night_page.render_reading
  function renderNightReading(reading, keyOf) {
    var blocks = reading.text.split("\n\n").map(function (paragraph) {
      var lines = paragraph.split("\n");
      if (lines.length === 1) { return "    <p>" + esc(lines[0]) + "</p>"; }
      // Verse. A leading tab is the source's own further indentation.
      return lines.map(function (line) {
        var indent = line.charAt(0) === "\t" ? " indent" : "";
        return '    <p class="line' + indent + '">'
          + esc(line.replace(/^\t+/, "")) + "</p>";
      }).join("\n");
    });
    var argument = reading.summary || "";
    return (argument ? '  <p class="rubric">' + esc(argument) + "</p>\n" : "")
      + '  <blockquote data-reading="' + keyOf(reading) + '">\n'
      + blocks.join("\n") + "\n  </blockquote>\n"
      + '  <p class="attribution">&mdash; ' + esc(reading.citation)
      + '<span class="source">' + esc(reading.source) + "</span></p>";
  }

  function renderNightNeighbours(y, m, d) {
    return "    <nav>\n"
      + '      <a href="' + shiftIso(y, m, d, -1) + '.html" rel="prev">&larr; Last night</a>\n'
      + '      <a href="' + shiftIso(y, m, d, 1) + '.html" rel="next">Tomorrow &rarr;</a>\n'
      + "    </nav>\n";
  }

  // sorted() on strings, by code point as Python compares them. The book
  // titles are ASCII, so this and the default sort agree; it is written out
  // because the default sort coerces to string and compares UTF-16 units,
  // which is not the same rule and would be the wrong one to rely on.
  function pySorted(list) {
    return list.slice().sort(function (a, b) {
      return a < b ? -1 : (a > b ? 1 : 0);
    });
  }

  // generate_night_page.run_length
  function runLength(recent, slot, title) {
    var nights = 0;
    for (var i = 0; i < recent.length; i++) {
      var here = recent[i][slot];
      if (!here || here.title !== title) { break; }
      nights += 1;
    }
    return nights;
  }

  // generate_night_page.psalm_for
  function psalmFor(ordinal, pools, spent, recent, keyOf) {
    var psalms = pools.psalms;
    var last = (recent[0] || {}).psalm;
    if (last && last.part < last.parts) {
      // Last night left a psalm unfinished; the rest of it comes next.
      var lastKey = keyOf(last);
      for (var i = 0; i < psalms.length; i++) {
        if (keyOf(psalms[i]) === lastKey) { return psalms[i + 1]; }
      }
    }
    var openings = psalms.filter(function (p) { return p.part === 1; });
    var fewest = Infinity;
    openings.forEach(function (p) {
      var n = spent.get(keyOf(p)) || 0;
      if (n < fewest) { fewest = n; }
    });
    var due = openings.filter(function (p) {
      return (spent.get(keyOf(p)) || 0) === fewest;
    });
    return new PyRandom(ordinal * 1000).choice(due);
  }

  // generate_night_page.reading_for
  function readingFor(ordinal, pools, pool, spent, salt, recent, slot, data, keyOf) {
    var entries = pools[pool];
    var fresh = entries.filter(function (r) { return !spent.has(keyOf(r)); });
    if (!fresh.length) { fresh = entries; }

    // Insertion order, which is the order of the pool, because each book's
    // earliest unread passage is the one taken.
    var byBook = new Map();
    fresh.forEach(function (r) {
      if (!byBook.has(r.title)) { byBook.set(r.title, []); }
      byBook.get(r.title).push(r);
    });

    var rng = new PyRandom(ordinal * 1000 + salt);
    var carriedFrom = (recent[0] || {})[slot];
    var carried = carriedFrom ? carriedFrom.title : undefined;

    if (carried !== undefined && byBook.has(carried)) {
      var schedule = data.schedules[slot] || data.stayWithBook;
      var nights = runLength(recent, slot, carried);
      var chance = nights <= schedule.length ? schedule[nights - 1] : 0.0;
      if (rng.random() < chance) { return byBook.get(carried)[0]; }
    }

    var all = Array.from(byBook.keys());
    var titles = pySorted(all.filter(function (t) { return t !== carried; }));
    if (!titles.length) { titles = pySorted(all); }
    var weights = titles.map(function (t) { return Math.sqrt(byBook.get(t).length); });
    return byBook.get(rng.choices(titles, weights, 1)[0])[0];
  }

  /* generate_night_page.build_page.
   *
   * `data` is night_data.json, `pools` is night_readings.json. Unlike the
   * morning, this office has a memory: which book each slot is working
   * through comes off the nights already written, which night_data.json
   * carries as three keys per date. */
  function buildNightPage(data, pools, iso, linked) {
    var parts = iso.split("-");
    var y = Number(parts[0]), m = Number(parts[1]), d = Number(parts[2]);
    var ordinal = toOrdinal(y, m, d);

    var keyCache = new Map();
    function keyOf(entry) {
      var k = keyCache.get(entry);
      if (k === undefined) { k = readingKey(entry.text); keyCache.set(entry, k); }
      return k;
    }

    // by_key: every reading in the pools, found by the key a page records.
    var byKey = new Map();
    ["psalms", "first", "second"].forEach(function (pool) {
      pools[pool].forEach(function (r) { byKey.set(keyOf(r), r); });
    });

    // recent_nights: the nights before this one, newest first. The dates are
    // the ones actually written, filtered and sliced exactly as the Python
    // walks the folder.
    var earlier = pySorted(Object.keys(data.keysByDate).filter(function (k) {
      return k < iso;
    }));
    var recent = earlier.slice(Math.max(0, earlier.length - data.history))
      .reverse()
      .map(function (date) {
        var keys = data.keysByDate[date], night = {};
        data.slots.forEach(function (slot, i) {
          if (i < keys.length && byKey.has(keys[i])) { night[slot] = byKey.get(keys[i]); }
        });
        return night;
      });

    // Counts, not a set: psalm_for picks among the psalms said fewest times.
    var spent = new Map();
    Object.keys(data.spent).forEach(function (k) { spent.set(k, data.spent[k]); });

    var psalm = psalmFor(ordinal, pools, spent, recent, keyOf);
    var first = readingFor(ordinal, pools, "first", spent, 1, recent, "first", data, keyOf);
    spent.set(keyOf(first), (spent.get(keyOf(first)) || 0) + 1);
    var second = readingFor(ordinal, pools, "second", spent, 2, recent, "second", data, keyOf);

    var fixed = data.fixed;
    // The psalm carries its own Glory be, and the first reading its Thanks be
    // to God; both belong to what they follow and go inside its section.
    var psalmBody = renderNightReading(psalm, keyOf) + "\n" + fixed["gloria-patri"];
    var firstBody = renderNightReading(first, keyOf) + "\n" + fixed.thanks;

    var sections = [
      ["sign-open", "Sign of the Cross", fixed.sign],
      ["jesus-prayer", "The Jesus Prayer", fixed["jesus-prayer"]],
      ["hail-mary", "Hail Mary", fixed["hail-mary"]],
      ["psalm", "Psalm — " + psalm.citation, psalmBody],
      ["reading-wisdom", "First Reading — " + first.citation, firstBody],
      ["reading-apocrypha", "Second Reading — " + second.citation,
        renderNightReading(second, keyOf)],
      ["mental-prayer", "Greater Doxology", fixed.doxology],
      ["sign-close", "Sign of the Cross", fixed.sign]
    ];

    var rendered = sections.map(function (s, index) {
      return renderSection(NIGHT_ROMAN[index], s[1], s[2], "", s[0], true);
    });

    function fill(text, sentinel, value) { return text.split(sentinel).join(value); }
    var out = data.shell;
    out = fill(out, data.sentinels.date, datePretty(y, m, d));
    out = fill(out, data.sentinels.nav, linked ? renderNightNeighbours(y, m, d) : "");
    out = fill(out, data.sentinels.sections, rendered.join("\n"));
    return out;
  }

  return {
    PyRandom: PyRandom,
    sha1Hex: sha1Hex,
    readingKey: readingKey,
    escape: esc,
    fold: fold,
    pyJson: pyJson,
    toOrdinal: toOrdinal,
    datePretty: datePretty,
    buildPage: buildPage,
    buildNightPage: buildNightPage
  };
});
