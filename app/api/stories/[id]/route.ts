export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase.server";
import type { StoryWithViews, Source, Entity } from "@/app/lib/types";

type StoryRow = {
  id: string;
  title: string;
  summary: unknown;
  sources: unknown;
  date: string;
  urgent?: boolean;
  topics?: unknown;
  tags?: unknown;
  entities?: unknown;
  primary_entities?: unknown;
  comments?: number | null;
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

function coerceStory(row: StoryRow, views: number): StoryWithViews {
  return {
    id: row.id,
    title: row.title,
    summary: toStringArray(row.summary),
    sources: toSources(row.sources),
    date: row.date,
    urgent: Boolean(row.urgent),
    topics: toStringArray(row.topics),
    tags: toStringArray(row.tags),
    entities: toEntities(row.entities),
    primary_entities: toStringArray(row.primary_entities),
    comments: Number(row.comments ?? 0),
    views,
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = supabaseServer();
    const id = (await params).id;

    const { data, error } = await supabase.from("stories").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: viewRow, error: viewError } = await supabase
      .from("story_views")
      .select("views")
      .eq("story_id", id)
      .maybeSingle();
    if (viewError) throw viewError;

    const story = coerceStory(data as StoryRow, Number(viewRow?.views ?? 0));
    return NextResponse.json(story);
  } catch (e: unknown) {
    return NextResponse.json({ error: messageFromError(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!requireAdmin(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = supabaseServer();
    const id = (await params).id;

    await supabase.from("story_views").delete().eq("story_id", id);

    const { error } = await supabase.from("stories").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: messageFromError(e) }, { status: 500 });
  }
}
