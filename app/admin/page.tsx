import { redirect } from "next/navigation";
import AdminDashboardClient from "@/app/admin/admin-dashboard-client";
import { getAccountProfile } from "@/app/lib/account.server";
import { getAdminDashboardData, searchAdminUsers } from "@/app/lib/admin-tools";

export default async function AdminPage() {
  const profile = await getAccountProfile();
  if (!profile?.isAdmin) {
    redirect("/account");
  }

  const [initialData, initialUsers] = await Promise.all([getAdminDashboardData(profile.userId), searchAdminUsers("", 8)]);

  return <AdminDashboardClient initialData={initialData} initialUsers={initialUsers} />;
}
