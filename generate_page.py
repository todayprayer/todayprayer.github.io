"""Generate the daily Catholic morning prayer web page.

Assembles the section schema (Sign of the Cross through Closing verse for the
dead) into a single self-contained HTML file. Everything random — the book
excerpt, the daily verse, the rotating saints — is seeded by the date, so
regenerating the page on the same day always yields the same page.

Every section the office can hold is written into every page, including the
ones that used to be day-dependent: both the Creed and the Acts, all three
readings, the Pledge. Which of them a reader actually sees, and in what order,
is decided in the browser and kept in localStorage beside the theme. The page
is rendered with the day's own defaults already applied, so it reads correctly
before any script runs and with scripting off altogether.

Usage:
    python generate_page.py                     # today's page -> morning_prayer.html
    python generate_page.py --date 2026-12-25   # a specific day's page
    python generate_page.py --open              # generate, then open in browser
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime
import html
import os
import random
import re
import sys
from pathlib import Path

import calendar_1962
import holidays_us
import json
import prayers
from book_excerpts import READINGS_FILE, Excerpt, reading_excerpt, reading_key

PROJECT_DIR = Path(__file__).parent
DEFAULT_OUTPUT = PROJECT_DIR / "morning_prayer.html"

PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Morning Prayer — {date_pretty}</title>
<style>
  :root, :root[data-theme="light"] {{
    --ink: #2b2216;
    --accent: #7a1f1f;
    --paper: #faf6ee;
    --rule: #d8cdb8;
    --muted: #6b5d48;
    color-scheme: light;
  }}
  :root[data-theme="paper"] {{
    --ink: #3a2e1c;
    --accent: #7a1f1f;
    --paper: #f4e8d0;
    --rule: #d9c49c;
    --muted: #6f5f45;
    color-scheme: light;
  }}
  :root[data-theme="dark"] {{
    --ink: #e2dacb;
    --accent: #d19a9a;
    --paper: #16150f;
    --rule: #3a352b;
    --muted: #9a9080;
    color-scheme: dark;
  }}
  body {{
    background: var(--paper);
    color: var(--ink);
    font-family: Georgia, "Times New Roman", serif;
    line-height: 1.65;
    margin: 0;
    padding: 2rem 1rem 4rem;
  }}
  main {{ max-width: 38rem; margin: 0 auto; }}
  header {{ text-align: center; margin-bottom: 2.5rem; }}
  header .cross {{ color: var(--accent); font-size: 1.6rem; }}
  h1 {{
    font-size: 1.7rem;
    font-weight: normal;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin: 0.4rem 0 0.2rem;
  }}
  header .date {{ font-style: italic; color: var(--muted); }}
  /* The days are a series, and a page of a series should say which way is
     back. Set small and quiet: it is furniture, not part of the office. */
  header nav {{
    display: flex;
    justify-content: center;
    align-items: baseline;
    gap: 1.4rem;
    margin-top: 0.7rem;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }}
  header nav a {{ color: var(--muted); text-decoration: none; }}
  header nav a:hover {{ color: var(--ink); }}
  section {{ margin: 2.2rem 0; }}
  h2 {{
    font-size: 0.95rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: normal;
    color: var(--accent);
    border-bottom: 1px solid var(--rule);
    padding-bottom: 0.3rem;
  }}
  h2 .numeral {{ display: inline-block; min-width: 2.6rem; }}
  p {{ margin: 0.8rem 0; }}
  .vr {{ margin: 0.8rem 0; }}
  .vr .v::before {{ content: "\\2123. "; color: var(--accent); }}
  .vr .r::before {{ content: "\\211F. "; color: var(--accent); }}
  .vr .r {{ margin-left: 1.4rem; }}
  .bilingual {{ margin: 0.5rem 0; }}
  .bilingual .la {{ font-style: italic; color: var(--muted); }}
  .antiphon .label {{ color: var(--accent); font-style: italic; }}
  .red {{ color: var(--accent); }}
  .rubric {{ color: var(--accent); font-style: italic; font-size: 0.85rem; }}
  .stanza {{
    margin: 0.9rem 0 0.9rem 1.2rem;
    text-indent: -1.2rem;
    line-height: 1.55;
  }}
  h3.subheading {{
    font-size: 0.85rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    font-weight: normal;
    margin: 1.2rem 0 0.4rem;
  }}
  .pill {{
    font-family: inherit;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    background: none;
    border: 1px solid var(--rule);
    border-radius: 1rem;
    color: var(--muted);
    padding: 0.15rem 0.7rem;
    cursor: pointer;
  }}
  .pill.active {{ border-color: var(--accent); color: var(--accent); }}
  h2 .pill {{ float: right; text-transform: none; letter-spacing: normal; }}
  .pill-row {{ margin: 0.6rem 0 0.2rem; }}
  .pill-row .pill {{ margin-right: 0.4rem; margin-bottom: 0.3rem; }}
  blockquote {{
    margin: 1rem 0;
    padding: 0.2rem 0 0.2rem 1.2rem;
    border-left: 3px solid var(--rule);
  }}
  .attribution {{
    text-align: right;
    font-style: normal;
    font-size: 0.9rem;
    color: var(--muted);
  }}
  footer {{
    text-align: center;
    margin-top: 3rem;
    color: var(--accent);
    font-size: 1.3rem;
  }}
  .theme-toggle {{
    position: fixed;
    top: 0.7rem;
    right: 0.7rem;
    display: flex;
    gap: 0.1rem;
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 1rem;
    padding: 0.15rem;
    z-index: 10;
  }}
  .theme-toggle button {{
    font-family: inherit;
    font-size: 0.62rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    line-height: 1.4;
    background: none;
    border: none;
    border-radius: 1rem;
    color: var(--muted);
    padding: 0.2rem 0.55rem;
    cursor: pointer;
  }}
  .theme-toggle button.active {{
    background: var(--accent);
    color: var(--paper);
  }}
{settings_css}
</style>
<script>
  (function () {{
    var t = localStorage.getItem("prayerTheme");
    if (t) {{ document.documentElement.setAttribute("data-theme", t); }}
  }})();
</script>
</head>
<body>
<div class="theme-toggle" role="group" aria-label="Theme">
  <button type="button" data-theme-value="light">Light</button>
  <button type="button" data-theme-value="paper">Paper</button>
  <button type="button" data-theme-value="dark">Dark</button>
  <button type="button" id="settings-open" title="Choose sections" aria-label="Choose sections">&#9881;</button>
</div>
{settings_ui}
<main>
  <header>
    <div class="cross">&#10013;</div>
    <h1>Morning Prayer</h1>
    <div class="date">{date_pretty}</div>
{neighbours}  </header>
{sections}
  <footer>&#10013;</footer>
</main>
<script>
  function setTheme(name) {{
    document.documentElement.setAttribute("data-theme", name);
    document.querySelectorAll(".theme-toggle button[data-theme-value]").forEach(function (btn) {{
      btn.classList.toggle("active", btn.dataset.themeValue === name);
    }});
    localStorage.setItem("prayerTheme", name);
  }}
  document.querySelectorAll(".theme-toggle button[data-theme-value]").forEach(function (btn) {{
    btn.addEventListener("click", function () {{ setTheme(this.dataset.themeValue); }});
  }});
  setTheme(localStorage.getItem("prayerTheme") || "light");

  function setLang(lang) {{
    document.querySelectorAll(".lang-english").forEach(function (el) {{
      el.style.display = lang === "english" ? "" : "none";
    }});
    document.querySelectorAll(".lang-latin").forEach(function (el) {{
      el.style.display = lang === "latin" ? "" : "none";
    }});
    document.querySelectorAll('[name="lang-btn"]').forEach(function (el, idx) {{
      el.textContent = lang === "english" ? "Latin" : "English";
      el.dataset.next = lang === "english" ? "latin" : "english";
    }});
    localStorage.setItem("prayerLang", lang);
  }}
  document.querySelectorAll('[name="lang-btn"]').forEach(function (btn, idx) {{
    btn.addEventListener("click", function () {{ setLang(this.dataset.next); }});
  }});
  setLang(localStorage.getItem("prayerLang") || "english");

  function setupToggleButtons(buttonClass, contentClass, storageKey) {{
    function setActive(value) {{
      document.querySelectorAll("." + contentClass).forEach(function (el) {{
        el.style.display = el.dataset.toggleValue === value ? "" : "none";
      }});
      document.querySelectorAll("." + buttonClass).forEach(function (btn) {{
        btn.classList.toggle("active", btn.dataset.toggleValue === value);
      }});
      localStorage.setItem(storageKey, value);
    }}

    document.querySelectorAll("." + buttonClass).forEach(function (btn) {{
      btn.addEventListener("click", function () {{ setActive(this.dataset.toggleValue); }});
    }});

    const firstBtn = document.querySelector("." + buttonClass);
    const defaultValue = firstBtn ? firstBtn.dataset.toggleValue : "0";
    setActive(localStorage.getItem(storageKey) || defaultValue);
  }}

  setupToggleButtons("offering-btn", "offering", "morningOffering");
  setupToggleButtons("contrition-btn", "contrition", "actofcontrition");
</script>
<script type="application/json" id="section-meta">{section_meta}</script>
<script>
{settings_js}
</script>
</body>
</html>
"""

ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"]

