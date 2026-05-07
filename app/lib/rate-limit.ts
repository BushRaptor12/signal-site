type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

export function rateLimitIdentifier(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown"
  );
}

export function checkRateLimit({ key, limit, windowMs }: RateLimitOptions) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, remaining: Math.max(0, limit - 1), retryAfter: 0 };
  }

  if (bucket.count >= limit) {
    return {
      limited: true,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return {
    limited: false,
    remaining: Math.max(0, limit - bucket.count),
    retryAfter: 0,
  };
}

export function rateLimitResponse(retryAfter: number) {
  return Response.json(
    { error: "Too many requests. Please try again shortly." },
    {
      headers: { "Retry-After": String(retryAfter) },
      status: 429,
    }
  );
}
