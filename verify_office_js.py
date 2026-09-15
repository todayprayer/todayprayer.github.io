"""Check that office.js builds the same page generate_page.py builds.

The client-side generator is only worth having if what it produces is what
the script would have produced. Anything less and a day generated in the
browser becomes a rival version of a day that will later be generated for
real — and one of the two will have been prayed.

So this compares bytes, for a handful of days chosen to exercise the parts
that differ: a feria, a Sunday (where the Creed displaces the Acts and the
third reading is written but not spent), a saint's day with books of his own,
and a civil holiday (which adds the hymn and holds the Pledge on).

Usage:
    python verify_office_js.py
    python verify_office_js.py --days 2026-10-05 2026-12-25
"""

from __future__ import annotations

import argparse
import datetime
import difflib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import calendar_1962
import holidays_us
from generate_page import DAYS_DIR, build_page, used_readings

PROJECT_DIR = Path(__file__).parent

# Days after the last generated page, so that the spent set the export
# captured is the same set build_page is handed here.
DEFAULT_DAYS = [
    "2026-10-01",   # a plain feria
    "2026-10-04",   # Saint Francis of Assisi — a day with books of his own
    "2026-10-05",   # the day the 404 page was written against
    "2026-11-11",   # Veterans Day — a civil holiday, so a hymn and the Pledge
    "2026-12-25",   # Christmas
    "2027-01-17",   # a Sunday in the new year
    "2027-06-06",   # far enough out to catch a bad ordinal
]

RUNNER = r"""
const fs = require("fs");
const Office = require(process.argv[2]);
const data = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const readings = JSON.parse(fs.readFileSync(process.argv[4], "utf8"));
const out = {};
for (const iso of process.argv.slice(5)) {
  out[iso] = Office.buildPage(data, readings, iso, true);
}
process.stdout.write(JSON.stringify(out));
"""


def js_pages(days: list[str]) -> dict[str, str]:
    with tempfile.TemporaryDirectory() as tmp:
        runner = Path(tmp) / "runner.js"
        runner.write_text(RUNNER, encoding="utf-8")
        result = subprocess.run(
            [
                "node", str(runner),
                str(PROJECT_DIR / "office.js"),
                str(PROJECT_DIR / "office_data.json"),
                str(PROJECT_DIR / "readings.json"),
                *days,
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
    if result.returncode:
        raise SystemExit(f"node failed:\n{result.stderr}")
    return json.loads(result.stdout)


def describe(day: datetime.date) -> str:
    feast = calendar_1962.feast_for(day)
    holiday = holidays_us.holiday_for(day)
    bits = [day.strftime("%a")]
    if feast:
        bits.append(f"{feast.name} (class {feast.rank})")
    if holiday:
        bits.append(holiday.hymn_title)
    if calendar_1962.works_for(day):
        bits.append("own books")
    return ", ".join(bits)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", nargs="*", default=DEFAULT_DAYS)
    parser.add_argument("--diff", action="store_true", help="print the first diff found")
    args = parser.parse_args()

    spent = used_readings(DAYS_DIR)
    export = json.loads((PROJECT_DIR / "office_data.json").read_text(encoding="utf-8"))
    if set(export["spent"]) != spent:
        raise SystemExit(
            f"office_data.json is stale: it lists {len(export['spent'])} spent "
            f"readings, days/ now has {len(spent)}. Re-run export_office_data.py."
        )

    built = js_pages(args.days)
    failures = 0
    for iso in args.days:
        day = datetime.date.fromisoformat(iso)
        want = build_page(day, exclude_keys=set(spent), linked=True)
        got = built[iso]
        if want == got:
            print(f"  match   {iso}  {describe(day)}")
            continue
        failures += 1
        print(f"  DIFFER  {iso}  {describe(day)}  "
              f"(python {len(want)} chars, js {len(got)})")
        if args.diff:
            diff = difflib.unified_diff(
                want.splitlines(), got.splitlines(),
                fromfile="python", tofile="javascript", lineterm="", n=1,
            )
            for line in list(diff)[:40]:
                print("    " + line)
            args.diff = False

    print()
    if failures:
        raise SystemExit(f"{failures} of {len(args.days)} days differ")
    print(f"all {len(args.days)} days byte-identical to generate_page.py")


if __name__ == "__main__":
    main()
