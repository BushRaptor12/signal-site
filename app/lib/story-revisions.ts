import { supabaseServer } from "@/app/lib/supabase.server";
import { coerceStory, type StoryDbRow } from "@/app/lib/stories";
import type { Source } from "@/app/lib/types";

export type StoryRevisionAction = "deleted" | "restored" | "saved" | "update" | "correction";

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

export type PublicStoryTimelineEntry = {
  action: StoryRevisionAction;
  createdAt: string;
  id: string;
  summary: string[];
  sources: Source[];
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
    .limit(Math.max(1, Math.min(limit, 2000)));

  if (error) {
    if (/relation .* does not exist/i.test(error.message)) {
      return [] as StoryRevision[];
    }

    throw new Error(error.message);
  }

  return ((data ?? []) as StoryRevisionRow[]).map(toStoryRevision);
}

export async function listPublicStoryTimeline(storyId: string) {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("story_revisions")
    .select("id, story_id, actor_user_id, action, created_at, snapshot")
    .eq("story_id", storyId)
    .in("action", ["saved", "update", "correction", "restored"])
    .order("created_at", { ascending: true })
    .limit(2000);

  if (error) {
    if (/relation .* does not exist/i.test(error.message)) return [] as PublicStoryTimelineEntry[];
    throw new Error(error.message);
  }

  const timeline: PublicStoryTimelineEntry[] = [];
  let previousSummary: string | null = null;
  let previousSources: string | null = null;
  for (const row of (data ?? []) as StoryRevisionRow[]) {
    const story = coerceStory(row.snapshot);
    const summary = story.summary;
    const serializedSummary = JSON.stringify(summary);
    const serializedSources = JSON.stringify(story.sources);
    if (
      summary.length &&
      row.action !== "deleted" &&
      (serializedSummary !== previousSummary || serializedSources !== previousSources)
    ) {
      timeline.push({ action: row.action, createdAt: row.created_at, id: row.id, summary, sources: story.sources });
    }
    previousSummary = serializedSummary;
    previousSources = serializedSources;
  }
  return timeline;
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

export async function correctStoryRevision(
  revisionId: string,
  actorUserId: string,
  changes: Partial<StoryDbRow>
) {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("story_revisions")
    .select("id, story_id, actor_user_id, action, created_at, snapshot")
    .eq("id", revisionId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("That revision no longer exists.");

  const revision = data as StoryRevisionRow;
  if (revision.action === "deleted") throw new Error("Deleted story revisions cannot be corrected.");

  const previous = revision.snapshot;
  const snapshot = {
    ...previous,
    ...changes,
    id: revision.story_id,
    created_at: previous.created_at,
    updated_at: previous.updated_at,
    content_updated_at: previous.content_updated_at,
    comments: previous.comments,
    views: previous.views,
  } satisfies StoryDbRow;

  const { data: updated, error: updateError } = await supabase
    .from("story_revisions")
    .update({ action: "correction", actor_user_id: actorUserId, snapshot })
    .eq("id", revisionId)
    .select("id, story_id, actor_user_id, action, created_at, snapshot")
    .single();

  if (updateError) throw new Error(updateError.message);
  return toStoryRevision(updated as StoryRevisionRow);
}
