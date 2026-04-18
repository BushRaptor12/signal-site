import { getAccountUserId, getFollowedInterestsWithMatches, getFollowedStoryIds, getSemanticFollowedStoryIds } from "@/app/lib/account.server";
import { supabaseServer } from "@/app/lib/supabase.server";
import { coerceStory, type StoryDbRow } from "@/app/lib/stories";
import type { StoryWithViews } from "@/app/lib/types";
import HomePageClient from "./home-page-client";

async function loadInitialStories(): Promise<StoryWithViews[]> {
  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("stories")
      .select("*")
      .eq("status", "published")
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false });

    if (error) {
      throw error;
    }

    return ((data ?? []) as StoryDbRow[]).map(coerceStory);
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const [initialStories, userId] = await Promise.all([loadInitialStories(), getAccountUserId()]);
  const initialFollowedStoryIds = userId ? await getFollowedStoryIds(userId).catch(() => []) : [];
  const initialFollowedInterests = userId ? await getFollowedInterestsWithMatches(userId).catch(() => []) : [];
  const initialSemanticStoryIds = userId ? await getSemanticFollowedStoryIds(userId).catch(() => []) : [];

  return (
    <HomePageClient
      initialStories={initialStories}
      initialAccountAuthenticated={Boolean(userId)}
      initialFollowedInterests={initialFollowedInterests}
      initialSemanticStoryIds={initialSemanticStoryIds}
      initialFollowedStoryIds={initialFollowedStoryIds}
    />
  );
}
