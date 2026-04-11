import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, SITE_NAME, trimDescription } from "@/app/lib/seo";
import ResetPasswordPageClient from "./reset-password-page-client";

const description = trimDescription("Request a password reset email or finish choosing a new password for your Beacon account.");

export const metadata: Metadata = {
  title: "Reset Password",
  description,
  alternates: {
    canonical: "/account/reset-password",
  },
  openGraph: {
    type: "website",
    url: "/account/reset-password",
    title: `Reset Password | ${SITE_NAME}`,
    description,
    siteName: SITE_NAME,
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `Reset Password | ${SITE_NAME}`,
    description,
    images: [DEFAULT_OG_IMAGE],
  },
};

export default function ResetPasswordPage() {
  return <ResetPasswordPageClient />;
}
