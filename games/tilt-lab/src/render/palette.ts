/* TILT LAB - colour. Bright and clean: no greys anywhere - even shadows
   and grid lines are tinted. Each world gets its own backdrop and rail
   colours; ball colours never change, because they carry meaning. */

export interface WorldLook {
  name: string;
  sky: [string, string, string];   /* backdrop gradient, top to bottom */
  blobs: string[];                 /* soft colour pools on the backdrop */
  frame: [string, string];         /* chamber rim */
  glow: string;                    /* chamber outer glow */
  interior: [string, string];      /* chamber floor gradient */
  grid: string;
  rail: [string, string, string];  /* rail gradient: light, mid, deep */
  railEdge: string;
  shadow: string;                  /* tinted shadow colour, as rgba */
}

export const LOOKS: WorldLook[] = [
  { /* 1 TILT: sunshine, electric-blue rails */
    name: 'TILT',
    sky: ['#fff35c', '#ffc93c', '#ff8f3c'],
    blobs: ['rgba(255, 77, 166, 0.30)', 'rgba(77, 216, 255, 0.28)', 'rgba(140, 255, 90, 0.22)'],
    frame: ['#ffffff', '#fff1f8'],
    glow: 'rgba(255, 70, 160, 0.38)',
    interior: ['#fffdf6', '#f4efff'],
    grid: 'rgba(150, 120, 255, 0.10)',
    rail: ['#7cc4ff', '#4a6cff', '#3a2fd6'],
    railEdge: 'rgba(40, 20, 170, 0.55)',
    shadow: 'rgba(110, 40, 170, 0.20)'
  },
  { /* 2 GATES: bubblegum, royal-violet rails */
    name: 'GATES',
    sky: ['#ffc2e6', '#ff8ccb', '#ff5fa2'],
    blobs: ['rgba(255, 240, 90, 0.35)', 'rgba(90, 230, 255, 0.30)', 'rgba(255, 255, 255, 0.35)'],
    frame: ['#ffffff', '#fff0fa'],
    glow: 'rgba(120, 60, 255, 0.36)',
    interior: ['#fffafd', '#fbefff'],
    grid: 'rgba(255, 80, 170, 0.10)',
    rail: ['#c4a8ff', '#8550ff', '#5320d8'],
    railEdge: 'rgba(60, 10, 160, 0.55)',
    shadow: 'rgba(160, 30, 120, 0.20)'
  },
  { /* 3 WEIGHT: mint and aqua, tangerine rails */
    name: 'WEIGHT',
    sky: ['#d2ffe9', '#7ff2cf', '#2fd3c4'],
    blobs: ['rgba(255, 230, 90, 0.38)', 'rgba(255, 120, 190, 0.26)', 'rgba(255, 255, 255, 0.4)'],
    frame: ['#ffffff', '#effffa'],
    glow: 'rgba(255, 138, 31, 0.40)',
    interior: ['#fbfffd', '#eefcf8'],
    grid: 'rgba(30, 180, 160, 0.12)',
    rail: ['#ffc98a', '#ff8a1f', '#d65200'],
    railEdge: 'rgba(160, 60, 0, 0.55)',
    shadow: 'rgba(20, 120, 120, 0.20)'
  },
  { /* 4 BOUNCE: lime, grape rails */
    name: 'BOUNCE',
    sky: ['#f4ff8a', '#c4f74a', '#72e04a'],
    blobs: ['rgba(255, 90, 200, 0.28)', 'rgba(80, 220, 255, 0.30)', 'rgba(255, 255, 255, 0.4)'],
    frame: ['#ffffff', '#f8fff0'],
    glow: 'rgba(163, 71, 255, 0.38)',
    interior: ['#fdfff8', '#f3f8ff'],
    grid: 'rgba(120, 190, 40, 0.13)',
    rail: ['#dcb4ff', '#a347ff', '#6a1fd6'],
    railEdge: 'rgba(70, 10, 150, 0.55)',
    shadow: 'rgba(60, 120, 30, 0.20)'
  },
  { /* 5 MAGNETIC: electric lavender, hot-pink rails */
    name: 'MAGNETIC',
    sky: ['#e6d4ff', '#bb94ff', '#8f62ff'],
    blobs: ['rgba(80, 230, 255, 0.34)', 'rgba(255, 100, 200, 0.32)', 'rgba(255, 240, 120, 0.30)'],
    frame: ['#ffffff', '#f6f0ff'],
    glow: 'rgba(255, 61, 154, 0.42)',
    interior: ['#fdfbff', '#f2ecff'],
    grid: 'rgba(140, 90, 255, 0.13)',
    rail: ['#ffb0dc', '#ff3d9a', '#c4006a'],
    railEdge: 'rgba(150, 0, 80, 0.55)',
    shadow: 'rgba(90, 40, 180, 0.24)'
  },
  { /* 6 MASTER LAB: a rainbow, deep-blue rails */
    name: 'MASTER LAB',
    sky: ['#ffe95c', '#ff8ccb', '#5fd4ff'],
    blobs: ['rgba(140, 255, 90, 0.30)', 'rgba(255, 138, 31, 0.30)', 'rgba(163, 71, 255, 0.26)'],
    frame: ['#ffffff', '#f6f8ff'],
    glow: 'rgba(255, 210, 31, 0.50)',
    interior: ['#ffffff', '#f2f4ff'],
    grid: 'rgba(80, 120, 255, 0.11)',
    rail: ['#8ad0ff', '#3b6bff', '#2a22c4'],
    railEdge: 'rgba(30, 20, 150, 0.55)',
    shadow: 'rgba(80, 40, 170, 0.22)'
  },
  { /* 7 FILTERS: teal lagoon, coral rails */
    name: 'FILTERS',
    sky: ['#c8fff4', '#5fe8d6', '#19b8c4'],
    blobs: ['rgba(255, 120, 110, 0.32)', 'rgba(255, 236, 110, 0.32)', 'rgba(255, 255, 255, 0.4)'],
    frame: ['#ffffff', '#effffc'],
    glow: 'rgba(255, 100, 90, 0.42)',
    interior: ['#fbfffe', '#ecfbf9'],
    grid: 'rgba(20, 170, 170, 0.12)',
    rail: ['#ffc0b4', '#ff6f5e', '#d6352a'],
    railEdge: 'rgba(150, 20, 10, 0.55)',
    shadow: 'rgba(10, 110, 120, 0.22)'
  },
  { /* 8 ANCHOR: indigo dusk, gold rails */
    name: 'ANCHOR',
    sky: ['#b9b4ff', '#7a6cff', '#4b39d9'],
    blobs: ['rgba(255, 200, 60, 0.36)', 'rgba(255, 110, 200, 0.30)', 'rgba(120, 230, 255, 0.28)'],
    frame: ['#ffffff', '#f3f1ff'],
    glow: 'rgba(255, 196, 40, 0.50)',
    interior: ['#fdfcff', '#efedff'],
    grid: 'rgba(90, 70, 230, 0.13)',
    rail: ['#ffe89a', '#ffc21f', '#d68a00'],
    railEdge: 'rgba(140, 80, 0, 0.55)',
    shadow: 'rgba(60, 40, 170, 0.24)'
  },
  { /* 9 CRUMBLE: warm sand, magenta rails */
    name: 'CRUMBLE',
    sky: ['#fff1cc', '#ffd38a', '#ffa86b'],
    blobs: ['rgba(255, 60, 170, 0.28)', 'rgba(110, 220, 255, 0.28)', 'rgba(255, 255, 255, 0.4)'],
    frame: ['#ffffff', '#fff8ef'],
    glow: 'rgba(230, 30, 160, 0.40)',
    interior: ['#fffdf8', '#fbf3ea'],
    grid: 'rgba(210, 130, 40, 0.13)',
    rail: ['#ffa6e0', '#f02fb0', '#a8007a'],
    railEdge: 'rgba(120, 0, 80, 0.55)',
    shadow: 'rgba(160, 80, 20, 0.22)'
  },
  { /* 10 ORDER: ice blue, cherry rails */
    name: 'ORDER',
    sky: ['#eef9ff', '#b6e6ff', '#7cc8ff'],
    blobs: ['rgba(255, 70, 100, 0.26)', 'rgba(255, 255, 255, 0.5)', 'rgba(190, 150, 255, 0.28)'],
    frame: ['#ffffff', '#f2faff'],
    glow: 'rgba(255, 45, 85, 0.40)',
    interior: ['#fdfeff', '#eef6ff'],
    grid: 'rgba(60, 140, 230, 0.12)',
    rail: ['#ffa3b5', '#ff2d55', '#b8002e'],
    railEdge: 'rgba(130, 0, 30, 0.55)',
    shadow: 'rgba(30, 90, 170, 0.22)'
  },
  { /* 11 MACHINES: copper, cyan rails */
    name: 'MACHINES',
    sky: ['#ffd9b8', '#f2a06b', '#c96a3a'],
    blobs: ['rgba(60, 230, 255, 0.32)', 'rgba(255, 230, 120, 0.32)', 'rgba(255, 255, 255, 0.3)'],
    frame: ['#ffffff', '#fff5ee'],
    glow: 'rgba(0, 210, 255, 0.45)',
    interior: ['#fffcf9', '#f8efe8'],
    grid: 'rgba(200, 100, 40, 0.13)',
    rail: ['#a8f4ff', '#1fd0f0', '#0088b8'],
    railEdge: 'rgba(0, 80, 120, 0.55)',
    shadow: 'rgba(140, 60, 20, 0.24)'
  },
  { /* 12 GRAND LAB: full rainbow, midnight rails */
    name: 'GRAND LAB',
    sky: ['#ff8ccb', '#ffe95c', '#5fe8a0'],
    blobs: ['rgba(95, 212, 255, 0.36)', 'rgba(163, 71, 255, 0.30)', 'rgba(255, 90, 60, 0.28)'],
    frame: ['#ffffff', '#fbf6ff'],
    glow: 'rgba(163, 71, 255, 0.50)',
    interior: ['#ffffff', '#f5f1ff'],
    grid: 'rgba(163, 71, 255, 0.11)',
    rail: ['#9aa4ff', '#3f37c9', '#1d1580'],
    railEdge: 'rgba(20, 10, 100, 0.6)',
    shadow: 'rgba(90, 30, 160, 0.24)'
  }
];

export const GATE = { a: '#ff3d9a', b: '#ffffff', edge: 'rgba(170, 0, 90, 0.6)' };
export const BUTTON = { fill: '#ff3d9a', light: '#ff9ccc', dark: '#c4006a' };
export const PIT = { top: '#ff3dd8', deep: '#3a0a73', mid: '#8a1fc4' };
export const CONFETTI = ['#ffd21f', '#ff2d55', '#1fb6ff', '#5dea2a', '#a347ff', '#ff8a1f', '#ff3d9a', '#ffffff'];
