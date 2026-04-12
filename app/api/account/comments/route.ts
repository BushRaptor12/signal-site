import { NextRequest, NextResponse } from "next/server";
import { getAccountUserIdFromCookieHeader } from "@/app/lib/account.server";
import { listAccountCommentHistory } from "@/app/lib/comments";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const userId = getAccountUserIdFromCookieHeader(request.headers.get("cookie"));
    if (!userId) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const limit = parsePositiveInt(request.nextUrl.searchParams.get("limit"), 10);
    const offset = parsePositiveInt(request.nextUrl.searchParams.get("offset"), 0);
    const result = await listAccountCommentHistory(userId, { limit, offset });

    return NextResponse.json({
      comments: result.comments,
      hasMore: offset + result.comments.length < result.totalCount,
      totalCount: result.totalCount,
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "We couldn't load comment history.") }, { status: 500 });
  }
}
