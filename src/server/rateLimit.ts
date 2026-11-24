/** Tiny in-memory token bucket / fixed-window limiter. */
export class RateLimiter {
  private hits = new Map<string, { count: number; reset: number }>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const h = this.hits.get(key);
    if (!h || now >= h.reset) {
      this.hits.set(key, { count: 1, reset: now + this.windowMs });
      if (this.hits.size > 5000) this.sweep(now);
      return true;
    }
    h.count += 1;
    return h.count <= this.max;
  }

  private sweep(now: number) {
    for (const [k, v] of this.hits) if (now >= v.reset) this.hits.delete(k);
  }
}
