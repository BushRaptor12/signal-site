export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase.server";

function messageFromError(e: unknown) {
  if (e instanceof Error) return e.message;
  return String(e);
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = supabaseServer();
    const id = (await params).id;

    const { error: incrementError } = await supabase.rpc("increment_story_views", { story_id: id });
    if (incrementError) throw incrementError;

    const { data: row, error: readError } = await supabase
      .from("stories")
      .select("views")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw readError;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true, views: Number(row.views ?? 0) });
  } catch (e: unknown) {
    return NextResponse.json({ error: messageFromError(e) }, { status: 500 });
  }
}
