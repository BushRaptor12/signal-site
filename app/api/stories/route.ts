export const runtime = "nodejs";

import { NextResponse } from "next/server";
import type { Story } from "@/app/lib/types";
import { supabaseServer } from "@/app/lib/supabase.server";

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

// If you still have views like "12.4k" somewhere, normalize to a number
function parseViews(v: any): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return 0;

  const s = v.trim().toLowerCase();
  const mult = s.endsWith("k") ? 1_000 : s.endsWith("m") ? 1_000_000 : 1;
  const num = parseFloat(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(num) ? Math.round(num * mult) : 0;
}

export async function GET() {
  try {
    const supabase = supabaseServer();

    const { data, error } = await supabase
      .from("stories")
      .select("*")
      .order("date", { ascending: false });

    if (error) throw error;

    // Ensure shape matches your Story type expectations
    const stories = (data ?? []).map((row: any) => ({
      ...row,
      views: typeof row.views === "number" ? row.views : parseViews(row.views),
      comments: typeof row.comments === "number" ? row.comments : Number(row.comments ?? 0),
    })) as Story[];

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

    // Upsert (insert or update)
    const payload = {
      ...incoming,
      views: parseViews((incoming as any).views),
      comments: Number((incoming as any).comments ?? 0),
      // match your DB column names if different:
      primary_entities: (incoming as any).primaryEntities ?? incoming.primaryEntities ?? (incoming as any).primary_entities ?? [],
    };

    // If your Story type uses camelCase like primaryEntities,
    // you may want to explicitly map fields instead of spreading.

    const { error } = await supabase
      .from("stories")
      .upsert(payload, { onConflict: "id" });

    if (error) throw error;

    return NextResponse.json({ ok: true, story: incoming });
  } catch (e: unknown) {
    return NextResponse.json(formatError("POST /api/stories failed", e), { status: 500 });
  }
}