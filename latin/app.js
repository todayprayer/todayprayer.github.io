/* Latin Instructor — UI. All grammar lives in engine.js (window.Latin). */
(() => {
  'use strict';
  const L = window.Latin;

  // ─── Small helpers ──────────────────────────────────────────────────────

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k.startsWith('aria-') && typeof v === 'boolean') { el.setAttribute(k, String(v)); continue; }
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : String(kid));
    }
    return el;
  }
  /** replaceChildren that flattens arrays and skips null/false, like h(). */
  function fill(el, ...kids) {
    el.replaceChildren(...kids.flat(Infinity).filter(k => k != null && k !== false).map(k => (k.nodeType ? k : String(k))));
  }
  const la = (text, cls = '') => h('span', { class: ('la ' + cls).trim() }, text);
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const sample = (list, n) => L.shuffle(list.slice()).slice(0, n);
  const uniq = list => [...new Set(list)];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  const store = {
    get(k, d) { try { const v = localStorage.getItem('latin.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('latin.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };
  const settings = {
    macrons: store.get('macrons', true),
    hints: store.get('hints', true),
    wordList: store.get('wordList', false),
    tabs: store.get('tabs', true),
    theme: store.get('theme', 'auto'),
    vary: store.get('vary', false),
    length: store.get('length', 3),
    dir: store.get('dir', 'la-en'),
    view: store.get('view', 'translate'),
    game: store.get('game', 'mc'),
    builderLength: store.get('builderLength', 4),
    paradigmKind: store.get('paradigmKind', 'either'),
    massMode: store.get('massMode', 'text'),
    massSections: store.get('massSections', null),   // null = all sections
    massDir: store.get('massDir', 'en-la'),
    // countdown per question, 1–60 seconds: main Translate tab and the Mass drills
    tTime: store.get('tTime', 60),
    massTime: store.get('massTime', 60),
    nounmatchTime: store.get('nounmatchTime', 60),
    verbmatchTime: store.get('verbmatchTime', 60),
    builderTime: store.get('builderTime', 60),
    paradigmTime: store.get('paradigmTime', 60),
    massServerOnly: store.get('massServerOnly', false),
    massShowEn: store.get('massShowEn', true),
    // replaces the old 'massHide', whose S/M keys meant priest/server
    massCover: store.get('massCover', 'none'),
  };
  function set(k, v) { settings[k] = v; store.set(k, v); }

  /** Display a Latin form according to the macron setting. */
  const show = s => (settings.macrons ? s : L.stripMacrons(s));

  /** stem + highlighted ending, for paradigm tables. */
  function formWithEnding(form, stem) {
    if (stem && form.startsWith(stem) && form.length > stem.length) {
      return [la(show(stem)), h('span', { class: 'la end' }, show(form.slice(stem.length)))];
    }
    return la(show(form));
  }

  const nounEntry = n => `${n.lemma}, ${n.genSg}`;
  const verbEntry = v => `${v.first}, ${v.lemma}`;
  const genderLabel = n => n.gender + '.';
  const cellLabel = c => `${L.CASE_NAMES[c.case]} ${c.num === 'sg' ? 'singular' : 'plural'}`;
  const ROLE_BY_CASE = { nom: 'subject', gen: 'possessor (“of …”)', dat: 'indirect object (“to/for …”)', acc: 'direct object; after ad / in: motion to, into', abl: 'after in: place where (“in, on”)' };
  const prepEntry = p => (p.id === 'in' ? 'in + abl. / acc.' : 'ad + acc.');
  const PREP_GLOSS = { in: '“in, on” + abl.; “into, onto” + acc.', ad: '“to, toward” + acc.' };
  /** Dictionary entry for one analysis of a word: rosa, rosae / amō, amāre / ad + acc. / et */
  function entryOf(a) {
    if (a.pos === 'noun') return nounEntry(L.NOUN[a.id]);
    if (a.pos === 'prep') return prepEntry(L.PREP[a.id]);
    if (a.pos === 'conj') return a.id;
    return verbEntry(L.VERB[a.id]);
  }
  function tipOf(a) {
    if (a.pos === 'noun') { const n = L.NOUN[a.id]; return `${show(nounEntry(n))} (${genderLabel(n)}) — ${n.en[0][0]}${a.que ? '  + -que “and”' : ''}`; }
    if (a.pos === 'prep') return `${a.id} — ${PREP_GLOSS[a.id]}`;
    if (a.pos === 'conj') return 'et — and';
    const v = L.VERB[a.id];
    return `${show(verbEntry(v))} — to ${v.en[0][0]}`;
  }

  function verbUsage(v) {
    if (v.linking) return 'a noun in the nominative (“is a …”), or a place (in + abl.)';
    if (v.takesInf) return 'object, or an infinitive (“love to …”)';
    if (v.trans && v.datList.length) return 'object + dative (“to …”)';
    if (v.trans) return 'takes an object';
    return 'no object';
  }

  // ─── Score ──────────────────────────────────────────────────────────────

  const scores = {};
  let activity = 'translate';
  function score(correct, key = activity) {
    const s = scores[key] || (scores[key] = { right: 0, total: 0, streak: 0 });
    s.total++;
    if (correct) { s.right++; s.streak++; } else s.streak = 0;
    renderScore();
  }
  function renderScore() {
    const s = scores[activity];
    const el = $('#score');
    el.replaceChildren();
    if (!s) return;
    el.append(h('b', null, `${s.right}/${s.total}`), ' correct');
    if (s.streak > 1) el.append('  ·  streak ', h('b', null, s.streak));
  }
  function setActivity(key) { activity = key; renderScore(); }

  // ─── Theme & settings menu ──────────────────────────────────────────────

  function applyTheme() {
    if (settings.theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', settings.theme);
  }

  function initMenu() {
    const menu = $('#menu'), btn = $('#menu-btn');
    const toggle = open => { menu.hidden = !open; btn.setAttribute('aria-expanded', open); };
    btn.addEventListener('click', e => { e.stopPropagation(); toggle(menu.hidden); });
    document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) toggle(false); });

    const bind = (id, k, after) => {
      const el = $(id);
      el.checked = settings[k];
      el.addEventListener('change', () => { set(k, el.checked); after(); });
    };
    bind('#opt-macrons', 'macrons', rerenderAll);
    bind('#opt-hints', 'hints', () => Translate.renderPrompt());
    bind('#opt-tabs', 'tabs', () => document.body.classList.toggle('no-tabs', !settings.tabs));
    document.body.classList.toggle('no-tabs', !settings.tabs);
    const theme = $('#opt-theme');
    theme.value = settings.theme;
    theme.addEventListener('change', () => { set('theme', theme.value); applyTheme(); });
  }

  function rerenderAll() {
    Translate.renderPrompt();
    Translate.rerenderFeedback();
    Drawers.refresh();
    Drills.rerender();
  }

  // ─── Reference drawers ──────────────────────────────────────────────────

  const Drawers = (() => {
    const state = { left: null, right: null, noun: 'puella', verb: 'amare', filter: '' };
    const lastRight = () => store.get('lastRight', 'decl');

    function open(side, pane) {
      state[side] = pane;
      store.set('pane.' + side, pane);
      if (side === 'right' && pane) store.set('lastRight', pane);
      const el = $('#drawer-' + side);
      el.classList.toggle('open', !!pane);
      $$('.handle', el).forEach(b => b.setAttribute('aria-expanded', b.dataset.pane === pane));
      document.body.classList.toggle('push-' + side, !!pane);
      $('#scrim').classList.toggle('show', !!(state.left || state.right));
      render(side);
    }
    function toggle(side, pane) { open(side, state[side] === pane ? null : pane); }

    function render(side) {
      const pane = state[side];
      const host = $('#pane-' + side);
      if (!pane) return;
      const scroll = host.scrollTop;
      fill(host, PANES[pane]());
      host.scrollTop = scroll;
    }
    function refresh() { render('left'); render('right'); }

    function head(title, side) {
      return h('div', { class: 'drawer-head' },
        h('h2', null, title),
        h('button', { class: 'icon-btn', 'aria-label': 'Tuck away', title: 'Tuck away (Esc)', onclick: () => open(side, null) },
          svgClose()));
    }
    function svgClose() {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
      s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round');
      s.innerHTML = '<path d="M6 6l12 12M18 6L6 18"/>';
      return s;
    }

    const PANES = {
      vocab() {
        const q = L.norm(state.filter);
        const match = (latin, english) => !q || L.norm(latin).includes(q) || english.some(e => L.norm(e).includes(q));
        const nounRows = list => list.filter(n => match(nounEntry(n), n.en.flat())).map(n =>
          h('tr', { class: 'vocab-row', title: 'Show full declension', onclick: () => { state.noun = n.id; open('right', 'decl'); } },
            h('td', { class: 'la' }, show(n.lemma), h('span', { class: 'muted' }, ', ' + show(n.genSg))),
            h('td', null, genderLabel(n)),
            h('td', null, n.en.map(p => p[0]).join(', '))));
        const verbRows = list => list.filter(v => match(verbEntry(v), v.en.flat())).map(v =>
          h('tr', { class: 'vocab-row', title: 'Show full conjugation', onclick: () => { state.verb = v.id; open('right', 'conj'); } },
            h('td', { class: 'la' }, show(v.first), h('span', { class: 'muted' }, ', ' + show(v.lemma))),
            h('td', null, 'to ' + v.en.map(e => e[0]).join(', '), h('div', { class: 'muted', style: 'font-size:12.5px' }, verbUsage(v)))));
        const conjRows = L.CONJS.filter(c => match(c.form, [c.en])).map(c =>
          h('tr', { class: 'vocab-row', title: 'How “and” works', onclick: () => open('right', 'syntax') },
            h('td', { class: 'la' }, c.form),
            h('td', null, c.en, h('div', { class: 'muted', style: 'font-size:12.5px' },
              c.enclitic ? 'on the end of the second word: puer puellaque' : 'between two words: puer et puella'))));
        const section = (title, rows) => h('section', null,
          h('h3', null, `${title} (${rows.length})`),
          rows.length ? h('table', { class: 'grid' }, h('tbody', null, rows)) : h('p', { class: 'muted' }, 'No matches.'));
        const decl = key => L.NOUNS.filter(n => n.declKey === key);
        const prepRows = L.PREPS.filter(p => match(p.form, [PREP_GLOSS[p.id]])).map(p =>
          h('tr', { class: 'vocab-row', title: 'How phrases work', onclick: () => open('right', 'syntax') },
            h('td', { class: 'la' }, p.form, h('span', { class: 'muted' }, p.id === 'in' ? ' + abl. / acc.' : ' + acc.')),
            h('td', null, p.id === 'in'
              ? ['in, on ', h('span', { class: 'muted' }, '(+ abl.)'), h('br'), 'into, onto ', h('span', { class: 'muted' }, '(+ acc.)')]
              : ['to, toward ', h('span', { class: 'muted' }, '(+ acc.)')])));
        const search = h('input', {
          class: 'search', type: 'search', placeholder: 'Filter Latin or English…', value: state.filter,
          oninput: e => { state.filter = e.target.value; const pos = e.target.selectionStart; render('left'); const s = $('#pane-left .search'); s.focus(); s.setSelectionRange(pos, pos); },
        });
        return h('div', null,
          head('Vocabulary', 'left'),
          h('p', { class: 'muted' }, 'Click a word to see all its forms.'),
          search,
          section('Nouns · 1st declension', nounRows(decl(1))),
          section('Nouns · 2nd declension', nounRows(decl(2))),
          section('Nouns · 2nd declension neuter', nounRows(decl('2n'))),
          section('Verbs · 1st conjugation', verbRows(L.VERBS.filter(v => !v.irregular))),
          section('Verbs · irregular', verbRows(L.VERBS.filter(v => v.irregular))),
          section('Prepositions', prepRows),
          section('Conjunctions', conjRows));
      },

      decl() {
        const n = L.NOUN[state.noun];
        const select = h('select', { 'aria-label': 'Noun', onchange: e => { state.noun = e.target.value; render('right'); } },
          [1, 2, '2n'].map(k => h('optgroup', { label: cap(L.DECL_NAMES[k]) },
            L.NOUNS.filter(x => x.declKey === k).map(x => h('option', { value: x.id, selected: x.id === n.id }, show(x.lemma) + ' — ' + x.en[0][0])))));
        const cells = L.nounParadigm(n);
        const cell = (c, num) => cells.find(x => x.case === c && x.num === num);
        const table = L.DECLS[n.declKey];
        const intro = {
          1: 'Nouns whose nominative ends in -a and genitive in -ae. Stem = genitive singular minus -ae.',
          2: 'Masculine nouns whose genitive ends in -ī: most have -us in the nominative, a few -er (puer, ager). Stem = genitive singular minus -ī.',
          '2n': 'Neuter nouns in -um, genitive -ī. Same as the masculine except in the nominative and accusative.',
        }[n.declKey];
        const nomSgEnding = n.declKey === 2 ? '-us / -er' : '-' + show(table.sg.nom);
        return h('div', null,
          head(cap(L.DECL_NAMES[n.declKey]), 'right'),
          h('p', { class: 'muted' }, intro),
          h('section', null,
            h('h3', null, 'Endings'),
            h('table', { class: 'grid' },
              h('thead', null, h('tr', null, h('th', null, 'Case'), h('th', null, 'Sg.'), h('th', null, 'Pl.'), h('th', null, 'In our sentences'))),
              h('tbody', null, L.CASES.map(c => h('tr', null,
                h('td', null, L.CASE_NAMES[c]),
                h('td', { class: 'la', style: 'white-space:nowrap' }, h('span', { class: 'end' }, c === 'nom' ? nomSgEnding : '-' + show(table.sg[c]))),
                h('td', { class: 'la', style: 'white-space:nowrap' }, h('span', { class: 'end' }, '-' + show(table.pl[c]))),
                h('td', { class: 'muted', style: 'font-size:13px' }, ROLE_BY_CASE[c])))))),
          h('section', null,
            h('h3', null, 'Fully declined'),
            select,
            h('table', { class: 'grid', style: 'margin-top:8px' },
              h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Singular'), h('th', null, 'Plural'))),
              h('tbody', null, L.CASES.map(c => h('tr', null,
                h('td', null, L.CASE_NAMES[c]),
                ...L.NUMS.map(num => {
                  const x = cell(c, num);
                  return h('td', { class: 'la' }, formWithEnding(x.form, n.stem),
                    x.alts.length ? h('div', { class: 'muted', style: 'font-size:13px' }, 'or ' + x.alts.map(show).join(', ')) : null);
                })))))),
          ...{
            1: [
              h('div', { class: 'note' }, h('b', null, 'Same ending, several cases. '), `-ae can be genitive singular, dative singular or nominative plural; -īs is dative or ablative plural. Context decides, and the checker accepts every reading the grammar allows.`),
              h('div', { class: 'note' }, h('b', null, 'Gender. '), 'Almost all are feminine; agricola, nauta and poēta are masculine (men’s jobs), but decline exactly the same.'),
              h('div', { class: 'note' }, h('b', null, 'Vocative '), '(direct address) is the same as the nominative in the 1st declension.'),
            ],
            2: [
              h('div', { class: 'note' }, h('b', null, 'Same ending, several cases. '), `-ī can be genitive singular or nominative plural; -ō is dative or ablative singular; -īs is dative or ablative plural, as in the 1st declension.`),
              h('div', { class: 'note' }, h('b', null, 'The -er nouns. '), show('puer keeps its e in every form (puerī, puerum). ager, magister and liber drop it (agrī, magistrī, librī) — the genitive shows the stem. vir is like puer.')),
              h('div', { class: 'note' }, h('b', null, 'Vocative. '), show('Nouns in -us have their own vocative in -e (domine, “O Lord!”), and fīlius has fīlī. Our sentences don’t use it.')),
            ],
            '2n': [
              h('div', { class: 'note' }, h('b', null, 'The neuter rule. '), 'Nominative and accusative are always the same, and in the plural both end in -a. So templum can be subject or object; here only esse lets a thing be a subject (templum in oppidō est).'),
              h('div', { class: 'note' }, h('b', null, 'Don’t mix up -a. '), show('dōna is neuter plural (“gifts”), not 1st-declension singular. The genitive dōnī tells you which declension a noun belongs to.')),
            ],
          }[n.declKey],
          n.alt && n.id === 'filia' ? h('div', { class: 'note' }, h('b', null, show(n.lemma) + ': '), show(`the dative/ablative plural fīliābus is often used instead of fīliīs, to keep “daughters” apart from fīliīs “sons”. Both are accepted.`)) : null,
          n.id === 'filius' ? h('div', { class: 'note' }, h('b', null, show(n.lemma) + ': '), show(`fīliīs “to/with sons” looks just like fīliīs “to/with daughters”; that is why fīlia has the extra form fīliābus.`)) : null,
          n.id === 'deus' ? h('div', { class: 'note' }, h('b', null, show(n.lemma) + ': '), show(`the plural has short forms: dī or diī beside deī, and dīs or diīs beside deīs. All are accepted. Singular deus is “God” with no article.`)) : null);
      },

      conj() {
        const v = L.VERB[state.verb];
        const select = h('select', { 'aria-label': 'Verb', onchange: e => { state.verb = e.target.value; render('right'); } },
          L.VERBS.map(x => h('option', { value: x.id, selected: x.id === v.id }, show(x.lemma) + ' — to ' + x.en[0][0])));
        const stem = v.irregular ? null : v.forms ? 'd' : v.stem;
        const row = (sg, pl) => h('tr', null,
          h('td', null, sg[0]), h('td', { class: 'la' }, sg[1]), h('td', { class: 'la' }, pl[1]));
        const ending = p => h('span', { class: 'end' }, '-' + show(L.CONJ1[p]));
        const formCell = p => h('div', null, h('div', { style: 'font-size:17px' }, formWithEnding(L.verbForm(v, p), stem)),
          h('div', { class: 'muted', style: 'font-size:12.5px' }, L.verbFormEnglish(v, p)));
        const fullTable = h('table', { class: 'grid', style: 'margin-top:8px' },
          h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Singular'), h('th', null, 'Plural'))),
          h('tbody', null,
            ['1', '2', '3'].map(p => h('tr', null, h('td', null, p + (p === '1' ? 'st' : p === '2' ? 'nd' : 'rd')),
              h('td', null, formCell(p + 'sg')), h('td', null, formCell(p + 'pl')))),
            h('tr', null, h('td', null, 'Inf.'), h('td', { colspan: 2 }, formCell('inf')))));
        if (v.irregular) {
          const ex = (latin, english) => h('div', { style: 'margin-top:4px' }, la(show(latin)), h('span', { class: 'muted', style: 'font-size:13px' }, ' — ' + english));
          return h('div', null,
            head('Irregular: sum, esse', 'right'),
            h('p', { class: 'muted' }, '“To be.” Present indicative and infinitive. It follows no conjugation, so learn it by heart.'),
            h('section', null, h('h3', null, 'Fully conjugated'), select, fullTable),
            h('div', { class: 'note' }, h('b', null, 'Look at the endings. '), show('After the 1st singular they are the ones you know: -s, -t, -mus, -tis, -nt (es, est, sumus, estis, sunt). sum ends in -m instead of -ō.')),
            h('div', { class: 'note' }, h('b', null, 'Nominative on both sides. '), 'esse links two nouns in the same case, so it takes no accusative. The predicate noun agrees with the subject in number (and, for people, in gender where it can).',
              ex('Puer amīcus est.', 'The boy is a friend.'), ex('Puellae fīliae sunt.', 'The girls are daughters.'), ex('Nauta sum.', 'I am a sailor.')),
            h('div', { class: 'note' }, h('b', null, 'Where something is. '), 'With in + ablative, esse says where: ',
              ex('Vīnum in mēnsā est.', 'The wine is on the table.'), ex('In culīnā sumus.', 'We are in the kitchen.')),
            h('div', { class: 'note' }, h('b', null, 'Word order. '), show('est often comes in the middle (puer est amīcus) or even first. Either way, the checker works out which nominative is the subject from what makes sense.')));
        }
        return h('div', null,
          head('1st Conjugation', 'right'),
          h('p', { class: 'muted' }, 'Present indicative active, plus the present infinitive. Infinitive in -āre; present stem = infinitive minus -re (amā-).'),
          h('section', null,
            h('h3', null, 'Endings'),
            h('table', { class: 'grid' },
              h('thead', null, h('tr', null, h('th', null, 'Person'), h('th', null, 'Singular'), h('th', null, 'Plural'))),
              h('tbody', null,
                row(['1st (I / we)', ending('1sg')], [null, ending('1pl')]),
                row(['2nd (you)', ending('2sg')], [null, ending('2pl')]),
                row(['3rd (he, she, it / they)', ending('3sg')], [null, ending('3pl')]),
                h('tr', null, h('td', null, 'Infinitive'), h('td', { class: 'la', colspan: 2 }, h('span', { class: 'end' }, '-' + show(L.CONJ1.inf)), h('span', { class: 'muted', style: 'font:13px var(--sans)' }, '  “to …”')))))),
          h('section', null, h('h3', null, 'Fully conjugated'), select, fullTable),
          h('div', { class: 'note' }, h('b', null, 'No pronoun needed. '), 'The ending carries the subject: ambulāmus = “we walk”. A noun subject is always 3rd person.'),
          h('div', { class: 'note' }, h('b', null, 'Three English presents. '), 'amat = “he loves”, “he is loving”, “he does love” — all accepted.'),
          v.id === 'dare'
            ? h('div', { class: 'note' }, h('b', null, 'dare is irregular in one way: '), 'its a is short — damus, datis, dare (not dāmus). Otherwise it follows the pattern.')
            : h('div', { class: 'note' }, h('b', null, 'The a of the stem '), 'merges into -ō in the 1st singular (amā + ō → amō) and is short before final -t and -nt (amat, amant).'));
      },

      syntax() {
        const ex = (latin, english) => h('div', null, la(show(latin)), h('div', { class: 'muted', style: 'font-size:13px' }, english));
        const objects = L.VERBS.filter(v => v.trans);
        const lemmas = ids => ids.map(id => show(L.NOUN[id].lemma)).join(', ');
        // "any person" instead of listing all fourteen
        const nounList = ids => {
          const people = L.PEOPLE.every(id => ids.includes(id)) ? 'any person'
            : L.HUMANS.every(id => ids.includes(id)) ? 'any person but deus' : lemmas(ids.filter(id => L.PEOPLE.includes(id)));
          return [people, lemmas(ids.filter(id => !L.PEOPLE.includes(id)))].filter(Boolean).join('; ');
        };
        return h('div', null,
          head('How sentences work', 'right'),
          h('p', { class: 'muted' }, 'The rules the sentence generator and the answer checker share.'),
          h('section', null,
            h('h3', null, 'Who does what — read the endings'),
            h('table', { class: 'grid' },
              h('thead', null, h('tr', null, h('th', null, 'Role'), h('th', null, 'Case'), h('th', null, 'Example'))),
              h('tbody', null,
                h('tr', null, h('td', null, 'Subject'), h('td', null, 'Nominative'), h('td', null, ex('Puella ambulat.', 'The girl walks.'))),
                h('tr', null, h('td', null, 'Direct object'), h('td', null, 'Accusative'), h('td', null, ex('Rosam portat.', 'He carries the rose.'))),
                h('tr', null, h('td', null, 'Indirect object'), h('td', null, 'Dative'), h('td', null, ex('Puellae rosam dat.', 'She gives the rose to the girl.'))),
                h('tr', null, h('td', null, 'Possessor'), h('td', null, 'Genitive'), h('td', null, ex('Fīlia rēgīnae cantat.', 'The queen’s daughter sings.'))),
                h('tr', null, h('td', null, 'Place where'), h('td', null, 'in + ablative'), h('td', null, ex('In ecclēsiā ōrat.', 'She prays in the church.'))),
                h('tr', null, h('td', null, 'Motion into'), h('td', null, 'in + accusative'), h('td', null, ex('In ecclēsiam ambulat.', 'He walks into the church.'))),
                h('tr', null, h('td', null, 'Motion toward'), h('td', null, 'ad + accusative'), h('td', null, ex('Ad īnsulam nāvigāmus.', 'We sail to the island.'))),
                h('tr', null, h('td', null, 'Infinitive'), h('td', null, '-āre'), h('td', null, ex('Nautae nāvigāre amant.', 'The sailors love to sail.'))),
                h('tr', null, h('td', null, 'Predicate noun'), h('td', null, 'Nominative, with esse'), h('td', null, ex('Puer amīcus est.', 'The boy is a friend.'))),
                h('tr', null, h('td', null, 'Two nouns, one role'), h('td', null, 'Same case, + et / -que'), h('td', null, ex('Puer et puella ambulant.', 'The boy and the girl walk.')))))),
          h('section', null,
            h('h3', null, 'et and -que — “and”'),
            h('ul', null,
              h('li', null, h('b', null, 'et '), 'stands between the two words: ', la(show('puer et puella')), '.'),
              h('li', null, h('b', null, '-que '), 'is glued to the end of the second word, and means the same: ', la(show('puer puellaque')), '. Never on the first word (', la('puerque puella'), ' is wrong).'),
              h('li', null, 'Both nouns take the case of their role: ', la(show('rosam librumque portat')), ' (two objects, both accusative), ', la(show('puerō et puellae dat')), ' (two datives).'),
              h('li', null, 'Two subjects make a plural verb, even if each is singular: ', la(show('puer et puella ambulant')), '.'),
              h('li', null, 'Here “and” joins a subject, object or indirect object; the joined nouns have no genitive, and there is one “and” per sentence. The two can come in either order in English.'))),
          h('section', null,
            h('h3', null, 'esse — “to be”'),
            h('ul', null,
              h('li', null, h('b', null, 'X is a Y: '), 'both nouns nominative, same number: ', la(show('puerī servī sunt')), ' “the boys are servants”. No accusative after esse.'),
              h('li', null, h('b', null, 'X is somewhere: '), 'in + ablative: ', la(show('vīnum in mēnsā est')), ' “the wine is on the table”. esse never takes ad or in + accusative — it doesn’t move.'),
              h('li', null, h('b', null, 'Who can be what: '), 'people can be ', ['agricola', 'nauta', 'poeta', 'regina', 'amicus', 'dominus', 'servus', 'magister', 'filius', 'filia'].map(id => show(L.NOUN[id].lemma)).join(', '),
                '. agricola, nauta, poēta fit anyone; the rest must match the subject’s gender (a girl is a fīlia, not a fīlius). With no subject noun, anyone can be anyone: ', la(show('puella sum')), '.'),
              h('li', null, h('b', null, 'Things: '), Object.entries(L.THING_PREDS).map(([p, subs]) => `${show(subs.map(id => L.NOUN[id].lemma).join(', '))} can be ${show(L.NOUN[p].lemma)}`).join('; '), '.'))),
          h('section', null,
            h('h3', null, 'Word order'),
            h('ul', null,
              h('li', null, 'Usual order: subject – indirect object – object – (infinitive) – verb. The verb tends to come last.'),
              h('li', null, 'Because endings mark the roles, any order is grammatical; the checker accepts your words in any order.'),
              h('li', null, 'Keep a genitive right next to its noun (before or after it). Here that is a rule, because it decides whose is whose.'),
              h('li', null, 'A preposition comes directly before its noun; only that noun’s genitive may stand between (in rēgīnae īnsulā). One phrase per sentence.'),
              h('li', null, 'Joined nouns stay together: et between them, or -que right after the first.'))),
          h('section', null,
            h('h3', null, 'in or ad?'),
            h('ul', null,
              h('li', null, h('b', null, 'Where something happens: '), 'in + abl., with any verb. Places: ',
                L.PLACES.map(id => show(L.NOUN[id].lemma)).join(', '), '; nāvigāre takes ', show(L.NOUN.aqua.lemma), ' (“on the water”); pugnāre also takes ', show(L.NOUN.bellum.lemma), ' (“in the war”).'),
              h('li', null, h('b', null, 'With esse, things have their places: '), Object.entries(L.THING_PLACES).map(([s, places]) => `${show(L.NOUN[s].lemma)} in ${show(places.map(id => L.NOUN[id].lemma).join(' / '))}`).join('; '), '.'),
              L.VERBS.filter(v => v.to.length || v.into.length).map(v => h('li', null, h('b', null, show(v.lemma) + ': '),
                v.to.length ? ['ad + acc. (to) ', v.to.filter(id => !L.PEOPLE.includes(id)).map(id => show(L.NOUN[id].lemma)).join(', '),
                  v.to.some(id => L.PEOPLE.includes(id)) ? ' or a person' : ''] : '',
                v.into.length ? ['; in + acc. (into) ', v.into.map(id => show(L.NOUN[id].lemma)).join(', ')] : '', '.')),
              h('li', null, 'The ablative ending is what tells “in the church” (in ecclēsiā) from “into the church” (in ecclēsiam). Without macrons, -a can be nominative or ablative.'))),
          h('section', null,
            h('h3', null, 'What each verb allows'),
            h('ul', null,
              h('li', null, h('b', null, 'No object: '), L.VERBS.filter(v => !v.trans && !v.linking).map(v => show(v.lemma)).join(', '), '.'),
              objects.map(v => h('li', null, h('b', null, show(v.lemma) + ': '),
                v.takesInf ? 'an object or an infinitive; ' : '',
                'objects ', nounList(v.objs),
                v.datList.length ? ['; plus an optional dative: ', nounList(v.datList)] : '', '.')),
              h('li', null, h('b', null, 'esse: '), 'a predicate noun or a place, never an object.'),
              h('li', null, h('b', null, 'Subjects '), 'of action verbs are people: ', L.HUMANS.map(id => show(L.NOUN[id].lemma)).join(', '),
                '; ', show(L.NOUN.deus.lemma), ' also with ', L.VERBS.filter(v => v.subjs.includes('deus')).map(v => show(v.lemma)).join(', '),
                '. With esse, things can be subjects too.'))),
          h('div', { class: 'note' }, h('b', null, 'Ambiguity is real. '), 'Fīlia rēgīnae rosam dat can mean “the queen’s daughter gives a rose” or “the daughter gives a rose to the queen”. Any translation that fits a valid reading is marked correct, and the other readings are shown.'));
      },
    };

    function init() {
      $$('.drawer').forEach(d => {
        const side = d.id.replace('drawer-', '');
        $$('.handle', d).forEach(b => b.addEventListener('click', () => toggle(side, b.dataset.pane)));
      });
      $('#scrim').addEventListener('click', () => { open('left', null); open('right', null); });
      const wide = window.matchMedia('(min-width: 1240px)').matches;
      if (wide) {
        const l = store.get('pane.left', null), r = store.get('pane.right', null);
        if (l) open('left', l);
        if (r) open('right', r);
      }
    }

    return { init, open, toggle, refresh, state, lastRight };
  })();

  // ─── Countdown ──────────────────────────────────────────────────────────

  /**
   * Countdown bar for one question; settings[secondsKey] holds the limit (1–60 s).
   * Pauses while its view or the browser tab is hidden. start() begins a fresh countdown; stop() freezes it.
   */
  function Countdown({ view, secondsKey, onExpire }) {
    const bar = h('div', { class: 'cd-fill' });
    const label = h('span', { class: 'cd-label' });
    const el = h('div', { class: 'countdown', role: 'timer', 'aria-label': 'Time left' },
      h('div', { class: 'cd-track' }, bar), label);
    let total = 0, left = 0, last = 0, iv = null;
    function paint() {
      bar.style.width = (100 * left / total) + '%';
      label.textContent = Math.ceil(left / 1000) + ' s';
      el.classList.toggle('low', left <= Math.min(5000, total / 4));
    }
    function tick() {
      const now = performance.now(), dt = now - last;
      last = now;
      if (document.hidden || settings.view !== view || !el.isConnected) return;
      left = Math.max(0, left - dt);
      paint();
      if (!left) { stop(); onExpire(); }
    }
    function stop() { clearInterval(iv); iv = null; }
    function start() {
      stop();
      total = left = settings[secondsKey] * 1000;
      last = performance.now();
      paint();
      iv = setInterval(tick, 100);
    }
    return { el, start, stop };
  }

  /** "Time" range, styled like Length. onChange runs after it changes (to restart the countdown). */
  function timerControls({ secondsKey, onChange }) {
    const id = 'time-' + secondsKey;
    const secs = n => n + (+n === 1 ? ' second' : ' seconds');
    const out = h('output', { for: id }, secs(settings[secondsKey]));
    return h('div', { class: 'range', title: 'Time limit per question' },
      h('label', { for: id }, 'Time'),
      h('input', {
        type: 'range', id, min: 1, max: 60, step: 1, value: settings[secondsKey],
        oninput: e => { out.textContent = secs(e.target.value); },
        onchange: e => { set(secondsKey, +e.target.value); onChange(); },
      }),
      out);
  }

  // ─── Translate ──────────────────────────────────────────────────────────

  const Translate = (() => {
    let cur = null, result = null;   // result: { kind: 'checked' | 'revealed', answer, out }
    let peek = false;                 // word list revealed for this sentence only
    const input = $('#t-input');
    // When time runs out, whatever is typed is checked; an empty box counts as a miss.
    const timer = Countdown({ view: 'translate', secondsKey: 'tTime',
      onExpire: () => (input.value.trim() ? check(true) : reveal(true)) });

    function next() {
      cur = L.generateSentence(settings.length, { varyOrder: settings.vary });
      result = null;
      peek = false;
      input.value = '';
      input.disabled = false;
      $('#t-check').textContent = 'Check';
      $('#t-feedback').replaceChildren();
      renderPrompt();
      timer.start();
      input.focus();
    }

    function renderPrompt() {
      if (!cur) return;
      const toEnglish = settings.dir === 'la-en';
      $('#t-eyebrow').textContent = toEnglish ? 'Translate into English' : 'Translate into Latin';
      input.placeholder = toEnglish ? 'Your English translation…' : 'Your Latin translation (macrons optional)…';
      input.classList.toggle('la', !toEnglish);
      const prompt = $('#t-prompt');
      prompt.classList.toggle('la', toEnglish);
      prompt.classList.toggle('hints', toEnglish && settings.hints);
      $('#vary-wrap').hidden = !toEnglish;
      $('#wordlist-wrap').hidden = toEnglish;
      const hints = $('#t-hints');
      hints.replaceChildren();
      if (toEnglish) {
        fill(prompt, ...cur.words.flatMap((w, i) => {
          const tip = tipOf(L.analyze(w)[0]);
          const text = show(i === 0 ? cap(w) : w) + (i === cur.words.length - 1 ? '.' : '');
          const span = h('span', { class: 'w', 'data-tip': tip, tabindex: settings.hints ? 0 : null }, text);
          return i ? [' ', span] : [span];
        }));
      } else {
        prompt.textContent = cur.englishPrompt;
        if (settings.wordList || peek || result) {
          const entries = uniq(cur.words.flatMap(w => { const a = L.analyze(w)[0]; return a.que ? [entryOf(a), '-que'] : [entryOf(a)]; }))
            .sort((a, b) => L.norm(a).localeCompare(L.norm(b)));
          hints.append(...entries.map(e => h('span', { class: 'tag' }, la(show(e)))));
        } else {
          hints.append(h('button', { class: 'btn ghost', type: 'button', style: 'padding:4px 10px;font-size:13px;margin-left:-10px',
            onclick: () => { peek = true; renderPrompt(); input.focus(); } }, 'Peek at the words'));
        }
      }
    }

    function check(timedOut) {
      if (result) return next();
      const answer = input.value.trim();
      if (!answer) { input.focus(); return; }
      timer.stop();
      const out = settings.dir === 'la-en' ? L.checkEnglish(answer, cur) : L.checkLatin(answer, cur);
      result = { kind: 'checked', answer, out, timedOut: timedOut === true };
      score(out.correct);
      lock();
      renderPrompt();
      rerenderFeedback();
    }

    function reveal(timedOut) {
      if (result) return;
      timer.stop();
      result = { kind: 'revealed', answer: input.value.trim(), out: { correct: false, notes: [] }, timedOut: timedOut === true };
      score(false);
      lock();
      renderPrompt();
      rerenderFeedback();
    }

    function lock() {
      input.disabled = true;
      $('#t-check').textContent = 'Next';
      $('#t-check').focus();
    }

    function rerenderFeedback() {
      const host = $('#t-feedback');
      host.replaceChildren();
      if (!result || !cur) { $('#t-check').textContent = 'Check'; return; }
      const { kind, answer, out } = result;
      const toEnglish = settings.dir === 'la-en';
      const ok = kind === 'checked' && out.correct;
      const cls = kind === 'revealed' ? '' : ok ? 'ok' : 'bad';
      const title = result.timedOut && !ok ? '⏱  Time’s up' : kind === 'revealed' ? 'Answer' : ok ? '✓  Correct' : '✗  Not quite';

      const rows = [];
      if (answer) rows.push(['Your answer', answer, !toEnglish]);
      if (toEnglish) {
        const matched = out.reading;
        rows.push([ok ? 'Model answer' : 'Answer', L.englishOf(cur.m), false]);
        if (matched && L.key(matched) !== L.key(cur.m)) rows.push(['You read it as', L.englishOf(matched), false]);
      } else {
        rows.push([ok ? 'Model answer' : 'Answer', show(cur.latin), true]);
      }

      const others = cur.readings.filter(r => L.key(r) !== L.key(cur.m));
      const reading = (toEnglish && out.reading) || cur.m;
      const breakdown = L.breakdown(cur, reading);

      host.append(h('div', { class: 'feedback ' + cls },
        h('div', { class: 'fb-title' }, title),
        h('dl', null, rows.map(([k, v, isLa]) => h('div', { class: 'fb-row' }, h('dt', null, k), h('dd', { class: isLa ? 'la' : '' }, v)))),
        !ok && out.notes.length ? h('ul', { class: 'notes' }, out.notes.map(n => h('li', null, show(n)))) : null,
        ok && out.notes.length ? h('p', { class: 'muted', style: 'margin:8px 0 0;font-size:14px' }, out.notes.join(' ')) : null,
        toEnglish && others.length ? h('details', { open: !ok },
          h('summary', null, `The Latin also allows ${others.length} other reading${others.length > 1 ? 's' : ''}`),
          h('ul', { class: 'notes' }, others.map(r => h('li', null, L.englishOf(r))))) : null,
        h('details', null,
          h('summary', null, 'Word by word'),
          h('table', { class: 'grid' },
            h('thead', null, h('tr', null, h('th', null, 'Word'), h('th', null, 'Dictionary'), h('th', null, 'Form'), h('th', null, 'Role'))),
            h('tbody', null, breakdown.map(b => h('tr', null,
              h('td', { class: 'la' }, show(b.word)),
              h('td', null, la(show(b.lemma)), h('div', { class: 'muted', style: 'font-size:12.5px' }, b.gloss)),
              h('td', null, b.form),
              h('td', null, show(b.role)))))))));
    }

    function init() {
      $$('[data-dir]').forEach(b => {
        b.setAttribute('aria-pressed', b.dataset.dir === settings.dir);
        b.addEventListener('click', () => {
          set('dir', b.dataset.dir);
          $$('[data-dir]').forEach(x => x.setAttribute('aria-pressed', x === b));
          setActivity('translate:' + settings.dir);
          next();
        });
      });
      const len = $('#len'), out = $('#len-out');
      len.max = L.MAX_WORDS;
      len.value = settings.length;
      const label = () => { out.textContent = `${len.value} word${len.value === '1' ? '' : 's'}`; };
      label();
      len.addEventListener('input', label);
      len.addEventListener('change', () => { set('length', +len.value); next(); });
      const vary = $('#opt-vary');
      vary.checked = settings.vary;
      vary.addEventListener('change', () => { set('vary', vary.checked); if (settings.dir === 'la-en') next(); });
      const wordList = $('#opt-wordlist');
      wordList.checked = settings.wordList;
      wordList.addEventListener('change', () => { set('wordList', wordList.checked); renderPrompt(); });
      $('#t-form').addEventListener('submit', e => { e.preventDefault(); check(); });
      $('#t-next').addEventListener('click', next);
      $('#t-reveal').addEventListener('click', () => reveal());
      $('#view-translate .controls').append(timerControls({ secondsKey: 'tTime',
        onChange: () => { if (!result) timer.start(); } }));
      $('#t-form').before(timer.el);
      next();
    }

    return { init, next, renderPrompt, rerenderFeedback, activityKey: () => 'translate:' + settings.dir };
  })();

  // ─── Drills ─────────────────────────────────────────────────────────────

  const Drills = (() => {
    const host = $('#game');
    let current = null;

    const GAMES = [
      { id: 'mc', name: 'Multiple choice', start: MultipleChoice },
      { id: 'nounmatch', name: 'Noun forms', start: () => Match('noun') },
      { id: 'verbmatch', name: 'Verb forms', start: () => Match('verb') },
      { id: 'builder', name: 'Sentence builder', start: Builder },
      { id: 'paradigm', name: 'Fill the table', start: Paradigm },
    ];

    function select(id) {
      set('game', id);
      $$('#game-tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.game === id));
      setActivity(id);
      start();
    }
    function start() {
      if (current && current.stop) current.stop();
      const g = GAMES.find(x => x.id === settings.game) || GAMES[0];
      current = g.start();
      fill(host, current.el);
      if (current.focus) current.focus();
    }
    function rerender() { if (current && current.rerender) current.rerender(); }

    function init() {
      $('#game-tabs').append(...GAMES.map(g => h('button', {
        role: 'tab', 'data-game': g.id, 'aria-selected': g.id === settings.game, onclick: () => select(g.id),
      }, g.name)));
      start();
    }

    function onKey(e) { if (current && current.onKey) current.onKey(e); }
    function restartTimer() { if (current && current.restartTimer) current.restartTimer(); }

    return { init, rerender, onKey, restartTimer, activityKey: () => settings.game };
  })();

  /** Countdown and "Time" range for one drill game; each game keeps its own limit (settings[game + 'Time']). */
  const drillTimer = (game, onExpire) => Countdown({ view: 'drills', secondsKey: game + 'Time', onExpire });
  const drillTimerControls = game => timerControls({ secondsKey: game + 'Time', onChange: () => Drills.restartTimer() });

  // ── Multiple choice ──

  function MultipleChoice() {
    const el = h('div');
    let q = null, answered = false;

    const nounCells = n => L.nounParadigm(n);
    const options = (correct, wrong, latin) => L.shuffle([correct, ...sample(uniq(wrong).filter(w => w !== correct), 3)]).map(text => ({ text, correct: text === correct, latin }));

    const TYPES = [
      function nounForm() {
        const n = pick(L.NOUNS), cells = nounCells(n), c = pick(cells);
        const correct = show(c.form);
        const ending = L.nounEnding(n, c.case, c.num);
        return {
          q: ['The ', h('b', null, cellLabel(c).toLowerCase()), ` of the Latin for “${n.en[0][0]}”?`],
          options: options(correct, cells.map(x => show(x.form)), true),
          explain: ending == null
            ? [la(show(nounEntry(n))), `: the nominative singular has no ending to add — it is the dictionary form itself.`]
            : [la(show(nounEntry(n))), ': ', la(show(n.stem)), ' + ', la('-' + show(ending), 'end'), ` (${cellLabel(c).toLowerCase()}, ${L.DECL_NAMES[n.declKey]})`],
        };
      },
      function nounIdentify() {
        const n = pick(L.NOUNS), cells = nounCells(n), c = pick(cells);
        const form = show(c.form);
        const valid = cells.filter(x => show(x.form) === form).map(cellLabel);
        return {
          q: ['Which case and number could ', la(form, 'q-la'), ' be?'],
          options: options(cellLabel(c), cells.map(cellLabel).filter(l => !valid.includes(l)), false),
          explain: valid.length > 1 ? [la(form), ` can be any of: ${valid.join(', ').toLowerCase()}.`] : [la(form), ` is only ${valid[0].toLowerCase()}.`],
        };
      },
      function nounRole() {
        const n = pick(L.NOUNS);
        const roles = { nom: 'Subject', gen: 'Possessor (“of …”)', dat: 'Indirect object', acc: 'Direct object', abl: 'Place where, after in' };
        if (n.kind === 'person') delete roles.abl;   // people aren't places
        const cells = nounCells(n).filter(x => roles[x.case]);
        const sameForm = c => cells.filter(x => show(x.form) === show(c.form));
        // a form with three readings (rosae) would leave too few wrong answers
        const c = pick(cells.filter(x => sameForm(x).length <= 2));
        const form = show(c.form), valid = sameForm(c);
        return {
          q: ['In a sentence, ', la(form, 'q-la'), ' could be the…'],
          options: options(roles[c.case], Object.values(roles).filter(r => !valid.some(v => roles[v.case] === r)), false),
          explain: [la(form), ' is ', valid.map(v => `${cellLabel(v).toLowerCase()} → ${roles[v.case].toLowerCase()}`).join('; or '),
            c.case === 'acc' ? ' (or, after ad / in, where something goes)' : '', '.'],
        };
      },
      function prepPhrase() {
        const kind = pick(Object.keys(L.PP_KINDS)), K = L.PP_KINDS[kind];
        const n = pick(uniq(L.VERBS.flatMap(v => v[kind]))), num = pick(L.NUMS);
        const phrase = (prep, c, x) => show(prep + ' ' + L.nounForm(L.NOUN[n], c, x));
        const all = ['in', 'ad'].flatMap(p => ['abl', 'acc'].flatMap(c => L.NUMS.map(x => phrase(p, c, x))));
        return {
          q: ['The Latin for ', h('b', null, `“${L.ppEnglish({ prep: K.prep, case: K.case, n, num })}”`), '?'],
          options: options(phrase(K.prep, K.case, num), all, true),
          explain: [la(K.prep), ` + ${L.CASE_NAMES[K.case].toLowerCase()} = ${K.name}. `, la(show(nounEntry(L.NOUN[n]))), ` — ${L.NOUN[n].en[0][0]}`],
        };
      },
      function prepMeaning() {
        // nouns that make sense with at least two kinds of phrase (in / into / to the church)
        const kindsOf = id => Object.keys(L.PP_KINDS).filter(k => L.VERBS.some(v => v[k].includes(id)));
        const n = pick(L.NOUNS.map(x => x.id).filter(id => kindsOf(id).length > 1)), kinds = kindsOf(n);
        const kind = pick(kinds), K = L.PP_KINDS[kind], num = pick(L.NUMS);
        const en = (k, x) => L.ppEnglish({ prep: L.PP_KINDS[k].prep, case: L.PP_KINDS[k].case, n, num: x });
        const latin = show(K.prep + ' ' + L.nounForm(L.NOUN[n], K.case, num));
        return {
          q: ['What does ', la(latin, 'q-la'), ' mean?'],
          options: options(en(kind, num), kinds.flatMap(k => L.NUMS.map(x => en(k, x))), false),
          explain: [la(K.prep), ` + ${L.CASE_NAMES[K.case].toLowerCase()} ${num === 'sg' ? 'singular' : 'plural'} = ${K.name}`,
            K.prep === 'in' ? (K.case === 'abl' ? ' (with the accusative it would be motion into).' : ' (with the ablative it would be place where).') : '.'],
        };
      },
      function nounMeaning() {
        const n = pick(L.NOUNS);
        return {
          q: ['What does ', la(show(n.lemma), 'q-la'), ' mean?'],
          options: options(n.en[0][0], L.NOUNS.map(x => x.en[0][0]), false),
          explain: [la(show(nounEntry(n))), ` (${genderLabel(n)}) — ${n.en.map(p => p[0]).join(', ')}`],
        };
      },
      function verbForm() {
        const v = pick(L.VERBS), p = pick(L.PERSONS.concat(['inf']));
        const label = p === 'inf' ? 'present infinitive' : L.PERSON_NAMES[p];
        return {
          q: ['The ', h('b', null, label), ` of the Latin for “to ${v.en[0][0]}”?`],
          options: options(show(L.verbForm(v, p)), L.verbParadigm(v).map(x => show(x.form)), true),
          explain: [la(show(verbEntry(v))), ' → ', la(show(L.verbForm(v, p))), ` = “${L.verbFormEnglish(v, p)}”`],
        };
      },
      function verbIdentify() {
        const v = pick(L.VERBS), p = pick(L.PERSONS.concat(['inf']));
        const label = p === 'inf' ? 'Infinitive' : cap(L.PERSON_NAMES[p]);
        return {
          q: ['What form is ', la(show(L.verbForm(v, p)), 'q-la'), '?'],
          options: options(label, L.PERSONS.map(x => cap(L.PERSON_NAMES[x])).concat(['Infinitive']), false),
          explain: v.irregular
            ? [la(show(L.verbForm(v, p))), ` is ${label.toLowerCase()} of the irregular `, la(show(verbEntry(v))), `: “${L.verbFormEnglish(v, p)}”`]
            : ['Ending ', la('-' + show(L.CONJ1[p]), 'end'), ` → ${label.toLowerCase()}: “${L.verbFormEnglish(v, p)}”`],
        };
      },
      function verbMeaning() {
        const v = pick(L.VERBS), p = pick(L.PERSONS);
        const correct = L.verbFormEnglish(v, p);
        const wrong = L.PERSONS.map(x => L.verbFormEnglish(v, x)).concat(L.VERBS.map(w => L.verbFormEnglish(w, p)));
        return {
          q: ['What does ', la(show(L.verbForm(v, p)), 'q-la'), ' mean?'],
          options: options(correct, wrong, false),
          explain: v.irregular
            ? [la(show(verbEntry(v))), ` — to ${v.en[0][0]}, irregular; `, la(show(L.verbForm(v, p))), ` = ${L.PERSON_NAMES[p]}`]
            : [la(show(verbEntry(v))), ` — to ${v.en[0][0]}; ending `, la('-' + show(L.CONJ1[p]), 'end'), ` = ${L.PERSON_NAMES[p]}`],
        };
      },
      function queJoin() {
        // two different nouns in the same case and number, as subjects, objects or datives
        const c = pick(['nom', 'acc', 'dat']), num = pick(L.NUMS);
        const [a, b] = sample(L.NOUNS.filter(n => !n.sgOnly || num === 'sg'), 2);
        const fa = show(L.nounForm(a, c, num)), fb = show(L.nounForm(b, c, num));
        if (fa === fb) return queJoin();
        const correct = `${fa} ${fb}que`;
        return {
          q: ['Say ', la(`${fa} et ${fb}`, 'q-la'), ' with -que instead of et.'],
          options: L.shuffle([correct, `${fa}que ${fb}`, `${fa} et ${fb}que`, `${fa} que ${fb}`]).map(text => ({ text, correct: text === correct, latin: true })),
          explain: ['-que goes on the end of the ', h('b', null, 'second'), ' word and replaces et: ', la(correct), ` — “${a.en[0][num === 'sg' ? 0 : 1]} and ${b.en[0][num === 'sg' ? 0 : 1]}”.`],
        };
      },
      function sumForm() {
        const v = L.VERB.esse, p = pick(L.PERSONS);
        return {
          q: ['The Latin for ', h('b', null, `“${L.verbFormEnglish(v, p)}”`), '?'],
          options: options(show(L.verbForm(v, p)), L.verbParadigm(v).map(x => show(x.form)), true),
          explain: [la(show(verbEntry(v))), ': sum, es, est, sumus, estis, sunt.'],
        };
      },
      function verbLatin() {
        const v = pick(L.VERBS);
        return {
          q: ['Which Latin verb means ', h('b', null, `to ${v.en[0][0]}`), '?'],
          options: options(show(v.lemma), L.VERBS.map(x => show(x.lemma)), true),
          explain: [la(show(verbEntry(v))), ` — to ${v.en.map(e => e[0]).join(', ')}`],
        };
      },
    ];

    function nextQ() {
      q = pick(TYPES)();
      answered = false;
      render();
    }
    function choose(i) {
      if (answered) return;
      answered = true;
      q.chosen = i;
      score(q.options[i].correct);
      render();
    }
    function render() {
      fill(el, 
        h('h2', null, 'Multiple choice'),
        h('p', { class: 'sub' }, 'Forms, endings and meanings. Keys 1–4 to answer, Enter for the next question.'),
        h('div', { class: 'question' }, q.q),
        h('div', { class: 'options' }, q.options.map((o, i) => h('button', {
          class: 'option' + (o.latin ? ' la-opt' : '') + (answered && o.correct ? ' right' : '') + (answered && i === q.chosen && !o.correct ? ' wrong' : ''),
          disabled: answered, onclick: () => choose(i),
        }, h('span', { class: 'n' }, i + 1), h('span', null, o.text)))),
        h('div', { class: 'explain' }, answered ? [q.options[q.chosen].correct ? '✓ ' : '✗ ', ...q.explain] : ''),
        h('div', { class: 'game-foot' }, h('span'), h('button', { class: 'btn ' + (answered ? 'primary' : 'ghost'), onclick: nextQ, id: 'mc-next' }, answered ? 'Next question' : 'Skip')));
      if (answered) $('#mc-next', el).focus();
    }
    nextQ();
    return {
      el,
      // options are built from displayed forms, so a macron toggle needs a fresh question
      rerender: nextQ,
      onKey(e) {
        if (!answered && /^[1-4]$/.test(e.key)) { const i = +e.key - 1; if (q.options[i]) choose(i); }
      },
    };
  }

  // ── Matching (noun or verb forms) ──

  function Match(kind) {
    const el = h('div');
    const game = kind + 'match';
    // Time's up: every pair still unmatched counts as a miss, and the answers are listed.
    const timer = drillTimer(game, () => {
      timedOut = true;
      pairs.filter(p => !done.has(p.id)).forEach(() => score(false));
      render();
    });
    let pairs, left, right, sel, done, misses, lemma, timedOut;

    function setup() {
      if (kind === 'noun') {
        const n = pick(L.NOUNS);
        lemma = `The noun meaning “${n.en[0][0]}”.`;
        // A form shared by several cases (rosae = gen. sg. / dat. sg. / nom. pl.) is tested on one of them,
        // picked at random each round. Every case-and-number has exactly one form, so the matching stays unique.
        const groups = new Map();
        L.nounParadigm(n).forEach(c => {
          const f = show(c.form);
          if (!groups.has(f)) groups.set(f, []);
          groups.get(f).push(`${L.CASE_NAMES[c.case]} ${c.num === 'sg' ? 'singular' : 'plural'}`);
        });
        pairs = [...groups].map(([form, labels]) => ({ form, label: pick(labels) }));
      } else {
        const v = pick(L.VERBS);
        lemma = `The verb meaning “to ${v.en[0][0]}”.`;
        pairs = L.verbParadigm(v).map(x => ({ form: show(x.form), label: L.verbFormEnglish(v, x.p) }));
      }
      pairs.forEach((p, i) => { p.id = i; });
      left = L.shuffle(pairs.slice());
      right = L.shuffle(pairs.slice());
      sel = { left: null, right: null };
      done = new Set();
      misses = 0;
      timedOut = false;
      render();
      timer.start();
    }

    function tap(side, id) {
      if (done.has(id) || timedOut) return;
      sel[side] = sel[side] === id ? null : id;
      if (sel.left != null && sel.right != null) {
        const ok = sel.left === sel.right;
        score(ok);
        if (ok) {
          done.add(sel.left);
          if (done.size === pairs.length) timer.stop();
        } else {
          misses++;
          const l = sel.left, r = sel.right;
          sel = { left: null, right: null };
          render();
          $(`[data-side="left"][data-id="${l}"]`, el).classList.add('miss');
          $(`[data-side="right"][data-id="${r}"]`, el).classList.add('miss');
          return;
        }
        sel = { left: null, right: null };
      }
      render();
    }

    function render() {
      const col = (side, list, title) => h('div', { class: 'col' },
        h('div', { class: 'col-h' }, title),
        list.map(p => h('button', {
          class: 'pill' + (side === 'left' ? ' la' : '') + (done.has(p.id) ? ' done' : '') + (sel[side] === p.id ? ' sel' : ''),
          'data-side': side, 'data-id': p.id, disabled: done.has(p.id) || timedOut, onclick: () => tap(side, p.id),
        }, side === 'left' ? p.form : p.label)));
      const finished = done.size === pairs.length || timedOut;
      const missed = pairs.filter(p => !done.has(p.id));
      fill(el, 
        h('h2', null, kind === 'noun' ? 'Noun forms' : 'Verb forms'),
        h('p', { class: 'sub' }, 'Pick a form, then what it is. ', lemma),
        h('div', { class: 'controls' }, drillTimerControls(game)),
        timer.el,
        h('div', { class: 'match' },
          col('left', left, 'Latin form'),
          col('right', right, kind === 'noun' ? 'Case & number' : 'Meaning')),
        timedOut && missed.length ? h('div', { class: 'feedback bad' },
          h('div', { class: 'fb-title' }, `⏱  Time’s up — ${done.size} of ${pairs.length} matched`),
          h('ul', { class: 'notes' }, missed.map(p => h('li', null, la(p.form), ' — ', p.label)))) : null,
        h('div', { class: 'game-foot' },
          h('span', { class: 'muted' }, timedOut ? (missed.length ? '' : 'Done.')
            : finished ? (misses ? `Done — ${misses} miss${misses > 1 ? 'es' : ''}.` : 'Perfect — no misses.')
            : `${done.size} of ${pairs.length} matched`),
          h('button', { class: 'btn ' + (finished ? 'primary' : 'ghost'), onclick: setup, id: 'match-next' }, finished ? 'Next word' : 'New word')));
      if (finished) $('#match-next', el).focus();
    }

    setup();
    return { el, rerender: setup, stop: timer.stop,
      restartTimer: () => { if (!timedOut && done.size < pairs.length) timer.start(); } };
  }

  // ── Sentence builder ──

  function Builder() {
    const el = h('div');
    // Time's up: the tiles placed so far are checked; nothing placed counts as a miss.
    const timer = drillTimer('builder', () => {
      timedOut = true;
      if (placed.length) return check();
      result = { correct: false, notes: [] };
      score(false);
      render();
    });
    let s, tiles, placed, result, timedOut;

    function setup() {
      s = L.generateSentence(settings.builderLength);
      const words = s.words.map(w => show(w.toLowerCase()));
      const distractors = [];
      const wanted = Math.min(4, Math.max(2, Math.ceil(words.length / 2)));
      for (const w of L.shuffle(s.words.slice())) {
        if (distractors.length >= wanted) break;
        const a = L.analyze(w)[0];
        if (a.pos === 'conj') continue;
        // a -que word's decoy is the same word without -que (puella for puellaque), so only one -que tile shows
        const pool = a.que ? [show(w.toLowerCase()).slice(0, -3)]
          : (a.pos === 'noun' ? L.nounParadigm(L.NOUN[a.id]) : a.pos === 'prep' ? L.PREPS : L.verbParadigm(L.VERB[a.id])).map(x => show(x.form));
        const options = pool.filter(f => !words.includes(f) && !distractors.includes(f));
        if (options.length) distractors.push(pick(options));
      }
      tiles = L.shuffle(words.concat(distractors)).map((text, id) => ({ id, text }));
      placed = [];
      result = null;
      timedOut = false;
      render();
      timer.start();
    }

    function move(id) {
      if (result) return;
      const i = placed.indexOf(id);
      if (i >= 0) placed.splice(i, 1); else placed.push(id);
      render();
    }

    function check() {
      if (result) return setup();
      if (!placed.length) return;
      timer.stop();
      const answer = placed.map(id => tiles[id].text).join(' ');
      result = L.checkLatin(answer, s);
      score(result.correct);
      render();
    }

    function tray(cls, ids, empty) {
      const t = h('div', { class: 'tray ' + cls },
        ids.length ? ids.map(id => h('button', {
          class: 'tile', draggable: result ? null : 'true', 'data-id': id, onclick: () => move(id),
          ondragstart: e => { e.dataTransfer.setData('text/plain', id); e.target.classList.add('dragging'); },
          ondragend: e => e.target.classList.remove('dragging'),
        }, tiles[id].text)) : h('span', { class: 'placeholder' }, empty));
      t.addEventListener('dragover', e => { e.preventDefault(); t.classList.add('over'); });
      t.addEventListener('dragleave', () => t.classList.remove('over'));
      t.addEventListener('drop', e => {
        e.preventDefault();
        t.classList.remove('over');
        const id = +e.dataTransfer.getData('text/plain');
        if (Number.isNaN(id) || result) return;
        const inAnswer = placed.includes(id);
        if ((cls === 'answer-tray') !== inAnswer) move(id);
        else if (cls === 'answer-tray') {
          // reorder: drop onto a tile inserts before it
          const target = e.target.closest('.tile');
          placed.splice(placed.indexOf(id), 1);
          const at = target ? placed.indexOf(+target.dataset.id) : -1;
          placed.splice(at < 0 ? placed.length : at, 0, id);
          render();
        }
      });
      return t;
    }

    function render() {
      const bank = tiles.map(t => t.id).filter(id => !placed.includes(id));
      fill(el, 
        h('h2', null, 'Sentence builder'),
        h('p', { class: 'sub' }, 'Build the Latin from the tiles — some are decoys in the wrong form. Click or drag; order is up to you.'),
        h('div', { class: 'controls' },
          h('div', { class: 'range' }, h('label', { for: 'b-len' }, 'Length'),
            h('input', { type: 'range', id: 'b-len', min: 2, max: L.MAX_WORDS, value: settings.builderLength,
              onchange: e => { set('builderLength', +e.target.value); setup(); },
              oninput: e => { $('#b-len-out', el).textContent = e.target.value + ' words'; } }),
            h('output', { id: 'b-len-out' }, settings.builderLength + ' words')),
          drillTimerControls('builder')),
        h('div', { class: 'eyebrow' }, 'Translate into Latin'),
        h('div', { class: 'question' }, s.englishPrompt),
        timer.el,
        tray('answer-tray', placed, 'Click tiles to place them here'),
        tray('bank', bank, 'All tiles used'),
        result ? h('div', { class: 'feedback ' + (result.correct ? 'ok' : 'bad') },
          h('div', { class: 'fb-title' }, result.correct ? '✓  Correct' : timedOut ? '⏱  Time’s up' : '✗  Not quite'),
          h('div', { class: 'fb-row' }, h('dt', null, result.correct ? 'Model answer' : 'Answer'), h('dd', { class: 'la' }, show(s.latin))),
          !result.correct && result.notes.length ? h('ul', { class: 'notes' }, result.notes.map(n => h('li', null, show(n)))) : null) : null,
        h('div', { class: 'game-foot' },
          h('button', { class: 'btn ghost', onclick: () => { if (!result) { placed = []; render(); } }, disabled: !!result || !placed.length }, 'Clear'),
          h('span', null,
            !result ? h('button', { class: 'btn ghost', onclick: setup }, 'Skip') : null, ' ',
            h('button', { class: 'btn primary', id: 'b-check', onclick: check, disabled: !result && !placed.length }, result ? 'Next sentence' : 'Check'))));
      if (result) $('#b-check', el).focus();
    }

    setup();
    return { el, rerender: setup, onKey(e) { if (e.key === 'Enter') { e.preventDefault(); check(); } },
      stop: timer.stop, restartTimer: () => { if (!result) timer.start(); } };
  }

  // ── Paradigm fill ──

  function Paradigm() {
    const el = h('div');
    // Time's up: the table is checked as it stands; empty cells count as wrong.
    const timer = drillTimer('paradigm', () => { timedOut = true; check(); });
    let item, rows, checked, timedOut;

    function setup() {
      const kind = settings.paradigmKind === 'either' ? pick(['noun', 'verb']) : settings.paradigmKind;
      if (kind === 'noun') {
        const n = pick(L.NOUNS);
        const cells = L.nounParadigm(n);
        item = { kind, title: [la(show(nounEntry(n))), ` (${genderLabel(n)}) — ${n.en[0][0]}`], cols: ['Singular', 'Plural'] };
        rows = L.CASES.map(c => ({ label: L.CASE_NAMES[c], cells: L.NUMS.map(num => {
          const x = cells.find(y => y.case === c && y.num === num);
          return { accept: [x.form].concat(x.alts), value: '' };
        }) }));
      } else {
        const v = pick(L.VERBS);
        item = { kind, title: [la(show(verbEntry(v))), ` — to ${v.en[0][0]}`], cols: ['Singular', 'Plural'] };
        rows = ['1', '2', '3'].map(p => ({ label: p + (p === '1' ? 'st' : p === '2' ? 'nd' : 'rd') + ' person',
          cells: ['sg', 'pl'].map(num => ({ accept: [L.verbForm(v, p + num)], value: '' })) }))
          .concat([{ label: 'Infinitive', cells: [{ accept: [L.verbForm(v, 'inf')], value: '' }] }]);
      }
      checked = false;
      timedOut = false;
      render();
      timer.start();
      const first = $('input[data-r]', el);
      if (first) first.focus();
    }

    function correct(cell) {
      const v = cell.value.trim();
      if (!v) return false;
      return cell.accept.some(f => (L.hasMacron(v) ? v.normalize('NFC').toLowerCase() === f.toLowerCase() : L.norm(v) === L.norm(f)));
    }

    function check() {
      if (checked) return setup();
      timer.stop();
      $$('input[data-r]', el).forEach(inp => { rows[inp.dataset.r].cells[inp.dataset.c].value = inp.value; });
      checked = true;
      rows.forEach(r => r.cells.forEach(c => score(correct(c))));
      render();
    }

    function render() {
      const all = rows.flatMap(r => r.cells);
      const right = all.filter(correct).length;
      fill(el, 
        h('h2', null, 'Fill the table'),
        h('p', { class: 'sub' }, 'Write every form. Macrons are optional; if you type them, they must be right.'),
        h('div', { class: 'controls' },
          h('div', { class: 'seg', role: 'group', 'aria-label': 'Word type' },
            [['either', 'Either'], ['noun', 'Nouns'], ['verb', 'Verbs']].map(([k, label]) => h('button', {
              'aria-pressed': settings.paradigmKind === k, onclick: () => { set('paradigmKind', k); setup(); },
            }, label))),
          drillTimerControls('paradigm')),
        h('div', { class: 'question', style: 'font-size:22px' }, item.title),
        timer.el,
        h('table', { class: 'grid paradigm' },
          h('thead', null, h('tr', null, h('th', null, ''), item.cols.map(c => h('th', null, c)))),
          h('tbody', null, rows.map((r, ri) => h('tr', null,
            h('td', { style: 'padding-top:12px' }, r.label),
            r.cells.map((c, ci) => h('td', { colspan: r.cells.length === 1 ? 2 : null },
              h('input', {
                'data-r': ri, 'data-c': ci, value: c.value, disabled: checked, spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off',
                class: checked ? (correct(c) ? 'right' : 'wrong') : '', 'aria-label': `${r.label} ${item.cols[ci] || ''}`,
              }),
              checked && !correct(c) ? h('span', { class: 'fix' }, c.accept.map(show).join(' or ')) : null)))))),
        h('div', { class: 'game-foot' },
          h('span', { class: 'muted' }, checked ? `${timedOut ? '⏱  Time’s up — ' : ''}${right} of ${all.length} correct` : 'Tab goes down each column · Enter checks'),
          h('span', null,
            !checked ? h('button', { class: 'btn ghost', onclick: setup }, 'Skip') : null, ' ',
            h('button', { class: 'btn primary', id: 'p-check', onclick: check }, checked ? 'Next table' : 'Check'))));
      if (checked) $('#p-check', el).focus();
    }

    setup();
    return {
      el,
      focus() { const first = $('input[data-r]', el); if (first) first.focus(); },
      rerender() { if (checked) render(); },
      onKey(e) {
        if (e.key === 'Enter' && (e.target.matches('input[data-r]') || checked)) { e.preventDefault(); check(); }
        // Tab runs down the Singular column, then down Plural; a one-cell row (the infinitive) comes last.
        if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey && e.target.matches('input[data-r]')) {
          const col = inp => (rows[inp.dataset.r].cells.length === 1 ? item.cols.length : +inp.dataset.c);
          const order = $$('input[data-r]', el).sort((a, b) => col(a) - col(b) || a.dataset.r - b.dataset.r);
          const next = order[order.indexOf(e.target) + (e.shiftKey ? -1 : 1)];
          if (next) { e.preventDefault(); next.focus(); }   // past either end, Tab leaves the table as usual
        }
      },
      stop: timer.stop,
      restartTimer() { if (!checked) timer.start(); },
    };
  }

  // ─── Mass ───────────────────────────────────────────────────────────────

  const MassView = (() => {
    const M = window.Mass;
    const body = $('#mass-body');
    let current = null, lastLine = -1;

    const MODES = [
      { id: 'text', name: 'Read', start: MassText },
      { id: 'next', name: 'What comes next', start: () => TypeDrill('next') },
      { id: 'translate', name: 'Translate', start: MassTranslate },
      { id: 'cloze', name: 'Fill the gaps', start: MassCloze },
      { id: 'order', name: 'Word order', start: MassOrder },
    ];

    const selected = () => settings.massSections || M.SECTIONS.map(s => s.id);
    const wordCount = l => M.words(l.la).length;

    /** Random line from the chosen sections (server's parts only, if asked), never the same twice running. */
    function pickLine(filter) {
      let lines = M.LINES.filter(l => selected().includes(l.section) && filter(l));
      const server = lines.filter(l => l.who !== 'P');
      if (settings.massServerOnly && server.length) lines = server;
      if (!lines.length) lines = M.LINES.filter(filter);
      let line = pick(lines);
      if (lines.length > 1) while (line.index === lastLine) line = pick(lines);
      lastLine = line.index;
      return line;
    }

    const who = line => h('span', { class: 'who ' + line.who, title: M.WHO[line.who] }, M.WHO_SHORT[line.who]);
    const speaker = line => line.who === 'A' ? 'all' : 'the ' + M.WHO[line.who].toLowerCase();
    const sectionOf = line => M.SECTIONS.find(s => s.id === line.section);

    function renderChips() {
      const host = $('#mass-sections');
      host.hidden = settings.massMode === 'text';
      const sel = selected();
      const toggle = id => {
        let next = settings.massSections ? (sel.includes(id) ? sel.filter(x => x !== id) : sel.concat([id])) : [id];
        if (!next.length) return;
        if (next.length === M.SECTIONS.length) next = null;
        set('massSections', next);
        renderChips();
        start();
      };
      fill(host, 
        h('span', null, 'Drill:'),
        h('button', { 'aria-pressed': !settings.massSections, onclick: () => { set('massSections', null); renderChips(); start(); } }, 'All'),
        M.SECTIONS.map(s => h('button', { 'aria-pressed': !!settings.massSections && sel.includes(s.id), onclick: () => toggle(s.id), title: s.subtitle }, s.title)),
        h('span', { style: 'width:10px' }),
        h('button', { 'aria-pressed': settings.massServerOnly, title: 'Only test the lines the server says',
          onclick: () => { set('massServerOnly', !settings.massServerOnly); renderChips(); start(); } }, 'Server’s parts only'));
    }

    function select(id) {
      set('massMode', id);
      $$('#mass-tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.mode === id));
      setActivity('mass:' + id);
      renderChips();
      start();
    }
    function start() {
      if (current && current.stop) current.stop();
      const mode = MODES.find(m => m.id === settings.massMode) || MODES[0];
      current = mode.start();
      fill(body, current.el);
      if (current.focus) current.focus();
    }

    function init() {
      $('#mass-tabs').append(...MODES.map(m => h('button', {
        role: 'tab', 'data-mode': m.id, 'aria-selected': m.id === settings.massMode, onclick: () => select(m.id),
      }, m.name)));
      renderChips();
      start();
    }

    // ── shared pieces ──

    function diffView(d) {
      return h('dl', null,
        h('div', { class: 'fb-row' }, h('dt', null, 'You wrote'),
          h('dd', { class: 'diff' }, d.got.length ? d.got.map((w, i) => [i ? ' ' : '', h('span', { class: w.ok ? '' : 'extra' }, w.raw)]) : h('span', { class: 'muted' }, '(nothing)'))),
        h('div', { class: 'fb-row' }, h('dt', null, 'Text'),
          h('dd', { class: 'diff' }, d.exp.map((w, i) => [i ? ' ' : '', h('span', { class: w.ok ? '' : 'miss' }, w.raw)]))));
    }

    const massTimer = onExpire => Countdown({ view: 'mass', secondsKey: 'massTime', onExpire });
    const massTimerControls = () => timerControls({ secondsKey: 'massTime',
      onChange: () => { if (current && current.restartTimer) current.restartTimer(); } });

    /** Write-the-line drill. kind 'next': continue from the previous line. kind 'en-la': translate the English. */
    function TypeDrill(kind) {
      const el = h('div');
      const timer = massTimer(() => check(false, true));
      let target, result, hint, typed = '';

      function setup() {
        target = pickLine(l => wordCount(l) > 1 && (kind !== 'next' || l.index > 0));
        result = null;
        hint = false;
        typed = '';
        render();
        timer.start();
        focus();
      }
      function focus() { const t = $('textarea', el); if (t && !t.disabled) t.focus(); }

      function context() {
        const rows = M.contextFor(target.index).map(i => M.LINES[i]);
        const cue = (rows[0] || target).cue;
        return h('div', { class: 'context' }, cue ? h('div', { class: 'cue' }, cue) : null,
          rows.map((l, i) => h('div', { class: 'row' + (i < rows.length - 1 ? ' dim' : '') }, who(l), la(l.la))));
      }

      /** timedOut: the countdown ran out — whatever is typed so far is checked. */
      function check(revealed, timedOut) {
        if (result) return setup();
        typed = $('textarea', el).value;
        if (!revealed && !timedOut && !typed.trim()) return focus();
        timer.stop();
        result = { d: M.diff(target.la, revealed ? '' : typed), revealed, timedOut };
        score(!revealed && result.d.correct);
        render();
        $('#m-check', el).focus();
      }

      function render() {
        const sec = sectionOf(target);
        const ok = result && !result.revealed && result.d.correct;
        fill(el, 
          kind === 'next' ? h('div', { class: 'controls' }, massTimerControls()) : null,
          kind === 'next'
            ? [h('h2', null, 'What comes next?'), h('p', { class: 'sub' }, 'Write the following line in Latin. Accents, æ/ae and j/i don’t matter; every word does.')]
            : [h('h2', null, 'Translate into Latin'), h('p', { class: 'sub' }, 'Write the Latin of this line from memory. Accents, æ/ae and j/i don’t matter.')],
          h('div', { class: 'eyebrow' }, sec.title),
          kind === 'next' ? context() : h('div', { class: 'question', style: 'font-size:22px' }, target.en),
          h('div', { class: 'target-row' }, who(target), kind === 'next'
            ? (target.cont ? (target.who === 'A' ? 'All continue…' : `The ${M.WHO[target.who].toLowerCase()} continues…`)
              : `Then ${speaker(target)} ${target.who === 'A' ? 'say' : 'says'}…`)
            : `Said by ${speaker(target)}`),
          timer.el,
          h('textarea', {
            class: 'mass-input', rows: 2, spellcheck: 'false', autocapitalize: 'off', disabled: !!result, placeholder: 'Type the Latin…',
            'aria-label': 'Your Latin',
            oninput: e => { typed = e.target.value; },
            onkeydown: e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); check(false); } },
          }, typed),
          hint && !result ? h('div', { class: 'initials', title: 'First letter of each word' }, M.initials(target.la)) : null,
          result ? h('div', { class: 'feedback ' + (result.revealed ? '' : ok ? 'ok' : 'bad') },
            h('div', { class: 'fb-title' }, result.revealed ? 'Answer' : ok ? '✓  Word-perfect'
              : `${result.timedOut ? '⏱  Time’s up — ' : '✗  '}${result.d.matched} of ${result.d.total} words in place`),
            result.revealed ? h('div', { class: 'diff' }, target.la) : diffView(result.d),
            kind === 'next' ? h('p', { class: 'muted', style: 'margin:10px 0 0;font-size:14px' }, target.en) : null) : null,
          h('div', { class: 'game-foot' },
            h('span', null, !result ? [
              h('button', { class: 'btn ghost', onclick: () => { hint = true; render(); focus(); }, disabled: hint }, 'First letters'),
              h('button', { class: 'btn ghost', onclick: () => check(true) }, 'Show'),
            ] : null),
            h('span', null,
              !result ? h('button', { class: 'btn ghost', onclick: setup }, 'Skip') : null, ' ',
              h('button', { class: 'btn primary', id: 'm-check', onclick: () => check(false) }, result ? 'Next' : 'Check'))));
      }

      setup();
      return { el, focus, stop: timer.stop, restartTimer: () => { if (!result) timer.start(); } };
    }

    function MassText() {
      const el = h('div', { class: 'mass-text' });
      function render() {
        const hide = settings.massCover;
        const covered = l => hide === 'all' || hide === l.who || (hide === 'S' && l.who === 'A');
        el.classList.toggle('no-en', !settings.massShowEn);
        fill(el, 
          h('div', { class: 'controls' },
            h('label', { class: 'chip-toggle' },
              h('input', { type: 'checkbox', class: 'switch', checked: settings.massShowEn, onchange: e => { set('massShowEn', e.target.checked); render(); } }),
              ' English'),
            h('div', { class: 'range' }, 'Cover',
              h('div', { class: 'seg', role: 'group', 'aria-label': 'Cover the Latin of' },
                [['none', 'Nothing'], ['P', 'Priest'], ['S', 'Server'], ['all', 'All Latin']].map(([k, label]) => h('button', {
                  'aria-pressed': hide === k, onclick: () => { set('massCover', k); render(); },
                }, label))))),
          hide !== 'none' ? h('p', { class: 'muted', style: 'font-size:13.5px;margin:-4px 0 0' }, 'Recite the covered lines, then click one to check it.') : null,
          M.SECTIONS.map(sec => h('div', { class: 'sec' },
            h('h3', null, sec.title),
            h('div', { class: 'sec-sub' }, sec.subtitle, sec.note ? ' — ' + sec.note : ''),
            sec.lines.map(l => h('div', { class: 'mline' + (l.cont ? ' cont' : '') },
              l.cue ? h('div', { class: 'cue' }, l.cue) : null,
              l.cont ? h('span') : who(l),
              h('div', { class: 'la' + (covered(l) ? ' veil' : ''), title: covered(l) ? 'Click to reveal' : null,
                onclick: e => e.currentTarget.classList.remove('veil') }, l.la),
              h('div', { class: 'en' }, l.en))))));
      }
      render();
      return { el };
    }

    function MassTranslate() {
      if (settings.massDir === 'en-la') return wrapDir(TypeDrill('en-la'));
      const el = h('div');
      const timer = massTimer(() => choose(-1));
      let target, options, chosen;   // chosen: option index, -1 when time ran out

      function setup() {
        target = pickLine(l => wordCount(l) > 1);
        const distinct = list => uniq(list.map(l => l.en)).filter(en => en !== target.en);
        const wrong = sample(distinct(M.LINES.filter(l => l.section === target.section)), 3);
        wrong.push(...sample(distinct(M.LINES).filter(en => !wrong.includes(en)), 3 - wrong.length));
        options = L.shuffle([target.en, ...wrong]);
        chosen = null;
        render();
        timer.start();
      }
      function choose(i) {
        if (chosen != null) return;
        chosen = i;
        timer.stop();
        score(i >= 0 && options[i] === target.en);
        render();
        $('#m-next', el).focus();
      }
      function render() {
        fill(el, 
          h('h2', null, 'What does it mean?'),
          h('p', { class: 'sub' }, 'Pick the translation. Keys 1–4.'),
          h('div', { class: 'eyebrow' }, sectionOf(target).title),
          h('div', { class: 'context' }, h('div', { class: 'row' }, who(target), la(target.la))),
          timer.el,
          h('div', { class: 'options' }, options.map((text, i) => h('button', {
            class: 'option en-opt' + (chosen != null && text === target.en ? ' right' : '') + (chosen === i && text !== target.en ? ' wrong' : ''),
            disabled: chosen != null, onclick: () => choose(i),
          }, h('span', { class: 'n' }, i + 1), h('span', null, text)))),
          h('div', { class: 'game-foot' }, h('span', { class: 'muted' }, chosen === -1 ? '⏱  Time’s up' : ''),
            h('button', { class: 'btn ' + (chosen != null ? 'primary' : 'ghost'), id: 'm-next', onclick: setup }, chosen != null ? 'Next' : 'Skip')));
      }
      setup();
      return wrapDir({
        el,
        onKey(e) { if (chosen == null && /^[1-4]$/.test(e.key)) choose(+e.key - 1); },
        stop: timer.stop,
        restartTimer: () => { if (chosen == null) timer.start(); },
      });
    }

    /** Adds the direction switch above a translate drill. */
    function wrapDir(drill) {
      const el = h('div', null,
        h('div', { class: 'controls' },
          h('div', { class: 'seg', role: 'group', 'aria-label': 'Direction' },
            [['la-en', 'Latin → English'], ['en-la', 'English → Latin']].map(([k, label]) => h('button', {
              'aria-pressed': settings.massDir === k, onclick: () => { set('massDir', k); start(); },
            }, label))),
          massTimerControls()),
        drill.el);
      return { ...drill, el };
    }

    function MassCloze() {
      const el = h('div');
      let target, toks, gaps, checked;

      function setup() {
        target = pickLine(l => M.words(l.la).some(w => w.key.length >= 4));
        toks = target.la.split(/\s+/).map(raw => ({ raw, key: M.normWord(raw), typed: '' }));
        const candidates = toks.map((t, i) => i).filter(i => toks[i].key.length >= 4);
        const n = Math.max(1, Math.min(3, Math.round(M.words(target.la).length / 6)));
        gaps = new Set(sample(candidates, n));
        checked = false;
        render();
        focus();
      }
      function focus() { const i = $('.cloze input', el); if (i) i.focus(); }
      const isRight = i => M.normWord(toks[i].typed) === toks[i].key;

      function check() {
        if (checked) return setup();
        $$('.cloze input', el).forEach(inp => { toks[inp.dataset.i].typed = inp.value; });
        checked = true;
        gaps.forEach(i => score(isRight(i)));
        render();
        $('#m-check', el).focus();
      }

      function render() {
        const right = [...gaps].filter(isRight).length;
        fill(el, 
          h('h2', null, 'Fill the gaps'),
          h('p', { class: 'sub' }, 'Type the missing words. Enter checks.'),
          h('div', { class: 'eyebrow' }, sectionOf(target).title),
          h('div', { class: 'cloze' }, who(target), ' ', toks.map((t, i) => {
            if (!gaps.has(i)) return [t.raw, ' '];
            const word = M.bare(t.raw);
            const at = t.raw.indexOf(word);
            const ok = checked && isRight(i);
            return [t.raw.slice(0, at), h('input', {
              'data-i': i, size: Math.max(4, word.length + 1), value: checked ? t.typed : null, disabled: checked,
              class: checked ? (ok ? 'right' : 'wrong') : '', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off',
              'aria-label': 'Missing word',
              onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); check(); } },
            }), checked && !ok ? h('span', { class: 'fix' }, word) : null, t.raw.slice(at + word.length), ' '];
          })),
          h('p', { class: 'muted', style: 'font-size:14px;margin:12px 0 0' }, checked ? target.en : ''),
          h('div', { class: 'game-foot' },
            h('span', { class: 'muted' }, checked ? `${right} of ${gaps.size} right` : `${gaps.size} gap${gaps.size > 1 ? 's' : ''}`),
            h('span', null,
              !checked ? h('button', { class: 'btn ghost', onclick: setup }, 'Skip') : null, ' ',
              h('button', { class: 'btn primary', id: 'm-check', onclick: check }, checked ? 'Next' : 'Check'))));
      }
      setup();
      return { el, focus };
    }

    function MassOrder() {
      const el = h('div');
      // Time's up: the words placed so far are checked (an incomplete line is wrong).
      const timer = massTimer(() => { timedOut = true; check(); });
      let target, tiles, placed, result, timedOut;

      function setup() {
        target = pickLine(l => { const n = wordCount(l); return n >= 3 && n <= 24; });
        tiles = L.shuffle(M.words(target.la).map((w, id) => ({ id, text: M.bare(w.raw), key: w.key })));
        placed = [];
        result = null;
        timedOut = false;
        render();
        timer.start();
      }
      function move(id) {
        if (result) return;
        const i = placed.indexOf(id);
        if (i >= 0) placed.splice(i, 1); else placed.push(id);
        if (placed.length === tiles.length) check();
        else render();
      }
      function check() {
        if (result) return setup();
        timer.stop();
        const keys = placed.map(id => tiles.find(t => t.id === id).key).join(' ');
        result = { correct: keys === M.words(target.la).map(w => w.key).join(' ') };
        score(result.correct);
        render();
        $('#m-check', el).focus();
      }
      function render() {
        const tile = t => h('button', { class: 'tile', onclick: () => move(t.id), disabled: !!result }, t.text);
        fill(el, 
          h('div', { class: 'controls' }, massTimerControls()),
          h('h2', null, 'Word order'),
          h('p', { class: 'sub' }, 'Put the words of the line back in order. It checks itself when the last word is placed.'),
          h('div', { class: 'eyebrow' }, sectionOf(target).title),
          h('div', { class: 'target-row' }, who(target), h('span', null, target.en)),
          timer.el,
          h('div', { class: 'tray answer-tray' }, placed.length ? placed.map(id => tile(tiles.find(t => t.id === id))) : h('span', { class: 'placeholder' }, 'Click the words in order')),
          h('div', { class: 'tray' }, tiles.filter(t => !placed.includes(t.id)).map(tile)),
          result ? h('div', { class: 'feedback ' + (result.correct ? 'ok' : 'bad') },
            h('div', { class: 'fb-title' }, result.correct ? '✓  In order' : timedOut ? '⏱  Time’s up' : '✗  Not quite'),
            h('div', { class: 'diff' }, target.la)) : null,
          h('div', { class: 'game-foot' },
            h('button', { class: 'btn ghost', onclick: () => { placed = []; render(); }, disabled: !!result || !placed.length }, 'Clear'),
            h('span', null,
              !result ? h('button', { class: 'btn ghost', onclick: setup }, 'Skip') : null, ' ',
              result ? h('button', { class: 'btn primary', id: 'm-check', onclick: check }, 'Next') : null)));
      }
      setup();
      return { el, stop: timer.stop, restartTimer: () => { if (!result) timer.start(); } };
    }

    function onKey(e) { if (current && current.onKey) current.onKey(e); }

    return { init, onKey, activityKey: () => 'mass:' + settings.massMode };
  })();

  // ─── Views & keyboard ───────────────────────────────────────────────────

  function showView(view) {
    set('view', view);
    $$('.modes button').forEach(b => b.setAttribute('aria-selected', b.dataset.view === view));
    $('#view-translate').hidden = view !== 'translate';
    $('#view-drills').hidden = view !== 'drills';
    $('#view-mass').hidden = view !== 'mass';
    setActivity(view === 'translate' ? Translate.activityKey() : view === 'drills' ? Drills.activityKey() : MassView.activityKey());
    if (view === 'translate' && !$('#t-input').disabled) $('#t-input').focus();
  }

  function onKey(e) {
    const typing = e.target.matches('input:not([type=checkbox]):not([type=range]), textarea, select');
    if (e.key === 'Escape') {
      if (!$('#menu').hidden) { $('#menu').hidden = true; return; }
      Drawers.open('left', null);
      Drawers.open('right', null);
      return;
    }
    if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === '[') { Drawers.toggle('left', 'vocab'); return; }
      if (e.key === ']') { Drawers.toggle('right', Drawers.state.right || Drawers.lastRight()); return; }
    }
    if (settings.view === 'drills' && !$('#view-drills').hidden) {
      if (typing && !e.target.matches('input[data-r]')) return;
      Drills.onKey(e);
    }
    if (settings.view === 'mass' && !typing) MassView.onKey(e);
  }

  function init() {
    applyTheme();
    initMenu();
    Drawers.init();
    Translate.init();
    Drills.init();
    MassView.init();
    $$('.modes button').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
    document.addEventListener('keydown', onKey);
    showView(settings.view);
  }

  init();
})();
