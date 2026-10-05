/* HOLDOUT - persistence. localStorage can be missing, full, or throw (private
   browsing, storage disabled), so every access is guarded and the game runs
   on defaults when it fails. The blob is versioned so a later update can
   migrate old saves instead of discarding them. */
const KEY = 'holdout.save';
const VERSION = 1;

const DEFAULTS = () => ({
  version: VERSION,
  settings: { sound: true, haptics: true, fps: false, bloom: 'auto' },
  best: { seconds: 0, kills: 0, level: 0 }
});

export function load() {
  const base = DEFAULTS();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const data = JSON.parse(raw);
    return {
      ...base,
      ...data,
      settings: { ...base.settings, ...(data.settings || {}) },
      best: { ...base.best, ...(data.best || {}) },
      version: VERSION
    };
  } catch (e) {
    return base;
  }
}

export function store(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}
