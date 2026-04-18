import { NextResponse } from "next/server";
import { getAccountUserId, getFollowedInterests, getFollowedStoryIds } from "@/app/lib/account.server";

export async function GET() {
  try {
    const userId = await getAccountUserId();
    if (!userId) {
      return NextResponse.json({
        authenticated: false,
        interests: [],
        storyIds: [],
      });
    }

    const [storyIds, interests] = await Promise.all([getFollowedStoryIds(userId), getFollowedInterests(userId)]);
    return NextResponse.json({
      authenticated: true,
      interests,
      storyIds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn't load followed stories.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
