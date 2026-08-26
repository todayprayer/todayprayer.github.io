"""Fixed prayer texts for the night prayer page.

Only what the night office does not share with the morning one lives here; the
English Sign of the Cross is imported from prayers.py so that the two pages
cannot drift apart on it. The paragraph kinds — plain strings, (versicle,
response) tuples, Rubric, Response — are prayers.py's, and are rendered by the
same code.

Four of these prayers are given in four languages and are dicts keyed by
language code rather than plain lists. The Greek and the Hebrew are printed in
transliteration rather than in their own alphabets, so that they can be said
by someone who does not read either: "Kyrie Iisou Christe", "Shalom lach
Miriam". The alphabet each was transliterated from is quoted in the comment
above it, so the transliteration can be checked against the thing it came
from.

Where a text was received it is quoted from a named source. Where it was not,
the comment says so. Three things here are this page's own work and nobody
else's: the Latin, Greek and Hebrew rubrics, which are instructions to the
reader and appear in no liturgical book; the Hebrew Jesus Prayer, assembled
from the two verses of Delitzsch's Hebrew New Testament it is made of; and the
Hebrew Greater Doxology after its first line, which is Luke 2:14 and is
Delitzsch's, the rest being translated here.
"""

from prayers import Response, Rubric, SIGN_OF_THE_CROSS as SIGN_OF_THE_CROSS_EN

__all__ = [
    "LANGUAGES",
    "SIGN_OF_THE_CROSS",
    "JESUS_PRAYER",
    "HAIL_MARY",
    "GLORIA_PATRI",
    "GREATER_DOXOLOGY",
]

# How the Greek is transliterated, written down so that it can be checked
# rather than taken on trust. Byzantine pronunciation, which is how the Greek
# churches say these prayers:
#
#   η ι υ ει οι υι → i     ω ο → o      ου → ou      αι → ai
#   β → v    γ → g    δ → d    θ → th    φ → f    χ → ch    ψ → ps    ξ → x
#   υ → y where it stands alone (Kyrie, psychon), i in a diphthong
#   breathings are not written: Ἅγιος → Agios, ἡμῶν → imon
#
# αυ and ευ are the pair that catch you out. They are av and ev before a vowel
# or a voiced consonant, but af and ef before a voiceless one and at the end
# of a word — so εὐλογοῦμεν is evlogoumen while εὐχαριστοῦμεν is
# efcharistoumen, and Βασιλεῦ is Vasilef. Four readings on this page had it
# the wrong way round before this note was written.

# The order the buttons appear in, and what they are called on the page.
LANGUAGES = [
    ("en", "English"),
    ("la", "Latin"),
    ("el", "Greek"),
    ("he", "Hebrew"),
]

# --- The Sign of the Cross --------------------------------------------------
#
# la: the form given in the Wikipedia article Sign of the cross — "In nomine
#     Patris", "et Filii", "et Spiritus Sancti", "Amen".
# el: Matthew 28:19, which is where the formula comes from and the words the
#     Greek churches sign themselves with:
#     Εἰς τὸ ὄνομα τοῦ Πατρὸς καὶ τοῦ Υἱοῦ καὶ τοῦ Ἁγίου Πνεύματος. Ἀμήν.
# he: as the Hebrew-speaking Catholics say it, from the Hebrew Catholic
#     Hermitage's page of the prayers:
#     בשם האב והבן ורוח הקדש. אמן.

SIGN_OF_THE_CROSS = {
    "en": SIGN_OF_THE_CROSS_EN,
    "la": [
        "✠ In nómine Patris, et Fílii, et Spíritus Sancti.",
        Response("Amen."),
    ],
    "el": [
        "✠ Eis to onoma tou Patros kai tou Yiou kai tou Agiou Pnevmatos.",
        Response("Amin."),
    ],
    "he": [
        "✠ B’shem ha-Av v’ha-Ben v’Ruach ha-Kodesh.",
        Response("Amen."),
    ],
}

# --- The Jesus Prayer -------------------------------------------------------
#
# The prayer of the heart, as the Philokalia and the Way of a Pilgrim give it.
# It is said over and over rather than once, which is what the rubric is for:
# printed alone it reads like a versicle and is prayed like one.
#
# el: the full form as the Greek article Προσευχή του Ιησού gives it:
#     Κύριε Ἰησοῦ Χριστέ, Υἱὲ τοῦ Θεοῦ τοῦ ζῶντος, ἐλέησόν με τὸν ἁμαρτωλόν.
# la: the received Latin form of the same prayer.
# he: assembled here from the two verses the prayer is made of, in Delitzsch's
#     Hebrew New Testament as Hebrew Wikisource prints it —
#     Matthew 16:16  הַמָּשִׁיחַ בֶּן־אֱלֹהִים חַיִּים   (the Messiah, Son of the living God)
#     Luke 18:13     אֲנִי הַחוֹטֵא                     (I the sinner)
#     Delitzsch's tax-collector says "forgive me", where the prayer says "have
#     mercy on me": rachem alai is translated here, not quoted.
#
# The rubrics are this page's own, in all four languages.

