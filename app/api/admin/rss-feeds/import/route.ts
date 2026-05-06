import { NextResponse } from "next/server";
import { requestHasAdminAccess } from "@/app/lib/admin.server";
import { importAdminRssOpml } from "@/app/lib/rss-discovery";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export async function POST(request: Request) {
  try {
    if (!(await requestHasAdminAccess(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { opml?: unknown };
    const opml = String(body.opml ?? "").trim();
    if (!opml) {
      return NextResponse.json({ error: "Paste the OPML file contents first." }, { status: 400 });
    }

    const result = await importAdminRssOpml(opml);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "We couldn't import that OPML file.") }, { status: 400 });
  }
}
