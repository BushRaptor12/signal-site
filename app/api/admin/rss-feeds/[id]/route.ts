import { NextResponse } from "next/server";
import { requestHasAdminAccess } from "@/app/lib/admin.server";
import { deleteAdminRssFeed, updateAdminRssFeed } from "@/app/lib/rss-discovery";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await requestHasAdminAccess(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = (await params).id?.trim();
    if (!id) {
      return NextResponse.json({ error: "Feed id is required." }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      category?: unknown;
      enabled?: unknown;
      title?: unknown;
      url?: unknown;
    };
    const feed = await updateAdminRssFeed(id, {
      category: typeof body.category === "string" ? body.category : undefined,
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      title: typeof body.title === "string" ? body.title : undefined,
      url: typeof body.url === "string" ? body.url : undefined,
    });

    return NextResponse.json({ feed, ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "We couldn't update that RSS feed.") }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await requestHasAdminAccess(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = (await params).id?.trim();
    if (!id) {
      return NextResponse.json({ error: "Feed id is required." }, { status: 400 });
    }

    await deleteAdminRssFeed(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "We couldn't remove that RSS feed.") }, { status: 400 });
  }
}