JESUS_PRAYER = {
    "en": [
        Rubric("Repeat as many times as necessary, or pluralize in group prayer."),
        "Lord Jesus Christ, Son of the living God, have mercy on me, a sinner.",
    ],
    "la": [
        Rubric("Repete quoties opus est, vel numero plurali in oratione communi."),
        "Dómine Iesu Christe, Fili Dei vivi, miserére mei peccatóris.",
    ],
    "el": [
        Rubric("Epanalave osakis chreiazetai, i en plithyntiko en koini prosefchi."),
        "Kyrie Iisou Christe, Yie tou Theou tou zontos, eleison me ton amartolon.",
    ],
    "he": [
        Rubric("Chazor kama p’amim she-tzarich, o bi-lshon rabbim bi-tfila b’tzibur."),
        "Adonai Yeshua HaMashiach, Ben-Elohim chayyim, rachem alai, ani ha-chote.",
    ],
}

# --- The Hail Mary ----------------------------------------------------------
#
# la: the Ave Maria as the Wikipedia article Hail Mary prints it.
# el: the Ave Maria as the Greek Catholics pray it, from the Greek article
#     Άβε Μαρία, which prints it line against line with the Latin:
#     Χαῖρε κεχαριτωμένη Μαρία, Ὁ Κύριος μετά Σου.
#     Εὐλογημένη σὺ ἐν γυναιξί,
#     καὶ εὐλογημένος ὁ καρπὸς τῆς κοιλίας σου, Ἰησοῦς.
#     Ἁγία Μαρία, Μῆτερ τοῦ Θεοῦ,
#     προσεύχου ὑπὲρ ἡμῶν τῶν ἁμαρτωλῶν
#     νῦν καὶ κατὰ τὴν ὥραν τοῦ θανάτου ἡμῶν. Ἀμήν.
#
#     Not Θεοτόκε Παρθένε, which stood here before. That is the Byzantine
#     form, and it is a different prayer rather than a translation of this
#     one: it has no second half, and where the Latin asks Mary to pray for
#     us sinners it ends by saying why she is greeted — "because it was the
#     Saviour of our souls that thou borest".
# he: the form the Hebrew-speaking Catholics pray, which opens "Shalom lach
#     Miriam". Not the Hebrew Wikipedia article's text, which opens "Simchi
#     Miriam" and reads ה׳ עַמְּךָ — "the Lord thy people" — where the prayer
#     wants ה׳ עִמָּךְ, "the Lord is with thee".

HAIL_MARY = {
    "en": [
        "Hail Mary, full of grace, the Lord is with thee; blessed art thou amongst "
        "women, and blessed is the fruit of thy womb, Jesus.",
        "Holy Mary, Mother of God, pray for us sinners, now and at the hour of our "
        "death.",
        Response("Amen."),
    ],
    "la": [
        "Ave María, grátia plena, Dóminus tecum. Benedícta tu in muliéribus, "
        "et benedíctus fructus ventris tui, Iesus.",
        "Sancta María, Mater Dei, ora pro nobis peccatóribus, nunc et in hora "
        "mortis nostrae.",
        Response("Amen."),
    ],
    "el": [
        "Chaire Maria, kecharitomeni, o Kyrios einai mazi sou. "
        "Evlogimeni esi metaxy ton gynaikon kai evlogimenos o karpos tis koilias sou, o Iisous.",
        "Agia Maria, Mitera tou Theou, Prosefchisou gia emas tous "
        "amartolous tora kai stin ora tou thanatou mas.",
        Response("Amin."),
    ],
    "he": [
        "Shalom lach Miriam, bruchat ha chesed, Adonai imech. "
        "B’ruchah at ba-nashim, u-baruch pri bitnech, Yeshua.",
        "Miriam ha-Kdoshah, em Eloheinu, hitpaleliI be’adeinu ha-chote’im, "
        "atah u’vish’at moteinu.",
        Response("Amen."),
    ],
}

# Said at the end of the psalm, as it is at the end of every psalm of the
# office. It closes the psalm rather than standing on its own, so the page
# prints it inside the psalm's section and not as a section of its own.
GLORIA_PATRI = [
    (
        "Glory be to the Father, and to the Son, and to the Holy Spirit.",
        "As it was in the beginning, is now, and ever shall be, "
        "world without end. Amen.",
    ),
]

