import { NextRequest, NextResponse } from "next/server";
import { getAdminAccountFromRequest } from "@/app/lib/admin.server";
import { correctStoryRevision, listStoryRevisions, restoreStoryRevision } from "@/app/lib/story-revisions";
import type { StoryDbRow } from "@/app/lib/stories";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminAccountFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const storyId = request.nextUrl.searchParams.get("storyId")?.trim() ?? "";
    if (!storyId) {
      return NextResponse.json({ error: "Story id is required." }, { status: 400 });
    }

    const revisions = await listStoryRevisions(storyId, 2000);
    return NextResponse.json({ revisions });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "We couldn't load story revisions.") }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await getAdminAccountFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { mode?: string; revisionId?: string; story?: Partial<StoryDbRow> };
    const revisionId = String(body.revisionId ?? "").trim();
    if (!revisionId) {
      return NextResponse.json({ error: "Revision id is required." }, { status: 400 });
    }

    if (body.mode === "correct") {
      if (!body.story || !Array.isArray(body.story.summary) || !Array.isArray(body.story.sources)) {
        return NextResponse.json({ error: "A corrected summary and source list are required." }, { status: 400 });
      }
      const revision = await correctStoryRevision(revisionId, admin.userId, body.story);
      return NextResponse.json({ ok: true, revision });
    }

    const story = await restoreStoryRevision(revisionId, admin.userId);
    return NextResponse.json({ ok: true, story });
  } catch (error) {
    const message = errorMessage(error, "We couldn't restore that revision.");
    const status = /required|no longer exists|cannot be corrected/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
