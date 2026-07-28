"""Fixed prayer texts and rotating verse/saint lists for the morning prayer page.

Texts follow traditional English wording (Douay-Rheims flavor). Each section
body is a list of paragraphs; a paragraph may be:
  - a plain string, rendered as a paragraph;
  - a (versicle, response) tuple, rendered as a V/R pair;
  - a Bilingual, rendered as "English / Latin" on one line;
  - an Antiphon, rendered with an "Ant." label;
  - a Rubric, rendered as a red italic instruction;
  - a Subheading, rendered as a small heading within the section;
  - a Response, rendered as a lone response line.
"""

from dataclasses import dataclass


@dataclass
class Bilingual:
    english: str
    other: str


@dataclass
class Antiphon:
    text: str


@dataclass
class Rubric:
    text: str


@dataclass
class Subheading:
    text: str


@dataclass
class Response:
    text: str


SIGN_OF_THE_CROSS = [
    "✠ In the name of the Father, and of the Son, and of the Holy Spirit.",
    Response("Amen."),
]

INVOCATION_OF_THE_HOLY_SPIRIT = [
    ("Come, Holy Spirit, fill the hearts of Thy faithful and kindle in them the fire of Thy love.",
     "Send forth Thy Spirit, and they shall be created; and Thou shalt renew the face of the earth."),
    "Let us pray.",
    "O God, Who by the light of the Holy Spirit didst instruct the hearts of the faithful, "
    "grant that by the same Holy Spirit we may be truly wise and ever rejoice in His "
    "consolations. Through Christ our Lord.",
    Response("Amen."),
]

