"""The chapter-a-day scripture store for the basic office.

Two tracks, read straight through and whole. The psalm belongs to the basic
morning page and begins at Psalm 1; the chapter belongs to the basic night
page and begins at Exodus 10. Each page written moves its own track on by
one, and the two are counted separately because they are now on separate
pages and nothing makes them keep step: a morning prayed without the night
that follows it should not skip a chapter of Exodus.

The text is the World English Bible, Catholic Edition — modern English, the
Catholic book order, and Esther and Daniel with the sections translated from
the Greek. It is used here because it is the only modern English Catholic
Bible that can lawfully be reproduced whole: eBible.org has dedicated it to
the public domain and expressly permits copying, redistributing and printing
it. That matters because this page does not quote scripture, it reprints it —
two hundred and fifty-six entire chapters sit in bible_readings.json and go
whole into every page generated. Modern translations that are under copyright
cannot be used that way, however freely a website may display them, so the
choice here is not between translations on their merits but between one that
may be reproduced and several that may not.

Note on the psalm numbers. This translation numbers the psalms as the Hebrew
does, so from Psalm 10 onward a number here names a different psalm than the
same number in the Douay-Rheims, which follows the Vulgate. Within the plan
that is consistent — Psalm N always means the psalm this translation prints
under N — but it will not line up with a Douay-Rheims psalter past Psalm 9.

The chapters the plan needs are written into bible_readings.json so that
generating a page needs no network and yields the same page every time. Run
this when the plan is extended:

    python bible_chapters.py --build
    python bible_chapters.py --show 0        # what step 0 would read
"""

from __future__ import annotations

import argparse
import io
import json
import re
import ssl
import sys
import urllib.request
import zipfile
from pathlib import Path

try:
    # The Windows system store on this machine has a CA cert OpenSSL rejects;
    # certifi's bundle sidesteps it. Same reason as in book_excerpts.
    import certifi

    _SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL_CONTEXT = ssl.create_default_context()

PROJECT_DIR = Path(__file__).parent
CHAPTERS_FILE = PROJECT_DIR / "bible_readings.json"
CACHE_DIR = PROJECT_DIR / "bible_cache"

SOURCE = "World English Bible, Catholic Edition"
# Verse-per-line, which is the plainest thing eBible.org publishes: one line
# per verse, as "EXO 10:1 The LORD said to Moses". The alternatives are USFM
# and a zip of HTML, both of which would want a parser to say the same thing.
VPL_URL = "https://ebible.org/Scriptures/eng-web-c_vpl.zip"
VPL_NAME = "eng-web-c_vpl.txt"
USER_AGENT = "MorningPrayerGen/0.1 (personal devotional page generator)"

# The three-letter codes this edition uses, for the books the plan reads.
BOOKS = {
    "Exodus": "EXO",
    "Leviticus": "LEV",
    "Numbers": "NUM",
    "Deuteronomy": "DEU",
    "Psalms": "PSA",
}

# The psalm track. All hundred and fifty, in this translation's numbering.
PSALM_TRACK = [("Psalms", str(n)) for n in range(1, 151)]

# The reading track. Begins where it was asked to begin, at the eighth plague,
# and runs to the end of the law rather than stopping at the end of Exodus:
# a track that dead-ends after thirty-one pages would have to be extended by
# hand on the thirty-second morning.
READING_TRACK: list[tuple[str, str]] = (
    [("Exodus", str(n)) for n in range(10, 41)]
    + [("Leviticus", str(n)) for n in range(1, 28)]
    + [("Numbers", str(n)) for n in range(1, 37)]
    + [("Deuteronomy", str(n)) for n in range(1, 35)]
)

# How far each track runs on its own. They no longer have to agree: the
# psalter is a hundred and fifty long and the law, from the eighth plague, a
# hundred and twenty-eight.
PSALM_STEPS = len(PSALM_TRACK)
READING_STEPS = len(READING_TRACK)


def citation(book: str, chapter: str) -> str:
    """What is printed under the reading. The psalms are cited one at a time
    and so are named in the singular."""
    return f"Psalm {chapter}" if book == "Psalms" else f"{book} {chapter}"


def _at(track: list[tuple[str, str]], step: int, name: str) -> tuple[str, str]:
    if not 0 <= step < len(track):
        raise LookupError(
            f"step {step} is outside the {name} track, which runs 0 to "
            f"{len(track) - 1}. Extend it, then rebuild."
        )
    return track[step]


def psalm_at(step: int) -> tuple[str, str]:
    """The psalm for a step of the morning track, counting from zero."""
    return _at(PSALM_TRACK, step, "psalm")


def chapter_at(step: int) -> tuple[str, str]:
    """The chapter for a step of the night track, counting from zero."""
    return _at(READING_TRACK, step, "reading")


# --- reading the World English Bible ----------------------------------------

