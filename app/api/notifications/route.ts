export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAccountUserId } from "@/app/lib/account.server";
import { listNotificationsForUser, markAllNotificationsReadForUser } from "@/app/lib/notifications.server";

function messageFromError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function GET(req: Request) {
  try {
    const userId = await getAccountUserId();
    if (!userId) {
      return NextResponse.json([]);
    }

    const url = new URL(req.url);
    const rawLimit = Number(url.searchParams.get("limit") ?? 20);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 20;
    return NextResponse.json(await listNotificationsForUser(userId, limit));
  } catch (error) {
    return NextResponse.json({ error: messageFromError(error) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const userId = await getAccountUserId();
    if (!userId) {
      return NextResponse.json({ error: "You must be logged in first." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { action?: unknown };
    if (body.action !== "mark_all_read") {
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }

    await markAllNotificationsReadForUser(userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: messageFromError(error) }, { status: 500 });
  }
}