TRIDENTINE_CREED = {
    "english": [
        "I, N., with a firm faith believe and profess each and everything which is contained in the Creed which the Holy Roman Church maketh use of. To wit:",
        "I believe in one God, The Father Almighty, Maker of heaven and earth, and of all things visible and invisible. And in one Lord, Jesus Christ, the Only-begotten Son of God. Born of the Father before all ages. God of God, Light of Light, true God of true God. Begotten, not made, of one substance with the Father. By whom all things were made. Who for us men and for our salvation came down from heaven. And became incarnate by the Holy Spirit of the Virgin Mary: and was made man. He was also crucified for us, suffered under Pontius Pilate, and was buried. And on the third day He rose again according to the Scriptures. He ascended into heaven and sits at the right hand of the Father. He will come again in glory to judge the living and the dead and His kingdom will have no end. And in the Holy Spirit, the Lord and Giver of life, Who proceeds from the Father and the Son. Who together with the Father and the Son is adored and glorified, and who spoke through the prophets. And one holy, Catholic and Apostolic Church. I confess one baptism for the forgiveness of sins and I await the resurrection of the dead and the life of the world to come. Amen.",
        "The Apostolic and Ecclesiastical traditions and all other observances and constitutions of that same Church I firmly admit to and embrace.",
        "I also accept the Holy Scripture according to that sense which holy mother the Church hath held, and doth hold, and to whom it belongeth to judge the true sense and interpretations of the Scriptures. Neither will I ever take and interpret them otherwise than according to the unanimous consent of the Fathers.",
        "I also profess that there are truly and properly Seven Sacraments of the New Law, instituted by Jesus Christ our Lord, and necessary for the salvation of mankind, though not all are necessary for everyone; to wit, Baptism, Confirmation, Eucharist, Penance, Extreme Unction, Holy Orders, and Matrimony; and that they confer grace; and that of these, Baptism, Confirmation, and Holy Orders cannot be repeated without sacrilege. I also receive and admit the accepted and approved ceremonies of the Catholic Church in the solemn administration of the aforesaid sacraments.",
        "I embrace and accept each and everything which has been defined and declared in the holy Council of Trent concerning original sin and justification.",
        "I profess, likewise, that in the Mass there is offered to God a true, proper, and propitiatory sacrifice for the living and the dead; and that in the most holy sacrament of the Eucharist there is truly, really, and substantially, the Body and Blood, together with the soul and divinity, of our Lord Jesus Christ; and that a conversion takes place of the whole substance of the bread into the Body, and of the whole substance of the wine into the Blood, which conversion the Catholic Church calls Transubstantiation. I also confess that under either species alone Christ is received whole and entire, and a true sacrament.",
        "I steadfastly hold that there is a Purgatory, and that the souls therein detained are helped by the suffrages of the faithful. Likewise, that the saints, reigning together with Christ, are to be honored and invoked, and that they offer prayers to God for us, and that their relics are to be venerated. I most firmly assert that the images of Christ, of the Mother of God, ever virgin, and also of other Saints, ought to be kept and retained, and that due honor and veneration is to be given them.",
        "I also affirm that the power of indulgences was left by Christ in the Church, and that the use of them is most wholesome to Christian people.",
        "I acknowledge the Holy Catholic Apostolic Roman Church as the mother and teacher of all churches; and I promise true obedience to the Bishop of Rome, successor to St. Peter, Prince of the Apostles, and Vicar of Jesus Christ.",
        "I likewise undoubtedly receive and profess all other things delivered, defined, and declared by the sacred Canons, and general Councils, and particularly by the holy Council of Trent, and by the ecumenical Council of the Vatican, particularly concerning the primacy of the Roman Pontiff and his infallible teaching. I condemn, reject, and anathematize all things contrary thereto, and all heresies which the Church hath condemned, rejected, and anathematized.",
        "This true Catholic faith, outside of which no one can be saved, which I now freely profess and to which I truly adhere, I do so profess and swear to maintain inviolate and with firm constancy with the help of God until the last breath of life. And I shall strive, as far as possible, that this same faith shall be held, taught, and professed by all those over whom I have charge. I N. do so pledge, promise, and swear, so help me God and these Holy Gospels of God.",
        Response("Amen."),
    ],
    "latin": [
        "Ego N. firma fide credo et profiteor omnia et singula, quae continentur in Symbolo, quo Sancta Romana ecclesia utitur, videlicet:",
        "Credo in unum Deum, Patrem omnipotentem, factorem caeli et terrae, visibilium omnium et invisibilium. Et in unum Dominum Iesum Christum, Filium Dei unigenitum, et ex Patre natum ante omnia saecula. Deum de Deo, Lumen de Lumine, Deum verum de Deo vero, genitum non factum, consubstantialem Patri; per quem omnia facta sunt. Qui propter nos homines et propter nostram salutem descendit de caelis. Et incarnatus est de Spiritu Sancto ex Maria Virgine, et homo factus est. Crucifixus etiam pro nobis sub Pontio Pilato, passus et sepultus est, et resurrexit tertia die, secundum Scripturas, et ascendit in caelum, sedet ad dexteram Patris. Et iterum venturus est cum gloria, iudicare vivos et mortuos, cuius regni non erit finis. Et in Spiritum Sanctum, Dominum et vivificantem, qui ex Patre Filioque procedit. Qui cum Patre et Filio simul adoratur et conglorificatur: qui locutus est per prophetas. Et unam, sanctam, catholicam et apostolicam Ecclesiam. Confiteor unum baptisma in remissionem peccatorum. Et expecto resurrectionem mortuorum, et vitam venturi saeculi. Amen.",
        "Apostolicas et Ecclesiasticas traditiones reliquasque eiusdem ecclesiae observationes et constitutiones firmissime admitto et amplector.",
        "Item sacram Scripturam iuxta eum sensum, quem tenuit et tenet sancta Mater Ecclesia, cuius est iudicare de vero sensu et interpretatione sacrarum Scripturarum, admitto; nec eam umquam nisi iuxta unanimem consensum Patrum, accipiam et interpretabor.",
        "Profiteor quoque septem esse vere et proprie Sacramenta novae legis a Iesu Christo Domino nostro instituta, atque ad salutem humani generis, licet non omnia singulis, necessaria: scilicet Baptismum, Confirmationem, Eucharistiam, Paenitentiam, Extremam Unctionem, Ordinem et Matrimonium; illaque gratiam conferre; et ex his Baptismum, Confirmationem et Ordinem sine sacrilegio reiterari non posse. Receptos quoque et approbatos Ecclesiae catholicae ritus in supradictorum omnium Sacramentorum solemni administratione recipio et admitto.",
        "Omnia et singula, quae de peccato originali et de iustificatione in sacrosancta Tridentina Synodo definita et declarata fuerunt, amplector et recipio.",
        "Profiteor pariter, in Missa offerri Deo verum, proprium et propitiatorium sacrificium pro vivis et defunctis. Atque in sanctissimo Eucharistiae Sacramento esse vere, realiter et substantialiter Corpus et Sanguinem, una cum anima et divinitate Domini nostri Iesu Christi, fierique conversionem totius substantiae panis in Corpus ac totius substantiae vini in Sanguinem, quam conversionem Ecclesia catholica transubstantiationem appellat. Fateor etiam sub altera tantum specie totum atque integrum Christum verumque Sacramentum sumi.",
        "Constanter teneo, Purgatorium esse, animasque ibi detentas fidelium suffragiis iuvari. Similiter et Sanctos, una cum Christo regnantes, venerandos atque invocandos esse, eosque orationes Deo pro nobis offerre, atque eorum reliquias esse venerandas. Firmiter2 assero, imagines Christi ac Deiparae semper Virginis, necnon aliorum Sanctorum habendas et retinendas esse, atque eis debitum honorem et venerationem impertiendam.",
        "Indulgentiarum etiam potestatem a Christo in Ecclesia relictam fuisse, illarumque usum Christiano populo maxime salutarem esse affirmo.",
        "Sanctam, catholicam et apostolicam Romanam Ecclesiam omnium ecclesiarum matrem et magistram agnosco, Romanoque Pontifici, beati Petri Apostolorum principis successori, ac Iesu Christi Vicario, veram oboedientiam spondeo ac iuro.",
        "Cetera item omnia a sacris canonibus et oecumenicis Conciliis, ac praecipue a sacrosancta Tridentina Synodo, et ab oecumenico Concilio Vaticano tradita, definita et declarata, praesertim de Romani Pontificis Primatu et infallibili Magisterio, indubitanter recipio ac profiteor; simulque contraria omnia, atque haereses quascumque ab Ecclesia damnatas et reiectas et anathematizatas ego pariter damno, reicio, et anathematizo.",
        "Hanc veram Catholicam Fidem, extra quam nemo salvus esse potest, quam in praesenti sponte profiteor et veraciter teneo, eandem integram, et immaculatam usque ad extremum vitae spiritum, constantissime, Deo adiuvante, retinere et confiteri, atque a meis subditis, vel illis, quorum cura ad me in munere meo spectabit, teneri, doceri et praedicari, quantum in me erit, curaturum, ego idem N. spondeo, voveo ac iuro. Sic me Deus adiuvet et haec sancta Dei Evangelia.",
        Response("Amen."),
    ],
}

