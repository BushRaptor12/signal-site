export const runtime = "nodejs";

import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import type { Story } from "@/app/lib/types";

const dataPath = path.join(process.cwd(), "app", "data", "stories.json");

function normalize(s: string) {
  return String(s).trim().toLowerCase();
}

async function readStories() {
  const raw = await fs.readFile(dataPath, "utf8");
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const parsed: unknown = JSON.parse(trimmed);
  return Array.isArray(parsed) ? (parsed as Story[]) : [];
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = normalize(rawId);
  const stories = await readStories();
  const found = stories.find((story) => normalize(story.id) === id);

  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(found);
}
