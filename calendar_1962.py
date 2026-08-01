"""Feast of the day per the 1960/1962 Roman calendar, with a fitting verse.

`feast_for(date)` returns (feast_name, verse) or None for an ordinary feria.
Verses are Douay-Rheims, chosen per feast from the Commons of the breviary
(apostles, martyrs, virgins, ...) or a proper verse for the great feasts.

Precedence (simplified from the 1960 rubrics): movable feasts of the Lord >
fixed sanctoral feasts > liturgical season > Sunday > feria. The sanctoral
table covers the principal feasts of the general calendar; add local or
missing feasts to SANCTORAL as ((month, day): (name, verse_key)).
"""

from __future__ import annotations

import datetime
from typing import NamedTuple


class Feast(NamedTuple):
    name: str
    category: str
    verse: str
    rank: int = 3  # 1st, 2nd or 3rd class per the 1960 Code of Rubrics


# Rank cannot be read off the category alone: Ss Peter and Paul are first class
# while the other apostles are second, and the Nativity of the Baptist is first
# while his Beheading is third. So the fixed feasts that outrank their category
# are listed by date, and the movable ones — whose category is unique to them —
# by category. Everything else with a feast is third class; a feria has none.
FIRST_CLASS_DAYS = {
    (1, 6),    # Epiphany
    (3, 19),   # Saint Joseph
    (3, 25),   # Annunciation
    (6, 24),   # Nativity of Saint John the Baptist
    (6, 29),   # Saints Peter and Paul
    (8, 15),   # Assumption
    (11, 1),   # All Saints
    (12, 8),   # Immaculate Conception
    (12, 25),  # Christmas
}
FIRST_CLASS_CATEGORIES = {
    "christmas", "epiphany", "easter", "ascension", "pentecost", "trinity",
    "corpuschristi", "sacredheart", "christking", "palmsunday", "holythursday",
    "goodfriday", "holysaturday", "assumption", "immaculate",
}
SECOND_CLASS_DAYS = {
    (1, 1),    # Circumcision
    (2, 2),    # Purification
    (8, 6),    # Transfiguration
    (8, 10),   # Saint Lawrence
    (9, 8),    # Nativity of the Blessed Virgin Mary
    (9, 14),   # Exaltation of the Holy Cross
    (9, 29),   # Saint Michael
    (11, 2),   # All Souls
    (12, 26), (12, 27), (12, 28),
}
SECOND_CLASS_CATEGORIES = {
    "apostle", "sunday", "holyname", "holyfamily", "baptismoflord", "candlemas",
    "transfiguration", "cross", "michaelmas", "allsouls", "allsaints",
    "preciousblood", "angels", "joseph", "annunciation", "baptist",
}


def rank_for(month: int, day: int, category: str) -> int:
    if (month, day) in FIRST_CLASS_DAYS or category in FIRST_CLASS_CATEGORIES:
        return 1
    if (month, day) in SECOND_CLASS_DAYS or category in SECOND_CLASS_CATEGORIES:
        return 2
    return 3