# Kept out of PAGE_TEMPLATE and passed in as arguments, because the template is
# rendered with str.format and every brace inside it has to be doubled. Held
# apart, this CSS and this script can be read and edited as themselves.
SETTINGS_CSS = """
  [hidden] { display: none !important; }
  .settings-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    z-index: 20;
  }
  .settings {
    position: fixed;
    z-index: 21;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    /* The page sets no box-sizing, so without this the 1.3rem padding and the
       border are added outside the width and the panel hangs off both edges of
       a phone. */
    box-sizing: border-box;
    width: min(30rem, calc(100vw - 1.5rem));
    max-height: min(38rem, calc(100vh - 2rem));
    /* Where it is supported, the dynamic viewport unit keeps the panel clear
       of a phone browser's retracting address bar. */
    max-height: min(38rem, calc(100dvh - 2rem));
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 0.4rem;
    box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.3);
    padding: 1.2rem 1.3rem 1.4rem;
  }
  .settings h2 {
    margin: 0 0 0.2rem;
    font-size: 0.95rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: normal;
    color: var(--accent);
    border-bottom: 1px solid var(--rule);
    padding-bottom: 0.3rem;
  }
  .settings .hint {
    font-size: 0.8rem;
    font-style: italic;
    color: var(--muted);
    margin: 0.5rem 0 0.9rem;
  }
  .settings-close {
    float: right;
    font-family: inherit;
    font-size: 1rem;
    line-height: 1;
    background: none;
    border: none;
    color: var(--muted);
    cursor: pointer;
    padding: 0 0.2rem;
  }
  .set-list { list-style: none; margin: 0; padding: 0; }
  .set-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.32rem 0.2rem;
    border-bottom: 1px solid var(--rule);
    background: var(--paper);
  }
  .set-row.dragging {
    border: 1px dashed var(--accent);
    box-shadow: 0 0.3rem 0.8rem rgba(0, 0, 0, 0.22);
    position: relative;
    z-index: 1;
  }
  /* While a row is in hand, nothing anywhere should turn blue under the
     pointer. Without this a drag reads as a clumsy text selection. */
  body.dragging-row, body.dragging-row * {
    user-select: none;
    -webkit-user-select: none;
    cursor: grabbing !important;
  }
  .set-handle {
    cursor: grab;
    color: var(--muted);
    font-size: 0.9rem;
    line-height: 1;
    padding: 0.35rem 0.3rem;
    background: none;
    border: none;
    font-family: inherit;
    /* The handle refuses the browser's own gestures: without touch-action a
       finger scrolls the list instead of picking the row up. The two -webkit-
       rules are for iOS, where holding a spot to drag it otherwise raises the
       selection callout and the magnifier over the thing being dragged. */
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
  }
  .set-handle:focus-visible { outline: 1px solid var(--accent); }
  /* No touch-action here on purpose. The names are most of the list's
     surface, and a finger dragging down them has to scroll it. Only the
     handle refuses the scroll gesture, and only the handle drags on touch. */
  .set-name {
    flex: 1;
    font-size: 0.88rem;
    cursor: grab;
  }
  .set-row.is-off .set-name { color: var(--muted); }
  .set-rule {
    display: block;
    font-size: 0.72rem;
    font-style: italic;
    color: var(--muted);
  }
  .seg { display: flex; flex: none; }
  .seg button {
    font-family: inherit;
    font-size: 0.65rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    background: none;
    border: 1px solid var(--rule);
    border-right: none;
    color: var(--muted);
    padding: 0.16rem 0.45rem;
    cursor: pointer;
  }
  .seg button:first-child { border-radius: 1rem 0 0 1rem; padding-left: 0.6rem; }
  .seg button:last-child {
    border-right: 1px solid var(--rule);
    border-radius: 0 1rem 1rem 0;
    padding-right: 0.6rem;
  }
  .seg button.active { background: var(--accent); color: var(--paper); border-color: var(--accent); }
  .set-always {
    flex: none;
    font-size: 0.68rem;
    font-style: italic;
    letter-spacing: 0.06em;
    color: var(--muted);
    padding-right: 0.3rem;
  }
  .settings-foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 1rem;
  }
"""

