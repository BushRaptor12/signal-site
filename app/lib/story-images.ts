import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "@/app/lib/vocab";

export const STORY_IMAGE_BUCKET = "story-images";
export const STORY_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const STORY_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

const STORY_IMAGE_MIME_TO_EXT: Record<string, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const STORY_IMAGE_EXTENSIONS = new Set(Object.values(STORY_IMAGE_MIME_TO_EXT));
const STORY_IMAGE_PATH_RE = /^[a-z0-9-]+\/\d+-[a-z0-9-]+\.(gif|jpg|png|webp)$/;

export function isSupportedStoryImageType(type: string) {
  return Boolean(STORY_IMAGE_MIME_TO_EXT[String(type).toLowerCase()]);
}

function sanitizeBaseName(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  return slugify(withoutExtension) || "story-image";
}

function extensionFromFile(fileName: string, mimeType: string) {
  const byMime = STORY_IMAGE_MIME_TO_EXT[String(mimeType).toLowerCase()];
  if (byMime) return byMime;

  const fromName = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (STORY_IMAGE_EXTENSIONS.has(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }

  return null;
}

export function buildStoryImagePath(storyId: string, fileName: string, mimeType: string) {
  const safeStoryId = slugify(storyId) || "story";
  const safeFileName = sanitizeBaseName(fileName);
  const extension = extensionFromFile(fileName, mimeType);

  if (!extension) return null;

  return `${safeStoryId}/${Date.now()}-${safeFileName}.${extension}`;
}

export function isStoryImagePath(value: string | null | undefined): value is string {
  return Boolean(value && STORY_IMAGE_PATH_RE.test(value));
}

export function storyImagePublicUrl(supabase: SupabaseClient, path: string) {
  return supabase.storage.from(STORY_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function deleteStoryImage(supabase: SupabaseClient, path: string | null | undefined) {
  if (!isStoryImagePath(path)) return;
  await supabase.storage.from(STORY_IMAGE_BUCKET).remove([path]);
}
