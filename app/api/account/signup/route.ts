import { NextResponse } from "next/server";
import { accountSessionCookie, signupWithEmail } from "@/app/lib/account.server";
import { checkRateLimit, rateLimitIdentifier, rateLimitResponse } from "@/app/lib/rate-limit";

type SignupRequest = {
  email?: string;
  password?: string;
  username?: string;
};

export async function POST(request: Request) {
  try {
    const rateLimit = checkRateLimit({
      key: `signup:${rateLimitIdentifier(request)}`,
      limit: 5,
      windowMs: 30 * 60 * 1000,
    });
    if (rateLimit.limited) {
      return rateLimitResponse(rateLimit.retryAfter);
    }

    const body = (await request.json()) as SignupRequest;
    const profile = await signupWithEmail(body.email ?? "", body.password ?? "", body.username ?? "");

    const response = NextResponse.json({
      ok: true,
      username: profile.username,
    });
    response.cookies.set(accountSessionCookie(profile.userId));
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn't create your account.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
