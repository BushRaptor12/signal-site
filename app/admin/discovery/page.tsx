import { redirect } from "next/navigation";
import RssDiscoveryClient from "@/app/admin/discovery/rss-discovery-client";
import { getAccountProfile } from "@/app/lib/account.server";
import { getAdminRssDiscoveryData } from "@/app/lib/rss-discovery";

export default async function AdminDiscoveryPage() {
  const profile = await getAccountProfile();
  if (!profile?.isAdmin) {
    redirect("/account");
  }

  const initialData = await getAdminRssDiscoveryData();
  return <RssDiscoveryClient initialData={initialData} />;
}
