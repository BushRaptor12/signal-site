"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import BackLink from "@/app/back-link";
import { formatUpdatedAt } from "@/app/lib/dates";
import type { AdminRssCluster, AdminRssDiscoveryData, AdminRssFeed } from "@/app/lib/rss-discovery";
import { ADMIN_INSET, ADMIN_INSET_INTERACTIVE, ADMIN_PANEL } from "@/app/lib/surfaces";

type RssDiscoveryClientProps = {
  initialData: AdminRssDiscoveryData;
};

type Notice = {
  tone: "error" | "info" | "success";
  text: string;
} | null;

type ClusterSort = "priority" | "links" | "newest" | "diversity";

const FEED_CATEGORIES = ["News", "Local", "Politics", "Sports", "Business", "Tech", "Culture", "Other"];

const CLUSTER_SORT_OPTIONS: Array<{ label: string; value: ClusterSort }> = [
  { label: "Priority", value: "priority" },
  { label: "Most links", value: "links" },
  { label: "Newest", value: "newest" },
  { label: "Diversity", value: "diversity" },
];

const TIME_WINDOW_OPTIONS = [1, 3, 7, 14];
const DISCOVERY_SOURCE_IMPORT_KEY = "beacon:admin-discovery-sources";

function messageFromError(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function formatDate(value: string | null) {
  if (!value) return "Unknown";
  return formatUpdatedAt(value);
}

function feedDraftFrom(feed: AdminRssFeed) {
  return {
    category: feed.category,
    enabled: feed.enabled,
    title: feed.title,
    url: feed.url,
  };
}

function defaultSelectedSourceIds(clusters: AdminRssCluster[]) {
  const ids = new Set<string>();

  for (const cluster of clusters) {
    const preferred = [...cluster.sources]
      .sort((left, right) => {
        if (Number(right.isWireService) !== Number(left.isWireService)) {
          return Number(right.isWireService) - Number(left.isWireService);
        }
        return Date.parse(right.publishedAt ?? "") - Date.parse(left.publishedAt ?? "");
      })
      .slice(0, 4);

    for (const source of preferred) {
      ids.add(source.id);
    }
  }

  return ids;
}

export default function RssDiscoveryClient({ initialData }: RssDiscoveryClientProps) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [clusterSort, setClusterSort] = useState<ClusterSort>("priority");
  const [timeWindowDays, setTimeWindowDays] = useState(7);
  const [showHidden, setShowHidden] = useState(false);
  const [showReviewed, setShowReviewed] = useState(true);
  const [feedCategory, setFeedCategory] = useState("News");
  const [feedTitle, setFeedTitle] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [opml, setOpml] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(() => new Set());
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(() => defaultSelectedSourceIds(initialData.clusters));
  const [feedDrafts, setFeedDrafts] = useState<Record<string, ReturnType<typeof feedDraftFrom>>>(
    () => Object.fromEntries(initialData.feeds.map((feed) => [feed.id, feedDraftFrom(feed)]))
  );

  const enabledFeedCount = useMemo(() => data.feeds.filter((feed) => feed.enabled).length, [data.feeds]);
  const sortedClusters = useMemo(() => {
    return data.clusters
      .filter((cluster) => showHidden || cluster.actionStatus !== "hidden")
      .filter((cluster) => showReviewed || cluster.actionStatus !== "reviewed")
      .sort((left, right) => {
      if (clusterSort === "links") {
        if (right.sources.length !== left.sources.length) return right.sources.length - left.sources.length;
      } else if (clusterSort === "newest") {
        const diff = Date.parse(right.newestPublishedAt ?? "") - Date.parse(left.newestPublishedAt ?? "");
        if (diff !== 0) return diff;
      } else if (clusterSort === "diversity") {
        if (right.sourceDiversity !== left.sourceDiversity) return right.sourceDiversity - left.sourceDiversity;
      } else if (right.priorityScore !== left.priorityScore) {
        return right.priorityScore - left.priorityScore;
      }

      if (right.priorityScore !== left.priorityScore) return right.priorityScore - left.priorityScore;
      return Date.parse(right.newestPublishedAt ?? "") - Date.parse(left.newestPublishedAt ?? "");
      });
  }, [clusterSort, data.clusters, showHidden, showReviewed]);

  function syncData(nextData: AdminRssDiscoveryData) {
    setData(nextData);
    setFeedDrafts(Object.fromEntries(nextData.feeds.map((feed) => [feed.id, feedDraftFrom(feed)])));
    setSelectedSourceIds((prev) => {
      const nextSourceIds = new Set(nextData.clusters.flatMap((cluster) => cluster.sources.map((source) => source.id)));
      const preserved = [...prev].filter((id) => nextSourceIds.has(id));
      return new Set(preserved.length > 0 ? preserved : defaultSelectedSourceIds(nextData.clusters));
    });
    setExpandedClusters((prev) => {
      const nextIds = new Set(nextData.clusters.map((cluster) => cluster.id));
      const preserved = [...prev].filter((id) => nextIds.has(id));
      return new Set(preserved);
    });
  }

  function toggleCluster(clusterId: string) {
    setExpandedClusters((prev) => {
      const next = new Set(prev);
      if (next.has(clusterId)) {
        next.delete(clusterId);
      } else {
        next.add(clusterId);
      }
      return next;
    });
  }

  async function refreshData(nextWindowDays = timeWindowDays) {
    const params = new URLSearchParams({ windowDays: String(nextWindowDays) });
    const response = await fetch(`/api/admin/rss-scan?${params.toString()}`, { cache: "no-store" });
    const json = (await response.json().catch(() => ({}))) as { data?: AdminRssDiscoveryData; error?: string };
    if (!response.ok || !json.data) {
      throw new Error(json.error ?? "We couldn't refresh RSS discovery data.");
    }

    syncData(json.data);
  }

  async function changeTimeWindow(nextWindowDays: number) {
    setTimeWindowDays(nextWindowDays);
    setBusyAction("window");
    try {
      await refreshData(nextWindowDays);
    } catch (error) {
      setNotice({ tone: "error", text: messageFromError(error, "We couldn't load that time window.") });
    } finally {
      setBusyAction(null);
    }
  }

  async function runScan() {
    setBusyAction("scan");
    setNotice({ tone: "info", text: "Scanning feeds..." });

    try {
      const response = await fetch("/api/admin/rss-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windowDays: timeWindowDays }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        data?: AdminRssDiscoveryData;
        error?: string;
        result?: { feedCount: number; itemCount: number; newItemCount: number };
      };
      if (!response.ok || !json.data) {
        throw new Error(json.error ?? "We couldn't scan RSS feeds.");
      }

      syncData(json.data);
      setNotice({
        tone: "success",
        text: `Scanned ${json.result?.feedCount ?? 0} feeds, found ${json.result?.itemCount ?? 0} items, ${json.result?.newItemCount ?? 0} new.`,
      });
    } catch (error) {
      setNotice({ tone: "error", text: messageFromError(error, "We couldn't scan RSS feeds.") });
    } finally {
      setBusyAction(null);
    }
  }

  function toggleSelectedSource(sourceId: string) {
    setSelectedSourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
  }

  async function updateClusterStatus(clusterId: string, status: "hidden" | "new" | "reviewed") {
    setBusyAction(`cluster:${clusterId}:${status}`);
    try {
      const response = await fetch(`/api/admin/rss-clusters/${encodeURIComponent(clusterId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? "We couldn't update that cluster.");
      }

      setData((prev) => ({
        ...prev,
        clusters: prev.clusters.map((cluster) => (
          cluster.id === clusterId ? { ...cluster, actionStatus: status } : cluster
        )),
      }));
    } catch (error) {
      setNotice({ tone: "error", text: messageFromError(error, "We couldn't update that cluster.") });
    } finally {
      setBusyAction(null);
    }
  }

  function importSelectedSources(cluster: AdminRssCluster) {
    const selectedSources = cluster.sources.filter((source) => selectedSourceIds.has(source.id));
    if (selectedSources.length === 0) {
      setNotice({ tone: "error", text: "Select at least one link from this cluster first." });
      return;
    }

    window.sessionStorage.setItem(
      DISCOVERY_SOURCE_IMPORT_KEY,
      JSON.stringify({
        storyTitle: cluster.storyTitle,
        sources: selectedSources.map((source) => ({
          name: source.sourceName,
          title: source.title,
          url: source.url,
        })),
      })
    );
    router.push("/admin/editor?from=discovery");
  }

  async function addFeed() {
    if (!feedUrl.trim()) {
      setNotice({ tone: "error", text: "Enter an RSS feed URL first." });
      return;
    }

    setBusyAction("add-feed");
    try {
      const response = await fetch("/api/admin/rss-feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: feedCategory, title: feedTitle, url: feedUrl }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string; feed?: AdminRssFeed };
      if (!response.ok || !json.feed) {
        throw new Error(json.error ?? "We couldn't save that RSS feed.");
      }

      setFeedTitle("");
      setFeedCategory("News");
      setFeedUrl("");
      await refreshData();
      setNotice({ tone: "success", text: "Feed saved." });
    } catch (error) {
      setNotice({ tone: "error", text: messageFromError(error, "We couldn't save that RSS feed.") });
    } finally {
      setBusyAction(null);
    }
  }

  async function importOpml() {
    if (!opml.trim()) {
      setNotice({ tone: "error", text: "Paste or upload OPML first." });
      return;
    }

    setBusyAction("opml");
    try {
      const response = await fetch("/api/admin/rss-feeds/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opml }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string; importedCount?: number };
      if (!response.ok) {
        throw new Error(json.error ?? "We couldn't import that OPML file.");
      }

      setOpml("");
      await refreshData();
      setNotice({ tone: "success", text: `Imported ${json.importedCount ?? 0} feeds.` });
    } catch (error) {
      setNotice({ tone: "error", text: messageFromError(error, "We couldn't import that OPML file.") });
    } finally {
      setBusyAction(null);
    }
  }

  async function updateFeed(feed: AdminRssFeed) {
    const draft = feedDrafts[feed.id] ?? feedDraftFrom(feed);
    setBusyAction(`feed:${feed.id}`);

    try {
      const response = await fetch(`/api/admin/rss-feeds/${encodeURIComponent(feed.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? "We couldn't update that RSS feed.");
      }

      await refreshData();
      setNotice({ tone: "success", text: "Feed updated." });
    } catch (error) {
      setNotice({ tone: "error", text: messageFromError(error, "We couldn't update that RSS feed.") });
    } finally {
      setBusyAction(null);
    }
  }

  async function removeFeed(feed: AdminRssFeed) {
    setBusyAction(`remove:${feed.id}`);
    try {
      const response = await fetch(`/api/admin/rss-feeds/${encodeURIComponent(feed.id)}`, {
        method: "DELETE",
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? "We couldn't remove that RSS feed.");
      }

      await refreshData();
      setNotice({ tone: "success", text: "Feed removed." });
    } catch (error) {
      setNotice({ tone: "error", text: messageFromError(error, "We couldn't remove that RSS feed.") });
    } finally {
      setBusyAction(null);
    }
  }

  async function readOpmlFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    setOpml(text);
  }

  return (
    <main className="min-h-screen bg-[#05080d] px-4 py-8 text-neutral-100 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <BackLink href="/admin" label="Admin" />

        <header className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.22em] text-neutral-500">Admin</div>
            <h1 className="mt-2 text-3xl font-bold">RSS Discovery</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-400">
              Scan source feeds, group similar coverage, and collect related links for story planning.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/admin/editor" className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white">
              Story editor
            </Link>
            <button
              type="button"
              onClick={() => void runScan()}
              disabled={busyAction === "scan"}
              className="rounded-full bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 transition disabled:cursor-wait disabled:opacity-70"
            >
              {busyAction === "scan" ? "Scanning..." : "Scan feeds"}
            </button>
          </div>
        </header>

        {notice ? (
          <div
            className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
              notice.tone === "error"
                ? "border-red-500/40 bg-red-950/25 text-red-100"
                : notice.tone === "success"
                  ? "border-emerald-500/35 bg-emerald-950/20 text-emerald-100"
                  : "border-[#8f7740]/50 bg-[#1d1608] text-[#e3cca0]"
            }`}
          >
            {notice.text}
          </div>
        ) : null}

        <section className="mt-8 grid gap-4 md:grid-cols-4">
          <div className={`${ADMIN_INSET} p-5`}>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Active Feeds</div>
            <div className="mt-3 text-3xl font-semibold">{enabledFeedCount}</div>
          </div>
          <div className={`${ADMIN_INSET} p-5`}>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Clusters</div>
            <div className="mt-3 text-3xl font-semibold">{data.clusters.length}</div>
          </div>
          <div className={`${ADMIN_INSET} p-5`}>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Recent Items</div>
            <div className="mt-3 text-3xl font-semibold">{data.latestItems.length}</div>
          </div>
          <div className={`${ADMIN_INSET} p-5`}>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Last Scan</div>
            <div className="mt-3 text-sm font-semibold text-neutral-200">{formatDate(data.latestScan?.finishedAt ?? data.latestScan?.startedAt ?? null)}</div>
            {data.latestScan ? (
              <div className="mt-2 text-xs uppercase tracking-[0.16em] text-neutral-500">{data.latestScan.status}</div>
            ) : null}
          </div>
        </section>

        <section className={`${ADMIN_PANEL} mt-8 p-6 sm:p-8`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Story Finder</div>
              <h2 className="mt-2 text-2xl font-semibold">Similar Coverage</h2>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {TIME_WINDOW_OPTIONS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => void changeTimeWindow(days)}
                    disabled={busyAction === "window"}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                      timeWindowDays === days
                        ? "border-[#8f7740]/70 bg-[#8f7740]/15 text-[#e3cca0]"
                        : "border-neutral-700 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                    }`}
                  >
                    {days === 1 ? "24h" : `${days}d`}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {CLUSTER_SORT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setClusterSort(option.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                      clusterSort === option.value
                        ? "border-[#8f7740]/70 bg-[#8f7740]/15 text-[#e3cca0]"
                        : "border-neutral-700 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-neutral-400">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={showReviewed} onChange={(event) => setShowReviewed(event.target.checked)} />
                  Reviewed
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={showHidden} onChange={(event) => setShowHidden(event.target.checked)} />
                  Hidden
                </label>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            {sortedClusters.map((cluster) => {
              const expanded = expandedClusters.has(cluster.id);
              return (
              <article key={cluster.id} className={`${ADMIN_INSET} p-5`}>
                <div
                  className="flex cursor-pointer flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
                  role="button"
                  tabIndex={0}
                  aria-expanded={expanded}
                  onClick={() => toggleCluster(cluster.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleCluster(cluster.id);
                    }
                  }}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xl font-semibold leading-7 text-neutral-100">{cluster.storyTitle}</h3>
                      {cluster.actionStatus !== "new" ? (
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                          cluster.actionStatus === "hidden"
                            ? "border-red-500/40 text-red-200"
                            : "border-emerald-500/35 text-emerald-200"
                        }`}>
                          {cluster.actionStatus}
                        </span>
                      ) : null}
                      {cluster.wireServiceCount > 0 ? (
                        <span className="rounded-full border border-[#8f7740]/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#e3cca0]">
                          Wire source
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-neutral-500">
                      <span>Priority {cluster.priorityScore}</span>
                      <span>{cluster.sources.length} links</span>
                      <span>{cluster.sourceDiversity} outlets</span>
                      <span>{formatDate(cluster.newestPublishedAt)}</span>
                      {cluster.categoryCoverage[0] ? (
                        <span>
                          {cluster.categoryCoverage[0].category} {cluster.categoryCoverage[0].feedCount}/{cluster.categoryCoverage[0].totalEnabledFeeds}
                        </span>
                      ) : null}
                      {cluster.sharedTerms.length > 0 ? <span>{cluster.sharedTerms.join(", ")}</span> : null}
                    </div>
                    {cluster.existingStoryMatches.length > 0 ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                        <span className="uppercase tracking-[0.16em] text-neutral-500">Existing</span>
                        {cluster.existingStoryMatches.map((story) => (
                          <Link
                            key={story.id}
                            href={`/admin/editor?story=${encodeURIComponent(story.id)}`}
                            onClick={(event) => event.stopPropagation()}
                            className="rounded-full border border-neutral-700 px-3 py-1 text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
                          >
                            {story.title}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        importSelectedSources(cluster);
                      }}
                      className="w-fit rounded-full border border-[#8f7740]/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#e3cca0] transition hover:bg-[#8f7740]/10"
                    >
                      Import selected
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void updateClusterStatus(cluster.id, cluster.actionStatus === "reviewed" ? "new" : "reviewed");
                      }}
                      disabled={busyAction?.startsWith(`cluster:${cluster.id}:`)}
                      className="w-fit rounded-full border border-neutral-700 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-300 transition hover:bg-neutral-800 hover:text-white disabled:cursor-wait disabled:opacity-70"
                    >
                      {cluster.actionStatus === "reviewed" ? "Unreview" : "Reviewed"}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void updateClusterStatus(cluster.id, cluster.actionStatus === "hidden" ? "new" : "hidden");
                      }}
                      disabled={busyAction?.startsWith(`cluster:${cluster.id}:`)}
                      className="w-fit rounded-full border border-[#5b2a2a] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#f0c8c8] transition hover:bg-[#190b0c] disabled:cursor-wait disabled:opacity-70"
                    >
                      {cluster.actionStatus === "hidden" ? "Unhide" : "Hide"}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleCluster(cluster.id);
                      }}
                      aria-expanded={expanded}
                      className="w-fit rounded-full border border-neutral-700 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
                    >
                      {expanded ? "Collapse" : "Expand"}
                    </button>
                  </div>
                </div>

                {expanded ? (
                  <div className="mt-5 grid gap-3 lg:grid-cols-2">
                    {cluster.sources.map((source) => (
                      <div
                        key={source.id}
                        className={`${ADMIN_INSET_INTERACTIVE} block p-4 hover:border-[#8f7740]/60`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <label className="inline-flex items-center gap-2 text-xs text-neutral-300">
                            <input
                              type="checkbox"
                              checked={selectedSourceIds.has(source.id)}
                              onChange={() => toggleSelectedSource(source.id)}
                            />
                            Import
                          </label>
                          <div className="text-xs text-neutral-500">{formatDate(source.publishedAt)}</div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#e3cca0]">{source.sourceName || "Source"}</div>
                          <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-neutral-500">{source.category}</span>
                          {source.isWireService ? (
                            <span className="rounded-full border border-[#8f7740]/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[#e3cca0]">
                              AP/Reuters
                            </span>
                          ) : null}
                        </div>
                        <a href={source.url} target="_blank" rel="noreferrer" className="mt-2 block text-sm font-semibold leading-6 text-neutral-100 hover:text-white">
                          {source.title}
                        </a>
                        {source.summary ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-neutral-400">{source.summary}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
              );
            })}

            {data.clusters.length === 0 ? (
              <div className={`${ADMIN_INSET} p-5 text-sm text-neutral-500`}>
                No similar story groups found yet. Add feeds, import OPML, then run a scan.
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className={`${ADMIN_PANEL} p-6 sm:p-8`}>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Feeds</div>
            <h2 className="mt-2 text-2xl font-semibold">Add Sources</h2>

            <div className="mt-5 space-y-3">
              <input
                value={feedTitle}
                onChange={(event) => setFeedTitle(event.target.value)}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                placeholder="Feed label"
              />
              <select
                value={feedCategory}
                onChange={(event) => setFeedCategory(event.target.value)}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
              >
                {FEED_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <input
                value={feedUrl}
                onChange={(event) => setFeedUrl(event.target.value)}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                placeholder="https://example.com/rss"
              />
              <button
                type="button"
                onClick={() => void addFeed()}
                disabled={busyAction === "add-feed"}
                className="w-full rounded-xl bg-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-900 disabled:cursor-wait disabled:opacity-70"
              >
                {busyAction === "add-feed" ? "Saving..." : "Add feed"}
              </button>
            </div>

            <div className="mt-8">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">OPML Import</div>
              <div className="mt-3">
                <input
                  type="file"
                  accept=".opml,.xml,text/xml"
                  onChange={(event) => void readOpmlFile(event.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-neutral-400 file:mr-3 file:rounded-full file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-neutral-900"
                />
              </div>
              <textarea
                value={opml}
                onChange={(event) => setOpml(event.target.value)}
                className="mt-3 min-h-44 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                placeholder="<opml>...</opml>"
              />
              <button
                type="button"
                onClick={() => void importOpml()}
                disabled={busyAction === "opml"}
                className="mt-3 w-full rounded-xl border border-[#8f7740]/60 px-4 py-3 text-sm font-semibold text-[#e3cca0] hover:bg-[#8f7740]/10 disabled:cursor-wait disabled:opacity-70"
              >
                {busyAction === "opml" ? "Importing..." : "Import OPML"}
              </button>
            </div>
          </div>

          <div className={`${ADMIN_PANEL} p-6 sm:p-8`}>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Feed URLs</div>
            <h2 className="mt-2 text-2xl font-semibold">Manage List</h2>

            <div className="mt-5 space-y-4">
              {data.feeds.map((feed) => {
                const draft = feedDrafts[feed.id] ?? feedDraftFrom(feed);
                return (
                  <div key={feed.id} className={`${ADMIN_INSET} p-4`}>
                    <div className="grid gap-3 md:grid-cols-[0.8fr_1fr_1.5fr_auto]">
                      <select
                        value={draft.category}
                        onChange={(event) =>
                          setFeedDrafts((prev) => ({
                            ...prev,
                            [feed.id]: { ...draft, category: event.target.value },
                          }))
                        }
                        className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                      >
                        {FEED_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                      <input
                        value={draft.title}
                        onChange={(event) =>
                          setFeedDrafts((prev) => ({
                            ...prev,
                            [feed.id]: { ...draft, title: event.target.value },
                          }))
                        }
                        className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                        placeholder="Feed label"
                      />
                      <input
                        value={draft.url}
                        onChange={(event) =>
                          setFeedDrafts((prev) => ({
                            ...prev,
                            [feed.id]: { ...draft, url: event.target.value },
                          }))
                        }
                        className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                        placeholder="Feed URL"
                      />
                      <label className="flex items-center gap-2 text-sm text-neutral-300">
                        <input
                          type="checkbox"
                          checked={draft.enabled}
                          onChange={(event) =>
                            setFeedDrafts((prev) => ({
                              ...prev,
                              [feed.id]: { ...draft, enabled: event.target.checked },
                            }))
                          }
                        />
                        Enabled
                      </label>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-neutral-500">
                        {feed.itemCount} recent items · checked {formatDate(feed.lastCheckedAt)}
                        {feed.lastError ? <span className="text-red-300"> · {feed.lastError}</span> : null}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void updateFeed(feed)}
                          disabled={busyAction === `feed:${feed.id}`}
                          className="rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-70"
                        >
                          {busyAction === `feed:${feed.id}` ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeFeed(feed)}
                          disabled={busyAction === `remove:${feed.id}`}
                          className="rounded-full border border-[#5b2a2a] px-3 py-1.5 text-xs text-[#f0c8c8] hover:bg-[#190b0c] disabled:cursor-wait disabled:opacity-70"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {data.feeds.length === 0 ? (
                <div className={`${ADMIN_INSET} p-5 text-sm text-neutral-500`}>
                  No feeds saved yet.
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
