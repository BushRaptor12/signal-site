export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import type { Story } from "@/app/lib/types";

const dataPath = path.join(process.cwd(), "app", "data", "stories.json");

function normalize(s: string) {
  return String(s).trim().toLowerCase();
}

async function readStories(): Promise<Story[]> {
  const raw = await fs.readFile(dataPath, "utf8");
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const parsed: unknown = JSON.parse(trimmed);
  return Array.isArray(parsed) ? (parsed as Story[]) : [];
}

async function writeStories(stories: Story[]) {
  await fs.writeFile(dataPath, JSON.stringify(stories, null, 2), "utf8");
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = normalize((await params).id);

  const stories = await readStories();
  const idx = stories.findIndex((story) => normalize(story.id) === id);

  if (idx === -1) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const current = Number(stories[idx].views ?? 0);
  stories[idx].views = Number.isFinite(current) ? current + 1 : 1;

  await writeStories(stories);

  return NextResponse.json({ ok: true, views: stories[idx].views });
}
