import type { Story } from "@/app/lib/types";

type StoryKnowledgeFields = Pick<
  Story,
  "facets" | "industries" | "locations" | "offices" | "organizations" | "people" | "sports_teams"
>;

type StoryKnowledgeInput = {
  current: StoryKnowledgeFields;
  entityNames: string[];
  primaryEntities: string[];
  sourceNames: string[];
  sourceTitles: string[];
  summary: string[];
  title: string;
  topics: string[];
};

type KnowledgeProfile = {
  facets?: string[];
  industries?: string[];
  locations?: string[];
  match: string[];
  offices?: string[];
  organizations?: string[];
  people?: string[];
  sports_teams?: string[];
};

const CALIFORNIA_LOCATIONS = new Set([
  "anaheim",
  "bay area",
  "california",
  "los angeles",
  "oakland",
  "sacramento",
  "san diego",
  "san francisco",
  "silicon valley",
]);

const AI_ORGANIZATIONS = new Set([
  "anthropic",
  "google",
  "meta",
  "microsoft",
  "nvidia",
  "openai",
]);

const FEMALE_POLITICIANS = new Set([
  "alexandria ocasio-cortez",
  "elizabeth warren",
  "kamala harris",
  "nancy pelosi",
  "nikki haley",
]);

const OFFICE_HINTS: Array<{ label: string; match: RegExp }> = [
  { label: "Vice President", match: /\bvice president\b/i },
  { label: "President", match: /\bpresident\b/i },
  { label: "Governor", match: /\bgovernor\b/i },
  { label: "Senator", match: /\bsenator\b/i },
  { label: "Representative", match: /\brepresentative\b|\bcongressman\b|\bcongresswoman\b/i },
  { label: "Speaker", match: /\bspeaker\b/i },
  { label: "Mayor", match: /\bmayor\b/i },
  { label: "Central Bank", match: /\bcentral bank\b|\bfederal reserve\b|\bthe fed\b/i },
];

const KNOWLEDGE_PROFILES: KnowledgeProfile[] = [
  {
    facets: ["female politician"],
    match: ["kamala harris"],
    offices: ["Vice President"],
    people: ["Kamala Harris"],
  },
  {
    facets: ["female politician"],
    match: ["nikki haley"],
    people: ["Nikki Haley"],
  },
  {
    facets: ["female politician"],
    match: ["nancy pelosi"],
    offices: ["Speaker"],
    people: ["Nancy Pelosi"],
  },
  {
    facets: ["female politician"],
    match: ["alexandria ocasio-cortez", "aoc"],
    offices: ["Representative"],
    people: ["Alexandria Ocasio-Cortez"],
  },
  {
    facets: ["female politician"],
    match: ["elizabeth warren"],
    offices: ["Senator"],
    people: ["Elizabeth Warren"],
  },
  {
    facets: ["politician"],
    match: ["donald trump", "president trump", "trump"],
    offices: ["President"],
    people: ["Donald Trump"],
  },
  {
    facets: ["politician"],
    match: ["gavin newsom"],
    locations: ["California"],
    offices: ["Governor"],
    people: ["Gavin Newsom"],
  },
  {
    facets: ["politician"],
    match: ["eric swalwell"],
    locations: ["California"],
    offices: ["Representative"],
    people: ["Eric Swalwell"],
  },
  {
    facets: ["ai business"],
    industries: ["Artificial intelligence"],
    match: ["openai"],
    organizations: ["OpenAI"],
  },
  {
    facets: ["ai business"],
    industries: ["Artificial intelligence", "Technology"],
    match: ["google", "alphabet"],
    organizations: ["Google"],
  },
  {
    facets: ["ai business"],
    industries: ["Artificial intelligence", "Technology"],
    match: ["microsoft"],
    organizations: ["Microsoft"],
  },
  {
    facets: ["ai business"],
    industries: ["Artificial intelligence", "Semiconductors"],
    match: ["nvidia"],
    organizations: ["Nvidia"],
  },
  {
    industries: ["Finance"],
    match: ["federal reserve", "the fed", "fed"],
    offices: ["Central Bank"],
    organizations: ["Federal Reserve"],
  },
  {
    facets: ["california sports"],
    locations: ["Anaheim", "California", "Los Angeles"],
    match: ["los angeles angels", "angels"],
    sports_teams: ["Los Angeles Angels"],
  },
  {
    facets: ["california sports"],
    locations: ["California", "Los Angeles"],
    match: ["los angeles dodgers", "dodgers"],
    sports_teams: ["Los Angeles Dodgers"],
  },
  {
    facets: ["california sports"],
    locations: ["California", "Los Angeles"],
    match: ["los angeles lakers", "lakers"],
    sports_teams: ["Los Angeles Lakers"],
  },
  {
    facets: ["california sports"],
    locations: ["California", "Los Angeles"],
    match: ["los angeles clippers", "clippers"],
    sports_teams: ["Los Angeles Clippers"],
  },
  {
    facets: ["california sports"],
    locations: ["California", "San Francisco"],
    match: ["san francisco giants", "giants"],
    sports_teams: ["San Francisco Giants"],
  },
  {
    facets: ["california sports"],
    locations: ["California", "San Francisco"],
    match: ["golden state warriors", "warriors"],
    sports_teams: ["Golden State Warriors"],
  },
  {
    facets: ["california sports"],
    locations: ["California", "San Diego"],
    match: ["san diego padres", "padres"],
    sports_teams: ["San Diego Padres"],
  },
  {
    facets: ["california sports"],
    locations: ["California", "San Francisco"],
    match: ["san francisco 49ers", "49ers"],
    sports_teams: ["San Francisco 49ers"],
  },
];

