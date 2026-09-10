"""Generate the basic office — experimental. Two pages, morning and night.

The full morning office asks for twenty minutes and a settled hour. This is
the other thing a day sometimes needs: the shortest form that is still the
office and not merely a prayer said in passing, and now split across the two
ends of the day so that neither end is long.

Three sections are said at both: the Sign of the Cross to open, the closing
verses, and the Sign of the Cross again. Between them the morning has the
invocation of the Holy Spirit, the Our Father, the morning offering, a psalm
with its Glory be, and the doxology; the night has a Hail Mary and a chapter
of scripture with its Thanks be to God. The reader chooses only which morning
offering to say, as on the full page; there is nothing else to configure and
so no settings panel.

Two prayers are trimmed here from the form the full office gives them. The
invocation is the versicle and its response — Come, Holy Spirit; Send forth
Thy Spirit — without the collect that follows it there, a collect gathering a
longer office than this one has. The closing verses are cut the same way, to
the divine assistance alone: the prayer for the dead that follows it there is
a suffrage, and this office keeps none.

The psalm and the chapter are read straight through, whole, and each page
written moves its own track on by one — the morning from Psalm 1, the night
from Exodus 10. The two are counted separately, per folder, because they are
on separate pages now and nothing makes them keep step. Which step a page
took is recorded in the page itself, as the morning and night pages record
the readings they spent, so the record cannot drift from the pages it
describes. See bible_chapters.py for the tracks and the text.

Why this is its own file rather than a mode of generate_page: this office is
read in course and that one is not. Nothing here is drawn from readings.json,
steered by the calendar, or chosen at all — a page's content follows from its
place in the sequence and nothing else, which is a different kind of page.
The rendering helpers come from generate_page and the prayers from prayers.py
and night_prayers.py, so all the offices are set in the same type.

Usage:
    python generate_simple_page.py --days 2026-09-01:2026-09-30
    python generate_simple_page.py --nights 2026-09-01:2026-09-30
    python generate_simple_page.py --date 2026-12-25            # morning, standalone
    python generate_simple_page.py --date 2026-12-25 --night    # night, standalone
    python generate_simple_page.py --days ... --force           # rewrite, restarting
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime
import html
import os
import re
import sys
from pathlib import Path

import bible_chapters
import night_prayers
import prayers
from generate_page import render_optional, render_prayer, render_section

PROJECT_DIR = Path(__file__).parent
SIMPLE_DIR = PROJECT_DIR / "simple"

ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"]

# How many verses of prose go together before a new paragraph begins. A
# chapter of Exodus set as one block is a wall, and set a verse to a paragraph
# is a list; six is about a paragraph's worth of narrative.
VERSES_PER_PARAGRAPH = 6

# The morning page keeps the lights and the storage key of the full morning
# page, and the night page those of the full night office — black by default,
# so nothing glows at an eye that is meant to be closing. A reader who has
# settled on one of them is not asked again on arriving here.
#
# Single braces here, and doubled inside PAGE_TEMPLATE. These blocks are
# handed to str.format as arguments rather than being part of the format
# string, so format never looks at them and a doubled brace would go into the
# page as two. Doubling them is what broke every one of these rules once
# already: with no :root rule parsing, not one variable is defined and the
# page renders with no styling at all.
MORNING_THEME_CSS = """  :root, :root[data-theme="light"] {
    --ink: #2b2216;
    --accent: #7a1f1f;
    --paper: #faf6ee;
    --rule: #d8cdb8;
    --muted: #6b5d48;
    color-scheme: light;
  }
  :root[data-theme="paper"] {
    --ink: #3a2e1c;
    --accent: #7a1f1f;
    --paper: #f4e8d0;
    --rule: #d9c49c;
    --muted: #6f5f45;
    color-scheme: light;
  }
  :root[data-theme="dark"] {
    --ink: #e2dacb;
    --accent: #d19a9a;
    --paper: #16150f;
    --rule: #3a352b;
    --muted: #9a9080;
    color-scheme: dark;
  }"""

NIGHT_THEME_CSS = """  :root, :root[data-theme="black"] {
    --ink: #cfcfcf;
    --accent: #8e8e8e;
    --paper: #000000;
    --rule: #2a2a2a;
    --muted: #767676;
    color-scheme: dark;
  }
  :root[data-theme="grey"] {
    --ink: #e4e4e4;
    --accent: #a8a8a8;
    --paper: #2b2b2b;
    --rule: #484848;
    --muted: #9b9b9b;
    color-scheme: dark;
  }
  :root[data-theme="white"] {
    --ink: #1c1c1c;
    --accent: #5c5c5c;
    --paper: #ffffff;
    --rule: #d6d6d6;
    --muted: #6e6e6e;
    color-scheme: light;
  }"""


@dataclasses.dataclass(frozen=True)
class Office:
    """One end of the basic day, and what tells its page from the other's."""

    name: str
    folder: Path
    heading: str
    theme_css: str
    themes: tuple[str, ...]
    theme_key: str

    @property
    def default_theme(self) -> str:
        return self.themes[0]


