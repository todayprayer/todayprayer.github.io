"""Export what the browser needs to build a day page itself.

404.html can generate a missing day on the client, and to do that faithfully
it has to produce the same page generate_page.py would. That is a high bar:
the same readings, the same saints, the same numerals, the same bytes. Rather
than transcribe prayers.py and calendar_1962.py into JavaScript — two copies
of the same texts, free to drift apart — everything that does not depend on
chance is rendered here, by the real renderers, and shipped as data.

So the browser is handed:

  - the page shell, already formatted, with four sentinels left in it;
  - every section whose body is the same on every day, already rendered;
  - the saints' rotation, each line already rendered, to be indexed by date;
  - the sayings of Saint Carlo Acutis, each already rendered, to be stepped
    through by date;
  - per date: the verse of the day, the holiday hymn if there is one, and the
    feast's topics and rank, which is all the calendar the browser needs;
  - the keys of every reading the pages in days/ have already spent.

What is left for the browser is the part that is actually an algorithm: the
weighted draw from readings.json under a seeded Mersenne Twister, and the
assembly. That is ported in office.js and checked against this file's output.

Usage:
    python export_office_data.py                 # writes office_data.json
    python export_office_data.py --years 8
"""

from __future__ import annotations

import argparse
import datetime
import json
import sys
from pathlib import Path

import calendar_1962
import holidays_us
import night_prayers
import prayers
from generate_page import (
    DAYS_DIR,
    PAGE_TEMPLATE,
    RANK_STEER,
    SETTINGS_CSS,
    SETTINGS_JS,
    SETTINGS_UI,
    render_lang_prayer,
    render_optional,
    render_prayer,
    used_readings,
)

PROJECT_DIR = Path(__file__).parent
OUT_FILE = PROJECT_DIR / "office_data.json"
NIGHT_OUT_FILE = PROJECT_DIR / "night_data.json"

# The sentinels the browser fills in. Chosen so that nothing in the prayers,
# the CSS or the script can contain them.
DATE = "@@DATE_PRETTY@@"
NAV = "@@NEIGHBOURS@@"
SECTIONS = "@@SECTIONS@@"
META = "@@SECTION_META@@"

LANG_BUTTON = (
    ' <button type="button" id="lang-btn" name="lang-btn" class="pill"'
    ' data-next="latin">Latin</button>'
)


def shell() -> str:
    """The whole page but for the four things that change."""
    return PAGE_TEMPLATE.format(
        date_pretty=DATE,
        neighbours=NAV,
        sections=SECTIONS,
        settings_css=SETTINGS_CSS,
        settings_ui=SETTINGS_UI,
        settings_js=SETTINGS_JS,
        section_meta=META,
    )


def fixed_sections() -> dict[str, str]:
    """Every section body that is the same whatever the day.

    Rendered by generate_page's own renderers, so the browser never has to
    know what a Bilingual or a Stanza or an Antiphon is.
    """
    return {
        "sign-open": render_prayer(prayers.SIGN_OF_THE_CROSS),
        "holy-spirit": render_prayer(prayers.INVOCATION_OF_THE_HOLY_SPIRIT),
        "creed": render_lang_prayer(prayers.TRIDENTINE_CREED),
        "acts": render_prayer(prayers.ACTS),
        "contrition": render_optional("contrition", prayers.ACT_OF_CONTRITION),
        "lords-prayer": render_prayer(prayers.KYRIE_AND_LORDS_PRAYER),
        "offering": render_optional("offering", prayers.MORNING_OFFERINGS),
        "suffrage": render_prayer(prayers.SUFFRAGE),
        "closing-prayer": render_prayer(prayers.CLOSING_PRAYER),
        "doxology": render_prayer(prayers.DOXOLOGY),
        "pledge": render_prayer(prayers.PLEDGE_OF_ALLEGIANCE),
        "closing-verses": render_prayer(prayers.CLOSING_VERSES),
        "sign-close": render_prayer(prayers.SIGN_OF_THE_CROSS),
    }


