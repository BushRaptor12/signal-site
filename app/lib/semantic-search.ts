import { createHash } from "node:crypto";
import type { Story, StoryWithViews } from "@/app/lib/types";
import { supabaseServer } from "@/app/lib/supabase.server";

export const SENTENCE_TRANSFORMER_MODEL = "all-MiniLM-L6-v2";

export type EmbeddingState = "pending" | "ready" | "error";

type StoryEmbeddingShape = Pick<Story | StoryWithViews, "entities" | "primary_entities" | "sources" | "summary" | "title" | "topics">;

function uniqueNonEmpty(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function relationMissing(error: unknown, relationName: string) {
  return error instanceof Error && new RegExp(`relation .*${relationName}.* does not exist`, "i").test(error.message);
}

export function normalizeInterestQuery(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function toEmbeddingState(value: string | null | undefined): EmbeddingState {
  if (value === "ready" || value === "error") {
    return value;
  }

  return "pending";
}

export function buildStoryEmbeddingInput(story: StoryEmbeddingShape) {
  const sourceTitles = story.sources.map((source) => [source.name, source.title ?? ""].join(" - "));
  const entityTokens = story.entities.flatMap((entity) => [entity.name, ...entity.aliases]);

  return uniqueNonEmpty([
    story.title,
    ...story.summary,
    ...story.topics,
    ...story.primary_entities,
    ...entityTokens,
    ...sourceTitles,
  ]).join("\n");
}

export function createEmbeddingContentHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function upsertStoryEmbeddingRecord(storyId: string, story: StoryEmbeddingShape) {
  const supabase = supabaseServer();
  const embeddingInput = buildStoryEmbeddingInput(story);
  const contentHash = createEmbeddingContentHash(embeddingInput);

  try {
    const { error } = await supabase.from("story_embeddings").upsert(
      {
        story_id: storyId,
        embedding_input: embeddingInput,
        content_hash: contentHash,
        embedding_model: SENTENCE_TRANSFORMER_MODEL,
        embedding_state: "pending",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "story_id", ignoreDuplicates: false }
    );

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    if (relationMissing(error, "story_embeddings")) {
      return;
    }

    throw error;
  }
}
