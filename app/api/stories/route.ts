export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase.server";
import type { StoryWithViews } from "@/app/lib/types";
import {
  coerceStory,
  toEntities,
  toNullableNumber,
  toNullableString,
  toSources,
  toStringArray,
  type StoryDbRow,
} from "@/app/lib/stories";

function messageFromError(e: unknown) {
  if (e instanceof Error) return e.message;
  return String(e);
}

function requireAdmin(req: Request) {
  const expected = process.env.ADMIN_TOKEN;
  const got = req.headers.get("x-admin-token");
  return Boolean(expected && got && got === expected);
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
      beacon_include: Boolean(incoming.beacon_include),
      beacon_rank: toNullableNumber(incoming.beacon_rank),
      beacon_headline: toNullableString(incoming.beacon_headline),
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
