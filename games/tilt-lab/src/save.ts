/* TILT LAB - progress and settings, in localStorage. Storage can be
   missing or throw (private browsing, blocked); the game then runs on
   defaults and simply does not remember. */
const KEY = 'tiltlab.save';

export interface Save {
  done: string[];      /* level ids cleared */
  last: string | null; /* the level PLAY continues from */
  sound: boolean;
  music: boolean;
  motion: boolean;
  worlds: number[];    /* world intros already shown */
}

const DEFAULTS = (): Save => ({ done: [], last: null, sound: true, music: true, motion: false, worlds: [] });

export function load(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS();
    const d = JSON.parse(raw);
    return { ...DEFAULTS(), ...d, done: Array.isArray(d.done) ? d.done : [], worlds: Array.isArray(d.worlds) ? d.worlds : [] };
  } catch (_) {
    return DEFAULTS();
  }
}

export function store(s: Save) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) { /* not available */ }
}