SETTINGS_UI = """<div class="settings-backdrop" id="settings-backdrop" hidden></div>
<div class="settings" id="settings" role="dialog" aria-modal="true" aria-labelledby="settings-title" hidden>
  <button type="button" class="settings-close" id="settings-close" aria-label="Close">&#10005;</button>
  <h2 id="settings-title">Sections</h2>
  <p class="hint">Drag to reorder. <em>Auto</em> keeps a section on the day&rsquo;s own
     custom; <em>On</em> and <em>Off</em> settle it for every day. Kept on this device.</p>
  <ul class="set-list" id="set-list"></ul>
  <div class="settings-foot">
    <button type="button" class="pill" id="settings-reset">Restore defaults</button>
    <button type="button" class="pill" id="settings-done">Done</button>
  </div>
</div>"""

SETTINGS_JS = """
(function () {
  var KEY = "prayerSections";
  var meta = JSON.parse(document.getElementById("section-meta").textContent);
  var byId = {};
  var defaults = meta.map(function (s) { byId[s.id] = s; return s.id; });

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function save(cfg) {
    try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {}
  }

  // A saved order is a list of ids from whenever it was saved, so it will not
  // mention a section that did not exist that day — the holiday hymn above
  // all, which only some pages carry. Rather than discard the saved order or
  // append the stranger at the end, each unknown id is dropped back beside the
  // neighbour it defaults to following, which is where the reader would have
  // put it anyway.
  function mergedOrder(saved) {
    var order = (saved || []).filter(function (id) { return byId[id]; });
    var have = {};
    order.forEach(function (id) { have[id] = true; });
    defaults.forEach(function (id, i) {
      if (have[id]) return;
      var at = 0;
      for (var j = i - 1; j >= 0; j--) {
        var p = order.indexOf(defaults[j]);
        if (p >= 0) { at = p + 1; break; }
      }
      order.splice(at, 0, id);
      have[id] = true;
    });
    return order;
  }

  function stateOf(cfg, id) {
    if (byId[id].required) return "on";
    return (cfg.state || {})[id] || "auto";
  }

  function isVisible(cfg, id) {
    var st = stateOf(cfg, id);
    if (st === "on") return true;
    if (st === "off") return false;
    return byId[id].auto;
  }

  function roman(n) {
    var map = [[50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
    var out = "";
    for (var i = 0; i < map.length; i++) {
      while (n >= map[i][0]) { out += map[i][1]; n -= map[i][0]; }
    }
    return out;
  }

  // Move the real <section> elements about rather than rebuild them, so the
  // language toggle, the offering pills and the reading keys inside them keep
  // the listeners already bound and the page keeps recording what it spent.
  function apply() {
    var cfg = load();
    var main = document.querySelector("main");
    var footer = main.querySelector("footer");
    var n = 0;
    mergedOrder(cfg.order).forEach(function (id) {
      var el = main.querySelector('section[data-section="' + id + '"]');
      if (!el) return;
      main.insertBefore(el, footer);
      var show = isVisible(cfg, id);
      el.hidden = !show;
      if (show) {
        n += 1;
        var num = el.querySelector(".numeral");
        if (num) { num.textContent = roman(n) + "."; }
      }
    });
  }

  var list = document.getElementById("set-list");

  function rowFor(cfg, id) {
    var s = byId[id];
    var li = document.createElement("li");
    li.className = "set-row";
    li.dataset.id = id;

    var handle = document.createElement("button");
    handle.type = "button";
    handle.className = "set-handle";
    handle.innerHTML = "&#8942;&#8942;";
    handle.setAttribute("aria-label", "Move " + s.label);
    li.appendChild(handle);

    var name = document.createElement("span");
    name.className = "set-name";
    name.textContent = s.label;
    if (s.rule) {
      var rule = document.createElement("span");
      rule.className = "set-rule";
      rule.textContent = "auto: " + s.rule;
      name.appendChild(rule);
    }
    li.appendChild(name);

    if (s.required) {
      var always = document.createElement("span");
      always.className = "set-always";
      always.textContent = "always";
      li.appendChild(always);
    } else {
      // Three choices where the section has a day rule to fall back on, two
      // where it has none: for a section shown every day anyway, "auto" and
      // "on" would be the same button twice.
      var seg = document.createElement("span");
      seg.className = "seg";
      var choices = s.rule ? ["auto", "on", "off"] : ["on", "off"];
      var current = stateOf(cfg, id);
      if (!s.rule && current === "auto") { current = s.auto ? "on" : "off"; }
      choices.forEach(function (choice) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = choice;
        b.className = choice === current ? "active" : "";
        b.addEventListener("click", function () {
          var c = load();
          c.state = c.state || {};
          c.state[id] = choice;
          save(c);
          render();
          apply();
        });
        seg.appendChild(b);
      });
      li.appendChild(seg);
      li.classList.toggle("is-off", !isVisible(cfg, id));
    }

    attachDrag(li, [handle, name]);
    return li;
  }

  function commitOrder() {
    var cfg = load();
    cfg.order = Array.prototype.map.call(list.children, function (li) { return li.dataset.id; });
    save(cfg);
    apply();
  }

  // Pointer events rather than the HTML drag-and-drop API, which does not fire
  // on touch.
  //
  // The listeners go on the window, and deliberately not on the handle with
  // setPointerCapture, which is the obvious way to write this and does not
  // work: capture is released as soon as the captured element moves in the
  // document, and moving the row is the whole point. The first reorder would
  // silently end the drag, leaving the row stuck looking picked up because its
  // pointerup never arrived.
  function attachDrag(li, grips) {
    function start(ev) {
      if (ev.button) { return; }
      ev.preventDefault();
      li.classList.add("dragging");
      document.body.classList.add("dragging-row");

      // Insert before the first row whose middle is below the pointer, or at
      // the end if there is none. Reading the position off the other rows
      // rather than off the one in hand keeps it from chasing itself as the
      // list reflows under the drag.
      function move(e) {
        e.preventDefault();
        var before = null;
        var rows = Array.prototype.slice.call(list.children);
        for (var i = 0; i < rows.length; i++) {
          if (rows[i] === li) { continue; }
          var box = rows[i].getBoundingClientRect();
          if (e.clientY < box.top + box.height / 2) { before = rows[i]; break; }
        }
        if (before !== li.nextSibling) { list.insertBefore(li, before); }
      }
      function stop() {
        li.classList.remove("dragging");
        document.body.classList.remove("dragging-row");
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
        commitOrder();
      }
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", stop);
    }
    // The handle always grips. The name grips for a mouse only — with a
    // finger it must stay free to scroll the list, which is the whole reason
    // the row names carry no touch-action.
    grips.forEach(function (el, i) {
      el.addEventListener("pointerdown", function (ev) {
        if (i > 0 && ev.pointerType !== "mouse") { return; }
        start(ev);
      });
    });
    var handle = grips[0];

    // Dragging is unreachable by keyboard, so the arrow keys move a focused
    // row as well.
    handle.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") { return; }
      e.preventDefault();
      if (e.key === "ArrowUp" && li.previousElementSibling) {
        list.insertBefore(li, li.previousElementSibling);
      } else if (e.key === "ArrowDown" && li.nextElementSibling) {
        list.insertBefore(li, li.nextElementSibling.nextSibling);
      }
      commitOrder();
      handle.focus();
    });
  }

  function render() {
    var cfg = load();
    list.textContent = "";
    mergedOrder(cfg.order).forEach(function (id) {
      if (byId[id]) { list.appendChild(rowFor(cfg, id)); }
    });
  }

  var panel = document.getElementById("settings");
  var backdrop = document.getElementById("settings-backdrop");

  function open() { render(); panel.hidden = false; backdrop.hidden = false; }
  function close() { panel.hidden = true; backdrop.hidden = true; }

  document.getElementById("settings-open").addEventListener("click", open);
  document.getElementById("settings-close").addEventListener("click", close);
  document.getElementById("settings-done").addEventListener("click", close);
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !panel.hidden) { close(); }
  });
  document.getElementById("settings-reset").addEventListener("click", function () {
    try { localStorage.removeItem(KEY); } catch (e) {}
    render();
    apply();
  });

  apply();
})();
"""


