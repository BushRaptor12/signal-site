import { getAccountProfileByUserId, getAccountUserIdFromCookieHeader } from "@/app/lib/account.server";

export async function getAdminAccountFromRequest(request: Request) {
  const userId = getAccountUserIdFromCookieHeader(request.headers.get("cookie"));
  if (!userId) return null;

  const profile = await getAccountProfileByUserId(userId);
  if (!profile?.isAdmin) return null;

  return profile;
}

export async function requestHasAdminAccess(request: Request) {
  return Boolean(await getAdminAccountFromRequest(request));
}
