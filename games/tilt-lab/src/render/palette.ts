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
  }
];

export const GATE = { a: '#ff3d9a', b: '#ffffff', edge: 'rgba(170, 0, 90, 0.6)' };
export const BUTTON = { fill: '#ff3d9a', light: '#ff9ccc', dark: '#c4006a' };
export const PIT = { top: '#ff3dd8', deep: '#3a0a73', mid: '#8a1fc4' };
export const CONFETTI = ['#ffd21f', '#ff2d55', '#1fb6ff', '#5dea2a', '#a347ff', '#ff8a1f', '#ff3d9a', '#ffffff'];
