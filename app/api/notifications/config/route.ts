import { NextResponse } from "next/server";
import { getAccountUserId } from "@/app/lib/account.server";
import { getNotificationPreferencesForUser, getUnreadNotificationCountForUser, getWebPushPublicKey, isWebPushConfigured } from "@/app/lib/notifications.server";

export async function GET() {
  const userId = await getAccountUserId();

  return NextResponse.json({
    authenticated: Boolean(userId),
    enabled: isWebPushConfigured(),
    preferences: userId ? await getNotificationPreferencesForUser(userId) : null,
    publicKey: getWebPushPublicKey(),
    unreadCount: userId ? await getUnreadNotificationCountForUser(userId) : 0,
  });
}
