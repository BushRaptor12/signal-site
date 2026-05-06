import { NextResponse } from "next/server";
import { requestHasAdminAccess } from "@/app/lib/admin.server";
import { updateAdminRssClusterAction } from "@/app/lib/rss-discovery";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await requestHasAdminAccess(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = (await params).id?.trim();
    if (!id) {
      return NextResponse.json({ error: "Cluster id is required." }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as { status?: unknown };
    const status = body.status === "hidden" || body.status === "reviewed" || body.status === "new" ? body.status : null;
    if (!status) {
      return NextResponse.json({ error: "Cluster status must be reviewed, hidden, or new." }, { status: 400 });
    }

    const action = await updateAdminRssClusterAction(id, status);
    return NextResponse.json({ action, ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "We couldn't update that cluster.") }, { status: 400 });
  }
}
