"""Generate the daily Catholic morning prayer web page.

Assembles the eleven-section schema (Sign of the Cross through Closing verse
for the dead) into a single self-contained HTML file. Everything random —
the book excerpt, the daily verse, the rotating saints — is seeded by the
date, so regenerating the page on the same day always yields the same page.

Usage:
    python generate_page.py                     # today's page -> morning_prayer.html
    python generate_page.py --date 2026-12-25   # a specific day's page
    python generate_page.py --open              # generate, then open in browser
"""

from __future__ import annotations

import argparse
import datetime
import html
import os
import random
import re
import sys
from pathlib import Path

import calendar_1962
import prayers
from book_excerpts import Excerpt, reading_excerpt

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
</div>
<main>
  <header>
    <div class="cross">&#10013;</div>
    <h1>Morning Prayer</h1>
    <div class="date">{date_pretty}</div>
  </header>
{sections}
  <footer>&#10013;</footer>
</main>
<script>
  function setTheme(name) {{
    document.documentElement.setAttribute("data-theme", name);
    document.querySelectorAll(".theme-toggle button").forEach(function (btn) {{
      btn.classList.toggle("active", btn.dataset.themeValue === name);
    }});
    localStorage.setItem("prayerTheme", name);
  }}
  document.querySelectorAll(".theme-toggle button").forEach(function (btn) {{
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
</body>
</html>
"""

ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"]


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
    if isinstance(item, tuple):
        v, r = (decorate(part) for part in item)
        return f'  <div class="vr"><div class="v">{v}</div><div class="r">{r}</div></div>'
    return f"  <p>{decorate(item)}</p>"


def render_section(numeral: str, title: str, body_html: str, header_extra: str = "") -> str:
    return (
        f'  <section>\n'
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
    texts = "\n".join(
        f'  <div class="{cls}" data-toggle-value="{label}">\n  <p>{decorate(text)}</p>\n  {amen}\n  </div>'
        for label, text in prayer
    )
    return f'  <div class="pill-row">\n{buttons}\n  </div>\n{texts}'


def render_excerpt(excerpt: Excerpt) -> str:
    # A single newline inside a paragraph is a verse line break (Dante, Faust).
    paragraphs = "\n".join(
        f"    <p>{html.escape(p).replace(chr(10), '<br>')}</p>"
        for p in excerpt.text.split("\n\n")
    )
    return (
        f"  <blockquote>\n{paragraphs}\n  </blockquote>\n"
        f'  <p class="attribution">&mdash; {html.escape(excerpt.attribution)}</p>'
    )


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


def pick_excerpt(day: datetime.date, included_topics=[], excluded_topics=[]) -> Excerpt:
    """A hand-curated reading, steered toward the day's feast when there is one."""
    feast = calendar_1962.feast_for(day)
    topics = calendar_1962.FEAST_TOPICS.get(feast.category, []) if feast else []
    return reading_excerpt(topics, included_topics=included_topics, excluded_topics=excluded_topics, rng=random.Random(day.toordinal()))


def verse_of_the_day(day: datetime.date) -> list:
    """The feast's verse per the 1962 calendar, headed by the feast name;
    on an ordinary feria, a verse from the rotation."""
    feast = calendar_1962.feast_for(day)
    if feast:
        return [prayers.Rubric(feast.name), feast.verse]
    rotation = prayers.CLOSING_VERSES_FOR_THE_DAY
    return [rotation[day.toordinal() % len(rotation)]]


def build_page(day: datetime.date) -> str:
    excerpt = pick_excerpt(day, excluded_topics=['historical'])
    hexcerpt = pick_excerpt(day, included_topics=['historical'])

    lang_button = ' <button type="button" id="lang-btn" name="lang-btn" class="pill" data-next="latin">Latin</button>'
    creed = ("Tridentine Creed", render_lang_prayer(prayers.TRIDENTINE_CREED), lang_button)
    acts = ("Acts of Faith, Hope, and Love", render_prayer(prayers.ACTS), "")
    sections = [
        ("Sign of the Cross", render_prayer(prayers.SIGN_OF_THE_CROSS), ""),
        ("Invocation of the Holy Spirit", render_prayer(prayers.INVOCATION_OF_THE_HOLY_SPIRIT), ""),
        ("Act of Contrition", render_optional("contrition", prayers.ACT_OF_CONTRITION), ""),
        ("Kyrie and Lord's Prayer", render_prayer(prayers.KYRIE_AND_LORDS_PRAYER), ""),
        ("Morning Offering", render_optional("offering", prayers.MORNING_OFFERINGS), ""),
        ("Invocation of the Saints", render_prayer(saints_for_day(day)), ""),
        (f"From “{excerpt.title}”", render_excerpt(excerpt), ""),
        (f"From “{hexcerpt.title}”", render_excerpt(hexcerpt), ""),
        ("Suffrage", render_prayer(prayers.SUFFRAGE), ""),
        ("Closing Prayer", render_prayer(prayers.CLOSING_PRAYER), ""),
        ("Doxology", render_prayer(prayers.DOXOLOGY), ""),
        ("Verse for the Day", render_prayer(verse_of_the_day(day)), ""),
        ("Closing Verses", render_prayer(prayers.CLOSING_VERSES), ""),
        ("Sign of the Cross", render_prayer(prayers.SIGN_OF_THE_CROSS), ""),
    ]
    if day.weekday() == 6:
        sections.insert(2, creed)
    else:
        sections.insert(2, acts)

    rendered = "\n".join(
        render_section(ROMAN[i], title, body, extra)
        for i, (title, body, extra) in enumerate(sections)
    )
    return PAGE_TEMPLATE.format(
        date_pretty=day.strftime("%A, %B %d, %Y").replace(" 0", " "),
        sections=rendered,
    )


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", help="YYYY-MM-DD (default: today)")
    parser.add_argument("--out", default=str(DEFAULT_OUTPUT), help="output HTML file")
    parser.add_argument("--open", action="store_true", help="open the page in the browser")
    args = parser.parse_args()

    day = datetime.date.fromisoformat(args.date) if args.date else datetime.date.today()
    out = Path(args.out)
    out.write_text(build_page(day), encoding="utf-8")
    print(f"Wrote {out} for {day.isoformat()}")
    if args.open:
        os.startfile(out)  # noqa: S606 — Windows-only, intentional


if __name__ == "__main__":
    main()