ACTS = [
    Rubric("Act of Faith"),
    "O my God, I firmly believe that you are one God in three divine Persons, Father, Son, and Holy Spirit. "
    "I believe that your divine Son became man and died for our sins and that he will come to judge the living and the dead. "
    "I believe these and all the truths which the Holy Catholic Church teaches because you have revealed them who are eternal truth and wisdom, "
    "who can neither deceive nor be deceived. In this faith I intend to live and die.",
    Response("Amen."),
    Rubric("Act of Hope"),
    "O Lord God, I hope by your grace for the pardon of all my sins and after life here "
    "to gain eternal happiness because you have promised it who are infinitely powerful, "
    "faithful, kind, and merciful. In this hope I intend to live and die.",
    Response("Amen."),
    Rubric("Act of Love"),
    "O Lord God, I love you above all things and I love my neighbor for your sake "
    "because you are the highest, infinite and perfect good, worthy of all my love. "
    "In this love I intend to live and die.",
    Response("Amen."),
]

ACT_OF_CONTRITION = [
    (
        "Act of Sorrow",
        "O God of my soul, I am sincerely sorry for not having loved You. Instead of having loved You, I have, for the sake of my pleasures, "
        "offended and despised Your infinite goodness: I have turned my back on You; in a word, O my God, I have lost You through my own will. "
        "Lord, I am sorry, from the bottom of my heart, for all my sins. I hate above all things the offenses, which I have committed against You. "
        "You have already cleansed me from the stain of sin in the sacrament of penance, but I desire to become still purer in Your sight. "
        "Wash in Your Blood this soul, and make it Your dwelling place.",
    ),
    (
        "O my God",
        "O my God, I am heartily sorry for having offended Thee, and I detest all of my sins "
        "because I fear the loss of Heaven and the pains of Hell, but most of all because they offend Thee, my God, "
        "Who art all good and deserving of all of my love. I firmly resolve, with the help of Thy grace, to sin no more, to avoid the near occasion of sin, and to do penance. "
        "Our Lord Jesus Christ died on the Cross for my sins. In His name,"
    ),
    (
        "Confiteor",
        "I confess to Almighty God, to blessed Mary ever Virgin, to blessed Michael the "
        "Archangel, to blessed John the Baptist, to the holy Apostles Peter and Paul, and to "
        "all the Saints, that I have sinned exceedingly in thought, word, and deed: (strikes his breast) through my "
        "fault, through my fault, through my most grievous fault. Therefore I beseech blessed "
        "Mary ever Virgin, blessed Michael the Archangel, blessed John the Baptist, the holy "
        "Apostles Peter and Paul, and all the Saints, to pray for me to the Lord our God. "
        "May Almighty God have mercy on me, forgive me my sins, and bring me to everlasting "
        "life.",
    ),
]