# Excerpt topics (see TOPIC_KEYWORDS in book_excerpts.py) that suit each feast
# category, used to steer the daily reading toward the spirit of the day.
FEAST_TOPICS = {
    "apostle": ["zeal", "faith", "saints"],
    "martyr": ["suffering", "perseverance", "faith"],
    "martyrs": ["suffering", "perseverance", "faith"],
    "bishop": ["virtue", "zeal", "obedience"],
    "doctor": ["faith", "prayer", "virtue"],
    "confessor": ["virtue", "humility", "obedience"],
    "virgin": ["purity", "charity", "humility"],
    "holywoman": ["charity", "humility", "virtue"],
    "ourlady": ["mary", "humility", "purity"],
    "angels": ["angels", "obedience", "god"],
    "baptist": ["penance", "humility", "zeal"],
    "joseph": ["obedience", "humility", "virtue"],
    "allsaints": ["saints", "virtue", "joy"],
    "allsouls": ["death", "hope", "prayer"],
    "dedication": ["god", "prayer"],
    "cross": ["suffering", "charity"],
    "lord": ["god", "faith"],
    "christmas": ["humility", "joy", "charity"],
    "epiphany": ["faith", "zeal"],
    "holyname": ["god", "prayer"],
    "holyfamily": ["obedience", "charity", "humility"],
    "baptismoflord": ["obedience", "faith"],
    "candlemas": ["mary", "purity"],
    "annunciation": ["mary", "humility", "obedience"],
    "preciousblood": ["suffering", "charity"],
    "transfiguration": ["prayer", "joy", "god"],
    "assumption": ["mary", "hope", "joy"],
    "magdalene": ["penance", "charity"],
    "michaelmas": ["angels", "perseverance"],
    "immaculate": ["mary", "purity"],
    "advent": ["hope", "penance"],
    "lent": ["penance", "suffering", "humility"],
    "palmsunday": ["suffering", "humility"],
    "holythursday": ["eucharist", "charity"],
    "goodfriday": ["suffering", "charity", "penance"],
    "holysaturday": ["hope", "death"],
    "easter": ["joy", "hope", "faith"],
    "eastertide": ["joy", "hope"],
    "ascension": ["hope", "joy", "god"],
    "pentecost": ["holyspirit", "zeal", "charity"],
    "trinity": ["god", "faith"],
    "corpuschristi": ["eucharist", "charity"],
    "sacredheart": ["charity", "prayer"],
    "christking": ["obedience", "god", "zeal"],
    "sunday": ["prayer", "virtue"],
}

