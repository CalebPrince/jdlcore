import "server-only";

const LIMIT = 20;
const WINDOW_MS = 60 * 60 * 1000;

const buckets = new Map<string, { windowStart: number; count: number }>();

/** Simple in-memory per-IP hourly rate limit. Resets on server restart; per-instance only. */
export function rateLimit(key: string): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  let entry = buckets.get(key);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    entry = { windowStart: now, count: 0 };
    buckets.set(key, entry);
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) {
        if (now - v.windowStart >= WINDOW_MS) buckets.delete(k);
      }
    }
  }
  if (entry.count >= LIMIT) {
    return { ok: false, retryAfterSec: Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000) };
  }
  entry.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "local";
}
