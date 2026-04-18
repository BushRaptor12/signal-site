import { NextResponse } from "next/server";
import { createInterestFollow, getAccountUserId, getFollowedInterestsWithMatches } from "@/app/lib/account.server";

type CreateInterestRequest = {
  query?: string;
};

export async function GET() {
  try {
    const userId = await getAccountUserId();
    if (!userId) {
      return NextResponse.json({ error: "You must be logged in first." }, { status: 401 });
    }

    const interests = await getFollowedInterestsWithMatches(userId);
    return NextResponse.json({ interests });
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn't load followed interests.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAccountUserId();
    if (!userId) {
      return NextResponse.json({ error: "You must be logged in first." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as CreateInterestRequest;
    const interest = await createInterestFollow(userId, body.query ?? "");
    const [interestGroup] = await getFollowedInterestsWithMatches(userId, [interest]);
    return NextResponse.json({ interest: interestGroup ?? interest, ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn't save that interest.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
