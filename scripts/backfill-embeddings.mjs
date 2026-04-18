import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { env, pipeline } from "@xenova/transformers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

env.allowLocalModels = false;
env.useBrowserCache = false;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
  quantized: true,
});

function toStringArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function toEntities(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      return {
        aliases: toStringArray(item.aliases),
        name: item.name ? String(item.name) : "",
      };
    })
    .filter((item) => item && item.name);
}

function toSources(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      return {
        name: item.name ? String(item.name) : "",
        title: item.title ? String(item.title) : "",
      };
    })
    .filter((item) => item && item.name);
}

function uniqueNonEmpty(values) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function buildStoryEmbeddingInput(row) {
  const entities = toEntities(row.entities);
  const sources = toSources(row.sources);

  return uniqueNonEmpty([
    String(row.title ?? ""),
    ...toStringArray(row.summary),
    ...toStringArray(row.topics),
    ...toStringArray(row.primary_entities),
    ...entities.flatMap((entity) => [entity.name, ...entity.aliases]),
    ...sources.map((source) => [source.name, source.title].join(" - ")),
  ]).join("\n");
}

function contentHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function toPgVectorLiteral(values) {
  return `[${values.map((value) => (Number.isFinite(value) ? value : 0)).join(",")}]`;
}

async function generateEmbedding(value) {
  const result = await extractor(value, {
    normalize: true,
    pooling: "mean",
  });

  return Array.from(result.data);
}

async function backfillStories() {
  const { data: stories, error } = await supabase
    .from("stories")
    .select("id, title, summary, topics, primary_entities, entities, sources")
    .eq("status", "published")
    .order("updated_at", { ascending: false, nullsFirst: false });

  if (error) {
    throw new Error(error.message);
  }

  let updatedCount = 0;
  for (const story of stories ?? []) {
    const embeddingInput = buildStoryEmbeddingInput(story);
    const nextHash = contentHash(embeddingInput);
    const { data: existing, error: existingError } = await supabase
      .from("story_embeddings")
      .select("content_hash")
      .eq("story_id", story.id)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (existing?.content_hash === nextHash) {
      continue;
    }

    const embedding = await generateEmbedding(embeddingInput);
    const { error: upsertError } = await supabase.from("story_embeddings").upsert(
      {
        story_id: story.id,
        embedding: toPgVectorLiteral(embedding),
        embedding_input: embeddingInput,
        content_hash: nextHash,
        embedding_model: "all-MiniLM-L6-v2",
        embedding_state: "ready",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "story_id", ignoreDuplicates: false }
    );

    if (upsertError) {
      throw new Error(upsertError.message);
    }

    updatedCount += 1;
    console.log(`embedded story ${story.id}`);
  }

  return updatedCount;
}

async function backfillInterests() {
  const { data: interests, error } = await supabase
    .from("user_interest_follows")
    .select("id, query, embedding_state, embedding")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  let updatedCount = 0;
  for (const interest of interests ?? []) {
    if (interest.embedding_state === "ready" && interest.embedding) {
      continue;
    }

    const embedding = await generateEmbedding(String(interest.query ?? ""));
    const { error: updateError } = await supabase
      .from("user_interest_follows")
      .update({
        embedding: toPgVectorLiteral(embedding),
        embedding_model: "all-MiniLM-L6-v2",
        embedding_state: "ready",
        embedding_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", interest.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    updatedCount += 1;
    console.log(`embedded interest ${interest.id}`);
  }

  return updatedCount;
}

const storyCount = await backfillStories();
const interestCount = await backfillInterests();

console.log(`story embeddings updated: ${storyCount}`);
console.log(`interest embeddings updated: ${interestCount}`);
