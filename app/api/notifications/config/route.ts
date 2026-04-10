import { NextResponse } from "next/server";
import { getWebPushPublicKey, isWebPushConfigured } from "@/app/lib/push";

export function GET() {
  return NextResponse.json({
    enabled: isWebPushConfigured(),
    publicKey: getWebPushPublicKey(),
  });
}
