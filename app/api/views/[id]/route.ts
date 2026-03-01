export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase.server";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = supabaseServer();
    const id = params.id;

    // 1) ensure exists
    await supabase
      .from("story_views")
      .upsert({ story_id: id, views: 0, updated_at: new Date().toISOString() }, { onConflict: "story_id" });

    // 2) increment (two-step; fine for MVP)
    const { data, error } = await supabase
      .from("story_views")
      .select("views")
      .eq("story_id", id)
      .maybeSingle();

    if (error) throw error;

    const next = Number(data?.views ?? 0) + 1;

    const { error: uErr } = await supabase
      .from("story_views")
      .update({ views: next, updated_at: new Date().toISOString() })
      .eq("story_id", id);

    if (uErr) throw uErr;

    return NextResponse.json({ ok: true, views: next });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}