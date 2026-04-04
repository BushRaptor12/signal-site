export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { deleteStoryImage } from "@/app/lib/story-images";
import { supabaseServer } from "@/app/lib/supabase.server";
import { coerceStory, type StoryDbRow } from "@/app/lib/stories";

function messageFromError(e: unknown) {
  if (e instanceof Error) return e.message;
  return String(e);
}

function requireAdmin(req: Request) {
  const expected = process.env.ADMIN_TOKEN;
  const got = req.headers.get("x-admin-token");
  return Boolean(expected && got && got === expected);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = supabaseServer();
    const id = (await params).id;

    const { data, error } = await supabase.from("stories").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const story = coerceStory(data as StoryDbRow);
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

    const { data: existing, error: existingError } = await supabase
      .from("stories")
      .select("image_path")
      .eq("id", id)
      .maybeSingle();
    if (existingError) throw existingError;

    const { error } = await supabase.from("stories").delete().eq("id", id);
    if (error) throw error;

    await deleteStoryImage(supabase, existing?.image_path ?? null);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: messageFromError(e) }, { status: 500 });
  }
}
