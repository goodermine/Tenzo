/* HOLDOUT - vibration, where the phone has it (Android browsers do; iOS
   Safari does not expose it, so there this is silently a no-op). Throttled:
   a buzz on every kill would be noise, so only events that matter buzz. */
export class Haptics {
  constructor() {
    this.enabled = true;
    this.supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
    this.until = 0;
  }

  buzz(pattern, priority = false) {
    if (!this.enabled || !this.supported) return;
    const now = performance.now();
    if (!priority && now < this.until) return;
    const len = Array.isArray(pattern) ? pattern.reduce((a, b) => a + b, 0) : pattern;
    this.until = now + len + 60;
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      this.supported = false;
    }
  }
}
