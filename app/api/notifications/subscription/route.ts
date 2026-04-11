export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAccountUserId } from "@/app/lib/account.server";
import { clearPushSubscriptionsForUser, storePushSubscriptionForUser, toStoredPushSubscription, upsertNotificationPreferences } from "@/app/lib/notifications.server";

function messageFromError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function POST(req: Request) {
  try {
    const userId = await getAccountUserId();
    if (!userId) {
      return NextResponse.json({ error: "You must be logged in to enable notifications." }, { status: 401 });
    }

    const body = (await req.json()) as { subscription?: unknown; urgentNews?: boolean };
    const subscription = toStoredPushSubscription(body.subscription);
    if (!subscription) {
      return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
    }

    await upsertNotificationPreferences(userId, { urgentNews: body.urgentNews !== false });
    await storePushSubscriptionForUser(userId, subscription);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: messageFromError(error) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = await getAccountUserId();
    if (!userId) {
      return NextResponse.json({ error: "You must be logged in to update notifications." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { endpoint?: unknown };
    const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
    if (!endpoint) {
      return NextResponse.json({ error: "Endpoint is required." }, { status: 400 });
    }

    await upsertNotificationPreferences(userId, { urgentNews: false });
    await clearPushSubscriptionsForUser(userId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: messageFromError(error) }, { status: 500 });
  }
}
