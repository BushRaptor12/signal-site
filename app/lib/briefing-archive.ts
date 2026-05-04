import { createHash } from "node:crypto";
import { buildBriefingLayout, type BriefingLayout } from "@/app/lib/briefing-layout";
import { coerceStory, type StoryDbRow } from "@/app/lib/stories";
import { supabaseServer } from "@/app/lib/supabase.server";
import type { BriefingLeadStyle, BriefingPosition, Source, StoryImageDisplay, StoryWithViews } from "@/app/lib/types";

export type BriefingArchiveStory = {
  beacon_headline: string | null;
  beacon_lead_style: BriefingLeadStyle | null;
  beacon_order: number | null;
  beacon_position: BriefingPosition | null;
  beacon_summary: string | null;
  content_updated_at?: string;
  created_at?: string;
  date: string;
  id: string;
  image_display?: StoryImageDisplay | null;
  image_focus_x?: number | null;
  image_focus_y?: number | null;
  image_show_on_briefing?: boolean;
  image_url?: string | null;
  sources: Source[];
  summary: string[];
  title: string;
  topics: string[];
  updated_at?: string;
};

export type BriefingArchiveSnapshot = {
  captured_at: string;
  leftColumn: BriefingArchiveStory[];
  lead: BriefingArchiveStory | null;
  rightColumn: BriefingArchiveStory[];
  story_count: number;
};

export type BriefingArchiveListItem = {
  archive_key: string;
  captured_at: string;
  slot: "am" | "pm";
  story_count: number;
};

export type BriefingArchiveRecord = BriefingArchiveListItem & {
  briefing_updated_at: string | null;
  content_hash: string;
  snapshot: BriefingArchiveSnapshot;
};

type BriefingArchiveDbRow = {
  archive_key: string;
  briefing_updated_at: string | null;
  captured_at: string;
  content_hash: string;
  slot: "am" | "pm";
  snapshot: BriefingArchiveSnapshot | string | null;
  story_count: number;
};

type BriefingMetaRow = {
  updated_at: string | null;
};

function toArchiveStory(story: StoryWithViews): BriefingArchiveStory {
  return {
    beacon_headline: story.beacon_headline ?? null,
    beacon_lead_style: story.beacon_lead_style ?? null,
    beacon_order: story.beacon_order ?? null,
    beacon_position: story.beacon_position ?? null,
    beacon_summary: story.beacon_summary ?? null,
    content_updated_at: story.content_updated_at,
    created_at: story.created_at,
    date: story.date,
    id: story.id,
    image_display: story.image_display ?? null,
    image_focus_x: story.image_focus_x ?? null,
    image_focus_y: story.image_focus_y ?? null,
    image_show_on_briefing: story.image_show_on_briefing ?? true,
    image_url: story.image_url ?? null,
    sources: story.sources,
    summary: story.summary,
    title: story.title,
    topics: story.topics,
    updated_at: story.updated_at,
  };
}

function stableStringify(value: unknown) {
  return JSON.stringify(value);
}

function contentHash(snapshot: BriefingArchiveSnapshot) {
  return createHash("sha256").update(stableStringify(snapshot)).digest("hex");
}

function archiveSlot(date: Date) {
  return date.getUTCHours() < 12 ? "am" : "pm";
}

function archiveDateKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function briefingArchiveKey(date = new Date()) {
  return `${archiveDateKey(date)}-${archiveSlot(date)}`;
}

function snapshotFromLayout(layout: BriefingLayout, capturedAt: string): BriefingArchiveSnapshot {
  const lead = layout.lead ? toArchiveStory(layout.lead) : null;
  const leftColumn = layout.leftColumn.map(toArchiveStory);
  const rightColumn = layout.rightColumn.map(toArchiveStory);

  return {
    captured_at: capturedAt,
    lead,
    leftColumn,
    rightColumn,
    story_count: [lead, ...leftColumn, ...rightColumn].filter(Boolean).length,
  };
}

