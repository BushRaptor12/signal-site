export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requestHasAdminAccess } from "@/app/lib/admin.server";
import { deleteStoryImage } from "@/app/lib/story-images";
import { supabaseServer } from "@/app/lib/supabase.server";
import { coerceStory, type StoryDbRow } from "@/app/lib/stories";

function messageFromError(e: unknown) {
  if (e instanceof Error) return e.message;
  return String(e);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = supabaseServer();
    const id = (await params).id;
    const adminAccess = await requestHasAdminAccess(req);

    let query = supabase.from("stories").select("*").eq("id", id);
    if (!adminAccess) {
      query = query.eq("status", "published");
    }

    const { data, error } = await query.maybeSingle();
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
    if (!(await requestHasAdminAccess(req))) {
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
