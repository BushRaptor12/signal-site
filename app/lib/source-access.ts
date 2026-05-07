type SourceAccessRule = {
  domains: string[];
  names: string[];
};

const PAYWALL_SOURCE_RULES: SourceAccessRule[] = [
  { domains: ["wsj.com"], names: ["wall street journal", "wsj"] },
  { domains: ["nytimes.com"], names: ["new york times", "nyt", "ny times"] },
  { domains: ["axios.com"], names: ["axios"] },
  { domains: ["bloomberg.com"], names: ["bloomberg"] },
  { domains: ["washingtonpost.com"], names: ["washington post"] },
  { domains: ["ft.com"], names: ["financial times", "ft"] },
  { domains: ["economist.com"], names: ["economist", "the economist"] },
  { domains: ["theatlantic.com"], names: ["atlantic", "the atlantic"] },
  { domains: ["barrons.com"], names: ["barron's", "barrons"] },
  { domains: ["businessinsider.com"], names: ["business insider"] },
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

export function isPaywalledSource(name: string, url: string) {
  const normalizedName = normalizeSourceText(name);
  const hostname = extractHostname(url);

  return PAYWALL_SOURCE_RULES.some((rule) => {
    const domainMatch = rule.domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
    const nameMatch = rule.names.some((alias) => matchesName(normalizedName, normalizeSourceText(alias)));
    return domainMatch || nameMatch;
  });
}
