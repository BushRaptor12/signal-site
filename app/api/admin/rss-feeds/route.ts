import { NextResponse } from "next/server";
import { requestHasAdminAccess } from "@/app/lib/admin.server";
import { listAdminRssFeeds, upsertAdminRssFeed } from "@/app/lib/rss-discovery";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export async function GET(request: Request) {
  try {
    if (!(await requestHasAdminAccess(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const feeds = await listAdminRssFeeds();
    return NextResponse.json({ feeds });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "We couldn't load RSS feeds.") }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await requestHasAdminAccess(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      category?: unknown;
      enabled?: boolean;
      title?: unknown;
      url?: unknown;
    };
    const feed = await upsertAdminRssFeed({
      category: typeof body.category === "string" ? body.category : undefined,
      enabled: typeof body.enabled === "boolean" ? body.enabled : true,
      title: typeof body.title === "string" ? body.title : "",
      url: String(body.url ?? ""),
    });

    return NextResponse.json({ feed, ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "We couldn't save that RSS feed.") }, { status: 400 });
  }
}
