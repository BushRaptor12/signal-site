import { NextResponse } from "next/server";
import { getAccountUserId, removeInterestFollow } from "@/app/lib/account.server";

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
