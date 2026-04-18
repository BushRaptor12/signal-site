import { NextResponse } from "next/server";
import { getAccountUserId } from "@/app/lib/account.server";
import { supabaseServer } from "@/app/lib/supabase.server";
import { ENTITIES, TOPICS, normalize } from "@/app/lib/vocab";

type SuggestionKind = "entity" | "topic";

type InterestSuggestion = {
  hint: string | null;
  kind: SuggestionKind;
  value: string;
};

type EntityRow = {
  aliases: string[] | null;
  name: string;
};

function scoreTextMatch(value: string, query: string) {
  const normalizedValue = normalize(value);
  if (!normalizedValue || !query) return 0;
  if (normalizedValue === query) return 240;
  if (normalizedValue.startsWith(query)) return 180;
  if (normalizedValue.includes(query)) return 120;
  return 0;
}

function addSuggestion(
  suggestions: Map<string, InterestSuggestion & { score: number }>,
  value: string,
  options: { hint?: string | null; kind: SuggestionKind; query: string; values?: string[] }
) {
  const normalizedValue = normalize(value);
  if (!normalizedValue) return;

  const score = Math.max(
    scoreTextMatch(value, options.query),
    ...(options.values ?? []).map((candidate) => scoreTextMatch(candidate, options.query) - 25)
  );
  if (score <= 0) return;

  const existing = suggestions.get(normalizedValue);
  if (existing && existing.score >= score) {
    return;
  }

  suggestions.set(normalizedValue, {
    hint: options.hint ?? null,
    kind: options.kind,
    score,
    value,
  });
}

async function loadEntitySuggestions() {
  const supabase = supabaseServer();
  const { data, error } = await supabase.from("entities").select("name, aliases").order("name", { ascending: true }).limit(250);

  if (error) {
    if (/relation .*entities.* does not exist/i.test(error.message)) {
      return ENTITIES;
    }

    throw new Error(error.message);
  }

  const dynamicEntities = ((data ?? []) as EntityRow[]).map((entity) => ({
    aliases: Array.isArray(entity.aliases) ? entity.aliases.map(String).filter(Boolean) : [],
    name: entity.name,
  }));

  const seen = new Set<string>();
  const combined = [...dynamicEntities, ...ENTITIES].filter((entity) => {
    const key = normalize(entity.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return combined;
}

export async function GET(request: Request) {
  try {
    const userId = await getAccountUserId();
    if (!userId) {
      return NextResponse.json({ error: "You must be logged in first." }, { status: 401 });
    }

    const url = new URL(request.url);
    const query = normalize(url.searchParams.get("q") ?? "");
    if (!query) {
      return NextResponse.json({ suggestions: [] });
    }

    const suggestions = new Map<string, InterestSuggestion & { score: number }>();
    for (const topic of TOPICS) {
      addSuggestion(suggestions, topic, {
        hint: "Topic",
        kind: "topic",
        query,
      });
    }

    const entities = await loadEntitySuggestions();
    for (const entity of entities) {
      addSuggestion(suggestions, entity.name, {
        hint: "Entity",
        kind: "entity",
        query,
        values: entity.aliases,
      });
    }

    const orderedSuggestions = [...suggestions.values()]
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return left.value.localeCompare(right.value);
      })
      .slice(0, 8)
      .map(({ hint, kind, value }) => ({
        hint,
        kind,
        value,
      }));

    return NextResponse.json({ suggestions: orderedSuggestions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn't load interest suggestions.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
