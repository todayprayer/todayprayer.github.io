"""Book readings for the morning prayer page.

The daily reading comes from readings.json — a hand-curated list of
self-contained passages ("pieces", like Office of Readings lessons)
transcribed from public-domain books, each tagged with topics so the pick
can follow the feast of the day.

This module also keeps the archive.org tooling used to add new books:
    python book_excerpts.py --search "title"    find a book's identifier
    python book_excerpts.py <identifier>        preview a random raw piece
    python book_excerpts.py <identifier> --stats
Download a book's text with these, then transcribe the worthwhile passages
into readings.json by hand.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import ssl
import sys
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

try:
    # The Windows system store on this machine has a CA cert OpenSSL rejects;
    # certifi's bundle sidesteps it.
    import certifi

    _SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL_CONTEXT = ssl.create_default_context()

CACHE_DIR = Path(__file__).parent / "book_cache"
READINGS_FILE = Path(__file__).parent / "readings.json"
USER_AGENT = "MorningPrayerGen/0.1 (personal devotional page generator)"

# Tunable knobs for the raw piece preview (1-3 paragraphs forming a unit).
MIN_PIECE_CHARS = 350
MAX_PIECE_CHARS = 2000
MIN_BLOCK_CHARS = 40
MIN_LETTER_RATIO = 0.75  # letters+spaces / total chars; weeds out TOC dot leaders, page nums


@dataclass
class Excerpt:
    text: str
    title: str
    creator: str
    identifier: str

    @property
    def attribution(self) -> str:
        return f"{self.title} — {self.creator}" if self.creator else self.title


def reading_key(text: str) -> str:
    """A short stable name for a reading, derived from the reading itself.

    Used to record which readings a generated page spent, so that later pages
    can avoid them. Keyed on the text rather than on the title or the position
    in readings.json, both of which move: entries get retitled, retagged and
    reordered, while the passage itself is what must not repeat.
    """
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]


def reading_excerpt(
    weighted_topics: list[str] | None = None,
    included_topics: list[str] | None = None,
    excluded_topics: list[str] | None = None,
    any_topics: list[str] | None = None,
    prefer_topics: list[str] | None = None,
    prefer_min: int = 1,
    weight_boost: int = 1,
    exclude_keys: set[str] | None = None,
    rng: random.Random | None = None,
) -> Excerpt:
    """Pick a hand-curated reading from readings.json.

    - weighted_topics: entries are weighted by number of matches (more matches = higher weight)
    - included_topics: ALL topics in this list must be present in an entry (required)
    - any_topics: AT LEAST ONE topic in this list must be present (required)
    - excluded_topics: entries with ANY topic in this list are filtered out
    - prefer_topics: restrict to entries carrying at least one of these, but only
      while at least prefer_min of them survive the other filters
    - weight_boost: how strongly weighted_topics matches are favoured
    - exclude_keys: reading_key values already spent, never to be picked again
      unless the filters leave nothing else
    """
    entries = json.loads(READINGS_FILE.read_text(encoding="utf-8"))
    if not entries:
        raise LookupError(f"No readings in {READINGS_FILE}")

    # Filter out entries with excluded topics
    if excluded_topics:
        excluded_set = set(excluded_topics)
        entries = [e for e in entries if not (set(e["topics"]) & excluded_set)]

    # Filter to only entries with ALL included topics
    if included_topics:
        included_set = set(included_topics)
        entries = [e for e in entries if included_set <= set(e["topics"])]

    # Filter to entries carrying at least one of these topics
    if any_topics:
        any_set = set(any_topics)
        entries = [e for e in entries if set(e["topics"]) & any_set]

    # Steer toward the day's feast. Restricting outright beats weighting once
    # the collection is large: among ~2,500 readings, a handful at double or
    # triple weight still lose on sheer volume, which is why the Assumption
    # could draw the canons of Nicaea. Restrict only while enough readings
    # remain that the day will not repeat itself year after year.
    # FEAST_TOPICS names the day's topics most-proper-first, so take the
    # narrowest restriction that still leaves enough to choose from. On the
    # Assumption that is "mary" alone: allowing "mary or hope or joy" lets the
    # common tags swamp the proper one, since "hope" is six times as frequent.
    if prefer_topics:
        for width in range(1, len(prefer_topics) + 1):
            matching = [
                e for e in entries if set(e["topics"]) & set(prefer_topics[:width])
            ]
            if len(matching) >= prefer_min:
                entries = matching
                break

    if not entries:
        raise LookupError(f"No readings match the filter criteria")

    # Prefer readings not yet spent, but keep the spent ones in reserve rather
    # than failing: on a feast whose proper topic is thinly stocked the filters
    # above can narrow the pool to a handful, and a repeat beats no reading.
    # The split happens here, after every other filter, so that exhaustion is
    # measured against what the day could actually have used.
    if exclude_keys:
        fresh = [e for e in entries if reading_key(e["text"]) not in exclude_keys]
        if fresh:
            entries = fresh

    # Calculate weights based on weighted_topics matches
    if weighted_topics:
        weighted_set = set(weighted_topics)
        weights = [
            1 + weight_boost * len(set(e["topics"]) & weighted_set) for e in entries
        ]
    else:
        # No topic weighting, uniform weights
        weights = [1] * len(entries)

    rng_instance = rng or random
    entry = rng_instance.choices(entries, weights=weights, k=1)[0]

    return Excerpt(
        text=entry["text"],
        title=entry["title"],
        creator=entry["creator"],
        identifier=entry.get("identifier", ""),
    )


# --- archive.org fetching, for adding new books to curate ---


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30, context=_SSL_CONTEXT) as resp:
        return resp.read()


def search_archive(query: str, rows: int = 10) -> list[dict]:
    """Search archive.org text items by title; returns [{identifier, title, creator}]."""
    params = urllib.parse.urlencode(
        {
            "q": f'title:({query}) AND mediatype:texts',
            "fl[]": ["identifier", "title", "creator"],
            "rows": rows,
            "output": "json",
        },
        doseq=True,
    )
    data = json.loads(_get(f"https://archive.org/advancedsearch.php?{params}"))
    return data["response"]["docs"]


def _fetch_metadata(identifier: str) -> dict:
    return json.loads(_get(f"https://archive.org/metadata/{identifier}"))


def fetch_book_text(identifier: str) -> str:
    """Return the book's plain text, downloading and caching on first use."""
    CACHE_DIR.mkdir(exist_ok=True)
    cache_file = CACHE_DIR / f"{identifier}.txt"
    if cache_file.exists():
        return cache_file.read_text(encoding="utf-8")

    meta = _fetch_metadata(identifier)
    txt_files = [f["name"] for f in meta["files"] if f["name"].endswith("_djvu.txt")]
    if not txt_files:
        raise LookupError(f"No plain-text file available for {identifier!r}")
    url = f"https://archive.org/download/{identifier}/{urllib.parse.quote(txt_files[0])}"
    text = _get(url).decode("utf-8", errors="replace")
    cache_file.write_text(text, encoding="utf-8")

    # Cache the display metadata alongside the text.
    md = meta.get("metadata", {})
    creator = md.get("creator", "")
    if isinstance(creator, list):
        creator = creator[0]
    (CACHE_DIR / f"{identifier}.json").write_text(
        json.dumps({"title": md.get("title", identifier), "creator": creator}),
        encoding="utf-8",
    )
    return text


