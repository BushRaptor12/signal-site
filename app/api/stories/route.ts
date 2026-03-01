export const runtime = "nodejs";

import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import type { Story } from "@/app/lib/types";

const dataPath = path.join(process.cwd(), "app", "data", "stories.json");

async function readStories() {
  const raw = await fs.readFile(dataPath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as Story[]) : [];
}

async function writeStories(stories: Story[]) {
  await fs.writeFile(dataPath, JSON.stringify(stories, null, 2), "utf8");
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
        details: String(e instanceof Error ? e.message : e),
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

    const stories = await readStories();
    const next = [incoming, ...stories.filter((story) => story.id !== incoming.id)];

    await writeStories(next);

    return NextResponse.json({ ok: true, story: incoming });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        error: "POST /api/stories failed",
        dataPath,
        details: String(e instanceof Error ? e.message : e),
      },
      { status: 500 }
    );
  }
}
