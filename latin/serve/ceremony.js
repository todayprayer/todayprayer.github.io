/*
 * Low Mass (1962 Missal) as served at St. Vitus — the choreography behind the altar-server game.
 *
 * Authorities, in order of precedence:
 *   SV  = "Notes and Procedures for the Low Mass at St. Vitus" (draft, MJS, 25 Dec 2025):
 *         Appendix B (two servers), C (one server), D.
 *   OC  = J. B. O'Connell, The Celebration of Mass (1962 rubrics), ch. XXI and pp. 569–575.
 *   R   = Ritus servandus in celebratione Missae (Missale Romanum 1962).
 * Where SV is silent or self-contradictory, OC fills in (noted in `cite`).
 *
 * World: metres; x+ = Epistle side (right, seen from the nave), z+ = towards the nave, y up.
 * Heading θ faces (sin θ, cos θ) in x/z: 0 = towards the people, π = towards the altar.
 * Decreasing θ is a turn to the right (clockwise seen from above).
 *
 * A beat is a moment of the Mass. Each role (P priest, A1/A2 servers, C1–C4 communicants) has a list of
 * commands run in order; roles run side by side and the beat ends when all have finished.
 * In one-server Masses the server is A1. Command grammar: see COMMANDS below.
 */
(function (root) {
  'use strict';

  const PI = Math.PI;
  const A = PI, N = 0, E = PI / 2, G = -PI / 2;
  const toward = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

  // ─── The chapel ────────────────────────────────────────────────────────────

  const LAYOUT = {
    wallBack: -2.3, wallSide: 5.2, rail: 5.8, gateHalf: 1.0,    // the rail's sides run 2.6 m back to the wall: room for four to kneel
    step: 0.15,
    steps: [                                      // [xHalf, zFront, height]: lowest, second, top step (footpace)
      [2.65, 1.15, 0.15], [2.3, 0.8, 0.30], [1.95, 0.45, 0.45],
    ],
    mensa: { x: 1.35, z0: -1.45, z1: -0.6, top: 1.45 },
    gradine: { z0: -1.75, z1: -1.45, top: 1.62 },
    credence: { x0: 2.95, x1: 3.65, z0: -2.3, z1: -1.88, top: 0.92 },   // small, against the back wall, just right of the altar
    sedilia: { x: 2.95, z: 2.25 },        // directly in front of the Epistle-side column
    benches: { E: [5.03, -1.62], G: [-5.03, -1.62] },   // choir benches, one end touching the back wall
    columns: [[2.95, 1.35], [-2.95, 1.35]],     // the two big columns, at the corners of the altar steps
    lectern: [-3.4, 4.3],                       // well forward of the steps
    camera: { pos: [0, 3.0, 7.4], look: [0, 0.75, -0.2] },
    communicants: [2.0, 1.45, -1.45, -2.0],        // kneeling at the rail, served Epistle → Gospel
  };

  /** Floor height under (x, z): the three altar steps, else the sanctuary floor. */
  function heightAt(x, z) {
    let h = 0;
    for (const [xh, zf, y] of LAYOUT.steps) if (Math.abs(x) <= xh && z <= zf && z >= LAYOUT.wallBack) h = y;
    return h;
  }

  const xE = [2.25, 0.97], xG = [-2.25, 0.97];      // extended formation: on the first step, near behind the columns
  const commX = LAYOUT.communicants;

  /** Named places to stand: [x, z, heading]. Priest's places start with "P.". */
  const SPOTS = {
    // the sacristy, facing the cross over the vesting table on its far wall
    'sacP': [-10.8, 7.0, N], 'sacA1': [-11.4, 6.35, N], 'sacA2': [-10.2, 6.35, N],
    // the threshold of the door from the sacristy hall into the church, with the font beside it
    'thrA2': [-9.4, 3.95, E], 'thrA1': [-10.0, 3.65, E], 'P.thr': [-10.45, 4.25, E],
    // the way between (w_ marks a point on the way that the player is walked through; it has no heading)
    'w_sac': [-10.8, 5.5], 'w_hall': [-10.8, 3.95], 'w_thr': [-9.4, 3.95],
    'w_cE': [1.0, 2.0], 'w_cG': [-1.0, 2.0],      // the lower lane when the servers change sides: they pass, not meet
    'w_low': [2.05, 0.75], 'w_stG': [-1.0, 0.45], 'w_stE': [1.0, 0.45],     // up at the corners: nobody crosses the top step behind the priest
    'w_door': [-8.2, 3.95], 'w_rail': [-6.45, 6.95], 'w_gos': [-0.32, 6.95], 'w_gosIn': [-0.32, 5.0],
    'w_epi': [0.32, 6.95], 'w_epiIn': [0.32, 5.0], 'w_mid': [0, 7.0], 'w_midIn': [0, 5.1],

    // close formation: beside the priest at the foot of the altar
    'P.foot': [0, 1.6, A], 'P.step': [0, 1.0, A], 'P.kneel': [0, 1.0, A],
    'cfR': [0.72, 1.75, A], 'cfL': [-0.72, 1.75, A], 'cfL2': [-0.95, 1.95, toward(-0.95, 1.95, 0, 1)],

    // extended formation: the servers' places near the columns
    'xE': [xE[0], xE[1], toward(xE[0], xE[1], 0, -0.6)], 'xG': [xG[0], xG[1], toward(xG[0], xG[1], 0, -0.6)],

    // crossing the middle at the foot of the altar
    'mid': [0, 1.45, A], 'midR': [0.38, 1.45, A], 'midL': [-0.38, 1.45, A],
    'ftE': [1.55, 1.45, A], 'ftG': [-1.55, 1.45, A],
    'cornerE': [3.55, 1.6, A], 'cornerG': [-3.55, 1.6, A],
    'floorG': [-2.9, -0.3, E],

    // on the altar steps
    'topE': [1.0, -0.12, A], 'topG': [-1.0, -0.12, A],
    'st2G': [-1.15, 0.62, toward(-1.15, 0.62, -0.95, -0.22)],
    'veilTop': [0.6, -0.08, A], 'veilG': [-0.62, -0.08, A],
    'gradE': [1.62, -1.12, toward(1.62, -1.12, 1.1, -1.6)],
    'plateTop': [0.6, -0.08, A],
    'elR': [0.5, 0.28, A], 'elL': [-0.5, 0.28, A],
    'comR': [0.32, 0.22, A], 'comL': [-0.32, 0.22, A], 'comS': [-0.1, 0.22, A],
    'abl1': [0.82, -0.2, G],

    // cruets and Lavabo: below, then up on the second step at the Epistle corner
    'cruWait1': [1.85, 1.5, A], 'cruWait2': [1.25, 1.5, A], 'cruWaitS': [1.55, 1.5, A],
    'cruA1': [1.8, 0.64, toward(1.8, 0.64, 1.45, 0.05)], 'cruA2': [1.22, 0.64, toward(1.22, 0.64, 1.45, 0.05)],
    'cruS': [1.5, 0.64, toward(1.5, 0.64, 1.45, 0.05)],
    'cruA3': [2.28, 0.42, toward(2.28, 0.42, 1.45, 0.05)],     // A2 at the ablutions, coming from the credence: outside A1, so he need not pass him

    // side furniture
    'cred': [3.3, -1.4, A], 'cred1': [3.08, -1.4, A], 'cred2': [3.55, -1.4, A],
    'sed': [2.4, 2.65, E],
    'stoolE': [4.62, -1.62, G], 'stoolG': [-4.62, -1.62, E],
    'gateE': [0.6, 5.4, N], 'gateG': [-0.6, 5.4, N], 'midRail': [0, 5.4, A],
    'clothE': [2.3, 5.42, N], 'clothG': [-2.3, 5.42, N],

    // the priest at the altar
    'P.mid': [0, -0.22, A], 'P.epi': [0.95, -0.22, A], 'P.gos': [-0.95, -0.22, A],
    'P.gosBook': [-0.95, -0.22, -2.62], 'P.cruet': [1.45, 0.05, 0.25],
    'P.ablM': [0.2, -0.22, E], 'P.comm': [0, -0.15, N],
    'P.lect': [LAYOUT.lectern[0], LAYOUT.lectern[1] - 0.42, N], 'P.lectVia': [-1.6, 2.2, G],
  };
  commX.forEach((x, i) => {
    SPOTS['P.r' + (i + 1)] = [x, 5.42, N];
    SPOTS['pr' + (i + 1)] = [x - 0.45, 5.38, N];     // paten: at the priest's right (SV p. 22)
    SPOTS['cr' + (i + 1)] = [x + 0.6, 5.3, N];      // Sanctus candle: at his left, further off
    SPOTS['C' + (i + 1) + '.out'] = [x, 7.95, A];
    SPOTS['C' + (i + 1) + '.rail'] = [x, 6.15, A];
  });

  /** Where things rest: [x, y, z, rotY]. */
  const PLACES = {
    // laid out as in the photograph of the table: candle and basin, lighter, bells over the cruets, paten cover
    'cred.sc': [3.04, 0.92, -2.2, 0], 'cred.bowl': [3.12, 0.92, -2.02, 0], 'cred.lighter': [3.24, 0.92, -2.2, 0],
    'cred.bells': [3.33, 0.92, -2.2, 0], 'cred.tray': [3.33, 0.92, -2.0, 0], 'cred.paten': [3.54, 0.92, -2.07, 0],
    'cred.towel': [3.1, 0.92, -1.96, 0],
    'altar.E': [0.95, 1.45, -0.95, 0], 'altar.G': [-0.95, 1.45, -0.95, -0.52],
    'altar.C': [0, 1.45, -0.95, 0], 'altar.veil': [0.72, 1.45, -1.25, 0],
    'altar.veilG': [-0.42, 1.45, -1.0, 0], 'altar.burseG': [-0.72, 1.45, -1.1, 0],
    'altar.paten': [0.38, 1.45, -0.78, 0], 'gradine.sc': [1.1, 1.62, -1.6, 0],
    'sed.chair': [3.0, 0.5, 2.25, -PI / 2], 'tab': [0, 1.55, -1.55, 0],
    'font': [-9.15, 1.05, 4.63, 0], 'sbell': [-9.7, 1.75, 4.62, 0],      // both on the right of the door as you face it, clear of its swing
  };

  /** Each prop's starting place, as set up before Mass (SV pp. 1–3). */
  const PROPS = {
    missal: 'altar.E', chalice: 'P', biretta: 'P', ciborium: 'tab',
    sc: 'cred.sc', lighter: 'cred.lighter', bells: 'cred.bells', tray: 'cred.tray',
    wine: 'tray', water: 'tray', bowl: 'cred.bowl', pitcher: 'bowl', towel: 'bowl',
    paten: 'cred.paten', veil: 'chalice', burse: 'chalice',
  };

  // ─── What the priest says that is not in mass.js ──────────────────────────

  const T = {
    procedamus: { who: 'P', la: 'Procedámus in pace.', en: 'Let us proceed in peace.' },
    inNomine: { who: 'S', la: 'In nómine Christi. Amen.', en: 'In the name of Christ. Amen.' },
    adjSac: { who: 'P', la: 'Adjutórium nostrum in nómine Dómini.', en: 'Our help is in the name of the Lord.' },
    quiFecit: { who: 'S', la: 'Qui fecit cælum et terram.', en: 'Who made heaven and earth.' },
    prosit: { who: 'P', la: 'Prosit.', en: 'May it be beneficial.' },
    proOmnibus: { who: 'S', la: 'Pro ómnibus et síngulis. Jube, domne, benedícere.', en: 'For each and every one. Pray, father, a blessing.' },
    setup: { who: 'P', la: '(spreads the corporal, sets the chalice, opens the Missal)', en: '', silent: true, dur: 2.2 },
    introit: { who: 'P', la: 'Introítus: Dicit Dóminus: Ego cógito cogitatiónes pacis…', en: 'The Introit of the day (23rd Sunday after Pentecost) — no Amen at its end.', dur: 3 },
    gloria1: { who: 'P', la: 'Glória in excélsis Deo. Et in terra pax homínibus bonæ voluntátis…', en: 'Glory to God in the highest…', dur: 2.6 },
    gloria2: { who: 'P', la: '…Cum Sancto Spíritu ✠ in glória Dei Patris. Amen.', en: '…with the Holy Ghost ✠ in the glory of God the Father. Amen.', dur: 2.2 },
    collect: { who: 'P', la: 'Absólve, quǽsumus, Dómine, tuórum delícta populórum…', en: 'The Collect of the day.', dur: 2.6 },
    epistle: { who: 'P', la: 'Léctio Epístolæ beáti Pauli Apóstoli ad Philippénses. Fratres: Imitatóres mei estóte…', en: 'The Epistle (Phil 3:17–4:3). It ends when he lays his left hand on the altar.', dur: 3.2 },
    gradual: { who: 'P', la: 'Graduále: Liberásti nos, Dómine… Allelúja, allelúja.', en: 'The Gradual and Alleluia.', dur: 2.6 },
    munda: { who: 'P', la: 'Munda cor meum ac lábia mea, omnípotens Deus… Jube, Dómine, benedícere…', en: 'Cleanse my heart and my lips… (said bowed, silently)', silent: true, dur: 3.2 },
    gospel1: { who: 'P', la: 'In illo témpore: Loquénte Jesu ad turbas, ecce princeps unus accéssit…', en: 'At that time: As Jesus was speaking to the multitudes… (Matt 9:18–26)', dur: 2.6 },
    gospel2: { who: 'P', la: '…Et éxiit fama hæc in univérsam terram illam.', en: '…And the fame hereof went abroad into all that country.', dur: 2.4 },
    evangelica: { who: 'P', la: 'Per evangélica dicta deleántur nostra delícta.', en: 'By the words of the Gospel may our sins be blotted out.', silent: true, dur: 1.4 },
    maniple: { who: 'P', la: '(lays his maniple over the Missal — he will preach)', en: '', silent: true, dur: 1.4 },
    sermon: { who: 'P', la: '(the sermon)', en: '', silent: true, dur: 2.0 },
    credo1: { who: 'P', la: 'Credo in unum Deum, Patrem omnipoténtem…', en: 'I believe in one God… (servers keep kneeling)', dur: 2.6 },
    credo2: { who: 'P', la: 'Et incarnátus est de Spíritu Sancto ex María Vírgine: Et homo factus est.', en: 'And was incarnate by the Holy Ghost of the Virgin Mary: and was made man.', dur: 2.6 },
    credo3: { who: 'P', la: '…Et vitam ventúri sǽculi. Amen.', en: '…and the life of the world to come. Amen.', dur: 1.8 },
    offAnt: { who: 'P', la: 'De profúndis clamávi ad te, Dómine…', en: 'The Offertory verse.', dur: 1.8 },
    suscipe: { who: 'P', la: 'Súscipe, sancte Pater, omnípotens ætérne Deus, hanc immaculátam hóstiam…', en: 'Accept, O holy Father… (offering the host)', silent: true, dur: 2.2 },
    deusQui: { who: 'P', la: 'Deus, ✠ qui humánæ substántiæ dignitátem…', en: 'O God, who wonderfully created… (pouring the wine and water)', silent: true, dur: 1.6 },
    offerimus: { who: 'P', la: 'Offérimus tibi, Dómine, cálicem salutáris… In spíritu humilitátis… Veni, sanctificátor…', en: 'We offer Thee, O Lord, the chalice of salvation…', silent: true, dur: 2.6 },
    lavabo: { who: 'P', la: 'Lavábo inter innocéntes manus meas…', en: 'I will wash my hands among the innocent…', silent: true, dur: 2.2 },
    suscipeTrin: { who: 'P', la: 'Súscipe, sancta Trínitas, hanc oblatiónem…', en: 'Receive, O holy Trinity, this oblation…', silent: true, dur: 2.0 },
    secret: { who: 'P', la: '(the Secret, said silently)', en: '', silent: true, dur: 1.8 },
    preface: { who: 'P', la: 'Vere dignum et justum est… cum Angelis et Archángelis… sine fine dicéntes:', en: 'It is truly meet and just… (the Preface)', dur: 3.0 },
    sanctus1: { who: 'P', la: 'Sanctus,', en: 'Holy,', dur: 0.8 },
    sanctus2: { who: 'P', la: 'Sanctus,', en: 'Holy,', dur: 0.8 },
    sanctus3: { who: 'P', la: 'Sanctus Dóminus Deus Sábaoth. Pleni sunt cæli et terra glória tua. Hosánna in excélsis.', en: 'Holy Lord God of Hosts…', dur: 2.0 },
    benedictus: { who: 'P', la: 'Benedíctus ✠ qui venit in nómine Dómini. Hosánna in excélsis.', en: 'Blessed ✠ is He who cometh in the name of the Lord.', dur: 1.8 },
    teIgitur: { who: 'P', la: 'Te ígitur, clementíssime Pater… Meménto, Dómine… Communicántes…', en: 'The Canon begins (silently).', silent: true, dur: 3.0 },
    hanc: { who: 'P', la: 'Hanc ígitur oblatiónem servitútis nostræ…', en: 'We therefore beseech Thee… (hands spread over the oblation)', silent: true, dur: 2.0 },
    quam: { who: 'P', la: 'Quam oblatiónem tu, Deus, in ómnibus, quǽsumus, bene✠díctam… fíeri dignéris…', en: 'Which oblation do Thou… (he takes his hands from the altar)', silent: true, dur: 2.0 },
    quiPridie: { who: 'P', la: 'Qui prídie quam paterétur… HOC EST ENIM CORPUS MEUM.', en: 'Who the day before He suffered… FOR THIS IS MY BODY.', silent: true, dur: 2.4 },
    simili: { who: 'P', la: 'Símili modo… HIC EST ENIM CALIX SÁNGUINIS MEI…', en: 'In like manner… FOR THIS IS THE CHALICE OF MY BLOOD…', silent: true, dur: 2.6 },
    unde: { who: 'P', la: 'Unde et mémores… Supra quæ… Súpplices te rogámus… Meménto étiam…', en: 'The Canon continues (silently).', silent: true, dur: 2.6 },
    nobisQuoque: { who: 'P', la: 'Nobis quoque peccatóribus…', en: 'To us sinners also… (he strikes his breast)', dur: 1.6 },
    perIpsum: { who: 'P', la: 'Per ipsum, et cum ipso, et in ipso… omnis honor et glória.', en: 'Through Him, and with Him, and in Him… (the minor elevation)', silent: true, dur: 2.2 },
    libera: { who: 'P', la: 'Líbera nos, quǽsumus, Dómine, ab ómnibus malis…', en: 'Deliver us, we beseech Thee, O Lord… (he breaks the Host)', silent: true, dur: 2.4 },
    commixtio: { who: 'P', la: 'Hæc commíxtio et consecrátio Córporis et Sánguinis…', en: 'May this mingling…', silent: true, dur: 1.4 },
    agnus1: { who: 'P', la: 'Agnus Dei, qui tollis peccáta mundi: miserére nobis.', en: 'Lamb of God, who takest away the sins of the world: have mercy on us.', dur: 1.8 },
    agnus2: { who: 'P', la: 'Agnus Dei, qui tollis peccáta mundi: miserére nobis.', en: 'Lamb of God…: have mercy on us.', dur: 1.8 },
    agnus3: { who: 'P', la: 'Agnus Dei, qui tollis peccáta mundi: dona nobis pacem.', en: 'Lamb of God…: grant us peace.', dur: 1.8 },
    preComm: { who: 'P', la: 'Dómine Jesu Christe, qui dixísti… Dómine Jesu Christe, Fili Dei vivi… Percéptio Córporis tui…', en: 'The three prayers before Communion (silently).', silent: true, dur: 2.6 },
    panem: { who: 'P', la: 'Panem cæléstem accípiam, et nomen Dómini invocábo.', en: 'I will take the Bread of heaven…', silent: true, dur: 1.4 },
    dnsdP: { who: 'P', la: 'Dómine, non sum dignus, ut intres sub tectum meum: sed tantum dic verbo, et sanábitur ánima mea.', en: 'Lord, I am not worthy… (the priest, striking his breast)', dur: 1.7 },
    corpusMeum: { who: 'P', la: 'Corpus Dómini nostri Jesu Christi custódiat ánimam meam in vitam ætérnam. Amen.', en: 'The priest receives the Host.', silent: true, dur: 2.0 },
    quidRetribuam: { who: 'P', la: 'Quid retríbuam Dómino… Sanguis Dómini nostri Jesu Christi custódiat ánimam meam…', en: 'The priest receives the Precious Blood.', silent: true, dur: 2.4 },
    ecce: { who: 'P', la: 'Ecce Agnus Dei, ecce qui tollit peccáta mundi.', en: 'Behold the Lamb of God, behold Him who taketh away the sins of the world.', dur: 1.8 },
    dnsdC: { who: 'P', la: 'Dómine, non sum dignus, ut intres sub tectum meum: sed tantum dic verbo, et sanábitur ánima mea.', en: 'Lord, I am not worthy… (said three times; strike your breast each time)', dur: 1.7 },
    corpus: { who: 'P', la: 'Corpus Dómini nostri Jesu Christi custódiat ánimam tuam in vitam ætérnam. Amen.', en: 'May the Body of our Lord Jesus Christ preserve thy soul unto life everlasting. Amen.', dur: 1.6 },
    reposition: { who: 'P', la: '(replaces the ciborium and closes the tabernacle door)', en: '', silent: true, dur: 1.8 },
    quodOre: { who: 'P', la: 'Quod ore súmpsimus, Dómine… Corpus tuum, Dómine…', en: 'The ablutions (silently).', silent: true, dur: 1.8 },
    commAnt: { who: 'P', la: 'Commúnio: Amen dico vobis, quidquid orántes pétitis…', en: 'The Communion verse.', dur: 1.8 },
    postcomm: { who: 'P', la: 'Quǽsumus, omnípotens Deus: ut, quos divína tríbuis participatióne gaudére…', en: 'The Postcommunion.', dur: 2.0 },
    placeat: { who: 'P', la: 'Pláceat tibi, sancta Trínitas, obséquium servitútis meæ…', en: 'May the homage of my service be pleasing to Thee… (bowed, silently)', silent: true, dur: 2.0 },
    prologue: { who: 'P', la: 'In princípio erat Verbum, et Verbum erat apud Deum, et Deus erat Verbum…', en: 'In the beginning was the Word… (John 1:1–14)', dur: 3.2 },
    sermonNone: { who: 'P', la: '(no sermon today: the maniple stays on his arm)', en: '', silent: true, dur: 0.8 },
  };

  // ─── Building the Mass ─────────────────────────────────────────────────────

  const DEFAULTS = {
    servers: 2, gloria: true, creed: true, communion: true, confiteor: true,
    sermon: 'random',          // 'off' | 'random' | 'always'
    railCloth: 'none',         // 'none' (set before Mass) | 'agnus' | 'dnsd' | 'blood'
    bellMinorElevation: true,  // SV p. 17; not in the 1962 rubrics
    bellDomineNonSum: true,    // SV p. 17; OC 360 §24 says no longer
    sacristyVersicle: 'procedamus',   // or 'adjutorium'
    seed: 1,
  };

  /**
   * Build the list of beats for the chosen options.
   * Commands are strings: "verb arg arg". See COMMANDS for the verbs.
   */
  function build(options) {
    const o = Object.assign({}, DEFAULTS, options || {});
    const two = o.servers === 2;
    const sermon = o.sermon === 'always' || (o.sermon === 'random' && rand(o.seed) < 0.5);
    const beats = [];
    let part = '';

    const cmds = s => (Array.isArray(s) ? s : String(s).split(';')).map(x => x.trim()).filter(Boolean);
    /** Add a beat. spec: { P, A1, A2, S (both servers), C (communicants), one (one-server A1), cite, note } */
    function B(spec) {
      const b = { part, cite: spec.cite || '', note: spec.note || '', tracks: {} };
      const add = (role, s) => { if (s != null) b.tracks[role] = (b.tracks[role] || []).concat(cmds(s)); };
      add('P', spec.P);
      if (two) {
        add('A1', spec.S); add('A2', spec.S);
        add('A1', spec.A1); add('A2', spec.A2);
      } else {
        if (spec.one != null) add('A1', spec.one);
        else { add('A1', spec.S); add('A1', spec.A1); }
      }
      if (spec.C) for (let i = 1; i <= 4; i++) add('C' + i, typeof spec.C === 'function' ? spec.C(i) : spec.C);
      if (spec.cues) b.cues = spec.cues;
      if (spec.noteA1 || spec.noteA2) b.notes = { A1: spec.noteA1, A2: spec.noteA2 };
      if (Object.keys(b.tracks).length) beats.push(b);
      return b;
    }
    /** Priest says p, then the server(s) answer s. */
    const vr = (p, s, extra = {}) => { B({ P: `say ${p}`, ...extra.p }); B({ S: `say ${s}`, ...extra.s }); };
    const SIDE = two ? null : { E: 'xE', G: 'xG' };
    const outHall = 'via w_sac; via w_hall';                               // sacristy → hall
    // those who walk behind the player move only once the player has cleared each point: they know where you are going
    const paced = (...steps) => steps.map((c, i) => `pace ${i + 1}${i === steps.length - 1 ? ' last' : ''}; ${c}`).join('; ');
    const homeHall = 'via w_rail; via w_door; via w_thr; via w_hall; via w_sac';  // rail → sacristy

    // ── Before Mass: the sacristy and the procession ─────────────────────────
    part = 'Leaving the sacristy';
    B({ P: 'go sacP; face people', A1: 'go sacA1; face people', A2: 'go sacA2; face people', one: 'go sacA1; face people' });
    if (o.sacristyVersicle === 'adjutorium') vr('T.adjSac', 'T.quiFecit', { s: { cite: 'SV p. 6' } });
    else vr('T.procedamus', 'T.inNomine', { s: { cite: 'SV p. 6' } });
    B({ P: 'nod', S: 'nod', note: 'Bow to the cross in the sacristy.', cite: 'SV p. 6' });

    part = 'Holy water at the door';
    if (two) {
      B({ A2: `${outHall}; go thrA2; dip; turn ccw thrA1; offerwater`, A1: `wait 0.5; ${paced('via w_sac', 'via w_hall', 'go thrA1')}`, P: `wait 1.1; ${paced('via w_sac', 'via w_hall', 'go P.thr')}`, cite: 'SV p. 6: A2 goes to the threshold first and dips his fingers' });
      B({ A1: 'touch A2', note: 'Take the holy water from A2’s fingers.' });
      B({ P: 'offerwater', A1: 'touch P', note: 'And offer it to the priest: touch his fingers with yours.' });
      B({ P: 'cross', S: 'cross', note: 'All cross themselves together.' });
      // the two-server pages do not mention the bell; A2 is the one at the door with a hand free
      B({ A2: 'tug', note: 'Tug the sacristy bell: the people know Mass is beginning.', cite: 'SV p. 26 (written for one server)' });
    } else {
      B({ one: `${outHall}; go thrA2; dip; turn ccw P.thr`, P: `wait 0.7; ${paced('via w_sac', 'via w_hall', 'go P.thr')}`, cite: 'SV p. 26' });
      B({ P: 'offerwater', one: 'touch P', note: 'Touch the priest’s fingers with the holy water.' });
      B({ P: 'cross', one: 'cross' });
      B({ one: 'tug', note: 'Tug the sacristy bell: the people know Mass is beginning.', cite: 'SV p. 26' });
    }

    part = 'Procession to the altar';
    if (two) {
      B({ A2: 'via w_door; via w_rail; via w_gos; via w_gosIn; go cfL', A1: `wait 0.5; ${paced('via w_door', 'via w_rail', 'via w_epi', 'via w_epiIn', 'go cfR')}`, P: `wait 1.1; ${paced('via w_door', 'via w_rail', 'via w_mid', 'via w_midIn', 'go P.foot')}`,
          cite: 'SV p. 6: single file, A2 leading; A2 to the Gospel side, A1 to the Epistle side' });
    } else {
      B({ one: 'via w_door; via w_rail; via w_epi; via w_epiIn; go cfR', P: `wait 0.6; ${paced('via w_door', 'via w_rail', 'via w_mid', 'via w_midIn', 'go P.foot')}`, cite: 'SV p. 26: move to the right (Epistle side)' });
    }
    if (two) {
      B({ P: 'offer biretta', A1: 'take biretta; kiss hand', cite: 'SV p. 6 (change 2025-12-20): A1 takes the biretta, then kisses the priest’s hand' });
      B({ A1: 'kiss biretta', note: 'A1 kisses the biretta as he turns.' });
    } else {
      B({ P: 'offer biretta', one: 'kiss hand; take biretta', cite: 'SV p. 26: kiss the hand before receiving the biretta' });
    }
    B({ P: 'go P.step; gen', S: 'genhold', note: 'Genuflect in time with the priest — and stay down.', cite: 'SV pp. 6, 27' });
    B({ P: 'wait 1.2; go P.mid slow', S: 'pinch', note: 'Pinch the side of his alb as he goes up, so he does not trip.', cite: 'SV pp. 6, 27' });
    B({ S: 'rise', note: 'Rise once he reaches the top step.' });

    part = 'Closing the gates';
    if (two) {
      B({ P: 'g placeChalice; go P.epi; g openBook; say T.setup; go P.mid; nod',
          A1: 'go sed; put biretta sed.chair; signal chairDone; go gateE; sync gates; close gateE; go cfR; face altar',
          A2: 'waitsig chairDone; turn cw people; go gateG; sync gates; close gateG; go cfL2; face altar',
          cite: 'SV pp. 6–7: A1 takes the biretta to the chair, then both close the gates together' });
    } else {
      B({ P: 'g placeChalice; go P.epi; g openBook; say T.setup; go P.mid; nod',
          one: 'kiss biretta; go sed; put biretta sed.chair; go gateE; close gateE; go midRail; gen; go gateG; close gateG; go cfL; face altar',
          cite: 'SV p. 27: chair, Epistle gate, genuflect, Gospel gate; stay on the Gospel side' });
    }
    B({ P: 'go P.step; face altar', note: 'Remain standing until the priest comes down.', cite: 'SV p. 7: A2 stands diagonally aside — the priest swings out wide' });
    B({ P: 'gen; go P.foot back', A1: 'kneel', A2: 'go cfL; kneel', note: 'Kneel in time with his genuflection.', cite: 'SV pp. 7, 27' });

    // ── Prayers at the foot of the altar ─────────────────────────────────────
    part = 'Prayers at the foot of the altar';
    B({ P: 'cross; say sign.0', S: 'cross' });
    vr('antiphon.0', 'antiphon.1');
    vr('ps42.0', 'ps42.1'); vr('ps42.2', 'ps42.3'); vr('ps42.4', 'ps42.5');
    B({ P: 'bow head; say gloria.0', S: 'bow head', note: 'Bow your head with the priest at the Gloria Patri.' });
    B({ S: 'up; say gloria.1', P: 'up', note: 'Stop bowing as you begin the Sicut erat.' });
    vr('gloria.2', 'gloria.3');
    B({ P: 'cross; say adjutorium.0', S: 'cross' });
    B({ S: 'say adjutorium.1' });
    B({ P: 'bow deep; say confiteor-s.0-7; strike 3', cite: 'R III, 7' });
    B({ S: 'bow deep; faceto P; say confiteor-s.8', note: 'Bow down further and face towards the priest.', cite: two ? 'SV p. 10' : 'SV p. 30: here he is to your RIGHT' });
    B({ P: 'say confiteor-s.9; up', S: 'faceto altar', note: 'At his “Amen”, face back to the altar, still bowed.', cite: 'SV p. 10' });
    if (o.wholePrayer) {
      // the movements come due as you reach the words
      B({ S: 'say confiteor-m.0-7', note: 'Face the priest at “et tibi, Pater” and “et te, Pater”; strike your breast at “mea culpa”.', cite: 'SV p. 10',
          cues: [{ at: 'et tibi', cmd: 'faceto P' }, { at: 'nimis', cmd: 'faceto altar' }, { at: 'mea culpa', cmd: 'strike 3' }, { at: 'et te', cmd: 'faceto P' }, { at: 'pro me', cmd: 'faceto altar' }] });
    } else {
      B({ S: 'say confiteor-m.0' });
      B({ S: 'say confiteor-m.1' });
      B({ S: 'faceto P; say confiteor-m.2; faceto altar', note: 'Shift to face the priest at “et tibi, Pater”, then back.', cite: 'SV p. 10' });
      B({ S: 'say confiteor-m.3' });
      B({ S: 'say confiteor-m.4; strike 3' });
      B({ S: 'say confiteor-m.5' });
      B({ S: 'say confiteor-m.6' });
      B({ S: 'faceto P; say confiteor-m.7; faceto altar', note: '…and again at “et te, Pater”.' });
    }
    B({ P: 'say confiteor-m.8' });
    B({ S: 'say confiteor-m.9; up', note: 'Amen — return to the kneeling position.', cite: 'SV p. 11' });
    B({ P: 'cross; say confiteor-m.10', S: 'cross' });
    B({ S: 'say confiteor-m.11' });
    B({ P: 'bow med; say versicles.0', S: 'bow med', note: 'Bow your head with him for the last versicles.', cite: 'SV p. 11 (change 2025-12-20)' });
    B({ S: 'say versicles.1' }); vr('versicles.2', 'versicles.3'); vr('versicles.4', 'versicles.5');
    vr('versicles.6', 'versicles.7');
    B({ P: 'up; g extendJoin', S: 'up', note: 'As he extends and joins his hands, return to kneeling upright.', cite: 'SV p. 12' });
    B({ P: 'say versicles.8' });
    B({ P: 'wait 1.2; go P.mid slow; say ascent.0-1', S: 'pinch', note: 'Pinch his alb again as he goes up the steps.', cite: 'SV p. 12' });
    B({ P: 'bow med; say ascent.2-3; g kissAltar; up',
        A1: two ? 'stand; turn ccw people; go xE; kneel' : 'stand; go xG; kneel',
        A2: 'stand; turn cw people; go xG; kneel',
        note: two ? 'Go to your place in extended formation and kneel.' : 'The book is open on the Epistle side: your place is opposite it, on the Gospel side.',
        cite: two ? 'SV p. 4 (formations)' : 'SV p. 26 (general rule)' });

    // ── Introit, Kyrie, Gloria, Collect ──────────────────────────────────────
    part = 'Introit and Kyrie';
    B({ P: 'go P.epi; cross; say T.introit', S: 'cross', note: 'Do NOT say Amen after the Introit.', cite: 'SV p. 12' });
    B({ P: 'go P.mid' });
    for (let i = 0; i < 9; i += 2) {
      B({ P: `say kyrie.${i}` });
      if (i < 8) B({ S: `say kyrie.${i + 1}` });
    }
    if (o.gloria) {
      part = 'Gloria';
      B({ P: 'g extendRaise; nod; say T.gloria1' });
      B({ P: 'say T.gloria2; cross', S: 'cross', note: 'Kneeling servers do not bow at the Gloria’s bows (St. Vitus).', cite: 'SV p. 5' });
    }
    part = 'Collect';
    B({ P: 'g kissAltar; turn cw people; g extendJoin; say collect.0; turn ccw altar' });
    B({ S: 'say collect.1' });
    B({ P: 'go P.epi; nod; say collect.2; g orans; say T.collect; g joined; say collect.3-5; nod' });
    B({ S: 'say collect.6', note: 'Say Amen at the end of the Collect.', cite: 'SV p. 12' });

    // ── Epistle, Gradual, moving the book ────────────────────────────────────
    part = 'Epistle';
    B({ P: 'g handsOnBook; say T.epistle; g leftHandDown', note: 'The signal: he lays his left hand on the altar.', cite: 'SV p. 12' });
    B({ S: 'say lessons.0' });
    B({ P: 'say T.gradual',
        A1: two ? 'stand; turn ccw people; go ftE' : 'stand; go mid; gen; go ftE',
        note: two ? 'After the Alleluia, A1 goes to the Epistle side to move the book; A2 stays.' : 'Stand, genuflect crossing the middle, and go to the Epistle side.',
        cite: two ? 'SV p. 13' : 'SV p. 33' });
    B({ P: 'go P.mid; g eyesUp; bow deep; say T.munda; up',
        A1: 'go topE; take missal; turn ccw people; go mid; signal bookGen; gen; go topG; put missal altar.G; go st2G; face P',
        A2: 'waitsig bookGen; stand; face P',
        note: 'Carry the Missal down, genuflect in the middle, set it at about 30° on the Gospel side, and stand on the second step facing the priest.',
        cite: two ? 'SV p. 13: when A1 genuflects, A2 stands' : 'SV p. 33' });

    // ── Gospel ───────────────────────────────────────────────────────────────
    part = 'Gospel';
    B({ P: 'go P.gosBook; say lessons.1' });
    B({ S: 'say lessons.2' });
    B({ P: 'g signBook; small; say lessons.3', S: 'small', note: 'Thumb to forehead, lips and breast — standing straight, head not bent to the thumb.', cite: 'SV p. 13' });
    B({ S: 'say lessons.4' });
    B({ P: 'say T.gospel1; nod', S: 'nod', note: 'Bow at the Holy Name.', cite: 'SV p. 13' });
    B({ A1: 'turn ccw wall; go mid; gen; go xE; face book', A2: 'face book',
        note: 'Turn towards the wall (counter-clockwise), go down, genuflect crossing the middle, and stand at your place facing the Missal at 45°.',
        cite: two ? 'SV p. 13' : 'SV p. 33: you end up on the EPISTLE side' });
    B({ P: 'say T.gospel2; g kissBook', note: 'Cue for “Laus tibi, Christe”: he goes to kiss the Missal.', cite: 'SV p. 13' });
    B({ S: 'say lessons.5' });
    B({ P: 'say T.evangelica' });

    // ── Sermon (or not) ──────────────────────────────────────────────────────
    if (sermon) {
      part = 'Sermon';
      B({ P: 'g maniple; say T.maniple',
          A1: 'go sed; take biretta; kiss biretta; go cfR; face altar',
          A2: 'go cfL2; face altar',
          note: 'He folds his maniple over the Missal: he will preach. Get the biretta and meet him at the foot of the altar.',
          noteA1: 'He folds his maniple: he will preach. Get the biretta and meet him at the foot of the altar.',
          noteA2: 'He folds his maniple: he will preach. Go to the foot of the altar, on the Gospel side.',
          cite: two ? 'SV p. 14' : 'SV p. 34' });
      B({ P: 'go P.mid; go P.step; face altar' });
      B({ P: 'gen; go P.foot back', S: 'gen', note: 'Genuflect with the priest.' });
      B({ P: 'need biretta; g donBiretta', A1: 'give biretta P; kiss hand', cite: 'SV p. 34 (change 2025-12-20)' });
      B({ P: 'via P.lectVia; go P.lect; say T.sermon; g doffBiretta; go P.lectVia; go P.foot; face altar',
          A1: 'go stoolE; sit', A2: 'go stoolG; sit', note: 'Proceed to your seat.', cite: 'SV p. 14' });
      B({ S: 'stand', A1: 'go cfR; face altar', A2: 'go cfL; face altar', note: 'Stand and close formation.' });
      B({ P: 'offer biretta', A1: 'kiss hand; take biretta; kiss biretta', cite: 'SV p. 34' });
      B({ P: 'go P.step; gen', S: 'genhold', note: 'Genuflect with him — and stay down while he ascends.' });
      B({ P: 'wait 1.2; go P.mid slow; go P.gos; g unManiple; go P.mid', S: 'pinch' });
      B({ S: 'rise', A1: 'go sed; put biretta sed.chair; go xE; kneel', A2: 'go xG; kneel', one: 'rise; go sed; put biretta sed.chair; go xE; kneel',
          note: 'Back to extended formation, and kneel.' });
    } else {
      B({ P: 'say T.sermonNone', S: 'kneel', note: 'No sermon from the lectern: kneel at once in extended formation.', cite: 'SV p. 14' });
    }

    // ── Creed ────────────────────────────────────────────────────────────────
    if (o.creed) {
      part = 'Creed';
      B({ P: 'go P.mid; g extendRaise; nod; say T.credo1', note: 'Do NOT stand — remain kneeling.', cite: 'SV p. 14' });
      B({ P: 'gen; say T.credo2', note: 'Kneeling, you need not bow at “simul adoratur” (St. Vitus).', cite: 'SV p. 5' });
      B({ P: 'say T.credo3; cross', S: 'cross' });
    } else {
      B({ P: 'go P.mid' });
    }

    // ── Offertory ────────────────────────────────────────────────────────────
    part = 'Offertory';
    B({ P: 'g kissAltar; turn cw people; g extendJoin; say offertory.0; turn ccw altar' });
    B({ S: 'say offertory.1' });
    B({ P: 'nod; say offertory.2; say T.offAnt' });
    if (two) {
      B({ A1: 'stand; go midR; sync offGen; gen; go cred1',
          A2: 'stand; go midL; sync offGen; gen; go veilTop',
          P: 'g unveil; hold veil',
          cite: 'SV p. 14: come together and genuflect; A2 goes at once for the chalice veil' });
      B({ A2: 'take veil; fold veil; put veil altar.veil; via w_stE; via w_low; go cred2', A1: 'take wine; take water',
          P: 'say T.suscipe; go P.cruet', note: 'Fold the veil in thirds, away from the edge of the altar.', cite: 'SV p. 14' });
      B({ A1: 'offer water', A2: 'take water', note: 'A1 hands A2 the water cruet; both hold their cruet in the right hand.', cite: 'SV p. 15' });
      B({ A1: 'go cruWait1; face P', A2: 'go cruWait2; face P' });
      B({ P: 'nod', S: 'nod', note: '“Bow, walk, kiss”: BOW when the priest bows to you…', cite: 'SV p. 15' });
      B({ A1: 'go cruA1; kiss wine', A2: 'go cruA2; kiss water', note: '…WALK up to the second step, and KISS the handles.' });
      B({ A1: 'give wine P', P: 'need wine; g pour; say T.deusQui; hold wine' });
      B({ A1: 'take wine' });
      B({ A2: 'give water P', P: 'need water; g blessWater; g pour; hold water', note: 'Be ready to receive the cruet back in the LEFT hand.', cite: 'SV p. 15' });
      B({ A2: 'take water' });
      B({ P: 'nod', S: 'nod', note: 'Bow back to the priest…' });
      B({ A1: 'turn ccw people; go cred1; kiss wine; put wine tray', A2: 'turn cw people; go cred2; kiss water; put water tray',
          P: 'go P.mid; say T.offerimus',
          note: '…descend turning INWARDS (A1 counter-clockwise, A2 clockwise), and kiss the cruets as you return them.', cite: 'SV p. 15' });
    } else {
      B({ one: 'stand; go cred; via w_low; via w_stE; go veilTop', P: 'g unveil; hold veil', note: 'To the credence — do NOT genuflect; then up for the chalice veil.', cite: 'SV p. 34' });
      B({ one: 'take veil; fold veil; put veil altar.veil; via w_stE; via w_low; go cred; take wine; take water', P: 'say T.suscipe; go P.cruet',
          note: 'Fold the veil in thirds, away from the edge. Wine in the right hand, water in the left.', cite: 'SV p. 34' });
      B({ one: 'go cruWaitS; face P' });
      B({ P: 'nod', one: 'nod', note: '“Bow, walk, kiss”.', cite: 'SV p. 34' });
      B({ one: 'go cruS; kiss cruets' });
      B({ one: 'give wine P', P: 'need wine; g pour; say T.deusQui; hold wine' });
      B({ one: 'take wine' });
      B({ one: 'give water P', P: 'need water; g blessWater; g pour; hold water' });
      B({ one: 'take water' });
      B({ P: 'nod', one: 'nod' });
      B({ one: 'turn cw altar; go cred; kiss cruets; put wine tray; put water tray', P: 'go P.mid; say T.offerimus',
          note: 'Descend turning CLOCKWISE (to face the altar wall); kiss the cruets as you return them.', cite: 'SV p. 35' });
    }

    // ── Lavabo ───────────────────────────────────────────────────────────────
    part = 'Lavabo';
    if (two) {
      B({ A1: 'take towel; signal towelUp; go cruWait1; face P', A2: 'take pitcher; waitsig towelUp; take bowl; go cruWait2; face P', P: 'go P.cruet', cite: 'SV p. 15' });
      B({ P: 'nod', A1: 'go cruA1; hold towel', A2: 'go cruA2', note: 'Both up to the second step together; A1 holds the towel out, unfolded.', cite: 'SV p. 15' });
      B({ A2: 'pour pitcher', P: 'g wash; say T.lavabo', note: 'Pour a healthy stream until he raises his hands.', cite: 'SV p. 15' });
      B({ P: 'take towel; g dry; offer towel', A1: 'take towel', note: 'He folds the towel back over your outstretched hands.', cite: 'SV p. 15' });
      B({ A1: 'turn ccw people; go cred1; put towel cred.towel; light sc; take bells', A2: 'turn cw people; go cred2; put pitcher bowl; put bowl cred.bowl',
          P: 'go P.mid; bow med; say T.suscipeTrin; up', note: 'A1 lights the Sanctus candle and takes the bells.', cite: 'SV p. 16' });
      B({ A1: 'go midR; sync lavGen; gen; go xE; kneel', A2: 'go midL; sync lavGen; gen; go xG; kneel', note: 'Genuflect together, then back to extended formation.', cite: 'SV p. 16' });
    } else {
      B({ one: 'take towel; take pitcher; take bowl; go cruWaitS; face P', P: 'go P.cruet', note: 'Towel folded over your right arm; water in the right hand, basin in the left.', cite: 'SV p. 35' });
      B({ P: 'nod', one: 'go cruS', note: 'Ascend to the second step when the priest bows.' });
      B({ one: 'pour pitcher', P: 'g wash; say T.lavabo' });
      B({ one: 'offer towel', P: 'take towel; g dry; hold towel', note: 'Extend your right arm so the towel is in front of him.', cite: 'SV p. 35' });
      B({ one: 'take towel' });
      B({ one: 'turn cw altar; go cred; put towel cred.towel; put pitcher bowl; put bowl cred.bowl; light sc; take bells; go xE; kneel',
          P: 'go P.mid; bow med; say T.suscipeTrin; up',
          note: 'Light the Sanctus candle, take the bells, and kneel at your place — no genuflection, you have not crossed the middle.', cite: 'SV p. 35' });
    }

    // ── Orate fratres, Preface, Sanctus ──────────────────────────────────────
    part = 'Orate, fratres';
    B({ P: 'g kissAltar; turn cw people; say offertory.3; turn cw altar; g handsOnAltar',
        note: 'He turns all the way round, pausing half way for “Orate, fratres”. Answer once he has finished turning.', cite: 'SV p. 16' });
    B({ S: 'say offertory.4' });
    B({ S: 'say offertory.5' });
    B({ P: 'say offertory.6; say T.secret' });
    part = 'Preface and Sanctus';
    vr('preface.0', 'preface.1'); vr('preface.2', 'preface.3'); vr('preface.4', 'preface.5'); vr('preface.6', 'preface.7');
    B({ P: 'say T.preface', note: 'The cue for the bells is “una voce dicentes” — ring after each Sanctus.', cite: 'SV p. 16' });
    B({ P: 'bow med; say T.sanctus1', A1: 'ring 1' });
    B({ P: 'say T.sanctus2', A1: 'ring 1' });
    B({ P: 'say T.sanctus3', A1: 'ring 1' });
    B({ P: 'up; cross; say T.benedictus', S: 'cross' });

    // ── Canon and Consecration ───────────────────────────────────────────────
    part = 'Canon';
    B({ P: 'g eyesUp; g extendJoin; bow deep; g kissAltar; g crossesOblata; up; say T.teIgitur',
        A1: 'stand; go cred1; take sc; go gradE; put sc gradine.sc; nod; face wall; go xE; kneel',
        one: 'stand; go cred; take sc; go gradE; put sc gradine.sc; nod; face wall; go xE; kneel',
        note: 'Take the Sanctus candle from the credence to the gradine; a slight bow, turn to the wall and come back.', cite: 'SV p. 16' });
    B({ P: 'g handsOver; say T.hanc', A1: 'ring 1', note: 'Ring once when he spreads his hands over the chalice.', cite: 'SV p. 16; OC 359 §20' });
    B({ P: 'g crossesOblata; say T.quam; signal handsOff',
        A1: two ? 'waitsig handsOff; stand; go midR; go elR; kneel' : 'waitsig handsOff; stand; go elR; kneel',
        A2: 'waitsig handsOff; stand; go midL; go elL; kneel',
        note: 'When he takes his hands from the altar, go up (do NOT genuflect) and kneel beside him; bring the bells.',
        noteA2: 'When he takes his hands from the altar, go up (do NOT genuflect) and kneel beside him.', cite: two ? 'SV p. 16' : 'SV p. 36' });
    part = 'Consecration';
    for (const [words, lift, lower] of [['T.quiPridie', 'elevateHost', 'lowerHost'], ['T.simili', 'elevateChalice', 'lowerChalice']]) {
      B({ P: `bow med; say ${words}`, S: 'nod', note: 'A slight head bow as he bends over the altar.', cite: 'SV p. 17' });
      B({ P: 'up; gen', A1: 'ring 1', note: 'Ring once at his genuflection…', cite: 'R VIII, 6; OC 359–360 §21' });
      B({ P: `g ${lift}`, A1: 'lift; ring 1', A2: 'lift', one: 'lift; ring 1', note: two ? '…lift the back of the chasuble (A1 with the left hand, A2 with the right) and ring at the elevation…' : '…lift the chasuble with your left hand and ring at the elevation…', cite: 'SV pp. 17, 36' });
      B({ P: `g ${lower}; gen`, S: 'drop', A1: 'ring 1', note: '…and once more as he genuflects.' });
    }
    B({ A1: two ? 'stand; turn ccw people; go midR; gen; go xE; kneel' : 'stand; turn ccw people; go mid; gen; go xE; kneel',
        A2: 'stand; turn cw people; go midL; gen; go xG; kneel',
        P: 'say T.unde',
        note: 'Turn inwards, go down, genuflect, and back to extended formation.', cite: 'SV p. 17' });
    B({ P: 'strike 1; say T.nobisQuoque' });
    B({ P: 'g crossesOblata; say T.perIpsum; g minorElevation', A1: o.bellMinorElevation ? 'ring 1' : null,
        note: o.bellMinorElevation ? 'Ring at the minor elevation — watch his right elbow.' : '', cite: 'SV p. 17' });
    vr('pater.0', 'pater.1');

    // ── Pater noster and Agnus Dei ───────────────────────────────────────────
    part = 'Pater noster';
    B({ P: 'g joined; nod; say pater.2; g orans; say pater.3-7' });
    B({ S: 'say pater.8' });
    B({ P: 'say pater.9; say T.libera' });
    vr('pater.10', 'pater.11');
    vr('pater.12', 'pater.13');
    B({ P: 'say T.commixtio' });
    part = 'Agnus Dei';
    B({ P: 'bow med; say T.agnus1; strike 1', S: 'strike 1', note: 'Strike your breast at “miserere nobis”.', cite: 'SV p. 17' });
    B({ P: 'say T.agnus2; strike 1', S: 'strike 1' });
    B({ P: 'say T.agnus3; strike 1', S: 'strike 1' });
    // Altar-rail cloth (SV pp. 17–20, 37–39). Default: laid before Mass, taken up after — nothing to do.
    // Two servers flip both halves together at the chosen moment; one server flips the Gospel half during the
    // Agnus Dei (or at the first Domine non sum dignus) and the Epistle half on his way to fetch the paten.
    const clothOn = o.communion && o.railCloth !== 'none';
    const flipBoth = () => B({ A1: 'stand; go clothE; flip clothE; go xE; kneel', A2: 'stand; go clothG; flip clothG; go xG; kneel',
                               note: 'Flip the altar-rail cloth over: A1 the Epistle side, A2 the Gospel side.', cite: 'SV pp. 17, 19–20' });
    const flipGospelAlone = () => B({ one: 'stand; go midRail; gen; go clothG; flip clothG; go midRail; gen; go xE; kneel',
                                      note: 'Flip the Gospel-side rail cloth (genuflect crossing the middle, both ways).', cite: 'SV p. 37' });
    if (clothOn && o.railCloth === 'agnus') two ? flipBoth() : flipGospelAlone();
    B({ P: 'say T.preComm; say T.panem' });
    for (let i = 0; i < 3; i++) {
      B({ P: 'strike 1; say T.dnsdP', A1: o.bellDomineNonSum ? 'ring 1' : null,
          note: o.bellDomineNonSum && i === 0 ? 'Ring at each “Domine, non sum dignus”.' : '', cite: o.bellDomineNonSum ? 'SV p. 17' : '' });
      if (i === 0 && clothOn && o.railCloth === 'dnsd') two ? flipBoth() : flipGospelAlone();
    }
    if (clothOn && o.railCloth === 'blood' && !two) flipGospelAlone();

    // ── Communion ────────────────────────────────────────────────────────────
    part = 'Communion';
    B({ P: 'say T.corpusMeum; g communicate', S: 'bow med', note: 'Bow while the priest communicates.', cite: 'OC 360 §24' });
    const fetchPaten = (two ? 'go cred1' : 'go cred') + '; put bells cred.bells; take paten';
    const afterBlood = clothOn && o.railCloth === 'blood';
    const epiCloth = !two && clothOn ? 'go clothE; flip clothE; ' : '';
    const bothCloth = two && afterBlood;
    const pre = afterBlood ? '' : 'up; waitsig genUp; ';
    if (afterBlood) B({ P: 'g uncoverChalice; gen; say T.quidRetribuam; g drink', S: 'up', note: 'Wait until he has received the Precious Blood.', cite: 'SV pp. 20, 37' });
    B({ A1: pre + 'stand; ' + (bothCloth ? 'go clothE; flip clothE; ' : epiCloth) + fetchPaten +
            (two ? '; go midR; sync comGen; gen; go comR; kneel' : '; go mid; gen; go comS; kneel'),
        A2: pre + 'stand; ' + (bothCloth ? 'go clothG; flip clothG; ' : '') + 'go midL; sync comGen; gen; go comL; kneel',
        P: afterBlood ? null : 'g uncoverChalice; gen; signal genUp; say T.quidRetribuam; g drink',
        note: two ? 'Stand as he rises from his genuflection: A1 fetches the paten and puts the bells back; genuflect together, go up, kneel on the top step.'
                  : 'Stand as he rises: ' + (epiCloth ? 'flip the Epistle-side cloth, ' : '') + 'fetch the paten, put the bells back, genuflect, go up and kneel on the top step.',
        cite: two ? 'SV p. 18' : 'SV p. 37' });
    if (o.confiteor) {
      B({ S: 'bow deep', note: 'A profound bow; say the Confiteor quietly once he has drunk from the chalice.', cite: 'SV p. 18' });
      if (o.wholePrayer) B({ S: 'say confiteor-m.0-7', cues: [{ at: 'mea culpa', cmd: 'strike 3' }] });
      else for (let i = 0; i < 8; i++) B({ S: `say confiteor-m.${i}${i === 4 ? '; strike 3' : ''}` });
      B({ P: 'g openTabernacle; gen; g takeCiborium; turn cw people; say confiteor-m.8', note: 'Do NOT move until he gives the Misereatur.', cite: 'SV p. 19' });
      B({ S: 'say confiteor-m.9' });
      B({ P: 'g blessPeople; say confiteor-m.10', S: 'up; cross', note: 'Rise from the bow, still kneeling.', cite: 'SV p. 19' });
      B({ S: 'say confiteor-m.11' });
    } else {
      B({ P: 'g openTabernacle; gen; g takeCiborium; turn cw people' });
    }
    B({ P: 'g showHost; say T.ecce' });
    for (let i = 0; i < 3; i++) B({ P: 'say T.dnsdC', S: 'strike 1', note: i ? '' : 'Strike your breast at each “Domine, non sum dignus”.', cite: i ? '' : 'SV p. 22' });
    if (two) {
      B({ P: 'g giveHost A1; say T.corpus', A1: 'receive', note: 'A1 receives first, holding the paten by its handle under his chin.', cite: 'SV p. 22' });
      B({ A1: 'offer paten', A2: 'take paten', note: 'A1 passes the paten to his left, to A2.', cite: 'SV p. 22' });
      B({ P: 'g giveHost A2; say T.corpus', A2: 'receive' });
    } else {
      B({ P: 'g giveHost A1; say T.corpus', one: 'receive', note: 'Hold the paten by its handle, closely under your chin.', cite: '' });
    }
    if (o.communion) {
      const holder = two ? 'A2' : 'A1';
      B({ P: 'go P.r1; face people', [two ? 'A2' : 'one']: 'stand; go pr1; face people',
          A1: two ? 'stand; go gradE; take sc; go cr1; face people' : undefined,
          C: i => `go C${i}.rail; kneel`,
          note: two ? 'A2 (with the paten) goes at the priest’s RIGHT; A1 takes the Sanctus candle from the gradine and walks at his left, further off. No genuflection when carrying the paten.'
                    : 'Stand and assist the priest: the paten at his RIGHT. The Sanctus candle stays on the gradine.',
          cite: two ? 'SV p. 22' : 'SV p. 38' });
      commX.forEach((x, i) => {
        const n = i + 1;
        if (n > 1) B({ P: `go P.r${n}; face people`, [two ? 'A2' : 'one']: `go pr${n}; face people`, A1: two ? `go cr${n}; face people` : undefined,
                       note: n === 3 ? 'Crossing the middle aisle: cover the rim of the paten with your left hand.' : '', cite: n === 3 ? 'SV p. 22' : '' });
        B({ P: `g giveHost C${n}; say T.corpus`, ['C' + n]: 'receive', note: n === 1 ? 'Paten held at arm’s length, chin to chin.' : '', cite: '' });
      });
      B({ [two ? 'A2' : 'one']: 'give paten P', P: 'need paten', note: 'Hand the paten back, held still just below his elbow.', cite: '' });
      B({ P: 'go P.mid; signal priestUp; face altar; g putPaten; say T.reposition; g closeTabernacle; signal tabClosed',
          A1: two ? 'go mid; gen; go xE; kneel' : 'waitsig priestUp; go mid; gen; go xE; kneel',
          A2: 'go xG; kneel',
          C: i => `stand; go C${i}.out`,
          note: two ? 'Back to extended formation — genuflect only if you cross the middle. A1 keeps holding the candle until the tabernacle is closed.'
                    : 'Let the priest go up first. Then back to your place opposite the book: you crossed the middle, so genuflect.',
          cite: 'SV pp. 22–23, 38' });
    } else {
      B({ [two ? 'A2' : 'one']: 'give paten P', P: 'need paten; turn ccw altar; g putPaten', note: 'Hand the paten back, held still just below his elbow.', cite: '' });
      B({ P: 'say T.reposition; g closeTabernacle; signal tabClosed',
          A1: two ? 'stand; turn ccw people; go midR; gen; go xE; kneel' : 'stand; turn ccw people; go mid; gen; go xE; kneel',
          A2: 'stand; turn cw people; go midL; gen; go xG; kneel',
          note: 'Not carrying the paten, genuflect before going back to your place.', cite: 'SV p. 22' });
    }

    // ── Ablutions, moving the book and the veil ──────────────────────────────
    part = 'Ablutions';
    if (two) {
      const candleBack = o.communion ? 'go cred1; put sc cred.sc; snuff sc' : 'go gradE; take sc; go cred1; put sc cred.sc; snuff sc';
      B({ P: 'say T.quodOre; g holdChalice',
          A1: `waitsig tabClosed; stand; go midR; sync ablGen; gen; ${candleBack}; take wine`,
          A2: 'waitsig tabClosed; stand; go midL; sync ablGen; gen; go cred2; take water',
          note: 'Once the tabernacle door is closed: genuflect together and go to the credence; both take the cruets.', cite: 'SV p. 23' });
      B({ A1: 'go abl1; sync abl; pour wine', P: 'go P.ablM; g holdChalice; sync abl', note: 'A1 goes up to the top step and pours wine until he stops holding the chalice tilted. A2 stays below.', cite: 'SV p. 23' });
      B({ A1: 'turn cw altar; go cruA1; turn ccw P', A2: 'go cruA3; face P', P: 'g drink; go P.cruet; g holdFingers',
          note: 'A1 turns inwards (clockwise), steps down to the second step and turns back to face the priest; A2 comes up beside him.', cite: 'SV p. 23' });
      B({ A1: 'pour wine', note: 'Wine over his fingers — a healthy pour, never touching his hands.', cite: 'SV p. 23' });
      B({ A2: 'pour water', note: 'Then water on top of it.' });
      B({ A1: 'turn ccw people; go cred1; put wine tray', A2: 'turn cw people; go cred2; put water tray', P: 'g drink; go P.mid; g wipeChalice' });
      B({ A1: 'go plateTop; take paten; go cred1; put paten cred.paten', note: 'A1 retrieves the paten.', cite: 'SV p. 23' });
      B({ A1: 'go midR; sync bookGen; gen; wait 0.8; via w_stG; go topG; take missal', A2: 'go midL; sync bookGen; gen; via w_cE; via w_stE; go topE; take veil',
          note: 'Genuflect together; A1 to the Gospel side for the Missal (drag it with the left hand), A2 to the Epistle side for the veil — cross outward.', cite: 'SV p. 24' });
      B({ A1: 'go midL; sync bookGen2; gen; wait 0.8; via w_stE; go topE; put missal altar.E', A2: 'go midR; sync bookGen2; gen; via w_cG; via w_stG; go veilG; put veil altar.veilG; take burse; hold burse',
          note: 'Genuflect in sync; A1 takes the Missal to the Epistle side; A2 lays the veil down on the Gospel side, takes the burse and holds it open, the left hand concealing the opening.', cite: 'SV p. 24' });
      B({ P: 'g foldCorporal', A2: 'wait 0.6; put burse altar.burseG; take veil; hold veil', note: 'Hold the veil low on either side so he can take it from the top.', cite: 'SV p. 24' });
      B({ P: 'take veil; g veilChalice', A2: 'take burse; give burse P', note: 'Then present the burse with your left hand.' });
      B({ P: 'need burse; g burseOnChalice; go P.epi; say T.commAnt', A1: 'sync down; turn cw people; ' + (clothOn ? 'go clothE; unflip clothE; ' : '') + 'go xE; kneel',
          A2: 'sync down; turn ccw people; ' + (clothOn ? 'go clothG; unflip clothG; ' : '') + 'go xG; kneel',
          note: 'Descend together and return to extended formation.', cite: 'SV p. 24' });
    } else {
      const candle = clothOn ? 'go clothE; unflip clothE; go gradE; take sc' : 'go gradE; take sc';
      B({ P: 'say T.quodOre; g holdChalice',
          one: `waitsig tabClosed; stand; ${candle}; go cred; put sc cred.sc; snuff sc; take wine; take water`,
          note: 'Once the door is closed: take the Sanctus candle off the gradine, then take both cruets.', cite: 'SV pp. 38–39' });
      B({ one: 'go abl1; sync abl; pour wine', P: 'go P.ablM; g holdChalice; sync abl', note: 'Up to the top step; pour until he stops holding the chalice tilted out.', cite: 'SV p. 39' });
      B({ one: 'turn cw altar; go cruS; turn ccw P', P: 'g drink; go P.cruet; g holdFingers', note: 'Turn inwards (clockwise), step down to the second step, and turn back to face him.', cite: 'SV p. 39' });
      B({ one: 'pour wine', note: 'Wine over his fingers from your right hand…' });
      B({ one: 'pour water', note: '…then water from your left. Never touch his hands.' });
      B({ one: 'go cred; put wine tray; put water tray; go plateTop; take paten; go cred; put paten cred.paten', P: 'g drink; go P.mid; g wipeChalice',
          note: 'Put the cruets back; go part way up again for the paten and put it away.', cite: 'SV p. 39' });
      B({ one: 'go mid; gen; via cornerG; go floorG; go topG; take missal', note: 'Genuflect, then the long way round to the Gospel side for the Missal — drag it with the left hand.', cite: 'SV p. 39' });
      B({ one: 'go mid; gen; go topE; put missal altar.E; take veil', note: 'Genuflect at the foot, take it up to the Epistle side, and pick up the chalice veil (cross facing outward).', cite: 'SV p. 39' });
      B({ one: 'go mid; gen; go veilG; put veil altar.veilG; take burse; hold burse',
          note: 'Down the short way, genuflect, up to the Gospel side: lay the veil down, take the burse and hold it open.', cite: 'SV pp. 39–40' });
      B({ P: 'g foldCorporal', one: 'wait 0.6; put burse altar.burseG; take veil; hold veil', note: 'Hold the veil low on either side.', cite: 'SV p. 40' });
      B({ P: 'take veil; g veilChalice', one: 'take burse; give burse P', note: 'Then present the burse with your left hand.' });
      B({ P: 'need burse; g burseOnChalice; go P.epi; say T.commAnt',
          one: clothOn ? 'turn ccw people; go clothG; unflip clothG; go xG; kneel' : 'turn ccw people; go xG; kneel',
          note: 'Back to your place on the Gospel side, opposite the book.', cite: 'SV p. 40' });
    }

    // ── Postcommunion, dismissal, blessing ───────────────────────────────────
    part = 'Postcommunion';
    B({ P: 'go P.mid; g kissAltar; turn cw people; g extendJoin; say postcommunion.0; turn ccw altar' });
    B({ S: 'say postcommunion.1' });
    B({ P: 'go P.epi; nod; say postcommunion.2; g orans; say T.postcomm; g joined; say postcommunion.3-5; nod' });
    B({ S: 'say postcommunion.6' });
    part = 'Dismissal and blessing';
    B({ P: 'g closeBook; go P.mid; g kissAltar; turn cw people; say dismissal.0' });
    B({ S: 'say dismissal.1' });
    vr('dismissal.2', 'dismissal.3');
    B({ P: 'turn ccw altar; bow med; say T.placeat; up; g kissAltar; g eyesUp; g extendRaise; nod; turn cw people; g blessPeople; say dismissal.4', S: 'cross' });
    B({ S: 'say dismissal.5' });

    // ── Last Gospel ──────────────────────────────────────────────────────────
    part = 'Last Gospel';
    B({ P: 'turn cw altar; go P.gos; say lastgospel.0', S: 'stand' });
    B({ S: 'say lastgospel.1' });
    B({ P: 'g signBook; small; say lastgospel.2', S: 'small' });
    B({ S: 'say lastgospel.3' });
    if (two) {
      B({ P: 'say T.prologue', A1: 'go gateE; sync gates2; open gateE; go xE; face P', A2: 'go gateG; sync gates2; open gateG; go xG; face P',
          note: 'As he begins reading, both go back and open the gates again; A1 stays facing the Gospel.', cite: 'SV p. 25' });
    } else {
      B({ P: 'say T.prologue', one: 'go gateG; open gateG; go midRail; gen; go gateE; open gateE; go xE; face P',
          note: 'Open the gates again — genuflect in the centre — and end on the Epistle side, standing.', cite: 'SV p. 40' });
    }
    B({ P: 'gen; say lastgospel.4', S: 'gen', note: 'Genuflect with him at “Et Verbum caro factum est”.', cite: 'SV p. 25' });
    B({ S: 'say lastgospel.5' });

    // ── Prayers after Low Mass ───────────────────────────────────────────────
    part = 'Prayers after Low Mass';
    B({ P: 'turn cw people; go P.kneel; face altar; kneel', A1: 'go cfR; kneel', A2: 'go cfL; kneel', one: 'go cfR; kneel',
        note: 'As he comes down, close ranks with him at the foot of the altar and kneel.', cite: two ? 'SV p. 25' : 'SV p. 41' });
    for (let i = 0; i < 3; i++) {
      B({ P: 'say ave-salve.0-1' });
      B({ S: 'say ave-salve.2' }); B({ S: 'say ave-salve.3' });
    }
    B({ P: 'say ave-salve.4-9', S: 'say ave-salve.4' });
    for (let i = 5; i <= 9; i++) B({ S: `say ave-salve.${i}` });
    vr('ave-salve.10', 'ave-salve.11');
    B({ P: 'say michael.0-5' });
    B({ S: 'say michael.6' });
    B({ P: 'say michael.7-11', S: 'say michael.7' });
    for (let i = 8; i <= 11; i++) B({ S: `say michael.${i}` });
    for (let i = 0; i < 3; i++) B({ P: 'say michael.12', S: 'say michael.12' });

    part = 'Return to the sacristy';
    B({ P: 'stand; gen; go P.mid slow', S: 'pinch', note: 'Stay kneeling and help him up the steps; stand only once he reaches the top.', cite: 'SV p. 41' });
    B({ S: 'stand', P: 'g takeChalice' });
    B({ A1: 'go sed; take biretta; go cfR; face altar', A2: 'go cfL; face altar', one: 'go sed; take biretta; go cfR; face altar', P: 'go P.step; go P.foot; face altar',
        note: 'Get the biretta from the sedilia.', noteA2: 'Go to the foot of the altar, on the priest’s left.', cite: 'SV p. 25' });
    B({ P: 'gen', S: 'gen', note: 'Genuflect with the priest.' });
    B({ A1: 'kiss biretta; give biretta P; kiss hand', P: 'need biretta; g donBiretta', note: 'Kiss the biretta, hand it to him, then kiss his hand.', cite: 'SV p. 25 (change 2025-12-20)' });
    if (two) {
      B({ A2: `via w_gosIn; via w_gos; ${homeHall}; go sacA2; face people`, A1: `wait 0.6; ${paced('via w_epiIn', 'via w_epi', 'via w_rail', 'via w_door', 'via w_thr', 'via w_hall', 'via w_sac', 'go sacA1')}; face people`,
          P: `wait 1.2; ${paced('via w_midIn', 'via w_mid', 'via w_rail', 'via w_door', 'via w_thr', 'via w_hall', 'via w_sac', 'go sacP')}; face people`, note: 'A2 leads out, A1 follows, then the priest.', cite: 'SV p. 25' });
    } else {
      B({ one: `via w_epiIn; via w_epi; ${homeHall}; go sacA1; face people`, P: `wait 0.7; ${paced('via w_midIn', 'via w_mid', 'via w_rail', 'via w_door', 'via w_thr', 'via w_hall', 'via w_sac', 'go sacP')}; face people` });
    }
    part = 'In the sacristy';
    B({ S: 'kneel; nod', P: 'nod', note: 'Kneel and bow to the cross, waiting for the priest.', cite: 'SV p. 25' });
    vr('T.prosit', 'T.proOmnibus');
    B({ S: 'stand' });

    return beats;
  }

  /** A deterministic 0–1 number from a seed. */
  function rand(seed) { const x = Math.sin((seed || 1) * 9301.7 + 49297) * 233280; return x - Math.floor(x); }

  // ─── Command reference ─────────────────────────────────────────────────────

  /** Verbs the player performs (with the key that does it) — the rest are run for the player. */
  const COMMANDS = {
    go: '↑ ↓ ← →', via: null, face: null, turn: '← →', faceto: '← →, or dragging your back sideways',
    kneel: 'Shift', stand: 'Ctrl or ↑', gen: '↓ ↓', genhold: '↓ ↓', rise: 'Ctrl or ↑', sit: 'Ctrl',
    bow: 'dragging your back down', up: 'dragging your back up', nod: 'dragging your head down',
    cross: 'Space, or tracing it with your hand', small: 'tracing them with your hand', strike: 'dragging your hand to your breast', kiss: 'dragging your head to it, or it to your lips',
    take: 'dragging a hand to it', put: 'dragging it there', give: 'dragging it to them', offer: 'dragging it to them', receive: null,
    pinch: 'dragging a hand to his alb', lift: 'dragging a hand to his chasuble', drop: 'letting go of it', ring: 'shaking the hand with the bells', pour: 'dragging it to him',
    light: 'dragging a hand to it', snuff: 'dragging a hand to it', open: 'dragging a hand to it', close: 'dragging a hand to it', flip: 'dragging a hand to it', unflip: 'dragging a hand to it',
    dip: 'dragging a hand to it', offerwater: 'dragging a hand towards them', touch: 'dragging a hand to theirs', tug: 'dragging a hand to the rope', fold: 'dragging a hand to it',
    say: '1–4 / type', pace: null, wait: null, signal: null, waitsig: null, sync: null, need: null, 'need-pour': null, 'need-burse': null, g: null, note: null,
  };

  /** Parse "verb a b" into { verb, args }. */
  function parse(cmd) {
    const [verb, ...args] = cmd.split(/\s+/);
    return { verb, args, raw: cmd };
  }

  /** Text of a say reference: "ps42.1", "confiteor-s.0-7" (joined), or "T.key". */
  function lineText(ref, Mass) {
    if (ref.startsWith('T.')) {
      const t = T[ref.slice(2)];
      if (!t) throw new Error('unknown text ' + ref);
      return Object.assign({ ref }, t);
    }
    const m = /^([\w-]+)\.(\d+)(?:-(\d+))?$/.exec(ref);
    if (!m) throw new Error('bad line ref ' + ref);
    const sec = Mass.SECTIONS.find(s => s.id === m[1]);
    if (!sec) throw new Error('unknown section ' + m[1]);
    const a = +m[2], b = m[3] != null ? +m[3] : a;
    const lines = sec.lines.slice(a, b + 1);
    if (lines.length !== b - a + 1) throw new Error('line out of range ' + ref);
    return {
      ref, who: lines[0].who, la: lines.map(l => l.la).join(' '), en: lines.map(l => l.en).join(' '),
      line: a === b ? lines[0] : null,
    };
  }

  const API = { LAYOUT, SPOTS, PLACES, PROPS, T, DEFAULTS, COMMANDS, build, parse, lineText, heightAt, toward };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Ceremony = API;
})(typeof self !== 'undefined' ? self : this);
