// Per-connection abuse limits: a token bucket for message rates and a
// violation counter that gets a client kicked.

export class RateLimiter {
  constructor(perSecond, burst = perSecond) {
    this.rate = perSecond;
    this.burst = burst;
    this.tokens = burst;
    this.last = Date.now();
  }

  take(n = 1) {
    const now = Date.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }
}

export class Violations {
  constructor(limit = 10, windowMs = 10000) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.stamps = [];
    this.total = 0;
  }

  // Returns true once the client has earned a kick.
  add(reason, log = console.warn) {
    const now = Date.now();
    this.total++;
    this.stamps = this.stamps.filter((t) => now - t < this.windowMs);
    this.stamps.push(now);
    log(`[violation] ${reason} (${this.stamps.length}/${this.limit})`);
    return this.stamps.length >= this.limit;
  }
}

// Names are shown to other players: trim, strip control characters, cap length.
export function cleanName(raw, fallback = 'Player') {
  const s = String(raw ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16);
  return s || fallback;
}
