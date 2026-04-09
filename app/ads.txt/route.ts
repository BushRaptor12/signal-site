import { NextResponse } from "next/server";
import { getAdsenseConfig } from "@/app/lib/adsense";

export const runtime = "nodejs";

export function GET() {
  const adsense = getAdsenseConfig();
  if (!adsense) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(
    `google.com, ${adsense.adsTxtPublisher}, DIRECT, f08c47fec0942fa0\n`,
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    }
  );
}
