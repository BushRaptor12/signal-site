import { NextResponse } from "next/server";
import { getAccountUserId, getFollowedInterestsWithMatches, getFollowedStoryIds, getSemanticFollowedStoryIds } from "@/app/lib/account.server";

export async function GET() {
  try {
    const userId = await getAccountUserId();
    if (!userId) {
      return NextResponse.json({
        authenticated: false,
        interests: [],
        semanticStoryIds: [],
        storyIds: [],
      });
    }

    const [storyIds, interests, semanticStoryIds] = await Promise.all([
      getFollowedStoryIds(userId),
      getFollowedInterestsWithMatches(userId),
      getSemanticFollowedStoryIds(userId),
    ]);
    return NextResponse.json({
      authenticated: true,
      interests,
      semanticStoryIds,
      storyIds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn't load followed stories.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