# "EXO 10:1 The LORD said to Moses". The text runs to the end of the line.
_VERSE = re.compile(r"^([A-Z0-9]{3})\s+(\d+):(\d+)\s+(.*)$")


def _vpl_text() -> str:
    """The verse-per-line file, downloading and caching the zip on first use."""
    CACHE_DIR.mkdir(exist_ok=True)
    archive = CACHE_DIR / VPL_URL.rsplit("/", 1)[-1]
    if not archive.exists():
        request = urllib.request.Request(VPL_URL, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=60, context=_SSL_CONTEXT) as response:
            archive.write_bytes(response.read())
    with zipfile.ZipFile(io.BytesIO(archive.read_bytes())) as bundle:
        return bundle.read(VPL_NAME).decode("utf-8")


def _load(wanted: dict[str, str]) -> dict[tuple[str, str], dict]:
    """Every chapter of the named books, as verses.

    `wanted` maps the name the plan uses to this edition's three-letter code.
    This translation prints no chapter arguments, so nothing fills `summary`;
    the page simply begins at the first verse where there is none.
    """
    codes = {code: name for name, code in wanted.items()}
    chapters: dict[tuple[str, str], dict] = {}
    for line in _vpl_text().split("\n"):
        found = _VERSE.match(line)
        if not found:
            continue
        name = codes.get(found.group(1))
        if name is None:
            continue
        text = found.group(4).strip()
        if not text:
            continue  # a verse the edition prints as absent
        key = (name, found.group(2))
        here = chapters.setdefault(
            key, {"book": name, "chapter": found.group(2), "summary": "", "verses": []}
        )
        here["verses"].append([found.group(3), text])
    return chapters


def build() -> None:
    needed = sorted({*PSALM_TRACK, *READING_TRACK})
    chapters = _load({book: BOOKS[book] for book, _ in needed})

    missing = [citation(*key) for key in needed if key not in chapters]
    if missing:
        raise LookupError(f"not found in {SOURCE}: {', '.join(missing)}")
    empty = [citation(*key) for key in needed if not chapters[key]["verses"]]
    if empty:
        raise LookupError(f"parsed with no verses: {', '.join(empty)}")

    store = {
        "source": SOURCE,
        "chapters": [
            {
                "citation": citation(*key),
                "book": chapters[key]["book"],
                "chapter": chapters[key]["chapter"],
                "summary": chapters[key]["summary"],
                "verses": chapters[key]["verses"],
            }
            for key in needed
        ],
    }
    body = json.dumps(store, ensure_ascii=False, indent=2) + "\n"
    CHAPTERS_FILE.write_text(body, encoding="utf-8", newline="\n")
    verses = sum(len(c["verses"]) for c in store["chapters"])
    print(f"wrote {len(store['chapters'])} chapters, {verses} verses to {CHAPTERS_FILE.name}")
    print(f"morning: {PSALM_STEPS} steps from {citation(*psalm_at(0))}")
    print(f"night:   {READING_STEPS} steps from {citation(*chapter_at(0))}")


def load_store() -> dict[str, dict]:
    """The stored chapters, keyed by citation."""
    if not CHAPTERS_FILE.exists():
        raise LookupError(
            f"{CHAPTERS_FILE.name} does not exist — run: python bible_chapters.py --build"
        )
    store = json.loads(CHAPTERS_FILE.read_text(encoding="utf-8"))
    return {chapter["citation"]: chapter for chapter in store["chapters"]}


def _stored(key: tuple[str, str], store: dict[str, dict] | None) -> dict:
    if store is None:
        store = load_store()
    name = citation(*key)
    if name not in store:
        raise LookupError(f"{name} is not in {CHAPTERS_FILE.name} — rebuild it")
    return store[name]


def psalm_for(step: int, store: dict[str, dict] | None = None) -> dict:
    """The morning page's psalm for a step, as stored."""
    return _stored(psalm_at(step), store)


def chapter_for(step: int, store: dict[str, dict] | None = None) -> dict:
    """The night page's chapter for a step, as stored."""
    return _stored(chapter_at(step), store)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build", action="store_true", help="fetch and write the store")
    parser.add_argument("--show", type=int, metavar="STEP", help="print one step of each track")
    args = parser.parse_args()

    if args.build:
        build()
        return
    if args.show is not None:
        store = load_store()
        for chapter in (psalm_for(args.show, store), chapter_for(args.show, store)):
            print(f"\n=== {chapter['citation']}  ({len(chapter['verses'])} verses)")
            if chapter["summary"]:
                print(f"    {chapter['summary']}")
            for number, text in chapter["verses"][:2]:
                print(f"    {number}. {text}")
            if len(chapter["verses"]) > 2:
                print("    ...")
        return
    parser.print_help()


if __name__ == "__main__":
    main()
