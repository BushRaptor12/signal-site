import { NextResponse } from "next/server";
import { getAccountUserId, getFollowedInterestsWithMatches, removeInterestFollow, updateInterestFollowSettings } from "@/app/lib/account.server";

type UpdateInterestRequest = {
  excludeKeywords?: string[];
  matchKeywords?: string[];
};

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAccountUserId();
    if (!userId) {
      return NextResponse.json({ error: "You must be logged in first." }, { status: 401 });
    }

    const interestId = (await params).id?.trim();
    if (!interestId) {
      return NextResponse.json({ error: "Interest id is required." }, { status: 400 });
    }

    await removeInterestFollow(userId, interestId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn't remove that interest.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAccountUserId();
    if (!userId) {
      return NextResponse.json({ error: "You must be logged in first." }, { status: 401 });
    }

    const interestId = (await params).id?.trim();
    if (!interestId) {
      return NextResponse.json({ error: "Interest id is required." }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as UpdateInterestRequest;
    const interest = await updateInterestFollowSettings(userId, interestId, {
      excludeKeywords: Array.isArray(body.excludeKeywords) ? body.excludeKeywords.map(String) : [],
      matchKeywords: Array.isArray(body.matchKeywords) ? body.matchKeywords.map(String) : [],
    });
    const [interestGroup] = await getFollowedInterestsWithMatches(userId, [interest]);
    return NextResponse.json({ interest: interestGroup ?? interest, ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn't update that interest.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
