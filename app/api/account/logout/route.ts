import { NextResponse } from "next/server";
import { clearedAccountSessionCookie } from "@/app/lib/account.server";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/account/login", request.url), 303);
  response.cookies.set(clearedAccountSessionCookie());
  return response;
}
