import { NextRequest, NextResponse } from "next/server";
import { getAdminAccountFromRequest } from "@/app/lib/admin.server";
import { searchAdminUsers, updateAdminManagedUser } from "@/app/lib/admin-tools";
import { toCommentModerationStatus, toStaffRole } from "@/app/lib/account.server";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminAccountFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const search = request.nextUrl.searchParams.get("search") ?? "";
    const users = await searchAdminUsers(search, 12);
    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "We couldn't load users.") }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await getAdminAccountFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      commentModerationNote?: string | null;
      commentModerationStatus?: string;
      commentModerationUntil?: string | null;
      staffRole?: string;
      targetUserId?: string;
    };

    const targetUserId = String(body.targetUserId ?? "").trim();
    if (!targetUserId) {
      return NextResponse.json({ error: "Target user is required." }, { status: 400 });
    }

    const updatedUser = await updateAdminManagedUser({
      actor: admin,
      commentModerationNote: typeof body.commentModerationNote === "string" ? body.commentModerationNote.trim() || null : undefined,
      commentModerationStatus:
        typeof body.commentModerationStatus === "string"
          ? toCommentModerationStatus(body.commentModerationStatus)
          : undefined,
      commentModerationUntil: typeof body.commentModerationUntil === "string" ? body.commentModerationUntil : body.commentModerationUntil ?? undefined,
      staffRole: typeof body.staffRole === "string" ? toStaffRole(body.staffRole, body.staffRole === "admin") : undefined,
      targetUserId,
    });

    return NextResponse.json({ ok: true, user: updatedUser });
  } catch (error) {
    const message = errorMessage(error, "We couldn't update that user.");
    const status = /required|cannot remove your own admin/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
