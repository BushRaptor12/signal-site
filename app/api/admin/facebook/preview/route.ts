export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requestHasAdminAccess } from "@/app/lib/admin.server";
import { renderFacebookPostImage } from "@/app/lib/facebook-posts.server";
import { isSupportedStoryImageType, STORY_IMAGE_MAX_BYTES } from "@/app/lib/story-images";
import { supabaseServer } from "@/app/lib/supabase.server";
import { coerceStory, type StoryDbRow } from "@/app/lib/stories";

export async function POST(request: Request) {
  if (!(await requestHasAdminAccess(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const storyId = String(formData.get("storyId") ?? "").trim();
    const headline = String(formData.get("headline") ?? "").trim();
    const date = String(formData.get("date") ?? "").trim();
    const focusX = Number(formData.get("focusX"));
    const focusY = Number(formData.get("focusY"));
    const isDownload = formData.get("download") === "true";
    const imageFile = formData.get("image");
    if (!storyId || !headline || !date) {
      return NextResponse.json({ error: "Choose a story, headline, and date." }, { status: 400 });
    }
    if (imageFile instanceof File && !isSupportedStoryImageType(imageFile.type)) {
      return NextResponse.json({ error: "Use a JPG, PNG, WEBP, or GIF image." }, { status: 400 });
    }
    if (imageFile instanceof File && imageFile.size > STORY_IMAGE_MAX_BYTES) {
      return NextResponse.json({ error: "The uploaded image must be 5 MB or smaller." }, { status: 400 });
    }

    const supabase = supabaseServer();
    const { data, error } = await supabase.from("stories").select("*").eq("id", storyId).eq("status", "published").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Choose a published story." }, { status: 404 });

    const story = coerceStory(data as StoryDbRow);
    const imageBuffer = imageFile instanceof File ? Buffer.from(await imageFile.arrayBuffer()) : null;
    if (!story.image_url && !imageBuffer) return NextResponse.json({ error: "Upload an image for this Facebook post before previewing it." }, { status: 400 });

    const image = await renderFacebookPostImage({
      date,
      focusX: Number.isFinite(focusX) ? focusX : null,
      focusY: Number.isFinite(focusY) ? focusY : null,
      headline,
      outputSize: isDownload ? 2400 : 1200,
      imageBuffer,
      imageUrl: imageBuffer ? null : story.image_url,
    });
    return new NextResponse(new Uint8Array(image), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Length": String(image.byteLength),
        "Content-Type": "image/png",
        "Content-Disposition": `${isDownload ? "attachment" : "inline"}; filename="the-beacon-facebook-post${isDownload ? "-hd" : ""}.png"`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "We couldn't create the image preview.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
