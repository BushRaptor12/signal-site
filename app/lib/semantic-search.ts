import { createHash } from "node:crypto";
import {
  CONCEPT_INTENT_MAP,
  CONCEPT_VALUE_IDS,
  NON_SINGULAR_TOKENS,
  PHRASE_INTENT_MAP,
  PHRASE_KNOWLEDGE,
  TERM_CONCEPT_IDS,
  TERM_KNOWLEDGE,
} from "@/app/lib/interest-knowledge";
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
  "entities" | "facets" | "industries" | "locations" | "offices" | "organizations" | "people" | "primary_entities" | "sources" | "sports_teams" | "summary" | "tags" | "title" | "topics"
>;

type StoredInterestEmbeddingRow = {
  id?: number | string | null;
  embedding: number[] | string | null;
  exclude_keywords?: string[] | null;
  match_keywords?: string[] | null;
  normalized_query: string | null;
  query: string | null;
};

type StoredStoryEmbeddingRow = {
  embedding: number[] | string | null;
  story_id: string;
};

type StoredInterestStoryFeedbackRow = {
  interest_id: number | string;
  story_id: string;
};

type ConceptGroup = {
  label: string;
  terms: Set<string>;
};

type InterestSearchProfile = {
  conceptGroups: ConceptGroup[];
  excludeKeywords: string[];
  intentDimensions: IntentDimension[];
  matchKeywords: string[];
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
  facetTerms: Set<string>;
  industryTerms: Set<string>;
  locationTerms: Set<string>;
  officeTerms: Set<string>;
  organizationTerms: Set<string>;
  peopleTerms: Set<string>;
  sourceTerms: Set<string>;
  sportsTeamTerms: Set<string>;
  summaryTerms: Set<string>;
  tagTerms: Set<string>;
  titleTerms: Set<string>;
  topicTerms: Set<string>;
};

type StoryTermSetKey =
  | "entityTerms"
  | "facetTerms"
  | "industryTerms"
  | "locationTerms"
  | "officeTerms"
  | "organizationTerms"
  | "peopleTerms"
  | "sourceTerms"
  | "sportsTeamTerms"
  | "summaryTerms"
  | "tagTerms"
  | "titleTerms"
  | "topicTerms";

type ConceptIntentDefinition = {
  id: string;
  intent: {
    dimension: string;
    label: string;
    storyFields: StoryTermSetKey[];
  } | null;
  values: string[];
};

type IntentDimension = {
  conceptIds: string[];
  dimension: string;
  fields: StoryTermSetKey[];
  label: string;
  terms: Set<string>;
};

export type SemanticStoryMatch = {
  reasons: string[];
  score: number;
  storyId: string;
};

