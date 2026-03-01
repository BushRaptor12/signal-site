export const runtime = "nodejs";

import { NextResponse } from "next/server";
import type { Story } from "@/app/lib/types";
import { formatStoryStoreError, listStories, upsertStory } from "@/app/lib/storyStore.server";

export async function GET() {
  try {
    const stories = await listStories();
    return NextResponse.json(stories);
  } catch (e: unknown) {
    return NextResponse.json(formatStoryStoreError("GET /api/stories failed", e), { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const incoming = (await req.json()) as Story;

    if (!incoming?.id || !incoming?.title) {
      return NextResponse.json(
        { error: "Story must include at least id and title." },
        { status: 400 }
      );
    }

    await upsertStory(incoming, { tolerantFileRead: true });

    return NextResponse.json({ ok: true, story: incoming });
  } catch (e: unknown) {
    return NextResponse.json(formatStoryStoreError("POST /api/stories failed", e), { status: 500 });
  }
}