KYRIE = [
    Bilingual("Lord, have mercy.", "Kýrie, eléison."),
    Bilingual("Christ, have mercy.", "Christe, eléison."),
    Bilingual("Lord, have mercy.", "Kýrie, eléison."),
]

# The Our Father takes no Amen here: the embolism follows it directly, as at
# Mass, and the Amen answers the embolism's conclusion.
LORDS_PRAYER = (
    "Our Father, Who art in Heaven, hallowed be Thy name; Thy kingdom come; Thy will be done on "
    "earth as it is in Heaven. Give us this day our daily bread; and forgive us our trespasses "
    "as we forgive those who trespass against us; and lead us not into temptation, but deliver "
    "us from evil."
)

# English of the Libera nos as in the Tridentine Mass.
EMBOLISM = (
    "Deliver us, we beseech Thee, O Lord, from all evils, past, present, and to come; and by "
    "the intercession of the blessed and glorious ever-Virgin Mary, Mother of God, together "
    "with Thy blessed apostles Peter and Paul, and Andrew, and all the Saints, mercifully "
    "grant peace in our days: that through the bounteous help of Thy mercy we may be always "
    "free from sin, and safe from all disquiet. Through the same Jesus Christ, Thy Son, our "
    "Lord, Who liveth and reigneth with Thee in the unity of the Holy Ghost, God, world "
    "without end."
)

KYRIE_AND_LORDS_PRAYER = KYRIE + [LORDS_PRAYER, EMBOLISM, Rubric("(Silent prayer to God the Father is encouraged here after the embolism)"), Response("Amen.")]

