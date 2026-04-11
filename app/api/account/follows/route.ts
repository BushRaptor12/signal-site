import { NextResponse } from "next/server";
import { getAccountUserId, getFollowedStoryIds } from "@/app/lib/account.server";

export async function GET() {
  try {
    const userId = await getAccountUserId();
    if (!userId) {
      return NextResponse.json({
        authenticated: false,
        storyIds: [],
      });
    }

    const storyIds = await getFollowedStoryIds(userId);
    return NextResponse.json({
      authenticated: true,
      storyIds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn't load followed stories.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