function coerceSnapshot(value: BriefingArchiveDbRow["snapshot"]): BriefingArchiveSnapshot | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as BriefingArchiveSnapshot;
    } catch {
      return null;
    }
  }

  return value;
}

function coerceArchive(row: BriefingArchiveDbRow): BriefingArchiveRecord | null {
  const snapshot = coerceSnapshot(row.snapshot);
  if (!snapshot) return null;

  return {
    archive_key: row.archive_key,
    briefing_updated_at: row.briefing_updated_at,
    captured_at: row.captured_at,
    content_hash: row.content_hash,
    slot: row.slot,
    snapshot,
    story_count: row.story_count,
  };
}

export async function loadCurrentBriefingLayout() {
  const supabase = supabaseServer();
  const [{ data, error }, { data: metaData }] = await Promise.all([
    supabase
      .from("stories")
      .select("*")
      .eq("status", "published")
      .eq("beacon_include", true)
      .order("beacon_position", { ascending: true, nullsFirst: false })
      .order("beacon_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase.from("briefing_meta").select("updated_at").eq("id", 1).maybeSingle(),
  ]);

  if (error) throw error;

  return {
    briefingUpdatedAt: ((metaData as BriefingMetaRow | null)?.updated_at ?? null) as string | null,
    layout: buildBriefingLayout(((data ?? []) as StoryDbRow[]).map(coerceStory)),
  };
}

export async function createBriefingArchiveSnapshot(now = new Date()) {
  const capturedAt = now.toISOString();
  const archive_key = briefingArchiveKey(now);
  const slot = archiveSlot(now);
  const { briefingUpdatedAt, layout } = await loadCurrentBriefingLayout();
  const snapshot = snapshotFromLayout(layout, capturedAt);
  const nextHash = contentHash({
    ...snapshot,
    captured_at: "",
  });
  const supabase = supabaseServer();

  const { data: previousRows, error: previousError } = await supabase
    .from("briefing_archives")
    .select("archive_key, content_hash")
    .order("captured_at", { ascending: false })
    .limit(1);

  if (previousError && !/briefing_archives/i.test(previousError.message)) {
    throw previousError;
  }

  const previous = (previousRows ?? [])[0] as { archive_key?: string; content_hash?: string } | undefined;
  if (previous?.archive_key !== archive_key && previous?.content_hash === nextHash) {
    return {
      archiveKey: previous.archive_key ?? archive_key,
      created: false,
      reason: "unchanged",
      storyCount: snapshot.story_count,
    };
  }

  const { error } = await supabase.from("briefing_archives").upsert(
    {
      archive_key,
      briefing_updated_at: briefingUpdatedAt,
      captured_at: capturedAt,
      content_hash: nextHash,
      slot,
      snapshot,
      story_count: snapshot.story_count,
      updated_at: capturedAt,
    },
    { onConflict: "archive_key" }
  );

  if (error) throw error;

  return {
    archiveKey: archive_key,
    created: true,
    reason: "snapshot_saved",
    storyCount: snapshot.story_count,
  };
}

export async function listBriefingArchives(limit = 30): Promise<BriefingArchiveListItem[]> {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("briefing_archives")
    .select("archive_key, captured_at, slot, story_count")
    .order("captured_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (/briefing_archives/i.test(error.message)) return [];
    throw error;
  }

  return ((data ?? []) as BriefingArchiveListItem[]).filter((item) => Boolean(item.archive_key));
}

export async function getBriefingArchive(archiveKey: string): Promise<BriefingArchiveRecord | null> {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("briefing_archives")
    .select("archive_key, briefing_updated_at, captured_at, content_hash, slot, snapshot, story_count")
    .eq("archive_key", archiveKey)
    .maybeSingle();

  if (error) {
    if (/briefing_archives/i.test(error.message)) return null;
    throw error;
  }

  return data ? coerceArchive(data as BriefingArchiveDbRow) : null;
}
