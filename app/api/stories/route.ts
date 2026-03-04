export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase.server";
import type { StoryWithViews, Source, Entity } from "@/app/lib/types";

type StoryDbRow = {
  id: string;
  title: string;
  summary: unknown;
  sources: unknown;
  date: string;
  views?: number | null;
  urgent?: boolean;
  topics?: unknown;
  tags?: unknown;
  entities?: unknown;
  primary_entities?: unknown;
  comments?: number | null;
  created_at?: string | null;
};

function messageFromError(e: unknown) {
  if (e instanceof Error) return e.message;
  return String(e);
}

function requireAdmin(req: Request) {
  const expected = process.env.ADMIN_TOKEN;
  const got = req.headers.get("x-admin-token");
  return Boolean(expected && got && got === expected);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v)).filter(Boolean);
}

function toSources(value: unknown): Source[] {
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

function toEntities(value: unknown): Entity[] {
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

function coerceStory(row: StoryDbRow): StoryWithViews {
  return {
    id: row.id,
    title: row.title,
    summary: toStringArray(row.summary),
    sources: toSources(row.sources),
    date: row.date,
    created_at: row.created_at ?? undefined,
    urgent: Boolean(row.urgent),
    topics: toStringArray(row.topics),
    tags: toStringArray(row.tags),
    entities: toEntities(row.entities),
    primary_entities: toStringArray(row.primary_entities),
    comments: Number(row.comments ?? 0),
    views: Number(row.views ?? 0),
  };
}

export async function GET() {
  try {
    const supabase = supabaseServer();

    const { data: stories, error: storiesError } = await supabase.from("stories").select("*").order("created_at", {
      ascending: false,
    });
    if (storiesError) throw storiesError;

    const merged = ((stories ?? []) as StoryDbRow[]).map((story) => coerceStory(story));
    return NextResponse.json(merged);
  } catch (e: unknown) {
    return NextResponse.json({ error: messageFromError(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (!requireAdmin(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const incoming = (await req.json()) as Partial<StoryWithViews>;
    if (!incoming?.id || !incoming?.title || !incoming?.date) {
      return NextResponse.json({ error: "Story must include id, title, date." }, { status: 400 });
    }

    const story = {
      id: String(incoming.id),
      title: String(incoming.title),
      summary: toStringArray(incoming.summary),
      sources: toSources(incoming.sources),
      date: String(incoming.date),
      topics: toStringArray(incoming.topics),
      tags: toStringArray(incoming.tags),
      entities: toEntities(incoming.entities),
      primary_entities: toStringArray(incoming.primary_entities),
      comments: Number(incoming.comments ?? 0),
      urgent: Boolean(incoming.urgent),
      updated_at: new Date().toISOString(),
    };

    const supabase = supabaseServer();
    const { error } = await supabase.from("stories").upsert(story, { onConflict: "id" });
    if (error) throw error;

    return NextResponse.json({ ok: true, story });
  } catch (e: unknown) {
    return NextResponse.json({ error: messageFromError(e) }, { status: 500 });
  }
}