function normalizeValue(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function uniqueTitleCase(values: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    const normalized = normalizeValue(trimmed);
    if (!trimmed || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(trimmed);
  }

  return output;
}

function mergeValues(...groups: string[][]) {
  return uniqueTitleCase(groups.flat());
}

function buildHaystack(input: StoryKnowledgeInput) {
  return normalizeValue(
    [
      input.title,
      ...input.summary,
      ...input.topics,
      ...input.entityNames,
      ...input.primaryEntities,
      ...input.sourceNames,
      ...input.sourceTitles,
    ].join(" ")
  );
}

function matchesProfile(haystack: string, profile: KnowledgeProfile) {
  return profile.match.some((term) => {
    const normalized = normalizeValue(term);
    return normalized && haystack.includes(normalized);
  });
}

export function inferStoryKnowledge(input: StoryKnowledgeInput): StoryKnowledgeFields {
  const haystack = buildHaystack(input);
  const next: StoryKnowledgeFields = {
    facets: [...input.current.facets],
    industries: [...input.current.industries],
    locations: [...input.current.locations],
    offices: [...input.current.offices],
    organizations: [...input.current.organizations],
    people: [...input.current.people],
    sports_teams: [...input.current.sports_teams],
  };

  for (const profile of KNOWLEDGE_PROFILES) {
    if (!matchesProfile(haystack, profile)) continue;

    next.facets = mergeValues(next.facets, profile.facets ?? []);
    next.industries = mergeValues(next.industries, profile.industries ?? []);
    next.locations = mergeValues(next.locations, profile.locations ?? []);
    next.offices = mergeValues(next.offices, profile.offices ?? []);
    next.organizations = mergeValues(next.organizations, profile.organizations ?? []);
    next.people = mergeValues(next.people, profile.people ?? []);
    next.sports_teams = mergeValues(next.sports_teams, profile.sports_teams ?? []);
  }

  for (const entityName of mergeValues(input.entityNames, input.primaryEntities)) {
    if (entityName.includes(" ")) {
      const looksLikePerson = entityName.split(" ").length <= 4 && !/\b(bank|team|party|department|reserve|company|group|league|inc|corp)\b/i.test(entityName);
      if (looksLikePerson) {
        next.people = mergeValues(next.people, [entityName]);
      }
    }
  }

  if (input.topics.some((topic) => normalizeValue(topic) === "sports")) {
    if (next.sports_teams.length > 0 || [...CALIFORNIA_LOCATIONS].some((value) => haystack.includes(value))) {
      next.facets = mergeValues(next.facets, ["california sports"]);
    }
  }

  if (input.topics.some((topic) => normalizeValue(topic) === "politics")) {
    next.facets = mergeValues(next.facets, ["politician"]);
    for (const officeHint of OFFICE_HINTS) {
      if (officeHint.match.test(haystack)) {
        next.offices = mergeValues(next.offices, [officeHint.label]);
      }
    }

    if (next.people.some((person) => FEMALE_POLITICIANS.has(normalizeValue(person)))) {
      next.facets = mergeValues(next.facets, ["female politician"]);
    }
  }

  const foundAiOrg = next.organizations.some((organization) => AI_ORGANIZATIONS.has(normalizeValue(organization)));
  if (foundAiOrg || /\bartificial intelligence\b|\bai\b/.test(haystack)) {
    next.industries = mergeValues(next.industries, ["Artificial intelligence"]);
  }

  if (foundAiOrg && (input.topics.some((topic) => normalizeValue(topic) === "business") || /\bcompany\b|\bstartup\b|\bearnings\b|\bbusiness\b/.test(haystack))) {
    next.facets = mergeValues(next.facets, ["ai business"]);
  }

  return next;
}
