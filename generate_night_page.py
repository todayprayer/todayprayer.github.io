"""Generate the daily night prayer web page.

A separate office from the morning one and a separate page: Sign of the Cross,
the Jesus Prayer, a Hail Mary, a psalm with its Glory be — one of the Psalms
of Solomon, one of the Odes, or one of the singing scrolls from Qumran — a
reading from the wisdom and deuterocanonical books with its Thanks be to God,
a reading from the apocrypha, silent mental prayer, and the Sign of the Cross
again. Eight
sections, always the same eight, in that order — there is nothing to
configure, and so no settings panel.

The rendering helpers come from generate_page, and the prayer paragraph kinds
from prayers.py, so the two offices are set in the same type. What differs is
the light: this page is black by default, with dark grey and white to hand.

Everything chosen — the psalm and the two readings — is decided by the date, so
regenerating a night on the same day yields the same page. Readings already
prayed by a page in nights/ are not offered again.

Usage:
    python generate_night_page.py                       # tonight -> night_prayer.html
    python generate_night_page.py --date 2026-12-24     # a particular night
    python generate_night_page.py --open                # generate, then open it
    python generate_night_page.py --nights 2026-09-01:2026-09-30
"""

from __future__ import annotations

import argparse
import collections
import dataclasses
import datetime
import html
import json
import math
import os
import random
import re
import sys
from pathlib import Path

import night_prayers
import prayers
from book_excerpts import reading_key
from generate_page import render_prayer, render_section

PROJECT_DIR = Path(__file__).parent
NIGHT_READINGS_FILE = PROJECT_DIR / "night_readings.json"
DEFAULT_OUTPUT = PROJECT_DIR / "night_prayer.html"
NIGHTS_DIR = PROJECT_DIR / "nights"

ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"]

PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Night Prayer — {date_pretty}</title>
<style>
  /* Three lights only, and black is the one the page opens in. The accent is
     not a colour but a lift in the grey, so nothing on the page glows at an
     eye that is meant to be closing. */
  :root, :root[data-theme="black"] {{
    --ink: #cfcfcf;
    --accent: #8e8e8e;
    --paper: #000000;
    --rule: #2a2a2a;
    --muted: #767676;
    color-scheme: dark;
  }}
  :root[data-theme="grey"] {{
    --ink: #e4e4e4;
    --accent: #a8a8a8;
    --paper: #2b2b2b;
    --rule: #484848;
    --muted: #9b9b9b;
    color-scheme: dark;
  }}
  :root[data-theme="white"] {{
    --ink: #1c1c1c;
    --accent: #5c5c5c;
    --paper: #ffffff;
    --rule: #d6d6d6;
    --muted: #6e6e6e;
    color-scheme: light;
  }}
  body {{
    background: var(--paper);
    color: var(--ink);
    font-family: Georgia, "Times New Roman", serif;
    line-height: 1.7;
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
  /* The nights are a series, and a page of a series should say which way is
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
  section {{ margin: 2.4rem 0; }}
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
  .lang-row {{ margin: 0.7rem 0 0.2rem; }}
  .pill {{
    font-family: inherit;
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    background: none;
    border: 1px solid var(--rule);
    border-radius: 1rem;
    color: var(--muted);
    padding: 0.12rem 0.7rem;
    margin: 0 0.35rem 0.3rem 0;
    cursor: pointer;
  }}
  .pill.active {{ border-color: var(--accent); color: var(--ink); }}
  blockquote {{
    margin: 1rem 0;
    padding: 0.2rem 0 0.2rem 1.2rem;
    border-left: 3px solid var(--rule);
  }}
  /* Verse keeps its own lining: one line to a line, wrapping hangs, and a
     line the edition sets further in is set further in here too. */
  blockquote .line {{
    padding-left: 1.3rem;
    text-indent: -1.3rem;
    line-height: 1.55;
  }}
  blockquote .line.indent {{ padding-left: 3rem; }}
  .attribution {{
    text-align: right;
    font-size: 0.9rem;
    color: var(--muted);
  }}
  .attribution .source {{ display: block; font-size: 0.8rem; font-style: italic; }}
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
  // Before the body paints, so the page never flashes white at a dark-adapted
  // eye. Its own key, so choosing black here does not darken the morning.
  (function () {{
    var t = localStorage.getItem("nightPrayerTheme");
    document.documentElement.setAttribute("data-theme", t || "black");
  }})();
</script>
</head>
<body>
<div class="theme-toggle" role="group" aria-label="Theme">
  <button type="button" data-theme-value="black">Black</button>
  <button type="button" data-theme-value="grey">Grey</button>
  <button type="button" data-theme-value="white">White</button>
</div>
<main>
  <header>
    <div class="cross">&#10013;</div>
    <h1>Night Prayer</h1>
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
    localStorage.setItem("nightPrayerTheme", name);
  }}
  document.querySelectorAll(".theme-toggle button").forEach(function (btn) {{
    btn.addEventListener("click", function () {{ setTheme(this.dataset.themeValue); }});
  }});
  setTheme(localStorage.getItem("nightPrayerTheme") || "black");

  // Each prayer keeps its own language, so the Jesus Prayer can be prayed in
  // Greek while the reading around it stays in English. The two Signs of the
  // Cross share a group and so switch together.
  function setLang(group, code) {{
    var chosen = null;
    document.querySelectorAll('.lang[data-lang-group="' + group + '"]').forEach(function (el) {{
      var match = el.dataset.lang === code;
      el.hidden = !match;
      if (match) {{ chosen = code; }}
    }});
    // A language the page does not carry — a stored choice from a day when it
    // did, or a hand-edited key — leaves nothing showing. Fall back.
    if (!chosen) {{
      var first = document.querySelector('.lang[data-lang-group="' + group + '"]');
      if (!first) {{ return; }}
      code = first.dataset.lang;
      first.hidden = false;
    }}
    document.querySelectorAll('.lang-row[data-lang-group="' + group + '"] .pill').forEach(function (b) {{
      b.classList.toggle("active", b.dataset.lang === code);
    }});
    localStorage.setItem("nightPrayerLang:" + group, code);
  }}

  document.querySelectorAll(".lang-row").forEach(function (row) {{
    var group = row.dataset.langGroup;
    row.querySelectorAll(".pill").forEach(function (btn) {{
      btn.addEventListener("click", function () {{ setLang(group, this.dataset.lang); }});
    }});
    setLang(group, localStorage.getItem("nightPrayerLang:" + group) || "en");
  }});
