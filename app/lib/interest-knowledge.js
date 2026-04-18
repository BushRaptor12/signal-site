import { KNOWLEDGE_CONCEPTS, NON_SINGULAR_TOKENS, PHRASE_INTENTS } from "./interest-knowledge-base.js";

function uniqueNonEmpty(values) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function normalizeKnowledgeKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function valuesForConcept(concept) {
  return uniqueNonEmpty([
    ...(concept.terms ?? []),
    ...(concept.related ?? []),
    ...(concept.members ?? []),
    ...(concept.attributes ?? []),
  ]);
}

function parserValuesForConcept(concept) {
  return uniqueNonEmpty([
    ...(concept.terms ?? []),
    ...(concept.related ?? []),
    ...(concept.attributes ?? []),
  ]);
}

const conceptById = new Map(KNOWLEDGE_CONCEPTS.map((concept) => [concept.id, concept]));
const conceptValueIds = {};
const termConceptIds = {};
const phraseIntentMap = {};
const conceptIntentMap = {};

const termKnowledge = {};
for (const concept of KNOWLEDGE_CONCEPTS) {
  const values = valuesForConcept(concept);
  const parserValues = parserValuesForConcept(concept);
  conceptIntentMap[concept.id] = {
    id: concept.id,
    intent: concept.intent ?? null,
    values,
  };

  for (const value of parserValues) {
    const normalizedValue = normalizeKnowledgeKey(value);
    if (!normalizedValue) continue;
    conceptValueIds[normalizedValue] = uniqueNonEmpty([...(conceptValueIds[normalizedValue] ?? []), concept.id]);
  }

  for (const term of concept.terms ?? []) {
    termKnowledge[term] = uniqueNonEmpty(values.filter((value) => value !== term));
    termConceptIds[term] = uniqueNonEmpty([...(termConceptIds[term] ?? []), concept.id]);
  }
}

const phraseKnowledge = {};
for (const intent of PHRASE_INTENTS) {
  const values = uniqueNonEmpty(
    intent.conceptIds.flatMap((conceptId) => {
      const concept = conceptById.get(conceptId);
      return concept ? valuesForConcept(concept) : [];
    })
  ).filter((value) => value !== intent.phrase);

  phraseKnowledge[intent.phrase] = values;
  phraseIntentMap[intent.phrase] = uniqueNonEmpty(intent.conceptIds);
}

export { NON_SINGULAR_TOKENS, KNOWLEDGE_CONCEPTS, PHRASE_INTENTS };
export const CONCEPT_INTENT_MAP = conceptIntentMap;
export const CONCEPT_VALUE_IDS = conceptValueIds;
export const PHRASE_INTENT_MAP = phraseIntentMap;
export const TERM_KNOWLEDGE = termKnowledge;
export const TERM_CONCEPT_IDS = termConceptIds;
export const PHRASE_KNOWLEDGE = phraseKnowledge;
