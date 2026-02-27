/**
 * Simple in-memory rate limiter.
 * 
 * WARNING: In serverless environments (like Vercel Lambdas), memory is isolated 
 * per function instance. This means that an attacker hitting multiple instances 
 * simultaneously will bypass this rate limit, making it effectively useless in production.
 * 
 * RECOMMENDED: In production, you should replace this with a distributed rate limiter 
 * using Upstash Redis (@vercel/kv) or a Supabase Postgres RPC function.
 * 
 * Example Vercel KV implementation:
 * import { kv } from '@vercel/kv';
 * // return await kv.set(...) // with expiry
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 60_000);

interface RateLimitOptions {
  /** Maximum requests allowed in the window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(
  key: string,
  options: RateLimitOptions
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    // New window
    store.set(key, {
      count: 1,
      resetAt: now + options.windowSeconds * 1000,
    });
    return { success: true, remaining: options.limit - 1, resetAt: now + options.windowSeconds * 1000 };
  }

  if (entry.count >= options.limit) {
    return { success: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { success: true, remaining: options.limit - entry.count, resetAt: entry.resetAt };
}

/**
 * Get a rate limit key from the request (IP-based).
 */
export function getRateLimitKey(request: Request, prefix: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return `${prefix}:${ip}`;
}
