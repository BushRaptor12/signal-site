import { KNOWLEDGE_CONCEPTS, NON_SINGULAR_TOKENS, PHRASE_INTENTS } from "./interest-knowledge-base.js";

function uniqueNonEmpty(values) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function valuesForConcept(concept) {
  return uniqueNonEmpty([
    ...(concept.terms ?? []),
    ...(concept.related ?? []),
    ...(concept.members ?? []),
    ...(concept.attributes ?? []),
  ]);
}

const conceptById = new Map(KNOWLEDGE_CONCEPTS.map((concept) => [concept.id, concept]));

const termKnowledge = {};
for (const concept of KNOWLEDGE_CONCEPTS) {
  const values = valuesForConcept(concept);
  for (const term of concept.terms ?? []) {
    termKnowledge[term] = uniqueNonEmpty(values.filter((value) => value !== term));
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
}

export { NON_SINGULAR_TOKENS, KNOWLEDGE_CONCEPTS, PHRASE_INTENTS };
export const TERM_KNOWLEDGE = termKnowledge;
export const PHRASE_KNOWLEDGE = phraseKnowledge;
