import { NextRequest, NextResponse } from "next/server";
import { getAccountUserIdFromCookieHeader } from "@/app/lib/account.server";
import { setCommentVote } from "@/app/lib/comments";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const commentId = (await params).id?.trim();
    if (!commentId) {
      return NextResponse.json({ error: "Comment id is required." }, { status: 400 });
    }

    const userId = getAccountUserIdFromCookieHeader(request.headers.get("cookie"));
    if (!userId) {
      return NextResponse.json({ error: "You must be signed in to vote." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { vote?: number };
    const vote = body.vote === -1 ? -1 : body.vote === 1 ? 1 : 0;
    await setCommentVote({ commentId, userId, vote });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = errorMessage(error, "We couldn't update your vote.");
    const status = /signed in|required|cannot vote|no longer exists|voting too quickly/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
