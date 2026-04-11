import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccountProfile } from "@/app/lib/account.server";
import { DEFAULT_OG_IMAGE, SITE_NAME } from "@/app/lib/seo";
import PageBrandHeader from "@/app/page-brand-header";
import SettingsForms from "./settings-forms";

export const metadata: Metadata = {
  title: "Account Settings",
  description: "Settings for your Beacon account.",
  alternates: {
    canonical: "/account/settings",
  },
  openGraph: {
    type: "website",
    url: "/account/settings",
    title: `Account Settings | ${SITE_NAME}`,
    description: "Settings for your Beacon account.",
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
    title: `Account Settings | ${SITE_NAME}`,
    description: "Settings for your Beacon account.",
    images: [DEFAULT_OG_IMAGE],
  },
};

export default async function AccountSettingsPage() {
  const profile = await getAccountProfile();
  if (!profile) {
    redirect("/account/login");
  }

  return (
    <main className="min-h-screen bg-transparent px-6 py-12 text-neutral-100">
      <div className="mx-auto max-w-4xl">
        <PageBrandHeader backHref="/account" />

        <section className="mt-8 rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
          <div className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">Settings</div>
          <h1 className="mt-3 text-4xl font-semibold text-neutral-100">Account settings</h1>
          <p className="mt-5 text-base leading-7 text-neutral-300">
            Update the core account details here. Username availability is case-insensitive, and email or password changes ask for your current password first.
          </p>

          <SettingsForms email={profile.email} username={profile.username} />
        </section>
      </div>
    </main>
  );
}
