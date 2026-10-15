/*
 * Ordo Missae (1962) — Prayers at the foot of the altar, with a traditional hand-missal translation.
 * Plus the word-level checker used by the Mass drills.
 *
 * who: 'P' = Sacerdos (priest), 'M' = Minister (server).
 * Long prayers are split into memorable lines; `cont: true` marks a line that continues the previous one.
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
  ];

  const WHO = { P: 'Priest', S: 'Server' };
  const WHO_SHORT = { P: 'P.', S: 'S.' };

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
   */
  function contextFor(index) {
    const sig = (from, to) => LINES.slice(from, to).map(l => l.who + normWord(l.la)).join('|');
    const next = i => LINES[i].who + words(LINES[i].la).map(w => w.key).join(' ');
    let start = index, n = 0;
    while (start > 0 && n < 6 && index - start < 3) { start--; n += words(LINES[start].la).length; }
    const ambiguous = () => LINES.some((l, j) => j !== index && j - (index - start) >= 0 &&
      sig(j - (index - start), j) === sig(start, index) && next(j) !== next(index));
    while (start > 0 && ambiguous()) start--;
    return Array.from({ length: index - start }, (_, k) => start + k);
  }

  const API = { SECTIONS, LINES, WHO, WHO_SHORT, normWord, words, bare, diff, initials, contextFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Mass = API;
})(typeof self !== 'undefined' ? self : this);
