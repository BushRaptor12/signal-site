import { NextRequest, NextResponse } from "next/server";
import { getAccountUserIdFromCookieHeader } from "@/app/lib/account.server";
import { createComment, listStoryComments, parseCommentSort } from "@/app/lib/comments";
import { getCommunitySettings } from "@/app/lib/community-settings";
import { checkRateLimit, rateLimitIdentifier, rateLimitResponse } from "@/app/lib/rate-limit";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ storyId: string }> }) {
  try {
    const storyId = (await params).storyId?.trim();
    if (!storyId) {
      return NextResponse.json({ error: "Story id is required." }, { status: 400 });
    }

    const sort = parseCommentSort(request.nextUrl.searchParams.get("sort"));
    const userId = getAccountUserIdFromCookieHeader(request.headers.get("cookie"));
    const [result, settings] = await Promise.all([listStoryComments(storyId, sort, userId), getCommunitySettings()]);
    return NextResponse.json({ comments: result.comments, communitySettings: settings, sort, totalCount: result.totalCount });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "We couldn't load comments.") }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ storyId: string }> }) {
  try {
    const rateLimit = checkRateLimit({
      key: `comments:create:${rateLimitIdentifier(request)}`,
      limit: 20,
      windowMs: 10 * 60 * 1000,
    });
    if (rateLimit.limited) {
      return rateLimitResponse(rateLimit.retryAfter);
    }

    const storyId = (await params).storyId?.trim();
    if (!storyId) {
      return NextResponse.json({ error: "Story id is required." }, { status: 400 });
    }

    const userId = getAccountUserIdFromCookieHeader(request.headers.get("cookie"));
    if (!userId) {
      return NextResponse.json({ error: "You must be signed in to comment." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      body?: string;
      parentCommentId?: string | null;
    };

    const created = await createComment({
      body: body.body ?? "",
      parentCommentId: body.parentCommentId,
      storyId,
      userId,
    });

    return NextResponse.json({ commentId: created.id, ok: true }, { status: 201 });
  } catch (error) {
    const message = errorMessage(error, "We couldn't save your comment.");
    const status =
      /signed in|required|moderation|posting too quickly|daily comment limit|disabled|read-only|muted|cannot use community/i.test(message)
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
