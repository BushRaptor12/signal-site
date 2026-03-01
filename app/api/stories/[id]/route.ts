function requireAdmin(req: Request) {
  const expected = process.env.ADMIN_TOKEN;
  const got = req.headers.get("x-admin-token");
  return Boolean(expected && got && got === expected);
}
export const runtime = "nodejs";
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!requireAdmin(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = supabaseServer();
    const id = (await params).id;

    // delete views first (safe)
    await supabase.from("story_views").delete().eq("story_id", id);

    // delete story
    const { error } = await supabase.from("stories").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
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
