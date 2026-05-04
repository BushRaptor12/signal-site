import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccountProfile } from "@/app/lib/account.server";
import { DEFAULT_OG_IMAGE, SITE_NAME } from "@/app/lib/seo";
import AuthPageClient from "./auth-page-client";

export const metadata: Metadata = {
  title: "Log In",
  description: "Log in or create a Beacon account.",
  alternates: {
    canonical: "/account/login",
  },
  robots: {
    index: false,
    follow: true,
  },
  openGraph: {
    type: "website",
    url: "/account/login",
    title: `Log In | ${SITE_NAME}`,
    description: "Log in or create a Beacon account.",
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
    title: `Log In | ${SITE_NAME}`,
    description: "Log in or create a Beacon account.",
    images: [DEFAULT_OG_IMAGE],
  },
};

export default async function AccountLoginPage() {
  const profile = await getAccountProfile();
  if (profile) {
    redirect("/account");
  }

  return <AuthPageClient />;
}