def _book_info(identifier: str) -> dict:
    info_file = CACHE_DIR / f"{identifier}.json"
    if info_file.exists():
        return json.loads(info_file.read_text(encoding="utf-8"))
    return {"title": identifier, "creator": ""}


# --- raw piece extraction, used only to preview candidate passages ---

_PAGE_NUMBER = re.compile(r"^[\divxlcIVXLC\s.\-—]*$")
_QUESTION_LEADIN = re.compile(r"^\s*\d+\s*\.\s+\S")
# Characters that never appear in typeset prose — a reliable OCR-garbage tell.
_JUNK_CHARS = set("^\\|~@#$%*_=+[]{}<>/`")
_WORDISH = re.compile(r"^[A-Za-z'’\-]+[.,;:!?'’\"”)]*$")


def _looks_garbled(block: str) -> bool:
    if sum(c in _JUNK_CHARS for c in block) >= 2:
        return True
    if re.search(r"[A-Za-z][()][A-Za-z]", block):  # OCR junk like "Gk)D"
        return True
    tokens = block.split()
    bad = sum(1 for t in tokens if not _WORDISH.match(t) and not t.rstrip(".,;:!?)").isdigit())
    return bad / max(len(tokens), 1) > 0.04


def _clean_blocks(raw_text: str) -> list[str]:
    """Split OCR text on blank lines and rejoin hard-wrapped lines within blocks."""
    blocks = []
    for block in re.split(r"\n\s*\n", raw_text):
        # Rejoin wrapped lines, fixing hyphenation at line breaks. Some scans
        # render the break hyphen as "¬" ("per¬ \nsonal").
        joined = re.sub(r"(?<=[a-z])[-¬] *\n\s*(?=[a-z])", "", block)
        joined = re.sub(r"\s*\n\s*", " ", joined).strip()
        joined = re.sub(r"\s{2,}", " ", joined)
        if joined:
            blocks.append(joined)
    return blocks


