import { NextResponse } from "next/server";
import { getAccountUserId, hideInterestStoryMatch } from "@/app/lib/account.server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; storyId: string }> }
) {
  try {
    const userId = await getAccountUserId();
    if (!userId) {
      return NextResponse.json({ error: "You must be logged in first." }, { status: 401 });
    }

    const resolvedParams = await params;
    const interestId = resolvedParams.id?.trim();
    const storyId = resolvedParams.storyId?.trim();

    if (!interestId || !storyId) {
      return NextResponse.json({ error: "Interest id and story id are required." }, { status: 400 });
    }

    await hideInterestStoryMatch(userId, interestId, storyId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn't hide that story for this interest.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
