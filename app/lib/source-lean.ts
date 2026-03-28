import type { Lean } from "@/app/lib/types";

export type SourceLeanRule = {
  lean: Lean;
  names: string[];
  domains?: string[];
};

// Based on AllSides ratings accessed on 2026-03-28.
// The app uses 3 buckets, so AllSides is collapsed like this:
// Left + Lean Left -> Left
// Center -> Center
// Lean Right + Right -> Right
export const SOURCE_LEAN_RULES: SourceLeanRule[] = [
  { lean: "Left", names: ["cnn"], domains: ["cnn.com"] },
  { lean: "Left", names: ["msnbc"], domains: ["msnbc.com"] },
  { lean: "Left", names: ["new york times", "nyt", "ny times"], domains: ["nytimes.com"] },
  { lean: "Left", names: ["the guardian", "guardian"], domains: ["theguardian.com"] },
  { lean: "Left", names: ["npr"], domains: ["npr.org"] },
  { lean: "Left", names: ["huffpost", "huffington post"], domains: ["huffpost.com"] },
  { lean: "Left", names: ["abc news"], domains: ["abcnews.go.com"] },
  { lean: "Left", names: ["cbs news"], domains: ["cbsnews.com"] },
  { lean: "Left", names: ["nbc news"], domains: ["nbcnews.com"] },
  { lean: "Left", names: ["usa today"], domains: ["usatoday.com"] },
  { lean: "Center", names: ["associated press", "ap", "ap news"], domains: ["apnews.com"] },
  { lean: "Center", names: ["reuters"], domains: ["reuters.com"] },
  { lean: "Center", names: ["bbc", "bbc news"], domains: ["bbc.com", "bbc.co.uk"] },
  { lean: "Center", names: ["the hill"], domains: ["thehill.com"] },
  { lean: "Center", names: ["espn"], domains: ["espn.com"] },
  { lean: "Center", names: ["tmz"], domains: ["tmz.com"] },
  { lean: "Center", names: ["wall street journal", "wsj"], domains: ["wsj.com"] },
  { lean: "Center", names: ["marketwatch"], domains: ["marketwatch.com"] },
  { lean: "Center", names: ["yahoo finance"], domains: ["finance.yahoo.com"] },
  { lean: "Center", names: ["yahoo sports"], domains: ["sports.yahoo.com"] },
  { lean: "Right", names: ["fox", "fox news"], domains: ["foxnews.com"] },
  { lean: "Right", names: ["new york post", "nypost", "post"], domains: ["nypost.com"] },
  { lean: "Right", names: ["washington examiner"], domains: ["washingtonexaminer.com"] },
  { lean: "Right", names: ["daily wire", "the daily wire"], domains: ["dailywire.com"] },
  { lean: "Right", names: ["breitbart"], domains: ["breitbart.com"] },
  { lean: "Right", names: ["newsmax"], domains: ["newsmax.com"] },
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
