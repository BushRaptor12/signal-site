export const runtime = "nodejs";

import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import type { Story } from "@/app/lib/types";

const dataPath = path.join(process.cwd(), "app", "data", "stories.json");

function normalize(s: string) {
  return String(s).trim().toLowerCase();
}

function toSafeInt(value: unknown) {
  const n = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function readStories() {
  const raw = await fs.readFile(dataPath, "utf8");
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const parsed: unknown = JSON.parse(trimmed);
  return Array.isArray(parsed) ? (parsed as Story[]) : [];
}

async function writeStories(stories: Story[]) {
  await fs.writeFile(dataPath, JSON.stringify(stories, null, 2), "utf8");
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = normalize(rawId);
  const stories = await readStories();

  const idx = stories.findIndex((story) => normalize(story.id) === id);
  if (idx === -1) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const currentViews = toSafeInt(stories[idx].views);
  stories[idx] = {
    ...stories[idx],
    views: currentViews + 1,
  };

  await writeStories(stories);
  return NextResponse.json({ ok: true, views: stories[idx].views });
}
