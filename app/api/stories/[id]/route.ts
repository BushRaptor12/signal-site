export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase.server";

function formatError(prefix: string, e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return { error: `${prefix}: ${msg}` };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const id = params.id;

    const supabase = supabaseServer();

    const { data, error } = await supabase
      .from("stories")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;

    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json(formatError("GET /api/stories/[id] failed", e), { status: 500 });
  }
}