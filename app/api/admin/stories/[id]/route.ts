export const runtime = "nodejs";

import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import type { Story } from "@/app/lib/types";

const dataPath = path.join(process.cwd(), "app", "data", "stories.json");

function normalize(s: string) {
  return String(s).trim().toLowerCase();
}

function isAuthorized(req: Request) {
  const token = req.headers.get("x-admin-token");
  return token && token === process.env.ADMIN_TOKEN;
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

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await params;
  const id = normalize(rawId);
  const incoming = (await req.json()) as Story;

  const stories = await readStories();
  const idx = stories.findIndex((story) => normalize(story.id) === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // keep id stable
  incoming.id = stories[idx].id;

  stories[idx] = incoming;
  await writeStories(stories);

  return NextResponse.json({ ok: true, story: incoming });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await params;
  const id = normalize(rawId);
  const stories = await readStories();
  const next = stories.filter((story) => normalize(story.id) !== id);

  await writeStories(next);
  return NextResponse.json({ ok: true });
}
