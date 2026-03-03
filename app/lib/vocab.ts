export const TOPICS = [
  "Politics",
  "Economy",
  "Technology",
  "Sports",
  "Business",
  "World",
  "Trump",
  "Entertainment",
] as const;

export const ENTITIES: { name: string; aliases: string[] }[] = [
  { name: "Donald Trump", aliases: ["Trump", "President Trump"] },
  { name: "Supreme Court", aliases: ["SCOTUS", "U.S. Supreme Court"] },
  { name: "Federal Reserve", aliases: ["Fed", "The Fed"] },
  { name: "Middle East", aliases: ["middle east", "israel", "iran", "kuwait", "dubai"] },
  { name: "Stock Market", aliases: ["stocks", "markets", "stock market", "nasdaq", "dow", "dow jones", "s&p", "s&p500"] },
  { name: "War", aliases: ["war"] },
];

export function normalize(s: string) {
  return String(s).trim().toLowerCase();
}

export function slugify(s: string) {
  return normalize(s)
    .replace(/["']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export function toTitleCase(s: string) {
  return s
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
