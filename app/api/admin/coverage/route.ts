import { NextRequest, NextResponse } from "next/server";
import { getAdminAccountFromRequest } from "@/app/lib/admin.server";
import { listCoverageHubs, upsertCoverageHub } from "@/app/lib/coverage-hubs.server";
import type { CoverageHubDefinition } from "@/app/lib/coverage-hubs";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminAccountFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hubs = await listCoverageHubs();
    return NextResponse.json({ hubs });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "We couldn't load coverage hubs.") }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await getAdminAccountFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { hub?: Partial<CoverageHubDefinition> & { slug?: string } };
    if (!body.hub?.slug || !body.hub.title?.trim()) {
      return NextResponse.json({ error: "Coverage hub must include a slug and title." }, { status: 400 });
    }

    const hub = await upsertCoverageHub({ ...body.hub, slug: body.hub.slug }, admin.userId);
    return NextResponse.json({ ok: true, hub });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "We couldn't save that coverage hub.") }, { status: 500 });
  }
}
