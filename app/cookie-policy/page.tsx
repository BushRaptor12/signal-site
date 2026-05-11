import type { Metadata } from "next";
import BackLink from "@/app/back-link";
import { DEFAULT_OG_IMAGE, SITE_NAME, breadcrumbJsonLd } from "@/app/lib/seo";
import { PUBLIC_PAGE, PUBLIC_PAGE_TITLE, PUBLIC_PANEL, PUBLIC_PANEL_PADDING } from "@/app/lib/surfaces";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "How The Beacon uses cookies, browser storage, and similar technologies.",
  alternates: {
    canonical: "/cookie-policy",
  },
  openGraph: {
    type: "article",
    url: "/cookie-policy",
    title: `Cookie Policy | ${SITE_NAME}`,
    description: "How The Beacon uses cookies, browser storage, and similar technologies.",
    siteName: SITE_NAME,
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        alt: SITE_NAME,
      },
    ],
  },
};

const sections = [
  {
    title: "Essential Site Storage",
    body:
      "The Beacon uses first-party cookies and browser storage to keep account sessions active, remember local interface preferences, reduce duplicate view and reaction counts, support comments and notifications, and maintain basic site security.",
  },
  {
    title: "Analytics",
    body:
      "The site uses Vercel Web Analytics to understand aggregate traffic and usage patterns. This helps with product and editorial decisions without requiring a reader account.",
  },
  {
    title: "Advertising",
    body:
      "If advertising is enabled, Google and other ad technology providers may use cookies, web beacons, IP addresses, or similar identifiers to serve ads, measure ad performance, prevent fraud and abuse, limit repeated ads, and personalize ads where permitted by law and your choices.",
  },
  {
    title: "Your Choices",
    body:
      "You can remove or block cookies and local storage through your browser settings, though some account, notification, reaction, or preference features may stop working. You can opt out of personalized Google ads at https://adssettings.google.com and review broader industry choices at https://www.aboutads.info/choices/.",
  },
] as const;

export default function CookiePolicyPage() {
  const breadcrumb = breadcrumbJsonLd([
    { name: SITE_NAME, item: "/" },
    { name: "Cookie Policy", item: "/cookie-policy" },
  ]);

  return (
    <main className={PUBLIC_PAGE}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <div className="mx-auto max-w-4xl">
        <BackLink href="/" />

        <section className={`mt-8 ${PUBLIC_PANEL} ${PUBLIC_PANEL_PADDING}`}>
          <div className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">Cookie Policy</div>
          <h1 className={PUBLIC_PAGE_TITLE}>Cookies and similar technologies</h1>
          <p className="mt-4 text-sm text-neutral-400">Last updated: May 11, 2026</p>
          <p className="mt-6 text-base leading-7 text-neutral-300">
            This page explains how The Beacon uses cookies, browser storage, web beacons, and similar technologies.
            It should be read together with the Privacy Policy.
          </p>
        </section>

        <div className="mt-8 space-y-6">
          {sections.map((section) => (
            <section key={section.title} className={`${PUBLIC_PANEL} ${PUBLIC_PANEL_PADDING}`}>
              <h2 className="text-2xl font-semibold text-neutral-100">{section.title}</h2>
              <p className="mt-4 text-base leading-7 text-neutral-300">{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