MORNING = Office(
    name="morning",
    folder=SIMPLE_DIR / "days",
    heading="Morning Prayer",
    theme_css=MORNING_THEME_CSS,
    themes=("light", "paper", "dark"),
    theme_key="prayerTheme",
)

NIGHT = Office(
    name="night",
    folder=SIMPLE_DIR / "nights",
    heading="Night Prayer",
    theme_css=NIGHT_THEME_CSS,
    themes=("black", "grey", "white"),
    theme_key="nightPrayerTheme",
)

PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{heading} — {date_pretty}</title>
<style>
{theme_css}
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
  .red {{ color: var(--accent); }}
  .rubric {{ color: var(--accent); font-style: italic; font-size: 0.85rem; }}
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
  .pill-row {{ margin: 0.6rem 0 0.2rem; }}
  .pill-row .pill {{ margin-right: 0.4rem; margin-bottom: 0.3rem; }}
  blockquote {{
    margin: 1rem 0;
    padding: 0.2rem 0 0.2rem 1.2rem;
    border-left: 3px solid var(--rule);
  }}
  /* A psalm is set a verse to a line, the way it is sung; a chapter of the
     law is set as prose. Neither carries verse numbers: this page is for
     reading straight through, and the numbers are apparatus for finding a
     place, which nobody reading a chapter whole needs to do. */
  blockquote .line {{ margin: 0.35rem 0; }}
  .attribution {{
    text-align: right;
    font-style: normal;
    font-size: 0.9rem;
    color: var(--muted);
  }}
  .attribution .source {{ display: block; font-size: 0.8rem; }}
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
  .theme-toggle button.active {{ background: var(--accent); color: var(--paper); }}
</style>
<script>
  // Before the body paints, so a page that opens dark never flashes light.
  (function () {{
    var t = localStorage.getItem("{theme_key}");
    document.documentElement.setAttribute("data-theme", t || "{default_theme}");
  }})();
</script>
</head>
<body>
<div class="theme-toggle" role="group" aria-label="Theme">
{theme_buttons}
</div>
<main>
  <header>
    <div class="cross">&#10013;</div>
    <h1>{heading}</h1>
    <div class="date">{date_pretty}</div>
{neighbours}  </header>
{sections}
  <footer>&#10013;</footer>