def _is_clean_block(block: str) -> bool:
    """A block of usable prose (or a question) — not a heading, page number,
    or OCR garbage."""
    if len(block) < MIN_BLOCK_CHARS and not _QUESTION_LEADIN.match(block):
        return False
    if _PAGE_NUMBER.match(block):
        return False
    if block[-1] not in ".!?:\"'”)":  # headings lack terminal punctuation
        return False
    letters = sum(c.isalpha() or c.isspace() for c in block)
    if letters / len(block) < MIN_LETTER_RATIO:
        return False
    if _looks_garbled(block):
        return False
    alpha = [c for c in block if c.isalpha()]
    if alpha and sum(c.isupper() for c in alpha) / len(alpha) > 0.3:
        return False
    return True


MAX_QUESTION_CHARS = 200  # real catechism questions run well under this


def _is_question(block: str) -> bool:
    """A catechism-style question — a short numbered lead-in.

    The length cap matters: encyclicals and conciliar decrees number every
    paragraph, and one that happens to close on a question mark would
    otherwise send its whole run down the Q&A path and yield nothing.
    """
    if not _QUESTION_LEADIN.match(block):
        return False
    if len(block) > MAX_QUESTION_CHARS:
        return False
    return block.endswith("?") or (len(block) < 90 and block.endswith("."))


def _ends_cleanly(block: str) -> bool:
    return block[-1] in ".!\"'”)"


_DEPENDENT_START = re.compile(
    r"^(But|And|Yet|However|Therefore|Hence|Thus|Moreover|Besides|Furthermore|"
    r"Again|Likewise|Finally|Nevertheless|Also|So|Then|Now|Such|This|These|"
    r"Those|It|He|She|They|The same|On the other|In the same|In this way|"
    r"Secondly|Thirdly|Lastly)\b"
)
def _clean_start(block: str) -> bool:
    first = block.lstrip("\"'“‘")[:1]
    if not (first.isupper() or first.isdigit()):
        return False
    return not _DEPENDENT_START.match(block)


def _qa_units(run: list[str]) -> list[list[str]]:
    """Split a Q&A run into units: each question with all its answer blocks.
    Question numbers increase monotonically; numbered sub-points restart at 1."""
    units: list[list[str]] = []
    last_q = 0
    for block in run:
        m = re.match(r"^(\d+)", block)
        num = int(m.group(1)) if m else None
        if (_is_question(block) and (num is None or num > last_q)) or not units:
            units.append([block])
            last_q = num if num is not None else last_q
        else:
            units[-1].append(block)
    return units


