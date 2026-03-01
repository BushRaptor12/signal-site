// app/lib/vocab.ts

export type EntityType = "Person" | "Org" | "Place" | "Thing";

export type CanonEntity = {
  name: string; // canonical display name
  type: EntityType;
  aliases: string[]; // include lowercase-friendly variants
};

// Keep this list tight. These become your NYT-like "sections-as-keywords".
// app/lib/vocab.ts
export const TOPICS = [
  "Politics",
  "Economy",
  "Technology",
  "Sports",
  "Business",
  "Trump",
  "World",
  "Entertainment",
] as const;

export type Topic = (typeof TOPICS)[number];

export function toTitleCase(tag: string) {
  return tag
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Canonical entities (with aliases). Add as you go.
export const ENTITIES: CanonEntity[] = [
  {
    name: "Donald Trump",
    type: "Person",
    aliases: ["trump", "president trump"],
  },
  {
    name: "Supreme Court",
    type: "Org",
    aliases: ["scotus", "u.s. supreme court", "supreme court"],
  },
  {
    name: "Congress",
    type: "Org",
    aliases: ["u.s. congress", "house", "senate", "congress"],
  },
  {
    name: "Federal Reserve",
    type: "Org",
    aliases: ["fed", "federal reserve"],
  },
  {
    name: "U.S.-Mexico border",
    type: "Place",
    aliases: ["border", "southern border", "mexico border"],
  },
  {
    name: "Team USA",
    type: "Org",
    aliases: ["usa", "u.s.", "united states", "team usa"],
  },
  {
    name: "Olympics",
    type: "Thing",
    aliases: ["winter olympics", "olympics"],
  },
  {
    name: "Middle East",
    type: "Place",
    aliases: ["iran", "israel", "saudi arabia", "middle east"],
  },
  {
    name: "Benjamin Netenyahu",
    type: "Person",
    aliases: ["bibi", "netenyahu", "benjamin netenyahu"],
  },
    {
    name: "Cuba",
    type: "Place",
    aliases: ["cuba"],
  },
    {
    name: "Marco Rubio",
    type: "Person",
    aliases: ["marco rubio", "rubio"],
  },
];

// ---- helpers ----
export function normalize(s: string) {
  return s.trim().toLowerCase();
}

export function topicExists(topic: string) {
  const t = normalize(topic);
  return TOPICS.some((x) => normalize(x) === t);
}

export function findEntityByAnyName(input: string) {
  const q = normalize(input);
  return ENTITIES.find((e) => normalize(e.name) === q || e.aliases.some((a) => normalize(a) === q));
}

export function canonicalizeEntityName(input: string) {
  const found = findEntityByAnyName(input);
  return found ? found.name : input;
}