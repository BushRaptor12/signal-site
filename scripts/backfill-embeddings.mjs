import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { env, pipeline } from "@xenova/transformers";
import { NON_SINGULAR_TOKENS, PHRASE_KNOWLEDGE, TERM_KNOWLEDGE } from "../app/lib/interest-knowledge.js";

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

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

const NON_SINGULAR_TOKEN_SET = new Set(NON_SINGULAR_TOKENS);

function normalizeInterestQuery(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function singularizeToken(token) {
  if (NON_SINGULAR_TOKEN_SET.has(token)) {
    return token;
  }

  if (token.endsWith("ies") && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.endsWith("es") && token.length > 4) {
    return token.slice(0, -2);
  }

  if (token.endsWith("s") && token.length > 3 && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }

  return token;
}

function tokenizeText(value) {
  const tokens = normalizeInterestQuery(value)
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const output = new Set();

  for (const token of tokens) {
    if (STOP_WORDS.has(token)) continue;
    output.add(token);

    const singular = singularizeToken(token);
    if (singular && !STOP_WORDS.has(singular)) {
      output.add(singular);
    }
  }

  return output;
}

function expandConceptPhrases(value) {
  const normalizedValue = normalizeInterestQuery(value);
  const output = new Set();
  const seeds = new Set([normalizedValue]);

  for (const expansion of PHRASE_KNOWLEDGE[normalizedValue] ?? []) {
    const normalizedExpansion = normalizeInterestQuery(expansion);
    if (normalizedExpansion) {
      output.add(normalizedExpansion);
    }
  }

  for (const token of tokenizeText(normalizedValue)) {
    seeds.add(token);
  }

  for (const seed of seeds) {
    const expansions = TERM_KNOWLEDGE[seed] ?? [];
    for (const expansion of expansions) {
      const normalizedExpansion = normalizeInterestQuery(expansion);
      if (normalizedExpansion) {
        output.add(normalizedExpansion);
      }
    }
  }

  return [...output];
}

function uniqueNonEmpty(values) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

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

function collectConceptPhrases(values) {
  return uniqueNonEmpty(values.flatMap((value) => [value, ...expandConceptPhrases(value)]));
}

function buildInterestEmbeddingInput(query) {
  const normalizedQuery = normalizeInterestQuery(query);
  const phrases = new Set([normalizedQuery]);

  for (const phrase of expandConceptPhrases(normalizedQuery)) {
    phrases.add(phrase);
  }

  if (tokenizeText(normalizedQuery).size <= 3 && phrases.size > 1) {
    return uniqueNonEmpty([String(query ?? "").trim(), ...phrases]).join("\n");
  }

  return String(query ?? "").trim();
}

function buildStoryEmbeddingInput(row) {
  const entities = toEntities(row.entities);
  const sources = toSources(row.sources);
  const entityTokens = entities.flatMap((entity) => [entity.name, ...entity.aliases]);
  const sourceTitles = sources.map((source) => [source.name, source.title].join(" - "));
  const conceptPhrases = collectConceptPhrases([
    ...toStringArray(row.topics),
    ...toStringArray(row.primary_entities),
    ...entityTokens,
    ...toStringArray(row.tags),
  ]);

  return uniqueNonEmpty([
    `Headline ${String(row.title ?? "")}`,
    ...toStringArray(row.summary).map((line) => `Summary ${line}`),
    ...toStringArray(row.topics).map((topic) => `Topic ${topic}`),
    ...toStringArray(row.primary_entities).map((entity) => `Entity ${entity}`),
    ...entityTokens.map((entity) => `Alias ${entity}`),
    ...toStringArray(row.tags).map((tag) => `Tag ${tag}`),
    ...sourceTitles.map((sourceTitle) => `Source ${sourceTitle}`),
    ...conceptPhrases,
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
    .select("id, title, summary, topics, primary_entities, entities, sources, tags")
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
    .select("id, query")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  let updatedCount = 0;
  for (const interest of interests ?? []) {
    const embedding = await generateEmbedding(buildInterestEmbeddingInput(String(interest.query ?? "")));
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
