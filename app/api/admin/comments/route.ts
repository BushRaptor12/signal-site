import { NextRequest, NextResponse } from "next/server";
import { requestHasAdminAccess } from "@/app/lib/admin.server";
import { getAccountUserIdFromCookieHeader } from "@/app/lib/account.server";
import { listCommentReportsForAdmin, updateCommentReportStatus } from "@/app/lib/comments";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const adminAccess = await requestHasAdminAccess(request);
    if (!adminAccess) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const statusParam = request.nextUrl.searchParams.get("status");
    const status = statusParam === "dismissed" || statusParam === "reviewed" ? statusParam : "open";
    const reports = await listCommentReportsForAdmin(status);
    return NextResponse.json({ reports });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "We couldn't load comment reports.") }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const adminAccess = await requestHasAdminAccess(request);
    if (!adminAccess) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      reportId?: string;
      status?: string;
    };

    const reportId = String(body.reportId ?? "").trim();
    const status = body.status === "dismissed" || body.status === "reviewed" ? body.status : null;
    if (!reportId || !status) {
      return NextResponse.json({ error: "Report id and status are required." }, { status: 400 });
    }

    const userId = getAccountUserIdFromCookieHeader(request.headers.get("cookie"));
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await updateCommentReportStatus(reportId, status, userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = errorMessage(error, "We couldn't update that report.");
    const status = /required|no longer exists/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
