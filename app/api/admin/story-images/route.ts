export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requestHasAdminAccess } from "@/app/lib/admin.server";
import {
  buildStoryImagePath,
  deleteStoryImage,
  isStoryImagePath,
  isSupportedStoryImageType,
  STORY_IMAGE_BUCKET,
  STORY_IMAGE_MAX_BYTES,
  storyImagePublicUrl,
} from "@/app/lib/story-images";
import { supabaseServer } from "@/app/lib/supabase.server";

function messageFromError(e: unknown) {
  if (e instanceof Error) return e.message;
  return String(e);
}

export async function POST(req: Request) {
  try {
    if (!(await requestHasAdminAccess(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const storyId = String(formData.get("storyId") ?? "");
    const previousPath = String(formData.get("previousPath") ?? "").trim() || null;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }
    if (!storyId.trim()) {
      return NextResponse.json({ error: "Story ID is required." }, { status: 400 });
    }
    if (!isSupportedStoryImageType(file.type)) {
      return NextResponse.json({ error: "Use a JPG, PNG, WEBP, or GIF image." }, { status: 400 });
    }
    if (file.size > STORY_IMAGE_MAX_BYTES) {
      return NextResponse.json({ error: "Image must be 5MB or smaller." }, { status: 400 });
    }

    const path = buildStoryImagePath(storyId, file.name, file.type);
    if (!path) {
      return NextResponse.json({ error: "Could not determine an image file extension." }, { status: 400 });
    }

    const supabase = supabaseServer();
    const { error } = await supabase.storage.from(STORY_IMAGE_BUCKET).upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });
    if (error) throw error;

    if (previousPath && isStoryImagePath(previousPath)) {
      await deleteStoryImage(supabase, previousPath);
    }

    return NextResponse.json({
      imagePath: path,
      imageUrl: storyImagePublicUrl(supabase, path),
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: messageFromError(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    if (!(await requestHasAdminAccess(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as { imagePath?: string | null } | null;
    const imagePath = body?.imagePath?.trim() ?? "";
    if (!isStoryImagePath(imagePath)) {
      return NextResponse.json({ error: "Invalid story image path." }, { status: 400 });
    }

    const supabase = supabaseServer();
    await deleteStoryImage(supabase, imagePath);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: messageFromError(e) }, { status: 500 });
  }
}
