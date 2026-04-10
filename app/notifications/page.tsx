import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, SITE_NAME } from "@/app/lib/seo";
import NotificationsPageClient from "./notifications-page-client";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Notification settings and recent alerts from The Beacon.",
  alternates: {
    canonical: "/notifications",
  },
  openGraph: {
    type: "website",
    url: "/notifications",
    title: `Notifications | ${SITE_NAME}`,
    description: "Notification settings and recent alerts from The Beacon.",
    siteName: SITE_NAME,
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        alt: "The Beacon",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `Notifications | ${SITE_NAME}`,
    description: "Notification settings and recent alerts from The Beacon.",
    images: [DEFAULT_OG_IMAGE],
  },
};

export default function NotificationsPage() {
  return <NotificationsPageClient />;
}