# The user picks one on the page; the choice is remembered by the browser.
# Each text is followed on the page by the response "Amen." — do not end the
# texts themselves with Amen. "Saint N." is a placeholder for a patron saint.
MORNING_OFFERINGS = [
    (
        "O Jesus, through the Immaculate Heart",
        "O Jesus, through the Immaculate Heart of Mary, I offer Thee my prayers, works, joys, "
        "and sufferings of this day, for all the intentions of Thy Sacred Heart, in union with "
        "the Holy Sacrifice of the Mass throughout the world, in reparation for my sins, for "
        "the intentions of all my relatives and friends, and in particular for the intentions "
        "of the Holy Father.",
    ),
    (
        "O Jesus, I come before You",
        "O Jesus, I come before you at the beginning of this day, I gaze at your face, I look "
        "upon your side pierced by the lance. Your wounded heart speaks to me of God's love "
        "poured out for us. Take, Lord, and receive my heart: the words of faith that I speak, "
        "the works of justice I would do, my joys and sufferings. When I come to the "
        "Eucharistic altar, gather my offerings to your own for the life of the world. At the "
        "end of the day, place me with Mary, your mother, with Saint N. and all the saints by "
        "your side, forever surrounded by your love.",
    ),
    (
        "Eternal Father",
        "Eternal Father, I offer You everything I do this day: my work, my prayers, my "
        "apostolic efforts; my time with family and friends; my hours of relaxation; my "
        "difficulties, problems, distress, which I shall try to bear with patience. Join "
        "these, my gifts, to the unique offering which Jesus Christ, Your Son, renews today "
        "in the Eucharist. Grant, I pray, that, vivified by the Holy Spirit and united to the "
        "Sacred Heart of Jesus and the Immaculate Heart of Mary, my life this day may be of "
        "service to You and to Your children and help consecrate the world to You.",
    ),
    (
        "God, our Father",
        "God, our Father, I offer you my day, my prayers, thoughts and words, my actions, "
        "joys, and sufferings in union with the Christ your Son, for the salvation of the "
        "world. May the Holy Spirit, who guided Jesus, be my guide and my strength today so "
        "that I may witness to your love. With Mary, the mother of our Lord and the Church, "
        "with Saint N. and all your saints I pray for my family and friends, for the sick and "
        "the suffering, those at home and those who are travelling (mention other particular "
        "intentions) and all the clergy and religious especially our Holy Father N. and "
        "bishop N. both of whose intentions I commend to your goodness.",
    ),
    (
        "Short Offering",
        "Heavenly Father, I offer you this day all that I do and think and say uniting it in "
        "the power of the Holy Spirit with what was done by Jesus Christ, your only Son.",
    ),
]

# Fixed invocations said every day; two saints from SAINTS_ROTATION are added
# after these, chosen by the date. The section opens with a second Kyrie, as
# the Litany of the Saints does.
INVOCATION_OF_THE_SAINTS_FIXED = [
    ("Holy Mary, Mother of God,", "pray for us."),
    ("Saint John the Baptist,", "pray for us."),
    ("Saint Joseph,", "pray for us."),
    ("Saints Peter and Paul,", "pray for us."),
    ("Saint John the Evangelist,", "pray for us."),
    ("Saint Michael the Archangel,", "pray for us."),
    ("Saint Raphael the Archangel,", "pray for us."),
]

INVOCATION_OF_THE_SAINTS_CLOSE = [
    ("Angel of God, my guardian dear, to whom God's love commits me here, ever this day be at my side, to light and guard, to rule and guide.", "Amen"),
    Rubric("(Other saints may be added)"),
    ("All ye holy Martyrs, Angels, Virgins, Apostles, and Saints of God,", "intercede for us."),
]

SAINTS_ROTATION = [
    "Saint Augustine of Hippo",
    "Saint Benedict",
    "Saint Dominic",
    "Saint Francis of Assisi",
    "Saint Thomas Aquinas",
    "Saint Ignatius of Antioch",
    "Saint Ignatius of Loyola",
    "Saint Teresa of Avila",
    "Saint Thérèse of Lisieux of the Child Jesus and the Holy Face",
    "Saint John of the Cross",
]

