import { createHash } from "node:crypto";
import { coerceStory, type StoryDbRow } from "@/app/lib/stories";
import { supabaseServer } from "@/app/lib/supabase.server";
import type { Story, StoryWithViews } from "@/app/lib/types";

export const SENTENCE_TRANSFORMER_MODEL = "all-MiniLM-L6-v2";
const SENTENCE_TRANSFORMER_REPO = "Xenova/all-MiniLM-L6-v2";

export type EmbeddingState = "pending" | "ready" | "error";

type EmbeddingExtractor = (
  input: string,
  options: { normalize: true; pooling: "mean" }
) => Promise<{ data: Float32Array | number[] }>;

type StoryEmbeddingShape = Pick<
  Story | StoryWithViews,
  "entities" | "primary_entities" | "sources" | "summary" | "tags" | "title" | "topics"
>;

type StoredInterestEmbeddingRow = {
  embedding: number[] | string | null;
  normalized_query: string | null;
  query: string | null;
};

type StoredStoryEmbeddingRow = {
  embedding: number[] | string | null;
  story_id: string;
};

type InterestSearchProfile = {
  conceptGroups: Set<string>[];
  normalizedQuery: string;
  rawQuery: string;
  phrases: Set<string>;
  tokens: Set<string>;
  wordCount: number;
};

type StorySearchProfile = {
  allTerms: Set<string>;
  allText: string;
  entityTerms: Set<string>;
  sourceTerms: Set<string>;
  summaryTerms: Set<string>;
  tagTerms: Set<string>;
  titleTerms: Set<string>;
  topicTerms: Set<string>;
};

let featureExtractorPromise: Promise<EmbeddingExtractor> | null = null;

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

const CONCEPT_EXPANSIONS: Record<string, string[]> = {
  ai: ["artificial intelligence", "machine learning", "openai", "nvidia", "automation", "chatbots", "models"],
  "artificial intelligence": ["ai", "machine learning", "openai", "nvidia", "chatbots", "models"],
  business: ["businesses", "company", "companies", "corporate", "earnings", "startup", "startups", "markets", "ceo"],
  businesses: ["business", "company", "companies", "corporate", "earnings", "startup", "startups", "markets", "ceo"],
  california: [
    "sacramento",
    "los angeles",
    "san francisco",
    "bay area",
    "silicon valley",
    "san diego",
    "oakland",
    "anaheim",
    "golden state warriors",
    "lakers",
    "dodgers",
    "49ers",
    "giants",
    "padres",
    "angels",
    "kings",
    "clippers",
  ],
  economy: ["economic", "economics", "inflation", "jobs", "labor", "gdp", "rates", "recession", "growth", "consumer"],
  entertainment: ["hollywood", "film", "movie", "movies", "tv", "television", "music", "celebrity"],
  finance: ["bank", "banks", "banking", "wall street", "stocks", "stock market", "markets", "investing"],
  google: ["alphabet", "search", "android", "ai"],
  microsoft: ["windows", "azure", "enterprise software", "ai"],
  nvidia: ["ai", "chips", "semiconductors", "gpu", "gpus"],
  oil: ["crude", "energy", "petroleum", "gas", "gasoline"],
  openai: ["ai", "artificial intelligence", "chatgpt", "models"],
  politics: ["political", "election", "elections", "campaign", "campaigns", "congress", "senate", "house", "governor", "policy"],
  shipping: ["maritime", "ports", "cargo", "freight", "trade route", "sea lane"],
  sports: ["sport", "athletics", "team", "teams", "league", "leagues", "game", "games", "season", "playoffs", "nba", "nfl", "mlb", "nhl", "soccer", "football", "basketball", "baseball", "hockey"],
  technology: ["tech", "software", "hardware", "chips", "chip", "semiconductor", "internet", "platform", "platforms", "apps"],
  trump: ["donald trump", "president trump", "white house"],
  world: ["international", "global", "foreign", "diplomatic", "geopolitics"],
};

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