# Verses from the Commons and Propers (Douay-Rheims).
VERSES = {
    "apostle": "Their sound hath gone forth into all the earth: and their words unto the ends "
               "of the world. (Psalm 18:5)",
    "martyr": "The just shall flourish like the palm tree: he shall grow up like the cedar of "
              "Libanus. (Psalm 91:13)",
    "martyrs": "The souls of the just are in the hand of God, and the torment of death shall "
               "not touch them. (Wisdom 3:1)",
    "bishop": "Behold a great priest, who in his days pleased God, and was found just. "
              "(Ecclesiasticus 44:16-17)",
    "doctor": "The mouth of the just shall meditate wisdom, and his tongue shall speak "
              "judgment. (Psalm 36:30)",
    "confessor": "Blessed is the man that feareth the Lord: he shall delight exceedingly in "
                 "his commandments. (Psalm 111:1)",
    "virgin": "After her shall virgins be brought to the king: her neighbours shall be brought "
              "to thee with gladness and rejoicing. (Psalm 44:15-16)",
    "holywoman": "Who shall find a valiant woman? Far, and from the uttermost coasts is the "
                 "price of her. (Proverbs 31:10)",
    "ourlady": "Blessed art thou, O Virgin Mary, by the Lord the most high God, above all "
               "women upon the earth. (Judith 13:23)",
    "angels": "Bless the Lord, all ye his angels: you that are mighty in strength, and execute "
              "his word. (Psalm 102:20)",
    "baptist": "There was a man sent from God, whose name was John. (John 1:6)",
    "joseph": "He made him the lord of his house, and ruler of all his possession. "
              "(Psalm 104:21)",
    "allsaints": "Be glad and rejoice, for your reward is very great in heaven. (Matthew 5:12)",
    "allsouls": "I am the resurrection and the life: he that believeth in me, although he be "
                "dead, shall live. (John 11:25)",
    "dedication": "This is no other but the house of God, and the gate of heaven. "
                  "(Genesis 28:17)",
    "cross": "But God forbid that I should glory, save in the cross of our Lord Jesus Christ. "
             "(Galatians 6:14)",
    "lord": "O Lord, our Lord, how admirable is thy name in the whole earth! (Psalm 8:2)",
    "christmas": "For a child is born to us, and a son is given to us, and the government is "
                 "upon his shoulder. (Isaias 9:6)",
    "epiphany": "And the Gentiles shall walk in thy light, and kings in the brightness of thy "
                "rising. (Isaias 60:3)",
    "holyname": "In the name of Jesus every knee should bow, of those that are in heaven, on "
                "earth, and under the earth. (Philippians 2:10)",
    "holyfamily": "And he went down with them, and came to Nazareth, and was subject to them. "
                  "(Luke 2:51)",
    "baptismoflord": "This is my beloved Son, in whom I am well pleased. (Matthew 3:17)",
    "candlemas": "A light to the revelation of the Gentiles, and the glory of thy people "
                 "Israel. (Luke 2:32)",
    "annunciation": "Behold a virgin shall conceive, and bear a son, and his name shall be "
                    "called Emmanuel. (Isaias 7:14)",
    "preciousblood": "Thou hast redeemed us to God, in thy blood, out of every tribe, and "
                     "tongue, and people, and nation. (Apocalypse 5:9)",
    "transfiguration": "And his face did shine as the sun: and his garments became white as "
                       "snow. (Matthew 17:2)",
    "assumption": "Mary hath chosen the best part, which shall not be taken away from her. "
                  "(Luke 10:42)",
    "magdalene": "Many sins are forgiven her, because she hath loved much. (Luke 7:47)",
    "michaelmas": "There was a great battle in heaven: Michael and his angels fought with the "
                  "dragon. (Apocalypse 12:7)",
    "immaculate": "Thou art all fair, O my love, and there is not a spot in thee. "
                  "(Canticles 4:7)",
    "advent": "Drop down dew, ye heavens, from above, and let the clouds rain the just: let "
              "the earth be opened, and bud forth a saviour. (Isaias 45:8)",
    "lent": "A sacrifice to God is an afflicted spirit: a contrite and humbled heart, O God, "
            "thou wilt not despise. (Psalm 50:19)",
    "palmsunday": "Hosanna to the son of David: Blessed is he that cometh in the name of the "
                  "Lord. (Matthew 21:9)",
    "holythursday": "Having loved his own who were in the world, he loved them unto the end. "
                    "(John 13:1)",
    "goodfriday": "Christ became obedient for us unto death, even to the death of the cross. "
                  "(Philippians 2:8)",
    "holysaturday": "In peace in the selfsame I will sleep, and I will rest. (Psalm 4:9)",
    "easter": "This is the day which the Lord hath made: let us be glad and rejoice therein. "
              "Alleluia. (Psalm 117:24)",
    "eastertide": "Christ our pasch is sacrificed: therefore let us feast. Alleluia. "
                  "(1 Corinthians 5:7-8)",
    "ascension": "God is ascended with jubilee, and the Lord with the sound of trumpet. "
                 "(Psalm 46:6)",
    "pentecost": "The Spirit of the Lord hath filled the whole world, alleluia. (Wisdom 1:7)",
    "trinity": "Blessed be the holy Trinity and undivided Unity: we will give glory to him, "
               "because he hath shown his mercy to us. (Tobias 12:6)",
    "corpuschristi": "He fed them with the fat of wheat: and filled them with honey out of the "
                     "rock. (Psalm 80:17)",
    "sacredheart": "Take up my yoke upon you, and learn of me, because I am meek, and humble "
                   "of heart. (Matthew 11:29)",
    "christking": "And he shall rule from sea to sea, and from the river unto the ends of the "
                  "earth. (Psalm 71:8)",
    "sunday": "This is the day which the Lord hath made: let us be glad and rejoice therein. "
              "(Psalm 117:24)",
}

