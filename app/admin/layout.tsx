import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccountProfile } from "@/app/lib/account.server";
import { AdminAuthBoundary } from "./admin-auth";

export const metadata: Metadata = {
  title: "Admin",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getAccountProfile();
  if (!profile) {
    redirect("/account/login");
  }

  if (!profile.isAdmin) {
    redirect("/account");
  }

  return <AdminAuthBoundary>{children}</AdminAuthBoundary>;
}
