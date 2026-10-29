/*
 * Latin engine — vocabulary, morphology, sentence generator, parser and answer checkers.
 *
 * Pure logic, no DOM. Everything the UI shows is produced here by rule, and every
 * generated sentence is re-parsed before it is handed out, so the generator and the
 * checker can never disagree.
 *
 * Meaning representation ("M"), shared by generator, parser and English matcher:
 *   { verb, person, num, inf, subj, obj, dat, pp, pred }
 *   verb   finite verb id (e.g. 'amare'); person 1..3; num 'sg' | 'pl'
 *   inf    complementary infinitive id or null (only after verbs with takesInf)
 *   subj   explicit subject NP or null (null = subject implied by the verb ending)
 *   obj    direct object NP or null; dat indirect object NP or null
 *   pp     prepositional phrase or null: NP plus { prep: 'in' | 'ad', case: 'abl' | 'acc' }
 *          (obj/dat/pp belong to the infinitive when there is one, otherwise to the verb)
 *   pred   predicate nominative NP or null (only with esse: "puer amīcus est")
 *   NP     { n: noun id, num, gen: { n, num } | null, and: NP | null }
 *          and = a second noun joined by et / -que (its conj: 'et' | 'que' is style, not meaning)
 */
(function (root) {
  'use strict';

  // ─── Inflection tables ────────────────────────────────────────────────────

  const CASES = ['nom', 'gen', 'dat', 'acc', 'abl'];
  const NUMS = ['sg', 'pl'];
  const CASE_NAMES = { nom: 'Nominative', gen: 'Genitive', dat: 'Dative', acc: 'Accusative', abl: 'Ablative' };
  const NUM_NAMES = { sg: 'Singular', pl: 'Plural' };

  const DECL1 = {
    sg: { nom: 'a', gen: 'ae', dat: 'ae', acc: 'am', abl: 'ā' },
    pl: { nom: 'ae', gen: 'ārum', dat: 'īs', acc: 'ās', abl: 'īs' },
  };
  // 2nd declension: masculine in -us (or -er, whose nominative singular is listed on the noun), and neuter in -um
  const DECL2 = {
    sg: { nom: 'us', gen: 'ī', dat: 'ō', acc: 'um', abl: 'ō' },
    pl: { nom: 'ī', gen: 'ōrum', dat: 'īs', acc: 'ōs', abl: 'īs' },
  };
  const DECL2N = {
    sg: { nom: 'um', gen: 'ī', dat: 'ō', acc: 'um', abl: 'ō' },
    pl: { nom: 'a', gen: 'ōrum', dat: 'īs', acc: 'a', abl: 'īs' },
  };
  const DECLS = { 1: DECL1, 2: DECL2, '2n': DECL2N };
  const DECL_NAMES = { 1: '1st declension', 2: '2nd declension', '2n': '2nd declension neuter' };

  const PERSONS = ['1sg', '2sg', '3sg', '1pl', '2pl', '3pl'];
  const PERSON_NAMES = {
    '1sg': '1st person singular', '2sg': '2nd person singular', '3sg': '3rd person singular',
    '1pl': '1st person plural', '2pl': '2nd person plural', '3pl': '3rd person plural',
  };
  const CONJ1 = { '1sg': 'ō', '2sg': 'ās', '3sg': 'at', '1pl': 'āmus', '2pl': 'ātis', '3pl': 'ant', inf: 'āre' };

  // ─── Vocabulary ───────────────────────────────────────────────────────────
  // kind: 'person' nouns can act (subjects), receive (indirect objects) and own (genitives).

  const NOUNS = [
    { id: 'agricola', stem: 'agricol', gender: 'm', kind: 'person', en: [['farmer', 'farmers']] },
    { id: 'rosa', stem: 'ros', gender: 'f', kind: 'thing', en: [['rose', 'roses']] },
    { id: 'filia', stem: 'fīli', gender: 'f', kind: 'person', en: [['daughter', 'daughters']],
      alt: { 'pl.dat': ['fīliābus'], 'pl.abl': ['fīliābus'] } },
    { id: 'regina', stem: 'rēgīn', gender: 'f', kind: 'person', en: [['queen', 'queens']] },
    { id: 'aqua', stem: 'aqu', gender: 'f', kind: 'thing', en: [['water', 'waters']] },
    { id: 'puella', stem: 'puell', gender: 'f', kind: 'person', en: [['girl', 'girls']] },
    { id: 'mensa', stem: 'mēns', gender: 'f', kind: 'thing', en: [['table', 'tables']] },
    { id: 'via', stem: 'vi', gender: 'f', kind: 'thing',
      en: [['road', 'roads'], ['way', 'ways'], ['street', 'streets'], ['path', 'paths']] },
    { id: 'fabula', stem: 'fābul', gender: 'f', kind: 'thing',
      en: [['story', 'stories'], ['tale', 'tales'], ['fable', 'fables']] },
    { id: 'vita', stem: 'vīt', gender: 'f', kind: 'thing', en: [['life', 'lives']] },
    { id: 'ecclesia', stem: 'ecclēsi', gender: 'f', kind: 'thing', en: [['church', 'churches']] },
    { id: 'nauta', stem: 'naut', gender: 'm', kind: 'person', en: [['sailor', 'sailors']] },
    { id: 'poeta', stem: 'poēt', gender: 'm', kind: 'person', en: [['poet', 'poets']] },
    { id: 'insula', stem: 'īnsul', gender: 'f', kind: 'thing', en: [['island', 'islands']] },
    { id: 'culina', stem: 'culīn', gender: 'f', kind: 'thing', en: [['kitchen', 'kitchens']] },
    // 2nd declension, masculine. nom: nominative singular of the -er nouns, which have no -us.
    { id: 'puer', decl: 2, nom: 'puer', stem: 'puer', gender: 'm', kind: 'person', en: [['boy', 'boys']] },
    { id: 'amicus', decl: 2, stem: 'amīc', gender: 'm', kind: 'person', en: [['friend', 'friends']] },
    { id: 'dominus', decl: 2, stem: 'domin', gender: 'm', kind: 'person', en: [['lord', 'lords'], ['master', 'masters']] },
    // proper: "God" takes no article in the singular
    { id: 'deus', decl: 2, stem: 'de', gender: 'm', kind: 'person', proper: true, en: [['God', 'gods']],
      alt: { 'pl.nom': ['dī', 'diī'], 'pl.dat': ['dīs', 'diīs'], 'pl.abl': ['dīs', 'diīs'] } },
    { id: 'servus', decl: 2, stem: 'serv', gender: 'm', kind: 'person', en: [['servant', 'servants'], ['slave', 'slaves']] },
    { id: 'equus', decl: 2, stem: 'equ', gender: 'm', kind: 'thing', en: [['horse', 'horses']] },
    { id: 'cibus', decl: 2, stem: 'cib', gender: 'm', kind: 'thing', en: [['food', 'foods'], ['meal', 'meals']] },
    { id: 'gladius', decl: 2, stem: 'gladi', gender: 'm', kind: 'thing', en: [['sword', 'swords']] },
    { id: 'filius', decl: 2, stem: 'fīli', gender: 'm', kind: 'person', en: [['son', 'sons']] },
    { id: 'ager', decl: 2, nom: 'ager', stem: 'agr', gender: 'm', kind: 'thing', en: [['field', 'fields']] },
    { id: 'magister', decl: 2, nom: 'magister', stem: 'magistr', gender: 'm', kind: 'person',
      en: [['teacher', 'teachers'], ['master', 'masters']] },
    { id: 'liber', decl: 2, nom: 'liber', stem: 'libr', gender: 'm', kind: 'thing', en: [['book', 'books']] },
    { id: 'vir', decl: 2, nom: 'vir', stem: 'vir', gender: 'm', kind: 'person', en: [['man', 'men']] },
    // 2nd declension, neuter. sgOnly: the generator never puts it in the plural.
    { id: 'bellum', decl: 2, stem: 'bell', gender: 'n', kind: 'thing', en: [['war', 'wars']] },
    { id: 'donum', decl: 2, stem: 'dōn', gender: 'n', kind: 'thing', en: [['gift', 'gifts'], ['present', 'presents']] },
    { id: 'vinum', decl: 2, stem: 'vīn', gender: 'n', kind: 'thing', en: [['wine', 'wines']] },
    { id: 'regnum', decl: 2, stem: 'rēgn', gender: 'n', kind: 'thing', en: [['kingdom', 'kingdoms'], ['realm', 'realms']] },
    { id: 'consilium', decl: 2, stem: 'cōnsili', gender: 'n', kind: 'thing',
      en: [['plan', 'plans'], ['advice', 'advice'], ['counsel', 'counsels']] },
    { id: 'templum', decl: 2, stem: 'templ', gender: 'n', kind: 'thing', en: [['temple', 'temples']] },
    { id: 'oppidum', decl: 2, stem: 'oppid', gender: 'n', kind: 'thing', en: [['town', 'towns']] },
    { id: 'periculum', decl: 2, stem: 'perīcul', gender: 'n', kind: 'thing', en: [['danger', 'dangers'], ['peril', 'perils']] },
    { id: 'aurum', decl: 2, stem: 'aur', gender: 'n', kind: 'thing', sgOnly: true, en: [['gold', 'gold']] },
    { id: 'beneficium', decl: 2, stem: 'benefici', gender: 'n', kind: 'thing',
      en: [['kindness', 'kindnesses'], ['favor', 'favors'], ['favour', 'favours'], ['benefit', 'benefits']] },
  ];
  NOUNS.forEach(n => {
    n.decl = n.decl || 1;
    n.declKey = n.decl === 2 && n.gender === 'n' ? '2n' : n.decl;
  });

  // Conjunctions: et between two nouns, or -que on the end of the second ("puer puellaque").
  const CONJS = [
    { id: 'et', form: 'et', en: 'and' },
    { id: 'que', form: '-que', en: 'and', enclitic: true },
  ];

  // Prepositional phrases, by meaning. "in" takes the ablative for place where and the
  // accusative for motion into; "ad" (+ accusative) is motion toward.
  const PREPS = [
    { id: 'in', form: 'in', cases: ['abl', 'acc'] },
    { id: 'ad', form: 'ad', cases: ['acc'] },
  ];
  const PP_KINDS = {
    where: { prep: 'in', case: 'abl', name: 'place where', en: ['in', 'on', 'at', 'upon'] },
    into: { prep: 'in', case: 'acc', name: 'motion into', en: ['into', 'onto', 'in to', 'on to'] },
    to: { prep: 'ad', case: 'acc', name: 'motion toward', en: ['to', 'toward', 'towards', 'up to'] },
  };
  const ppKind = (prep, c) => Object.keys(PP_KINDS).find(k => PP_KINDS[k].prep === prep && PP_KINDS[k].case === c);
  // Natural English preposition for each phrase ("on the island", "in the church", "onto the road").
  const PP_EN = { where: { insula: 'on', via: 'on', aqua: 'on', mensa: 'on' }, into: { via: 'onto' }, to: {} };
  const ppWord = (kind, n) => PP_EN[kind][n] || PP_KINDS[kind].en[0];

  const PEOPLE = NOUNS.filter(n => n.kind === 'person').map(n => n.id);
  const HUMANS = PEOPLE.filter(id => id !== 'deus');
  // in + ablative: where people are, or where something happens
  const PLACES = ['insula', 'via', 'ecclesia', 'ager', 'templum', 'oppidum', 'culina'];

  // English verb forms: [base, 3rd singular, -ing]
  // where / into / to: nouns allowed after in + abl., in + acc., ad + acc. (default: where = PLACES)
  // subjs: who can do it (default: people, but not God); dats: who can receive (indirect objects)
  const VERBS = [
    { id: 'amare', stem: 'am', en: [['love', 'loves', 'loving'], ['like', 'likes', 'liking']],
      objs: PEOPLE.concat(['rosa', 'aqua', 'via', 'fabula', 'vita', 'ecclesia', 'insula', 'culina', 'equus', 'cibus',
        'gladius', 'liber', 'ager', 'bellum', 'donum', 'vinum', 'regnum', 'templum', 'oppidum', 'aurum']),
      subjs: PEOPLE, takesInf: true },
    { id: 'laudare', stem: 'laud', en: [['praise', 'praises', 'praising']],
      objs: PEOPLE.concat(['rosa', 'fabula', 'vita', 'ecclesia', 'insula', 'equus', 'cibus', 'gladius', 'liber',
        'donum', 'vinum', 'regnum', 'consilium', 'templum', 'oppidum', 'beneficium']) },
    { id: 'vocare', stem: 'voc', en: [['call', 'calls', 'calling'], ['summon', 'summons', 'summoning']],
      objs: PEOPLE.concat(['equus']), subjs: PEOPLE,
      to: ['ecclesia', 'mensa', 'insula', 'culina', 'templum', 'oppidum', 'ager'], into: ['ecclesia', 'culina', 'templum', 'oppidum'] },
    { id: 'pugnare', stem: 'pugn', en: [['fight', 'fights', 'fighting']],
      where: ['insula', 'via', 'ager', 'oppidum', 'bellum'] },
    { id: 'ambulare', stem: 'ambul', en: [['walk', 'walks', 'walking']],
      to: ['insula', 'ecclesia', 'via', 'aqua', 'mensa', 'ager', 'templum', 'oppidum', 'culina'].concat(HUMANS),
      into: ['ecclesia', 'aqua', 'via', 'ager', 'templum', 'oppidum', 'culina'] },
    { id: 'orare', stem: 'ōr', en: [['pray', 'prays', 'praying']] },
    { id: 'cantare', stem: 'cant', en: [['sing', 'sings', 'singing']] },
    { id: 'laborare', stem: 'labōr', en: [['work', 'works', 'working'], ['labor', 'labors', 'laboring'],
      ['labour', 'labours', 'labouring'], ['toil', 'toils', 'toiling']] },
    { id: 'portare', stem: 'port', en: [['carry', 'carries', 'carrying'], ['bear', 'bears', 'bearing']],
      objs: ['rosa', 'aqua', 'mensa', 'cibus', 'gladius', 'liber', 'vinum', 'aurum', 'donum'],
      to: ['insula', 'ecclesia', 'mensa', 'culina', 'templum', 'oppidum', 'ager'].concat(HUMANS),
      into: ['ecclesia', 'culina', 'templum', 'oppidum'] },
    { id: 'narrare', stem: 'narr', en: [['tell', 'tells', 'telling'], ['narrate', 'narrates', 'narrating'],
      ['relate', 'relates', 'relating'], ['recount', 'recounts', 'recounting']],
      objs: ['fabula', 'vita', 'consilium'], dats: PEOPLE.concat(['ecclesia']) },
    { id: 'navigare', stem: 'nāvig', en: [['sail', 'sails', 'sailing']],
      where: ['aqua'], to: ['insula', 'oppidum'] },
    { id: 'dare', stem: 'd', en: [['give', 'gives', 'giving']],
      objs: ['rosa', 'aqua', 'mensa', 'cibus', 'gladius', 'liber', 'vinum', 'aurum', 'donum', 'equus', 'consilium'],
      dats: PEOPLE.concat(['ecclesia', 'templum']), subjs: PEOPLE,
      // dăre keeps a short a: damus, datis, dare (not *dāmus)
      forms: { '1sg': 'dō', '2sg': 'dās', '3sg': 'dat', '1pl': 'damus', '2pl': 'datis', '3pl': 'dant', inf: 'dare' } },
    // Linking verb: takes a predicate nominative ("puer amīcus est") or a place ("in culīnā est"), never an object.
    // Who may be what, and what may be where, is decided by predOk / placeOk below.
    { id: 'esse', irregular: true, linking: true, en: [['be', 'is', 'being']],
      where: PLACES.concat(['mensa']),
      forms: { '1sg': 'sum', '2sg': 'es', '3sg': 'est', '1pl': 'sumus', '2pl': 'estis', '3pl': 'sunt', inf: 'esse' } },
  ];

  const NOUN = Object.fromEntries(NOUNS.map(n => [n.id, n]));
  const PREP = Object.fromEntries(PREPS.map(p => [p.id, p]));
  const VERB = Object.fromEntries(VERBS.map(v => [v.id, v]));
  // Which nouns may stand in the genitive with which head ("fīlia rēgīnae", not "nauta fīliae").
  const OWNERS = {
    agricola: ['regina', 'dominus'], nauta: ['regina', 'dominus'], poeta: ['regina', 'dominus'], puella: [],
    filia: ['agricola', 'regina', 'nauta', 'poeta', 'dominus', 'magister', 'vir'],
    regina: ['agricola', 'nauta', 'poeta', 'insula', 'oppidum'],
    rosa: HUMANS, fabula: HUMANS,
    aqua: HUMANS.concat(['ecclesia']), mensa: HUMANS.concat(['ecclesia']), vita: HUMANS.concat(['ecclesia']),
    via: HUMANS.concat(['vita', 'insula', 'ager', 'oppidum']),
    ecclesia: ['agricola', 'puella', 'nauta', 'poeta', 'insula', 'oppidum'],
    insula: ['agricola', 'regina', 'nauta', 'poeta', 'dominus'],
    culina: HUMANS,
    puer: [], vir: [],
    amicus: PEOPLE,
    dominus: ['servus', 'insula', 'oppidum', 'ager', 'equus'],
    deus: ['agricola', 'nauta', 'poeta', 'insula', 'oppidum', 'bellum', 'vinum'],
    servus: ['dominus', 'regina', 'agricola', 'poeta', 'magister', 'deus'],
    filius: ['agricola', 'regina', 'nauta', 'poeta', 'dominus', 'magister', 'vir', 'deus'],
    magister: ['puer', 'puella', 'filius', 'filia'],
    equus: HUMANS, cibus: HUMANS, gladius: HUMANS, liber: HUMANS, ager: HUMANS,
    bellum: ['regina', 'dominus'],
    donum: PEOPLE, vinum: HUMANS, regnum: ['regina', 'dominus', 'deus'], consilium: PEOPLE,
    templum: ['deus', 'oppidum', 'insula'], oppidum: ['insula', 'regina', 'dominus'],
    periculum: ['bellum', 'via', 'aqua', 'insula'], aurum: HUMANS.concat(['templum']), beneficium: PEOPLE,
  };
  Object.keys(OWNERS).forEach(k => { OWNERS[k] = OWNERS[k].filter(x => x !== k); });
  const POSSESSORS = [...new Set(Object.values(OWNERS).flat())];

  // ─── esse: who may be what, and what may be where ──────────────────────────

  // Predicate nouns for a person ("puer amīcus est"). The 1st-declension jobs fit anyone;
  // the rest must match the subject's gender (a girl is a fīlia, not a fīlius).
  const ROLES = ['agricola', 'nauta', 'poeta', 'regina', 'amicus', 'dominus', 'servus', 'magister', 'filius', 'filia'];
  const COMMON = ['agricola', 'nauta', 'poeta'];
  // Predicate nouns for things: subjects each one may describe ("vīnum dōnum est", "bellum perīculum est").
  const THING_PREDS = {
    donum: ['rosa', 'aurum', 'vinum', 'cibus', 'gladius', 'liber', 'equus', 'vita'],
    periculum: ['bellum', 'aqua', 'via', 'gladius'],
    fabula: ['vita'],
    beneficium: ['cibus', 'aqua', 'vita'],
  };
  /** Can subject s (noun id, or null for a pronoun subject) be called p? */
  function predOk(s, p) {
    if (s === p) return false;
    if (THING_PREDS[p]) return s != null && THING_PREDS[p].includes(s);
    if (!PEOPLE.includes(p) || p === 'deus') return false;
    if (s == null) return true;                                   // "nauta sum", "puerī sumus"
    if (!ROLES.includes(p) || !PEOPLE.includes(s)) return false;
    if (s === 'deus') return p === 'amicus';
    return COMMON.includes(p) || NOUN[p].gender === NOUN[s].gender;
  }
  // Where things can be (people can be in any of PLACES).
  const THING_PLACES = {
    rosa: ['mensa', 'ager', 'ecclesia'], aqua: ['culina', 'mensa'], mensa: ['culina'], cibus: ['mensa', 'culina'],
    vinum: ['mensa', 'culina'], aurum: ['templum', 'mensa'], gladius: ['mensa'], liber: ['mensa', 'ecclesia'],
    equus: ['ager', 'via'], donum: ['mensa', 'templum'], templum: ['oppidum', 'insula'], ecclesia: ['oppidum', 'insula'],
    oppidum: ['insula'], ager: ['insula'],
  };
  /** Can subject s (noun id, or null for a pronoun subject) be in place p? */
  function placeOk(s, p) {
    return s == null || PEOPLE.includes(s) ? PLACES.includes(p) : (THING_PLACES[s] || []).includes(p);
  }
  const PRED_SUBJECTS = NOUNS.map(n => n.id).filter(s => NOUNS.some(p => predOk(s, p.id)));
  const PLACE_SUBJECTS = PEOPLE.concat(Object.keys(THING_PLACES));

  NOUNS.forEach(n => {
    n.lemma = nounForm(n, 'nom', 'sg');
    n.genSg = nounForm(n, 'gen', 'sg');
  });
  VERBS.forEach(v => {
    v.trans = !!v.objs;
    v.datList = v.dats || [];
    v.subjs = v.subjs || HUMANS;
    v.where = v.where || PLACES;
    v.to = v.to || [];
    v.into = v.into || [];
    v.lemma = verbForm(v, 'inf');
    v.first = verbForm(v, '1sg');
  });
  /** Who can be the subject of a finite verb (and of its infinitive, if any). */
  const subjectsFor = (finite, inf) => finite.subjs.filter(n => !inf || inf.subjs.includes(n));

  // ─── Morphology ───────────────────────────────────────────────────────────

  function nounForm(n, c, num) { return c === 'nom' && num === 'sg' && n.nom ? n.nom : n.stem + DECLS[n.declKey][num][c]; }
  /** The ending added to the stem, or null where the form is not stem + ending (puer, ager). */
  function nounEnding(n, c, num) { return c === 'nom' && num === 'sg' && n.nom ? null : DECLS[n.declKey][num][c]; }
  function nounAlts(n, c, num) { return (n.alt && n.alt[num + '.' + c]) || []; }
  function verbForm(v, p) { return v.forms ? v.forms[p] : v.stem + CONJ1[p]; }

  /** Lowercase, strip macrons/accents and punctuation, treat v as u. Used for all comparisons. */
  function norm(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/v/g, 'u').replace(/[^a-z]/g, '');
  }
  function hasMacron(s) { return /[āēīōūȳĀĒĪŌŪ]|̄/.test(s.normalize('NFC')); }
  function stripMacrons(s) { return s.normalize('NFD').replace(/̄/g, '').normalize('NFC'); }

  // Every inflected form, keyed without macrons → [{ form, analysis }].
  const FORMS = new Map();
  function addForm(form, analysis) {
    const key = norm(form);
    if (!FORMS.has(key)) FORMS.set(key, []);
    FORMS.get(key).push({ form: form.normalize('NFC').toLowerCase(), analysis });
  }
  /** Typed macrons must be right; missing ones are fine (īnsulā, insulā and insula all fit īnsulā). */
  function macronsFit(typed, form) {
    const t = [...typed], f = [...form];
    return t.length === f.length && t.every((c, i) => (hasMacron(c) ? c === f[i] : norm(c) === norm(f[i])));
  }
  NOUNS.forEach(n => NUMS.forEach(num => CASES.forEach(c => {
    [nounForm(n, c, num)].concat(nounAlts(n, c, num)).forEach(f => addForm(f, { pos: 'noun', id: n.id, case: c, num }));
  })));
  VERBS.forEach(v => {
    PERSONS.forEach(p => addForm(verbForm(v, p), { pos: 'verb', id: v.id, person: +p[0], num: p.slice(1) }));
    addForm(verbForm(v, 'inf'), { pos: 'inf', id: v.id });
  });
  PREPS.forEach(p => addForm(p.form, { pos: 'prep', id: p.id }));
  addForm('et', { pos: 'conj', id: 'et' });

  /**
   * Analyses of one word. Macrons the user typed are respected (rosā ≠ rosa); missing ones are not required.
   * A noun with -que on the end ("puellaque") gets its noun analyses marked que: true.
   */
  function analyze(word) {
    const typed = word.normalize('NFC').toLowerCase().replace(/[^\p{L}]/gu, '');
    const lookup = t => (FORMS.get(norm(t)) || []).filter(x => !hasMacron(t) || macronsFit(t, x.form)).map(x => x.analysis);
    const out = lookup(typed);
    if (typed.length > 3 && typed.endsWith('que')) {
      lookup(typed.slice(0, -3)).filter(a => a.pos === 'noun').forEach(a => out.push({ ...a, que: true }));
    }
    const seen = new Set();
    return out.filter(a => { const k = JSON.stringify(a); return !seen.has(k) && seen.add(k); });
  }

  function describe(a) {
    if (a.pos === 'noun') return CASE_NAMES[a.case] + ' ' + NUM_NAMES[a.num].toLowerCase() + (a.que ? ' + -que' : '');
    if (a.pos === 'verb') return PERSON_NAMES[a.person + a.num];
    if (a.pos === 'prep') return 'Preposition';
    if (a.pos === 'conj') return 'Conjunction';
    return 'Present infinitive';
  }

  function tokenize(text) {
    return text.split(/[\s,.;:!?"“”«»()]+/).filter(w => /\p{L}/u.test(w));
  }

  // ─── Parser ───────────────────────────────────────────────────────────────
  // Free word order. A genitive must stand directly next to the noun it modifies, and a
  // preposition directly before its noun (or before that noun's genitive: "in rēgīnae īnsulā").
  // Two nouns in the same case can be joined: "puer et puella" or "puer puellaque" (no genitives then).

  const ROLE_NAMES = {
    subj: 'subject', obj: 'direct object', dat: 'indirect object', gen: 'possessor (of …)',
    verb: 'main verb', inf: 'complementary infinitive', prep: 'preposition', pobj: 'object of the preposition',
    pred: 'predicate noun (after “to be”)', and: 'second noun joined by “and”', conj: 'conjunction “and”',
  };
  // Roles a sentence can fill only once; genitives, conjunctions and joined nouns can repeat.
  const SINGLE = new Set(['verb', 'inf', 'subj', 'pred', 'obj', 'dat', 'prep', 'pobj']);

  function parseLatin(text) {
    const words = tokenize(text);
    const tokens = words.map(w => ({ word: w, analyses: analyze(w) }));
    const unknown = tokens.filter(t => !t.analyses.length).map(t => t.word);
    const result = { tokens, unknown, readings: [], parses: [] };
    if (unknown.length || !tokens.length) return result;
    const hasEsse = tokens.some(t => t.analyses.some(a => a.pos === 'verb' && a.id === 'esse'));

    // Each token can take a set of (analysis, role) options.
    const options = tokens.map((t, i) => {
      const out = [];
      // the word after "et", and a word ending in -que, can only be the second of two joined nouns
      const afterEt = i > 0 && tokens[i - 1].analyses.some(a => a.pos === 'conj');
      t.analyses.forEach(a => {
        if (afterEt || a.que) {
          const head = a.que ? i - 1 : i - 2;
          if (a.pos === 'noun' && head >= 0 && ['nom', 'acc', 'dat'].includes(a.case)) out.push({ a, role: 'and', head });
        }
        else if (a.pos === 'verb') out.push({ a, role: 'verb' });
        else if (a.pos === 'inf') out.push({ a, role: 'inf' });
        else if (a.pos === 'prep') out.push({ a, role: 'prep' });
        else if (a.pos === 'conj') out.push({ a, role: 'conj' });
        else if (a.case === 'nom') { out.push({ a, role: 'subj' }); if (hasEsse) out.push({ a, role: 'pred' }); }
        else if (a.case === 'acc') out.push({ a, role: 'obj' }, { a, role: 'pobj' });
        else if (a.case === 'dat') out.push({ a, role: 'dat' });
        else if (a.case === 'abl') out.push({ a, role: 'pobj' });
        else if (a.case === 'gen') {
          if (i > 0) out.push({ a, role: 'gen', head: i - 1 });
          if (i < tokens.length - 1) out.push({ a, role: 'gen', head: i + 1 });
        }
      });
      return out;
    });

    const seen = new Set();
    const pick = [];
    const counts = {};
    (function walk(i) {
      if (i === tokens.length) {
        const m = buildReading(pick);
        if (m) {
          const k = key(m);
          if (!seen.has(k)) { seen.add(k); result.readings.push(m); result.parses.push(pick.slice()); }
        }
        return;
      }
      for (const o of options[i]) {
        const single = SINGLE.has(o.role);
        if (single && counts[o.role]) continue;
        if (single) counts[o.role] = 1;
        pick.push(o);
        walk(i + 1);
        pick.pop();
        if (single) counts[o.role] = 0;
      }
    })(0);
    return result;
  }

  function buildReading(pick) {
    const at = role => pick.findIndex(o => o.role === role);
    const vi = at('verb');
    if (vi < 0) return null;
    const finite = VERB[pick[vi].a.id];
    const ii = at('inf');
    let head = finite;
    if (ii >= 0) {
      if (!finite.takesInf || pick[ii].a.id === finite.id || VERB[pick[ii].a.id].linking) return null;
      head = VERB[pick[ii].a.id];
    }

    // joined nouns: "et" must introduce one; each joins a subject, object or indirect object in its own case
    const ands = {};
    for (let i = 0; i < pick.length; i++) {
      const o = pick[i];
      if (o.role === 'conj' && !(pick[i + 1] && pick[i + 1].role === 'and' && !pick[i + 1].a.que)) return null;
      if (o.role !== 'and') continue;
      const h = pick[o.head];
      if (!['subj', 'obj', 'dat'].includes(h.role) || h.a.case !== o.a.case || h.a.id === o.a.id || ands[o.head]) return null;
      ands[o.head] = { n: o.a.id, num: o.a.num, gen: null, and: null, conj: o.a.que ? 'que' : 'et' };
    }

    // genitives: head must be a non-genitive noun, one genitive per noun, sensible possessor
    const gens = {};
    for (let i = 0; i < pick.length; i++) {
      const o = pick[i];
      if (o.role !== 'gen') continue;
      const h = pick[o.head];
      if (!['subj', 'obj', 'dat', 'pobj', 'pred'].includes(h.role) || gens[o.head] || ands[o.head]) return null;
      if (!OWNERS[h.a.id].includes(o.a.id)) return null;
      gens[o.head] = { n: o.a.id, num: o.a.num };
    }
    const np = role => {
      const i = at(role);
      return i < 0 ? null : { n: pick[i].a.id, num: pick[i].a.num, gen: gens[i] || null, and: ands[i] || null };
    };
    const both = x => (x ? (x.and ? [x.n, x.and.n] : [x.n]) : []);
    const subj = np('subj'), obj = np('obj'), dat = np('dat'), pred = np('pred');
    const { person, num } = pick[vi].a;

    // two joined subjects take a plural verb
    if (subj && (person !== 3 || num !== (subj.and ? 'pl' : subj.num))) return null;

    // preposition + its noun, the noun right after it (or after its own genitive)
    const pi = at('prep'), qi = at('pobj');
    if ((pi < 0) !== (qi < 0)) return null;
    let pp = null;
    if (pi >= 0) {
      const between = pick[pi + 1];
      if (qi !== pi + 1 && !(qi === pi + 2 && between.role === 'gen' && between.head === qi)) return null;
      const kind = ppKind(pick[pi].a.id, pick[qi].a.case);
      if (!kind || !head[kind].includes(pick[qi].a.id)) return null;
      pp = { prep: pick[pi].a.id, case: pick[qi].a.case, ...np('pobj') };
    }

    if (finite.linking) {
      // esse needs exactly one complement: a predicate noun or a place
      if (obj || dat || !pred === !pp) return null;
      if (pred && (pred.num !== num || (subj && subj.and) || !predOk(subj ? subj.n : null, pred.n))) return null;
      if (pp && !(subj ? both(subj) : [null]).every(s => placeOk(s, pp.n))) return null;
    } else {
      if (pred) return null;
      const subjects = subjectsFor(finite, ii >= 0 ? head : null);
      if (subj && !both(subj).every(n => subjects.includes(n))) return null;
      if (head.trans ? !obj || !both(obj).every(n => head.objs.includes(n)) : obj) return null;
      if (dat && !both(dat).every(n => head.datList.includes(n))) return null;
    }

    return { verb: finite.id, person, num, inf: ii >= 0 ? head.id : null, subj, obj, dat, pp, pred };
  }

  /** Identity of a meaning. Joined nouns count in either order, and et / -que is style, not meaning. */
  function key(m) {
    const np = x => {
      if (!x) return null;
      if (x.and) return ['and'].concat([[x.n, x.num], [x.and.n, x.and.num]].map(y => JSON.stringify(y)).sort());
      return [x.n, x.num, x.gen ? [x.gen.n, x.gen.num] : null];
    };
    const pp = m.pp ? [m.pp.prep, m.pp.case].concat(np(m.pp)) : null;
    return JSON.stringify([m.verb, m.person, m.num, m.inf, np(m.subj), np(m.obj), np(m.dat), pp, np(m.pred)]);
  }

  // ─── Rendering ────────────────────────────────────────────────────────────

  function npLatin(np, genFirst) {
    const n = NOUN[np.n], c = np.role;
    const head = nounForm(n, c, np.num);
    if (np.and) {
      const second = nounForm(NOUN[np.and.n], c, np.and.num);
      return np.and.conj === 'que' ? [head, second + 'que'] : [head, 'et', second];
    }
    if (!np.gen) return [head];
    const g = nounForm(NOUN[np.gen.n], 'gen', np.gen.num);
    return genFirst ? [g, head] : [head, g];
  }

  /** Latin word list for a meaning. order: 'canonical' (S-IO-O-Pred-PP-Inf-V) or a shuffled arrangement. */
  function latinWords(m, rng, vary) {
    const v = VERB[m.verb];
    const parts = [];
    if (m.subj) parts.push(npLatin({ ...m.subj, role: 'nom' }, vary && rng() < 0.3));
    if (m.dat) parts.push(npLatin({ ...m.dat, role: 'dat' }, vary && rng() < 0.3));
    if (m.obj) parts.push(npLatin({ ...m.obj, role: 'acc' }, vary && rng() < 0.3));
    if (m.pred) parts.push(npLatin({ ...m.pred, role: 'nom' }, vary && rng() < 0.3));
    if (m.pp) parts.push([PREP[m.pp.prep].form].concat(npLatin({ ...m.pp, role: m.pp.case }, vary && rng() < 0.3)));
    if (m.inf) parts.push([verbForm(VERB[m.inf], 'inf')]);
    parts.push([verbForm(v, m.person + m.num)]);
    if (vary) shuffle(parts, rng);
    return parts.flat();
  }

  function sentenceCase(words) {
    const s = words.join(' ');
    return s.charAt(0).toUpperCase() + s.slice(1) + '.';
  }

  const PRONOUN_DISPLAY = { '1sg': 'I', '2sg': 'you (sg.)', '3sg': 'he/she', '1pl': 'we', '2pl': 'you (pl.)', '3pl': 'they' };

  const enWord = x => NOUN[x.n].en[0][x.num === 'sg' ? 0 : 1];
  const the = x => (NOUN[x.n].proper && x.num === 'sg' ? '' : 'the ');   // "God", not "the God"

  function npEnglish(np) {
    const head = enWord(np);
    if (np.and) return the(np) + head + ' and ' + the(np.and) + enWord(np.and);
    if (!np.gen) return the(np) + head;
    const g = NOUN[np.gen.n].en[0];
    return np.gen.num === 'sg' ? `${the(np.gen)}${g[0]}'s ${head}` : `the ${head} of the ${g[1]}`;
  }

  /** A predicate noun: "a sailor", "sailors", "the queen's daughter". */
  function predEnglish(np) {
    if (np.gen || NOUN[np.n].proper) return npEnglish(np);
    const head = enWord(np);
    return np.num === 'pl' ? head : (/^[aeiou]/i.test(head) ? 'an ' : 'a ') + head;
  }

  const BE_EN = { '1sg': 'am', '2sg': 'are', '3sg': 'is', '1pl': 'are', '2pl': 'are', '3pl': 'are' };

  /** English of a prepositional phrase alone: "on the island", "into the church". */
  function ppEnglish(pp) {
    return ppWord(ppKind(pp.prep, pp.case), pp.n) + ' ' + npEnglish(pp);
  }

  /** One natural English rendering. opts.pronoun overrides the 3rd-person-singular pronoun. */
  function englishOf(m, opts = {}) {
    const agr = m.person + m.num;
    const subj = m.subj ? npEnglish(m.subj) : (agr === '3sg' && opts.pronoun) || PRONOUN_DISPLAY[agr];
    const finite = VERB[m.verb].en[0];
    const out = [subj, VERB[m.verb].linking ? BE_EN[agr] : agr === '3sg' ? finite[1] : finite[0]];
    if (m.inf) out.push('to ' + VERB[m.inf].en[0][0]);
    if (m.obj) out.push(npEnglish(m.obj));
    if (m.dat) out.push('to ' + npEnglish(m.dat));
    if (m.pred) out.push(predEnglish(m.pred));
    if (m.pp) out.push(ppEnglish(m.pp));
    return sentenceCase(out);
  }

  // ─── English answer matching ──────────────────────────────────────────────
  // Each meaning compiles to one anchored regex covering the acceptable phrasings:
  // optional articles, "X's Y" / "Y of X", simple / progressive / emphatic present,
  // "gives A to B" / "gives B A", "loves to sing" / "loves singing", synonyms.

  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const alt = list => '(?:' + list.join('|') + ')';
  const DET = { sg: '(?:(?:the|a|an|some|one) )?', pl: '(?:(?:the|some) )?' };
  const PRONOUN_RE = {
    '1sg': 'i', '2sg': 'you', '3sg': "(?:he|she|it|he/she|she/he|he or she|she or he)",
    '1pl': 'we', '2pl': "(?:you|you all|y'all|ye|you guys|you people)", '3pl': 'they',
  };
  const BE = { '1sg': 'am', '3sg': 'is' };
  const PAST = { sing: 'sang', give: 'gave', tell: 'told', fight: 'fought', bear: 'bore' }; // only for hints
  const DO = { '3sg': 'does' };

  function nounRe(n, num) { return alt(NOUN[n].en.map(p => esc(p[num === 'sg' ? 0 : 1].toLowerCase()))); }
  function possRe(n, num) { return alt(NOUN[n].en.map(p => esc((num === 'sg' ? p[0] + "'s" : p[1] + "'").toLowerCase()))); }

  function npRe(np) {
    const head = nounRe(np.n, np.num);
    if (np.and) {
      const a = DET[np.num] + head, b = DET[np.and.num] + nounRe(np.and.n, np.and.num);
      return alt([`${a} and ${b}`, `${b} and ${a}`]);
    }
    if (!np.gen) return DET[np.num] + head;
    const g = np.gen;
    return alt([
      `${DET[np.num]}${head} of ${DET[g.num]}${nounRe(g.n, g.num)}`,
      `${DET[g.num]}${possRe(g.n, g.num)} ${head}`,
    ]);
  }

  function finiteRe(v, agr, allowProgressive) {
    const forms = [];
    VERB[v].en.forEach(([base, s, ing]) => {
      forms.push(agr === '3sg' ? s : base);
      forms.push(`${DO[agr] || 'do'} ${base}`);
      if (allowProgressive) forms.push(`${BE[agr] || 'are'} ${ing}`);
    });
    return alt(forms.map(esc));
  }

  function englishRegex(m) {
    const agr = m.person + m.num;
    const subj = m.subj ? npRe(m.subj) : PRONOUN_RE[agr];
    let verb;
    if (VERB[m.verb].linking) {
      verb = BE_EN[agr];
    } else if (m.inf) {
      const infs = [];
      VERB[m.inf].en.forEach(([base, , ing]) => { infs.push('to ' + base, ing); });
      verb = finiteRe(m.verb, agr, false) + ' ' + alt(infs.map(esc));
    } else {
      verb = finiteRe(m.verb, agr, true);
    }
    let rest = '';
    if (m.pred) rest = ' ' + npRe(m.pred);
    else if (m.obj && m.dat) rest = ' ' + alt([`${npRe(m.obj)} (?:to|for) ${npRe(m.dat)}`, `${npRe(m.dat)} ${npRe(m.obj)}`]);
    else if (m.obj) rest = ' ' + npRe(m.obj);
    else if (m.dat) rest = ' (?:to|for) ' + npRe(m.dat);
    const core = `${subj} ${verb}${rest}`;
    if (!m.pp) return new RegExp(`^${core}$`);
    // the phrase goes at the end, or first ("On the island the sailors sing")
    const pp = ppRe(m.pp);
    return new RegExp(`^(?:${core} ${pp}|${pp} ${core})$`);
  }

  function ppRe(pp) {
    return alt(PP_KINDS[ppKind(pp.prep, pp.case)].en.map(esc)) + ' ' + npRe(pp);
  }

  function normEnglish(s) {
    return (' ' + s.toLowerCase().replace(/[’‘`´]/g, "'") + ' ')
      .replace(/[^a-z'/ ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/ you (?:sg|pl|singular|plural) /g, ' you ')
      .replace(/ i'm /g, ' i am ')
      .replace(/ (he|she|it)'s /g, ' $1 is ')
      .replace(/ (we|you|they)'re /g, ' $1 are ')
      .trim();
  }

  // ─── Generator ────────────────────────────────────────────────────────────

  const MAX_WORDS = 8;

  function makeRng(seed) {
    if (seed == null) return Math.random;
    let s = seed >>> 0;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function pickOne(list, rng) { return list[Math.floor(rng() * list.length)]; }
  function shuffle(list, rng = Math.random) {
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    return list;
  }

  // Every (finite verb, optional infinitive) pattern, with its minimum word count and optional slots.
  // A slot adds one word, except a prepositional phrase and "et + noun", which add two.
  // esse has two patterns, each with a required complement: a predicate noun, or a place.
  const SLOT_COST = { pp: 2, subjEt: 2, objEt: 2, datEt: 2 };
  const cost = s => SLOT_COST[s] || 1;
  const NEEDS = { subjGen: 'subj', subjEt: 'subj', subjQue: 'subj', datGen: 'dat', datEt: 'dat', datQue: 'dat', ppGen: 'pp', predGen: 'pred' };
  const JOINS = ['subjEt', 'subjQue', 'objEt', 'objQue', 'datEt', 'datQue'];
  // At most one "and" per sentence, and a joined noun has no genitive.
  const EXCLUSIVE = [JOINS, ['subjGen', 'subjEt', 'subjQue'], ['objGen', 'objEt', 'objQue'], ['datGen', 'datEt', 'datQue']];
  // Constructions a sentence can add. Each sentence draws its own mix (see FEATURE_ODDS), and slots are
  // chosen construction first, so the genitive's five slots don't make it five times as likely.
  const FEATURES = {
    subj: ['subj'], gen: ['subjGen', 'objGen', 'datGen', 'ppGen', 'predGen'], dat: ['dat'], pp: ['pp'],
    et: ['subjEt', 'objEt', 'datEt'], que: ['subjQue', 'objQue', 'datQue'],
  };
  const featureOf = s => Object.keys(FEATURES).find(f => FEATURES[f].includes(s));
  // Chance each construction is allowed in a sentence; "and" uses either et or -que, never both styles.
  const FEATURE_ODDS = { subj: 0.75, gen: 0.5, dat: 0.5, pp: 0.5, and: 0.3 };
  function drawFeatures(rng) {
    const out = new Set(['subj', 'gen', 'dat', 'pp'].filter(f => rng() < FEATURE_ODDS[f]));
    if (rng() < FEATURE_ODDS.and) out.add(rng() < 0.5 ? 'et' : 'que');
    return out;
  }
  const slotFits = (s, slots) => !slots.has(s) && (!NEEDS[s] || slots.has(NEEDS[s])) &&
    !EXCLUSIVE.some(g => g.includes(s) && g.some(t => slots.has(t)));

  /** Every word count a frame can reach. */
  function frameLengths(f) {
    const out = new Set();
    const slots = new Set(f.required);
    (function go(i, total) {
      if (i === f.optional.length) { out.add(total); return; }
      go(i + 1, total);
      const s = f.optional[i];
      if (slotFits(s, slots)) { slots.add(s); go(i + 1, total + cost(s)); slots.delete(s); }
    })(0, f.base);
    return out;
  }

  const FRAMES = [];
  VERBS.forEach(finite => {
    if (finite.linking) {
      FRAMES.push({ finite, inf: null, head: finite, comp: 'pred', required: ['pred'], base: 2,
        optional: ['subj', 'subjGen', 'predGen'], kinds: [] });
      FRAMES.push({ finite, inf: null, head: finite, comp: 'pp', required: ['pp'], base: 3,
        optional: ['subj', 'subjGen', 'subjEt', 'subjQue', 'ppGen'], kinds: ['where'] });
      return;
    }
    const infs = finite.takesInf ? [null].concat(VERBS.filter(v => v !== finite && !v.linking)) : [null];
    infs.forEach(inf => {
      const head = inf || finite;
      const optional = ['subj', 'subjGen', 'subjEt', 'subjQue'];
      if (head.trans) optional.push('objGen', 'objEt', 'objQue');
      if (head.datList.length) optional.push('dat', 'datGen', 'datEt', 'datQue');
      const kinds = Object.keys(PP_KINDS).filter(k => head[k].length);
      if (kinds.length) optional.push('pp', 'ppGen');
      const base = 1 + (inf ? 1 : 0) + (head.trans ? 1 : 0);
      FRAMES.push({ finite, inf, head, comp: null, required: [], base, optional, kinds });
    });
  });
  FRAMES.forEach(f => { f.lengths = frameLengths(f); });

  /**
   * Random sentence with exactly `length` Latin words.
   * Returns { m, latin, words, english, englishPrompt, readings }.
   */
  function generateSentence(length, opts = {}) {
    const rng = opts.rng || Math.random;
    const frames = FRAMES.filter(f => f.lengths.has(length));
    if (!frames.length) throw new Error('No sentence pattern has ' + length + ' words');
    for (let attempt = 0; attempt < 2000; attempt++) {
      // Pick the verb first, then one of its frames that fits the length. Verbs that open up other
      // constructions (esse, a dative, an infinitive) come twice as often, so long sentences vary.
      const verbs = [...new Set(frames.map(f => f.finite))].flatMap(v => (v.linking || v.datList.length || v.takesInf ? [v, v] : [v]));
      const finite = pickOne(verbs, rng);
      let mine = frames.filter(f => f.finite === finite);
      const plain = mine.filter(f => !f.inf);
      if (plain.length && plain.length < mine.length) mine = rng() < 0.5 ? plain : mine.filter(f => f.inf);
      const { inf, head, comp, required, base, optional, kinds } = pickOne(mine, rng);

      const slots = new Set(required);
      const allowed = drawFeatures(rng);
      let extra = length - base;
      while (extra > 0) {
        const avail = optional.filter(s => allowed.has(featureOf(s)) && slotFits(s, slots) && cost(s) <= extra);
        if (!avail.length) break;
        const f = pickOne([...new Set(avail.map(featureOf))], rng);
        const s = pickOne(avail.filter(x => featureOf(x) === f), rng);
        slots.add(s);
        extra -= cost(s);
      }
      if (extra > 0) continue;

      const used = new Set();
      const noun = list => {
        const pool = list.filter(n => !used.has(n));
        if (!pool.length) return null;
        const n = pickOne(pool, rng);
        used.add(n);
        return n;
      };
      const num = n => (n && NOUN[n].sgOnly) || rng() < 0.5 ? 'sg' : 'pl';
      const joinOf = p => (slots.has(p + 'Et') ? 'et' : slots.has(p + 'Que') ? 'que' : null);
      const np = (list, withGen, conj) => {
        const n = noun(list);
        if (!n) return null;
        const out = { n, num: num(n), gen: null, and: null };
        if (withGen) { const g = noun(OWNERS[n]); out.gen = { n: g, num: num(g) }; }
        if (conj) { const b = noun(list); out.and = { n: b, num: num(b), gen: null, and: null, conj }; }
        return out;
      };

      // Fill the subject first so person/number follow it.
      const subjects = comp === 'pred' ? PRED_SUBJECTS : comp === 'pp' ? PLACE_SUBJECTS : subjectsFor(finite, inf);
      const subj = slots.has('subj') ? np(subjects, slots.has('subjGen'), joinOf('subj')) : null;
      if (subj && subj.and && !subj.and.n) continue;
      const person = subj ? 3 : 1 + Math.floor(rng() * 3);
      const vnum = subj ? (subj.and ? 'pl' : subj.num) : num();

      const obj = head.trans ? np(head.objs, slots.has('objGen'), joinOf('obj')) : null;
      const dat = slots.has('dat') ? np(head.datList, slots.has('datGen'), joinOf('dat')) : null;
      let pred = null;
      if (comp === 'pred') {
        // with a genitive, only kinship-like roles read well: "the sons of the queen", not "the queen's poets"
        const preds = NOUNS.map(n => n.id).filter(p => predOk(subj ? subj.n : null, p) &&
          (!slots.has('predGen') || !PEOPLE.includes(p) || ['filius', 'filia', 'servus', 'amicus'].includes(p)));
        pred = np(preds, slots.has('predGen'));
        if (!pred) continue;
        pred.num = vnum;
      }
      let pp = null;
      if (slots.has('pp')) {
        const kind = pickOne(kinds, rng);
        const where = comp === 'pp' ? head.where.filter(p => (subj ? [subj.n].concat(subj.and ? [subj.and.n] : []) : [null]).every(s => placeOk(s, p))) : head[kind];
        const phrase = np(where, slots.has('ppGen'));
        if (!phrase) continue;
        pp = { prep: PP_KINDS[kind].prep, case: PP_KINDS[kind].case, ...phrase };
      }
      if ([subj, obj, dat, pp, pred].some(x => x && ((x.gen && !x.gen.n) || (x.and && !x.and.n))) || (head.trans && !obj)) continue;

      const m = { verb: finite.id, person, num: vnum, inf: inf ? inf.id : null, subj, obj, dat, pp, pred };
      const words = latinWords(m, rng, !!opts.varyOrder);
      if (new Set(words.map(norm)).size !== words.length) continue;   // fīliīs et fīliīs
      const latin = sentenceCase(words);

      // Self-check: the parser must recover this exact meaning from the Latin.
      const parsed = parseLatin(latin);
      if (!parsed.readings.some(r => key(r) === key(m))) continue;

      // "he is a son", "she is a queen"
      const g = pred && !subj && !COMMON.includes(pred.n) ? NOUN[pred.n].gender : null;
      const pronoun = g === 'm' ? 'he' : g === 'f' ? 'she' : rng() < 0.5 ? 'he' : 'she';
      return {
        m, words, latin,
        english: englishOf(m),
        englishPrompt: englishOf(m, { pronoun }),
        readings: parsed.readings,
      };
    }
    throw new Error('Could not generate a sentence of length ' + length);
  }

  // ─── Checking ─────────────────────────────────────────────────────────────

  /** Latin answer to an English prompt. Correct if any parse of the answer equals the target meaning. */
  function checkLatin(answer, target) {
    const parsed = parseLatin(answer);
    const correct = parsed.readings.some(r => key(r) === key(target.m));
    const out = { correct, parsed, notes: [] };
    if (correct) {
      if (norm(answer) !== norm(target.words.join(''))) out.notes.push('Word order differs from the model answer, which is fine — Latin word order is free.');
      return out;
    }
    if (!parsed.tokens.length) { out.notes.push('Type a Latin sentence.'); return out; }
    parsed.unknown.forEach(w => out.notes.push(`“${w}” isn't a form in the current vocabulary.`));

    // Diff the user's words against the model answer, matching on exact forms first.
    const roleOf = latinRoles(target);
    const want = target.words.map((w, i) => ({ w, role: roleOf[i], done: false }));
    const extra = [];
    parsed.tokens.forEach(t => {
      const hit = want.find(x => !x.done && norm(x.w) === norm(t.word) &&
        (!hasMacron(t.word) || t.word.normalize('NFC').toLowerCase() === x.w.toLowerCase()));
      if (hit) hit.done = true; else extra.push(t);
    });
    const missing = want.filter(x => !x.done);
    extra.forEach(t => {
      if (!t.analyses.length) return;
      const lemmaHit = missing.find(x => analyze(x.w).some(a => t.analyses.some(b => b.id === a.id)));
      const prepMiss = t.analyses[0].pos === 'prep' && missing.find(x => !x.done && x.role.role === 'prep');
      if (prepMiss) {
        prepMiss.done = true;
        out.notes.push(`“${t.word}” ${PREP_SENSE[t.analyses[0].id]}; for “${ppEnglish(target.m.pp)}” you need “${prepMiss.w}”, which ${PREP_SENSE[target.m.pp.prep]}.`);
      } else if (lemmaHit) {
        lemmaHit.done = true;
        out.notes.push(`“${t.word}” is ${t.analyses.map(describe).join(' / ').toLowerCase()}; as the ${ROLE_NAMES[lemmaHit.role.role]} you need “${lemmaHit.w}” (${lemmaHit.role.label.toLowerCase()}).`);
      } else {
        const a = t.analyses[0];
        out.notes.push(a.pos === 'prep' || a.pos === 'conj'
          ? `“${t.word}” doesn't belong in this sentence.`
          : `“${t.word}” (${a.pos === 'noun' ? NOUN[a.id].lemma : VERB[a.id].lemma}) doesn't belong in this sentence.`);
      }
    });
    missing.filter(x => !x.done).forEach(x => out.notes.push(`Missing the ${ROLE_NAMES[x.role.role]}: “${x.w}”.`));
    if (!out.notes.length) {
      out.notes.push(target.m.pp
        ? 'All the right words, but the arrangement changes the meaning — keep each genitive next to its noun, and the preposition right before its noun.'
        : 'All the right words, but the arrangement changes the meaning — keep each genitive right next to the noun it belongs to.');
    }
    return out;
  }

  const PREP_SENSE = {
    in: 'means “in, on” with the ablative and “into, onto” with the accusative',
    ad: 'means “to, toward” and takes the accusative',
  };

  /** Role + form label for each word of a generated sentence, aligned with target.words. */
  function latinRoles(target) {
    const parsed = parseLatin(target.words.join(' '));
    const idx = parsed.readings.findIndex(r => key(r) === key(target.m));
    const pick = parsed.parses[idx];
    return pick.map(o => ({ role: o.role, label: describe(o.a) }));
  }

  /** English answer to a Latin prompt. Correct if it fits any grammatical reading of the Latin. */
  function checkEnglish(answer, target) {
    const text = normEnglish(answer);
    const readings = target.readings;
    const matchIdx = readings.findIndex(r => englishRegex(r).test(text));
    const out = { correct: matchIdx >= 0, reading: readings[matchIdx] || null, notes: [] };
    if (out.correct || !text) {
      if (!text) out.notes.push('Type an English translation.');
      return out;
    }
    // Hints against the intended reading: nouns in the wrong number, missing verb.
    const m = target.m;
    const words = new Set(text.split(' ').map(w => w.replace(/'s?$/, '')));
    const nps = [m.subj, m.obj, m.dat, m.pp, m.pred].flatMap(x => (x ? [x, x.gen, x.and] : [])).filter(Boolean);
    nps.forEach(np => {
      const n = NOUN[np.n];
      const right = n.en.map(p => p[np.num === 'sg' ? 0 : 1].toLowerCase());
      const wrong = n.en.map(p => p[np.num === 'sg' ? 1 : 0].toLowerCase());
      if (right.some(w => words.has(w))) return;
      const formWord = target.words.find(w => analyze(w).some(a => a.id === np.n));
      if (wrong.some(w => words.has(w))) out.notes.push(`Check the number of “${formWord}” — it is ${np.num === 'sg' ? 'singular' : 'plural'} here.`);
      else out.notes.push(`“${formWord}” (${n.lemma}, ${n.en[0][0]}) isn't translated.`);
    });
    [m.verb, m.inf].filter(Boolean).forEach(v => {
      const vb = VERB[v];
      if (vb.linking ? ['am', 'is', 'are', 'be'].some(w => words.has(w)) : vb.en.some(f => f.some(w => words.has(w)))) return;
      const past = vb.linking ? ['was', 'were'] : vb.en.flatMap(([base]) => [PAST[base], base + 'd', base + 'ed', base.replace(/y$/, 'ied')]);
      const present = vb.linking ? englishOf(m) : englishOf({ ...m, inf: null, obj: null, dat: null, verb: v });
      if (past.some(w => words.has(w))) out.notes.push(`${vb.lemma} is in the present tense here — “${present.replace(/\.$/, '')}”, not the past.`);
      else out.notes.push(`The verb ${vb.lemma} (“to ${vb.en[0][0]}”) isn't translated.`);
    });
    if (m.pp && !out.notes.length) {
      const kind = ppKind(m.pp.prep, m.pp.case);
      if (!PP_KINDS[kind].en.some(w => (' ' + text + ' ').includes(' ' + w + ' '))) {
        const words = latinPP(target);
        out.notes.push(`“${words}” is ${PREP[m.pp.prep].form} + ${CASE_NAMES[m.pp.case].toLowerCase()}, ${PP_KINDS[kind].name}: “${ppEnglish(m.pp)}”.`);
      }
    }
    if (!m.subj && !out.notes.length) {
      const agr = m.person + m.num;
      if (!new RegExp(`^${PRONOUN_RE[agr]} `).test(text)) out.notes.push(`The ending of “${verbForm(VERB[m.verb], agr)}” shows the subject: ${PERSON_NAMES[agr]} (“${PRONOUN_DISPLAY[agr]}”).`);
    }
    if (!out.notes.length) out.notes.push('The words are right but the roles don\'t match — check who does what to whom (case endings).');
    return out;
  }

  /** The Latin words of the target's prepositional phrase, as written in the sentence. */
  function latinPP(target) {
    const i = target.words.findIndex(w => analyze(w).some(a => a.pos === 'prep'));
    const n = target.words.findIndex((w, j) => j > i && analyze(w).some(a => a.id === target.m.pp.n));
    return target.words.slice(i, n + 1).join(' ');
  }

  /** Word-by-word analysis of a sentence under a given reading. */
  function breakdown(target, reading) {
    const parsed = parseLatin(target.words.join(' '));
    const idx = parsed.readings.findIndex(r => key(r) === key(reading || target.m));
    const pick = parsed.parses[Math.max(idx, 0)];
    return target.words.map((w, i) => {
      const o = pick[i];
      const a = o.a;
      const pp = pick.find(x => x.role === 'pobj');
      const kind = pp && ppKind(pick.find(x => x.role === 'prep').a.id, pp.a.case);
      let role = ROLE_NAMES[o.role];
      if (o.role === 'gen') role = 'possessor of ' + target.words[o.head];
      if (o.role === 'pobj') role = `object of ${PREP[pick[i - 1].role === 'prep' ? pick[i - 1].a.id : pick[i - 2].a.id].form} (${PP_KINDS[kind].name})`;
      if (o.role === 'and') role = `${ROLE_NAMES[pick[o.head].role]}, joined to ${target.words[o.head]} by ${a.que ? '-que' : 'et'}`;
      if (a.pos === 'conj') {
        return { word: w, lemma: 'et', gloss: 'and', form: 'Conjunction', role: `joins ${target.words[i - 1]} and ${target.words[i + 1]}` };
      }
      if (a.pos === 'prep') {
        return {
          word: w, lemma: PREP[a.id].form + (a.id === 'in' ? ' + abl. / acc.' : ' + acc.'),
          gloss: PP_KINDS[kind].en.slice(0, 2).join(', '), form: `Preposition + ${CASE_NAMES[pp.a.case].toLowerCase()}`, role: PP_KINDS[kind].name,
        };
      }
      const entry = a.pos === 'noun' ? NOUN[a.id] : VERB[a.id];
      return {
        word: w,
        lemma: a.pos === 'noun' ? `${entry.lemma}, ${entry.genSg}` : `${entry.first}, ${entry.lemma}`,
        gloss: a.pos === 'noun' ? entry.en[0][0] + (a.que ? ' + “and”' : '') : 'to ' + entry.en[0][0],
        form: describe(a),
        role,
      };
    });
  }

  // ─── Drill helpers ────────────────────────────────────────────────────────

  function nounParadigm(n) {
    return NUMS.flatMap(num => CASES.map(c => ({ case: c, num, form: nounForm(n, c, num), alts: nounAlts(n, c, num) })));
  }
  function verbParadigm(v) {
    return PERSONS.map(p => ({ p, form: verbForm(v, p) })).concat([{ p: 'inf', form: verbForm(v, 'inf') }]);
  }

  /** English meaning of a single verb form, e.g. vocant → "they call". */
  function verbFormEnglish(v, p) {
    if (p === 'inf') return 'to ' + v.en[0][0];
    const pron = { '1sg': 'I', '2sg': 'you (sg.)', '3sg': 'he/she/it', '1pl': 'we', '2pl': 'you (pl.)', '3pl': 'they' }[p];
    return pron + ' ' + (v.linking ? BE_EN[p] : v.en[0][p === '3sg' ? 1 : 0]);
  }

  const API = {
    CASES, NUMS, CASE_NAMES, NUM_NAMES, PERSONS, PERSON_NAMES, DECL1, DECL2, DECL2N, DECLS, DECL_NAMES, CONJ1, ROLE_NAMES,
    NOUNS, VERBS, NOUN, VERB, PEOPLE, HUMANS, PLACES, POSSESSORS, OWNERS, MAX_WORDS, CONJS,
    PREPS, PREP, PP_KINDS, PREP_SENSE, ppKind, ppEnglish, predOk, placeOk, THING_PREDS, THING_PLACES,
    nounForm, nounEnding, nounAlts, verbForm, nounParadigm, verbParadigm, verbFormEnglish,
    norm, stripMacrons, hasMacron, analyze, describe, tokenize,
    parseLatin, key, englishOf, englishRegex, normEnglish,
    generateSentence, checkLatin, checkEnglish, breakdown,
    makeRng, pickOne, shuffle,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Latin = API;
})(typeof self !== 'undefined' ? self : this);
