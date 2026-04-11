import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccountProfile } from "@/app/lib/account.server";
import { DEFAULT_OG_IMAGE, SITE_NAME } from "@/app/lib/seo";

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

const SETTINGS_CARDS = [
  {
    body: "We can add username editing here once the rest of the account flow has settled.",
    title: "Username",
  },
  {
    body: "Email-change support will fit here when we add confirmation and account recovery flows.",
    title: "Email",
  },
  {
    body: "Password update and recovery settings are a natural next step for account security.",
    title: "Password",
  },
  {
    body: "Reader-specific preferences can live here once follow controls and comment notifications are in place.",
    title: "Reading preferences",
  },
] as const;

export default async function AccountSettingsPage() {
  const profile = await getAccountProfile();
  if (!profile) {
    redirect("/account/login");
  }

  return (
    <main className="min-h-screen bg-transparent px-6 py-12 text-neutral-100">
      <div className="mx-auto max-w-4xl">
        <Link href="/account" className="text-neutral-300 transition hover:text-white">
          {"<- Back to account"}
        </Link>

        <section className="mt-8 rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
          <div className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">Settings</div>
          <h1 className="mt-3 text-4xl font-semibold text-neutral-100">Account settings</h1>
          <p className="mt-5 text-base leading-7 text-neutral-300">
            Settings support is staged for the next pass. The structure is here already so we can add real controls without reworking the page.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {SETTINGS_CARDS.map((card) => (
              <div key={card.title} className="rounded-2xl border border-[#13314b] bg-[#04111b] p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-neutral-100">{card.title}</h2>
                  <span className="rounded-full border border-[#8f7740]/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d7c08d]">
                    Soon
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-neutral-400">{card.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-[#13314b] bg-[#04111b] p-5">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Current account</div>
            <div className="mt-3 text-xl font-semibold text-neutral-100">{profile.username}</div>
            <div className="mt-1 text-sm text-neutral-400">{profile.email}</div>
          </div>
        </section>
      </div>
    </main>
  );
}
