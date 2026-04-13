import { supabaseServer } from "@/app/lib/supabase.server";
import { coerceStory, type StoryDbRow } from "@/app/lib/stories";

export type StoryRevisionAction = "deleted" | "restored" | "saved";

type StoryRevisionRow = {
  action: StoryRevisionAction;
  actor_user_id: string | null;
  created_at: string;
  id: string;
  snapshot: StoryDbRow;
  story_id: string;
};

export type StoryRevision = {
  action: StoryRevisionAction;
  actorUserId: string | null;
  createdAt: string;
  id: string;
  story: ReturnType<typeof coerceStory>;
  storyId: string;
};

function toStoryRevision(row: StoryRevisionRow): StoryRevision {
  return {
    action: row.action,
    actorUserId: row.actor_user_id,
    createdAt: row.created_at,
    id: row.id,
    story: coerceStory(row.snapshot),
    storyId: row.story_id,
  };
}

export async function recordStoryRevision(input: {
  action: StoryRevisionAction;
  actorUserId: string | null;
  snapshot: StoryDbRow;
  storyId: string;
}) {
  const supabase = supabaseServer();
  const { error } = await supabase.from("story_revisions").insert({
    action: input.action,
    actor_user_id: input.actorUserId,
    snapshot: input.snapshot,
    story_id: input.storyId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function listStoryRevisions(storyId: string, limit = 15) {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("story_revisions")
    .select("id, story_id, actor_user_id, action, created_at, snapshot")
    .eq("story_id", storyId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 30)));

  if (error) {
    if (/relation .* does not exist/i.test(error.message)) {
      return [] as StoryRevision[];
    }

    throw new Error(error.message);
  }

  return ((data ?? []) as StoryRevisionRow[]).map(toStoryRevision);
}

export async function restoreStoryRevision(revisionId: string, actorUserId: string) {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("story_revisions")
    .select("id, story_id, actor_user_id, action, created_at, snapshot")
    .eq("id", revisionId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("That revision no longer exists.");
  }

  const revision = data as StoryRevisionRow;
  const snapshot = {
    ...revision.snapshot,
    updated_at: new Date().toISOString(),
  } satisfies StoryDbRow;

  const { error: upsertError } = await supabase.from("stories").upsert(snapshot, { onConflict: "id" });
  if (upsertError) {
    throw new Error(upsertError.message);
  }

  await recordStoryRevision({
    action: "restored",
    actorUserId,
    snapshot,
    storyId: revision.story_id,
  });

  return coerceStory(snapshot);
}
