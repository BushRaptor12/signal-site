export const runtime = "nodejs";

import { NextResponse } from "next/server";
import type { Story } from "@/app/lib/types";
import { supabaseServer } from "@/app/lib/supabase.server";

type RawStoryRow = Partial<Story> & {
  primary_entities?: unknown;
};

type StorySource = Story["sources"][number];
type StoryEntity = NonNullable<Story["entities"]>[number];

function formatError(prefix: string, e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return { error: `${prefix}: ${msg}` };
}

function requireAdmin(req: Request) {
  const token = req.headers.get("x-admin-token");
  const expected = process.env.ADMIN_TOKEN;

  if (!expected) throw new Error("ADMIN_TOKEN is not set on the server.");
  if (!token || token !== expected) return false;
  return true;
}

function parseViews(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return 0;

  const s = v.trim().toLowerCase();
  const mult = s.endsWith("k") ? 1_000 : s.endsWith("m") ? 1_000_000 : 1;
  const num = parseFloat(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(num) ? Math.round(num * mult) : 0;
}

function parseComments(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v)).filter(Boolean);
}

function toSources(value: unknown): StorySource[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item !== "object" || item === null) return null;
      const source = item as Partial<StorySource>;
      const name = typeof source.name === "string" ? source.name : "";
      const url = typeof source.url === "string" ? source.url : "";
      const lean = source.lean === "Left" || source.lean === "Center" || source.lean === "Right" ? source.lean : "Center";
      if (!name || !url) return null;
      return { name, url, lean };
    })
    .filter((item): item is StorySource => Boolean(item));
}

function toEntities(value: unknown): StoryEntity[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entities = value
    .map((item) => {
      if (typeof item !== "object" || item === null) return null;
      const entity = item as Partial<StoryEntity>;
      const name = typeof entity.name === "string" ? entity.name : "";
      if (!name) return null;
      const aliases = toStringArray(entity.aliases);
      return { name, aliases };
    })
    .filter((item): item is StoryEntity => Boolean(item));
  return entities.length ? entities : [];
}

function normalizeStory(row: RawStoryRow): Story | null {
  const id = typeof row.id === "string" ? row.id : "";
  const title = typeof row.title === "string" ? row.title : "";
  if (!id || !title) return null;

  return {
    id,
    title,
    summary: toStringArray(row.summary),
    sources: toSources(row.sources),
    views: parseViews(row.views),
    comments: parseComments(row.comments),
    date: typeof row.date === "string" ? row.date : new Date().toISOString().slice(0, 10),
    tags: toStringArray(row.tags),
    topics: toStringArray(row.topics),
    entities: toEntities(row.entities),
    primaryEntities: toStringArray(row.primaryEntities ?? row.primary_entities),
  };
}

export async function GET() {
  try {
    const supabase = supabaseServer();

    const { data, error } = await supabase
      .from("stories")
      .select("*")
      .order("date", { ascending: false });

    if (error) throw error;

    const stories = (data ?? [])
      .map((row) => normalizeStory(row as RawStoryRow))
      .filter((story): story is Story => Boolean(story));

    return NextResponse.json(stories);
  } catch (e: unknown) {
    return NextResponse.json(formatError("GET /api/stories failed", e), { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    // 🔒 lock down writes
    if (!requireAdmin(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const incoming = (await req.json()) as Story;

    if (!incoming?.id || !incoming?.title) {
      return NextResponse.json(
        { error: "Story must include at least id and title." },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();

    const normalizedIncoming = normalizeStory(incoming);
    if (!normalizedIncoming) {
      return NextResponse.json({ error: "Incoming story has invalid shape." }, { status: 400 });
    }

    const payload = {
      ...normalizedIncoming,
      primary_entities: normalizedIncoming.primaryEntities ?? [],
    };

    const { error } = await supabase
      .from("stories")
      .upsert(payload, { onConflict: "id" });

    if (error) throw error;

    return NextResponse.json({ ok: true, story: incoming });
  } catch (e: unknown) {
    return NextResponse.json(formatError("POST /api/stories failed", e), { status: 500 });
  }
}
