import { supabaseServer } from "@/app/lib/supabase.server";
import { toNullableString, toStringArray } from "@/app/lib/stories";
import {
  getDefaultCoverageHubDefinition,
  listDefaultCoverageHubDefinitions,
  mergeCoverageHubDefinition,
  type CoverageHubDefinition,
  type CoverageHubPick,
  type CoverageHubStored,
  type CoverageHubStorySection,
} from "@/app/lib/coverage-hubs";

type CoverageHubRow = {
  slug: string;
  eyebrow?: string | null;
  title?: string | null;
  dek?: string | null;
  date_label?: string | null;
  description?: string | null;
  hero_story_id?: string | null;
  latest_story_ids?: unknown;
  sections?: unknown;
  picks_title?: string | null;
  picks_description?: string | null;
  picks?: unknown;
  notes?: unknown;
  updated_at?: string | null;
  updated_by?: string | null;
};

function toCoverageHubSections(value: unknown): CoverageHubStorySection[] {
  if (!Array.isArray(value)) return [];

  const sections: CoverageHubStorySection[] = [];

  value.forEach((item, index) => {
    if (typeof item !== "object" || item === null) return;
    const row = item as Partial<CoverageHubStorySection>;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : `section-${index + 1}`;
    if (!title) return;

    sections.push({
      id,
      title,
      description: typeof row.description === "string" ? row.description.trim() || undefined : undefined,
      storyIds: Array.from(new Set(toStringArray(row.storyIds).map((storyId) => storyId.trim()).filter(Boolean))),
    });
  });

  return sections;
}

function toCoverageHubPicks(value: unknown): CoverageHubPick[] {
  if (!Array.isArray(value)) return [];

  const picks: CoverageHubPick[] = [];

  value.forEach((item) => {
    if (typeof item !== "object" || item === null) return;
    const row = item as Partial<CoverageHubPick>;
    const pick = typeof row.pick === "string" ? row.pick.trim() : "";
    const team = typeof row.team === "string" ? row.team.trim() : "";
    const player = typeof row.player === "string" ? row.player.trim() : "";
    if (!pick || !team || !player) return;

    picks.push({
      pick,
      team,
      player,
      school: typeof row.school === "string" ? row.school.trim() || undefined : undefined,
      note: typeof row.note === "string" ? row.note.trim() || undefined : undefined,
    });
  });

  return picks;
}

function normalizeCoverageHub(input: Partial<CoverageHubStored> & { slug: string }): CoverageHubStored {
  return {
    slug: input.slug.trim(),
    eyebrow: typeof input.eyebrow === "string" ? input.eyebrow.trim() : "",
    title: typeof input.title === "string" ? input.title.trim() : "",
    dek: typeof input.dek === "string" ? input.dek.trim() : "",
    dateLabel: typeof input.dateLabel === "string" ? input.dateLabel.trim() : "",
    description: typeof input.description === "string" ? input.description.trim() : "",
    heroStoryId: typeof input.heroStoryId === "string" ? input.heroStoryId.trim() || undefined : undefined,
    latestStoryIds: Array.from(new Set((input.latestStoryIds ?? []).map((id) => id.trim()).filter(Boolean))),
    sections: toCoverageHubSections(input.sections ?? []),
    picksTitle: typeof input.picksTitle === "string" ? input.picksTitle.trim() || undefined : undefined,
    picksDescription: typeof input.picksDescription === "string" ? input.picksDescription.trim() || undefined : undefined,
    picks: toCoverageHubPicks(input.picks ?? []),
    notes: Array.from(new Set((input.notes ?? []).map((note) => note.trim()).filter(Boolean))),
    updatedAt: input.updatedAt ?? null,
    updatedBy: input.updatedBy ?? null,
  };
}

function fromCoverageHubRow(row: CoverageHubRow): CoverageHubStored {
  return normalizeCoverageHub({
    slug: row.slug,
    eyebrow: row.eyebrow ?? "",
    title: row.title ?? "",
    dek: row.dek ?? "",
    dateLabel: row.date_label ?? "",
    description: row.description ?? "",
    heroStoryId: toNullableString(row.hero_story_id) ?? undefined,
    latestStoryIds: toStringArray(row.latest_story_ids),
    sections: toCoverageHubSections(row.sections),
    picksTitle: toNullableString(row.picks_title) ?? undefined,
    picksDescription: toNullableString(row.picks_description) ?? undefined,
    picks: toCoverageHubPicks(row.picks),
    notes: toStringArray(row.notes),
    updatedAt: row.updated_at ?? null,
    updatedBy: row.updated_by ?? null,
  });
}

async function loadCoverageHubOverrides() {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("coverage_hubs")
    .select("slug, eyebrow, title, dek, date_label, description, hero_story_id, latest_story_ids, sections, picks_title, picks_description, picks, notes, updated_at, updated_by")
    .order("slug", { ascending: true });

  if (error) {
    if (/relation .* does not exist/i.test(error.message)) {
      return [] as CoverageHubStored[];
    }

    throw new Error(error.message);
  }

  return ((data ?? []) as CoverageHubRow[]).map(fromCoverageHubRow);
}

export async function listCoverageHubs() {
  const defaults = listDefaultCoverageHubDefinitions();
  const overrides = await loadCoverageHubOverrides();
  const overrideBySlug = new Map(overrides.map((hub) => [hub.slug, hub]));
  const merged = defaults.map((hub) => mergeCoverageHubDefinition(hub, overrideBySlug.get(hub.slug)));
  const custom = overrides.filter((hub) => !defaults.some((defaultHub) => defaultHub.slug === hub.slug));
  return [...merged, ...custom];
}

export async function getCoverageHub(slug: string) {
  const hubs = await listCoverageHubs();
  return hubs.find((hub) => hub.slug === slug) ?? null;
}

export async function upsertCoverageHub(input: Partial<CoverageHubDefinition> & { slug: string }, updatedBy: string) {
  const normalized = normalizeCoverageHub(input);
  const base = getDefaultCoverageHubDefinition(normalized.slug);
  const merged = base ? mergeCoverageHubDefinition(base, normalized) : normalized;
  const supabase = supabaseServer();

  const payload = {
    slug: merged.slug,
    eyebrow: merged.eyebrow,
    title: merged.title,
    dek: merged.dek,
    date_label: merged.dateLabel,
    description: merged.description,
    hero_story_id: merged.heroStoryId ?? null,
    latest_story_ids: merged.latestStoryIds,
    sections: merged.sections,
    picks_title: merged.picksTitle ?? null,
    picks_description: merged.picksDescription ?? null,
    picks: merged.picks,
    notes: merged.notes ?? [],
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  };

  const { data, error } = await supabase
    .from("coverage_hubs")
    .upsert(payload, { onConflict: "slug" })
    .select("slug, eyebrow, title, dek, date_label, description, hero_story_id, latest_story_ids, sections, picks_title, picks_description, picks, notes, updated_at, updated_by")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const stored = fromCoverageHubRow(data as CoverageHubRow);
  return base ? mergeCoverageHubDefinition(base, stored) : stored;
}