# Principal fixed feasts of the 1962 general calendar: (month, day) -> (name, verse key).
SANCTORAL = {
    (1, 1): ("Octave of the Nativity of Our Lord", "christmas"),
    (1, 6): ("The Epiphany of Our Lord", "epiphany"),
    (1, 13): ("Commemoration of the Baptism of Our Lord", "baptismoflord"),
    (1, 17): ("Saint Anthony, Abbot", "confessor"),
    (1, 21): ("Saint Agnes, Virgin and Martyr", "virgin"),
    (1, 25): ("Conversion of Saint Paul, Apostle", "apostle"),
    (1, 29): ("Saint Francis de Sales, Bishop and Doctor", "doctor"),
    (1, 31): ("Saint John Bosco, Confessor", "confessor"),
    (2, 2): ("Purification of the Blessed Virgin Mary", "candlemas"),
    (2, 3): ("Saint Blaise, Bishop and Martyr", "martyr"),
    (2, 5): ("Saint Agatha, Virgin and Martyr", "virgin"),
    (2, 11): ("Apparition of Our Lady at Lourdes", "ourlady"),
    (2, 22): ("Chair of Saint Peter, Apostle", "apostle"),
    (2, 24): ("Saint Matthias, Apostle", "apostle"),
    (3, 7): ("Saint Thomas Aquinas, Confessor and Doctor", "doctor"),
    (3, 17): ("Saint Patrick, Bishop and Confessor", "bishop"),
    (3, 19): ("Saint Joseph, Spouse of the Blessed Virgin Mary", "joseph"),
    (3, 25): ("Annunciation of the Blessed Virgin Mary", "annunciation"),
    (4, 11): ("Saint Leo the Great, Pope and Doctor", "doctor"),
    (4, 21): ("Saint Anselm, Bishop and Doctor", "doctor"),
    (4, 23): ("Saint George, Martyr", "martyr"),
    (4, 25): ("Saint Mark, Evangelist", "apostle"),
    (4, 30): ("Saint Catherine of Siena, Virgin", "virgin"),
    (5, 1): ("Saint Joseph the Worker", "joseph"),
    (5, 2): ("Saint Athanasius, Bishop and Doctor", "doctor"),
    (5, 4): ("Saint Monica, Widow", "holywoman"),
    (5, 5): ("Saint Pius V, Pope and Confessor", "confessor"),
    (5, 11): ("Saints Philip and James, Apostles", "apostle"),
    (5, 26): ("Saint Philip Neri, Confessor", "confessor"),
    (5, 27): ("Saint Bede the Venerable, Confessor and Doctor", "doctor"),
    (5, 31): ("Queenship of the Blessed Virgin Mary", "ourlady"),
    (6, 5): ("Saint Boniface, Bishop and Martyr", "martyr"),
    (6, 11): ("Saint Barnabas, Apostle", "apostle"),
    (6, 13): ("Saint Anthony of Padua, Confessor and Doctor", "doctor"),
    (6, 21): ("Saint Aloysius Gonzaga, Confessor", "confessor"),
    (6, 24): ("Nativity of Saint John the Baptist", "baptist"),
    (6, 29): ("Saints Peter and Paul, Apostles", "apostle"),
    (6, 30): ("Commemoration of Saint Paul, Apostle", "apostle"),
    (7, 1): ("Feast of the Most Precious Blood", "preciousblood"),
    (7, 2): ("Visitation of the Blessed Virgin Mary", "ourlady"),
    (7, 3): ("Saint Irenaeus, Bishop and Martyr", "martyr"),
    (7, 14): ("Saint Bonaventure, Bishop and Doctor", "doctor"),
    (7, 16): ("Our Lady of Mount Carmel", "ourlady"),
    (7, 19): ("Saint Vincent de Paul, Confessor", "confessor"),
    (7, 22): ("Saint Mary Magdalene, Penitent", "magdalene"),
    (7, 25): ("Saint James, Apostle", "apostle"),
    (7, 26): ("Saint Anne, Mother of the Blessed Virgin Mary", "holywoman"),
    (7, 29): ("Saint Martha, Virgin", "virgin"),
    (7, 31): ("Saint Ignatius of Loyola, Confessor", "confessor"),
    (8, 4): ("Saint Dominic, Confessor", "confessor"),
    (8, 5): ("Dedication of Our Lady of the Snows", "ourlady"),
    (8, 6): ("Transfiguration of Our Lord", "transfiguration"),
    (8, 8): ("Saint John Mary Vianney, Confessor", "confessor"),
    (8, 10): ("Saint Lawrence, Martyr", "martyr"),
    (8, 12): ("Saint Clare, Virgin", "virgin"),
    (8, 15): ("Assumption of the Blessed Virgin Mary", "assumption"),
    (8, 20): ("Saint Bernard, Abbot and Doctor", "doctor"),
    (8, 21): ("Saint Jane Frances de Chantal, Widow", "holywoman"),
    (8, 22): ("Immaculate Heart of the Blessed Virgin Mary", "ourlady"),
    (8, 24): ("Saint Bartholomew, Apostle", "apostle"),
    (8, 25): ("Saint Louis, King and Confessor", "confessor"),
    (8, 28): ("Saint Augustine, Bishop and Doctor", "doctor"),
    (8, 29): ("Beheading of Saint John the Baptist", "baptist"),
    (9, 3): ("Saint Pius X, Pope and Confessor", "confessor"),
    (9, 8): ("Nativity of the Blessed Virgin Mary", "ourlady"),
    (9, 12): ("Most Holy Name of Mary", "ourlady"),
    (9, 14): ("Exaltation of the Holy Cross", "cross"),
    (9, 15): ("Seven Sorrows of the Blessed Virgin Mary", "ourlady"),
    (9, 21): ("Saint Matthew, Apostle and Evangelist", "apostle"),
    (9, 29): ("Dedication of Saint Michael the Archangel", "michaelmas"),
    (9, 30): ("Saint Jerome, Priest and Doctor", "doctor"),
    (10, 2): ("The Holy Guardian Angels", "angels"),
    (10, 3): ("Saint Teresa of the Child Jesus, Virgin", "virgin"),
    (10, 4): ("Saint Francis of Assisi, Confessor", "confessor"),
    (10, 7): ("Our Lady of the Rosary", "ourlady"),
    (10, 11): ("Maternity of the Blessed Virgin Mary", "ourlady"),
    (10, 15): ("Saint Teresa of Avila, Virgin", "virgin"),
    (10, 18): ("Saint Luke, Evangelist", "apostle"),
    (10, 24): ("Saint Raphael the Archangel", "angels"),
    (10, 28): ("Saints Simon and Jude, Apostles", "apostle"),
    (11, 1): ("All Saints", "allsaints"),
    (11, 2): ("Commemoration of All the Faithful Departed", "allsouls"),
    (11, 4): ("Saint Charles Borromeo, Bishop and Confessor", "bishop"),
    (11, 9): ("Dedication of the Archbasilica of the Most Holy Saviour", "dedication"),
    (11, 11): ("Saint Martin of Tours, Bishop and Confessor", "bishop"),
    (11, 15): ("Saint Albert the Great, Bishop and Doctor", "doctor"),
    (11, 21): ("Presentation of the Blessed Virgin Mary", "ourlady"),
    (11, 22): ("Saint Cecilia, Virgin and Martyr", "virgin"),
    (11, 30): ("Saint Andrew, Apostle", "apostle"),
    (12, 3): ("Saint Francis Xavier, Confessor", "confessor"),
    (12, 6): ("Saint Nicholas, Bishop and Confessor", "bishop"),
    (12, 7): ("Saint Ambrose, Bishop and Doctor", "doctor"),
    (12, 8): ("Immaculate Conception of the Blessed Virgin Mary", "immaculate"),
    (12, 13): ("Saint Lucy, Virgin and Martyr", "virgin"),
    (12, 21): ("Saint Thomas, Apostle", "apostle"),
    (12, 25): ("Nativity of Our Lord Jesus Christ", "christmas"),
    (12, 26): ("Saint Stephen, the First Martyr", "martyr"),
    (12, 27): ("Saint John, Apostle and Evangelist", "apostle"),
    (12, 28): ("The Holy Innocents, Martyrs", "martyrs"),
    (12, 31): ("Saint Sylvester I, Pope and Confessor", "confessor"),
}


