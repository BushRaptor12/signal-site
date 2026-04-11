import { getAccountProfileByUserId, getAccountUserIdFromCookieHeader } from "@/app/lib/account.server";

export function hasValidAdminToken(token: string | null | undefined) {
  const expected = process.env.ADMIN_TOKEN?.trim();
  const received = token?.trim();
  return Boolean(expected && received && expected === received);
}

export async function requestHasAdminAccess(request: Request) {
  if (!hasValidAdminToken(request.headers.get("x-admin-token"))) {
    return false;
  }

  const userId = getAccountUserIdFromCookieHeader(request.headers.get("cookie"));
  if (!userId) return false;

  const profile = await getAccountProfileByUserId(userId);
  return Boolean(profile?.isAdmin);
}