def saints() -> dict:
    """The invocation of the saints, in three pieces.

    The fixed head and tail are rendered whole. The rotation is rendered a
    line at a time, so that picking the day's two saints is an index and not
    a rendering job.
    """
    return {
        "prefix": render_prayer(prayers.KYRIE + prayers.INVOCATION_OF_THE_SAINTS_FIXED),
        "suffix": render_prayer(prayers.INVOCATION_OF_THE_SAINTS_CLOSE),
        "rotation": [
            render_prayer([(f"{name},", "pray for us.")])
            for name in prayers.SAINTS_ROTATION
        ],
    }


def verse_bodies(days: list[datetime.date]) -> tuple[list[str], dict[str, int]]:
    """The verse-of-the-day section body for each day, de-duplicated.

    Most days share a body — the feria rotation is twenty-odd verses and a
    feast repeats every year — so the bodies are pooled and each date keeps
    an index into the pool. Whole and rendered either way: the browser does
    not need feast_for at all.
    """
    pool: list[str] = []
    index: dict[str, int] = {}
    seen: dict[str, int] = {}
    for day in days:
        body = render_prayer(
            [prayers.Rubric(f.name), f.verse]
            if (f := calendar_1962.feast_for(day))
            else [prayers.CLOSING_VERSES_FOR_THE_DAY[
                day.toordinal() % len(prayers.CLOSING_VERSES_FOR_THE_DAY)
            ]]
        )
        if body not in seen:
            seen[body] = len(pool)
            pool.append(body)
        index[day.isoformat()] = seen[body]
    return pool, index


def acutis_sayings() -> dict:
    """The sayings of Saint Carlo Acutis, rendered, and the step between them.

    One of them stands under the day's verse. Which one is arithmetic on the
    date and nothing else -- see generate_page.acutis_quote -- so the browser
    is handed the sayings and the step rather than a saying per date. A map of
    two and a half thousand rows standing in for a formula of one line is the
    kind of thing steering() below declines to ship.
    """
    return {
        "pool": [
            render_prayer([prayers.Quotation(saying, prayers.ACUTIS_ATTRIBUTION)])
            for saying in prayers.ACUTIS_QUOTES
        ],
        "stride": prayers.ACUTIS_STRIDE,
    }


def holiday_bodies(days: list[datetime.date]) -> tuple[list[dict], dict[str, int]]:
    """The holiday hymn section, for the days that carry one."""
    pool: list[dict] = []
    index: dict[str, int] = {}
    seen: dict[str, int] = {}
    for day in days:
        holiday = holidays_us.holiday_for(day)
        if not holiday:
            continue
        rendered = {
            "title": holiday.hymn_title,
            "body": render_prayer(holiday.hymn),
        }
        key = json.dumps(rendered, ensure_ascii=False, sort_keys=True)
        if key not in seen:
            seen[key] = len(pool)
            pool.append(rendered)
        index[day.isoformat()] = seen[key]
    return pool, index


def steering(days: list[datetime.date]) -> dict[str, dict]:
    """How each day steers the reading: its topics, its threshold, its boost.

    This is all of calendar_1962 the browser needs. FEAST_TOPICS and
    RANK_STEER are resolved here rather than shipped, because resolving them
    is the only thing the browser would do with them.
    """
    out: dict[str, dict] = {}
    for day in days:
        feast = calendar_1962.feast_for(day)
        topics = calendar_1962.FEAST_TOPICS.get(feast.category, []) if feast else []
        prefer_min, boost = RANK_STEER.get(feast.rank, (None, 1)) if feast else (None, 1)
        works = calendar_1962.works_for(day)
        # Only days that differ from the plain feria are worth a row.
        if not topics and not works and boost == 1:
            continue
        out[day.isoformat()] = {
            "topics": topics,
            "prefer_min": prefer_min,
            "boost": boost,
            "works": works,
        }
    return out


