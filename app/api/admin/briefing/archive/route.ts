export const runtime = "nodejs";

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getAdminAccountFromRequest } from "@/app/lib/admin.server";
import { createBriefingArchiveSnapshot } from "@/app/lib/briefing-archive";

function messageFromError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function POST(request: Request) {
  try {
    const admin = await getAdminAccountFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await createBriefingArchiveSnapshot(new Date(), { manual: true });
    revalidatePath("/briefing/archive");
    revalidatePath(`/briefing/archive/${result.archiveKey}`);

    return NextResponse.json({ ok: true, ...result });
  } catch (error: unknown) {
    return NextResponse.json({ error: messageFromError(error) }, { status: 500 });
  }
}
