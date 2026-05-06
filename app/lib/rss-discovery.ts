import { createHash } from "node:crypto";
import { coerceStory, type StoryDbRow } from "@/app/lib/stories";
import { guessSourceLabel } from "@/app/lib/source-lean";
import { supabaseServer } from "@/app/lib/supabase.server";
import type { StoryWithViews } from "@/app/lib/types";

export type AdminRssFeed = {
  category: string;
  id: string;
  title: string;
  url: string;
  enabled: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminRssItem = {
  id: string;
  feedId: string | null;
  sourceName: string;
  title: string;
  url: string;
  summary: string;
  publishedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type AdminRssCluster = {
  actionStatus: "hidden" | "new" | "reviewed";
  categoryCoverage: Array<{
    category: string;
    feedCount: number;
    saturation: number;
    totalEnabledFeeds: number;
  }>;
  id: string;
  existingStoryMatches: Array<{
    id: string;
    score: number;
    status: string;
    title: string;
  }>;
  priorityScore: number;
  storyTitle: string;
  score: number;
  sharedTerms: string[];
  sourceDiversity: number;
  wireServiceCount: number;
  newestPublishedAt: string | null;
  sources: Array<{
    category: string;
    id: string;
    isWireService: boolean;
    publishedAt: string | null;
    sourceWeight: number;
    sourceName: string;
    summary: string;
    title: string;
    url: string;
  }>;
};

export type AdminRssScanRun = {
  error: string | null;
  feedCount: number;
  finishedAt: string | null;
  id: string;
  itemCount: number;
  newItemCount: number;
  startedAt: string;
  status: string;
};

export type AdminRssDiscoveryData = {
  clusters: AdminRssCluster[];
  feeds: AdminRssFeed[];
  latestItems: AdminRssItem[];
  latestScan: AdminRssScanRun | null;
};

export type AdminRssScanResult = {
  feedCount: number;
  itemCount: number;
  newItemCount: number;
};

type RssFeedRow = {
  category?: string | null;
  created_at: string;
  enabled: boolean;
  id: string;
  item_count: number | null;
  last_checked_at: string | null;
  last_error: string | null;
  title: string | null;
  updated_at: string;
  url: string;
};

type RssItemRow = {
  feed_id: string | null;
  first_seen_at: string;
  id: string;
  last_seen_at: string;
  published_at: string | null;
  source_name: string | null;
  summary: string | null;
  title: string;
  url: string;
};

type RssScanRunRow = {
  error: string | null;
  feed_count: number | null;
  finished_at: string | null;
  id: string;
  item_count: number | null;
  new_item_count: number | null;
  started_at: string;
  status: string;
};

type RssClusterActionRow = {
  cluster_id: string;
  status: string;
};

type ParsedFeedItem = {
  publishedAt: string | null;
  summary: string;
  title: string;
  url: string;
};

const FEED_USER_AGENT = "BeaconRSSDiscovery/1.0 (+https://readthebeacon.news)";
const MAX_ITEMS_PER_FEED = 30;
const MAX_SCAN_FEEDS = 80;
const STOP_WORDS = new Set([
  "a",
  "about",
  "after",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "has",
  "have",
  "how",
  "in",
  "into",
  "is",
  "it",
  "its",
  "new",
  "of",
  "on",
  "or",
  "over",
  "said",
  "says",
  "the",
  "this",
  "to",
  "up",
  "with",
]);

function relationMissing(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /relation .*admin_rss_(feeds|items|scan_runs|cluster_actions).* does not exist/i.test(error.message);
}

function messageFromError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function decodeEntities(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)));
}

