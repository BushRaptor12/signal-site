export const runtime = "nodejs";

import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import type { Story } from "@/app/lib/types";

const dataPath = path.join(process.cwd(), "app", "data", "stories.json");

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

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const incoming = (await req.json()) as Story;
  if (!incoming?.id || !incoming?.title) {
    return NextResponse.json(
      { error: "Story must include at least id and title." },
      { status: 400 }
    );
  }

  const stories = await readStories();
  const next = [incoming, ...stories.filter((story) => story.id !== incoming.id)];
  await writeStories(next);

  return NextResponse.json({ ok: true, story: incoming });
}
