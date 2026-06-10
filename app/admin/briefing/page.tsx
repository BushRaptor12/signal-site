"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import AdaptiveBriefingImage from "@/app/briefing/adaptive-briefing-image";
import { formatStoryDate } from "@/app/lib/dates";
import { buildBriefingLayout, serializeBriefingLayout, type BriefingLayout } from "@/app/lib/briefing-layout";
import { ADMIN_INSET, ADMIN_PANEL } from "@/app/lib/surfaces";
import type { BriefingPosition, StoryWithViews } from "@/app/lib/types";

type AdminBriefingResponse = {
  briefing?: StoryWithViews[];
  library?: StoryWithViews[];
  error?: string;
  ok?: boolean;
};

type SavedBriefingItem = {
  id: string;
  beacon_headline: string | null;
  beacon_summary: string | null;
  beacon_position: BriefingPosition | null;
  beacon_order: number | null;
};

type BriefingColumn = "left" | "right";
type BriefingTarget = "lead" | BriefingColumn;
type DropTarget = { kind: "lead" } | { kind: "column"; column: BriefingColumn; index: number };
type DragSource = { storyId: string; column: BriefingColumn; index: number };

function displayHeadline(story: StoryWithViews) {
  return story.beacon_headline?.trim() || story.title;
}

function displayBriefingSummary(story: StoryWithViews) {
  return story.beacon_summary?.trim() || story.summary[0] || "";
}

function displayLeadBriefingSummaryPoints(story: StoryWithViews) {
  const override = story.beacon_summary?.trim();
  if (override) {
    const overridePoints = override
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    return overridePoints.length > 0 ? overridePoints.slice(0, 2) : [override];
  }

  return story.summary.map((line) => line.trim()).filter(Boolean).slice(0, 2);
}

function shouldShowStoryImageOnBriefing(story: StoryWithViews) {
  return Boolean(story.image_url) && (story.image_show_on_briefing ?? true);
}

function reorderStories(stories: StoryWithViews[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) return stories;
  if (fromIndex < 0 || toIndex < 0) return stories;
  if (fromIndex >= stories.length || toIndex >= stories.length) return stories;

  const next = [...stories];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function sortLibrary(stories: StoryWithViews[]) {
  return [...stories].sort((left, right) => {
    const leftDate = Date.parse(left.created_at ?? left.date);
    const rightDate = Date.parse(right.created_at ?? right.date);
    return rightDate - leftDate;
  });
}

function createSavedBriefing(stories: StoryWithViews[]): SavedBriefingItem[] {
  return stories.map((story) => ({
    id: story.id,
    beacon_headline: story.beacon_headline?.trim() || null,
    beacon_summary: story.beacon_summary?.trim() || null,
    beacon_position: story.beacon_position ?? null,
    beacon_order: story.beacon_order ?? null,
  }));
}

function estimateStoryCardHeight(story: StoryWithViews, variant: "lead" | "card") {
  const headlineLength = displayHeadline(story).length;
  const summaryLength =
    variant === "lead"
      ? displayLeadBriefingSummaryPoints(story).join(" ").length
      : displayBriefingSummary(story).length;
  const imageWeight = shouldShowStoryImageOnBriefing(story) ? (variant === "lead" ? 340 : 220) : 0;
  const base = variant === "lead" ? 260 : 170;
  return base + imageWeight + headlineLength * (variant === "lead" ? 1.2 : 0.6) + summaryLength * (variant === "lead" ? 0.45 : 0.28);
}

function sameDropTarget(left: DropTarget | null, right: DropTarget | null) {
  if (!left || !right) return false;
  if (left.kind !== right.kind) return false;
  if (left.kind === "lead" && right.kind === "lead") return true;
  return left.kind === "column" &&
    right.kind === "column" &&
    left.column === right.column &&
    left.index === right.index;
}

function StoryMetaRow({ story }: { story: StoryWithViews }) {
  return (
    <div className="mt-3 text-[11px] uppercase tracking-[0.16em] text-neutral-500">
      {formatStoryDate(story.date)}
    </div>
  );
}

function PublicLeadCard({
  story,
  registerNode,
}: {
  story: StoryWithViews;
  registerNode?: (node: HTMLDivElement | null) => void;
}) {
  const summaryPoints = displayLeadBriefingSummaryPoints(story);
  const usesAlertStyle = story.beacon_lead_style === "alert";

  return (
    <article
      ref={registerNode}
      data-story-id={story.id}
      className={`relative block overflow-hidden rounded-[14px] border bg-[#07131e] p-8 shadow-[0_20px_46px_rgba(0,0,0,0.22)] ${
        usesAlertStyle ? "border-red-500/55" : "border-[#183149]/70"
      }`}
    >
      <div className="relative text-center">
        <div
          className={`font-semibold leading-[0.95] md:text-6xl ${
            usesAlertStyle ? "text-4xl text-red-400" : "text-[2.9rem] text-neutral-100"
          }`}
        >
          {displayHeadline(story)}
        </div>
        <StoryMetaRow story={story} />

        {summaryPoints.length > 0 ? (
          <div className="mx-auto mt-5 max-w-4xl space-y-3 text-lg leading-8 text-neutral-300">
            {summaryPoints.map((point, index) => (
              <p key={`${story.id}-lead-point-${index}`}>{point}</p>
            ))}
          </div>
        ) : null}
      </div>
      {shouldShowStoryImageOnBriefing(story) ? <AdaptiveBriefingImage priority story={story} variant="briefing-lead" /> : null}
    </article>
  );
}

function PublicCard({
  story,
  registerNode,
  draggable,
  onDragStart,
  onDragEnd,
}: {
  story: StoryWithViews;
  registerNode?: (node: HTMLDivElement | null) => void;
  draggable?: boolean;
  onDragStart?: React.DragEventHandler<HTMLDivElement>;
  onDragEnd?: React.DragEventHandler<HTMLDivElement>;
}) {
  return (
    <div
      ref={registerNode}
      data-story-id={story.id}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={draggable ? "cursor-grab active:cursor-grabbing" : undefined}
    >
      <article className="relative flex flex-col justify-start rounded-[12px] border border-[#183149]/65 bg-[#07131e] p-6 text-left shadow-[0_16px_34px_rgba(0,0,0,0.2)]">
        <div className="flex flex-col justify-start">
          <div className="text-[1.85rem] font-semibold leading-tight text-neutral-100">
            {displayHeadline(story)}
          </div>
          <StoryMetaRow story={story} />
          {displayBriefingSummary(story) ? <p className="mt-3 text-[15px] leading-7 text-neutral-300">{displayBriefingSummary(story)}</p> : null}
          {shouldShowStoryImageOnBriefing(story) ? <AdaptiveBriefingImage story={story} variant="briefing-card" /> : null}
        </div>
      </article>
    </div>
  );
}

function DropSlot({
  active,
  visible,
  label,
  onDragEnter,
  onDragOver,
  onDrop,
}: {
  active: boolean;
  visible: boolean;
  label: string;
  onDragEnter: () => void;
  onDragOver: React.DragEventHandler<HTMLDivElement>;
  onDrop: React.DragEventHandler<HTMLDivElement>;
}) {
  if (!visible) return null;

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`rounded-xl border border-dashed px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.18em] transition ${
        active ? "border-[#d7c08d] bg-[#163754]/40 text-[#e7d39f]" : "border-[#163754]/70 bg-transparent text-neutral-500"
      }`}
    >
      {label}
    </div>
  );
}

