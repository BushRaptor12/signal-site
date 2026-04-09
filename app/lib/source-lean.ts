import type { Lean } from "@/app/lib/types";

export type SourceLeanRule = {
  lean: Lean;
  label: string;
  names: string[];
  domains?: string[];
};

// Based on AllSides ratings accessed on 2026-03-28.
// The app uses 3 buckets, so AllSides is collapsed like this:
// Left + Lean Left -> Left
// Center -> Center
// Lean Right + Right -> Right
export const SOURCE_LEAN_RULES: SourceLeanRule[] = [
  { lean: "Left", label: "CNN", names: ["cnn"], domains: ["cnn.com"] },
  { lean: "Left", label: "MSNBC", names: ["msnbc"], domains: ["msnbc.com"] },
  { lean: "Left", label: "New York Times", names: ["new york times", "nyt", "ny times"], domains: ["nytimes.com"] },
  { lean: "Left", label: "The Guardian", names: ["the guardian", "guardian"], domains: ["theguardian.com"] },
  { lean: "Left", label: "NPR", names: ["npr"], domains: ["npr.org"] },
  { lean: "Left", label: "HuffPost", names: ["huffpost", "huffington post"], domains: ["huffpost.com"] },
  { lean: "Left", label: "ABC News", names: ["abc news"], domains: ["abcnews.go.com"] },
  { lean: "Left", label: "CBS News", names: ["cbs news"], domains: ["cbsnews.com"] },
  { lean: "Left", label: "NBC News", names: ["nbc news"], domains: ["nbcnews.com"] },
  { lean: "Left", label: "USA Today", names: ["usa today"], domains: ["usatoday.com"] },
  { lean: "Center", label: "AP News", names: ["associated press", "ap", "ap news"], domains: ["apnews.com"] },
  { lean: "Center", label: "Reuters", names: ["reuters"], domains: ["reuters.com"] },
  { lean: "Center", label: "BBC News", names: ["bbc", "bbc news"], domains: ["bbc.com", "bbc.co.uk"] },
  { lean: "Center", label: "The Hill", names: ["the hill"], domains: ["thehill.com"] },
  { lean: "Center", label: "ESPN", names: ["espn"], domains: ["espn.com"] },
  { lean: "Center", label: "TMZ", names: ["tmz"], domains: ["tmz.com"] },
  { lean: "Center", label: "Wall Street Journal", names: ["wall street journal", "wsj"], domains: ["wsj.com"] },
  { lean: "Center", label: "MarketWatch", names: ["marketwatch"], domains: ["marketwatch.com"] },
  { lean: "Center", label: "Yahoo Finance", names: ["yahoo finance"], domains: ["finance.yahoo.com"] },
  { lean: "Center", label: "Yahoo Sports", names: ["yahoo sports"], domains: ["sports.yahoo.com"] },
  { lean: "Right", label: "Fox News", names: ["fox", "fox news"], domains: ["foxnews.com"] },
  { lean: "Right", label: "New York Post", names: ["new york post", "nypost", "post"], domains: ["nypost.com"] },
  { lean: "Right", label: "Washington Examiner", names: ["washington examiner"], domains: ["washingtonexaminer.com"] },
  { lean: "Right", label: "Daily Wire", names: ["daily wire", "the daily wire"], domains: ["dailywire.com"] },
  { lean: "Right", label: "Breitbart", names: ["breitbart"], domains: ["breitbart.com"] },
  { lean: "Right", label: "Newsmax", names: ["newsmax"], domains: ["newsmax.com"] },
];

function normalizeSourceText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function extractHostname(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";

  try {
    const withProtocol = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function hostnameToLabel(hostname: string) {
  const parts = hostname.split(".").filter(Boolean);
  if (parts.length === 0) return "";

  const registrable =
    parts.length >= 3 && parts[parts.length - 1]?.length === 2 && parts[parts.length - 2] === "co"
      ? parts.slice(-3, -2)[0]
      : parts.length >= 2
        ? parts[parts.length - 2]
        : parts[0];

  return registrable
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => {
      if (part.length <= 4) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function matchesName(name: string, alias: string) {
  if (!name || !alias) return false;
  return name === alias || name.startsWith(`${alias} `) || name.endsWith(` ${alias}`) || name.includes(` ${alias} `);
}

export function detectSourceLean(name: string, url: string): Lean | null {
  const normalizedName = normalizeSourceText(name);
  const hostname = extractHostname(url);

  for (const rule of SOURCE_LEAN_RULES) {
    if (rule.domains?.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
      return rule.lean;
    }
  }

  for (const rule of SOURCE_LEAN_RULES) {
    if (rule.names.some((alias) => matchesName(normalizedName, normalizeSourceText(alias)))) {
      return rule.lean;
    }
  }

  return null;
}

export function guessSourceLabel(url: string): string | null {
  const hostname = extractHostname(url);
  if (!hostname) return null;

  for (const rule of SOURCE_LEAN_RULES) {
    if (rule.domains?.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
      return rule.label;
    }
  }

  const label = hostnameToLabel(hostname);
  return label || null;
}
