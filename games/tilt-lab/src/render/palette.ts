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
  {
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
  }
];

export const GATE = { a: '#ff3d9a', b: '#ffffff', edge: 'rgba(170, 0, 90, 0.6)' };
export const BUTTON = { fill: '#ff3d9a', light: '#ff9ccc', dark: '#c4006a' };
export const PIT = { top: '#ff3dd8', deep: '#3a0a73', mid: '#8a1fc4' };
export const CONFETTI = ['#ffd21f', '#ff2d55', '#1fb6ff', '#5dea2a', '#a347ff', '#ff8a1f', '#ff3d9a', '#ffffff'];
