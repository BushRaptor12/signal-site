export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase.server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = supabaseServer();
    const id = (await params).id;

    const { data, error } = await supabase
      .from("stories")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // attach views
    const { data: v, error: vErr } = await supabase
      .from("story_views")
      .select("views")
      .eq("story_id", id)
      .maybeSingle();

    if (vErr) throw vErr;

    return NextResponse.json({ ...data, views: Number(v?.views ?? 0) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
