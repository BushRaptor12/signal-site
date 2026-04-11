import { NextResponse } from "next/server";
import { getAccountUserId, markStorySeen, setStoryFollow } from "@/app/lib/account.server";

type StoryStateActionRequest = {
  action?: "follow" | "unfollow" | "mark_seen";
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAccountUserId();
    if (!userId) {
      return NextResponse.json({ error: "You must be logged in first." }, { status: 401 });
    }

    const storyId = (await params).id?.trim();
    if (!storyId) {
      return NextResponse.json({ error: "Story id is required." }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as StoryStateActionRequest;
    if (body.action === "follow") {
      await setStoryFollow(userId, storyId, true);
      return NextResponse.json({ following: true, ok: true });
    }

    if (body.action === "unfollow") {
      await setStoryFollow(userId, storyId, false);
      return NextResponse.json({ following: false, ok: true });
    }

    if (body.action === "mark_seen") {
      await markStorySeen(userId, storyId);
      return NextResponse.json({ ok: true, seen: true });
    }

    return NextResponse.json({ error: "Unknown story action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn't update that story.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