# Suffrage of the Saints from the Divino Afflatu Lauds/Vespers offices.
SUFFRAGE = [
    Antiphon("May the Blessed Virgin Mary, Mother of God, and all the Saints intercede for us "
             "with the Lord."),
    ("The Lord hath made his holy one wonderful:",
     "The Lord will hear me when I cry unto him."),
    Rubric("At the letter N., the name of the Titular of the local church is said, if the "
           "title is not a divine person or a mystery of the Lord, and when the name is not already "
           "in the prayer, the names of the holy Angels and of St. John the Baptist, if they "
           "are titulars, are said before the name of St. Joseph. In all these cases, the "
           "words blessed N. are omitted."),
    "Let us pray.",
    "O Lord, we ask thee to save us from dangers to mind and to body: and, by the "
    "intercession of the blessed and glorious Virgin Mother of God, blessed Joseph, the "
    "blessed Apostles Peter and Paul, blessed N. and all the Saints, to eliminate all enmity "
    "and errors, that thy Church may safely serve thee in freedom.",
    "Through the same Jesus Christ, thy Son, Our Lord, Who liveth and reigneth with thee in "
    "the unity of the Holy Ghost, God, world without end.",
    Response("Amen."),
]

# The Actiones nostras collect, said before the Doxology.
CLOSING_PRAYER = [
    "Let us pray.",
    "Lord, may everything we do begin with your inspiration and continue with your help, so "
    "that all our prayers and works may begin in you and by you be happily ended. We ask this "
    "through Christ our Lord.",
    Response("Amen."),
]

# As given by Jesus in the Gospel of Mark (Douay-Rheims).
DOXOLOGY = [
    "The first commandment of all is,",
    "Hear, O Israel: the Lord thy God is one God. "
    "And thou shalt love the Lord thy God with thy whole heart, and with thy whole soul, and "
    "with thy whole mind, and with thy whole strength. This is the first commandment. "
    "And the second is like to it: Thou shalt love thy neighbour as thyself. ",
    "There is no other commandment greater than these. "
    "(Mark 12:29-31)",
]

# One is chosen per day by date, so the verse changes each morning.
CLOSING_VERSES_FOR_THE_DAY = [
    "This is the day which the Lord hath made: let us be glad and rejoice therein. (Psalm 117:24)",
    "O Lord, in the morning Thou shalt hear my voice: in the morning I will stand before Thee, "
    "and will see. (Psalm 5:4-5)",
    "Let the words of my mouth and the meditation of my heart be acceptable in Thy sight, O Lord, "
    "my helper and my Redeemer. (Psalm 18:15)",
    "Cast thy care upon the Lord, and He shall sustain thee. (Psalm 54:23)",
    "The Lord is my light and my salvation: whom shall I fear? (Psalm 26:1)",
    "Watch ye, and pray that ye enter not into temptation: the spirit indeed is willing, but the "
    "flesh is weak. (Matthew 26:41)",
    "I can do all things in Him Who strengtheneth me. (Philippians 4:13)",
    "My grace is sufficient for thee: for power is made perfect in infirmity. (2 Corinthians 12:9)",
    "Be ye therefore perfect, as also your heavenly Father is perfect. (Matthew 5:48)",
    "Seek ye therefore first the kingdom of God and His justice: and all these things shall be "
    "added unto you. (Matthew 6:33)",
    "In peace in the selfsame I will sleep, and I will rest: for Thou, O Lord, singularly hast "
    "settled me in hope. (Psalm 4:9-10)",
    "Create a clean heart in me, O God: and renew a right spirit within my bowels. (Psalm 50:12)",
]

CLOSING_VERSES = [
    ("May the divine assistance ✠ remain always with us.", "Amen."),
    ("May the souls ✠ of the faithful departed, through the mercy of God, rest in peace.", "Amen."),
    ("Eternal rest grant unto them, O Lord;", "and let perpetual light shine upon them."),
]
