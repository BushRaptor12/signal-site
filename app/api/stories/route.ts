export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase.server";
import type { StoryWithViews } from "@/app/lib/types";

function normalize(s: string) {
  return String(s).trim().toLowerCase();
}

function requireAdmin(req: Request) {
  const expected = process.env.ADMIN_TOKEN;
  const got = req.headers.get("x-admin-token");
  return Boolean(expected && got && got === expected);
}

export async function GET() {
  try {
    const supabase = supabaseServer();

    const { data: stories, error: sErr } = await supabase
      .from("stories")
      .select("*")
      .order("date", { ascending: false });

    if (sErr) throw sErr;

    const { data: viewsRows, error: vErr } = await supabase
      .from("story_views")
      .select("story_id, views");

    if (vErr) throw vErr;

    const viewMap = new Map<string, number>();
    (viewsRows ?? []).forEach((r: any) => viewMap.set(r.story_id, Number(r.views ?? 0)));

    const merged: StoryWithViews[] = (stories ?? []).map((s: any) => ({
      ...s,
      views: viewMap.get(s.id) ?? 0,
      comments: Number(s.comments ?? 0),
      // ensure arrays exist
      summary: Array.isArray(s.summary) ? s.summary : [],
      sources: Array.isArray(s.sources) ? s.sources : [],
      topics: Array.isArray(s.topics) ? s.topics : [],
      tags: Array.isArray(s.tags) ? s.tags : [],
      entities: Array.isArray(s.entities) ? s.entities : [],
      primary_entities: Array.isArray(s.primary_entities) ? s.primary_entities : [],
    }));

    return NextResponse.json(merged);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (!requireAdmin(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const incoming = (await req.json()) as any;

    if (!incoming?.id || !incoming?.title || !incoming?.date) {
      return NextResponse.json({ error: "Story must include id, title, date." }, { status: 400 });
    }

    // normalize key arrays
    const story = {
      id: normalize(incoming.id) === incoming.id ? incoming.id : incoming.id,
      title: String(incoming.title),
      summary: Array.isArray(incoming.summary) ? incoming.summary : [],
      sources: Array.isArray(incoming.sources) ? incoming.sources : [],
      date: String(incoming.date),
      topics: Array.isArray(incoming.topics) ? incoming.topics : [],
      tags: Array.isArray(incoming.tags) ? incoming.tags : [],
      entities: Array.isArray(incoming.entities) ? incoming.entities : [],
      primary_entities: Array.isArray(incoming.primary_entities) ? incoming.primary_entities : [],
      comments: Number(incoming.comments ?? 0),
      updated_at: new Date().toISOString(),
      urgent: Boolean(incoming.urgent ?? false),
    };

    const supabase = supabaseServer();

    const { error } = await supabase
      .from("stories")
      .upsert(story, { onConflict: "id" });

    if (error) throw error;

    // ensure a views row exists
    await supabase
      .from("story_views")
      .upsert({ story_id: story.id, views: 0, updated_at: new Date().toISOString() }, { onConflict: "story_id" });

    return NextResponse.json({ ok: true, story });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}