import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/app/lib/account.server";

type PasswordResetRequest = {
  email?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as PasswordResetRequest;
    const redirectTo = new URL("/account/reset-password", request.url).toString();
    await requestPasswordReset(body.email ?? "", redirectTo);

    return NextResponse.json({
      ok: true,
      message: "If that email is registered, a password reset link is on its way.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn't send a password reset email.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
