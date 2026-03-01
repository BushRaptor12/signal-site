import fs from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import type { Story } from "@/app/lib/types";

const dataPath = path.join(process.cwd(), "app", "data", "stories.json");
const dataDir = path.dirname(dataPath);
const storiesTable = process.env.SUPABASE_STORIES_TABLE ?? "stories";

type SupabaseRow = {
  id: string;
  data: Story | null;
};

type CodedError = Error & {
  code?: string;
  hint?: string;
};

function normalize(value: string) {
  return String(value).trim().toLowerCase();
}

function errorCode(e: unknown) {
  if (typeof e === "object" && e !== null && "code" in e) {
    return String((e as { code?: unknown }).code ?? "");
  }
  return "";
}

function errorMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e) {
    return String((e as { message?: unknown }).message ?? "");
  }
  return String(e);
}

function makeError(message: string, code?: string, hint?: string) {
  const err = new Error(message) as CodedError;
  if (code) err.code = code;
  if (hint) err.hint = hint;
  return err;
}

function sanitizeEnvValue(value?: string) {
  if (!value) return "";
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function getEnvFirst(keys: string[]) {
  for (const key of keys) {
    const raw = process.env[key];
    const value = sanitizeEnvValue(raw);
    if (value) return value;
  }
  return "";
}

function getSupabaseAdmin() {
  const url = getEnvFirst(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"]);
  const serviceKey = getEnvFirst(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"]);

  const isPlaceholder = (value: string) =>
    value.trim() === "" || value.trim() === "..." || value.includes("your-");

  if (!url || !serviceKey) return null;
  if (isPlaceholder(url) || isPlaceholder(serviceKey)) return null;
  if (!url.startsWith("http://") && !url.startsWith("https://")) return null;

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function readStoriesFromFile(options?: { tolerant?: boolean }) {
  const tolerant = options?.tolerant ?? false;

  try {
    const raw = await fs.readFile(dataPath, "utf8");
    const trimmed = raw.trim();
    if (!trimmed) return [];

    try {
      const parsed: unknown = JSON.parse(trimmed);
      return Array.isArray(parsed) ? (parsed as Story[]) : [];
    } catch (e: unknown) {
      if (tolerant) return [];
      throw e;
    }
  } catch (e: unknown) {
    const code = errorCode(e);
    if (code === "ENOENT") return [];
    if (code === "EROFS" || code === "EPERM" || code === "EACCES") {
      throw makeError(
        "Local file storage is not writable in this environment.",
        "READ_ONLY_FS",
        "Use Supabase by setting NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)."
      );
    }
    throw e;
  }
}

async function writeStoriesToFile(stories: Story[]) {
  try {
    await fs.mkdir(dataDir, { recursive: true });
    const payload = JSON.stringify(stories, null, 2);
    const tempPath = `${dataPath}.tmp`;
    await fs.writeFile(tempPath, payload, "utf8");
    await fs.rename(tempPath, dataPath);
  } catch (e: unknown) {
    const code = errorCode(e);
    if (code === "EROFS" || code === "EPERM" || code === "EACCES") {
      throw makeError(
        "Local file storage is not writable in this environment.",
        "READ_ONLY_FS",
        "Use Supabase by setting NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)."
      );
    }
    throw e;
  }
}

function normalizeSupabaseError(e: unknown) {
  const code = errorCode(e);
  const message = errorMessage(e);
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes(`relation "public.${storiesTable}" does not exist`)) {
    return makeError(
      `Supabase table "${storiesTable}" does not exist.`,
      code || "SUPABASE_MISSING_TABLE",
      `Create table with: create table public.${storiesTable} (id text primary key, data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());`
    );
  }

  if (lowerMessage.includes(`column "${storiesTable}.data" does not exist`)) {
    return makeError(
      `Supabase table "${storiesTable}" schema is not compatible.`,
      code || "SUPABASE_SCHEMA_MISMATCH",
      `Use either: (A) id text primary key, data jsonb not null, or (B) flat Story columns with id as primary key.`
    );
  }

  return makeError(message || "Supabase query failed.", code || "SUPABASE_ERROR");
}

function isMissingDataColumnError(e: unknown) {
  const lowerMessage = errorMessage(e).toLowerCase();
  return (
    lowerMessage.includes(`column "${storiesTable}.data" does not exist`) ||
    lowerMessage.includes(`column ${storiesTable}.data does not exist`) ||
    lowerMessage.includes(`column "data" does not exist`)
  );
}

async function listStoriesFromSupabase() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
      throw makeError(
        "Supabase is not configured.",
        "SUPABASE_NOT_CONFIGURED",
        "Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)."
      );
    }

  const jsonResult = await supabase.from(storiesTable).select("id,data");
  if (!jsonResult.error) {
    const rows = (jsonResult.data ?? []) as SupabaseRow[];
    return rows
      .map((row) => {
        const story = row?.data;
        if (!story || typeof story !== "object") return null;
        return { ...story, id: row.id } as Story;
      })
      .filter((story): story is Story => Boolean(story?.id && story?.title));
  }

  if (!isMissingDataColumnError(jsonResult.error)) {
    throw normalizeSupabaseError(jsonResult.error);
  }

  const flatResult = await supabase.from(storiesTable).select("*");
  if (flatResult.error) throw normalizeSupabaseError(flatResult.error);

  return (flatResult.data ?? [])
    .map((row) => row as Story)
    .filter((story) => Boolean(story?.id && story?.title));
}

async function getStoryByIdFromSupabase(id: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
      throw makeError(
        "Supabase is not configured.",
        "SUPABASE_NOT_CONFIGURED",
        "Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)."
      );
    }

  const jsonResult = await supabase
    .from(storiesTable)
    .select("id,data")
    .eq("id", id)
    .maybeSingle();

  if (!jsonResult.error) {
    if (!jsonResult.data) return null;
    const row = jsonResult.data as SupabaseRow;
    if (!row.data) return null;
    return { ...row.data, id: row.id } as Story;
  }

  if (!isMissingDataColumnError(jsonResult.error)) {
    throw normalizeSupabaseError(jsonResult.error);
  }

  const flatResult = await supabase.from(storiesTable).select("*").eq("id", id).maybeSingle();
  if (flatResult.error) throw normalizeSupabaseError(flatResult.error);
  if (!flatResult.data) return null;
  return flatResult.data as Story;
}