def easter(year: int) -> datetime.date:
    """Gregorian Easter by the anonymous computus algorithm."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(h + l - 7 * m + 114, 31)
    return datetime.date(year, month, day + 1)


def _sunday_on_or_after(day: datetime.date) -> datetime.date:
    return day + datetime.timedelta(days=(6 - day.weekday()) % 7)


def _movable(year: int) -> dict[datetime.date, tuple[str, str]]:
    e = easter(year)
    off = lambda days: e + datetime.timedelta(days=days)
    feasts = {
        off(-46): ("Ash Wednesday", "lent"),
        off(-7): ("Palm Sunday", "palmsunday"),
        off(-3): ("Maundy Thursday", "holythursday"),
        off(-2): ("Good Friday", "goodfriday"),
        off(-1): ("Holy Saturday", "holysaturday"),
        e: ("Easter Sunday", "easter"),
        off(39): ("Ascension of Our Lord", "ascension"),
        off(49): ("Pentecost", "pentecost"),
        off(56): ("Trinity Sunday", "trinity"),
        off(60): ("Corpus Christi", "corpuschristi"),
        off(68): ("Feast of the Most Sacred Heart of Jesus", "sacredheart"),
    }
    # Octave of Easter and of Pentecost.
    for d in range(1, 7):
        feasts[off(d)] = ("Octave of Easter", "easter")
        feasts[off(49 + d)] = ("Octave of Pentecost", "pentecost")
    # Holy Name of Jesus: Sunday between Jan 2 and 5, else Jan 2.
    holy_name = _sunday_on_or_after(datetime.date(year, 1, 2))
    if holy_name.day > 5:
        holy_name = datetime.date(year, 1, 2)
    feasts[holy_name] = ("Most Holy Name of Jesus", "holyname")
    # Holy Family: first Sunday after Epiphany.
    feasts[_sunday_on_or_after(datetime.date(year, 1, 7))] = ("The Holy Family", "holyfamily")
    # Christ the King: last Sunday of October.
    last_oct_sunday = datetime.date(year, 10, 31)
    last_oct_sunday -= datetime.timedelta(days=(last_oct_sunday.weekday() + 1) % 7)
    feasts[last_oct_sunday] = ("Feast of Christ the King", "christking")
    return feasts


def _advent_start(year: int) -> datetime.date:
    return _sunday_on_or_after(datetime.date(year, 11, 27))


def _season(day: datetime.date) -> tuple[str, str] | None:
    e = easter(day.year)
    sunday = day.weekday() == 6
    if _advent_start(day.year) <= day <= datetime.date(day.year, 12, 24):
        return ("Sunday of Advent" if sunday else "Feria of Advent", "advent")
    if day <= datetime.date(day.year, 1, 5):
        return ("Christmastide", "christmas")
    if e - datetime.timedelta(days=46) <= day < e:
        return ("Sunday in Lent" if sunday else "Feria of Lent", "lent")
    if e < day < e + datetime.timedelta(days=49):
        return ("Sunday in Paschaltide" if sunday else "Paschaltide", "eastertide")
    return None


def feast_for(day: datetime.date) -> Feast | None:
    """Return the day's Feast (name, category, verse), or None for a feria."""
    found = (
        _movable(day.year).get(day)
        or SANCTORAL.get((day.month, day.day))
        or _season(day)
        or (("Sunday", "sunday") if day.weekday() == 6 else None)
    )
    if not found:
        return None
    name, key = found
    return Feast(name, key, VERSES[key], rank_for(day.month, day.day, key))
