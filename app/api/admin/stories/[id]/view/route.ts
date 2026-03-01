export const runtime = "nodejs";

import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

const dataPath = path.join(process.cwd(), "app", "data", "stories.json");

function normalize(s: string) {
  return String(s).trim().toLowerCase();
}

async function readStories() {
  const raw = await fs.readFile(dataPath, "utf8");
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  return Array.isArray(parsed) ? parsed : [];
}

async function writeStories(stories: any[]) {
  await fs.writeFile(dataPath, JSON.stringify(stories, null, 2), "utf8");
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const id = normalize(params.id);

  const stories = await readStories();
  const idx = stories.findIndex((s: any) => normalize(s.id) === id);

  if (idx === -1) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const current = Number(stories[idx].views ?? 0);
  stories[idx].views = Number.isFinite(current) ? current + 1 : 1;

  await writeStories(stories);

  return NextResponse.json({ ok: true, views: stories[idx].views });
}