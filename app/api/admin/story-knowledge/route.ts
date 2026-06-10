export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requestHasAdminAccess } from "@/app/lib/admin.server";
import { inferStoryKnowledge } from "@/app/lib/story-knowledge";
import type { Entity, Story } from "@/app/lib/types";
import { analyzeTextWithWink } from "@/app/lib/wink-nlp.server";
import { TOPICS, normalize } from "@/app/lib/vocab";

type StoryKnowledgeFields = Pick<
  Story,
  "facets" | "industries" | "locations" | "offices" | "organizations" | "people" | "sports_teams"
>;

type AutofillSource = {
  name?: unknown;
  title?: unknown;
};

type AutofillRequest = {
  current?: Partial<Record<keyof StoryKnowledgeFields, unknown>>;
  currentPrimaryEntities?: unknown;
  currentSelectedEntities?: unknown;
  entities?: unknown;
  sources?: unknown;
  summary?: unknown;
  title?: unknown;
  topics?: unknown;
};

const ORG_PATTERN =
  /\b(agency|association|bank|bureau|club|committee|company|corp|corporation|department|foundation|group|inc|institute|league|llc|ministry|network|party|school|team|university)\b/i;
const OFFICE_HINTS: Array<{ label: string; match: RegExp }> = [
  { label: "Vice President", match: /\bvice president\b/i },
  { label: "President", match: /\bpresident\b/i },
  { label: "Governor", match: /\bgovernor\b/i },
  { label: "Senator", match: /\bsenator\b/i },
  { label: "Representative", match: /\brepresentative\b|\bcongressman\b|\bcongresswoman\b/i },
  { label: "Speaker", match: /\bspeaker\b/i },
  { label: "Mayor", match: /\bmayor\b/i },
  { label: "Central Bank", match: /\bcentral bank\b|\bfederal reserve\b|\bthe fed\b/i },
];

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function toEntities(value: unknown): Entity[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Partial<Entity>;
      if (!row.name) return null;
      return {
        aliases: Array.isArray(row.aliases) ? row.aliases.map(String).filter(Boolean) : [],
        name: String(row.name),
      };
    })
    .filter((item): item is Entity => Boolean(item));
}

function toSources(value: unknown): AutofillSource[] {
  if (!Array.isArray(value)) return [];
  const sources: AutofillSource[] = [];

  value.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const row = item as AutofillSource;
    sources.push({
      name: typeof row.name === "string" ? row.name : "",
      title: typeof row.title === "string" ? row.title : "",
    });
  });

  return sources;
}

function mergeUniqueByNormalized(...groups: string[][]) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of groups.flat()) {
    const trimmed = value.trim();
    const key = normalize(trimmed);
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    output.push(trimmed);
  }

  return output;
}

function normalizeKnowledgeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[']/g, "'")
    .toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termMatchesText(text: string, term: string) {
  const normalizedTerm = normalizeKnowledgeText(term).trim();
  if (!normalizedTerm || normalizedTerm.length < 2) return false;

  const boundaryStart = /^[a-z0-9]/.test(normalizedTerm) ? "\\b" : "";
  const boundaryEnd = /[a-z0-9]$/.test(normalizedTerm) ? "\\b" : "";
  return new RegExp(`${boundaryStart}${escapeRegExp(normalizedTerm)}${boundaryEnd}`, "i").test(text);
}

function inferEntitySelections(input: {
  currentPrimaryEntities: string[];
  currentSelectedEntities: string[];
  entities: Entity[];
  sourceNames: string[];
  sourceTitles: string[];
  summary: string[];
  title: string;
}) {
  const headlineText = normalizeKnowledgeText(input.title);
  const sourceText = normalizeKnowledgeText([...input.sourceNames, ...input.sourceTitles].join(" "));
  const bodyText = normalizeKnowledgeText([...input.summary, ...input.sourceNames, ...input.sourceTitles].join(" "));

  const matches = input.entities
    .map((entity) => {
      const terms = [entity.name, ...(entity.aliases ?? [])]
        .map((term) => term.trim())
        .filter((term) => term.length >= 2)
        .sort((left, right) => right.length - left.length);
      const matchedTerms = terms.filter((term) => termMatchesText(`${headlineText} ${bodyText}`, term));
      if (matchedTerms.length === 0) return null;

      const headlineMatch = matchedTerms.some((term) => termMatchesText(headlineText, term));
      const sourceTitleMatch = matchedTerms.some((term) => termMatchesText(sourceText, term));
      const nameMatch = termMatchesText(`${headlineText} ${bodyText}`, entity.name);
      const longestTermLength = Math.max(...matchedTerms.map((term) => term.length));
      const score =
        (headlineMatch ? 80 : 0) +
        (sourceTitleMatch ? 35 : 0) +
        (nameMatch ? 25 : 0) +
        Math.min(longestTermLength, 40);

      return {
        entity,
        primary: headlineMatch || sourceTitleMatch || nameMatch,
        score,
      };
    })
    .filter((match): match is { entity: Entity; primary: boolean; score: number } => Boolean(match))
    .sort((left, right) => right.score - left.score || left.entity.name.localeCompare(right.entity.name));

  const inferredSelected = matches.slice(0, 10).map((match) => match.entity.name);
  const inferredPrimary = matches
    .filter((match) => match.primary)
    .slice(0, 5)
    .map((match) => match.entity.name);

  return {
    primaryEntities: mergeUniqueByNormalized(input.currentPrimaryEntities, inferredPrimary),
    selectedEntities: mergeUniqueByNormalized(input.currentSelectedEntities, inferredSelected),
  };
}

function normalizeCandidate(value: string) {
  const cleaned = value
    .replace(/[^\p{L}\p{N}&.' -]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length < 2) return "";
  if (!/[A-Za-z]/.test(cleaned)) return "";
  return cleaned;
}

function isLikelyAcronym(value: string) {
  const compact = value.replace(/[^A-Za-z0-9]/g, "");
  return compact.length >= 2 && compact.length <= 8 && compact === compact.toUpperCase() && /[A-Z]/.test(compact);
}

function looksLikePersonName(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 4 && !ORG_PATTERN.test(value) && words.every((word) => /^[A-Z][a-z.'-]+$/.test(word));
}

function titleCaseName(value: string) {
  if (isLikelyAcronym(value)) return value.toUpperCase();

  return value
    .split(/\s+/)
    .map((word) => {
      if (/^(of|and|the|for|in|on|de|da|van)$/i.test(word)) return word.toLowerCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function inferWinkKnowledge(text: string): StoryKnowledgeFields {
  const analysis = analyzeTextWithWink(text);
  const people: string[] = [];
  const organizations: string[] = [];
  const locations: string[] = [];
  const offices: string[] = [];
  const facets: string[] = [];
  const industries: string[] = [];
  const sportsTeams: string[] = [];
  const properPhrases: string[] = [];
  let buffer: string[] = [];

  const flushBuffer = () => {
    if (buffer.length === 0) return;
    const candidate = normalizeCandidate(buffer.join(" "));
    if (candidate) properPhrases.push(candidate);
    buffer = [];
  };

  for (const token of analysis.tokens) {
    if (token.pos === "PROPN" || (token.pos === "NUM" && buffer.length > 0)) {
      buffer.push(token.value);
    } else {
      flushBuffer();
    }
  }
  flushBuffer();

  for (const entity of analysis.entities) {
    const candidate = normalizeCandidate(entity.text);
    if (!candidate) continue;
    const type = entity.type.toLowerCase();
    const label = titleCaseName(candidate);

    if (/person|people/.test(type)) {
      people.push(label);
    } else if (/place|location|gpe|loc/.test(type)) {
      locations.push(label);
    } else if (/org|organization|company/.test(type)) {
      organizations.push(label);
    }
  }

  for (const phrase of properPhrases) {
    const label = titleCaseName(phrase);
    if (ORG_PATTERN.test(label) || isLikelyAcronym(phrase)) {
      organizations.push(label);
    } else if (looksLikePersonName(label)) {
      people.push(label);
    }
  }

  for (const officeHint of OFFICE_HINTS) {
    if (officeHint.match.test(text)) offices.push(officeHint.label);
  }

  if (/\bartificial intelligence\b|\bgenerative ai\b|\bai\b/i.test(text)) {
    industries.push("Artificial intelligence");
  }
  if (/\bsemiconductor|chipmaker|gpu|chips\b/i.test(text)) {
    industries.push("Semiconductors");
  }
  if (/\bcentral bank|federal reserve|interest rates|inflation\b/i.test(text)) {
    industries.push("Finance");
  }
  if (/\bipo|startup|earnings|acquisition|merger\b/i.test(text)) {
    facets.push("business");
  }
  if (/\belection|campaign|senate|congress|governor|mayor|president\b/i.test(text)) {
    facets.push("politician");
  }

  return {
    facets: mergeUniqueByNormalized(facets),
    industries: mergeUniqueByNormalized(industries),
    locations: mergeUniqueByNormalized(locations),
    offices: mergeUniqueByNormalized(offices),
    organizations: mergeUniqueByNormalized(organizations),
    people: mergeUniqueByNormalized(people),
    sports_teams: mergeUniqueByNormalized(sportsTeams),
  };
}

export async function POST(req: Request) {
  try {
    if (!(await requestHasAdminAccess(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as AutofillRequest;
    const title = typeof body.title === "string" ? body.title : "";
    const summary = toStringArray(body.summary);
    const topics = toStringArray(body.topics).filter((topic) => TOPICS.map(normalize).includes(normalize(topic)));
    const sources = toSources(body.sources);
    const sourceNames = sources.map((source) => String(source.name ?? ""));
    const sourceTitles = sources.map((source) => String(source.title ?? ""));
    const current: StoryKnowledgeFields = {
      facets: toStringArray(body.current?.facets),
      industries: toStringArray(body.current?.industries),
      locations: toStringArray(body.current?.locations),
      offices: toStringArray(body.current?.offices),
      organizations: toStringArray(body.current?.organizations),
      people: toStringArray(body.current?.people),
      sports_teams: toStringArray(body.current?.sports_teams),
    };

    const inferredEntitySelections = inferEntitySelections({
      currentPrimaryEntities: toStringArray(body.currentPrimaryEntities),
      currentSelectedEntities: toStringArray(body.currentSelectedEntities),
      entities: toEntities(body.entities),
      sourceNames,
      sourceTitles,
      summary,
      title,
    });
    const text = [title, ...summary, ...topics, ...inferredEntitySelections.selectedEntities, ...sourceNames, ...sourceTitles].join(" ");
    const winkKnowledge = inferWinkKnowledge(text);
    const currentWithWink: StoryKnowledgeFields = {
      facets: mergeUniqueByNormalized(current.facets, winkKnowledge.facets),
      industries: mergeUniqueByNormalized(current.industries, winkKnowledge.industries),
      locations: mergeUniqueByNormalized(current.locations, winkKnowledge.locations),
      offices: mergeUniqueByNormalized(current.offices, winkKnowledge.offices),
      organizations: mergeUniqueByNormalized(current.organizations, winkKnowledge.organizations),
      people: mergeUniqueByNormalized(current.people, winkKnowledge.people),
      sports_teams: mergeUniqueByNormalized(current.sports_teams, winkKnowledge.sports_teams),
    };
    const knowledge = inferStoryKnowledge({
      current: currentWithWink,
      entityNames: mergeUniqueByNormalized(inferredEntitySelections.selectedEntities, winkKnowledge.people, winkKnowledge.organizations),
      primaryEntities: inferredEntitySelections.primaryEntities,
      sourceNames,
      sourceTitles,
      summary,
      title,
      topics,
    });

    return NextResponse.json({
      knowledge,
      primaryEntities: inferredEntitySelections.primaryEntities,
      selectedEntities: inferredEntitySelections.selectedEntities,
      winkSuggestions: winkKnowledge,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "We couldn't auto-fill story knowledge." },
      { status: 500 }
    );
  }
}
