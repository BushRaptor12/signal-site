export const runtime = "nodejs";

import { NextResponse } from "next/server";
import type { Story } from "@/app/lib/types";
import {
  deleteStoryById,
  formatStoryStoreError,
  getStoryById,
  upsertStory,
} from "@/app/lib/storyStore.server";

function isAuthorized(req: Request) {
  const token = req.headers.get("x-admin-token");
  return token && token === process.env.ADMIN_TOKEN;
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const existing = await getStoryById(id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const incoming = (await req.json()) as Story;
    incoming.id = existing.id;

    await upsertStory(incoming);
    return NextResponse.json({ ok: true, story: incoming });
  } catch (e: unknown) {
    return NextResponse.json(formatStoryStoreError("PUT /api/admin/stories/[id] failed", e), {
      status: 500,
    });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await deleteStoryById(id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(formatStoryStoreError("DELETE /api/admin/stories/[id] failed", e), {
      status: 500,
    });
  }
}
