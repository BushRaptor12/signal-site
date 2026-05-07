export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requestHasAdminAccess } from "@/app/lib/admin.server";
import { checkRateLimit, rateLimitIdentifier, rateLimitResponse } from "@/app/lib/rate-limit";
import { clearAdminRssItems, getAdminRssDiscoveryData, scanAdminRssFeeds } from "@/app/lib/rss-discovery";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export async function GET(request: Request) {
  try {
    if (!(await requestHasAdminAccess(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const windowDays = Number(new URL(request.url).searchParams.get("windowDays") ?? "7");
    const data = await getAdminRssDiscoveryData({ windowDays });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "We couldn't load RSS discovery data.") }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const rateLimit = checkRateLimit({
      key: `admin:rss-scan:${rateLimitIdentifier(request)}`,
      limit: 6,
      windowMs: 15 * 60 * 1000,
    });
    if (rateLimit.limited) {
      return rateLimitResponse(rateLimit.retryAfter);
    }

    if (!(await requestHasAdminAccess(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { clearExisting?: unknown; feedIds?: unknown; windowDays?: unknown };
    const feedIds = Array.isArray(body.feedIds) ? body.feedIds.map(String) : undefined;
    if (body.clearExisting === true) {
      await clearAdminRssItems({ feedIds });
    }

    const result = await scanAdminRssFeeds({ feedIds });
    const data = await getAdminRssDiscoveryData({ windowDays: Number(body.windowDays ?? 7) });

    return NextResponse.json({ data, ok: true, result });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "We couldn't scan RSS feeds.") }, { status: 500 });
  }
}
