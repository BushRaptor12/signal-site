import type { Entity, Source, StoryWithViews } from "@/app/lib/types";

export type StoryDbRow = {
  id: string;
  status?: string | null;
  title: string;
  summary: unknown;
  sources: unknown;
  date: string;
  image_url?: string | null;
  image_path?: string | null;
  image_focus_x?: number | string | null;
  image_focus_y?: number | string | null;
  image_display?: string | null;
  views?: number | null;
  urgent?: boolean | null;
  pinned?: boolean | null;
  beacon_include?: boolean | null;
  beacon_rank?: number | string | null;
  beacon_position?: string | null;
  beacon_order?: number | string | null;
  beacon_headline?: string | null;
  topics?: unknown;
  tags?: unknown;
  entities?: unknown;
  primary_entities?: unknown;
  related_story_ids?: unknown;
  comments?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  content_updated_at?: string | null;
};

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v)).filter(Boolean);
}

export function toSources(value: unknown): Source[] {
  if (!Array.isArray(value)) return [];
  const sources: Source[] = [];

  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;

    const row = item as Partial<Source>;
    if (!row.name || !row.url || !row.lean) continue;
    if (row.lean !== "Left" && row.lean !== "Center" && row.lean !== "Right") continue;

    sources.push({
      name: String(row.name),
      url: String(row.url),
      lean: row.lean,
      title: toNullableString(row.title),
    });
  }

  return sources;
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
    status: row.status === "draft" || row.status === "archived" ? row.status : "published",
    title: row.title,
    summary: toStringArray(row.summary),
    sources: toSources(row.sources),
    date: row.date,
    image_url: toNullableString(row.image_url),
    image_path: toNullableString(row.image_path),
    image_focus_x: toNullableNumber(row.image_focus_x),
    image_focus_y: toNullableNumber(row.image_focus_y),
    image_display: row.image_display === "contain" ? "contain" : row.image_display === "cover" ? "cover" : null,
    created_at: row.created_at ?? undefined,
    updated_at: row.updated_at ?? undefined,
    content_updated_at: row.content_updated_at ?? undefined,
    urgent: Boolean(row.urgent),
    pinned: Boolean(row.pinned),
    beacon_include: Boolean(row.beacon_include),
    beacon_rank: toNullableNumber(row.beacon_rank),
    beacon_position:
      row.beacon_position === "lead" || row.beacon_position === "left" || row.beacon_position === "right"
        ? row.beacon_position
        : null,
    beacon_order: toNullableNumber(row.beacon_order),
    beacon_headline: toNullableString(row.beacon_headline),
    topics: toStringArray(row.topics),
    tags: toStringArray(row.tags),
    entities: toEntities(row.entities),
    primary_entities: toStringArray(row.primary_entities),
    related_story_ids: toStringArray(row.related_story_ids),
    comments: Number(row.comments ?? 0),
    views: Number(row.views ?? 0),
  };
}
