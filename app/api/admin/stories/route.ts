export const runtime = "nodejs";

import { NextResponse } from "next/server";
import type { Story } from "@/app/lib/types";
import { formatStoryStoreError, upsertStory } from "@/app/lib/storyStore.server";

function isAuthorized(req: Request) {
  const token = req.headers.get("x-admin-token");
  return token && token === process.env.ADMIN_TOKEN;
}

export async function POST(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
    return NextResponse.json(formatStoryStoreError("POST /api/admin/stories failed", e), {
      status: 500,
    });
  }
}
