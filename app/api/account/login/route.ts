import { NextResponse } from "next/server";
import { accountSessionCookie, loginWithEmail } from "@/app/lib/account.server";
import { checkRateLimit, rateLimitIdentifier, rateLimitResponse } from "@/app/lib/rate-limit";

type LoginRequest = {
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  try {
    const rateLimit = checkRateLimit({
      key: `login:${rateLimitIdentifier(request)}`,
      limit: 8,
      windowMs: 10 * 60 * 1000,
    });
    if (rateLimit.limited) {
      return rateLimitResponse(rateLimit.retryAfter);
    }

    const body = (await request.json()) as LoginRequest;
    const profile = await loginWithEmail(body.email ?? "", body.password ?? "");

    const response = NextResponse.json({
      ok: true,
      username: profile.username,
    });
    response.cookies.set(accountSessionCookie(profile.userId));
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn't sign you in.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