function cleanText(value: string | null | undefined) {
  return decodeEntities(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(value: string) {
  const trimmed = decodeEntities(value).trim();
  if (!trimmed) return "";

  try {
    const withProtocol = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function childValue(xml: string, tagName: string) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i").exec(xml);
  return cleanText(match?.[1]);
}

function attributeValue(xml: string, attributeName: string) {
  const escaped = attributeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*=\\s*["']([^"']+)["']`, "i").exec(xml);
  return cleanText(match?.[1]);
}

function firstNonEmpty(values: string[]) {
  return values.find((value) => value.trim())?.trim() ?? "";
}

function uniqueByUrl(items: ParsedFeedItem[]) {
  const byUrl = new Map<string, ParsedFeedItem>();

  for (const item of items) {
    if (!item.url || byUrl.has(item.url)) continue;
    byUrl.set(item.url, item);
  }

  return [...byUrl.values()];
}

function firstMatch(value: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = pattern.exec(value);
    const captured = match ? match[match.length - 1] : undefined;
    const cleaned = cleanText(captured);
    if (cleaned) return cleaned;
  }

  return "";
}

function titleFromHtml(html: string) {
  return firstNonEmpty([
    firstMatch(html, [
      /<meta[^>]+property=["']og:site_name["'][^>]+content=(["'])(.*?)\1[^>]*>/i,
      /<meta[^>]+content=(["'])(.*?)\1[^>]+property=["']og:site_name["'][^>]*>/i,
      /<title[^>]*>([^<]+)<\/title>/i,
    ]),
  ]).replace(/\s*\|\s*.*$/, "");
}

function toIsoDate(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function contentHash(item: ParsedFeedItem) {
  return createHash("sha256").update([item.title, item.url, item.summary].join("\n")).digest("hex");
}

function toFeed(row: RssFeedRow): AdminRssFeed {
  return {
    category: cleanCategory(row.category),
    createdAt: row.created_at,
    enabled: row.enabled,
    id: row.id,
    itemCount: row.item_count ?? 0,
    lastCheckedAt: row.last_checked_at,
    lastError: row.last_error,
    title: row.title ?? "",
    updatedAt: row.updated_at,
    url: row.url,
  };
}

function toItem(row: RssItemRow): AdminRssItem {
  return {
    feedId: row.feed_id,
    firstSeenAt: row.first_seen_at,
    id: row.id,
    lastSeenAt: row.last_seen_at,
    publishedAt: row.published_at,
    sourceName: row.source_name ?? "",
    summary: row.summary ?? "",
    title: row.title,
    url: row.url,
  };
}

function toScanRun(row: RssScanRunRow): AdminRssScanRun {
  return {
    error: row.error,
    feedCount: row.feed_count ?? 0,
    finishedAt: row.finished_at,
    id: row.id,
    itemCount: row.item_count ?? 0,
    newItemCount: row.new_item_count ?? 0,
    startedAt: row.started_at,
    status: row.status,
  };
}

function getItemUrl(itemXml: string, feedUrl: string) {
  const guid = childValue(itemXml, "guid");
  const rssLink = childValue(itemXml, "link");
  const atomAlternate = [...itemXml.matchAll(/<link\b([^>]*)>/gi)]
    .map((match) => match[1] ?? "")
    .find((attributes) => !/rel\s*=\s*["'](?:self|hub)["']/i.test(attributes));
  const atomHref = atomAlternate ? attributeValue(atomAlternate, "href") : "";
  const rawUrl = firstNonEmpty([rssLink, atomHref, /^https?:\/\//i.test(guid) ? guid : ""]);

  if (!rawUrl) return "";

  try {
    return normalizeUrl(new URL(rawUrl, feedUrl).toString());
  } catch {
    return normalizeUrl(rawUrl);
  }
}

export function parseOpmlFeedUrls(opml: string) {
  const feeds = new Map<string, { title: string; url: string }>();

  for (const match of opml.matchAll(/<outline\b([^>]*)\/?>/gi)) {
    const attributes = match[1] ?? "";
    const url = normalizeUrl(firstNonEmpty([
      attributeValue(attributes, "xmlUrl"),
      attributeValue(attributes, "xmlurl"),
      attributeValue(attributes, "feedUrl"),
      attributeValue(attributes, "url"),
    ]));
    if (!url) continue;

    const title = firstNonEmpty([
      attributeValue(attributes, "title"),
      attributeValue(attributes, "text"),
      guessSourceLabel(url) ?? "",
    ]);
    feeds.set(url, { title, url });
  }

  return [...feeds.values()];
}

export function parseRssFeed(xml: string, feedUrl: string) {
  const feedTitle = firstNonEmpty([
    childValue(childValue(xml, "channel") ? xml : "", "title"),
    childValue(xml, "title"),
    guessSourceLabel(feedUrl) ?? "",
  ]);
  const itemBlocks = [
    ...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi),
    ...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi),
  ].map((match) => match[0]);
  const items: ParsedFeedItem[] = [];

  for (const itemXml of itemBlocks.slice(0, MAX_ITEMS_PER_FEED)) {
    const title = childValue(itemXml, "title");
    const url = getItemUrl(itemXml, feedUrl);
    if (!title || !url) continue;

    const summary = firstNonEmpty([
      childValue(itemXml, "description"),
      childValue(itemXml, "summary"),
      childValue(itemXml, "content:encoded"),
      childValue(itemXml, "content"),
    ]);
    const publishedAt = toIsoDate(firstNonEmpty([
      childValue(itemXml, "pubDate"),
      childValue(itemXml, "published"),
      childValue(itemXml, "updated"),
      childValue(itemXml, "dc:date"),
    ]));

    items.push({
      publishedAt,
      summary: summary.slice(0, 1200),
      title: title.slice(0, 500),
      url,
    });
  }

  return {
    title: feedTitle,
    items: uniqueByUrl(items),
  };
}

function looksLikeNewsArticleUrl(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    if (path.includes("/video/") || path.includes("/videos/")) return false;
    if (/\.(jpg|jpeg|png|webp|gif)$/i.test(path)) return false;

    if (parsed.hostname.includes("apnews.com")) {
      return path.includes("/article/") || /\/[a-f0-9]{32}$/.test(path);
    }

    if (parsed.hostname.includes("reuters.com")) {
      return !path.includes("/pictures/") && /\d{4}-\d{2}-\d{2}/.test(path);
    }

    return path.split("/").filter(Boolean).length >= 2 && !/\/(tag|category|hub|section|topics?)\b/i.test(path);
  } catch {
    return false;
  }
}

function guessTitleFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const segment = parsed.pathname.split("/").filter(Boolean).at(-1) ?? "";
    return cleanText(segment
      .replace(/[a-f0-9]{20,}$/i, "")
      .replace(/\d{4}-\d{2}-\d{2}$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase()));
  } catch {
    return "";
  }
}

function parseSitemapFeed(xml: string, feedUrl: string) {
  const urlBlocks = [...xml.matchAll(/<url\b[\s\S]*?<\/url>/gi)].map((match) => match[0]);
  const items: ParsedFeedItem[] = [];

  for (const urlXml of urlBlocks.slice(0, MAX_ITEMS_PER_FEED * 3)) {
    const url = normalizeUrl(childValue(urlXml, "loc"));
    if (!url || !looksLikeNewsArticleUrl(url)) continue;

    const title = firstNonEmpty([
      childValue(urlXml, "news:title"),
      childValue(urlXml, "title"),
      guessTitleFromUrl(url),
    ]);
    if (!title) continue;

    items.push({
      publishedAt: toIsoDate(firstNonEmpty([
        childValue(urlXml, "news:publication_date"),
        childValue(urlXml, "lastmod"),
      ])),
      summary: "",
      title: title.slice(0, 500),
      url,
    });

    if (items.length >= MAX_ITEMS_PER_FEED) break;
  }

  return {
    items: uniqueByUrl(items),
    title: guessSourceLabel(feedUrl) ?? "",
  };
}

function parseHtmlNewsPage(html: string, feedUrl: string) {
  const items: ParsedFeedItem[] = [];

  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attributes = match[1] ?? "";
    const href = attributeValue(attributes, "href");
    if (!href) continue;

    let url = "";
    try {
      url = normalizeUrl(new URL(href, feedUrl).toString());
    } catch {
      url = normalizeUrl(href);
    }

    if (!url || !looksLikeNewsArticleUrl(url)) continue;

    const title = cleanText(match[2]);
    if (title.length < 25 || title.length > 220) continue;
    if (/^(watch|listen|sign in|subscribe|read more|learn more)$/i.test(title)) continue;

    items.push({
      publishedAt: null,
      summary: "",
      title: title.slice(0, 500),
      url,
    });

    if (items.length >= MAX_ITEMS_PER_FEED) break;
  }

  return {
    items: uniqueByUrl(items),
    title: titleFromHtml(html) || guessSourceLabel(feedUrl) || "",
  };
}

export async function listAdminRssFeeds() {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("admin_rss_feeds")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    const err = new Error(error.message);
    if (relationMissing(err)) return [];
    throw err;
  }

  return ((data ?? []) as RssFeedRow[]).map(toFeed);
}

const RSS_FEED_CATEGORIES = new Set(["News", "Local", "Politics", "Sports", "Business", "Tech", "Culture", "Other"]);

function cleanCategory(value: string | null | undefined) {
  const trimmed = cleanText(value);
  if (!trimmed) return "News";

  const matching = [...RSS_FEED_CATEGORIES].find((category) => category.toLowerCase() === trimmed.toLowerCase());
  return matching ?? "Other";
}

export async function upsertAdminRssFeed(input: { category?: string; enabled?: boolean; title?: string; url: string }) {
  const supabase = supabaseServer();
  const url = normalizeUrl(input.url);
  if (!url) {
    throw new Error("A valid RSS feed URL is required.");
  }

  const nowIso = new Date().toISOString();
  const title = cleanText(input.title) || guessSourceLabel(url) || "";
  const { data, error } = await supabase
    .from("admin_rss_feeds")
    .upsert(
      {
        category: cleanCategory(input.category),
        enabled: input.enabled ?? true,
        title,
        updated_at: nowIso,
        url,
      },
      { onConflict: "url" }
    )
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return toFeed(data as RssFeedRow);
}

export async function importAdminRssOpml(opml: string) {
  const feeds = parseOpmlFeedUrls(opml);
  if (feeds.length === 0) {
    throw new Error("No RSS feed URLs were found in that OPML file.");
  }

  const imported: AdminRssFeed[] = [];
  for (const feed of feeds) {
    imported.push(await upsertAdminRssFeed({ title: feed.title, url: feed.url }));
  }

  return {
    imported,
    importedCount: imported.length,
  };
}

export async function updateAdminRssFeed(
  id: string,
  input: {
    category?: string;
    enabled?: boolean;
    title?: string;
    url?: string;
  }
) {
  const supabase = supabaseServer();
  const patch: Record<string, string | boolean | null> = {
    updated_at: new Date().toISOString(),
  };

  if (input.title != null) patch.title = cleanText(input.title);
  if (input.category != null) patch.category = cleanCategory(input.category);
  if (input.enabled != null) patch.enabled = input.enabled;
  if (input.url != null) {
    const url = normalizeUrl(input.url);
    if (!url) throw new Error("A valid RSS feed URL is required.");
    patch.url = url;
  }

  const { data, error } = await supabase
    .from("admin_rss_feeds")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return toFeed(data as RssFeedRow);
}

export async function deleteAdminRssFeed(id: string) {
  const supabase = supabaseServer();
  const { error } = await supabase.from("admin_rss_feeds").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateAdminRssClusterAction(clusterId: string, status: "hidden" | "reviewed" | "new") {
  const supabase = supabaseServer();
  const id = cleanText(clusterId);
  if (!id) {
    throw new Error("Cluster id is required.");
  }

  if (status === "new") {
    const { error } = await supabase.from("admin_rss_cluster_actions").delete().eq("cluster_id", id);
    if (error) throw new Error(error.message);
    return { clusterId: id, status };
  }

  const { error } = await supabase.from("admin_rss_cluster_actions").upsert(
    {
      cluster_id: id,
      status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cluster_id" }
  );

  if (error) throw new Error(error.message);
  return { clusterId: id, status };
}

async function fetchFeed(feed: AdminRssFeed) {
  const response = await fetch(feed.url, {
    headers: {
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
      "User-Agent": FEED_USER_AGENT,
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    throw new Error(`Feed returned ${response.status}`);
  }

  const body = await response.text();
  const rss = parseRssFeed(body, feed.url);
  if (rss.items.length > 0) return rss;

  const sitemap = parseSitemapFeed(body, feed.url);
  if (sitemap.items.length > 0) return sitemap;

  return parseHtmlNewsPage(body, feed.url);
}

async function updateFeedAfterScan(feedId: string, input: { itemCount?: number; lastError: string | null; title?: string }) {
  const supabase = supabaseServer();
  const patch: Record<string, string | number | null> = {
    last_checked_at: new Date().toISOString(),
    last_error: input.lastError,
    updated_at: new Date().toISOString(),
  };

  if (input.itemCount != null) patch.item_count = input.itemCount;
  if (input.title) patch.title = input.title;

  const { error } = await supabase.from("admin_rss_feeds").update(patch).eq("id", feedId);
  if (error) throw new Error(error.message);
}

async function upsertFeedItems(feed: AdminRssFeed, sourceName: string, items: ParsedFeedItem[]) {
  if (items.length === 0) return { itemCount: 0, newItemCount: 0 };

  const supabase = supabaseServer();
  const urls = items.map((item) => item.url);
  const { data: existingRows, error: existingError } = await supabase
    .from("admin_rss_items")
    .select("url")
    .in("url", urls);

  if (existingError) throw new Error(existingError.message);

  const existingUrls = new Set(((existingRows ?? []) as Array<{ url: string }>).map((row) => row.url));
  const nowIso = new Date().toISOString();
  const rows = items.map((item) => ({
    content_hash: contentHash(item),
    feed_id: feed.id,
    last_seen_at: nowIso,
    published_at: item.publishedAt,
    source_name: sourceName || feed.title || guessSourceLabel(feed.url) || "",
    summary: item.summary,
    title: item.title,
    url: item.url,
  }));
  const { error } = await supabase.from("admin_rss_items").upsert(rows, { onConflict: "url" });

  if (error) throw new Error(error.message);

  return {
    itemCount: rows.length,
    newItemCount: urls.filter((url) => !existingUrls.has(url)).length,
  };
}

export async function scanAdminRssFeeds(options?: { feedIds?: string[] }) {
  const supabase = supabaseServer();
  const runStart = new Date().toISOString();
  const { data: runData, error: runError } = await supabase
    .from("admin_rss_scan_runs")
    .insert({ started_at: runStart, status: "running" })
    .select("*")
    .single();

  if (runError) throw new Error(runError.message);

  const runId = (runData as RssScanRunRow).id;
  let feedCount = 0;
  let itemCount = 0;
  let newItemCount = 0;

  try {
    let query = supabase.from("admin_rss_feeds").select("*").eq("enabled", true).order("created_at", { ascending: true }).limit(MAX_SCAN_FEEDS);
    const feedIds = options?.feedIds?.map((id) => id.trim()).filter(Boolean) ?? [];
    if (feedIds.length > 0) {
      query = query.in("id", feedIds);
    }

    const { data: feedRows, error: feedError } = await query;
    if (feedError) throw new Error(feedError.message);

    const feeds = ((feedRows ?? []) as RssFeedRow[]).map(toFeed);
    feedCount = feeds.length;

    for (const feed of feeds) {
      try {
        const parsed = await fetchFeed(feed);
        const sourceName = parsed.title || feed.title || guessSourceLabel(feed.url) || "";
        const result = await upsertFeedItems(feed, sourceName, parsed.items);
        itemCount += result.itemCount;
        newItemCount += result.newItemCount;
        await updateFeedAfterScan(feed.id, {
          itemCount: result.itemCount,
          lastError: null,
          title: parsed.title || feed.title,
        });
      } catch (error) {
        await updateFeedAfterScan(feed.id, {
          lastError: messageFromError(error),
        });
      }
    }

    const { error: completeError } = await supabase
      .from("admin_rss_scan_runs")
      .update({
        feed_count: feedCount,
        finished_at: new Date().toISOString(),
        item_count: itemCount,
        new_item_count: newItemCount,
        status: "completed",
      })
      .eq("id", runId);

    if (completeError) throw new Error(completeError.message);

    return {
      feedCount,
      itemCount,
      newItemCount,
    };
  } catch (error) {
    await supabase
      .from("admin_rss_scan_runs")
      .update({
        error: messageFromError(error),
        feed_count: feedCount,
        finished_at: new Date().toISOString(),
        item_count: itemCount,
        new_item_count: newItemCount,
        status: "error",
      })
      .eq("id", runId);
    throw error;
  }
}

export async function clearAdminRssItems(options?: { feedIds?: string[] }) {
  const supabase = supabaseServer();
  const feedIds = options?.feedIds?.map((id) => id.trim()).filter(Boolean) ?? [];
  let query = supabase.from("admin_rss_items").delete().not("id", "is", null);

  if (feedIds.length > 0) {
    query = query.in("feed_id", feedIds);
  }

  const { error } = await query;
  if (error) throw new Error(error.message);
}

function tokenize(value: string) {
  return cleanText(value)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function itemTerms(item: AdminRssItem) {
  return new Set(tokenize(`${item.title} ${item.summary}`).slice(0, 80));
}

function sharedTerms(left: Set<string>, right: Set<string>) {
  const shared: string[] = [];
  for (const term of left) {
    if (right.has(term)) shared.push(term);
  }
  return shared;
}

function similarityScore(left: AdminRssItem, right: AdminRssItem) {
  const leftTerms = itemTerms(left);
  const rightTerms = itemTerms(right);
  const shared = sharedTerms(leftTerms, rightTerms);
  if (shared.length === 0) return { score: 0, shared };

  const unionSize = new Set([...leftTerms, ...rightTerms]).size;
  const titleShared = sharedTerms(new Set(tokenize(left.title)), new Set(tokenize(right.title))).length;
  const score = shared.length / Math.max(1, unionSize) + Math.min(titleShared, 4) * 0.08;

  return {
    score,
    shared: shared.slice(0, 8),
  };
}

function publishedMs(item: AdminRssItem) {
  const parsed = Date.parse(item.publishedAt ?? item.lastSeenAt ?? item.firstSeenAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hostnameForUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

function isWireService(sourceName: string, url: string) {
  const haystack = `${sourceName} ${hostnameForUrl(url)}`.toLowerCase();
  return /\breuters\b|reuters\.com|\bassociated press\b|\bap news\b|apnews\.com|\bapnews\b/.test(haystack);
}

function sourceWeight(sourceName: string, url: string) {
  return isWireService(sourceName, url) ? 1.5 : 1;
}

function cleanHeadline(value: string) {
  return cleanText(value)
    .replace(/\s*[-|–—:]\s*(Reuters|Associated Press|AP News|AP|CNN|Fox News|NBC News|CBS News|ABC News|The Guardian|BBC News)\s*$/i, "")
    .replace(/^(live updates?|breaking news|update)\s*[:|-]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function chooseClusterTitle(items: AdminRssItem[]) {
  const scored = items.map((item) => {
    const title = cleanHeadline(item.title);
    const comparisons = items
      .filter((candidate) => candidate.id !== item.id)
      .map((candidate) => similarityScore({ ...item, title }, candidate).score);
    const centrality = comparisons.length > 0 ? comparisons.reduce((sum, score) => sum + score, 0) / comparisons.length : 0;
    const lengthPenalty = title.length < 35 || title.length > 140 ? 0.08 : 0;
    const livePenalty = /live updates?|what to know|latest/i.test(item.title) ? 0.08 : 0;
    const wireBoost = isWireService(item.sourceName, item.url) ? 0.05 : 0;

    return {
      item,
      score: centrality + wireBoost - lengthPenalty - livePenalty,
      title,
    };
  });

  return scored
    .filter((row) => row.title)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return publishedMs(right.item) - publishedMs(left.item);
    })[0]?.title ?? "Untitled story";
}

function storySearchText(story: StoryWithViews) {
  return [
    story.title,
    ...story.summary,
    ...story.topics,
    ...story.tags,
    ...story.primary_entities,
    ...story.entities.map((entity) => entity.name),
    ...story.sources.map((source) => `${source.name} ${source.title ?? ""}`),
  ].join(" ");
}

function existingStoryMatchesForCluster(items: AdminRssItem[], stories: StoryWithViews[]) {
  const clusterText = items.map((item) => `${item.title} ${item.summary}`).join(" ");
  const clusterTerms = new Set(tokenize(clusterText));
  const clusterTitleTerms = new Set(tokenize(chooseClusterTitle(items)));

  return stories
    .map((story) => {
      const storyTerms = new Set(tokenize(storySearchText(story)));
      const storyTitleTerms = new Set(tokenize(story.title));
      const allShared = sharedTerms(clusterTerms, storyTerms).length;
      const titleShared = sharedTerms(clusterTitleTerms, storyTitleTerms).length;
      const score = allShared / Math.max(4, Math.min(clusterTerms.size, 24)) + titleShared * 0.1;

      return {
        id: story.id,
        score: Number(score.toFixed(3)),
        status: story.status,
        title: story.title,
      };
    })
    .filter((match) => match.score >= 0.28)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
}

function categoryCoverageForCluster(
  items: AdminRssItem[],
  feedsById: Map<string, AdminRssFeed>,
  enabledFeedCountsByCategory: Map<string, number>
) {
  const feedIdsByCategory = new Map<string, Set<string>>();

  for (const item of items) {
    const category = cleanCategory(item.feedId ? feedsById.get(item.feedId)?.category : null);
    const feedIds = feedIdsByCategory.get(category) ?? new Set<string>();
    feedIds.add(item.feedId ?? hostnameForUrl(item.url));
    feedIdsByCategory.set(category, feedIds);
  }

  return [...feedIdsByCategory.entries()]
    .map(([category, feedIds]) => {
      const totalEnabledFeeds = Math.max(1, enabledFeedCountsByCategory.get(category) ?? feedIds.size);
      return {
        category,
        feedCount: feedIds.size,
        saturation: Number((feedIds.size / totalEnabledFeeds).toFixed(3)),
        totalEnabledFeeds,
      };
    })
    .sort((left, right) => right.saturation - left.saturation || right.feedCount - left.feedCount);
}

function priorityForCluster(options: {
  categoryCoverage: AdminRssCluster["categoryCoverage"];
  newestPublishedAt: string | null;
  sourceDiversity: number;
  wireServiceCount: number;
  weightedSourceCount: number;
}) {
  const newestMs = Date.parse(options.newestPublishedAt ?? "");
  const ageHours = Number.isFinite(newestMs) ? Math.max(0, (Date.now() - newestMs) / 3_600_000) : 168;
  const recencyScore = Math.max(0, 1 - Math.min(ageHours, 96) / 96);
  const strongestCategoryCoverage = options.categoryCoverage[0]?.saturation ?? 0;

  return Number((
    Math.log(options.weightedSourceCount + 1) * 35
    + recencyScore * 25
    + Math.min(options.sourceDiversity, 6) * 4
    + strongestCategoryCoverage * 35
    + Math.min(options.wireServiceCount, 2) * 10
  ).toFixed(2));
}

function clusterRecentItems(
  items: AdminRssItem[],
  feeds: AdminRssFeed[],
  stories: StoryWithViews[],
  actionStatusByClusterId: Map<string, "hidden" | "reviewed">
) {
  const sorted = [...items].sort((left, right) => publishedMs(right) - publishedMs(left));
  const clusters: Array<{ items: AdminRssItem[]; sharedTerms: string[]; score: number }> = [];
  const feedsById = new Map(feeds.map((feed) => [feed.id, feed]));
  const enabledFeedCountsByCategory = new Map<string, number>();

  for (const feed of feeds) {
    if (!feed.enabled) continue;
    const category = cleanCategory(feed.category);
    enabledFeedCountsByCategory.set(category, (enabledFeedCountsByCategory.get(category) ?? 0) + 1);
  }

  for (const item of sorted) {
    let bestCluster: { index: number; score: number; shared: string[] } | null = null;

    for (let index = 0; index < clusters.length; index += 1) {
      const cluster = clusters[index];
      const comparisons = cluster.items.map((candidate) => similarityScore(item, candidate));
      const best = comparisons.sort((left, right) => right.score - left.score)[0];
      if (!best || best.score < 0.32) continue;
      if (!bestCluster || best.score > bestCluster.score) {
        bestCluster = { index, score: best.score, shared: best.shared };
      }
    }

    if (bestCluster) {
      const cluster = clusters[bestCluster.index];
      cluster.items.push(item);
      cluster.score = Math.max(cluster.score, bestCluster.score);
      cluster.sharedTerms = [...new Set([...cluster.sharedTerms, ...bestCluster.shared])].slice(0, 8);
    } else {
      clusters.push({ items: [item], score: 0, sharedTerms: [] });
    }
  }

  return clusters
    .filter((cluster) => cluster.items.length >= 2)
    .map((cluster) => {
      const clusterItems = [...cluster.items].sort((left, right) => publishedMs(right) - publishedMs(left));
      const sourceDiversity = new Set(clusterItems.map((item) => hostnameForUrl(item.url))).size;
      const wireServiceCount = clusterItems.filter((item) => isWireService(item.sourceName, item.url)).length;
      const weightedSourceCount = clusterItems.reduce((sum, item) => sum + sourceWeight(item.sourceName, item.url), 0);
      const categoryCoverage = categoryCoverageForCluster(clusterItems, feedsById, enabledFeedCountsByCategory);
      const newestPublishedAt = clusterItems[0]?.publishedAt ?? clusterItems[0]?.lastSeenAt ?? null;
      const priorityScore = priorityForCluster({
        categoryCoverage,
        newestPublishedAt,
        sourceDiversity,
        weightedSourceCount,
        wireServiceCount,
      });
      const id = createHash("sha1").update(clusterItems.map((item) => item.url).join("\n")).digest("hex").slice(0, 16);
      return {
        actionStatus: actionStatusByClusterId.get(id) ?? "new",
        categoryCoverage,
        existingStoryMatches: existingStoryMatchesForCluster(clusterItems, stories),
        id,
        newestPublishedAt,
        priorityScore,
        score: Number(cluster.score.toFixed(3)),
        sharedTerms: cluster.sharedTerms,
        sourceDiversity,
        wireServiceCount,
        sources: clusterItems.map((item) => ({
          category: cleanCategory(item.feedId ? feedsById.get(item.feedId)?.category : null),
          id: item.id,
          isWireService: isWireService(item.sourceName, item.url),
          publishedAt: item.publishedAt,
          sourceWeight: sourceWeight(item.sourceName, item.url),
          sourceName: item.sourceName,
          summary: item.summary,
          title: item.title,
          url: item.url,
        })),
        storyTitle: chooseClusterTitle(clusterItems),
      } satisfies AdminRssCluster;
    })
    .sort((left, right) => {
      if (right.priorityScore !== left.priorityScore) return right.priorityScore - left.priorityScore;
      return Date.parse(right.newestPublishedAt ?? "") - Date.parse(left.newestPublishedAt ?? "");
    })
    .slice(0, 30);
}

export async function getAdminRssDiscoveryData(options?: { windowDays?: number }): Promise<AdminRssDiscoveryData> {
  const supabase = supabaseServer();
  try {
    const windowDays = Math.max(1, Math.min(14, Math.floor(options?.windowDays ?? 7)));
    const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
    const [
      { data: feedRows, error: feedError },
      { data: itemRows, error: itemError },
      { data: scanRows, error: scanError },
      { data: storyRows, error: storyError },
      { data: actionRows, error: actionError },
    ] =
      await Promise.all([
        supabase.from("admin_rss_feeds").select("*").order("created_at", { ascending: false }),
        supabase
          .from("admin_rss_items")
          .select("*")
          .or(`published_at.gte.${since},last_seen_at.gte.${since}`)
          .order("published_at", { ascending: false, nullsFirst: false })
          .order("last_seen_at", { ascending: false })
          .limit(300),
        supabase.from("admin_rss_scan_runs").select("*").order("started_at", { ascending: false }).limit(1),
        supabase
          .from("stories")
          .select("*")
          .in("status", ["draft", "published"])
          .order("created_at", { ascending: false })
          .limit(300),
        supabase.from("admin_rss_cluster_actions").select("cluster_id, status"),
      ]);

    if (feedError) throw new Error(feedError.message);
    if (itemError) throw new Error(itemError.message);
    if (scanError) throw new Error(scanError.message);
    if (storyError) throw new Error(storyError.message);
    if (actionError) throw new Error(actionError.message);

    const feeds = ((feedRows ?? []) as RssFeedRow[]).map(toFeed);
    const latestItems = ((itemRows ?? []) as RssItemRow[]).map(toItem);
    const latestScan = ((scanRows ?? []) as RssScanRunRow[]).map(toScanRun)[0] ?? null;
    const stories = ((storyRows ?? []) as StoryDbRow[]).map(coerceStory);
    const actionStatusByClusterId = new Map<string, "hidden" | "reviewed">(
      ((actionRows ?? []) as RssClusterActionRow[])
        .filter((row) => row.status === "hidden" || row.status === "reviewed")
        .map((row) => [row.cluster_id, row.status as "hidden" | "reviewed"])
    );

    return {
      clusters: clusterRecentItems(latestItems, feeds, stories, actionStatusByClusterId),
      feeds,
      latestItems: latestItems.slice(0, 50),
      latestScan,
    };
  } catch (error) {
    if (relationMissing(error)) {
      return {
        clusters: [],
        feeds: [],
        latestItems: [],
        latestScan: null,
      };
    }

    throw error;
  }
}
