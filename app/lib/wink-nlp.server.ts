import "server-only";

import winkNLP, {
  type Detail,
  type ItsFunction,
  type ItemEntity,
  type ItemToken,
  type PartOfSpeech,
  type WinkMethods,
} from "wink-nlp";
import model from "wink-eng-lite-web-model";

export type WinkToken = {
  lemma: string;
  normal: string;
  pos: string;
  value: string;
};

export type WinkEntity = {
  text: string;
  type: string;
};

export type WinkAnalysis = {
  entities: WinkEntity[];
  lemmas: string[];
  sentences: string[];
  tokens: WinkToken[];
};

let cachedNlp: WinkMethods | null = null;

export function getWinkNlp() {
  if (!cachedNlp) {
    cachedNlp = winkNLP(model);
  }

  return cachedNlp;
}

export function analyzeTextWithWink(text: string): WinkAnalysis {
  const nlp = getWinkNlp();
  const doc = nlp.readDoc(text);
  const tokens: WinkToken[] = [];
  const entities: WinkEntity[] = [];
  const valueIts = nlp.its.value as unknown as ItsFunction<string>;
  const normalIts = nlp.its.normal as unknown as ItsFunction<string>;
  const lemmaIts = nlp.its.lemma as unknown as ItsFunction<string>;
  const posIts = nlp.its.pos as unknown as ItsFunction<PartOfSpeech>;
  const detailIts = nlp.its.detail as unknown as ItsFunction<Detail>;

  doc.tokens().each((token: ItemToken) => {
    const value = token.out(valueIts);
    const normal = token.out(normalIts);
    const lemma = token.out(lemmaIts);
    const pos = token.out(posIts);

    if (typeof value !== "string" || !value.trim()) return;

    tokens.push({
      lemma: typeof lemma === "string" ? lemma : value,
      normal: typeof normal === "string" ? normal : value.toLowerCase(),
      pos: typeof pos === "string" ? pos : "",
      value,
    });
  });

  doc.entities().each((entity: ItemEntity) => {
    const text = entity.out();
    const detail = entity.out(detailIts);

    if (!text.trim()) return;

    entities.push({
      text,
      type: typeof detail === "object" && detail !== null && "type" in detail ? String(detail.type) : "",
    });
  });

  return {
    entities,
    lemmas: tokens.map((token) => token.lemma),
    sentences: doc.sentences().out(),
    tokens,
  };
}