</main>
<script>
  function setTheme(name) {{
    document.documentElement.setAttribute("data-theme", name);
    document.querySelectorAll(".theme-toggle button").forEach(function (btn) {{
      btn.classList.toggle("active", btn.dataset.themeValue === name);
    }});
    localStorage.setItem("{theme_key}", name);
  }}
  document.querySelectorAll(".theme-toggle button").forEach(function (btn) {{
    btn.addEventListener("click", function () {{ setTheme(this.dataset.themeValue); }});
  }});
  setTheme(localStorage.getItem("{theme_key}") || "{default_theme}");
{scripts}</script>
</body>
</html>
"""

# Only the morning page has anything to choose, so only it carries this.
OFFERING_SCRIPT = """
  // The morning offering, kept under the same key the full page uses, so a
  // reader who has chosen one there finds it chosen here.
  function setupToggleButtons(buttonClass, contentClass, storageKey) {
    function setActive(value) {
      document.querySelectorAll("." + contentClass).forEach(function (el) {
        el.style.display = el.dataset.toggleValue === value ? "" : "none";
      });
      document.querySelectorAll("." + buttonClass).forEach(function (btn) {
        btn.classList.toggle("active", btn.dataset.toggleValue === value);
      });
      localStorage.setItem(storageKey, value);
    }
    document.querySelectorAll("." + buttonClass).forEach(function (btn) {
      btn.addEventListener("click", function () { setActive(this.dataset.toggleValue); });
    });
    var first = document.querySelector("." + buttonClass);
    setActive(localStorage.getItem(storageKey) || (first ? first.dataset.toggleValue : ""));
  }

  setupToggleButtons("offering-btn", "offering", "morningOffering");
