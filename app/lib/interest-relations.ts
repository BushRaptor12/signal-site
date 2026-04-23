type InterestRelationEntry = {
  aliases: string[];
  related: string[];
};

const INTEREST_RELATION_ENTRIES: InterestRelationEntry[] = [
  { aliases: ["ohio state", "ohio state buckeyes", "buckeyes"], related: ["big ten", "college football", "football", "nfl draft"] },
  { aliases: ["michigan", "michigan wolverines", "wolverines"], related: ["big ten", "college football", "football", "nfl draft"] },
  { aliases: ["penn state", "penn state nittany lions", "nittany lions"], related: ["big ten", "college football", "football", "nfl draft"] },
  { aliases: ["oregon", "oregon ducks", "ducks"], related: ["big ten", "college football", "football", "nfl draft"] },
  { aliases: ["usc", "southern california", "usc trojans", "trojans"], related: ["big ten", "college football", "football", "nfl draft"] },
  { aliases: ["ucla", "ucla bruins", "bruins"], related: ["big ten", "college football", "football", "nfl draft"] },
  { aliases: ["washington", "washington huskies", "huskies"], related: ["big ten", "college football", "football", "nfl draft"] },
  { aliases: ["nebraska", "nebraska cornhuskers", "cornhuskers"], related: ["big ten", "college football", "football", "nfl draft"] },
  { aliases: ["alabama", "alabama crimson tide", "crimson tide"], related: ["sec", "college football", "football", "nfl draft"] },
  { aliases: ["georgia", "georgia bulldogs", "bulldogs"], related: ["sec", "college football", "football", "nfl draft"] },
  { aliases: ["lsu", "lsu tigers"], related: ["sec", "college football", "football", "nfl draft"] },
  { aliases: ["texas", "texas longhorns", "longhorns"], related: ["sec", "college football", "football", "nfl draft"] },
  { aliases: ["oklahoma", "oklahoma sooners", "sooners"], related: ["sec", "college football", "football", "nfl draft"] },
  { aliases: ["tennessee", "tennessee volunteers", "vols", "volunteers"], related: ["sec", "college football", "football", "nfl draft"] },
  { aliases: ["ole miss", "mississippi rebels", "rebels"], related: ["sec", "college football", "football", "nfl draft"] },
  { aliases: ["texas a&m", "texas aggies", "aggies"], related: ["sec", "college football", "football", "nfl draft"] },
  { aliases: ["auburn", "auburn tigers"], related: ["sec", "college football", "football", "nfl draft"] },
  { aliases: ["florida", "florida gators", "gators"], related: ["sec", "college football", "football", "nfl draft"] },
  { aliases: ["notre dame", "fighting irish"], related: ["college football", "football", "nfl draft"] },
  { aliases: ["clemson", "clemson tigers"], related: ["acc", "college football", "football", "nfl draft"] },
  { aliases: ["florida state", "florida state seminoles", "seminoles"], related: ["acc", "college football", "football", "nfl draft"] },
  { aliases: ["miami", "miami hurricanes", "hurricanes"], related: ["acc", "college football", "football", "nfl draft"] },
  { aliases: ["colorado", "colorado buffaloes", "buffaloes", "buffs"], related: ["big 12", "college football", "football", "nfl draft"] },
  { aliases: ["nfl draft"], related: ["college football", "football", "draft prospects", "rookies"] },
];

function normalizeInterestRelationValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

const RELATED_TERMS_BY_ALIAS = new Map<string, string[]>();

for (const entry of INTEREST_RELATION_ENTRIES) {
  const related = [...new Set(entry.related.map(normalizeInterestRelationValue).filter(Boolean))];
  for (const alias of entry.aliases) {
    const normalizedAlias = normalizeInterestRelationValue(alias);
    if (!normalizedAlias) continue;
    RELATED_TERMS_BY_ALIAS.set(normalizedAlias, related);
  }
}

export function getRelatedInterestTerms(query: string) {
  const normalizedQuery = normalizeInterestRelationValue(query);
  return RELATED_TERMS_BY_ALIAS.get(normalizedQuery) ?? [];
}
