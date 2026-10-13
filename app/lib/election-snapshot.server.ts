import type { CoverageHubElectionOverrides } from "@/app/lib/coverage-hubs";

type PolymarketMarket = {
  question?: string;
  slug?: string;
  groupItemTitle?: string;
  outcomes?: string;
  outcomePrices?: string;
  active?: boolean;
  closed?: boolean;
  volumeNum?: number;
  liquidityNum?: number;
};

type PolymarketEvent = {
  id?: string;
  slug?: string;
  title?: string;
  markets?: PolymarketMarket[];
};

type PolymarketSearchResult = {
  events?: Array<{ id?: string; slug?: string; title?: string }>;
};

export type ElectionMarketOutcome = {
  label: string;
  probability: number;
  manual?: boolean;
};

export type ElectionControlMarket = {
  chamber: "House" | "Senate";
  url: string;
  outcomes: ElectionMarketOutcome[];
};

export type ElectionRaceMarket = {
  title: string;
  url?: string;
  leader: ElectionMarketOutcome;
  volume: number;
};

export type ElectionSnapshot = {
  controls: ElectionControlMarket[];
  senateRaces: ElectionRaceMarket[];
  updatedAt: string;
};

const POLYMARKET_API = "https://gamma-api.polymarket.com";
const CONTROL_EVENTS = [
  { chamber: "House" as const, slug: "which-party-will-win-the-house-in-2026" },
  { chamber: "Senate" as const, slug: "which-party-will-win-the-senate-in-2026" },
];

function parseJsonArray(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function controlOutcomes(event: PolymarketEvent): ElectionMarketOutcome[] {
  return (event.markets ?? [])
    .filter((market) => market.active !== false && market.closed !== true)
    .map((market) => {
      const outcomes = parseJsonArray(market.outcomes);
      const prices = parseJsonArray(market.outcomePrices).map(Number);
      const yesIndex = outcomes.findIndex((outcome) => outcome.toLowerCase() === "yes");
      const probability = prices[yesIndex >= 0 ? yesIndex : 0];
      return {
        label: market.groupItemTitle?.trim() || market.question?.replace(/^Will the /i, "").replace(/ control.*$/i, "") || "Outcome",
        probability,
      };
    })
    .filter((outcome) => Number.isFinite(outcome.probability) && outcome.probability >= 0 && outcome.probability <= 1)
    .sort((a, b) => b.probability - a.probability);
}

async function fetchEvent(slug: string): Promise<PolymarketEvent | null> {
  try {
    const response = await fetch(`${POLYMARKET_API}/events/slug/${encodeURIComponent(slug)}`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return await response.json() as PolymarketEvent;
  } catch {
    return null;
  }
}

async function fetchSenateRaceMarkets(): Promise<ElectionRaceMarket[]> {
  try {
    const search = await fetch(`${POLYMARKET_API}/public-search?q=${encodeURIComponent("2026 Senate race")}&limit_per_type=30`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
    });
    if (!search.ok) return [];

    const result = await search.json() as PolymarketSearchResult;
    const events = (result.events ?? [])
      .filter((event) => event.slug && event.title && /senate/i.test(event.title) && /2026/i.test(event.title))
      .filter((event) => !/which party|control of the senate|senate control/i.test(event.title ?? ""))
      .slice(0, 8);

    const details = await Promise.all(events.map((event) => fetchEvent(event.slug!)));
    const races = details.flatMap((event) => {
      if (!event?.slug || !event.title) return [];
      const markets = (event.markets ?? [])
        .filter((market) => market.active !== false && market.closed !== true)
        .flatMap((market) => {
          const outcomes = parseJsonArray(market.outcomes);
          const prices = parseJsonArray(market.outcomePrices).map(Number);
          const yesIndex = outcomes.findIndex((outcome) => outcome.toLowerCase() === "yes");
          const probability = prices[yesIndex >= 0 ? yesIndex : 0];
          const label = market.groupItemTitle?.trim() || market.question?.trim();
          if (!label || !Number.isFinite(probability) || probability <= 0 || probability >= 1) return [];
          return [{ label, probability, volume: market.volumeNum ?? 0, slug: market.slug }];
        })
        .sort((a, b) => b.volume - a.volume);
      const market = markets[0];
      if (!market) return [];
      return [{
        title: event.title,
        url: `https://polymarket.com/event/${event.slug}${market.slug ? `/${market.slug}` : ""}`,
        leader: { label: market.label, probability: market.probability },
        volume: market.volume,
      }];
    });

    return races
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 4);
  } catch {
    return [];
  }
}

export async function getElectionSnapshot(overrides?: CoverageHubElectionOverrides): Promise<ElectionSnapshot> {
  const [events, senateRaces] = await Promise.all([
    Promise.all(CONTROL_EVENTS.map(({ slug }) => fetchEvent(slug))),
    fetchSenateRaceMarkets(),
  ]);

  const controls = CONTROL_EVENTS.flatMap(({ chamber }, index) => {
    const event = events[index];
    const outcomes = controlOutcomes(event ?? {});
    const democratKey = chamber === "House" ? "houseDemocrat" : "senateDemocrat";
    const republicanKey = chamber === "House" ? "houseRepublican" : "senateRepublican";
    const chamberOverrides: Array<{
      key: "houseDemocrat" | "houseRepublican" | "senateDemocrat" | "senateRepublican";
      label: string;
    }> = [
      { key: democratKey, label: "Democratic Party" },
      { key: republicanKey, label: "Republican Party" },
    ];

    for (const manual of chamberOverrides) {
      const probability = overrides?.[manual.key];
      if (typeof probability !== "number") continue;
      const existing = outcomes.find((outcome) => outcome.label.toLowerCase().includes(manual.label.split(" ")[0].toLowerCase()));
      if (existing) {
        existing.probability = probability / 100;
        existing.manual = true;
      } else {
        outcomes.push({ label: manual.label, probability: probability / 100, manual: true });
      }
    }

    if (outcomes.length === 0) return [];
    return [{
      chamber,
      url: event?.slug ? `https://polymarket.com/event/${event.slug}` : "https://polymarket.com",
      outcomes: outcomes.sort((a, b) => b.probability - a.probability),
    }];
  });

  const manualRaces = (overrides?.senateRaces ?? []).filter((race) => race.race.trim() && race.outcome.trim());
  const displayedRaces = manualRaces.length > 0
    ? manualRaces.map((race) => ({
        title: race.race,
        leader: { label: race.outcome, probability: race.probability / 100, manual: true },
        volume: 0,
      }))
    : senateRaces;

  return { controls, senateRaces: displayedRaces, updatedAt: new Date().toISOString() };
}