def decorate(text: str) -> str:
    """Escape prayer text, then mark up crosses, N. placeholders, parentheticals
    (all in liturgical red) and the "Let us pray." formula (italic)."""
    out = html.escape(text)
    out = out.replace("✠", '<span class="red">✠</span>')
    out = re.sub(r"(?<![A-Za-z])N\.", '<span class="red">N.</span>', out)
    out = re.sub(r"\([^)]*\)", lambda m: f'<span class="red">{m.group(0)}</span>', out)
    return out.replace("Let us pray.", "<em>Let us pray.</em>")


def render_paragraph(item) -> str:
    if isinstance(item, prayers.Bilingual):
        return (
            f'  <div class="bilingual">{decorate(item.english)} '
            f'<span class="la">/ {decorate(item.other)}</span></div>'
        )
    if isinstance(item, prayers.Antiphon):
        return (
            f'  <p class="antiphon"><span class="label">Ant.</span> '
            f"{decorate(item.text)}</p>"
        )
    if isinstance(item, prayers.Rubric):
        return f'  <p class="rubric">{html.escape(item.text)}</p>'
    if isinstance(item, prayers.Subheading):
        return f'  <h3 class="subheading">{html.escape(item.text)}</h3>'
    if isinstance(item, prayers.Response):
        return f'  <div class="vr"><div class="r">{decorate(item.text)}</div></div>'
    if isinstance(item, prayers.Stanza):
        lines = "<br>\n    ".join(decorate(ln) for ln in item.text.split("\n"))
        return f'  <p class="stanza">{lines}</p>'
    if isinstance(item, tuple):
        v, r = (decorate(part) for part in item)
        return f'  <div class="vr"><div class="v">{v}</div><div class="r">{r}</div></div>'
    return f"  <p>{decorate(item)}</p>"


