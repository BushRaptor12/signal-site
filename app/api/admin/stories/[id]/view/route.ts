export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { formatStoryStoreError, incrementStoryViews } from "@/app/lib/storyStore.server";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = (await params).id;
    const views = await incrementStoryViews(id);
    if (views === null) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, views });
  } catch (e: unknown) {
    return NextResponse.json(formatStoryStoreError("POST /api/admin/stories/[id]/view failed", e), {
      status: 500,
    });
  }
}