def night_data() -> dict:
    """What the browser needs to build a night page itself.

    The night office has no calendar in it at all — nothing is chosen by the
    feast — but it does have a memory, which the morning has not. Which book
    each slot is working through, and whether last night left a psalm
    unfinished, is read off the pages already in nights/. A browser cannot
    list that folder, so the three keys each existing page recorded are
    exported here, by date, and recent_nights becomes a lookup rather than
    twenty-one requests.
    """
    import generate_night_page as night

    shell = night.PAGE_TEMPLATE.format(
        date_pretty=DATE, neighbours=NAV, sections=SECTIONS
    )
    sign = night.render_multilingual(night_prayers.SIGN_OF_THE_CROSS, "sign")

    keys_by_date: dict[str, list[str]] = {}
    if night.NIGHTS_DIR.is_dir():
        for page in sorted(night.NIGHTS_DIR.glob("*.html")):
            found = night._READING_KEY.findall(page.read_text(encoding="utf-8"))
            keys_by_date[page.stem] = found

    return {
        "shell": shell,
        "sentinels": {"date": DATE, "nav": NAV, "sections": SECTIONS},
        "fixed": {
            "sign": sign,
            "jesus-prayer": night.render_multilingual(night_prayers.JESUS_PRAYER, "jesus"),
            "hail-mary": night.render_multilingual(night_prayers.HAIL_MARY, "hail-mary"),
            "doxology": night.render_multilingual(
                night_prayers.GREATER_DOXOLOGY, "doxology"
            ),
            "gloria-patri": render_prayer(night_prayers.GLORIA_PATRI),
            "thanks": render_prayer(prayers.THANKS_BE_TO_GOD),
        },
        # Counts, not a set: the psalter is seventy long and comes round
        # again, so psalm_for picks among the psalms said fewest times.
        "spent": dict(night.used_readings(night.NIGHTS_DIR)),
        # In date order, which is the order recent_nights walks them in.
        "keysByDate": keys_by_date,
        "slots": list(night.SLOTS),
        "history": night.HISTORY,
        "stayWithBook": list(night.STAY_WITH_BOOK),
        # The proper lessons: a feast's own reading, by the day it falls on.
        # The whole of the calendar this office has, and the one thing in it
        # the browser could not work out for itself.
        # generate_night_page.appointed is the rule and this is its table; why
        # each one is there stays in the source, where a reader of it is.
        "appointments": [
            {
                "slot": item.slot,
                "citation": item.citation,
                "when": list(item.when),
            }
            for item in night.APPOINTMENTS
        ],
        "schedules": {k: list(v) for k, v in night.SCHEDULES.items()},
    }


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--years", type=int, default=6, help="how far ahead to cover")
    parser.add_argument("--out", default=str(OUT_FILE))
    args = parser.parse_args()

    first = datetime.date.today().replace(month=1, day=1)
    last = datetime.date(first.year + args.years, 12, 31)
    days = [
        datetime.date.fromordinal(o)
        for o in range(first.toordinal(), last.toordinal() + 1)
    ]

    verses, verse_index = verse_bodies(days)
    hymns, hymn_index = holiday_bodies(days)

    data = {
        "shell": shell(),
        "sentinels": {"date": DATE, "nav": NAV, "sections": SECTIONS, "meta": META},
        "lang_button": LANG_BUTTON,
        "fixed": fixed_sections(),
        "saints": saints(),
        "verses": {"pool": verses, "byDate": verse_index},
        "acutis": acutis_sayings(),
        "hymns": {"pool": hymns, "byDate": hymn_index},
        "steering": steering(days),
        # What the pages in days/ have already prayed. The browser cannot list
        # a directory over HTTP, so the set it must avoid has to be handed to
        # it. Sorted, so the file does not churn between runs.
        "spent": sorted(used_readings(DAYS_DIR)),
        "covers": {"first": first.isoformat(), "last": last.isoformat()},
    }

    out = Path(args.out)
    out.write_text(
        json.dumps(data, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"wrote {out.name}, {out.stat().st_size / 1024:.0f} KB")
    print(f"  {len(days)} days covered, {first} to {last}")
    print(f"  {len(verses)} distinct verse bodies, {len(hymns)} holiday hymns")
    print(f"  {len(data['acutis']['pool'])} sayings of Saint Carlo Acutis, "
          f"stepped {data['acutis']['stride']} at a time")
    print(f"  {len(data['steering'])} days with feast steering")
    print(f"  {len(data['spent'])} readings already spent by days/")

    night = night_data()
    NIGHT_OUT_FILE.write_text(
        json.dumps(night, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"wrote {NIGHT_OUT_FILE.name}, {NIGHT_OUT_FILE.stat().st_size / 1024:.0f} KB")
    print(f"  {len(night['keysByDate'])} nights already written")
    print(f"  {len(night['spent'])} readings already spent by nights/")


if __name__ == "__main__":
    main()
