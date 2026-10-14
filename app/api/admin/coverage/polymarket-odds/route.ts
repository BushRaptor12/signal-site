import { NextRequest, NextResponse } from "next/server";
import { getAdminAccountFromRequest } from "@/app/lib/admin.server";
import { lookupPolymarketOdds } from "@/app/lib/election-snapshot.server";

export async function POST(request: NextRequest) {
  const admin = await getAdminAccountFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { url?: unknown };
  if (typeof body.url !== "string" || !body.url.trim()) {
    return NextResponse.json({ error: "Enter a Polymarket market URL." }, { status: 400 });
  }

  const odds = await lookupPolymarketOdds(body.url.trim());
  if (!odds) {
    return NextResponse.json({ error: "We couldn't find live odds for that Polymarket link." }, { status: 404 });
  }

  return NextResponse.json(odds);
}
