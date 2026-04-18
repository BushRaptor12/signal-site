import { createHash } from "node:crypto";
import type { Story, StoryWithViews } from "@/app/lib/types";
import { supabaseServer } from "@/app/lib/supabase.server";

export const SENTENCE_TRANSFORMER_MODEL = "all-MiniLM-L6-v2";
const SENTENCE_TRANSFORMER_REPO = "Xenova/all-MiniLM-L6-v2";

export type EmbeddingState = "pending" | "ready" | "error";

type EmbeddingExtractor = (
  input: string,
  options: { normalize: true; pooling: "mean" }
) => Promise<{ data: Float32Array | number[] }>;

type StoryEmbeddingShape = Pick<Story | StoryWithViews, "entities" | "primary_entities" | "sources" | "summary" | "title" | "topics">;

type StoredInterestEmbeddingRow = {
  embedding: number[] | string | null;
};

type StoredStoryEmbeddingRow = {
  embedding: number[] | string | null;
  story_id: string;
};

let featureExtractorPromise: Promise<EmbeddingExtractor> | null = null;

function uniqueNonEmpty(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function relationMissing(error: unknown, relationName: string) {
  return error instanceof Error && new RegExp(`relation .*${relationName}.* does not exist`, "i").test(error.message);
}

async function getFeatureExtractor() {
  if (!featureExtractorPromise) {
    featureExtractorPromise = (async () => {
      const { env, pipeline } = await import("@xenova/transformers");
      env.allowLocalModels = false;
      env.useBrowserCache = false;
      return (await pipeline("feature-extraction", SENTENCE_TRANSFORMER_REPO, { quantized: true })) as EmbeddingExtractor;
    })();
  }

  return featureExtractorPromise;
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

export function toPgVectorLiteral(values: number[]) {
  return `[${values.map((value) => (Number.isFinite(value) ? value : 0)).join(",")}]`;
}

export function parsePgVector(value: number[] | string | null | undefined) {
  if (!value) return null;
  if (Array.isArray(value)) {
    const numbers = value.map((item) => Number(item)).filter((item) => Number.isFinite(item));
    return numbers.length > 0 ? numbers : null;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;

  const numbers = trimmed
    .slice(1, -1)
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));

  return numbers.length > 0 ? numbers : null;
}

export function cosineSimilarity(left: number[], right: number[]) {
  const size = Math.min(left.length, right.length);
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < size; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (!leftMagnitude || !rightMagnitude) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export async function generateEmbedding(value: string) {
  const extractor = await getFeatureExtractor();
  const result = await extractor(value, {
    normalize: true,
    pooling: "mean",
  });

  return Array.from(result.data as Float32Array);
}

export async function updateInterestEmbeddingRecord(interestId: string, query: string) {
  const supabase = supabaseServer();
  const nowIso = new Date().toISOString();

  try {
    const embedding = await generateEmbedding(query);
    const { error } = await supabase
      .from("user_interest_follows")
      .update({
        embedding: toPgVectorLiteral(embedding),
        embedding_model: SENTENCE_TRANSFORMER_MODEL,
        embedding_state: "ready",
        embedding_updated_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", Number(interestId));

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    if (relationMissing(error, "user_interest_follows")) {
      return;
    }

    try {
      await supabase
        .from("user_interest_follows")
        .update({
          embedding: null,
          embedding_model: SENTENCE_TRANSFORMER_MODEL,
          embedding_state: "error",
          embedding_updated_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", Number(interestId));
    } catch {
      // ignore writeback failures after embedding errors
    }
  }
}

export async function upsertStoryEmbeddingRecord(storyId: string, story: StoryEmbeddingShape) {
  const supabase = supabaseServer();
  const embeddingInput = buildStoryEmbeddingInput(story);
  const contentHash = createEmbeddingContentHash(embeddingInput);
  const nowIso = new Date().toISOString();

  try {
    const { error } = await supabase.from("story_embeddings").upsert(
      {
        story_id: storyId,
        embedding_input: embeddingInput,
        content_hash: contentHash,
        embedding_model: SENTENCE_TRANSFORMER_MODEL,
        embedding_state: "pending",
        updated_at: nowIso,
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

  try {
    const embedding = await generateEmbedding(embeddingInput);
    const { error } = await supabase
      .from("story_embeddings")
      .update({
        embedding: toPgVectorLiteral(embedding),
        embedding_model: SENTENCE_TRANSFORMER_MODEL,
        embedding_state: "ready",
        updated_at: nowIso,
      })
      .eq("story_id", storyId);

    if (error) {
      throw new Error(error.message);
    }
  } catch {
    try {
      await supabase
        .from("story_embeddings")
        .update({
          embedding: null,
          embedding_model: SENTENCE_TRANSFORMER_MODEL,
          embedding_state: "error",
          updated_at: nowIso,
        })
        .eq("story_id", storyId);
    } catch {
      // ignore writeback failures after embedding errors
    }
  }
}

export async function getSemanticStoryIdsForUser(
  userId: string,
  options?: {
    matchCountPerInterest?: number;
    similarityThreshold?: number;
  }
) {
  const supabase = supabaseServer();
  const similarityThreshold = options?.similarityThreshold ?? 0.18;
  const matchCountPerInterest = options?.matchCountPerInterest ?? 24;

  try {
    const [
      { data: interestRows, error: interestError },
      { data: storyEmbeddingRows, error: storyEmbeddingError },
      { data: storyRows, error: storyError },
    ] = await Promise.all([
      supabase
        .from("user_interest_follows")
        .select("embedding")
        .eq("user_id", userId)
        .eq("embedding_state", "ready")
        .not("embedding", "is", null),
      supabase
        .from("story_embeddings")
        .select("story_id, embedding")
        .eq("embedding_state", "ready")
        .not("embedding", "is", null),
      supabase.from("stories").select("id").eq("status", "published"),
    ]);

    if (interestError) {
      throw new Error(interestError.message);
    }
    if (storyEmbeddingError) {
      throw new Error(storyEmbeddingError.message);
    }
    if (storyError) {
      throw new Error(storyError.message);
    }

    const publishedStoryIds = new Set((storyRows ?? []).map((row) => String((row as { id: string }).id)));
    const parsedInterestEmbeddings = ((interestRows ?? []) as StoredInterestEmbeddingRow[])
      .map((row) => parsePgVector(row.embedding))
      .filter((embedding): embedding is number[] => Boolean(embedding));
    const parsedStoryEmbeddings = ((storyEmbeddingRows ?? []) as StoredStoryEmbeddingRow[])
      .map((row) => ({
        embedding: parsePgVector(row.embedding),
        storyId: String(row.story_id),
      }))
      .filter(
        (row): row is { embedding: number[]; storyId: string } =>
          Boolean(row.embedding) && publishedStoryIds.has(row.storyId)
      );

    const scoredStories = new Map<string, number>();

    for (const interestEmbedding of parsedInterestEmbeddings) {
      const nearestStories = parsedStoryEmbeddings
        .map((row) => ({
          similarity: cosineSimilarity(interestEmbedding, row.embedding),
          storyId: row.storyId,
        }))
        .filter((row) => row.similarity >= similarityThreshold)
        .sort((left, right) => right.similarity - left.similarity)
        .slice(0, matchCountPerInterest);

      for (const match of nearestStories) {
        const current = scoredStories.get(match.storyId) ?? 0;
        if (match.similarity > current) {
          scoredStories.set(match.storyId, match.similarity);
        }
      }
    }

    return [...scoredStories.entries()].sort((left, right) => right[1] - left[1]).map(([storyId]) => storyId);
  } catch (error) {
    if (
      relationMissing(error, "user_interest_follows")
      || relationMissing(error, "story_embeddings")
    ) {
      return [];
    }

    throw error;
  }
}
