import type { Entity, Source, StoryWithViews } from "@/app/lib/types";

export type StoryDbRow = {
  id: string;
  title: string;
  summary: unknown;
  sources: unknown;
  date: string;
  views?: number | null;
  urgent?: boolean | null;
  beacon_include?: boolean | null;
  beacon_rank?: number | string | null;
  beacon_headline?: string | null;
  topics?: unknown;
  tags?: unknown;
  entities?: unknown;
  primary_entities?: unknown;
  comments?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v)).filter(Boolean);
}

export function toSources(value: unknown): Source[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item !== "object" || item === null) return null;
      const row = item as Partial<Source>;
      if (!row.name || !row.url || !row.lean) return null;
      if (row.lean !== "Left" && row.lean !== "Center" && row.lean !== "Right") return null;
      return { name: String(row.name), url: String(row.url), lean: row.lean };
    })
    .filter((item): item is Source => Boolean(item));
}

export function toEntities(value: unknown): Entity[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item !== "object" || item === null) return null;
      const row = item as Partial<Entity>;
      if (!row.name) return null;
      return { name: String(row.name), aliases: toStringArray(row.aliases) };
    })
    .filter((item): item is Entity => Boolean(item));
}

export function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function toNullableString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (value == null) return null;

  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

export function coerceStory(row: StoryDbRow): StoryWithViews {
  return {
    id: row.id,
    title: row.title,
    summary: toStringArray(row.summary),
    sources: toSources(row.sources),
    date: row.date,
    created_at: row.created_at ?? undefined,
    updated_at: row.updated_at ?? undefined,
    urgent: Boolean(row.urgent),
    beacon_include: Boolean(row.beacon_include),
    beacon_rank: toNullableNumber(row.beacon_rank),
    beacon_headline: toNullableString(row.beacon_headline),
    topics: toStringArray(row.topics),
    tags: toStringArray(row.tags),
    entities: toEntities(row.entities),
    primary_entities: toStringArray(row.primary_entities),
    comments: Number(row.comments ?? 0),
    views: Number(row.views ?? 0),
  };
}
