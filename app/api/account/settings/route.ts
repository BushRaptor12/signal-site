import { NextResponse } from "next/server";
import {
  getAccountUserId,
  updateAccountEmail,
  updateAccountPassword,
  updateAccountUsername,
} from "@/app/lib/account.server";

type UpdateSettingsRequest =
  | {
      action?: "username";
      username?: string;
    }
  | {
      action?: "email";
      currentPassword?: string;
      email?: string;
    }
  | {
      action?: "password";
      confirmPassword?: string;
      currentPassword?: string;
      newPassword?: string;
    };

export async function PATCH(request: Request) {
  try {
    const userId = await getAccountUserId();
    if (!userId) {
      return NextResponse.json({ error: "You must be logged in first." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as UpdateSettingsRequest;

    if (body.action === "username") {
      const profile = await updateAccountUsername(userId, body.username ?? "");
      return NextResponse.json({
        ok: true,
        profile: {
          email: profile.email,
          username: profile.username,
        },
      });
    }

    if (body.action === "email") {
      const profile = await updateAccountEmail(userId, body.email ?? "", body.currentPassword ?? "");
      return NextResponse.json({
        ok: true,
        profile: {
          email: profile.email,
          username: profile.username,
        },
      });
    }

    if (body.action === "password") {
      const newPassword = body.newPassword ?? "";
      if (newPassword !== (body.confirmPassword ?? "")) {
        return NextResponse.json({ error: "New password and confirmation must match." }, { status: 400 });
      }

      await updateAccountPassword(userId, body.currentPassword ?? "", newPassword);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown settings action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn't update your settings.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