function singularizeToken(token: string) {
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

function tokenizeText(value: string) {
  const tokens = normalizeInterestQuery(value)
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const output = new Set<string>();

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

function expandConceptPhrases(value: string) {
  const normalizedValue = normalizeInterestQuery(value);
  const output = new Set<string>();
  const seeds = new Set<string>([normalizedValue]);

  for (const token of tokenizeText(normalizedValue)) {
    seeds.add(token);
  }

  for (const seed of seeds) {
    const expansions = CONCEPT_EXPANSIONS[seed] ?? [];
    for (const expansion of expansions) {
      const normalizedExpansion = normalizeInterestQuery(expansion);
      if (normalizedExpansion) {
        output.add(normalizedExpansion);
      }
    }
  }

  return [...output];
}

function collectConceptPhrases(values: string[]) {
  return uniqueNonEmpty(values.flatMap((value) => [value, ...expandConceptPhrases(value)]));
}

function createTermSet(values: string[]) {
  const terms = new Set<string>();

  for (const value of values) {
    for (const token of tokenizeText(value)) {
      terms.add(token);
    }
  }

  return terms;
}

function buildConceptGroups(normalizedQuery: string) {
  const rawTokens = normalizeInterestQuery(normalizedQuery)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !STOP_WORDS.has(token));

  return rawTokens.map((token) => {
    const group = new Set<string>();
    for (const term of tokenizeText(token)) {
      group.add(term);
    }
    for (const phrase of expandConceptPhrases(token)) {
      for (const term of tokenizeText(phrase)) {
        group.add(term);
      }
    }
    return group;
  }).filter((group) => group.size > 0);
}

function buildInterestSearchProfile(query: string, normalizedQuery = normalizeInterestQuery(query)): InterestSearchProfile {
  const phrases = new Set<string>([normalizedQuery]);
  for (const phrase of expandConceptPhrases(normalizedQuery)) {
    phrases.add(phrase);
  }

  const tokens = new Set<string>();
  for (const phrase of phrases) {
    for (const token of tokenizeText(phrase)) {
      tokens.add(token);
    }
  }

  return {
    conceptGroups: buildConceptGroups(normalizedQuery),
    normalizedQuery,
    rawQuery: query.trim(),
    phrases,
    tokens,
    wordCount: tokenizeText(normalizedQuery).size,
  };
}

function buildStorySearchProfile(story: StoryEmbeddingShape): StorySearchProfile {
  const sourceTitles = story.sources.map((source) => [source.name, source.title ?? ""].join(" - "));
  const entityTokens = story.entities.flatMap((entity) => [entity.name, ...entity.aliases]);
  const titleValues = collectConceptPhrases([story.title]);
  const summaryValues = collectConceptPhrases(story.summary);
  const topicValues = collectConceptPhrases(story.topics);
  const entityValues = collectConceptPhrases([...story.primary_entities, ...entityTokens]);
  const sourceValues = collectConceptPhrases(sourceTitles);
  const tagValues = collectConceptPhrases(story.tags);
  const titleTerms = createTermSet(titleValues);
  const summaryTerms = createTermSet(summaryValues);
  const topicTerms = createTermSet(topicValues);
  const entityTerms = createTermSet(entityValues);
  const sourceTerms = createTermSet(sourceValues);
  const tagTerms = createTermSet(tagValues);

  return {
    allTerms: new Set<string>([
      ...titleTerms,
      ...summaryTerms,
      ...topicTerms,
      ...entityTerms,
      ...sourceTerms,
      ...tagTerms,
    ]),
    allText: normalizeInterestQuery([
      story.title,
      ...story.summary,
      ...story.topics,
      ...story.primary_entities,
      ...entityTokens,
      ...story.tags,
      ...sourceTitles,
      ...titleValues,
      ...summaryValues,
      ...topicValues,
      ...entityValues,
      ...tagValues,
    ].join(" ")),
    entityTerms,
    sourceTerms,
    summaryTerms,
    tagTerms,
    titleTerms,
    topicTerms,
  };
}

function countSharedTerms(left: Set<string>, right: Set<string>) {
  let count = 0;

  for (const term of left) {
    if (right.has(term)) {
      count += 1;
    }
  }

  return count;
}

function countCoveredConceptGroups(conceptGroups: Set<string>[], storyTerms: Set<string>) {
  let coveredGroups = 0;

  for (const group of conceptGroups) {
    for (const term of group) {
      if (storyTerms.has(term)) {
        coveredGroups += 1;
        break;
      }
    }
  }

  return coveredGroups;
}

export function toEmbeddingState(value: string | null | undefined): EmbeddingState {
  if (value === "ready" || value === "error") {
    return value;
  }

  return "pending";
}

export function buildInterestEmbeddingInput(query: string) {
  const normalizedQuery = normalizeInterestQuery(query);
  const searchProfile = buildInterestSearchProfile(query, normalizedQuery);
  const expansionPhrases = [...searchProfile.phrases].filter((phrase) => phrase !== normalizedQuery);

  if (searchProfile.wordCount <= 3 && expansionPhrases.length > 0) {
    return uniqueNonEmpty([query.trim(), ...expansionPhrases]).join("\n");
  }

  return query.trim();
}

export function buildStoryEmbeddingInput(story: StoryEmbeddingShape) {
  const sourceTitles = story.sources.map((source) => [source.name, source.title ?? ""].join(" - "));
  const entityTokens = story.entities.flatMap((entity) => [entity.name, ...entity.aliases]);
  const conceptPhrases = collectConceptPhrases([
    ...story.topics,
    ...story.primary_entities,
    ...entityTokens,
    ...story.tags,
  ]);

  return uniqueNonEmpty([
    `Headline ${story.title}`,
    ...story.summary.map((line) => `Summary ${line}`),
    ...story.topics.map((topic) => `Topic ${topic}`),
    ...story.primary_entities.map((entity) => `Entity ${entity}`),
    ...entityTokens.map((entity) => `Alias ${entity}`),
    ...story.tags.map((tag) => `Tag ${tag}`),
    ...sourceTitles.map((sourceTitle) => `Source ${sourceTitle}`),
    ...conceptPhrases,
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

function scoreInterestAgainstStory(
  interestEmbedding: number[] | null,
  interestProfile: InterestSearchProfile,
  storyEmbedding: number[] | null,
  storyProfile: StorySearchProfile,
  similarityThreshold: number
) {
  const semanticSimilarity = interestEmbedding && storyEmbedding ? cosineSimilarity(interestEmbedding, storyEmbedding) : 0;
  const exactPhraseMatch = storyProfile.allText.includes(interestProfile.normalizedQuery);
  const expandedPhraseMatches = [...interestProfile.phrases]
    .filter((phrase) => phrase !== interestProfile.normalizedQuery && phrase.includes(" ") && storyProfile.allText.includes(phrase))
    .length;
  const titleMatches = countSharedTerms(interestProfile.tokens, storyProfile.titleTerms);
  const topicMatches = countSharedTerms(interestProfile.tokens, storyProfile.topicTerms);
  const entityMatches = countSharedTerms(interestProfile.tokens, storyProfile.entityTerms);
  const summaryMatches = countSharedTerms(interestProfile.tokens, storyProfile.summaryTerms);
  const sourceMatches = countSharedTerms(interestProfile.tokens, storyProfile.sourceTerms);
  const tagMatches = countSharedTerms(interestProfile.tokens, storyProfile.tagTerms);
  const allMatches = countSharedTerms(interestProfile.tokens, storyProfile.allTerms);
  const coveredConceptGroups = countCoveredConceptGroups(interestProfile.conceptGroups, storyProfile.allTerms);
  const needsCompoundCoverage = interestProfile.conceptGroups.length >= 2;
  const hasCompoundCoverage = !needsCompoundCoverage || coveredConceptGroups >= 2;
  const overlapRatio = allMatches / Math.max(2, Math.min(interestProfile.tokens.size, interestProfile.wordCount <= 2 ? 5 : 7));
  const hybridScore =
    semanticSimilarity
    + (exactPhraseMatch ? 0.2 : 0)
    + Math.min(expandedPhraseMatches, 2) * 0.08
    + Math.min(titleMatches, 3) * 0.08
    + Math.min(topicMatches, 2) * 0.1
    + Math.min(entityMatches, 3) * 0.09
    + Math.min(summaryMatches, 3) * 0.04
    + Math.min(sourceMatches, 2) * 0.03
    + Math.min(tagMatches, 2) * 0.04
    + Math.min(interestProfile.wordCount <= 2 ? 0.22 : 0.16, overlapRatio * (interestProfile.wordCount <= 2 ? 0.3 : 0.18));
  const shortInterest = interestProfile.wordCount <= 2;
  const noEmbedding = !interestEmbedding;
  const semanticFloor = shortInterest ? Math.max(0.12, similarityThreshold - 0.04) : similarityThreshold;
  const strongSemantic = semanticSimilarity >= (shortInterest ? 0.18 : 0.22);
  const structuredSignal =
    hasCompoundCoverage
    && (
      exactPhraseMatch
      || expandedPhraseMatches > 0
      || titleMatches > 0
      || topicMatches > 0
      || entityMatches > 0
      || tagMatches > 0
      || allMatches >= (shortInterest ? 2 : 3)
    );
  const minimumHybridScore = noEmbedding ? (shortInterest ? 0.28 : 0.26) : shortInterest ? 0.34 : 0.3;
  const structuredOnlyMatch =
    noEmbedding
    && hasCompoundCoverage
    && hybridScore >= minimumHybridScore
    && (
      exactPhraseMatch
      || expandedPhraseMatches > 0
      || (topicMatches > 0 && (entityMatches > 0 || titleMatches > 0 || tagMatches > 0))
      || (allMatches >= (shortInterest ? 3 : 4))
    );

  return {
    matched:
      structuredOnlyMatch
      || (strongSemantic && (!needsCompoundCoverage || hasCompoundCoverage || semanticSimilarity >= 0.32))
      || ((semanticSimilarity >= semanticFloor || structuredSignal) && hybridScore >= minimumHybridScore),
    score: hybridScore,
  };
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
    const embedding = await generateEmbedding(buildInterestEmbeddingInput(query));
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
        .select("query, normalized_query, embedding")
        .eq("user_id", userId)
        .select("query, normalized_query, embedding"),
      supabase
        .from("story_embeddings")
        .select("story_id, embedding")
        .eq("embedding_state", "ready")
        .not("embedding", "is", null),
      supabase.from("stories").select("*").eq("status", "published"),
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

    const publishedStories = ((storyRows ?? []) as StoryDbRow[]).map(coerceStory);
    const publishedStoryIds = new Set(publishedStories.map((story) => story.id));
    const parsedInterestEmbeddings: Array<{ embedding: number[] | null; profile: InterestSearchProfile }> = ((interestRows ?? []) as StoredInterestEmbeddingRow[])
      .map((row) => {
        const embedding = parsePgVector(row.embedding);
        const query = String(row.query ?? "").trim();
        const normalizedQuery = normalizeInterestQuery(String(row.normalized_query ?? query));
        if (!embedding || !query || !normalizedQuery) {
          if (!query || !normalizedQuery) {
            return null;
          }

          return {
            embedding: null,
            profile: buildInterestSearchProfile(query, normalizedQuery),
          };
        }

        return {
          embedding: embedding ?? null,
          profile: buildInterestSearchProfile(query, normalizedQuery),
        };
      })
      .filter((row): row is { embedding: number[] | null; profile: InterestSearchProfile } => row !== null);
    const parsedStoryEmbeddings = ((storyEmbeddingRows ?? []) as StoredStoryEmbeddingRow[])
      .map((row) => ({
        embedding: parsePgVector(row.embedding),
        storyId: String(row.story_id),
      }))
      .filter(
        (row): row is { embedding: number[]; storyId: string } =>
          Boolean(row.embedding) && publishedStoryIds.has(row.storyId)
      );
    const storyProfiles = new Map<string, StorySearchProfile>(
      publishedStories.map((story) => [story.id, buildStorySearchProfile(story)])
    );
    const scoredStories = new Map<string, number>();

    for (const interest of parsedInterestEmbeddings) {
      const nearestStories = parsedStoryEmbeddings
        .map((row) => {
          const storyProfile = storyProfiles.get(row.storyId);
          if (!storyProfile) return null;

          const { matched, score } = scoreInterestAgainstStory(
            interest.embedding,
            interest.profile,
            row.embedding,
            storyProfile,
            similarityThreshold
          );

          if (!matched) return null;

          return {
            score,
            storyId: row.storyId,
          };
        })
        .filter((row): row is { score: number; storyId: string } => Boolean(row))
        .sort((left, right) => right.score - left.score)
        .slice(0, matchCountPerInterest);

      for (const match of nearestStories) {
        const current = scoredStories.get(match.storyId) ?? 0;
        if (match.score > current) {
          scoredStories.set(match.storyId, match.score);
        }
      }
    }

    return [...scoredStories.entries()].sort((left, right) => right[1] - left[1]).map(([storyId]) => storyId);
  } catch (error) {
    if (relationMissing(error, "user_interest_follows") || relationMissing(error, "story_embeddings")) {
      return [];
    }

    throw error;
  }
}
