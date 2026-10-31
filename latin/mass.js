/*
 * Ordo Missae (1962) — the prayers at the foot of the altar and every server's response at Low Mass,
 * with the priest's lines that prompt them, and the prayers after Low Mass, in a traditional hand-missal translation.
 * Plus the word-level checker used by the Mass drills.
 *
 * who: 'P' = Sacerdos (priest), 'S' = Minister (server), 'A' = all together (the server's part too).
 * Long prayers are split into memorable lines; `cont: true` marks a line that continues the previous one.
 * `cue` is a rubric shown before a line whose real prompt is a variable text (the Epistle, a Collect)
 * or something said silently; a drill's lead-in never reaches back past it.
 */
(function (root) {
  'use strict';

  const SECTIONS = [
    {
      id: 'sign', title: 'In nómine Patris', subtitle: 'Sign of the Cross',
      lines: [
        { who: 'P', la: 'In nómine Patris, ✠ et Fílii, et Spíritus Sancti. Amen.', en: 'In the name of the Father, and of the Son, and of the Holy Ghost. Amen.' },
      ],
    },
    {
      id: 'antiphon', title: 'Introíbo', subtitle: 'Antiphon',
      lines: [
        { who: 'P', la: 'Introíbo ad altáre Dei.', en: 'I will go in unto the altar of God.' },
        { who: 'S', la: 'Ad Deum qui lætíficat juventútem meam.', en: 'To God, who giveth joy to my youth.' },
      ],
    },
    {
      id: 'ps42', title: 'Psalmus 42 · Júdica me', subtitle: 'Psalm 42',
      note: 'Omitted in Masses for the Dead and in Passiontide. Psalm 42 in the Vulgate numbering is Psalm 43 in Hebrew-based Bibles.',
      lines: [
        { who: 'P', la: 'Júdica me, Deus, et discérne causam meam de gente non sancta: ab hómine iníquo et dolóso érue me.',
          en: 'Judge me, O God, and distinguish my cause from the nation that is not holy: deliver me from the unjust and deceitful man.' },
        { who: 'S', la: 'Quia tu es, Deus, fortitúdo mea: quare me repulísti, et quare tristis incédo, dum afflígit me inimícus?',
          en: 'For Thou, O God, art my strength: why hast Thou cast me off? and why go I sorrowful whilst the enemy afflicteth me?' },
        { who: 'P', la: 'Emítte lucem tuam et veritátem tuam: ipsa me deduxérunt, et adduxérunt in montem sanctum tuum, et in tabernácula tua.',
          en: 'Send forth Thy light and Thy truth: they have conducted me and brought me unto Thy holy mount, and into Thy tabernacles.' },
        { who: 'S', la: 'Et introíbo ad altáre Dei: ad Deum qui lætíficat juventútem meam.',
          en: 'And I will go in unto the altar of God: unto God, who giveth joy to my youth.' },
        { who: 'P', la: 'Confitébor tibi in cíthara, Deus, Deus meus: quare tristis es, ánima mea, et quare contúrbas me?',
          en: 'To Thee, O God, my God, I will give praise upon the harp: why art thou sad, O my soul, and why dost thou disquiet me?' },
        { who: 'S', la: 'Spera in Deo, quóniam adhuc confitébor illi: salutáre vultus mei, et Deus meus.',
          en: 'Hope in God, for I will still give praise to Him: the salvation of my countenance, and my God.' },
      ],
    },
    {
      id: 'gloria', title: 'Glória Patri · Introíbo', subtitle: 'Doxology and antiphon repeated',
      lines: [
        { who: 'P', la: 'Glória Patri, et Fílio, et Spirítui Sancto.', en: 'Glory be to the Father, and to the Son, and to the Holy Ghost.' },
        { who: 'S', la: 'Sicut erat in princípio, et nunc, et semper: et in sǽcula sæculórum. Amen.', en: 'As it was in the beginning, is now, and ever shall be, world without end. Amen.' },
        { who: 'P', la: 'Introíbo ad altáre Dei.', en: 'I will go in unto the altar of God.' },
        { who: 'S', la: 'Ad Deum qui lætíficat juventútem meam.', en: 'To God, who giveth joy to my youth.' },
      ],
    },
    {
      id: 'adjutorium', title: 'Adjutórium nostrum', subtitle: 'Versicle',
      lines: [
        { who: 'P', la: 'Adjutórium nostrum ✠ in nómine Dómini.', en: 'Our help ✠ is in the name of the Lord.' },
        { who: 'S', la: 'Qui fecit cælum et terram.', en: 'Who made heaven and earth.' },
      ],
    },
    {
      id: 'confiteor-s', title: 'Confíteor · priest', subtitle: 'The priest’s Confiteor and the server’s Misereatur',
      lines: [
        { who: 'P', la: 'Confíteor Deo omnipoténti, beátæ Maríæ semper Vírgini,', en: 'I confess to almighty God, to blessed Mary ever Virgin,' },
        { who: 'P', cont: true, la: 'beáto Michaéli Archángelo, beáto Joánni Baptístæ,', en: 'to blessed Michael the Archangel, to blessed John the Baptist,' },
        { who: 'P', cont: true, la: 'sanctis Apóstolis Petro et Paulo, ómnibus Sanctis, et vobis, fratres:', en: 'to the holy Apostles Peter and Paul, to all the Saints, and to you, brethren,' },
        { who: 'P', cont: true, la: 'quia peccávi nimis cogitatióne, verbo et ópere:', en: 'that I have sinned exceedingly in thought, word, and deed:' },
        { who: 'P', cont: true, la: 'mea culpa, mea culpa, mea máxima culpa.', en: 'through my fault, through my fault, through my most grievous fault.' },
        { who: 'P', cont: true, la: 'Ídeo precor beátam Maríam semper Vírginem, beátum Michaélem Archángelum,', en: 'Therefore I beseech blessed Mary ever Virgin, blessed Michael the Archangel,' },
        { who: 'P', cont: true, la: 'beátum Joánnem Baptístam, sanctos Apóstolos Petrum et Paulum,', en: 'blessed John the Baptist, the holy Apostles Peter and Paul,' },
        { who: 'P', cont: true, la: 'omnes Sanctos, et vos, fratres, oráre pro me ad Dóminum, Deum nostrum.', en: 'all the Saints, and you, brethren, to pray to the Lord our God for me.' },
        { who: 'S', la: 'Misereátur tui omnípotens Deus, et, dimíssis peccátis tuis, perdúcat te ad vitam ætérnam.', en: 'May almighty God have mercy upon thee, forgive thee thy sins, and bring thee to life everlasting.' },
        { who: 'P', la: 'Amen.', en: 'Amen.' },
      ],
    },
    {
      id: 'confiteor-m', title: 'Confíteor · server', subtitle: 'The server’s Confiteor, Misereatur and Indulgentiam',
      note: 'Identical to the priest’s, except “et tibi, pater” and “et te, pater” in place of “et vobis, fratres” and “et vos, fratres”.',
      lines: [
        { who: 'S', la: 'Confíteor Deo omnipoténti, beátæ Maríæ semper Vírgini,', en: 'I confess to almighty God, to blessed Mary ever Virgin,' },
        { who: 'S', cont: true, la: 'beáto Michaéli Archángelo, beáto Joánni Baptístæ,', en: 'to blessed Michael the Archangel, to blessed John the Baptist,' },
        { who: 'S', cont: true, la: 'sanctis Apóstolis Petro et Paulo, ómnibus Sanctis, et tibi, pater:', en: 'to the holy Apostles Peter and Paul, to all the Saints, and to thee, Father,' },
        { who: 'S', cont: true, la: 'quia peccávi nimis cogitatióne, verbo et ópere:', en: 'that I have sinned exceedingly in thought, word, and deed:' },
        { who: 'S', cont: true, la: 'mea culpa, mea culpa, mea máxima culpa.', en: 'through my fault, through my fault, through my most grievous fault.' },
        { who: 'S', cont: true, la: 'Ídeo precor beátam Maríam semper Vírginem, beátum Michaélem Archángelum,', en: 'Therefore I beseech blessed Mary ever Virgin, blessed Michael the Archangel,' },
        { who: 'S', cont: true, la: 'beátum Joánnem Baptístam, sanctos Apóstolos Petrum et Paulum,', en: 'blessed John the Baptist, the holy Apostles Peter and Paul,' },
        { who: 'S', cont: true, la: 'omnes Sanctos, et te, pater, oráre pro me ad Dóminum, Deum nostrum.', en: 'all the Saints, and thee, Father, to pray to the Lord our God for me.' },
        { who: 'P', la: 'Misereátur vestri omnípotens Deus, et, dimíssis peccátis vestris, perdúcat vos ad vitam ætérnam.', en: 'May almighty God have mercy upon you, forgive you your sins, and bring you to life everlasting.' },
        { who: 'S', la: 'Amen.', en: 'Amen.' },
        { who: 'P', la: 'Indulgéntiam, ✠ absolutiónem, et remissiónem peccatórum nostrórum tríbuat nobis omnípotens et miséricors Dóminus.', en: 'May the almighty and merciful Lord grant us ✠ pardon, absolution, and remission of our sins.' },
        { who: 'S', la: 'Amen.', en: 'Amen.' },
      ],
    },
    {
      id: 'versicles', title: 'Deus, tu convérsus', subtitle: 'Versicles and responses',
      lines: [
        { who: 'P', la: 'Deus, tu convérsus vivificábis nos.', en: 'Thou wilt turn again, O God, and quicken us.' },
        { who: 'S', la: 'Et plebs tua lætábitur in te.', en: 'And Thy people shall rejoice in Thee.' },
        { who: 'P', la: 'Osténde nobis, Dómine, misericórdiam tuam.', en: 'Show us, O Lord, Thy mercy.' },
        { who: 'S', la: 'Et salutáre tuum da nobis.', en: 'And grant us Thy salvation.' },
        { who: 'P', la: 'Dómine, exáudi oratiónem meam.', en: 'O Lord, hear my prayer.' },
        { who: 'S', la: 'Et clamor meus ad te véniat.', en: 'And let my cry come unto Thee.' },
        { who: 'P', la: 'Dóminus vobíscum.', en: 'The Lord be with you.' },
        { who: 'S', la: 'Et cum spíritu tuo.', en: 'And with thy spirit.' },
        { who: 'P', la: 'Orémus.', en: 'Let us pray.' },
      ],
    },
    {
      id: 'ascent', title: 'Aufer a nobis · Orámus te', subtitle: 'Said quietly by the priest going up to the altar',
      lines: [
        { who: 'P', la: 'Aufer a nobis, quǽsumus, Dómine, iniquitátes nostras:', en: 'Take away from us our iniquities, we beseech Thee, O Lord;' },
        { who: 'P', cont: true, la: 'ut ad Sancta sanctórum puris mereámur méntibus introíre. Per Christum, Dóminum nostrum. Amen.', en: 'that we may be worthy to enter with pure minds into the Holy of Holies. Through Christ our Lord. Amen.' },
        { who: 'P', la: 'Orámus te, Dómine, per mérita Sanctórum tuórum, quorum relíquiæ hic sunt, et ómnium Sanctórum:', en: 'We beseech Thee, O Lord, by the merits of Thy Saints whose relics are here, and of all the Saints,' },
        { who: 'P', cont: true, la: 'ut indulgére dignéris ómnia peccáta mea. Amen.', en: 'that Thou wouldst vouchsafe to forgive me all my sins. Amen.' },
      ],
    },
    {
      id: 'kyrie', title: 'Kýrie, eléison', subtitle: 'Alternating with the priest',
      lines: [
        { who: 'P', cue: 'After the Introit, at the Epistle side', la: 'Kýrie, eléison.', en: 'Lord, have mercy.' },
        { who: 'S', la: 'Kýrie, eléison.', en: 'Lord, have mercy.' },
        { who: 'P', la: 'Kýrie, eléison.', en: 'Lord, have mercy.' },
        { who: 'S', la: 'Christe, eléison.', en: 'Christ, have mercy.' },
        { who: 'P', la: 'Christe, eléison.', en: 'Christ, have mercy.' },
        { who: 'S', la: 'Christe, eléison.', en: 'Christ, have mercy.' },
        { who: 'P', la: 'Kýrie, eléison.', en: 'Lord, have mercy.' },
        { who: 'S', la: 'Kýrie, eléison.', en: 'Lord, have mercy.' },
        { who: 'P', la: 'Kýrie, eléison.', en: 'Lord, have mercy.' },
      ],
    },
    {
      id: 'collect', title: 'Orátio', subtitle: 'The Collect',
      note: 'The usual ending. Others vary, but every one closes with per ómnia sǽcula sæculórum, the server’s cue for Amen.',
      lines: [
        { who: 'P', cue: 'After the Gloria (when said), turning to the people', la: 'Dóminus vobíscum.', en: 'The Lord be with you.' },
        { who: 'S', la: 'Et cum spíritu tuo.', en: 'And with thy spirit.' },
        { who: 'P', la: 'Orémus.', en: 'Let us pray.' },
        { who: 'P', cue: 'The Collect of the day is read, ending', la: 'Per Dóminum nostrum Jesum Christum, Fílium tuum:', en: 'Through our Lord Jesus Christ, Thy Son,' },
        { who: 'P', cont: true, la: 'qui tecum vivit et regnat in unitáte Spíritus Sancti Deus,', en: 'who liveth and reigneth with Thee in the unity of the Holy Ghost, God,' },
        { who: 'P', cont: true, la: 'per ómnia sǽcula sæculórum.', en: 'world without end.' },
        { who: 'S', la: 'Amen.', en: 'Amen.' },
      ],
    },
    {
      id: 'lessons', title: 'Epístola · Evangélium', subtitle: 'Responses at the Epistle and Gospel',
      note: 'Inítium in place of Sequéntia when the Gospel begins a book; Marcum, Lucam or Joánnem for the other Evangelists.',
      lines: [
        { who: 'S', cue: 'At the end of the Epistle', la: 'Deo grátias.', en: 'Thanks be to God.' },
        { who: 'P', cue: 'At the Gospel side, after the Munda cor meum', la: 'Dóminus vobíscum.', en: 'The Lord be with you.' },
        { who: 'S', la: 'Et cum spíritu tuo.', en: 'And with thy spirit.' },
        { who: 'P', la: 'Sequéntia ✠ sancti Evangélii secúndum Matthǽum.', en: 'The continuation ✠ of the holy Gospel according to Matthew.' },
        { who: 'S', la: 'Glória tibi, Dómine.', en: 'Glory be to Thee, O Lord.' },
        { who: 'S', cue: 'At the end of the Gospel', la: 'Laus tibi, Christe.', en: 'Praise be to Thee, O Christ.' },
      ],
    },
    {
      id: 'offertory', title: 'Oráte, fratres', subtitle: 'The Offertory and the Suscípiat',
      lines: [
        { who: 'P', cue: 'After the Gospel (and the Credo, when said), turning to the people', la: 'Dóminus vobíscum.', en: 'The Lord be with you.' },
        { who: 'S', la: 'Et cum spíritu tuo.', en: 'And with thy spirit.' },
        { who: 'P', la: 'Orémus.', en: 'Let us pray.' },
        { who: 'P', cue: 'After the Lavabo, turning to the people', la: 'Oráte, fratres: ut meum ac vestrum sacrifícium acceptábile fiat apud Deum Patrem omnipoténtem.',
          en: 'Pray, brethren, that my sacrifice and yours may be acceptable to God the Father almighty.' },
        { who: 'S', la: 'Suscípiat Dóminus sacrifícium de mánibus tuis ad laudem et glóriam nóminis sui,', en: 'May the Lord receive the sacrifice from thy hands, to the praise and glory of His name,' },
        { who: 'S', cont: true, la: 'ad utilitátem quoque nostram, totiúsque Ecclésiæ suæ sanctæ.', en: 'to our benefit also, and to that of all His holy Church.' },
        { who: 'P', la: 'Amen.', en: 'Amen.' },
      ],
    },
    {
      id: 'preface', title: 'Sursum corda', subtitle: 'The end of the Secret and the Preface dialogue',
      lines: [
        { who: 'P', cue: 'The Secret is said silently; its ending aloud', la: 'Per ómnia sǽcula sæculórum.', en: 'World without end.' },
        { who: 'S', la: 'Amen.', en: 'Amen.' },
        { who: 'P', la: 'Dóminus vobíscum.', en: 'The Lord be with you.' },
        { who: 'S', la: 'Et cum spíritu tuo.', en: 'And with thy spirit.' },
        { who: 'P', la: 'Sursum corda.', en: 'Lift up your hearts.' },
        { who: 'S', la: 'Habémus ad Dóminum.', en: 'We have lifted them up unto the Lord.' },
        { who: 'P', la: 'Grátias agámus Dómino Deo nostro.', en: 'Let us give thanks to the Lord our God.' },
        { who: 'S', la: 'Dignum et justum est.', en: 'It is meet and just.' },
      ],
    },
    {
      id: 'pater', title: 'Pater noster', subtitle: 'The Lord’s Prayer and the Pax',
      lines: [
        { who: 'P', cue: 'At the end of the Canon, aloud', la: 'Per ómnia sǽcula sæculórum.', en: 'World without end.' },
        { who: 'S', la: 'Amen.', en: 'Amen.' },
        { who: 'P', la: 'Orémus. Præcéptis salutáribus móniti, et divína institutióne formáti, audémus dícere:',
          en: 'Let us pray. Admonished by saving precepts, and following the divine directions, we presume to say:' },
        { who: 'P', la: 'Pater noster, qui es in cælis, sanctificétur nomen tuum:', en: 'Our Father, who art in heaven, hallowed be Thy name;' },
        { who: 'P', cont: true, la: 'advéniat regnum tuum: fiat volúntas tua, sicut in cælo et in terra.', en: 'Thy kingdom come; Thy will be done on earth as it is in heaven.' },
        { who: 'P', cont: true, la: 'Panem nostrum quotidiánum da nobis hódie:', en: 'Give us this day our daily bread;' },
        { who: 'P', cont: true, la: 'et dimítte nobis débita nostra, sicut et nos dimíttimus debitóribus nostris.', en: 'and forgive us our trespasses, as we forgive them that trespass against us.' },
        { who: 'P', cont: true, la: 'Et ne nos indúcas in tentatiónem.', en: 'And lead us not into temptation.' },
        { who: 'S', la: 'Sed líbera nos a malo.', en: 'But deliver us from evil.' },
        { who: 'P', la: 'Amen.', en: 'Amen.' },
        { who: 'P', cue: 'The Líbera nos is said silently; its ending aloud', la: 'Per ómnia sǽcula sæculórum.', en: 'World without end.' },
        { who: 'S', la: 'Amen.', en: 'Amen.' },
        { who: 'P', la: 'Pax ✠ Dómini sit ✠ semper ✠ vobíscum.', en: 'The peace ✠ of the Lord be ✠ always ✠ with you.' },
        { who: 'S', la: 'Et cum spíritu tuo.', en: 'And with thy spirit.' },
      ],
    },
    {
      id: 'postcommunion', title: 'Postcommúnio', subtitle: 'The Postcommunion',
      note: 'The 1962 rubrics drop the Confiteor before the people’s Communion. Where it is kept, the server says the Confiteor again, as above, and the priest answers with the Misereátur vestri and Indulgéntiam.',
      lines: [
        { who: 'P', cue: 'After the Communion verse, turning to the people', la: 'Dóminus vobíscum.', en: 'The Lord be with you.' },
        { who: 'S', la: 'Et cum spíritu tuo.', en: 'And with thy spirit.' },
        { who: 'P', la: 'Orémus.', en: 'Let us pray.' },
        { who: 'P', cue: 'The Postcommunion of the day is read, ending', la: 'Per Dóminum nostrum Jesum Christum, Fílium tuum:', en: 'Through our Lord Jesus Christ, Thy Son,' },
        { who: 'P', cont: true, la: 'qui tecum vivit et regnat in unitáte Spíritus Sancti Deus,', en: 'who liveth and reigneth with Thee in the unity of the Holy Ghost, God,' },
        { who: 'P', cont: true, la: 'per ómnia sǽcula sæculórum.', en: 'world without end.' },
        { who: 'S', la: 'Amen.', en: 'Amen.' },
      ],
    },
    {
      id: 'dismissal', title: 'Ite, missa est', subtitle: 'The dismissal and blessing',
      note: 'At a Requiem: Requiéscant in pace. — Amen, with no blessing. When a procession follows: Benedicámus Dómino. — Deo grátias.',
      lines: [
        { who: 'P', la: 'Dóminus vobíscum.', en: 'The Lord be with you.' },
        { who: 'S', la: 'Et cum spíritu tuo.', en: 'And with thy spirit.' },
        { who: 'P', la: 'Ite, missa est.', en: 'Go, the Mass is ended.' },
        { who: 'S', la: 'Deo grátias.', en: 'Thanks be to God.' },
        { who: 'P', cue: 'After the Placeat, turning to bless the people', la: 'Benedícat vos omnípotens Deus, Pater, et Fílius, ✠ et Spíritus Sanctus.',
          en: 'May almighty God bless you, the Father, and the Son, ✠ and the Holy Ghost.' },
        { who: 'S', la: 'Amen.', en: 'Amen.' },
      ],
    },
    {
      id: 'lastgospel', title: 'Inítium · Last Gospel', subtitle: 'The beginning of St John’s Gospel',
      lines: [
        { who: 'P', cue: 'At the Gospel side', la: 'Dóminus vobíscum.', en: 'The Lord be with you.' },
        { who: 'S', la: 'Et cum spíritu tuo.', en: 'And with thy spirit.' },
        { who: 'P', la: 'Inítium ✠ sancti Evangélii secúndum Joánnem.', en: 'The beginning ✠ of the holy Gospel according to John.' },
        { who: 'S', la: 'Glória tibi, Dómine.', en: 'Glory be to Thee, O Lord.' },
        { who: 'P', cue: 'John 1:1–14 is read, ending', la: 'Et Verbum caro factum est, et habitávit in nobis: et vídimus glóriam ejus, glóriam quasi Unigéniti a Patre, plenum grátiæ et veritátis.',
          en: 'And the Word was made flesh, and dwelt among us; and we saw His glory, the glory as it were of the Only-begotten of the Father, full of grace and truth.' },
        { who: 'S', la: 'Deo grátias.', en: 'Thanks be to God.' },
      ],
    },
    {
      id: 'ave-salve', title: 'Ave María · Salve, Regína', subtitle: 'Prayers after Low Mass',
      note: 'The Ave María is said three times, the priest leading and the server and people answering.',
      lines: [
        { who: 'P', cue: 'After the Last Gospel, kneeling at the foot of the altar', la: 'Ave María, grátia plena; Dóminus tecum:', en: 'Hail Mary, full of grace; the Lord is with thee:' },
        { who: 'P', cont: true, la: 'benedícta tu in muliéribus, et benedíctus fructus ventris tui, Jesus.', en: 'blessed art thou among women, and blessed is the fruit of thy womb, Jesus.' },
        { who: 'S', la: 'Sancta María, Mater Dei, ora pro nobis peccatóribus,', en: 'Holy Mary, Mother of God, pray for us sinners,' },
        { who: 'S', cont: true, la: 'nunc et in hora mortis nostræ. Amen.', en: 'now and at the hour of our death. Amen.' },
        { who: 'A', cue: 'After the third Ave', la: 'Salve, Regína, Mater misericórdiæ; vita, dulcédo et spes nostra, salve.', en: 'Hail, holy Queen, Mother of mercy; our life, our sweetness and our hope, hail.' },
        { who: 'A', cont: true, la: 'Ad te clamámus, éxsules fílii Hevæ.', en: 'To thee do we cry, poor banished children of Eve.' },
        { who: 'A', cont: true, la: 'Ad te suspirámus, geméntes et flentes in hac lacrimárum valle.', en: 'To thee do we send up our sighs, mourning and weeping in this valley of tears.' },
        { who: 'A', cont: true, la: 'Eia ergo, advocáta nostra, illos tuos misericórdes óculos ad nos convérte.', en: 'Turn then, most gracious advocate, thine eyes of mercy towards us.' },
        { who: 'A', cont: true, la: 'Et Jesum, benedíctum fructum ventris tui, nobis post hoc exsílium osténde.', en: 'And after this our exile show unto us the blessed fruit of thy womb, Jesus.' },
        { who: 'A', cont: true, la: 'O clemens, o pia, o dulcis Virgo María.', en: 'O clement, O loving, O sweet Virgin Mary.' },
        { who: 'P', la: 'Ora pro nobis, sancta Dei Génetrix.', en: 'Pray for us, O holy Mother of God.' },
        { who: 'S', la: 'Ut digni efficiámur promissiónibus Christi.', en: 'That we may be made worthy of the promises of Christ.' },
      ],
    },
    {
      id: 'michael', title: 'Deus, refúgium · Sancte Míchaël', subtitle: 'Prayers after Low Mass, concluded',
      note: 'Cor Jesu sacratíssimum is said three times.',
      lines: [
        { who: 'P', la: 'Orémus.', en: 'Let us pray.' },
        { who: 'P', la: 'Deus, refúgium nostrum et virtus, pópulum ad te clamántem propítius réspice;', en: 'O God, our refuge and our strength, look down in mercy on Thy people who cry to Thee;' },
        { who: 'P', cont: true, la: 'et intercedénte gloriósa et immaculáta Vírgine Dei Genetríce María, cum beáto Joseph, ejus Sponso,',
          en: 'and by the intercession of the glorious and immaculate Virgin Mary, Mother of God, of blessed Joseph her spouse,' },
        { who: 'P', cont: true, la: 'ac beátis Apóstolis tuis Petro et Paulo, et ómnibus Sanctis,', en: 'of Thy blessed Apostles Peter and Paul, and of all the Saints,' },
        { who: 'P', cont: true, la: 'quas pro conversióne peccatórum, pro libertáte et exaltatióne sanctæ Matris Ecclésiæ, preces effúndimus, miséricors et benígnus exáudi.',
          en: 'in mercy and goodness hear the prayers which we pour forth for the conversion of sinners, and for the liberty and exaltation of holy Mother Church.' },
        { who: 'P', cont: true, la: 'Per eúndem Christum Dóminum nostrum.', en: 'Through the same Christ our Lord.' },
        { who: 'S', la: 'Amen.', en: 'Amen.' },
        { who: 'A', la: 'Sancte Míchaël Archángele, defénde nos in prǽlio;', en: 'Holy Michael Archangel, defend us in battle;' },
        { who: 'A', cont: true, la: 'contra nequítiam et insídias diáboli esto præsídium.', en: 'be our safeguard against the wickedness and snares of the devil.' },
        { who: 'A', cont: true, la: 'Ímperet illi Deus, súpplices deprecámur:', en: 'May God rebuke him, we humbly pray:' },
        { who: 'A', cont: true, la: 'tuque, Princeps milítiæ cæléstis, sátanam aliósque spíritus malígnos,', en: 'and do thou, O Prince of the heavenly host, Satan and the other evil spirits,' },
        { who: 'A', cont: true, la: 'qui ad perditiónem animárum pervagántur in mundo, divína virtúte in inférnum detrúde. Amen.',
          en: 'who prowl about the world seeking the ruin of souls, by the power of God thrust down to hell. Amen.' },
        { who: 'A', la: 'Cor Jesu sacratíssimum, miserére nobis.', en: 'Most Sacred Heart of Jesus, have mercy on us.' },
      ],
    },
  ];

  const WHO = { P: 'Priest', S: 'Server', A: 'All' };
  const WHO_SHORT = { P: 'P.', S: 'S.', A: 'All' };

  // Flat list in liturgical order; each line knows its section and position.
  const LINES = [];
  SECTIONS.forEach(sec => sec.lines.forEach(line => {
    line.section = sec.id;
    line.index = LINES.length;
    LINES.push(line);
  }));

  // ─── Text comparison ──────────────────────────────────────────────────────

  /** Spelling-insensitive word key: no accents, æ→ae, œ→oe, j→i, v→u, no punctuation. */
  function normWord(w) {
    return w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/j/g, 'i').replace(/v/g, 'u').replace(/[^a-z]/g, '');
  }

  /** Words of a text, each with its printed form and comparison key. The ✠ rubric is dropped. */
  function words(text) {
    return text.split(/\s+/).map(raw => ({ raw, key: normWord(raw) })).filter(w => w.key);
  }

  /** Bare word as it would appear on a tile: punctuation removed, spelling kept. */
  function bare(raw) { return raw.replace(/[^\p{L}]/gu, ''); }

  /**
   * Word-level diff of an attempt against the text (longest common subsequence).
   * exp[i].ok: that word of the text was reproduced; got[i].ok: that typed word belongs.
   */
  function diff(expected, typed) {
    const a = words(expected), b = words(typed);
    const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = a.length - 1; i >= 0; i--) {
      for (let j = b.length - 1; j >= 0; j--) {
        dp[i][j] = a[i].key === b[j].key ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const exp = a.map(w => ({ raw: w.raw, ok: false }));
    const got = b.map(w => ({ raw: w.raw, ok: false }));
    for (let i = 0, j = 0; i < a.length && j < b.length;) {
      if (a[i].key === b[j].key) { exp[i].ok = got[j].ok = true; i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
    const matched = dp[0][0];
    return { exp, got, matched, total: a.length, correct: matched === a.length && b.length === a.length };
  }

  /** First letter of each word with punctuation kept — the classic memorization prompt. */
  function initials(text) {
    return text.normalize('NFC').replace(/\p{L}+/gu, w => [...w][0]);
  }

  /**
   * Indices of the lines to show before line `index` in a "what comes next" question:
   * at least ~6 words, and more if the same lead-in occurs elsewhere with a different continuation
   * (e.g. "Ad Deum qui lætíficat…" leads to Júdica me the first time and to Adjutórium the second).
   * A line with a cue starts the lead-in (its rubric is the prompt), so a cued line itself gets none.
   */
  function contextFor(index) {
    const sig = (from, to) => LINES.slice(from, to).map(cueSig).join('|');
    const next = i => LINES[i].who + words(LINES[i].la).map(w => w.key).join(' ');
    let start = index, n = 0;
    while (start > 0 && n < 6 && index - start < 3 && !LINES[start].cue) { start--; n += words(LINES[start].la).length; }
    const ambiguous = () => LINES.some((l, j) => j !== index && j - (index - start) >= 0 &&
      sig(j - (index - start), j) === sig(start, index) && next(j) !== next(index));
    while (start > 0 && !LINES[start].cue && ambiguous()) start--;
    return Array.from({ length: index - start }, (_, k) => start + k);
  }

  /** What a reader sees of a line in a lead-in: speaker, any rubric, and the words. */
  function cueSig(l) { return l.who + (l.cue || '') + normWord(l.la); }

  const API = { SECTIONS, LINES, WHO, WHO_SHORT, normWord, words, bare, diff, initials, contextFor, cueSig };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Mass = API;
})(typeof self !== 'undefined' ? self : this);