def _emit(pieces: list[str], blocks: list[str]) -> None:
    text = "\n\n".join(blocks)
    if MIN_PIECE_CHARS <= len(text) <= MAX_PIECE_CHARS and _ends_cleanly(blocks[-1]):
        pieces.append(text)


_NOTES_HEADING = re.compile(r"^(notes|footnotes|endnotes)\s*:?$", re.I)
_CITATION_START = re.compile(
    r"^[\[(]?\d{1,3}[\]).]?\s|^(cf|cfr|ibid|idem|op\.|loc\.|PL |PG |AAS)", re.I
)


def _drop_notes(blocks: list[str]) -> list[str]:
    """Cut the trailing citation apparatus.

    Encyclicals and conciliar decrees close with a notes section ("6. Marc.,
    IX, 36: Quisquis unum...") that is prose-shaped enough to survive the
    block filters and would otherwise be offered as a reading.

    A heading alone is not enough to cut on: books with per-chapter endnotes
    carry one mid-text with whole chapters still to come. So a heading counts
    only when nothing but apparatus follows it — erring towards leaving notes
    in rather than discarding the back half of a book.
    """
    for i, block in enumerate(blocks):
        if not _NOTES_HEADING.match(block):
            continue
        if any(
            len(b) > 400 and _is_clean_block(b) and not _CITATION_START.match(b)
            for b in blocks[i + 1 :]
        ):
            continue
        return blocks[:i]
    return blocks


def _prose_runs(blocks: list[str]) -> list[list[str]]:
    runs, current = [], []
    for block in blocks:
        if _is_clean_block(block):
            current.append(block)
        elif current:
            runs.append(current)
            current = []
    if current:
        runs.append(current)
    return runs


def extract_pieces(raw_text: str) -> list[str]:
    """Return candidate multi-paragraph pieces from raw OCR text — a rough
    preview aid for hand-curation, not the page's selection mechanism."""
    pieces: list[str] = []
    for run in _prose_runs(_drop_notes(_clean_blocks(raw_text))):
        if any(_is_question(b) for b in run):
            units = [u for u in _qa_units(run) if _is_question(u[0])]
            for k, unit in enumerate(units):
                _emit(pieces, unit)
                if k + 1 < len(units):
                    _emit(pieces, unit + units[k + 1])
        else:
            for i, block in enumerate(run):
                if not _clean_start(block):
                    continue
                for size in (1, 2, 3):
                    window = run[i : i + size]
                    if len(window) < size:
                        break
                    if len("\n\n".join(window)) > MAX_PIECE_CHARS:
                        break
                    _emit(pieces, window)
    seen: set[str] = set()
    unique = []
    for piece in pieces:
        if piece not in seen:
            seen.add(piece)
            unique.append(piece)
    return unique


def random_excerpt(identifier: str, rng: random.Random | None = None) -> Excerpt:
    """Preview a random raw piece from a downloaded book (curation aid)."""
    pieces = extract_pieces(fetch_book_text(identifier))
    if not pieces:
        raise LookupError(f"No substantive pieces found in {identifier!r}")
    info = _book_info(identifier)
    return Excerpt(
        text=(rng or random).choice(pieces),
        title=info["title"],
        creator=info["creator"],
        identifier=identifier,
    )


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("identifier", nargs="?", help="archive.org item identifier")
    parser.add_argument("--search", help="search archive.org for a book title")
    parser.add_argument("--stats", action="store_true", help="show piece counts")
    args = parser.parse_args()

    if args.search:
        for doc in search_archive(args.search):
            print(f"{doc['identifier']}\n    {doc.get('title', '?')} — {doc.get('creator', '?')}")
        return

    if not args.identifier:
        parser.error("give an identifier or --search")

    if args.stats:
        raw = fetch_book_text(args.identifier)
        print(f"{len(_clean_blocks(raw))} raw blocks -> {len(extract_pieces(raw))} candidate pieces")
        return

    excerpt = random_excerpt(args.identifier)
    print(excerpt.text)
    print(f"\n    — {excerpt.attribution}")


if __name__ == "__main__":
    main()