export default function AdminBriefingPage() {
  const [briefingStories, setBriefingStories] = useState<StoryWithViews[]>([]);
  const [libraryStories, setLibraryStories] = useState<StoryWithViews[]>([]);
  const [savedBriefing, setSavedBriefing] = useState<SavedBriefingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [hasImageOnly, setHasImageOnly] = useState(false);
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [topicFilter, setTopicFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dragSource, setDragSource] = useState<DragSource | null>(null);
  const [dragTarget, setDragTarget] = useState<DropTarget | null>(null);
  const [storyHeights, setStoryHeights] = useState<Record<string, number>>({});
  const canvasNodesRef = useRef<Record<string, HTMLDivElement | null>>({});

  const registerCanvasNode = useCallback(
    (storyId: string) => (node: HTMLDivElement | null) => {
      if (node) canvasNodesRef.current[storyId] = node;
      else delete canvasNodesRef.current[storyId];
    },
    []
  );

  const loadStories = useCallback(async () => {
    setLoading(true);
    setError("");
    setStatus("");

    try {
      const res = await fetch("/api/admin/briefing", {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as AdminBriefingResponse;

      if (!res.ok) {
        throw new Error(json.error ?? res.statusText);
      }

      const nextBriefing = json.briefing ?? [];
      const nextLibrary = json.library ?? [];
      setBriefingStories(nextBriefing);
      setLibraryStories(nextLibrary);
      setSavedBriefing(createSavedBriefing(nextBriefing));
    } catch (loadError: unknown) {
      const message = loadError instanceof Error ? loadError.message : String(loadError);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStories();
  }, [loadStories]);

  const hasUnsavedChanges = useMemo(() => {
    if (briefingStories.length !== savedBriefing.length) return true;

    return briefingStories.some((story, index) => {
      const saved = savedBriefing[index];
      if (!saved) return true;

      return (
        saved.id !== story.id ||
        saved.beacon_headline !== (story.beacon_headline?.trim() || null) ||
        saved.beacon_summary !== (story.beacon_summary?.trim() || null) ||
        saved.beacon_position !== (story.beacon_position ?? null) ||
        saved.beacon_order !== (story.beacon_order ?? null)
      );
    });
  }, [briefingStories, savedBriefing]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;

    const nodes = Object.entries(canvasNodesRef.current).filter(([, node]) => Boolean(node)) as Array<[string, HTMLDivElement]>;
    if (nodes.length === 0) return;

    setStoryHeights((prev) => {
      const next = { ...prev };
      let changed = false;

      for (const [id, node] of nodes) {
        const height = Math.ceil(node.getBoundingClientRect().height);
        if (next[id] !== height) {
          next[id] = height;
          changed = true;
        }
      }

      return changed ? next : prev;
    });

    const observer = new ResizeObserver((entries) => {
      setStoryHeights((prev) => {
        const next = { ...prev };
        let changed = false;

        for (const entry of entries) {
          const id = (entry.target as HTMLDivElement).dataset.storyId;
          if (!id) continue;
          const height = Math.ceil(entry.contentRect.height);
          if (next[id] !== height) {
            next[id] = height;
            changed = true;
          }
        }

        return changed ? next : prev;
      });
    });

    nodes.forEach(([, node]) => observer.observe(node));
    return () => observer.disconnect();
  }, [briefingStories]);

  const availableTopics = useMemo(
    () =>
      Array.from(
        new Set(
          libraryStories
            .flatMap((story) => story.topics)
            .map((topic) => topic.trim())
            .filter(Boolean)
        )
      ).sort((left, right) => left.localeCompare(right)),
    [libraryStories]
  );

  const filteredLibrary = useMemo(() => {
    const query = search.trim().toLowerCase();
    const normalizedTopicFilter = topicFilter.trim().toLowerCase();

    return libraryStories.filter((story) => {
      const headline = displayHeadline(story).toLowerCase();
      const storyId = story.id.toLowerCase();
      const summary = story.summary.join(" ").toLowerCase();
      const matchesSearch = !query || headline.includes(query) || storyId.includes(query) || summary.includes(query);
      const matchesImage = !hasImageOnly || Boolean(story.image_url);
      const matchesUrgent = !urgentOnly || story.urgent;
      const matchesTopic =
        normalizedTopicFilter === "all" || story.topics.some((topic) => topic.toLowerCase() === normalizedTopicFilter);
      const matchesFrom = !dateFrom || story.date >= dateFrom;
      const matchesTo = !dateTo || story.date <= dateTo;

      return matchesSearch && matchesImage && matchesUrgent && matchesTopic && matchesFrom && matchesTo;
    });
  }, [dateFrom, dateTo, hasImageOnly, libraryStories, search, topicFilter, urgentOnly]);

  const libraryFiltersActive = Boolean(search || hasImageOnly || urgentOnly || topicFilter !== "all" || dateFrom || dateTo);
  const briefingLayout = useMemo(() => buildBriefingLayout(briefingStories), [briefingStories]);
  const leadSummaryPoints = useMemo(
    () => (briefingLayout.lead ? displayLeadBriefingSummaryPoints(briefingLayout.lead) : []),
    [briefingLayout.lead]
  );

  function confirmDiscardChanges(message = "You have unsaved briefing changes. Leave without saving?") {
    return !hasUnsavedChanges || window.confirm(message);
  }

  function guardNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (confirmDiscardChanges()) return;
    event.preventDefault();
  }

  function clearDragState() {
    setDragSource(null);
    setDragTarget(null);
  }

  function updateBriefingLayout(mutator: (layout: BriefingLayout) => BriefingLayout) {
    setBriefingStories((current) => {
      const layout = buildBriefingLayout(current);
      return serializeBriefingLayout(
        mutator({
          lead: layout.lead,
          leftColumn: [...layout.leftColumn],
          rightColumn: [...layout.rightColumn],
        })
      );
    });
    setStatus("");
  }

  function getStoryHeight(story: StoryWithViews, variant: "lead" | "card") {
    return storyHeights[story.id] ?? estimateStoryCardHeight(story, variant);
  }

  function autoBalanceColumns() {
    updateBriefingLayout((layout) => {
      const orderedStories = [...layout.leftColumn, ...layout.rightColumn];
      const nextLeft: StoryWithViews[] = [];
      const nextRight: StoryWithViews[] = [];
      let leftHeight = 0;
      let rightHeight = 0;

      orderedStories.forEach((story) => {
        const height = getStoryHeight(story, "card");
        if (leftHeight <= rightHeight) {
          nextLeft.push(story);
          leftHeight += height;
        } else {
          nextRight.push(story);
          rightHeight += height;
        }
      });

      layout.leftColumn = nextLeft;
      layout.rightColumn = nextRight;
      return layout;
    });
    setStatus("Columns rebalanced using the public-layout canvas heights.");
  }

  function moveStoryToColumnEdge(column: BriefingColumn, rowIndex: number, edge: "top" | "bottom") {
    updateBriefingLayout((layout) => {
      const stories = column === "left" ? layout.leftColumn : layout.rightColumn;
      if (rowIndex < 0 || rowIndex >= stories.length) return layout;

      const [story] = stories.splice(rowIndex, 1);
      if (!story) return layout;

      if (edge === "top") stories.unshift(story);
      else stories.push(story);
      return layout;
    });
  }

  function moveStoryWithinColumn(column: BriefingColumn, fromIndex: number, toIndex: number) {
    updateBriefingLayout((layout) => {
      if (column === "left") {
        layout.leftColumn = reorderStories(layout.leftColumn, fromIndex, toIndex);
      } else {
        layout.rightColumn = reorderStories(layout.rightColumn, fromIndex, toIndex);
      }
      return layout;
    });
  }

  function moveStoryAcrossColumns(sourceColumn: BriefingColumn, rowIndex: number) {
    updateBriefingLayout((layout) => {
      if (sourceColumn === "left") {
        const [story] = layout.leftColumn.splice(rowIndex, 1);
        if (story) {
          const targetIndex = Math.min(rowIndex, layout.rightColumn.length);
          layout.rightColumn.splice(targetIndex, 0, story);
        }
      } else {
        const [story] = layout.rightColumn.splice(rowIndex, 1);
        if (story) {
          const targetIndex = Math.min(rowIndex, layout.leftColumn.length);
          layout.leftColumn.splice(targetIndex, 0, story);
        }
      }
      return layout;
    });
  }

  function promoteStoryToLead(sourceColumn: BriefingColumn, rowIndex: number) {
    updateBriefingLayout((layout) => {
      if (sourceColumn === "left") {
        const [story] = layout.leftColumn.splice(rowIndex, 1);
        if (story) {
          if (layout.lead) layout.leftColumn.unshift(layout.lead);
          layout.lead = story;
        }
      } else {
        const [story] = layout.rightColumn.splice(rowIndex, 1);
        if (story) {
          if (layout.lead) layout.rightColumn.unshift(layout.lead);
          layout.lead = story;
        }
      }
      return layout;
    });
  }

  function demoteLead(targetColumn: BriefingColumn) {
    updateBriefingLayout((layout) => {
      if (!layout.lead) return layout;

      const targetStories = targetColumn === "left" ? layout.leftColumn : layout.rightColumn;
      const fallbackStories = targetColumn === "left" ? layout.rightColumn : layout.leftColumn;
      const nextLead = targetStories.shift() ?? fallbackStories.shift() ?? null;
      if (!nextLead) return layout;

      targetStories.unshift(layout.lead);
      layout.lead = nextLead;
      return layout;
    });
  }

  function moveDraggedStory(target: DropTarget) {
    if (!dragSource) return;

    updateBriefingLayout((layout) => {
      const sourceList = dragSource.column === "left" ? layout.leftColumn : layout.rightColumn;
      const [story] = sourceList.splice(dragSource.index, 1);
      if (!story) return layout;

      if (target.kind === "lead") {
        if (layout.lead) {
          sourceList.splice(dragSource.index, 0, layout.lead);
        }
        layout.lead = story;
        return layout;
      }

      const targetList = target.column === "left" ? layout.leftColumn : layout.rightColumn;
      let insertIndex = Math.max(0, Math.min(target.index, targetList.length));
      if (dragSource.column === target.column && dragSource.index < insertIndex) {
        insertIndex -= 1;
      }
      targetList.splice(insertIndex, 0, story);
      return layout;
    });
    clearDragState();
  }

  function addStoryToBriefing(storyId: string, target: BriefingTarget) {
    const story = libraryStories.find((item) => item.id === storyId);
    if (!story) return;

    setLibraryStories((current) => current.filter((item) => item.id !== storyId));
    setBriefingStories((current) => {
      const layout = buildBriefingLayout(current);
      const nextStory = { ...story, beacon_include: true };

      if (target === "lead") {
        if (layout.lead) layout.leftColumn.unshift(layout.lead);
        layout.lead = nextStory;
      } else if (target === "left") {
        layout.leftColumn.push(nextStory);
      } else {
        layout.rightColumn.push(nextStory);
      }

      return serializeBriefingLayout(layout);
    });
    setStatus("");
  }

  function removeStoryFromBriefing(storyId: string) {
    const story = briefingStories.find((item) => item.id === storyId);
    if (!story) return;

    setBriefingStories((current) => current.filter((item) => item.id !== storyId));
    setLibraryStories((current) =>
      sortLibrary([
        ...current,
        { ...story, beacon_include: false, beacon_rank: null, beacon_position: null, beacon_order: null },
      ])
    );
    setStatus("");
  }

  async function discardChanges() {
    if (!confirmDiscardChanges("Discard your unsaved briefing changes and reload the last saved version?")) return;
    await loadStories();
    setStatus("Unsaved briefing changes discarded.");
  }

  async function refreshStories() {
    if (!confirmDiscardChanges("Refresh from the server and discard any unsaved briefing changes?")) return;
    await loadStories();
  }

  function clearLibraryFilters() {
    setSearch("");
    setHasImageOnly(false);
    setUrgentOnly(false);
    setTopicFilter("all");
    setDateFrom("");
    setDateTo("");
  }

  function updateBriefingHeadline(storyId: string, value: string) {
    setBriefingStories((current) =>
      current.map((story) =>
        story.id === storyId
          ? {
              ...story,
              beacon_headline: value,
            }
          : story
      )
    );
    setStatus("");
  }

  function updateBriefingSummary(storyId: string, value: string) {
    setBriefingStories((current) =>
      current.map((story) =>
        story.id === storyId
          ? {
              ...story,
              beacon_summary: value,
            }
          : story
      )
    );
    setStatus("");
  }

  async function saveOrder() {
    setSaving(true);
    setError("");
    setStatus("");

    try {
      const res = await fetch("/api/admin/briefing", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          briefing: briefingStories.map((story) => ({
            id: story.id,
            beacon_headline: story.beacon_headline?.trim() || null,
            beacon_summary: story.beacon_summary?.trim() || null,
            beacon_position: story.beacon_position ?? null,
            beacon_order: story.beacon_order ?? null,
          })),
        }),
      });

      const json = (await res.json().catch(() => ({}))) as AdminBriefingResponse;
      if (!res.ok) {
        throw new Error(json.error ?? res.statusText);
      }

      const nextBriefing = json.briefing ?? [];
      const nextLibrary = json.library ?? [];
      setBriefingStories(nextBriefing);
      setLibraryStories(nextLibrary);
      setSavedBriefing(createSavedBriefing(nextBriefing));
      setStatus("Briefing saved.");
    } catch (saveError: unknown) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-900 p-8 text-neutral-100">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.22em] text-neutral-500">Admin</div>
            <h1 className="mt-2 text-3xl font-bold">Briefing Manager</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
              Build The Briefing here: arrange the public-facing layout first, then edit overrides and save.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/admin" onClick={guardNavigation} className="text-xs text-neutral-400 hover:text-neutral-200">
              Control center
            </Link>
            <Link
              href="/admin/editor"
              onClick={guardNavigation}
              className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
            >
              Story editor
            </Link>
            <Link
              href="/admin/moderation"
              onClick={guardNavigation}
              className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
            >
              Moderation
            </Link>
            <Link
              href="/briefing"
              onClick={guardNavigation}
              className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
            >
              View briefing
            </Link>
          </div>
        </div>

        <div className={`mt-8 ${ADMIN_PANEL} p-6`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-neutral-400">
              {loading
                ? "Loading stories..."
                : `${briefingStories.length} stor${briefingStories.length === 1 ? "y" : "ies"} in the briefing, ${libraryStories.length} available to add`}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {hasUnsavedChanges ? <div className="text-sm text-amber-300">Unsaved changes</div> : null}
              {status && <div className="text-sm text-emerald-400">{status}</div>}
              {error && <div className="text-sm text-red-300">{error}</div>}
              <button
                onClick={() => void refreshStories()}
                disabled={loading || saving}
                className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Refresh
              </button>
              <button
                onClick={() => void discardChanges()}
                disabled={loading || saving || !hasUnsavedChanges}
                className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Discard changes
              </button>
              <button
                onClick={saveOrder}
                disabled={loading || saving || !hasUnsavedChanges}
                className="rounded-full bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving..." : hasUnsavedChanges ? "Save briefing" : "Saved"}
              </button>
            </div>
          </div>

          <section className="mt-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-neutral-100">Public Layout Canvas</h2>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  This canvas uses the public briefing card layout and spacing. Drag column cards here and auto-balance will use these measured heights, not the control cards below.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={autoBalanceColumns}
                  disabled={saving || briefingStories.length < 3}
                  className="rounded-full border border-[#8f7740]/60 px-4 py-2 text-xs font-semibold text-[#e3cca0] transition hover:bg-[#8f7740]/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Auto-balance columns
                </button>
              </div>
            </div>

            {briefingStories.length === 0 && !loading ? (
              <div className="mt-4 rounded-2xl border border-dashed border-neutral-700 px-6 py-10 text-center text-sm text-neutral-500">
                No stories in The Briefing yet. Add one from the library below.
              </div>
            ) : (
              <div className="-mx-6 mt-6 px-6">
                {briefingLayout.lead ? (
                  <div
                    onDragEnter={() => setDragTarget({ kind: "lead" })}
                    onDragOver={(event) => {
                      if (!dragSource) return;
                      event.preventDefault();
                      setDragTarget({ kind: "lead" });
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      moveDraggedStory({ kind: "lead" });
                    }}
                    className={sameDropTarget(dragTarget, { kind: "lead" }) ? "rounded-[18px] p-2 ring-2 ring-[#d7c08d]/60" : undefined}
                  >
                    <PublicLeadCard story={briefingLayout.lead} registerNode={registerCanvasNode(briefingLayout.lead.id)} />
                  </div>
                ) : null}

                <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-10">
                  {([
                    { key: "left" as BriefingColumn, label: "Left Column" },
                    { key: "right" as BriefingColumn, label: "Right Column" },
                  ]).map((column) => {
                    const stories = column.key === "left" ? briefingLayout.leftColumn : briefingLayout.rightColumn;
                    return (
                      <div key={column.key} className="space-y-4">
                        <DropSlot
                          active={sameDropTarget(dragTarget, { kind: "column", column: column.key, index: 0 })}
                          visible={Boolean(dragSource)}
                          label={`Drop at top of ${column.label.toLowerCase()}`}
                          onDragEnter={() => setDragTarget({ kind: "column", column: column.key, index: 0 })}
                          onDragOver={(event) => {
                            if (!dragSource) return;
                            event.preventDefault();
                            setDragTarget({ kind: "column", column: column.key, index: 0 });
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            moveDraggedStory({ kind: "column", column: column.key, index: 0 });
                          }}
                        />

                        {stories.map((story, rowIndex) => (
                          <div key={story.id} className="space-y-4">
                            <PublicCard
                              story={story}
                              registerNode={registerCanvasNode(story.id)}
                              draggable
                              onDragStart={(event) => {
                                setDragSource({ storyId: story.id, column: column.key, index: rowIndex });
                                setDragTarget(null);
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", story.id);
                              }}
                              onDragEnd={() => clearDragState()}
                            />
                            <DropSlot
                              active={sameDropTarget(dragTarget, { kind: "column", column: column.key, index: rowIndex + 1 })}
                              visible={Boolean(dragSource)}
                              label={`Drop below ${displayHeadline(story)}`}
                              onDragEnter={() => setDragTarget({ kind: "column", column: column.key, index: rowIndex + 1 })}
                              onDragOver={(event) => {
                                if (!dragSource) return;
                                event.preventDefault();
                                setDragTarget({ kind: "column", column: column.key, index: rowIndex + 1 });
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                moveDraggedStory({ kind: "column", column: column.key, index: rowIndex + 1 });
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="mt-10 border-t border-neutral-800 pt-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-neutral-100">Story Controls</h2>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  Edit briefing overrides and use the fallback button controls when you need precision beyond drag and drop.
                </p>
              </div>
            </div>

            {briefingStories.length === 0 && !loading ? (
              <div className="mt-4 rounded-2xl border border-dashed border-neutral-700 px-6 py-10 text-center text-sm text-neutral-500">
                No stories in The Briefing yet. Add one from the library below.
              </div>
            ) : (
              <div className="mt-6 space-y-8">
                {briefingLayout.lead ? (
                  <article className={`${ADMIN_PANEL} border-red-500/70 p-8`}>
                    <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
                      <span className="rounded-full border border-red-500/30 px-2.5 py-1 text-red-300">Lead Story</span>
                      <span>{formatStoryDate(briefingLayout.lead.date)}</span>
                      <span className="font-semibold text-neutral-600">{briefingLayout.lead.id}</span>
                    </div>

                    {briefingLayout.lead.image_url ? <AdaptiveBriefingImage story={briefingLayout.lead} variant="briefing-lead" /> : null}

                    <div className="text-4xl font-semibold leading-[0.95] text-red-400 md:text-6xl">
                      {displayHeadline(briefingLayout.lead)}
                    </div>
                    {briefingLayout.lead.beacon_headline?.trim() &&
                    briefingLayout.lead.beacon_headline.trim() !== briefingLayout.lead.title ? (
                      <div className="mt-2 text-sm text-neutral-500">Story title: {briefingLayout.lead.title}</div>
                    ) : null}
                    {leadSummaryPoints.length > 0 ? (
                      <div className="mt-5 max-w-4xl space-y-3 text-lg leading-8 text-neutral-300">
                        {leadSummaryPoints.map((point, index) => (
                          <p key={`${briefingLayout.lead!.id}-summary-${index}`}>{point}</p>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-6 border-t border-red-500/15 pt-5">
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                        Briefing Title Override
                      </label>
                      <p className="mb-2 text-xs leading-5 text-neutral-500">
                        Lead cards use the story title by default. Override only if the briefing needs a tighter or sharper line.
                      </p>
                      <input
                        value={briefingLayout.lead.beacon_headline ?? ""}
                        onChange={(event) => updateBriefingHeadline(briefingLayout.lead!.id, event.target.value)}
                        placeholder="Leave blank to use the story title"
                        className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500"
                      />
                      <label className="mb-2 mt-4 block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                        Briefing Summary Override
                      </label>
                      <p className="mb-2 text-xs leading-5 text-neutral-500">
                        Lead cards render up to two summary lines. Leave this blank to use the first two story summary bullets.
                      </p>
                      <textarea
                        value={briefingLayout.lead.beacon_summary ?? ""}
                        onChange={(event) => updateBriefingSummary(briefingLayout.lead!.id, event.target.value)}
                        placeholder="Use up to two lines. Leave blank to use the first two story summary bullets."
                        rows={3}
                        className="w-full resize-y rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm leading-6 text-neutral-100 placeholder:text-neutral-500"
                      />
                      <div className="mt-5 flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => removeStoryFromBriefing(briefingLayout.lead!.id)}
                          disabled={saving}
                          className="rounded-full border border-red-400/50 px-3 py-2 text-xs text-red-200 transition hover:bg-red-950/30 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Remove
                        </button>
                        <button
                          onClick={() => demoteLead("left")}
                          disabled={saving || (briefingLayout.leftColumn.length === 0 && briefingLayout.rightColumn.length === 0)}
                          className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Send to left
                        </button>
                        <button
                          onClick={() => demoteLead("right")}
                          disabled={saving || (briefingLayout.leftColumn.length === 0 && briefingLayout.rightColumn.length === 0)}
                          className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Send to right
                        </button>
                        <Link
                          href={`/admin/editor?story=${briefingLayout.lead.id}`}
                          onClick={guardNavigation}
                          className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
                        >
                          Edit story
                        </Link>
                        <Link
                          href={`/story/${briefingLayout.lead.id}?from=briefing`}
                          onClick={guardNavigation}
                          className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
                        >
                          Preview
                        </Link>
                      </div>
                    </div>
                  </article>
                ) : null}

                <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-10">
                  {([
                    { key: "left" as BriefingColumn, label: "Left Column" },
                    { key: "right" as BriefingColumn, label: "Right Column" },
                  ]).map((column) => {
                    const stories = column.key === "left" ? briefingLayout.leftColumn : briefingLayout.rightColumn;

                    return (
                      <div key={column.key} className="space-y-6">
                        <div className={`${ADMIN_INSET} px-4 py-3`}>
                          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                            {column.label}
                          </div>
                        </div>

                        {stories.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-neutral-700 px-6 py-10 text-center text-sm text-neutral-500">
                            No stories in this column yet.
                          </div>
                        ) : (
                          stories.map((story, rowIndex) => {
                            const targetColumnLabel = column.key === "left" ? "Move right" : "Move left";

                            return (
                              <article key={story.id} className={`${ADMIN_PANEL} p-6`}>
                                <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                                  <span className="rounded-full border border-[#163754]/60 px-2.5 py-1 text-neutral-300">
                                    {column.label}
                                  </span>
                                  <span>{formatStoryDate(story.date)}</span>
                                  <span className="font-semibold text-neutral-600">{story.id}</span>
                                </div>

                                {story.image_url ? <AdaptiveBriefingImage story={story} variant="briefing-card" /> : null}

                                <div className="text-2xl font-semibold leading-tight text-neutral-100">{displayHeadline(story)}</div>
                                {story.beacon_headline?.trim() && story.beacon_headline.trim() !== story.title ? (
                                  <div className="mt-2 text-sm text-neutral-500">Story title: {story.title}</div>
                                ) : null}
                                {displayBriefingSummary(story) ? (
                                  <p className="mt-3 text-sm leading-6 text-neutral-400">{displayBriefingSummary(story)}</p>
                                ) : null}

                                <div className="mt-5 border-t border-[#163754]/40 pt-4">
                                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                                    Briefing Title Override
                                  </label>
                                  <p className="mb-2 text-xs leading-5 text-neutral-500">
                                    Column cards default to the story title. Use an override only if the briefing headline needs a different framing.
                                  </p>
                                  <input
                                    value={story.beacon_headline ?? ""}
                                    onChange={(event) => updateBriefingHeadline(story.id, event.target.value)}
                                    placeholder="Leave blank to use the story title"
                                    className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500"
                                  />
                                  <label className="mb-2 mt-4 block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                                    Briefing Summary Override
                                  </label>
                                  <p className="mb-2 text-xs leading-5 text-neutral-500">
                                    Column cards show a single summary line. Leave this blank to use the story&apos;s first summary bullet.
                                  </p>
                                  <textarea
                                    value={story.beacon_summary ?? ""}
                                    onChange={(event) => updateBriefingSummary(story.id, event.target.value)}
                                    placeholder="Leave blank to use the first story summary bullet"
                                    rows={3}
                                    className="w-full resize-y rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm leading-6 text-neutral-100 placeholder:text-neutral-500"
                                  />
                                  <div className="mt-5 flex flex-wrap items-center gap-2">
                                    <button
                                      onClick={() => promoteStoryToLead(column.key, rowIndex)}
                                      disabled={saving}
                                      className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      Make lead
                                    </button>
                                    <button
                                      onClick={() => moveStoryToColumnEdge(column.key, rowIndex, "top")}
                                      disabled={rowIndex === 0 || saving}
                                      className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      Top
                                    </button>
                                    <button
                                      onClick={() => moveStoryWithinColumn(column.key, rowIndex, rowIndex - 1)}
                                      disabled={rowIndex === 0 || saving}
                                      className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      Up
                                    </button>
                                    <button
                                      onClick={() => moveStoryWithinColumn(column.key, rowIndex, rowIndex + 1)}
                                      disabled={rowIndex === stories.length - 1 || saving}
                                      className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      Down
                                    </button>
                                    <button
                                      onClick={() => moveStoryToColumnEdge(column.key, rowIndex, "bottom")}
                                      disabled={rowIndex === stories.length - 1 || saving}
                                      className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      Bottom
                                    </button>
                                    <button
                                      onClick={() => moveStoryAcrossColumns(column.key, rowIndex)}
                                      disabled={saving}
                                      className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {targetColumnLabel}
                                    </button>
                                    <button
                                      onClick={() => removeStoryFromBriefing(story.id)}
                                      disabled={saving}
                                      className="rounded-full border border-red-400/50 px-3 py-2 text-xs text-red-200 transition hover:bg-red-950/30 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      Remove
                                    </button>
                                    <Link
                                      href={`/admin/editor?story=${story.id}`}
                                      onClick={guardNavigation}
                                      className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
                                    >
                                      Edit story
                                    </Link>
                                    <Link
                                      href={`/story/${story.id}?from=briefing`}
                                      onClick={guardNavigation}
                                      className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
                                    >
                                      Preview
                                    </Link>
                                  </div>
                                </div>
                              </article>
                            );
                          })
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="mt-10 border-t border-neutral-800 pt-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-neutral-100">Story Library</h2>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  Add any published story to the briefing without opening Supabase. Draft, archived, and hidden stories are excluded here.
                </p>
              </div>
              <div className="w-full md:max-w-sm">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search stories by headline, id, or summary"
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500"
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
              <label className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-300">
                <input type="checkbox" checked={hasImageOnly} onChange={(event) => setHasImageOnly(event.target.checked)} className="h-4 w-4" />
                Has image
              </label>
              <label className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-300">
                <input type="checkbox" checked={urgentOnly} onChange={(event) => setUrgentOnly(event.target.checked)} className="h-4 w-4" />
                Urgent only
              </label>
              <select
                value={topicFilter}
                onChange={(event) => setTopicFilter(event.target.value)}
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-100"
              >
                <option value="all">All topics</option>
                {availableTopics.map((topic) => (
                  <option key={topic} value={topic}>
                    {topic}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-100"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-100"
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-neutral-500">
                Showing {filteredLibrary.length} of {libraryStories.length} published stories
              </div>
              <button
                onClick={clearLibraryFilters}
                disabled={!libraryFiltersActive}
                className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear filters
              </button>
            </div>

            {filteredLibrary.length === 0 && !loading ? (
              <div className="mt-4 rounded-2xl border border-dashed border-neutral-700 px-6 py-10 text-center text-sm text-neutral-500">
                {libraryStories.length === 0 ? "Every published story is already in the briefing." : "No stories match those filters."}
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
                {filteredLibrary.map((story) => (
                  <article key={story.id} className={`${ADMIN_INSET} p-5`}>
                    <div className="mb-3 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-neutral-500">
                      <span>{formatStoryDate(story.date)}</span>
                      <span className="font-semibold text-neutral-600">{story.id}</span>
                      {story.urgent ? <span className="rounded-full border border-red-500/30 px-2 py-1 text-red-300">Urgent</span> : null}
                      {story.image_url ? <span className="rounded-full border border-neutral-700 px-2 py-1 text-neutral-300">Image</span> : null}
                    </div>
                    <div className="text-xl font-semibold leading-tight text-neutral-100">{displayHeadline(story)}</div>
                    {displayBriefingSummary(story) ? <p className="mt-3 text-sm leading-6 text-neutral-400">{displayBriefingSummary(story)}</p> : null}
                    {story.topics.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {story.topics.slice(0, 4).map((topic) => (
                          <span key={`${story.id}-${topic}`} className="rounded-full border border-neutral-700 px-2.5 py-1 text-[11px] text-neutral-300">
                            {topic}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => addStoryToBriefing(story.id, "lead")}
                        disabled={saving}
                        className="rounded-full bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Add as lead
                      </button>
                      <button
                        onClick={() => addStoryToBriefing(story.id, "left")}
                        disabled={saving}
                        className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Add left
                      </button>
                      <button
                        onClick={() => addStoryToBriefing(story.id, "right")}
                        disabled={saving}
                        className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Add right
                      </button>
                      <Link
                        href={`/admin/editor?story=${story.id}`}
                        onClick={guardNavigation}
                        className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
                      >
                        Edit story
                      </Link>
                      <Link
                        href={`/story/${story.id}`}
                        onClick={guardNavigation}
                        className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
                      >
                        Preview
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
