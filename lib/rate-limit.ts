const buckets = new Map<string, { count: number; resetAt: number }>();

async function anonymousKey(request: Request, scope: string) {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const day = new Date().toISOString().slice(0, 10);
  const secret = process.env.RATE_LIMIT_SALT || "local-rate-limit-salt";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${secret}:${day}:${ip}:${scope}`));
  return Array.from(new Uint8Array(digest).slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function enforceRateLimit(request: Request, scope: string, limit: number, windowMs = 60_000) {
  const key = await anonymousKey(request, scope);
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return Response.json({ error: "You’ve hit the short-term limit. Give it a minute and try again." }, { status: 429, headers: { "Retry-After": String(Math.ceil((bucket.resetAt - now) / 1000)) } });
  }
  return null;
}
