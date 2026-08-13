"""American national holidays, and the hymn sung on each.

These are civil observances, not liturgical ones, so they are kept out of
calendar_1962: they neither rank against a feast nor displace one. A holiday
adds two things to the page — the Pledge of Allegiance, which it keeps even on
a Sunday, and a hymn.

The dates are the federal ones, four of them movable by the Monday Holiday Act:

    Washington's Birthday   third Monday in February
    Memorial Day            last Monday in May
    Flag Day                June 14 (not a federal holiday, but observed)
    Independence Day        July 4
    Columbus Day            second Monday in October
    Thanksgiving Day        fourth Thursday in November
"""

from __future__ import annotations

import calendar
import datetime
from typing import NamedTuple

import prayers

MONDAY, THURSDAY = 0, 3


class Holiday(NamedTuple):
    name: str
    hymn_title: str
    hymn: list


def _nth_weekday(year: int, month: int, weekday: int, n: int) -> datetime.date:
    """The nth given weekday of a month, counting from 1."""
    first = datetime.date(year, month, 1)
    offset = (weekday - first.weekday()) % 7
    return first + datetime.timedelta(days=offset + 7 * (n - 1))


def _last_weekday(year: int, month: int, weekday: int) -> datetime.date:
    last = datetime.date(year, month, calendar.monthrange(year, month)[1])
    return last - datetime.timedelta(days=(last.weekday() - weekday) % 7)


HOLIDAYS = {
    "washington": Holiday(
        "Washington's Birthday (Presidents' Day)",
        "America",
        prayers.MY_COUNTRY_TIS_OF_THEE,
    ),
    "memorial": Holiday(
        "Memorial Day",
        "Eternal Father, Strong to Save",
        prayers.ETERNAL_FATHER_STRONG_TO_SAVE,
    ),
    "flag": Holiday(
        "Flag Day",
        "The Star-Spangled Banner",
        prayers.STAR_SPANGLED_BANNER,
    ),
    "independence": Holiday(
        "Independence Day",
        "Battle Hymn of the Republic",
        prayers.BATTLE_HYMN_OF_THE_REPUBLIC,
    ),
    "columbus": Holiday(
        "Columbus Day",
        "Rise Columbia",
        prayers.RISE_COLUMBIA,
    ),
    "thanksgiving": Holiday(
        "Thanksgiving Day",
        "The Stars and Stripes Forever",
        prayers.STARS_AND_STRIPES_FOREVER,
    ),
}


def holiday_for(day: datetime.date) -> Holiday | None:
    y = day.year
    if day == _nth_weekday(y, 2, MONDAY, 3):
        return HOLIDAYS["washington"]
    if day == _last_weekday(y, 5, MONDAY):
        return HOLIDAYS["memorial"]
    if (day.month, day.day) == (6, 14):
        return HOLIDAYS["flag"]
    if (day.month, day.day) == (7, 4):
        return HOLIDAYS["independence"]
    if day == _nth_weekday(y, 10, MONDAY, 2):
        return HOLIDAYS["columbus"]
    if day == _nth_weekday(y, 11, THURSDAY, 4):
        return HOLIDAYS["thanksgiving"]
    return None