def render_section(
    numeral: str, title: str, body_html: str, header_extra: str = "",
    section_id: str = "", shown: bool = True,
) -> str:
    """One section, carrying the id the browser reorders it by.

    Sections the day's own defaults leave out are still written, marked hidden.
    The reader sees the right page before any script runs, and with scripting
    off it stays the page it has always been.
    """
    return (
        f'  <section data-section="{section_id}"{"" if shown else " hidden"}>\n'
        f'    <h2><span class="numeral">{numeral}.</span>{html.escape(title)}{header_extra}</h2>\n'
        f"{body_html}\n"
        f"  </section>"
    )


def render_prayer(items) -> str:
    return "\n".join(render_paragraph(item) for item in items)


def render_lang_prayer(prayer) -> str:
    """Prayer in parallel Latin/English, toggled by a button."""
    parts = []
    for lang in ("english", "latin"):
        body = render_prayer(prayer[lang])
        parts.append(f'  <div class="lang-{lang}">\n{body}\n  </div>')
    return "\n".join(parts)


def render_optional(cls, prayer) -> str:
    buttons = "\n".join(
        f'    <button type="button" class="pill {cls}-btn" data-toggle-value="{label}">{html.escape(label)}</button>'
        for label, _ in prayer
    )
    amen = '<div class="vr"><div class="r">Amen.</div></div>'
    # A blank line divides paragraphs, as it does in the readings (render_excerpt).
    # The longer acts of contrition run to two distinct petitions, which read as a
    # wall of text in one block.
    texts = "\n".join(
        f'  <div class="{cls}" data-toggle-value="{label}">\n'
        + "\n".join(f"  <p>{decorate(para)}</p>" for para in text.split("\n\n"))
        + f"\n  {amen}\n  </div>"
        for label, text in prayer
    )
    return f'  <div class="pill-row">\n{buttons}\n  </div>\n{texts}'


def render_excerpt(excerpt: Excerpt, spent: bool = True) -> str:
    """A reading, and the record of whether the page has spent it.

    A page spends only the readings its own defaults show. The third reading is
    written into a Sunday page so that a reader who wants it can switch it on,
    but it is marked unspent, and a later day may still offer it. That is what
    the generator has always done — it picked a third reading every day and
    dropped it on Sundays — except that the reading is now kept rather than
    discarded, so turning the section on has something to show.
    """
    # A single newline inside a paragraph is a verse line break (Dante, Faust).
    paragraphs = "\n".join(
        f"    <p>{html.escape(p).replace(chr(10), '<br>')}</p>"
        for p in excerpt.text.split("\n\n")
    )
    # The key records which reading this page spent, so that a later day can
    # avoid it. Written into the page rather than kept in a side file, so the
    # record cannot drift from the pages it describes.
    attr = "data-reading" if spent else "data-reading-unspent"
    return (
        f'  <blockquote {attr}="{reading_key(excerpt.text)}">\n'
        f"{paragraphs}\n  </blockquote>\n"
        f'  <p class="attribution">&mdash; {html.escape(excerpt.attribution)}</p>'
    )