# --- The Greater Doxology ---------------------------------------------------
#
# la: the Gloria in excélsis Deo of the Roman rite, from the Wikipedia article
#     Gloria in excelsis Deo.
# el: the Greek of the same hymn, from the same article — the Great Doxology
#     as the Orthros has it, less the opening line "Δόξα σοι τῷ δείξαντι τὸ
#     φῶς" and the verses that follow the Amen, neither of which the Roman
#     form carries.
# he: the first line is Luke 2:14 in Delitzsch, from Hebrew Wikisource —
#     כָּבוֹד בַּמְּרוֹמִים לֵאלֹהִים וּבָאָרֶץ שָׁלוֹם בְּאַנְשֵׁי רְצוֹנוֹ
#     which is where the hymn begins and the only part of it that is
#     scripture. Everything after that line is translated here. It has no
#     authority behind it and should be read by someone who knows Hebrew
#     before it is prayed by anyone who does not.

GREATER_DOXOLOGY = {
    "en": [
        "Glory be to God on high, and on earth peace to men of good will.",
        "We praise Thee. We bless Thee. We adore Thee. We glorify Thee. "
        "We give Thee thanks for Thy great glory. O Lord God, heavenly King, "
        "God the Father almighty. O Lord Jesus Christ, the only begotten Son. "
        "O Lord God, Lamb of God, Son of the Father.",
        "Who takest away the sins of the world, have mercy on us. "
        "Who takest away the sins of the world, "
        "receive our prayer. Who sittest at the right hand of the Father, "
        "have mercy on us. For Thou only art holy. Thou only art the Lord. "
        "Thou only art most high, O Jesus Christ. "
        "Together with the Holy Spirit ✠ in the glory of God the Father.",
        Response("Amen."),
        Rubric(
            "The ritual prayer is over. Final mental prayer may follow before "
            "the Sign of the Cross."
        ),
    ],
    "la": [
        "Glória in excélsis Deo. Et in terra pax homínibus bonæ voluntátis.",
        "Laudámus te. Benedícimus te. Adorámus te. Glorificámus te. "
        "Grátias ágimus tibi propter magnam glóriam tuam. Dómine Deus, "
        "Rex cæléstis, Deus Pater omnípotens. Dómine Fili unigénite, "
        "Iesu Christe. Dómine Deus, Agnus Dei, Fílius Patris.",
        "Qui tollis peccáta mundi, miserére nobis. Qui tollis peccáta "
        "mundi, súscipe deprecatiónem nostram. Qui sedes ad déxteram "
        "Patris, miserére nobis. Quóniam tu solus Sanctus. Tu solus Dóminus. "
        "Tu solus Altíssimus, Iesu Christe. "
        "Cum Sancto Spíritu ✠ in glória Dei Patris.",
        Response("Amen."),
        Rubric(
            "Oratio statuta explícita est. Oratio mentalis sequi potest "
            "ante signum crucis."
        ),
    ],
    "el": [
        "Doxa en ypsistois Theo kai epi gis eirini en anthropois evdokia.",
        "Ymnoumen se, evlogoumen se, proskynoumen se, doxologoumen se, "
        "efcharistoumen soi, dia tin megalin sou doxan. Kyrie Vasilef, "
        "epouranie Thee, Pater pantokrator, Kyrie Yie monogenes, Iisou Christe, "
        "kai Agion Pnevma. Kyrie o Theos, o amnos tou Theou, o Yios tou Patros, "
        "o airon tin amartian tou kosmou, eleison imas, o airon tas amartias "
        "tou kosmou.",
        "Prosdexai tin deisin imon, o kathimenos en dexia tou Patros, "
        "kai eleison imas. Oti sy ei monos Agios, sy ei monos Kyrios, "
        "Iisous Christos, eis doxan Theou Patros.",
        Response("Amin."),
        Rubric(
            "I tetagmeni prosefchi etelesthi. Noera prosefchi dynatai "
            "akolouthisai pro tou simeiou tou stavrou."
        ),
    ],
    "he": [
        "Kavod ba-m’romim l’Elohim, u-va’aretz shalom b’anshei r’tzono.",
        "M’hal’lim otcha, m’var’chim otcha, mishtachavim l’cha, m’fa’arim "
        "otcha, modim l’cha al k’vodcha ha-gadol. Adonai Elohim, Melech "
        "ha-shamayim, El Av kol-yachol. Adon Yeshua ha-Mashiach, ha-Ben "
        "ha-yachid. Adonai Elohim, Seh ha-Elohim, Ben ha-Av.",
        "Ha-nose chata’ot ha-olam, rachem aleinu. Ha-nose chata’ot ha-olam, "
        "kabbel et t’filatenu. Ha-yoshev li-min ha-Av, rachem aleinu. "
        "Ki ata l’vadcha kadosh. Ata l’vadcha Adon. Ata l’vadcha elyon, "
        "Yeshua ha-Mashiach. Im Ruach ha-Kodesh ✠ bi-chvod Elohim ha-Av.",
        Response("Amen."),
        Rubric(
            "Ha-t’fila ha-k’vu’a tama. T’filat ha-lev y’chola lavo lifnei "
            "ot ha-tzlav."
        ),
    ],
}
