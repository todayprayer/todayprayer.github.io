/*
 * World frame as in ceremony.js: metres, x+ = Epistle side = south, z+ = towards the nave = west, y up.
 * The sanctuary faces east. Site survey numbers are in metres east (E) and north (N) of the street address's
 * map point; they convert with world(E, N).
 */
(function (root) {
  'use strict';

  const world = (E, N) => [-(N - 2), -(E - 52)];

  // Rectangles are [x0, z0, x1, z1] in world coordinates.
  const CH = {
    north: -9, south: 9, east: -3, west: 26,      // outer walls of the church
    front: 3,                                     // the panelled wall the sanctuary opens through
    backWall: 22,                                 // the wall between nave and narthex
    alcove: 5.2,                                  // the sanctuary's side walls
    rail: 5.8, railX: 6.0,                                   // the rail's front runs this far either way, then returns to the wall
    bay: [6.15, 8.0], bayBack: 2.15,              // the recessed bay at each end of the panelled front
    hall: [-12.6, 3.15, -9, 4.75],                // the sacristy hall, running north off the nave towards the parish hall
    sacristy: [-12.6, 5.05, -9, 8.25],
    servers: [5.5, -2.6, 8.7, 1.85],              // the square changing room behind the sanctuary's Epistle wall
    t: 0.3,                                       // wall thickness
    eave: 3.7, ridge: 6.9, ceilEave: 3.7, ceilRidge: 6.3,
    sanctuaryCeil: 4.1, roomCeil: 2.7,
  };

  /** Doors stand in gaps in the walls. axis: the wall runs along x or z; at: its other coordinate; c: centre along it. */
  const DOORS = [
    { id: 'hallNave', axis: 'z', at: -8.85, c: 3.95, w: 1.1, name: 'to the sacristy hall' },
    { id: 'sacristy', axis: 'x', at: 4.9, c: -10.8, w: 0.95, name: 'to the sacristy' },
    { id: 'hallOut', axis: 'z', at: -12.75, c: 3.95, w: 1.0, name: 'outside, facing the parish hall', out: -1, color: 0x6a4322 },
    { id: 'servers', axis: 'z', at: 5.35, c: -0.1, w: 0.95, name: 'to the changing room' },
    { id: 'serversOut', axis: 'x', at: -2.8, c: 7.1, w: 1.0, name: 'outside, at the back of the church', out: -1, color: 0x6a4322 },
    { id: 'sideOut', axis: 'z', at: 8.85, c: 5.0, w: 1.1, name: 'outside', out: 1, color: 0x8a5a2a },
    { id: 'entry', axis: 'x', at: 26, c: 0, w: 3.0, name: 'the entrance', glass: true, out: 1 },
    { id: 'hallFront', axis: 'x', at: 26.65, c: -27.5, w: 2.0, name: 'the parish hall', out: 1, color: 0x5a3517, pair: true },
    { id: 'hallAud', axis: 'x', at: 19.15, c: -27.5, w: 2.0, name: 'the auditorium', color: 0x6b4423, pair: true },
  ];

  /** A wall from a to b along one axis, broken by any door standing in it. */
  function wall(axis, at, a, b, t = CH.t) {
    const gaps = DOORS.filter(d => d.axis === axis && Math.abs(d.at - at) < t + 0.2 && d.c > a && d.c < b)
      .map(d => [d.c - d.w / 2, d.c + d.w / 2]).sort((p, q) => p[0] - q[0]);
    const out = [];
    let from = a;
    for (const [g0, g1] of gaps) { if (g0 > from) out.push([from, g0]); from = g1; }
    if (b > from) out.push([from, b]);
    return out.map(([u, v]) => axis === 'x'
      ? [u, at - t / 2, v, at + t / 2]
      : [at - t / 2, u, at + t / 2, v]);
  }

  /** Every wall of the church, as rectangles: both the scene and the collisions use these. */
  const WALLS = [
    // the outer shell
    ...wall('x', CH.west, CH.north, CH.south),
    ...wall('z', CH.south - 0.15, CH.east, CH.west),
    ...wall('z', CH.north + 0.15, 2.85, CH.west),
    ...wall('x', -2.8, CH.north, CH.south, 0.4),
    // the wall behind the nave
    [-8.85, CH.backWall - 0.15, -2.2, CH.backWall + 0.15], [2.2, CH.backWall - 0.15, 8.85, CH.backWall + 0.15],
    // the panelled front wall, with a recessed bay towards each end
    ...[-1, 1].flatMap(s => {
      const lo = v => Math.min(v, s * CH.alcove), hi = v => Math.max(v, s * CH.alcove);
      const [b0, b1] = CH.bay, f0 = CH.front - 0.15, f1 = CH.front + 0.15;
      return [
        [Math.min(s * 8.85, s * b1), f0, Math.max(s * 8.85, s * b1), f1, 'oak'],
        [lo(s * b0), f0, hi(s * b0), f1, 'oak'],
        [Math.min(s * (b0 - 0.15), s * b0), CH.bayBack - 0.15, Math.max(s * (b0 - 0.15), s * b0), f0, 'oak'],
        [Math.min(s * b1, s * (b1 + 0.15)), CH.bayBack - 0.15, Math.max(s * b1, s * (b1 + 0.15)), f0, 'oak'],
      ];
    }),
    [-CH.bay[1], CH.bayBack - 0.3, -CH.bay[0], CH.bayBack, 'oak'],
    // the sanctuary's side walls; the changing-room door is in the Epistle one
    [-5.5, -2.6, -CH.alcove, CH.front - 0.15, 'oak'],
    ...wall('z', 5.35, -2.6, CH.front - 0.15).map(r => [...r, 'oak']),
    // the changing room's wall towards the nave
    [5.5, 1.85, 8.7, 2.15],
    // the sacristy hall and the sacristy, on the north side
    [-12.9, 2.85, -9, 3.15],
    ...wall('z', -12.75, 2.85, 8.55),
    ...wall('x', 4.9, -12.6, -9),
    [-12.9, 8.25, -9, 8.55],
    // the parish hall: its outer walls, the hallway from the front door, and the auditorium behind
    ...wall('x', 26.65, -37.8, -17.2).map(r => [...r, 'hall']),
    [-37.8, 5.2, -17.2, 5.5, 'hall'], [-37.8, 5.2, -37.5, 26.8, 'hall'], [-17.5, 5.2, -17.2, 26.8, 'hall'],
    ...wall('x', 19.15, -37.5, -17.5).map(r => [...r, 'hall']),
    [-29.3, 19.3, -29, 26.5, 'hall'], [-26, 19.3, -25.7, 26.5, 'hall'],
  ];

  /** Furniture and fittings the walker cannot pass. */
  const FURNITURE = [
    [-12.6, 7.6, -9, 8.25],         // sacristy: drawers and vesting table across the far wall
    [-9.65, 5.35, -9, 7.3],         // the vault
    [-12.6, 5.5, -12.0, 7.5],       // fridge and sink
    [-12.55, 5.05, -11.35, 5.45],   // audio racks beside the door
    [4.85, -2.3, 5.2, -0.95, 'low'],       // the choir bench, its end against the back wall, Epistle side
    [-5.2, -2.3, -4.85, -0.95, 'low'],     // and its fellow on the Gospel side
    [7.95, -2.0, 8.7, 0.6],         // changing room: cassocks on their rail
    [5.65, -2.6, 6.85, -2.1],       // shelf of lighters and thurible
    [5.65, 0.5, 6.05, 1.7, 'low'],         // bench
    // the right-hand bay: Our Mother of Perpetual Help with her kneeler; the baptismal font before it
    [6.63, 2.2, 7.53, 2.8, 'low'], [7.05, 3.65, 7.95, 4.55, 'low'],
    [7.85, 3.05, 8.55, 3.75, 'low'],         // the candles the laity light, right side
    [8.0, 3.6, 8.7, 3.9],           // the hymn board's stand
    // the left-hand bay: statue and gilded stand; the laity's candles by the sacristy-hall door
    [-7.5, 2.2, -7.0, 2.7], [-6.6, 2.3, -6.25, 2.65],
    [-8.5, 3.05, -7.8, 3.68, 'low'],
    // confessionals against the side walls, with room to walk past them
    [7.55, 6.6, 8.7, 9.3], [-8.7, 9.2, -7.55, 11.9],
    // parish hall: the stage and the rows of chairs
    [-34, 5.5, -21, 8.4, 'low'], [-34.5, 10.5, -28.6, 17.2, 'low'], [-26.4, 10.5, -20.5, 17.2, 'low'],
  ];

  /** Pews: row by row, either side of the centre aisle. */
  const PEWS = { x0: 1.1, x1: 6.3, z0: 8.6, step: 1.0, rows: 12, depth: 0.55 };
  for (const s of [-1, 1]) {
    FURNITURE.push(s > 0 ? [PEWS.x0, PEWS.z0, PEWS.x1, PEWS.z0 + PEWS.step * PEWS.rows - 0.3]
      : [-PEWS.x1, PEWS.z0, -PEWS.x0, PEWS.z0 + PEWS.step * PEWS.rows - 0.3]);
  }

  const rect = (E0, N0, E1, N1) => {
    const [xa, za] = world(E0, N0), [xb, zb] = world(E1, N1);
    return [Math.min(xa, xb), Math.min(za, zb), Math.max(xa, xb), Math.max(za, zb)];
  };

  const SITE = {
    hall: rect(23, 17, 49, 42),            // the hip-roofed north building
    addition: [-12.9, -3, -9, 8.55],       // flat-roofed section against the church's north side
    parcel: rect(-1, -24, 91, 76),
    pavements: [                            // asphalt
      rect(25, -22, 91, -8), rect(56, -22, 91, 76), rect(3, 42, 91, 76),
    ],
    lawns: [rect(4, -21, 24, 12), rect(4, 17, 22.8, 41)],
    // the covered walkway from the front lot along the hall and on to the church doors; the walk in from the street; sidewalks
    walks: [rect(22.9, 1, 25.1, 42.2), rect(4, 13, 23, 17), rect(23, -8, 26, 1), rect(2.2, -24, 3.8, 76), rect(-1, -23.6, 91, -22)],
    aprons: [rect(-3, 44, 4, 51), rect(-3, 69, 4, 75), rect(26, -28, 36, -21), rect(78, -28, 88, -21)],
    garden: rect(5, 52, 18, 68),           // the Marian garden, a driveway either side of it
    canopy: rect(22.7, 1, 25.3, 17),       // the flat canopy from the hall to the church doors
    // picket fence: west and south sides of the two lawns, with the gap at the walk
    fences: [
      { from: world(4.2, -21), to: world(4.2, 12.6) }, { from: world(4.2, 17.4), to: world(4.2, 42) },
      { from: world(4.2, -21), to: world(24, -21) },
    ],
    ironGates: [{ from: world(24, -21.2), to: world(26, -21.2) }, { from: world(70, -21.2), to: world(78, -21.2) }],
    // the iron fence round the garden, with its little gate facing the street
    gardenFence: [{ from: world(4.6, 52), to: world(4.6, 58.8) }, { from: world(4.6, 61.2), to: world(4.6, 68) }, { from: world(4.6, 52), to: world(8, 52) }, { from: world(4.6, 68), to: world(8, 68) }],
    gardenGate: { from: world(4.6, 58.8), to: world(4.6, 61.2) },
    boundary: [
      { from: world(90.6, -22), to: world(90.6, 76), h: 1.9 },
      { from: world(5, 75.6), to: world(91, 75.6), h: 1.9 },
    ],
    // trees as the 2025 street views show them
    pines: [[20, 77], [38, 78], [52, 77], [64, 53], [70, 42], [66, 11], [70, -2], [74, -6], [58, 78]].map(p => world(p[0], p[1])),
    broadleaf: [[38, 14], [12, 35], [10, 8], [44, 70]].map(p => world(p[0], p[1])),
    streetTrees: [[0.5, -14], [0.5, 8], [0.5, 28], [24, -23], [44, -23], [62, -23], [80, -23]].map(p => world(p[0], p[1])),
    islands: [[70, 2, 5], [64, 55, 5], [76, -16, 4]].map(p => [...world(p[0], p[1]), p[2]]),
    poles: [[34, -24], [60, -24], [86, -24], [-13, -18], [-13, 30], [-13, 62]].map(p => world(p[0], p[1])),
    lamps: [[3, 16], [3, -16], [24, -2], [24, -12]].map(p => world(p[0], p[1])),
    statue: world(11.5, 60),
    sign: world(3, 19),
    // parking bays: a line of stalls from..to along their heads, running `len` long in world direction `dir` out to the aisle, leaning by `skew`
    stalls: [
      { from: world(33, -21), to: world(74, -21), n: 15, len: 5, dir: [-1, 0], skew: 0.45 },
      { from: world(70, -8), to: world(70, 36), n: 18, len: 5, dir: [0, 1], skew: 0.5 },
      { from: world(70, -8), to: world(70, 36), n: 18, len: 5, dir: [0, -1], skew: 0.5 },
      { from: world(88, -6), to: world(88, 56), n: 22, len: 5, dir: [0, 1], skew: 0.4 },
      { from: world(20, 55), to: world(50, 55), n: 11, len: 5, dir: [-1, 0], skew: 0.45, carts: 3 },
      { from: world(20, 74), to: world(62, 74), n: 15, len: 5, dir: [1, 0], skew: 0.2 },
    ],
    // how far you can go: north past Chatsworth Street, south past the railway, west past Chatsworth station
    bounds: [-2780, -1660, 2500, 8380],
  };

  /** What the camera must stay clear of: walls and furniture, but it can see over the pews. */
  const SIGHT = [...WALLS, ...FURNITURE.filter(r => r[3] - r[1] < 8 && r[4] !== 'low')];

  const SOLIDS = [
    ...WALLS, ...FURNITURE, [-12.9, -3, -9, 2.85],
    // the rail's left and right sides, running back from its front to the panelled wall
    [-CH.railX - 0.1, CH.front, -CH.railX + 0.1, CH.rail + 0.1], [CH.railX - 0.1, CH.front, CH.railX + 0.1, CH.rail + 0.1],
    ...[...SITE.fences, ...SITE.gardenFence, ...SITE.boundary].map(f => {
      const [xa, za] = f.from, [xb, zb] = f.to;
      return [Math.min(xa, xb) - 0.06, Math.min(za, zb) - 0.06, Math.max(xa, xb) + 0.06, Math.max(za, zb) + 0.06];
    }),
  ];
  // arcade piers along the hall's west and south sides
  const PIERS = [];
  { const [x0, z0, x1, z1] = SITE.hall;
    for (let i = 0; i <= 7; i++) PIERS.push([x0 + 0.5 + i * (x1 - x0 - 1) / 7, z1 - 0.5]);
    for (let i = 0; i <= 7; i++) PIERS.push([x1 - 0.5, z0 + 0.5 + i * (z1 - z0 - 1) / 7]);
    for (const [x, z] of PIERS) SOLIDS.push([x - 0.25, z - 0.25, x + 0.25, z + 0.25]);
  }

  /** Is (x, z) free for a walker of radius r? `extra` adds footprints such as the houses or the rail. */
  function free(x, z, r = 0.18, extra) {
    for (const [a, b, c, d] of SOLIDS) if (x > a - r && x < c + r && z > b - r && z < d + r) return false;
    if (extra && extra(x, z, r)) return false;
    const [bx0, bz0, bx1, bz1] = SITE.bounds;
    return x > bx0 && x < bx1 && z > bz0 && z < bz1;
  }

  /** How far along a straight line from a to b (0–1) is the nearest wall? −1 if it is clear. (For the camera, and the tests.) */
  function crosses(ax, az, bx, bz, solids = WALLS, r = 0) {
    let nearest = -1;
    for (const [a, b, c, d] of solids) {
      let t0 = 0, t1 = 1, dx = bx - ax, dz = bz - az, ok = true;
      for (const [p, q] of [[-dx, ax - (a - r)], [dx, (c + r) - ax], [-dz, az - (b - r)], [dz, (d + r) - az]]) {
        if (p === 0) { if (q < 0) { ok = false; break; } continue; }
        const u = q / p;
        if (p < 0) { if (u > t1) { ok = false; break; } if (u > t0) t0 = u; }
        else { if (u < t0) { ok = false; break; } if (u < t1) t1 = u; }
      }
      if (ok && t0 < t1 && (nearest < 0 || t0 < nearest)) nearest = t0;
    }
    return nearest;
  }

  /** Name of the place at (x, z). */
  function regionAt(x, z) {
    const inR = ([a, b, c, d]) => x >= a && x <= c && z >= b && z <= d;
    if (inR(CH.sacristy)) return 'The sacristy';
    if (x >= CH.hall[0] && x <= CH.hall[2] && z >= CH.hall[1] && z < CH.sacristy[1]) return 'The sacristy hall';
    if (inR(CH.servers)) return 'The servers’ changing room';
    if (Math.abs(x) < CH.alcove && z > -2.3 && z < CH.rail) return 'The sanctuary';
    if (Math.abs(x) < CH.railX && z >= CH.front && z < CH.rail) return 'The sanctuary';
    if (Math.abs(x) < 9 && z >= 3 && z < CH.backWall) return 'The nave';
    if (Math.abs(x) < 9 && z >= CH.backWall && z < CH.west) return 'The narthex';
    if (z > 19.15 && z < 26.8 && x > -29.1 && x < -25.9) return 'The parish hall';
    if (x > -37.8 && x < -17.2 && z > 5.2 && z < 19.3) return 'The auditorium';
    if (inR(SITE.hall)) return 'The arcade of the parish hall';
    if (inR(SITE.garden)) return 'The Marian garden';
    if (x > -15 && x < -9 && z > 2.85 && z < 26) return 'The courtyard';
    if (inR(SITE.canopy)) return 'The covered walk';
    for (const p of SITE.pavements) if (inR(p)) return 'The parking lot';
    if (inR(SITE.parcel)) return 'The grounds of St. Vitus';
    const [wx, wz] = world(0, 0);
    if (Math.abs(z - wz - 8) < 9 && x > -420) return 'White Oak Avenue';
    if (Math.abs(x - wx - 27) < 9) return 'Superior Street';
    return z > 4770 ? 'Chatsworth' : 'Northridge';     // Winnetka Avenue, near enough
  }

  const API = { world, CH, DOORS, WALLS, FURNITURE, SIGHT, PEWS, PIERS, SITE, SOLIDS, free, crosses, regionAt, rect };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Plan = API;
})(typeof self !== 'undefined' ? self : this);
