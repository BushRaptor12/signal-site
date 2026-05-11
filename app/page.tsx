import { getAccountUserId, getFollowedInterestsWithMatches, getFollowedStoryIds } from "@/app/lib/account.server";
import { supabaseServer } from "@/app/lib/supabase.server";
import { coerceStory, STORY_CARD_SELECT, type StoryDbRow } from "@/app/lib/stories";
import type { StoryWithViews } from "@/app/lib/types";
import HomePageClient from "./home-page-client";

async function loadInitialStories(): Promise<StoryWithViews[]> {
  try {
    const supabase = supabaseServer();
    const [trackingResult, feedResult] = await Promise.all([
      supabase
        .from("stories")
        .select(STORY_CARD_SELECT)
        .eq("status", "published")
        .eq("pinned", true)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false }),
      supabase
        .from("stories")
        .select(STORY_CARD_SELECT)
        .eq("status", "published")
        .eq("pinned", false)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(30),
    ]);

    if (trackingResult.error) {
      throw trackingResult.error;
    }
    if (feedResult.error) {
      throw feedResult.error;
    }

    return ([...(trackingResult.data ?? []), ...(feedResult.data ?? [])] as unknown as StoryDbRow[]).map(coerceStory);
  } catch {
    return [];
  }
}

function serverRenderNowMs() {
  return Date.now();
}

export default async function HomePage() {
  const [initialStories, userId] = await Promise.all([loadInitialStories(), getAccountUserId()]);
  const initialFollowedStoryIds = userId ? await getFollowedStoryIds(userId).catch(() => []) : [];
  const initialFollowedInterests = userId ? await getFollowedInterestsWithMatches(userId).catch(() => []) : [];
  const initialNowMs = serverRenderNowMs();

  return (
    <HomePageClient
      initialStories={initialStories}
      initialAccountAuthenticated={Boolean(userId)}
      initialFollowedInterests={initialFollowedInterests}
      initialFollowedStoryIds={initialFollowedStoryIds}
      initialNowMs={initialNowMs}
    />
  );
}
