export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { formatStoryStoreError, getStoryById } from "@/app/lib/storyStore.server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const found = await getStoryById(id);

    if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(found);
  } catch (e: unknown) {
    return NextResponse.json(formatStoryStoreError("GET /api/stories/[id] failed", e), { status: 500 });
  }
}
