/**
 * A sliding-window counter for new alerts, held in memory.
 * Context: a restart empties it, which the plan accepts; the limit only bounds how fast one process starts paid
 * model runs.
 */
export interface RateLimiter {
  /**
   * Seconds until `count` more alerts would fit, or `undefined` when they fit now. Never records anything.
   * Hazard: a request larger than the limit never fits, so its answer is the full window and retrying cannot help.
   */
  retryAfter(count: number): number | undefined;
  /** Counts `count` alerts accepted now. */
  record(count: number): void;
}

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  now: () => number;
}): RateLimiter {
  const { limit, windowMs, now } = options;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`alert rate limit must be a whole number of at least 1, got ${limit}`);
  }
  let accepted: number[] = [];
  // An alert counts until it is `windowMs` old, so a slot frees exactly at its age of one window.
  const prune = () => {
    const cutoff = now() - windowMs;
    accepted = accepted.filter((at) => at > cutoff);
  };
  return {
    retryAfter(count) {
      prune();
      const excess = accepted.length + count - limit;
      if (excess <= 0) return undefined;
      // The `excess`-th oldest counted alert must expire before the request fits; with none that can free
      // enough slots the wait is the whole window.
      const blocker = accepted[excess - 1];
      const waitMs = blocker === undefined ? windowMs : blocker + windowMs - now();
      return Math.min(Math.max(Math.ceil(waitMs / 1000), 1), Math.ceil(windowMs / 1000));
    },
    record(count) {
      const at = now();
      for (let i = 0; i < count; i++) accepted.push(at);
    },
  };
}