export type SemanticInterestStoryMatches = {
  hiddenCount: number;
  hiddenStoryIds: string[];
  interestId: string;
  matches: SemanticStoryMatch[];
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

const NON_SINGULAR_TOKEN_SET = new Set<string>(NON_SINGULAR_TOKENS);
const CONCEPT_INTENTS = CONCEPT_INTENT_MAP as Record<string, ConceptIntentDefinition>;
const CONCEPT_VALUE_MAP = CONCEPT_VALUE_IDS as Record<string, string[]>;
const TERM_CONCEPT_MAP = TERM_CONCEPT_IDS as Record<string, string[]>;
const PHRASE_INTENT_CONCEPT_MAP = PHRASE_INTENT_MAP as Record<string, string[]>;
const TERM_EXPANSION_MAP = TERM_KNOWLEDGE as Record<string, string[]>;
const PHRASE_EXPANSION_MAP = PHRASE_KNOWLEDGE as Record<string, string[]>;

function uniqueNonEmpty(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function toDisplayLabel(value: string) {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
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

  for (const expansion of PHRASE_EXPANSION_MAP[normalizedValue] ?? []) {
    const normalizedExpansion = normalizeInterestQuery(expansion);
    if (normalizedExpansion) {
      output.add(normalizedExpansion);
    }
  }

  for (const token of tokenizeText(normalizedValue)) {
    seeds.add(token);
  }

  for (const seed of seeds) {
    const expansions = TERM_EXPANSION_MAP[seed] ?? [];
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

function normalizeKeywordList(values: string[]) {
  return uniqueNonEmpty(values.map((value) => normalizeInterestQuery(value)));
}

function buildConceptGroups(normalizedQuery: string) {
  const rawTokens = normalizeInterestQuery(normalizedQuery)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !STOP_WORDS.has(token));

  return rawTokens.map((token) => {
    const terms = new Set<string>();
    for (const term of tokenizeText(token)) {
      terms.add(term);
    }
    for (const phrase of expandConceptPhrases(token)) {
      for (const term of tokenizeText(phrase)) {
        terms.add(term);
      }
    }
    return {
      label: token,
      terms,
    };
  }).filter((group) => group.terms.size > 0);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function toConceptTerms(conceptIds: string[]) {
  const terms = new Set<string>();

  for (const conceptId of conceptIds) {
    const concept = CONCEPT_INTENTS[conceptId];
    if (!concept) continue;

    for (const value of concept.values ?? []) {
      for (const token of tokenizeText(value)) {
        terms.add(token);
      }
    }
  }

  return terms;
}

function buildIntentDimensions(normalizedQuery: string) {
  const matchedConceptIds = new Set<string>(PHRASE_INTENT_CONCEPT_MAP[normalizedQuery] ?? []);
  const querySeeds = new Set<string>([normalizedQuery]);
  const rawWords = normalizeInterestQuery(normalizedQuery)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  for (let start = 0; start < rawWords.length; start += 1) {
    for (let length = 1; length <= Math.min(3, rawWords.length - start); length += 1) {
      const seed = rawWords.slice(start, start + length).join(" ");
      if (seed) {
        querySeeds.add(seed);
      }
    }
  }

  for (const seed of querySeeds) {
    for (const conceptId of CONCEPT_VALUE_MAP[seed] ?? []) {
      matchedConceptIds.add(conceptId);
    }
  }

  for (const token of tokenizeText(normalizedQuery)) {
    querySeeds.add(token);
  }

  for (const seed of querySeeds) {
    for (const conceptId of TERM_CONCEPT_MAP[seed] ?? []) {
      matchedConceptIds.add(conceptId);
    }
  }

  const dimensions = new Map<string, IntentDimension>();
  for (const conceptId of matchedConceptIds) {
    const concept = CONCEPT_INTENTS[conceptId];
    const intent = concept?.intent;
    if (!concept || !intent) continue;

    const existing = dimensions.get(intent.dimension);
    if (!existing) {
      dimensions.set(intent.dimension, {
        conceptIds: [conceptId],
        dimension: intent.dimension,
        fields: uniqueStrings([...(intent.storyFields ?? [])]) as StoryTermSetKey[],
        label: intent.label,
        terms: toConceptTerms([conceptId]),
      });
      continue;
    }

    existing.conceptIds = uniqueStrings([...existing.conceptIds, conceptId]);
    existing.fields = uniqueStrings([...existing.fields, ...(intent.storyFields ?? [])]) as StoryTermSetKey[];
    existing.label = uniqueStrings([existing.label, intent.label]).join(" / ");
    for (const term of toConceptTerms([conceptId])) {
      existing.terms.add(term);
    }
  }

  return [...dimensions.values()];
}

function buildInterestSearchProfile(
  query: string,
  normalizedQuery = normalizeInterestQuery(query),
  options?: {
    excludeKeywords?: string[];
    matchKeywords?: string[];
  }
): InterestSearchProfile {
  const phrases = new Set<string>([normalizedQuery]);
  for (const phrase of expandConceptPhrases(normalizedQuery)) {
    phrases.add(phrase);
  }
  const matchKeywords = normalizeKeywordList(options?.matchKeywords ?? []);
  const excludeKeywords = normalizeKeywordList(options?.excludeKeywords ?? []);
  for (const matchKeyword of matchKeywords) {
    phrases.add(matchKeyword);
  }

  const tokens = new Set<string>();
  for (const phrase of phrases) {
    for (const token of tokenizeText(phrase)) {
      tokens.add(token);
    }
  }

  return {
    conceptGroups: buildConceptGroups(normalizedQuery),
    excludeKeywords,
    intentDimensions: buildIntentDimensions(normalizedQuery),
    matchKeywords,
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
  const structuredValues = [
    ...story.locations,
    ...story.organizations,
    ...story.people,
    ...story.industries,
    ...story.sports_teams,
    ...story.offices,
    ...story.facets,
  ];
  const titleValues = collectConceptPhrases([story.title]);
  const summaryValues = collectConceptPhrases(story.summary);
  const topicValues = collectConceptPhrases(story.topics);
  const entityValues = collectConceptPhrases([...story.primary_entities, ...entityTokens, ...structuredValues]);
  const sourceValues = collectConceptPhrases(sourceTitles);
  const tagValues = collectConceptPhrases(story.tags);
  const titleTerms = createTermSet(titleValues);
  const summaryTerms = createTermSet(summaryValues);
  const topicTerms = createTermSet(topicValues);
  const locationTerms = createTermSet(collectConceptPhrases(story.locations));
  const organizationTerms = createTermSet(collectConceptPhrases(story.organizations));
  const peopleTerms = createTermSet(collectConceptPhrases(story.people));
  const industryTerms = createTermSet(collectConceptPhrases(story.industries));
  const sportsTeamTerms = createTermSet(collectConceptPhrases(story.sports_teams));
  const officeTerms = createTermSet(collectConceptPhrases(story.offices));
  const facetTerms = createTermSet(collectConceptPhrases(story.facets));
  const entityTerms = createTermSet(entityValues);
  const sourceTerms = createTermSet(sourceValues);
  const tagTerms = createTermSet(tagValues);

  return {
    allTerms: new Set<string>([
      ...titleTerms,
      ...summaryTerms,
      ...topicTerms,
      ...locationTerms,
      ...organizationTerms,
      ...peopleTerms,
      ...industryTerms,
      ...sportsTeamTerms,
      ...officeTerms,
      ...facetTerms,
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
      ...story.locations,
      ...story.organizations,
      ...story.people,
      ...story.industries,
      ...story.sports_teams,
      ...story.offices,
      ...story.facets,
      ...sourceTitles,
      ...titleValues,
      ...summaryValues,
      ...topicValues,
      ...entityValues,
      ...tagValues,
    ].join(" ")),
    entityTerms,
    facetTerms,
    industryTerms,
    locationTerms,
    officeTerms,
    organizationTerms,
    peopleTerms,
    sourceTerms,
    sportsTeamTerms,
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

function getCoveredConceptLabels(conceptGroups: ConceptGroup[], storyTerms: Set<string>) {
  const covered: string[] = [];

  for (const group of conceptGroups) {
    for (const term of group.terms) {
      if (storyTerms.has(term)) {
        covered.push(group.label);
        break;
      }
    }
  }

  return covered;
}

function countCoveredConceptGroups(conceptGroups: ConceptGroup[], storyTerms: Set<string>) {
  let coveredGroups = 0;

  for (const group of conceptGroups) {
    for (const term of group.terms) {
      if (storyTerms.has(term)) {
        coveredGroups += 1;
        break;
      }
    }
  }

  return coveredGroups;
}

function getStoryTermsForFields(storyProfile: StorySearchProfile, fields: StoryTermSetKey[]) {
  const terms = new Set<string>();

  for (const field of fields) {
    for (const term of storyProfile[field]) {
      terms.add(term);
    }
  }

  return terms;
}

function getCoveredIntentDimensions(intentDimensions: IntentDimension[], storyProfile: StorySearchProfile) {
  const covered: IntentDimension[] = [];

  for (const dimension of intentDimensions) {
    const storyTerms = getStoryTermsForFields(storyProfile, dimension.fields);
    for (const term of dimension.terms) {
      if (storyTerms.has(term)) {
        covered.push(dimension);
        break;
      }
    }
  }

  return covered;
}

function buildMatchReasons(options: {
  coveredConceptLabels: string[];
  coveredIntentLabels: string[];
  entityMatches: number;
  exactPhraseMatch: boolean;
  expandedPhraseMatches: number;
  semanticSimilarity: number;
  sourceMatches: number;
  tagMatches: number;
  titleMatches: number;
  topicMatches: number;
}) {
  const reasons: string[] = [];

  if (options.coveredIntentLabels.length >= 2) {
    reasons.push(`Matched dimensions: ${options.coveredIntentLabels.map(toDisplayLabel).join(" + ")}`);
  } else if (options.coveredIntentLabels.length === 1) {
    reasons.push(`Matched dimension: ${toDisplayLabel(options.coveredIntentLabels[0] ?? "")}`);
  } else if (options.coveredConceptLabels.length >= 2) {
    reasons.push(`Matched concepts: ${options.coveredConceptLabels.map(toDisplayLabel).join(" + ")}`);
  } else if (options.coveredConceptLabels.length === 1) {
    reasons.push(`Matched concept: ${toDisplayLabel(options.coveredConceptLabels[0] ?? "")}`);
  }

  if (options.exactPhraseMatch) {
    reasons.push("Exact phrase");
  } else if (options.expandedPhraseMatches > 0) {
    reasons.push("Expanded phrase");
  }

  if (options.topicMatches > 0) {
    reasons.push("Topics");
  }
  if (options.entityMatches > 0) {
    reasons.push("Entities and story knowledge");
  }
  if (options.titleMatches > 0) {
    reasons.push("Headline");
  }
  if (options.tagMatches > 0) {
    reasons.push("Tags");
  }
  if (options.sourceMatches > 0) {
    reasons.push("Source titles");
  }
  if (options.semanticSimilarity >= 0.22) {
    reasons.push("Semantic similarity");
  }

  return uniqueNonEmpty(reasons).slice(0, 3);
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

function buildInterestEmbeddingInputWithKeywords(query: string, matchKeywords: string[]) {
  const normalizedQuery = normalizeInterestQuery(query);
  const searchProfile = buildInterestSearchProfile(query, normalizedQuery, { matchKeywords });
  const expansionPhrases = [...searchProfile.phrases].filter((phrase) => phrase !== normalizedQuery);

  if (searchProfile.wordCount <= 3 && expansionPhrases.length > 0) {
    return uniqueNonEmpty([query.trim(), ...matchKeywords, ...expansionPhrases]).join("\n");
  }

  return uniqueNonEmpty([query.trim(), ...matchKeywords]).join("\n");
}

export function buildStoryEmbeddingInput(story: StoryEmbeddingShape) {
  const sourceTitles = story.sources.map((source) => [source.name, source.title ?? ""].join(" - "));
  const entityTokens = story.entities.flatMap((entity) => [entity.name, ...entity.aliases]);
  const structuredValues = [
    ...story.locations,
    ...story.organizations,
    ...story.people,
    ...story.industries,
    ...story.sports_teams,
    ...story.offices,
    ...story.facets,
  ];
  const conceptPhrases = collectConceptPhrases([
    ...story.topics,
    ...story.primary_entities,
    ...entityTokens,
    ...story.tags,
    ...structuredValues,
  ]);

  return uniqueNonEmpty([
    `Headline ${story.title}`,
    ...story.summary.map((line) => `Summary ${line}`),
    ...story.topics.map((topic) => `Topic ${topic}`),
    ...story.primary_entities.map((entity) => `Entity ${entity}`),
    ...entityTokens.map((entity) => `Alias ${entity}`),
    ...story.tags.map((tag) => `Tag ${tag}`),
    ...story.locations.map((value) => `Location ${value}`),
    ...story.organizations.map((value) => `Organization ${value}`),
    ...story.people.map((value) => `Person ${value}`),
    ...story.industries.map((value) => `Industry ${value}`),
    ...story.sports_teams.map((value) => `Sports team ${value}`),
    ...story.offices.map((value) => `Office ${value}`),
    ...story.facets.map((value) => `Facet ${value}`),
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
  const excludedKeywordHit = interestProfile.excludeKeywords.some((keyword) => storyProfile.allText.includes(keyword));
  if (excludedKeywordHit) {
    return {
      matched: false,
      reasons: [] as string[],
      score: -1,
    };
  }

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
  const coveredConceptLabels = getCoveredConceptLabels(interestProfile.conceptGroups, storyProfile.allTerms);
  const coveredIntentDimensions = getCoveredIntentDimensions(interestProfile.intentDimensions, storyProfile);
  const coveredIntentLabels = coveredIntentDimensions.map((dimension) => dimension.label);
  const needsCompoundCoverage = interestProfile.conceptGroups.length >= 2;
  const hasCompoundCoverage = !needsCompoundCoverage || coveredConceptGroups >= 2;
  const requiredIntentDimensionCount =
    interestProfile.intentDimensions.length === 0
      ? 0
      : interestProfile.intentDimensions.length >= 2
        ? Math.min(interestProfile.intentDimensions.length, 2)
        : 1;
  const hasRequiredIntentCoverage =
    requiredIntentDimensionCount === 0 || coveredIntentDimensions.length >= requiredIntentDimensionCount;
  const overlapRatio = allMatches / Math.max(2, Math.min(interestProfile.tokens.size, interestProfile.wordCount <= 2 ? 5 : 7));
  const matchedKeywordHits = interestProfile.matchKeywords.filter((keyword) => storyProfile.allText.includes(keyword));
  const hasRequiredMatchKeywords = interestProfile.matchKeywords.length === 0 || matchedKeywordHits.length > 0;
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
    + Math.min(coveredIntentDimensions.length, 2) * 0.12
    + (hasRequiredIntentCoverage && requiredIntentDimensionCount > 0 ? 0.1 : 0)
    + Math.min(matchedKeywordHits.length, 2) * 0.15
    + Math.min(interestProfile.wordCount <= 2 ? 0.22 : 0.16, overlapRatio * (interestProfile.wordCount <= 2 ? 0.3 : 0.18));
  const shortInterest = interestProfile.wordCount <= 2;
  const noEmbedding = !interestEmbedding;
  const semanticFloor = shortInterest ? Math.max(0.12, similarityThreshold - 0.04) : similarityThreshold;
  const strongSemantic = semanticSimilarity >= (shortInterest ? 0.18 : 0.22);
  const structuredSignal =
    hasRequiredMatchKeywords
    && hasRequiredIntentCoverage
    && hasCompoundCoverage
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
    && hasRequiredMatchKeywords
    && hasRequiredIntentCoverage
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
      || (
        strongSemantic
        && hasRequiredMatchKeywords
        && hasRequiredIntentCoverage
        && (!needsCompoundCoverage || hasCompoundCoverage || semanticSimilarity >= 0.32)
      )
      || (
        (semanticSimilarity >= semanticFloor || structuredSignal)
        && hybridScore >= minimumHybridScore
        && hasRequiredMatchKeywords
        && hasRequiredIntentCoverage
      ),
    reasons: buildMatchReasons({
      coveredConceptLabels,
      coveredIntentLabels,
      entityMatches,
      exactPhraseMatch,
      expandedPhraseMatches,
      semanticSimilarity,
      sourceMatches,
      tagMatches,
      titleMatches,
      topicMatches,
    }),
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

export async function updateInterestEmbeddingRecord(
  interestId: string,
  query: string,
  options?: {
    matchKeywords?: string[];
  }
) {
  const supabase = supabaseServer();
  const nowIso = new Date().toISOString();

  try {
    const embedding = await generateEmbedding(buildInterestEmbeddingInputWithKeywords(query, options?.matchKeywords ?? []));
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

export async function getSemanticStoryMatchesForUser(
  userId: string,
  options?: {
    interestIds?: string[];
    matchCountPerInterest?: number;
    similarityThreshold?: number;
  }
) {
  const supabase = supabaseServer();
  const similarityThreshold = options?.similarityThreshold ?? 0.18;
  const matchCountPerInterest = options?.matchCountPerInterest ?? 24;
  const interestIds = uniqueNonEmpty((options?.interestIds ?? []).map((value) => String(value)));

  try {
    let interestQuery = supabase
      .from("user_interest_follows")
      .select("id, query, normalized_query, match_keywords, exclude_keywords, embedding")
      .eq("user_id", userId);

    if (interestIds.length > 0) {
      interestQuery = interestQuery.in("id", interestIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0));
    }

    const [{ data: interestRows, error: interestError }, { data: storyEmbeddingRows, error: storyEmbeddingError }, { data: storyRows, error: storyError }] = await Promise.all([
      interestQuery,
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

    let hiddenRows: StoredInterestStoryFeedbackRow[] = [];
    try {
      let feedbackQuery = supabase
        .from("user_interest_story_feedback")
        .select("interest_id, story_id")
        .eq("user_id", userId)
        .eq("feedback", "hidden");

      if (interestIds.length > 0) {
        feedbackQuery = feedbackQuery.in("interest_id", interestIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0));
      }

      const { data, error } = await feedbackQuery;
      if (error) {
        throw new Error(error.message);
      }

      hiddenRows = (data ?? []) as StoredInterestStoryFeedbackRow[];
    } catch (error) {
      if (!relationMissing(error, "user_interest_story_feedback")) {
        throw error;
      }
    }

    const publishedStories = ((storyRows ?? []) as StoryDbRow[]).map(coerceStory);
    const publishedStoryIds = new Set(publishedStories.map((story) => story.id));
    const hiddenStoryIdsByInterest = new Map<string, Set<string>>();
    for (const row of hiddenRows) {
      const interestId = String(row.interest_id);
      const current = hiddenStoryIdsByInterest.get(interestId) ?? new Set<string>();
      current.add(String(row.story_id));
      hiddenStoryIdsByInterest.set(interestId, current);
    }
    const parsedInterestEmbeddings: Array<{ embedding: number[] | null; interestId: string; profile: InterestSearchProfile }> = ((interestRows ?? []) as StoredInterestEmbeddingRow[])
      .map((row) => {
        const embedding = parsePgVector(row.embedding);
        const interestId = String(row.id ?? "");
        const query = String(row.query ?? "").trim();
        const normalizedQuery = normalizeInterestQuery(String(row.normalized_query ?? query));
        if (!interestId || !query || !normalizedQuery) {
          return null;
        }

        return {
          embedding: embedding ?? null,
          interestId,
          profile: buildInterestSearchProfile(query, normalizedQuery, {
            excludeKeywords: Array.isArray(row.exclude_keywords) ? row.exclude_keywords.map(String) : [],
            matchKeywords: Array.isArray(row.match_keywords) ? row.match_keywords.map(String) : [],
          }),
        };
      })
      .filter((row): row is { embedding: number[] | null; interestId: string; profile: InterestSearchProfile } => row !== null);
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
    const matchGroups: SemanticInterestStoryMatches[] = [];

    for (const interest of parsedInterestEmbeddings) {
      const hiddenStoryIds = hiddenStoryIdsByInterest.get(interest.interestId) ?? new Set<string>();
      const nearestStories = parsedStoryEmbeddings
        .map((row) => {
          if (hiddenStoryIds.has(row.storyId)) {
            return null;
          }

          const storyProfile = storyProfiles.get(row.storyId);
          if (!storyProfile) return null;

          const { matched, reasons, score } = scoreInterestAgainstStory(
            interest.embedding,
            interest.profile,
            row.embedding,
            storyProfile,
            similarityThreshold
          );

          if (!matched) return null;

          return {
            reasons,
            score,
            storyId: row.storyId,
          };
        })
        .filter((row): row is { reasons: string[]; score: number; storyId: string } => Boolean(row))
        .sort((left, right) => right.score - left.score)
        .slice(0, matchCountPerInterest);

      matchGroups.push({
        hiddenCount: hiddenStoryIds.size,
        hiddenStoryIds: [...hiddenStoryIds],
        interestId: interest.interestId,
        matches: nearestStories,
      });
    }

    return matchGroups;
  } catch (error) {
    if (
      relationMissing(error, "user_interest_follows")
      || relationMissing(error, "story_embeddings")
      || relationMissing(error, "user_interest_story_feedback")
    ) {
      return [] as SemanticInterestStoryMatches[];
    }

    throw error;
  }
}

export async function getSemanticStoryIdsForUser(
  userId: string,
  options?: {
    interestIds?: string[];
    matchCountPerInterest?: number;
    similarityThreshold?: number;
  }
) {
  const groups = await getSemanticStoryMatchesForUser(userId, options);
  const scoredStories = new Map<string, number>();

  for (const group of groups) {
    for (const match of group.matches) {
      const current = scoredStories.get(match.storyId) ?? 0;
      if (match.score > current) {
        scoredStories.set(match.storyId, match.score);
      }
    }
  }

  return [...scoredStories.entries()].sort((left, right) => right[1] - left[1]).map(([storyId]) => storyId);
}
