export const runtime = "nodejs";

import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import type { Story } from "@/app/lib/types";

const dataPath = path.join(process.cwd(), "app", "data", "stories.json");
const dataDir = path.dirname(dataPath);

function errorDetails(e: unknown) {
  if (e instanceof Error) return e.message;
  return String(e);
}

function errorCode(e: unknown) {
  if (typeof e === "object" && e !== null && "code" in e) {
    return String((e as { code?: unknown }).code ?? "");
  }
  return "";
}

async function readStories(options?: { tolerant?: boolean }) {
  const tolerant = options?.tolerant ?? false;

  let raw = "";
  try {
    raw = await fs.readFile(dataPath, "utf8");
  } catch (e: unknown) {
    if (errorCode(e) === "ENOENT") return [];
    throw e;
  }

  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    const parsed: unknown = JSON.parse(trimmed);
    return Array.isArray(parsed) ? (parsed as Story[]) : [];
  } catch (e: unknown) {
    if (tolerant) return [];
    throw e;
  }
}

async function writeStories(stories: Story[]) {
  await fs.mkdir(dataDir, { recursive: true });

  const tempPath = `${dataPath}.tmp`;
  const payload = JSON.stringify(stories, null, 2);
  await fs.writeFile(tempPath, payload, "utf8");
  await fs.rename(tempPath, dataPath);
}

export async function GET() {
  try {
    const stories = await readStories();
    return NextResponse.json(stories);
  } catch (e: unknown) {
    return NextResponse.json(
      {
        error: "GET /api/stories failed",
        dataPath,
        details: errorDetails(e),
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const incoming = (await req.json()) as Story;

    if (!incoming?.id || !incoming?.title) {
      return NextResponse.json(
        { error: "Story must include at least id and title." },
        { status: 400 }
      );
    }

    const stories = await readStories({ tolerant: true });
    const next = [incoming, ...stories.filter((story) => story.id !== incoming.id)];

    await writeStories(next);

    return NextResponse.json({ ok: true, story: incoming });
  } catch (e: unknown) {
    const code = errorCode(e);
    const isReadonlyFs = code === "EROFS" || code === "EPERM" || code === "EACCES";

    return NextResponse.json(
      {
        error: isReadonlyFs
          ? "POST /api/stories failed: storage is read-only in this environment"
          : "POST /api/stories failed",
        dataPath,
        details: errorDetails(e),
        hint: isReadonlyFs
          ? "File-based storage works in local dev, but deployed/serverless runtimes usually require a database."
          : undefined,
      },
      { status: 500 }
    );
  }
}