</script>
</body>
</html>
"""


def load_pools() -> dict[str, list[dict]]:
    if not NIGHT_READINGS_FILE.exists():
        raise SystemExit(
            f"{NIGHT_READINGS_FILE.name} is missing — run: python night_sources.py --build"
        )
    return json.loads(NIGHT_READINGS_FILE.read_text(encoding="utf-8"))


def render_multilingual(prayer: dict[str, list], group: str) -> str:
    """One prayer in every language it has, with the buttons that choose.

    All the languages are written into the page and all but one are hidden, so
    that switching is instant and the page still reads with scripting off —
    the same bargain the morning page makes with its sections.

    `group` is the prayer rather than the section, so that the two Signs of
    the Cross, which are the same prayer at either end of the office, switch
    together and are not set to different languages by accident.
    """
    codes = [code for code, _ in night_prayers.LANGUAGES if code in prayer]
    buttons = "\n".join(
        f'    <button type="button" class="pill" data-lang="{code}">{html.escape(name)}</button>'
        for code, name in night_prayers.LANGUAGES
        if code in prayer
    )
    blocks = []
    for code in codes:
        # The Greek and the Hebrew are transliterated into this alphabet, so
        # every block reads left to right and needs no direction of its own.
        hidden = "" if code == codes[0] else " hidden"
        blocks.append(
            f'  <div class="lang" data-lang-group="{group}" data-lang="{code}"{hidden}>\n'
            f"{render_prayer(prayer[code])}\n  </div>"
        )
    return (
        f'  <div class="lang-row" data-lang-group="{group}">\n{buttons}\n  </div>\n'
        + "\n".join(blocks)
    )


def render_reading(reading: dict) -> str:
    """A reading, its citation, and the record that this page spent it.

    The key is written into the page rather than kept in a side file, for the
    same reason the morning page does it: the record cannot then drift from
    the pages it describes.
    """
    blocks = []
    for paragraph in reading["text"].split("\n\n"):
        lines = paragraph.split("\n")
        if len(lines) == 1:
            blocks.append(f"    <p>{html.escape(lines[0])}</p>")
            continue
        # Verse. A leading tab is the source's own further indentation.
        blocks.append(
            "\n".join(
                f'    <p class="line{" indent" if line.startswith(chr(9)) else ""}">'
                f"{html.escape(line.lstrip(chr(9)))}</p>"
                for line in lines
            )
        )
    # The argument the reading's own edition prints at the head of the chapter,
    # saying in a line what is coming. Not every edition prints one, and where
    # none does the reading simply begins.
    argument = reading.get("summary", "")
    return (
        (f'  <p class="rubric">{html.escape(argument)}</p>\n' if argument else "")
        + f'  <blockquote data-reading="{reading_key(reading["text"])}">\n'
        + "\n".join(blocks)
        + "\n  </blockquote>\n"
        + '  <p class="attribution">&mdash; '
        + html.escape(reading["citation"])
        + f'<span class="source">{html.escape(reading["source"])}</span></p>'
    )


_READING_KEY = re.compile(r'<blockquote data-reading="([0-9a-f]+)">')


def used_readings(nights_dir: Path = NIGHTS_DIR) -> collections.Counter:
    """How many times each reading has been prayed by a page in the folder.

    Counted rather than merely marked, because the psalms are few enough to
    come round again: seventy of them against a pool of readings in the
    thousands. Once every psalm has been said, "not yet used" stops telling
    the psalm apart from any other, and the count is what keeps the psalter
    turning evenly instead of dealing at random from the whole eighteen.
    """
    used: collections.Counter = collections.Counter()
    if not nights_dir.is_dir():
        return used
    for page in sorted(nights_dir.glob("*.html")):
        used.update(_READING_KEY.findall(page.read_text(encoding="utf-8")))
    return used


# How likely a reading is to stay with the book it read from last night, by
# how many nights it has been in that book already. It falls away, and faster
# the longer the run has gone on, so that a book with two hundred readings in
# it cannot hold the slot for a month. After the last figure the run always
# ends: the chance is too small by then to be worth rolling for.
#
#   after 1 night  2     3     4     5     6     7
STAY_WITH_BOOK = (0.85, 0.80, 0.75, 0.65, 0.50, 0.30, 0.10)

# The first reading is scripture, and scripture is read straight through
# rather than dipped into: the night after one is opened is certain to go on
# with it, and each night after that is five points less likely than the last.
# So a book keeps the slot for ten nights on the average and is finished more
# often than it is abandoned, while the schedule still runs out — at twenty
# nights the chance is nil and the run ends whatever the roll.
#
#   after 1 night  2     3          ...        19    20
STAY_WITH_BOOK_FIRST = tuple(round(1.0 - 0.05 * n, 2) for n in range(20))

# Which schedule a slot follows. Anything not named here keeps the general one.
SCHEDULES = {"first": STAY_WITH_BOOK_FIRST}

# How far back the page has to look to know how long a run has been going.
HISTORY = max(len(s) for s in (STAY_WITH_BOOK, *SCHEDULES.values())) + 1

# Which of a page's three readings is which. They are written in this order.
SLOTS = ("psalm", "first", "second")


@dataclasses.dataclass(frozen=True)
class Appointment:
    """The reading a slot is to take on one day of the year.

    Named by its citation and not by its book, because a feast wants a
    particular passage and not whatever of the book is next. The day is kept
    as month and day, so it comes round every year rather than being spent on
    one.
    """

    slot: str
    citation: str
    when: tuple[int, int]
    why: str


# The night office has no calendar in it. Which psalm and which readings a
# night gets is a draw, and a feast changes nothing -- the morning office is
# where the day's own saints and their own books belong. This is the one
# exception to that, and it is kept as small as it can be: a proper of the
# saints one line long, for a feast that cannot be kept without its lesson.
#
# Raphael is one of the three angels the Church names, and Tobias is the one
# book of scripture that tells of him -- 1 Enoch, in the second pool here,
# lists him among the archangels and says nothing more. He walks the length
# of Tobias under a human name, Azarias, and says who he is only at 12:15:
# "For I am the angel Raphael, one of the seven, who stand before the Lord."
# That passage is the lesson of his feast, so the night of the 24th of
# October reads it and the rest of the book is left to the draw.
#
# Taken whether or not it has been read before, which is the one place this
# office repeats a reading on purpose. A proper lesson comes round every year
# -- that is what makes it proper -- and one night a year is no dent in a pool
# of two thousand.
APPOINTMENTS = (
    Appointment(
        slot="first",
        citation="Tobias 12:10–22",
        when=(10, 24),
        why="Saint Raphael the Archangel, who names himself in it",
    ),
)


def by_key(pools: dict[str, list[dict]]) -> dict[str, dict]:
    """Every reading in the pools, found by the key its page records it under."""
    return {reading_key(r["text"]): r for pool in pools.values() for r in pool}


def readings_of(page: str, by_key: dict[str, dict]) -> dict[str, dict]:
    """The psalm and the two readings a page prayed, looked up in the pools."""
    keys = _READING_KEY.findall(page)
    return {slot: by_key[key] for slot, key in zip(SLOTS, keys) if key in by_key}


def recent_nights(
    day: datetime.date, nights_dir: Path, by_key: dict[str, dict], count: int = HISTORY
) -> list[dict]:
    """The nights before this one, newest first.

    Read off the pages themselves, as the spent-reading record is: the folder
    is the only account of what has been prayed, and a night generated on its
    own has to be able to pick up where the night before it left off. More
    than one night, because how likely a book is to be read again depends on
    how many nights it has already had.
    """
    if not nights_dir.is_dir():
        return []
    earlier = sorted(
        page for page in nights_dir.glob("*.html") if page.stem < day.isoformat()
    )
    return [
        readings_of(page.read_text(encoding="utf-8"), by_key)
        for page in reversed(earlier[-count:])
    ]


def run_length(recent: list[dict], slot: str, title: str) -> int:
    """How many nights running this slot has been reading that book."""
    nights = 0
    for night in recent:
        if night.get(slot, {}).get("title") != title:
            break
        nights += 1
    return nights


def appointed(day: datetime.date, slot: str) -> str:
    """The reading the calendar appoints to this slot tonight, if any.

    Its citation, or the empty string, which is what almost every night of
    the year gets: see APPOINTMENTS.
    """
    for item in APPOINTMENTS:
        if item.slot == slot and item.when == (day.month, day.day):
            return item.citation
    return ""


def psalm_for(
    day: datetime.date,
    pools: dict[str, list[dict]],
    spent: collections.Counter,
    recent: list[dict] | None = None,
) -> dict:
    """The psalm, entered at its beginning and finished before another starts.

    Four of the eighteen Psalms of Solomon are long enough to be cut in two or
    in four. A psalm is a whole thing, so those parts are not scattered: the
    night that begins one begins it at the first part, and the nights after it
    say the rest in order before any other psalm is opened.

    The pool holds more than the Psalms of Solomon — the Odes and the three
    singing scrolls from Qumran are in it too — but they are all drawn the
    same way, and none of them is entered anywhere but at its beginning.
    """
    psalms = pools["psalms"]
    last = (recent[0] if recent else {}).get("psalm")
    if last is not None and last["part"] < last["parts"]:
        # Last night left a psalm unfinished. The rest of it comes next, and
        # nothing else does.
        index = next(
            i for i, p in enumerate(psalms) if reading_key(p["text"]) == reading_key(last["text"])
        )
        return psalms[index + 1]

    # Among the psalms said least often, so that the psalter turns over evenly
    # and goes round again when it has been all the way through.
    openings = [p for p in psalms if p["part"] == 1]
    fewest = min(spent[reading_key(p["text"])] for p in openings)
    due = [p for p in openings if spent[reading_key(p["text"])] == fewest]
    return random.Random(day.toordinal() * 1000).choice(due)


def reading_for(
    day: datetime.date,
    pools: dict[str, list[dict]],
    pool: str,
    spent: collections.Counter,
    salt: int,
    recent: list[dict] | None = None,
    slot: str = "",
) -> dict:
    """One reading from a pool, avoiding what has already been prayed.

    A book is read through rather than dipped into. Whichever book a night
    opens, it takes that book's earliest unread passage; the night after is
    likely to stay with it, and so works through it in order. That likelihood
    falls the longer the run lasts — see SCHEDULES — because otherwise a book
    holding a fifth of the pool would keep the slot for a month at a time. The
    first reading, being scripture, falls far more slowly than the second.
    When a book runs out, another is opened whatever the roll.

    Which book that is comes of a weighted draw, because the books are wildly
    unequal: Jubilees is near a fifth of the second pool and Ecclesiasticus
    and the Machabees between them a third of the first. Weighting each book
    by the square root of what it has left keeps a long book commoner than a
    short one without letting it take over, and still spends the long books
    faster, so nothing is left unread at the end.

    Spent readings stay in reserve rather than raising: when the pool is
    finally exhausted, a repeat beats a blank page.

    Before any of that, a reading the calendar has appointed to the night
    takes the slot outright -- see APPOINTMENTS, which is the only place this
    office looks at the date for anything but a seed.
    """
    entries = pools[pool]

    # A reading the calendar has appointed to tonight comes before everything
    # below: before the carry, before the draw, and before any roll is made,
    # so that the nights without an appointment see the same stream of chance
    # they would have seen without this. Looked up in the whole pool rather
    # than in what is unread, because the passage is the point of the night
    # and a feast does not take second best.
    wanted = appointed(day, slot)
    if wanted:
        for reading in entries:
            if reading["citation"] == wanted:
                return reading
        raise LookupError(
            f"APPOINTMENTS asks the {slot} slot for {wanted!r}, which is not "
            f"a reading in the {pool} pool"
        )

    fresh = [r for r in entries if reading_key(r["text"]) not in spent] or entries

    by_book: dict[str, list[dict]] = {}
    for reading in fresh:
        by_book.setdefault(reading["title"], []).append(reading)

    rng = random.Random(day.toordinal() * 1000 + salt)
    recent = recent or []
    carried = (recent[0] if recent else {}).get(slot, {}).get("title")

    # Staying is the common case, so it is rolled first and the draw below
    # only happens when the roll fails or the book has nothing left. A run
    # longer than the slot's schedule has figures for always ends.
    if carried in by_book:
        schedule = SCHEDULES.get(slot, STAY_WITH_BOOK)
        nights = run_length(recent, slot, carried)
        chance = schedule[nights - 1] if nights <= len(schedule) else 0.0
        if rng.random() < chance:
            return by_book[carried][0]

    titles = sorted(t for t in by_book if t != carried) or sorted(by_book)
    weights = [math.sqrt(len(by_book[title])) for title in titles]
    return by_book[rng.choices(titles, weights=weights, k=1)[0]][0]


def render_neighbours(day: datetime.date) -> str:
    """Arrows to the night before and the night after.

    Both are always written, whether or not those pages exist yet: the file
    name of a night is its date, so the link is knowable in advance, and a
    night generated later fills it in. Only pages living in the nights folder
    get these — the standalone night_prayer.html has no neighbours.
    """
    back = (day - datetime.timedelta(days=1)).isoformat()
    forward = (day + datetime.timedelta(days=1)).isoformat()
    return (
        "    <nav>\n"
        f'      <a href="{back}.html" rel="prev">&larr; Last night</a>\n'
        f'      <a href="{forward}.html" rel="next">Tomorrow &rarr;</a>\n'
        "    </nav>\n"
    )


def build_page(
    day: datetime.date,
    exclude_keys: set[str] | None = None,
    recent: list[dict] | None = None,
    nights_dir: Path = NIGHTS_DIR,
    linked: bool = False,
) -> str:
    pools = load_pools()
    spent = collections.Counter(exclude_keys or {})

    # What last night prayed, which decides whether a psalm is still unfinished
    # and which book each reading is working through. Looked up from the folder
    # when it is not handed in, so that a single night generated on its own
    # carries on from the night before it.
    if recent is None:
        recent = recent_nights(day, nights_dir, by_key(pools))

    psalm = psalm_for(day, pools, spent, recent)
    first = reading_for(day, pools, "first", spent, salt=1, recent=recent, slot="first")
    spent.update([reading_key(first["text"])])
    second = reading_for(day, pools, "second", spent, salt=2, recent=recent, slot="second")

    # The psalm carries its own doxology, as a psalm of the office does: the
    # Glory be belongs to the psalm and is said at the end of it, so it goes
    # inside that section rather than standing as a section of its own.
    psalm_body = render_reading(psalm) + "\n" + render_prayer(night_prayers.GLORIA_PATRI)

    # The Deo gratias goes to the first reading and not the second, because
    # the first is scripture and the second is not. The first pool is the
    # wisdom and deuterocanonical books; the second is Enoch, Jubilees, the
    # Odes, the scrolls — worth reading and not the canon, and answering them
    # as though they had been read as a lesson from the Bible would say
    # something about them that this page does not mean to say.
    first_body = render_reading(first) + "\n" + render_prayer(prayers.THANKS_BE_TO_GOD)

    sign = render_multilingual(night_prayers.SIGN_OF_THE_CROSS, "sign")
    sections = [
        ("sign-open", "Sign of the Cross", sign),
        ("jesus-prayer", "The Jesus Prayer",
         render_multilingual(night_prayers.JESUS_PRAYER, "jesus")),
        ("hail-mary", "Hail Mary",
         render_multilingual(night_prayers.HAIL_MARY, "hail-mary")),
        ("psalm", f"Psalm — {psalm['citation']}", psalm_body),
        ("reading-wisdom", f"First Reading — {first['citation']}", first_body),
        ("reading-apocrypha", f"Second Reading — {second['citation']}", render_reading(second)),
        ("mental-prayer", "Greater Doxology",
         render_multilingual(night_prayers.GREATER_DOXOLOGY, "doxology")),
        ("sign-close", "Sign of the Cross", sign),
    ]

    rendered = [
        render_section(ROMAN[index], title, body, section_id=section_id)
        for index, (section_id, title, body) in enumerate(sections)
    ]
    return PAGE_TEMPLATE.format(
        date_pretty=day.strftime("%A, %B %d, %Y").replace(" 0", " "),
        neighbours=render_neighbours(day) if linked else "",
        sections="\n".join(rendered),
    )


# The end of the first reading's section: its attribution line, and the
# closing tag the response has to go in front of.
_END_OF_FIRST_READING = re.compile(
    rb'(<section data-section="reading-wisdom">.*?</p>)(\r?\n  </section>)',
    re.S,
)
_DEO_GRATIAS = b'\r\n  <div class="vr"><div class="r">Thanks be to God.</div></div>'


def answer_readings(nights_dir: Path = NIGHTS_DIR) -> int:
    """Give the Deo gratias to every page in the folder that has none.

    The nights already in the folder have been prayed, and rebuilding one
    would deal it a different psalm and different readings. So the markup
    alone is patched and the office below it is not touched — the same thing
    link_neighbours does for a day page written before the arrows existed.

    Byte-level, because these pages are CRLF throughout and a read that
    normalises the line endings followed by a write that restores them is one
    accident away from rewriting all four hundred lines of a page to change
    one of them.
    """
    answered = 0
    for page in sorted(nights_dir.glob("*.html")):
        before = page.read_bytes()
        if b"Thanks be to God" in before:
            continue
        after, count = _END_OF_FIRST_READING.subn(
            lambda m: m.group(1) + _DEO_GRATIAS + m.group(2), before, count=1
        )
        if not count:
            raise LookupError(f"{page.name}: no first reading to answer")
        page.write_bytes(after)
        answered += 1
    return answered


def generate_nights(start: datetime.date, end: datetime.date, nights_dir: Path = NIGHTS_DIR) -> None:
    """Write a page per night into the nights folder, never repeating a reading.

    Pages already in the folder are read first, so a new run continues where
    the last left off, and are then left alone: regenerating them would change
    what has already been prayed.
    """
    nights_dir.mkdir(exist_ok=True)
    spent = used_readings(nights_dir)
    print(f"{len(spent)} readings already spent by {len(list(nights_dir.glob('*.html')))} pages")

    index = by_key(load_pools())
    # The night before the run started, so that the first page of the run
    # continues an unfinished psalm and stays with the books already open.
    recent = recent_nights(start, nights_dir, index)

    written = skipped = 0
    day = start
    while day <= end:
        out = nights_dir / f"{day.isoformat()}.html"
        if out.exists():
            page = out.read_text(encoding="utf-8")
            skipped += 1
        else:
            page = build_page(day, exclude_keys=spent, recent=recent, linked=True)
            out.write_text(page, encoding="utf-8")
            spent.update(_READING_KEY.findall(page))
            written += 1
        # A page left alone is still what the next night follows on from.
        recent = [readings_of(page, index), *recent][:HISTORY]
        day += datetime.timedelta(days=1)

    print(f"wrote {written} pages, left {skipped} existing pages alone")
    print(f"{len(spent)} readings spent in total")
    print(f"answered the first reading on {answer_readings(nights_dir)} pages that had no response")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", help="YYYY-MM-DD (default: today)")
    parser.add_argument("--out", default=str(DEFAULT_OUTPUT), help="output HTML file")
    parser.add_argument("--open", action="store_true", help="open the page in the browser")
    parser.add_argument(
        "--nights",
        metavar="START:END",
        help="write a page per night into nights/, skipping readings already used there",
    )
    parser.add_argument(
        "--force", action="store_true", help="with --nights, overwrite existing pages"
    )
    args = parser.parse_args()

    if args.nights:
        start, _, end = args.nights.partition(":")
        first = datetime.date.fromisoformat(start)
        last = datetime.date.fromisoformat(end) if end else first
        if args.force:
            for ordinal in range(first.toordinal(), last.toordinal() + 1):
                (NIGHTS_DIR / f"{datetime.date.fromordinal(ordinal)}.html").unlink(missing_ok=True)
        generate_nights(first, last)
        return

    day = datetime.date.fromisoformat(args.date) if args.date else datetime.date.today()
    out = Path(args.out)
    out.write_text(build_page(day, exclude_keys=used_readings()), encoding="utf-8")
    print(f"Wrote {out} for {day.isoformat()}")
    if args.open:
        os.startfile(out)  # noqa: S606 — Windows-only, intentional


if __name__ == "__main__":
    main()
