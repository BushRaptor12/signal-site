import type { Metadata } from "next";
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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminAuthBoundary>{children}</AdminAuthBoundary>;
}