DAYS_DIR = PROJECT_DIR / "days"
BLOCKQUOTE = re.compile(
    r'<blockquote(?: data-reading="([0-9a-f]+)")?'
    r'(?: data-reading-unspent="([0-9a-f]+)")?>(.*?)</blockquote>',
    re.S,
)
PARAGRAPH = re.compile(r"<p>(.*?)</p>", re.S)


def _key_by_normalised_text() -> dict[str, str]:
    """Lookup from a reading's letters alone to its key.

    Pages written before readings carried a key have to be read back from the
    text itself. Comparing on letters only sidesteps the HTML escaping and the
    <br> substitution that rendering introduced.
    """
    entries = json.loads(READINGS_FILE.read_text(encoding="utf-8"))
    return {
        re.sub(r"[^a-z]", "", e["text"].lower()): reading_key(e["text"])
        for e in entries
    }


def used_readings(days_dir: Path = DAYS_DIR) -> set[str]:
    """Every reading key already spent by a page in the days folder."""
    if not days_dir.is_dir():
        return set()
    used: set[str] = set()
    fallback: dict[str, str] | None = None
    for page in sorted(days_dir.glob("*.html")):
        for key, unspent, body in BLOCKQUOTE.findall(page.read_text(encoding="utf-8")):
            # A reading the page carries but does not show by default. It has
            # not been prayed, so a later day is still free to offer it. Caught
            # before the fallback below, which would otherwise recover its key
            # from the text and count it after all.
            if unspent:
                continue
            if key:
                used.add(key)
                continue
            # An older page: recover the reading from its own text.
            if fallback is None:
                fallback = _key_by_normalised_text()
            text = "".join(
                html.unescape(p).replace("<br>", "") for p in PARAGRAPH.findall(body)
            )
            found = fallback.get(re.sub(r"[^a-z]", "", text.lower()))
            if found:
                used.add(found)
    return used