"""


def invocation_of_the_holy_spirit() -> list:
    """The invocation without the collect that follows it in the full office.

    Cut at the "Let us pray." rather than by taking a fixed number of
    paragraphs, so that the day the invocation gains or loses a versicle this
    still keeps the invocation and still drops the prayer.
    """
    kept = []
    for item in prayers.INVOCATION_OF_THE_HOLY_SPIRIT:
        if item == "Let us pray.":
            break
        kept.append(item)
    if not kept:
        raise LookupError("the invocation of the Holy Spirit begins with its collect")
    return kept


def lords_prayer() -> list:
    """The Our Father, and the Amen it takes when it is said alone.

    prayers.py withholds the Amen deliberately, because in the full office the
    embolism — Deliver us, we beseech Thee — follows the Our Father directly as
    it does at Mass, and the Amen answers the embolism instead. This page has
    no embolism, so the prayer ends where it ends and is answered.
    """
    return [prayers.LORDS_PRAYER, prayers.Response("Amen.")]


def hail_mary() -> list:
    """The Hail Mary in English, as the night office sets it.

    Kept as the versicle and response it is made into there — one voice greets
    Mary and the other asks her to pray, the Amen belonging to the half that
    asks — rather than written out again here, so that the offices cannot
    drift into saying it differently. The full night page carries it in four
    languages and offers the choice; this page has no choosing on it.
    """
    return night_prayers.HAIL_MARY["en"]


def closing_verses() -> list:
    """The closing verses without the prayer for the dead that follows them.

    Dropped by naming what is dropped rather than by taking the first item, so
    that reordering or adding to the closing verses still leaves these pages
    closing the way they mean to.
    """
    kept = [
        item
        for item in prayers.CLOSING_VERSES
        if not (isinstance(item, tuple) and item[0].startswith("Eternal rest"))
    ]
    if not kept:
        raise LookupError("the closing verses are nothing but the prayer for the dead")
    return kept


def render_chapter(chapter: dict, step: int, poetry: bool) -> str:
    """A whole chapter, its citation, and the step it came from.

    `poetry` sets a verse to a line, which is right for a psalm and wrong for
    a chapter of narrative. The step is written into the page so that the next
    page generated in that folder knows where its track had got to.
    """
    verses = [text for _, text in chapter["verses"]]
    if poetry:
        body = "\n".join(
            f'    <p class="line">{html.escape(text)}</p>' for text in verses
        )
    else:
        paragraphs = [
            verses[at : at + VERSES_PER_PARAGRAPH]
            for at in range(0, len(verses), VERSES_PER_PARAGRAPH)
        ]
        body = "\n".join(
            f"    <p>{html.escape(' '.join(group))}</p>" for group in paragraphs
        )
    # A chapter argument, where the edition prints one. This translation does
    # not, so nothing is printed and the reading simply begins.
    argument = chapter.get("summary", "")
    return (
        (f'  <p class="rubric">{html.escape(argument)}</p>\n' if argument else "")
        + f'  <blockquote data-step="{step}" data-chapter="{html.escape(chapter["citation"])}">\n'
        + body
        + "\n  </blockquote>\n"
        + f'  <p class="attribution">&mdash; {html.escape(chapter["citation"])}'
        + f'<span class="source">{html.escape(bible_chapters.SOURCE)}</span></p>'
    )


def render_neighbours(day: datetime.date) -> str:
    """Arrows to the day before and the day after, within the same office.

    Both are always written, whether or not those pages exist yet: the file
    name of a day is its date, so the link is knowable in advance, and a day
    generated later fills it in.
    """
    back = (day - datetime.timedelta(days=1)).isoformat()
    forward = (day + datetime.timedelta(days=1)).isoformat()
    return (
        "    <nav>\n"
        f'      <a href="{back}.html" rel="prev">&larr; Yesterday</a>\n'
        f'      <a href="{forward}.html" rel="next">Tomorrow &rarr;</a>\n'
        "    </nav>\n"
    )


def sections_for(office: Office, step: int) -> list[tuple[str, str, str]]:
    """The office in order: what both say, and what only this one says."""
    sign = render_prayer(prayers.SIGN_OF_THE_CROSS)
    sections = [("sign-open", "Sign of the Cross", sign)]

    if office is MORNING:
        psalm = bible_chapters.psalm_for(step)
        # The psalm carries its own Glory be, as a psalm of the office does:
        # it closes the psalm and is said at the end of it, so it goes inside
        # that section rather than standing as a section of its own. The full
        # night page sets its psalm the same way, for the same reason.
        psalm_body = (
            render_chapter(psalm, step, poetry=True)
            + "\n"
            + render_prayer(night_prayers.GLORIA_PATRI)
        )
        sections += [
            ("holy-spirit", "Invocation of the Holy Spirit",
             render_prayer(invocation_of_the_holy_spirit())),
            ("lords-prayer", "Our Father", render_prayer(lords_prayer())),
            ("offering", "Morning Offering",
             render_optional("offering", prayers.MORNING_OFFERINGS)),
            ("psalm", psalm["citation"], psalm_body),
            ("doxology", "Doxology", render_prayer(prayers.DOXOLOGY)),
        ]
    else:
        chapter = bible_chapters.chapter_for(step)
        # And the reading its Thanks be to God, for the same reason: the
        # response answers the lesson and is said at the end of it.
        reading_body = (
            render_chapter(chapter, step, poetry=False)
            + "\n"
            + render_prayer(prayers.THANKS_BE_TO_GOD)
        )
        sections += [
            ("hail-mary", "Hail Mary", render_prayer(hail_mary())),
            ("reading", f"Reading — {chapter['citation']}", reading_body),
        ]

    return sections + [
        ("closing-verses", "Closing Verses", render_prayer(closing_verses())),
        ("sign-close", "Sign of the Cross", sign),
    ]


def build_page(
    office: Office, day: datetime.date, step: int = 0, linked: bool = False
) -> str:
    rendered = [
        render_section(ROMAN[index], title, body, section_id=section_id)
        for index, (section_id, title, body) in enumerate(sections_for(office, step))
    ]
    buttons = "\n".join(
        f'  <button type="button" data-theme-value="{name}">{name.title()}</button>'
        for name in office.themes
    )
    return PAGE_TEMPLATE.format(
        heading=office.heading,
        date_pretty=day.strftime("%A, %B %d, %Y").replace(" 0", " "),
        theme_css=office.theme_css,
        theme_buttons=buttons,
        theme_key=office.theme_key,
        default_theme=office.default_theme,
        neighbours=render_neighbours(day) if linked else "",
        sections="\n".join(rendered),
        scripts=OFFERING_SCRIPT if office is MORNING else "",
    )


_STEP = re.compile(r'data-step="(\d+)"')


def steps_in(page: str) -> list[int]:
    return [int(found) for found in _STEP.findall(page)]


def next_step(office: Office) -> int:
    """One past the furthest this office's track has got in its folder.

    Read off the pages rather than kept in a counter file, so that deleting a
    page winds the track back and the folder is always the whole record of
    where the reading has reached. Each office counts its own folder, so the
    morning is not moved on by a night.
    """
    highest = -1
    if office.folder.is_dir():
        for page in office.folder.glob("*.html"):
            highest = max([highest, *steps_in(page.read_text(encoding="utf-8"))])
    return highest + 1


def generate(office: Office, start: datetime.date, end: datetime.date) -> None:
    """Write a page per day into this office's folder, reading on in course.

    Pages already there are left alone and keep the step they were written
    with — that is what "in course" means, and rewriting a page would deal a
    different chapter into an hour already prayed. A page left alone still
    moves the track on, so the next page written follows the chapter the
    reader last saw rather than repeating it.
    """
    office.folder.mkdir(parents=True, exist_ok=True)
    step = next_step(office)
    print(f"the {office.name} track stands at step {step}")

    written = skipped = 0
    day = start
    while day <= end:
        out = office.folder / f"{day.isoformat()}.html"
        if out.exists():
            # Its own step may be ahead of the counter if the folder was
            # written out of order.
            step = max([step, *(found + 1 for found in steps_in(out.read_text(encoding="utf-8")))])
            skipped += 1
        else:
            out.write_text(build_page(office, day, step=step, linked=True), encoding="utf-8")
            step += 1
            written += 1
        day += datetime.timedelta(days=1)

    print(f"wrote {written} pages, left {skipped} existing pages alone")
    if written:
        last = (
            bible_chapters.psalm_at(step - 1)
            if office is MORNING
            else bible_chapters.chapter_at(step - 1)
        )
        print(f"the last page written read {bible_chapters.citation(*last)}")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", help="YYYY-MM-DD (default: today)")
    parser.add_argument("--out", help="output HTML file, for a standalone page")
    parser.add_argument("--open", action="store_true", help="open the page in the browser")
    parser.add_argument("--night", action="store_true", help="with --date, the night office")
    parser.add_argument("--step", type=int, help="read a particular step of the track")
    parser.add_argument("--days", metavar="START:END", help="write mornings into simple/days/")
    parser.add_argument("--nights", metavar="START:END", help="write nights into simple/nights/")
    parser.add_argument(
        "--force", action="store_true", help="with --days or --nights, overwrite existing pages"
    )
    args = parser.parse_args()

    runs = [(MORNING, args.days), (NIGHT, args.nights)]
    if any(span for _, span in runs):
        for office, span in runs:
            if not span:
                continue
            start, _, end = span.partition(":")
            first = datetime.date.fromisoformat(start)
            last = datetime.date.fromisoformat(end) if end else first
            if args.force:
                for ordinal in range(first.toordinal(), last.toordinal() + 1):
                    (office.folder / f"{datetime.date.fromordinal(ordinal)}.html").unlink(missing_ok=True)
            generate(office, first, last)
        return

    office = NIGHT if args.night else MORNING
    day = datetime.date.fromisoformat(args.date) if args.date else datetime.date.today()
    out = Path(args.out) if args.out else PROJECT_DIR / f"simple_{office.name}.html"
    step = args.step if args.step is not None else next_step(office)
    out.write_text(build_page(office, day, step=step), encoding="utf-8")
    print(f"Wrote {out} for {day.isoformat()}, {office.name} step {step}")
    if args.open:
        os.startfile(out)  # noqa: S606 — Windows-only, intentional


if __name__ == "__main__":
    main()
