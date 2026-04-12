import { NextRequest, NextResponse } from "next/server";
import { getAccountProfileByUserId, getAccountUserIdFromCookieHeader } from "@/app/lib/account.server";
import { removeCommentAsAdmin, updateComment } from "@/app/lib/comments";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const commentId = (await params).id?.trim();
    if (!commentId) {
      return NextResponse.json({ error: "Comment id is required." }, { status: 400 });
    }

    const userId = getAccountUserIdFromCookieHeader(request.headers.get("cookie"));
    if (!userId) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { body?: string };
    await updateComment({
      body: body.body ?? "",
      commentId,
      userId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = errorMessage(error, "We couldn't update that comment.");
    const status = /signed in|required|only edit your own|only be edited|cannot be edited|no longer exists/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const commentId = (await params).id?.trim();
    if (!commentId) {
      return NextResponse.json({ error: "Comment id is required." }, { status: 400 });
    }

    const userId = getAccountUserIdFromCookieHeader(request.headers.get("cookie"));
    if (!userId) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const profile = await getAccountProfileByUserId(userId);
    if (!profile?.isAdmin) {
      return NextResponse.json({ error: "Admin access is required." }, { status: 403 });
    }

    await removeCommentAsAdmin(commentId, userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = errorMessage(error, "We couldn't remove that comment.");
    const status = /required|no longer exists/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
