/* Relic Raider - level data.
   Levels are composed from hand-authored 16x16 tile chunks that are stitched
   left-to-right. Every chunk keeps solid ground on its outer columns so any
   two chunks connect cleanly.

   Tile legend
     ' '  empty            '#'  stone            '~'  crumbling floor
     '^'  spikes           '<'  dart trap (fires left)   '>'  dart trap (right)
     'v'  climbable vine   'o'  coin             '*'  gem
     'R'  relic            'D'  temple door      'P'  player spawn
     'C'  checkpoint torch 'b'  brazier (decor)
     'G'  stone guardian   'F'  cave bat
     'm'  moving platform (horizontal)   'n'  moving platform (vertical)
*/
window.RR = window.RR || {};
(function () {
  'use strict';

  var CW = 16; /* chunk width  */
  var CH = 16; /* chunk height */
  var SKY_ROWS = 2; /* blank rows added above every level for headroom */
var TRIM = 2;     /* chunk rows 0-1 are always empty, so they are dropped */

  var CHUNKS = {
    /* spawn: the temple door you must carry the relic back to */
    start: [
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '         ooo    ',
      '        #####   ',
      '                ',
      ' P  D        b  ',
      '################',
      '################',
      '################'
    ],

    /* ascending broken stairs */
    steps: [
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '              o ',
      '             ###',
      '         o      ',
      '        ###     ',
      '    o           ',
      '   ###          ',
      '                ',
      '################',
      '################',
      '################'
    ],

    /* a three tile hole straight through the floor */
    pit3: [
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '     o     o    ',
      '                ',
      '                ',
      '                ',
      '#####   ########',
      '#####   ########',
      '#####   ########'
    ],

    /* wider hole with two crumbling stepping stones */
    pit4: [
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '      o  o      ',
      '                ',
      '                ',
      '                ',
      '#####  ~~  #####',
      '#####      #####',
      '#####      #####'
    ],

    /* two beds of spikes with a safe island between them */
    spikes: [
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '    ooo   ooo   ',
      '                ',
      '                ',
      '   ^^^   ^^^    ',
      '################',
      '################',
      '################'
    ],

    /* dart shooter set into a low pillar */
    dartwall: [
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '     ooo        ',
      '           ##   ',
      '          <##   ',
      '################',
      '################',
      '################'
    ],

    /* patrolling stone guardians, with a ledge to escape onto */
    guardian: [
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '      ooo       ',
      '     #####      ',
      '                ',
      '    G       G   ',
      '################',
      '################',
      '################'
    ],

    /* a blocking wall you have to climb with vines */
    vines: [
      '                ',
      '                ',
      '                ',
      '         *      ',
      '        v v     ',
      '        v#v     ',
      '        v#v     ',
      '     o  v#v  o  ',
      '        v#v     ',
      '        v#v     ',
      '        v#v     ',
      '        v#v     ',
      '        v#v     ',
      '################',
      '################',
      '################'
    ],

    /* bats over floating slabs */
    bats: [
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '     F      F   ',
      '                ',
      '                ',
      '   ooo    ooo   ',
      '   ####   ####  ',
      '                ',
      '                ',
      '                ',
      '################',
      '################',
      '################'
    ],

    /* safe ground: light the torch to set your respawn */
    checkpoint: [
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '  b    C     b  ',
      '################',
      '################',
      '################'
    ],

    /* a long crumbling shelf over nothing at all */
    crumbleRun: [
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '    o o o o     ',
      '                ',
      '                ',
      '                ',
      '##~~~~~~~~~~####',
      '##          ####',
      '##          ####'
    ],

    /* sliding slab over a chasm */
    movers: [
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '      o o       ',
      '                ',
      '                ',
      '      m         ',
      '####        ####',
      '####        ####',
      '####        ####'
    ],

    /* the inner sanctum: the relic sits on a pedestal, guarded */
    relicRoom: [
      '                ',
      '                ',
      '                ',
      '                ',
      '                ',
      '################',
      '#              #',
      '#      *       #',
      '#   o     o    #',
      '#              #',
      '       R       #',
      '      ###      #',
      '  G        G   #',
      '################',
      '################',
      '################'
    ]
  };

  var THEMES = {
    jungle: {
      skyTop: '#69704a',
      skyMid: '#ae9a62',
      skyLow: '#dabd7d',
      sun: 'rgba(255, 231, 168, 0.55)',
      far: '#55604a',
      mid: '#39482a',
      near: '#18220f',
      canopy: '#27381b',
      fog: 'rgba(214, 187, 133, 0.20)',
      stoneLo: '#5d5a49',
      stoneHi: '#8c876e',
      stoneEdge: '#3a382d',
      moss: '#6b7f3e',
      bark: '#3f301c',
      glyph: '#c9a34a',
      tint: 'rgba(255, 212, 140, 0.06)'
    },
    halls: {
      skyTop: '#4a3524',
      skyMid: '#7c5531',
      skyLow: '#b07f3d',
      sun: 'rgba(255, 196, 108, 0.45)',
      far: '#4a3d2a',
      mid: '#3b3021',
      near: '#191309',
      canopy: '#2f3318',
      fog: 'rgba(196, 142, 78, 0.20)',
      stoneLo: '#61503b',
      stoneHi: '#93795a',
      stoneEdge: '#392f22',
      moss: '#7a6a33',
      bark: '#3a2b18',
      glyph: '#e2b559',
      tint: 'rgba(255, 176, 96, 0.08)'
    },
    sanctum: {
      skyTop: '#151f26',
      skyMid: '#26363c',
      skyLow: '#4a4436',
      sun: 'rgba(120, 220, 220, 0.28)',
      far: '#1d2a2c',
      mid: '#182022',
      near: '#0e1315',
      canopy: '#16211d',
      fog: 'rgba(120, 170, 165, 0.18)',
      stoneLo: '#4a4c50',
      stoneHi: '#767a7e',
      stoneEdge: '#2a2c30',
      moss: '#3f6b5c',
      bark: '#242c2e',
      glyph: '#5fd6c4',
      tint: 'rgba(120, 220, 210, 0.07)'
    }
  };

  var LEVELS = [
    {
      name: 'The Overgrown Steps',
      subtitle: 'Chapter I',
      theme: 'jungle',
      collapseSpeed: 128,
      collapseRamp: 1.6,
      parTime: 105,
      chunks: ['start', 'steps', 'pit3', 'dartwall', 'checkpoint', 'spikes', 'guardian', 'relicRoom']
    },
    {
      name: 'Halls of the Sun King',
      subtitle: 'Chapter II',
      theme: 'halls',
      collapseSpeed: 142,
      collapseRamp: 2.0,
      parTime: 135,
      chunks: [
        'start', 'steps', 'pit4', 'bats', 'checkpoint',
        'crumbleRun', 'dartwall', 'guardian', 'relicRoom'
      ]
    },
    {
      name: 'The Sunken Sanctum',
      subtitle: 'Chapter III',
      theme: 'sanctum',
      collapseSpeed: 156,
      collapseRamp: 2.4,
      parTime: 165,
      chunks: [
        'start', 'vines', 'pit4', 'spikes', 'movers', 'checkpoint',
        'crumbleRun', 'bats', 'dartwall', 'relicRoom'
      ]
    }
  ];

  function pad(row) {
    if (row.length > CW) return row.slice(0, CW);
    while (row.length < CW) row += ' ';
    return row;
  }

  /* Stitch a level's chunks into one character grid. */
  function build(index) {
    var def = LEVELS[index];
    var rows = [];
    var r;
    for (r = 0; r < SKY_ROWS + CH - TRIM; r++) rows.push('');
    for (var c = 0; c < def.chunks.length; c++) {
      var chunk = CHUNKS[def.chunks[c]];
      if (!chunk) throw new Error('unknown chunk: ' + def.chunks[c]);
      for (r = 0; r < CH - TRIM; r++) rows[SKY_ROWS + r] += pad(chunk[r + TRIM] || '');
    }
    var width = def.chunks.length * CW;
    for (r = 0; r < SKY_ROWS; r++) {
      rows[r] = new Array(width + 1).join(' ');
    }
    return {
      index: index,
      name: def.name,
      subtitle: def.subtitle,
      theme: THEMES[def.theme],
      themeName: def.theme,
      collapseSpeed: def.collapseSpeed,
      collapseRamp: def.collapseRamp,
      parTime: def.parTime,
      rows: rows,
      w: width,
      h: rows.length
    };
  }

  RR.Levels = {
    count: LEVELS.length,
    defs: LEVELS,
    themes: THEMES,
    chunks: CHUNKS,
    build: build,
    CHUNK_W: CW,
    CHUNK_H: CH,
    SKY_ROWS: SKY_ROWS,
    WORLD_ROWS: SKY_ROWS + CH - TRIM
  };
})();