def saints_for_day(day: datetime.date) -> list:
    """Opening Kyrie, the fixed invocations, plus two saints rotated by date."""
    rotation = prayers.SAINTS_ROTATION
    first = day.toordinal() % len(rotation)
    second = (first + len(rotation) // 2) % len(rotation)
    return (
        prayers.KYRIE
        + prayers.INVOCATION_OF_THE_SAINTS_FIXED
        + [(f"{rotation[first]},", "pray for us."), (f"{rotation[second]},", "pray for us.")]
        + prayers.INVOCATION_OF_THE_SAINTS_CLOSE
    )


# How hard a feast steers the reading toward its own topics, by class:
# (minimum matching readings needed before the pool is restricted to them,
# weight given to each matching topic when it is not). A first-class feast
# restricts the pool almost always; a second-class one only where the match is
# well stocked; a third-class one never restricts and merely weights. Where a
# feast's topics are thinly represented, the threshold lets it fall back to
# weighting rather than return the same two or three readings every year.
RANK_STEER = {1: (12, 8), 2: (25, 4), 3: (None, 2)}


def pick_excerpt(
    day: datetime.date,
    included_topics=[],
    excluded_topics=[],
    any_topics=[],
    exclude_keys: set[str] | None = None,
) -> Excerpt:
    """A hand-curated reading, steered toward the day's feast when there is one."""
    feast = calendar_1962.feast_for(day)
    topics = calendar_1962.FEAST_TOPICS.get(feast.category, []) if feast else []
    prefer_min, boost = RANK_STEER.get(feast.rank, (None, 1)) if feast else (None, 1)
    return reading_excerpt(
        topics,
        included_topics=included_topics,
        excluded_topics=excluded_topics,
        any_topics=any_topics,
        prefer_topics=topics if prefer_min and topics else None,
        prefer_min=prefer_min or 1,
        weight_boost=boost,
        exclude_keys=exclude_keys,
        rng=random.Random(day.toordinal()),
    )


def verse_of_the_day(day: datetime.date) -> list:
    """The feast's verse per the 1962 calendar, headed by the feast name;
    on an ordinary feria, a verse from the rotation."""
    feast = calendar_1962.feast_for(day)
    if feast:
        return [prayers.Rubric(feast.name), feast.verse]
    rotation = prayers.CLOSING_VERSES_FOR_THE_DAY
    return [rotation[day.toordinal() % len(rotation)]]


@dataclasses.dataclass(frozen=True)
class Section:
    """One part of the office, and what the browser needs to know about it.

    `title` is what the page prints, which for a reading is the book's own name
    and so changes daily; `label` is the stable name the settings list uses, so
    that the row for the historical reading does not read "From 'Daniel
    Webster'" one morning and something else the next. `auto` is whether the
    day's own custom shows it, and `rule` says in words what that custom is —
    empty where there is none, which is also how the browser knows to offer two
    choices rather than three.
    """

    id: str
    title: str
    body: str
    extra: str = ""
    label: str = ""
    auto: bool = True
    required: bool = False
    rule: str = ""


def render_neighbours(day: datetime.date) -> str:
    """Arrows to the day before and the day after.

    Both are always written, whether or not those pages exist yet: the file
    name of a day is its date, so the link is knowable in advance, and a day
    generated later fills it in. Only pages living in the days folder get
    these — the standalone morning_prayer.html has no neighbours.
    """
    back = (day - datetime.timedelta(days=1)).isoformat()
    forward = (day + datetime.timedelta(days=1)).isoformat()
    return (
        "    <nav>\n"
        f'      <a href="{back}.html" rel="prev">&larr; Yesterday</a>\n'
        f'      <a href="{forward}.html" rel="next">Tomorrow &rarr;</a>\n'
        "    </nav>\n"
    )


# The date line of the header, which the arrows go under.
_HEADER_DATE = re.compile(r'(?m)^(\s*<div class="date">.*</div>\n)')
_HAS_NAV = re.compile(r'<nav>\s*<a href="[\d-]+\.html" rel="prev"')


def link_neighbours(page: str, day: datetime.date) -> str:
    """Put the arrows into a page that was written before it had any.

    The days folder was filled a month before the arrows existed, and those
    pages have already been prayed: rebuilding them would deal new readings
    into days that are past. So the header alone is patched, and the office
    below it is not touched.
    """
    if _HAS_NAV.search(page):
        return page
    patched, count = _HEADER_DATE.subn(
        lambda m: m.group(1) + render_neighbours(day), page, count=1
    )
    if not count:
        raise LookupError(f"{day}: the page has no date line to hang the arrows on")
    # The arrows need the rule that sets them small and quiet, which a page of
    # that vintage has no line for either.
    if "header nav" not in patched:
        patched = patched.replace(
            "  section { margin: 2.2rem 0; }",
            _NAV_CSS + "  section { margin: 2.2rem 0; }",
            1,
        )
    return patched


_NAV_CSS = """  header nav {
    display: flex;
    justify-content: center;
    align-items: baseline;
    gap: 1.4rem;
    margin-top: 0.7rem;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  header nav a { color: var(--muted); text-decoration: none; }
  header nav a:hover { color: var(--ink); }
"""


def build_page(
    day: datetime.date, exclude_keys: set[str] | None = None, linked: bool = False
) -> str:
    # Each slot also avoids what the earlier slots took, so that a page never
    # prints the same reading twice even when the filters overlap.
    spent = set(exclude_keys or ())

    def take(**kwargs) -> Excerpt:
        chosen = pick_excerpt(day, exclude_keys=spent, **kwargs)
        spent.add(reading_key(chosen.text))
        return chosen

    cexcerpt = take(any_topics=['catechism', 'council', 'encyclical'], excluded_topics=['historical'])
    excerpt = take(excluded_topics=['historical', 'catechism', 'council', 'encyclical'])
    hexcerpt = take(included_topics=['historical'])

    lang_button = ' <button type="button" id="lang-btn" name="lang-btn" class="pill" data-next="latin">Latin</button>'
    sunday = day.weekday() == 6
    holiday = holidays_us.holiday_for(day)

    # The whole office, in its customary order, whatever day it is. What used
    # to be decided here by splicing — Creed for Acts on a Sunday, the third
    # reading and the Pledge on a weekday — survives as each section's `auto`,
    # which is what the browser falls back on until a reader says otherwise.
    # A reader who wants the Creed and the Acts together every day can have
    # both; the swap is only the default.
    S = Section
    sections = [
        S("sign-open", "Sign of the Cross", render_prayer(prayers.SIGN_OF_THE_CROSS),
          label="Sign of the Cross (opening)", required=True),
        S("holy-spirit", "Invocation of the Holy Spirit",
          render_prayer(prayers.INVOCATION_OF_THE_HOLY_SPIRIT), required=True),
        S("creed", "Tridentine Creed", render_lang_prayer(prayers.TRIDENTINE_CREED),
          extra=lang_button, auto=sunday, rule="Sundays"),
        S("acts", "Acts of Faith, Hope, and Love", render_prayer(prayers.ACTS),
          auto=not sunday, rule="weekdays"),
        S("contrition", "Act of Contrition",
          render_optional("contrition", prayers.ACT_OF_CONTRITION)),
        S("lords-prayer", "Kyrie and Lord's Prayer",
          render_prayer(prayers.KYRIE_AND_LORDS_PRAYER), required=True),
        S("offering", "Morning Offering",
          render_optional("offering", prayers.MORNING_OFFERINGS), required=True),
        S("saints", "Invocation of the Saints", render_prayer(saints_for_day(day))),
        S("reading-doctrinal", f"From “{cexcerpt.title}”", render_excerpt(cexcerpt),
          label="First reading — catechism, council, encyclical", required=True),
        S("reading-general", f"From “{excerpt.title}”", render_excerpt(excerpt),
          label="Second reading — spiritual writing"),
        S("reading-historical", f"From “{hexcerpt.title}”",
          render_excerpt(hexcerpt, spent=not sunday),
          label="Third reading — history and lives", auto=not sunday, rule="weekdays"),
        S("suffrage", "Suffrage", render_prayer(prayers.SUFFRAGE)),
        S("closing-prayer", "Closing Prayer", render_prayer(prayers.CLOSING_PRAYER)),
        S("doxology", "Doxology", render_prayer(prayers.DOXOLOGY), required=True),
        S("verse-of-the-day", "Verse for the Day", render_prayer(verse_of_the_day(day))),
        S("pledge", "Pledge of Allegiance", render_prayer(prayers.PLEDGE_OF_ALLEGIANCE),
          auto=bool(holiday) or not sunday, rule="weekdays and holidays"),
    ]
    if holiday:
        sections.append(
            S("holiday-hymn", holiday.hymn_title, render_prayer(holiday.hymn),
              rule="holidays")
        )
    sections += [
        S("closing-verses", "Closing Verses", render_prayer(prayers.CLOSING_VERSES),
          required=True),
        S("sign-close", "Sign of the Cross", render_prayer(prayers.SIGN_OF_THE_CROSS),
          label="Sign of the Cross (closing)", required=True),
    ]

    # Numbered over what the day itself shows, so the numerals are already
    # right for a reader who never opens the settings.
    numeral = 0
    rendered = []
    for s in sections:
        shown = s.required or s.auto
        if shown:
            numeral += 1
        rendered.append(
            render_section(
                ROMAN[numeral - 1] if shown else "",
                s.title, s.body, s.extra, section_id=s.id, shown=shown,
            )
        )

    meta = [
        {
            "id": s.id,
            "label": s.label or s.title,
            "auto": s.required or s.auto,
            "required": s.required,
            "rule": s.rule,
        }
        for s in sections
    ]
    return PAGE_TEMPLATE.format(
        date_pretty=day.strftime("%A, %B %d, %Y").replace(" 0", " "),
        neighbours=render_neighbours(day) if linked else "",
        sections="\n".join(rendered),
        settings_css=SETTINGS_CSS,
        settings_ui=SETTINGS_UI,
        settings_js=SETTINGS_JS,
        section_meta=json.dumps(meta, ensure_ascii=False),
    )


def generate_days(start: datetime.date, end: datetime.date, days_dir: Path = DAYS_DIR) -> None:
    """Write a page per day into the days folder, never repeating a reading.

    The pages already in the folder are read first, so a new run continues
    where the last one left off; and the set grows as the run proceeds, so the
    days written in one go do not repeat each other either. Pages that already
    exist keep their office — regenerating them would change what has already
    been prayed — but do get the arrows to their neighbours if they were
    written before there were any, so that the whole folder reads as a series.
    """
    days_dir.mkdir(exist_ok=True)
    spent = used_readings(days_dir)
    print(f"{len(spent)} readings already spent by {len(list(days_dir.glob('*.html')))} pages")

    written = skipped = 0
    day = start
    while day <= end:
        out = days_dir / f"{day.isoformat()}.html"
        if out.exists():
            skipped += 1
        else:
            page = build_page(day, exclude_keys=spent, linked=True)
            out.write_text(page, encoding="utf-8")
            spent |= {key for key, unspent, _ in BLOCKQUOTE.findall(page) if key and not unspent}
            written += 1
        day += datetime.timedelta(days=1)

    print(f"wrote {written} pages, left {skipped} existing pages alone")
    print(f"{len(spent)} readings spent in total")
    print(f"linked {link_days(days_dir)} pages that had no arrows")


def link_days(days_dir: Path = DAYS_DIR) -> int:
    """Give the arrows to every page in the folder that is missing them."""
    linked = 0
    for page in sorted(days_dir.glob("*.html")):
        try:
            day = datetime.date.fromisoformat(page.stem)
        except ValueError:
            continue  # not a day page
        before = page.read_text(encoding="utf-8")
        after = link_neighbours(before, day)
        if after != before:
            page.write_text(after, encoding="utf-8")
            linked += 1
    return linked


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", help="YYYY-MM-DD (default: today)")
    parser.add_argument("--out", default=str(DEFAULT_OUTPUT), help="output HTML file")
    parser.add_argument("--open", action="store_true", help="open the page in the browser")
    parser.add_argument(
        "--days",
        metavar="START:END",
        help="write a page per day into days/, skipping readings already used there",
    )
    parser.add_argument(
        "--force", action="store_true", help="with --days, overwrite existing pages"
    )
    args = parser.parse_args()

    if args.days:
        start, _, end = args.days.partition(":")
        first = datetime.date.fromisoformat(start)
        last = datetime.date.fromisoformat(end) if end else first
        if args.force:
            for day_ordinal in range(first.toordinal(), last.toordinal() + 1):
                (DAYS_DIR / f"{datetime.date.fromordinal(day_ordinal)}.html").unlink(missing_ok=True)
        generate_days(first, last)
        return

    day = datetime.date.fromisoformat(args.date) if args.date else datetime.date.today()
    out = Path(args.out)
    out.write_text(build_page(day, exclude_keys=used_readings()), encoding="utf-8")
    print(f"Wrote {out} for {day.isoformat()}")
    if args.open:
        os.startfile(out)  # noqa: S606 — Windows-only, intentional


if __name__ == "__main__":
    main()