async function upsertStoryToSupabase(story: Story) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
      throw makeError(
        "Supabase is not configured.",
        "SUPABASE_NOT_CONFIGURED",
        "Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)."
      );
    }

  const payload: SupabaseRow = { id: story.id, data: story };
  const jsonResult = await supabase.from(storiesTable).upsert(payload, { onConflict: "id" });
  if (!jsonResult.error) return;

  if (!isMissingDataColumnError(jsonResult.error)) {
    throw normalizeSupabaseError(jsonResult.error);
  }

  const flatResult = await supabase.from(storiesTable).upsert(story, { onConflict: "id" });
  if (flatResult.error) throw normalizeSupabaseError(flatResult.error);
}

async function deleteStoryFromSupabase(id: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
      throw makeError(
        "Supabase is not configured.",
        "SUPABASE_NOT_CONFIGURED",
        "Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)."
      );
    }

  const { error } = await supabase.from(storiesTable).delete().eq("id", id);
  if (error) throw normalizeSupabaseError(error);
}

function preferSupabase() {
  return Boolean(getSupabaseAdmin());
}

export async function listStories(options?: { tolerantFileRead?: boolean }) {
  if (preferSupabase()) return listStoriesFromSupabase();
  return readStoriesFromFile({ tolerant: options?.tolerantFileRead });
}

export async function getStoryById(idRaw: string) {
  const id = normalize(idRaw);
  if (!id) return null;

  if (preferSupabase()) return getStoryByIdFromSupabase(id);

  const stories = await readStoriesFromFile();
  return stories.find((story) => normalize(story.id) === id) ?? null;
}

export async function upsertStory(story: Story, options?: { tolerantFileRead?: boolean }) {
  if (preferSupabase()) {
    await upsertStoryToSupabase(story);
    return;
  }

  const stories = await readStoriesFromFile({ tolerant: options?.tolerantFileRead });
  const next = [story, ...stories.filter((current) => current.id !== story.id)];
  await writeStoriesToFile(next);
}

export async function deleteStoryById(idRaw: string) {
  const id = normalize(idRaw);
  if (!id) return;

  if (preferSupabase()) {
    await deleteStoryFromSupabase(id);
    return;
  }

  const stories = await readStoriesFromFile();
  const next = stories.filter((story) => normalize(story.id) !== id);
  await writeStoriesToFile(next);
}

export async function incrementStoryViews(idRaw: string) {
  const id = normalize(idRaw);
  if (!id) return null;

  const story = await getStoryById(id);
  if (!story) return null;

  const current = Number.parseInt(String(story.views ?? 0), 10);
  const safeViews = Number.isFinite(current) && current >= 0 ? current : 0;
  const nextViews = safeViews + 1;

  await upsertStory({ ...story, views: nextViews });
  return nextViews;
}

export function formatStoryStoreError(routeError: string, e: unknown, extra?: Record<string, unknown>) {
  const code = errorCode(e);
  const details = errorMessage(e);
  const hint =
    typeof e === "object" && e !== null && "hint" in e
      ? String((e as { hint?: unknown }).hint ?? "")
      : undefined;

  return {
    error: routeError,
    details,
    code: code || undefined,
    hint: hint || undefined,
    ...extra,
  };
}
