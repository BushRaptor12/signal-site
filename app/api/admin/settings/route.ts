import { NextRequest, NextResponse } from "next/server";
import { getAdminAccountFromRequest } from "@/app/lib/admin.server";
import { getCommunitySettings, updateCommunitySettings } from "@/app/lib/community-settings";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminAccountFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await getCommunitySettings();
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "We couldn't load site settings.") }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await getAdminAccountFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      allowCommentRealtime?: boolean;
      allowCommentReplies?: boolean;
      allowCommentVoting?: boolean;
      allowNewComments?: boolean;
      commentsReadOnly?: boolean;
    };

    const settings = await updateCommunitySettings(
      {
        allowCommentRealtime: typeof body.allowCommentRealtime === "boolean" ? body.allowCommentRealtime : undefined,
        allowCommentReplies: typeof body.allowCommentReplies === "boolean" ? body.allowCommentReplies : undefined,
        allowCommentVoting: typeof body.allowCommentVoting === "boolean" ? body.allowCommentVoting : undefined,
        allowNewComments: typeof body.allowNewComments === "boolean" ? body.allowNewComments : undefined,
        commentsReadOnly: typeof body.commentsReadOnly === "boolean" ? body.commentsReadOnly : undefined,
      },
      admin.userId
    );

    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    const message = errorMessage(error, "We couldn't update site settings.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
