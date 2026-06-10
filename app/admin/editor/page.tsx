"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import BackLink from "@/app/back-link";
import { formatUpdatedAt } from "@/app/lib/dates";
import { DEFAULT_IMAGE_FOCUS, clampImageFocus, imageObjectPosition } from "@/app/lib/image-focus";
import { STORY_IMAGE_ACCEPT } from "@/app/lib/story-images";
import { ADMIN_INSET, ADMIN_PANEL } from "@/app/lib/surfaces";
import type { BriefingLeadStyle, Lean, Story, StoryImageDisplay, StoryStatus, StoryWithViews } from "@/app/lib/types";
import { detectSourceLean, guessSourceLabel } from "@/app/lib/source-lean";
import { TOPICS, normalize, slugify } from "@/app/lib/vocab";
import SourceEditorSection, { type SourceEditorRow } from "./source-editor-section";

type Entity = { name: string; aliases: string[] };
type SourcePreview = { name: string; title: string; url: string };
type StoryKnowledgeFields = Pick<
  Story,
  "facets" | "industries" | "locations" | "offices" | "organizations" | "people" | "sports_teams"
>;
type StoryKnowledgeField = keyof StoryKnowledgeFields;
type AutofillSuggestions = {
  knowledge: StoryKnowledgeFields;
  primaryEntities: string[];
  selectedEntities: string[];
  topics: string[];
};
type EditorNotice = { tone: "error" | "info" | "success"; text: string } | null;
type PendingEditorAction = { action: () => void; description: string } | null;
type DiscoverySourceImport = {
  sources?: SourcePreview[];
  storyTitle?: string;
};
type StoryRevision = {
  action: "deleted" | "restored" | "saved";
  createdAt: string;
  id: string;
  story: StoryWithViews;
  storyId: string;
};

const DISCOVERY_SOURCE_IMPORT_KEY = "beacon:admin-discovery-sources";
const STORY_STATUS_OPTIONS: Array<{ value: StoryStatus; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
  { value: "hidden", label: "Hidden" },
];
const AUTOFILL_KNOWLEDGE_LABELS: Record<StoryKnowledgeField, string> = {
  facets: "Facets",
  industries: "Industries",
  locations: "Locations",
  offices: "Offices",
  organizations: "Organizations",
  people: "People",
  sports_teams: "Sports Teams",
};

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function createSourceRow(): SourceEditorRow {
  return { badge: "", name: "", title: "", url: "", lean: "Center", leanMode: "auto" };
}

function getAutoLean(name: string, url: string): Lean {
  return detectSourceLean(name, url) ?? "Center";
}

function toEditorSource(source: Story["sources"][number]): SourceEditorRow {
  const detectedLean = getAutoLean(source.name, source.url);
  return {
    ...source,
    badge: source.badge ?? "",
    title: source.title ?? "",
    leanMode: detectedLean === source.lean ? "auto" : "manual",
  };
}

function blankSummary() {
  return ["", "", ""];
}

function blankSources() {
  return [createSourceRow(), createSourceRow(), createSourceRow()];
}

function normalizeStoryIdInput(value: string) {
  return slugify(value).slice(0, 80);
}

function normalizeHttpUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeStructuredList(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatStructuredList(values: string[]) {
  return values.join("\n");
}

function saveButtonLabel(status: StoryStatus) {
  if (status === "published") return "Save and publish";
  if (status === "archived") return "Save as archived";
  if (status === "hidden") return "Save as hidden";
  return "Save draft";
}

function mergeUniqueValues(...groups: string[][]) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of groups.flat()) {
    const trimmed = value.trim();
    const key = normalize(trimmed);
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    output.push(trimmed);
  }

  return output;
}

function differenceByNormalized(values: string[], existing: string[]) {
  const existingKeys = new Set(existing.map(normalize));
  return mergeUniqueValues(values).filter((value) => !existingKeys.has(normalize(value)));
}

function removeByNormalized(values: string[], valueToRemove: string) {
  const keyToRemove = normalize(valueToRemove);
  return values.filter((value) => normalize(value) !== keyToRemove);
}

function countAutofillSuggestions(suggestions: AutofillSuggestions | null) {
  if (!suggestions) return 0;
  return (
    suggestions.topics.length +
    suggestions.selectedEntities.length +
    suggestions.primaryEntities.length +
    Object.values(suggestions.knowledge).reduce((total, values) => total + values.length, 0)
  );
}

function normalizeKnowledgeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .toLowerCase();
}

function inferTopicsFromDraft(input: {
  currentTopics: string[];
  inferredKnowledge: StoryKnowledgeFields;
  sourceNames: string[];
  sourceTitles: string[];
  summary: string[];
  title: string;
}) {
  const haystack = normalizeKnowledgeText([input.title, ...input.summary, ...input.sourceNames, ...input.sourceTitles].join(" "));
  const next = [...input.currentTopics];
  const addTopic = (topic: (typeof TOPICS)[number]) => {
    if (!next.map(normalize).includes(normalize(topic))) next.push(topic);
  };

  if (
    input.inferredKnowledge.sports_teams.length > 0 ||
    /\b(nba|nfl|mlb|nhl|wnba|ncaa|playoff|championship|coach|quarterback|pitcher|dodgers|lakers|warriors|49ers)\b/.test(haystack)
  ) {
    addTopic("Sports");
  }
  if (/\b(election|senate|congress|white house|president|governor|mayor|campaign|democrat|republican|supreme court|scotus)\b/.test(haystack)) {
    addTopic("Politics");
  }
  if (/\b(stock market|stocks|federal reserve|inflation|jobs report|gdp|tariff|interest rates|treasury|economy)\b/.test(haystack)) {
    addTopic("Economy");
  }
  if (/\b(earnings|company|startup|merger|acquisition|ceo|ipo|shares|business)\b/.test(haystack)) {
    addTopic("Business");
  }
  if (input.inferredKnowledge.industries.some((industry) => normalize(industry).includes("artificial intelligence")) || /\b(ai|artificial intelligence|chip|semiconductor|software|app|technology)\b/.test(haystack)) {
    addTopic("Technology");
  }
  if (/\b(world|global|international|ukraine|russia|china|israel|iran|gaza|europe|asia|middle east)\b/.test(haystack)) {
    addTopic("World");
  }
  if (/\b(movie|music|album|tv|streaming|celebrity|hollywood|entertainment)\b/.test(haystack)) {
    addTopic("Entertainment");
  }
  if (/\btrump\b/.test(haystack)) {
    addTopic("Trump");
  }

  return next;
}

type EditorSectionProps = {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  id?: string;
  children: ReactNode;
};

function EditorSection({ title, description, defaultOpen = false, id, children }: EditorSectionProps) {
  void defaultOpen;

  return (
    <section id={id} className={`${ADMIN_PANEL} scroll-mt-24`}>
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.14em] text-neutral-200">{title}</div>
          {description ? <p className="mt-2 text-sm text-neutral-500">{description}</p> : null}
        </div>
      </div>
      <div className="border-t border-neutral-800 px-5 py-5">{children}</div>
    </section>
  );
}

export default function EditorPage() {
  const searchParams = useSearchParams();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [entitySearch, setEntitySearch] = useState("");
  const [aliasDraft, setAliasDraft] = useState<Record<string, string>>({});
  const [storySearch, setStorySearch] = useState("");
  const [stories, setStories] = useState<StoryWithViews[]>([]);
  const [searchedStories, setSearchedStories] = useState<StoryWithViews[]>([]);
  const [loadingStories, setLoadingStories] = useState(false);
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slugInput, setSlugInput] = useState("");
  const [date, setDate] = useState(() => todayInputValue());
  const [status, setStatus] = useState<StoryStatus>("draft");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [embeddedImageUrlDraft, setEmbeddedImageUrlDraft] = useState("");
  const [imageCredit, setImageCredit] = useState("");
  const [imageCreditUrl, setImageCreditUrl] = useState("");
  const [imageFocusX, setImageFocusX] = useState(DEFAULT_IMAGE_FOCUS);
  const [imageFocusY, setImageFocusY] = useState(DEFAULT_IMAGE_FOCUS);
  const [imageDisplay, setImageDisplay] = useState<StoryImageDisplay>("contain");
  const [imageShowOnHomepage, setImageShowOnHomepage] = useState(true);
  const [imageShowOnBriefing, setImageShowOnBriefing] = useState(true);
  const [imageShowOnStoryPage, setImageShowOnStoryPage] = useState(false);
  const [savedImagePath, setSavedImagePath] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [pinnedStory, setPinnedStory] = useState(false);
  const [beaconInclude, setBeaconInclude] = useState(false);
  const [beaconLeadStyle, setBeaconLeadStyle] = useState<BriefingLeadStyle>("default");
  const [beaconHeadline, setBeaconHeadline] = useState("");
  const [beaconSummary, setBeaconSummary] = useState("");
  const [summary, setSummary] = useState<string[]>(blankSummary());
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [primaryEntities, setPrimaryEntities] = useState<string[]>([]);
  const [, setLocations] = useState<string[]>([]);
  const [locationsDraft, setLocationsDraft] = useState("");
  const [, setOrganizations] = useState<string[]>([]);
  const [organizationsDraft, setOrganizationsDraft] = useState("");
  const [, setPeople] = useState<string[]>([]);
  const [peopleDraft, setPeopleDraft] = useState("");
  const [, setIndustries] = useState<string[]>([]);
  const [industriesDraft, setIndustriesDraft] = useState("");
  const [, setSportsTeams] = useState<string[]>([]);
  const [sportsTeamsDraft, setSportsTeamsDraft] = useState("");
  const [, setOffices] = useState<string[]>([]);
  const [officesDraft, setOfficesDraft] = useState("");
  const [, setFacets] = useState<string[]>([]);
  const [facetsDraft, setFacetsDraft] = useState("");
  const [, setRelatedInterestSignals] = useState<string[]>([]);
  const [relatedInterestSignalsDraft, setRelatedInterestSignalsDraft] = useState("");
  const [relatedStoryIds, setRelatedStoryIds] = useState<string[]>([]);
  const [relatedStorySearch, setRelatedStorySearch] = useState("");
  const [sources, setSources] = useState<SourceEditorRow[]>(blankSources());
  const [sourceUrlDraft, setSourceUrlDraft] = useState("");
  const [sourcePreviewLoading, setSourcePreviewLoading] = useState(false);
  const [sourceDragIndex, setSourceDragIndex] = useState<number | null>(null);
  const [sourceDropIndex, setSourceDropIndex] = useState<number | null>(null);
  const [discoveryImportChecked, setDiscoveryImportChecked] = useState(false);
  const [pendingKnowledgeAutofill, setPendingKnowledgeAutofill] = useState(false);
  const [autofillSuggestions, setAutofillSuggestions] = useState<AutofillSuggestions | null>(null);
  const [notice, setNotice] = useState<EditorNotice>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [pendingEditorAction, setPendingEditorAction] = useState<PendingEditorAction>(null);
  const [revisions, setRevisions] = useState<StoryRevision[]>([]);
  const [loadingRevisions, setLoadingRevisions] = useState(false);
  const [busyRevisionId, setBusyRevisionId] = useState<string | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [pendingBaselineSync, setPendingBaselineSync] = useState(true);
  const requestedStoryId = searchParams.get("story");

  const generatedId = title ? normalizeStoryIdInput(title) : "";
  const storyId = activeStoryId ?? normalizeStoryIdInput(slugInput || generatedId || "new-story");

  const loadStories = useCallback(async () => {
    try {
      const query = new URLSearchParams();
      query.set("statuses", "draft,published,archived,hidden");
      query.set("limit", "250");

      const res = await fetch(`/api/stories?${query.toString()}`, { cache: "no-store" });

      const data = (await res.json().catch(() => [])) as StoryWithViews[];
      if (Array.isArray(data)) setStories(data);
    } finally {
      // no-op
    }
  }, []);

  const searchStories = useCallback(async (search: string) => {
    const trimmedSearch = search.trim();
    if (!trimmedSearch) {
      setSearchedStories([]);
      return;
    }

    setLoadingStories(true);
    try {
      const query = new URLSearchParams();
      query.set("statuses", "draft,published,archived,hidden");
      query.set("limit", "120");
      query.set("search", trimmedSearch);

      const res = await fetch(`/api/stories?${query.toString()}`, { cache: "no-store" });

      const data = (await res.json().catch(() => [])) as StoryWithViews[];
      setSearchedStories(Array.isArray(data) ? data : []);
    } finally {
      setLoadingStories(false);
    }
  }, []);

  const showNotice = useCallback((text: string, tone: NonNullable<EditorNotice>["tone"] = "info") => {
    setNotice({ text, tone });
  }, []);

  const loadEntities = useCallback(async () => {
    const res = await fetch("/api/entities", {
      cache: "no-store",
    });
    const data = await res.json().catch(() => []);
    if (res.ok && Array.isArray(data)) {
      setEntities(data);
      return;
    }

    setEntities([]);
  }, []);

  function resetForm() {
    setActiveStoryId(null);
    setTitle("");
    setSlugInput("");
    setDate(todayInputValue());
    setStatus("draft");
    setImageUrl(null);
    setImagePath(null);
    setEmbeddedImageUrlDraft("");
    setImageCredit("");
    setImageCreditUrl("");
    setImageFocusX(DEFAULT_IMAGE_FOCUS);
    setImageFocusY(DEFAULT_IMAGE_FOCUS);
    setImageDisplay("contain");
    setImageShowOnHomepage(true);
    setImageShowOnBriefing(true);
    setImageShowOnStoryPage(false);
    setSavedImagePath(null);
    setUrgent(false);
    setPinnedStory(false);
    setBeaconInclude(false);
    setBeaconLeadStyle("default");
    setBeaconHeadline("");
    setBeaconSummary("");
    setSummary(blankSummary());
    setTopics([]);
    setSelectedEntities([]);
    setPrimaryEntities([]);
    setLocations([]);
    setLocationsDraft("");
    setOrganizations([]);
    setOrganizationsDraft("");
    setPeople([]);
    setPeopleDraft("");
    setIndustries([]);
    setIndustriesDraft("");
    setSportsTeams([]);
    setSportsTeamsDraft("");
    setOffices([]);
    setOfficesDraft("");
    setFacets([]);
    setFacetsDraft("");
    setRelatedInterestSignals([]);
    setRelatedInterestSignalsDraft("");
    setRelatedStoryIds([]);
    setRelatedStorySearch("");
    setSources(blankSources());
    setPendingDelete(false);
    setPendingEditorAction(null);
    setAutofillSuggestions(null);
    setPendingBaselineSync(true);
  }

  const loadStoryIntoForm = useCallback((story: StoryWithViews) => {
    setActiveStoryId(story.id);
    setTitle(story.title);
    setSlugInput(story.id);
    setDate(story.date);
    setStatus(story.status);
    setImageUrl(story.image_url ?? null);
    setImagePath(story.image_path ?? null);
    setEmbeddedImageUrlDraft(story.image_path ? "" : story.image_url ?? "");
    setImageCredit(story.image_credit ?? "");
    setImageCreditUrl(story.image_credit_url ?? "");
    setImageFocusX(clampImageFocus(story.image_focus_x));
    setImageFocusY(clampImageFocus(story.image_focus_y));
    setImageDisplay(story.image_display === "contain" ? "contain" : "cover");
    setImageShowOnHomepage(story.image_show_on_homepage ?? true);
    setImageShowOnBriefing(story.image_show_on_briefing ?? true);
    setImageShowOnStoryPage(story.image_show_on_story_page ?? false);
    setSavedImagePath(story.image_path ?? null);
    setUrgent(story.urgent);
    setPinnedStory(story.pinned);
    setBeaconInclude(story.beacon_include);
    setBeaconLeadStyle(story.beacon_lead_style === "alert" ? "alert" : "default");
    setBeaconHeadline(story.beacon_headline ?? "");
    setBeaconSummary(story.beacon_summary ?? "");
    setSummary([...story.summary, "", "", ""].slice(0, Math.max(3, story.summary.length)));
    setTopics(story.topics);
    setSelectedEntities(story.entities.map((entity) => entity.name));
    setPrimaryEntities(story.primary_entities);
    setLocations(story.locations);
    setLocationsDraft(formatStructuredList(story.locations));
    setOrganizations(story.organizations);
    setOrganizationsDraft(formatStructuredList(story.organizations));
    setPeople(story.people);
    setPeopleDraft(formatStructuredList(story.people));
    setIndustries(story.industries);
    setIndustriesDraft(formatStructuredList(story.industries));
    setSportsTeams(story.sports_teams);
    setSportsTeamsDraft(formatStructuredList(story.sports_teams));
    setOffices(story.offices);
    setOfficesDraft(formatStructuredList(story.offices));
    setFacets(story.facets);
    setFacetsDraft(formatStructuredList(story.facets));
    setRelatedInterestSignals(story.related_interest_signals);
    setRelatedInterestSignalsDraft(formatStructuredList(story.related_interest_signals));
    setRelatedStoryIds(story.related_story_ids);
    setRelatedStorySearch("");
    setSources(story.sources.length > 0 ? story.sources.map(toEditorSource) : blankSources());
    setPendingDelete(false);
    setPendingEditorAction(null);
    setAutofillSuggestions(null);
    setPendingBaselineSync(true);
  }, []);

  useEffect(() => {
    void loadStories();
  }, [loadStories]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void searchStories(storySearch);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [searchStories, storySearch]);

  useEffect(() => {
    void loadEntities();
  }, [loadEntities]);

  const loadRevisions = useCallback(async (nextStoryId: string) => {
    if (!nextStoryId || nextStoryId === "new-story") {
      setRevisions([]);
      return;
    }

    setLoadingRevisions(true);
    try {
      const response = await fetch(`/api/admin/story-revisions?storyId=${encodeURIComponent(nextStoryId)}`, {
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; revisions?: StoryRevision[] };
      if (!response.ok) {
        throw new Error(data.error ?? "We couldn't load revision history.");
      }

      setRevisions(Array.isArray(data.revisions) ? data.revisions : []);
    } catch (revisionError) {
      showNotice(revisionError instanceof Error ? revisionError.message : "We couldn't load revision history.", "error");
      setRevisions([]);
    } finally {
      setLoadingRevisions(false);
    }
  }, [showNotice]);

  useEffect(() => {
    if (!activeStoryId) {
      setRevisions([]);
      return;
    }

    void loadRevisions(activeStoryId);
  }, [activeStoryId, loadRevisions]);

  const filteredStories = storySearch.trim() ? searchedStories : stories;

  useEffect(() => {
    if (!requestedStoryId) return;

    const matchingStory = stories.find((story) => story.id === requestedStoryId);
    if (!matchingStory) return;
    if (activeStoryId === matchingStory.id) return;

    loadStoryIntoForm(matchingStory);
  }, [activeStoryId, loadStoryIntoForm, requestedStoryId, stories]);

  const selectedRelatedStories = useMemo(
    () =>
      relatedStoryIds
        .map((id) => stories.find((story) => story.id === id))
        .filter((story): story is StoryWithViews => Boolean(story)),
    [relatedStoryIds, stories]
  );

  const relatedStoryOptions = useMemo(() => {
    const query = relatedStorySearch.trim().toLowerCase();
    return stories
      .filter((story) => story.id !== storyId && !relatedStoryIds.includes(story.id))
      .filter((story) => {
        if (!query) return true;
        return story.title.toLowerCase().includes(query) || story.id.toLowerCase().includes(query);
      })
      .slice(0, 12);
  }, [relatedStoryIds, relatedStorySearch, stories, storyId]);

  const editorSnapshot = useMemo(
    () =>
      JSON.stringify({
        activeStoryId,
        beaconHeadline,
        beaconInclude,
        beaconSummary,
        date,
        imageDisplay,
        imageFocusX,
        imageFocusY,
        imageCredit,
        imageCreditUrl,
        imagePath,
        imageUrl,
        imageShowOnBriefing,
        imageShowOnHomepage,
        imageShowOnStoryPage,
        industriesDraft,
        pinnedStory,
        facetsDraft,
        locationsDraft,
        officesDraft,
        organizationsDraft,
        peopleDraft,
        primaryEntities,
        relatedInterestSignalsDraft,
        relatedStoryIds,
        selectedEntities,
        slugInput,
        sources,
        sportsTeamsDraft,
        status,
        summary,
        title,
        topics,
        urgent,
      }),
    [
      activeStoryId,
      beaconHeadline,
      beaconInclude,
      beaconSummary,
      date,
      imageDisplay,
      imageFocusX,
      imageFocusY,
      imageCredit,
      imageCreditUrl,
      imagePath,
      imageUrl,
      imageShowOnBriefing,
      imageShowOnHomepage,
      imageShowOnStoryPage,
      industriesDraft,
      pinnedStory,
      facetsDraft,
      locationsDraft,
      officesDraft,
      organizationsDraft,
      peopleDraft,
      primaryEntities,
      relatedInterestSignalsDraft,
      relatedStoryIds,
      selectedEntities,
      slugInput,
      sources,
      sportsTeamsDraft,
      status,
      summary,
      title,
      topics,
      urgent,
    ]
  );
  const isDirty = Boolean(savedSnapshot) && savedSnapshot !== editorSnapshot;
  const readinessChecklist = useMemo(() => {
    const filledSummary = summary.map((line) => line.trim()).filter(Boolean);
    const filledSources = sources.filter((source) => source.name.trim() && source.url.trim());
    const sourceTitleCount = sources.filter((source) => source.title.trim()).length;

    return [
      { label: "Title", done: Boolean(title.trim()) },
      { label: "3+ summary points", done: filledSummary.length >= 3 },
      { label: "2+ sources", done: filledSources.length >= 2, detail: `${filledSources.length} sources` },
      { label: "Source titles", done: sourceTitleCount >= Math.min(2, filledSources.length) },
      { label: "Topic", done: topics.length > 0 },
      { label: "Entity", done: selectedEntities.length > 0 },
      { label: "Image decision", done: Boolean(imageUrl ? imageShowOnHomepage || imageShowOnBriefing || imageShowOnStoryPage : true) },
    ];
  }, [imageShowOnBriefing, imageShowOnHomepage, imageShowOnStoryPage, imageUrl, selectedEntities.length, sources, summary, title, topics.length]);
  const remainingAutofillSuggestions = useMemo<AutofillSuggestions | null>(() => {
    if (!autofillSuggestions) return null;

    return {
      knowledge: {
        facets: differenceByNormalized(autofillSuggestions.knowledge.facets, normalizeStructuredList(facetsDraft)),
        industries: differenceByNormalized(autofillSuggestions.knowledge.industries, normalizeStructuredList(industriesDraft)),
        locations: differenceByNormalized(autofillSuggestions.knowledge.locations, normalizeStructuredList(locationsDraft)),
        offices: differenceByNormalized(autofillSuggestions.knowledge.offices, normalizeStructuredList(officesDraft)),
        organizations: differenceByNormalized(autofillSuggestions.knowledge.organizations, normalizeStructuredList(organizationsDraft)),
        people: differenceByNormalized(autofillSuggestions.knowledge.people, normalizeStructuredList(peopleDraft)),
        sports_teams: differenceByNormalized(autofillSuggestions.knowledge.sports_teams, normalizeStructuredList(sportsTeamsDraft)),
      },
      primaryEntities: differenceByNormalized(autofillSuggestions.primaryEntities, primaryEntities),
      selectedEntities: differenceByNormalized(autofillSuggestions.selectedEntities, selectedEntities),
      topics: differenceByNormalized(autofillSuggestions.topics, topics),
    };
  }, [
    autofillSuggestions,
    facetsDraft,
    industriesDraft,
    locationsDraft,
    officesDraft,
    organizationsDraft,
    peopleDraft,
    primaryEntities,
    selectedEntities,
    sportsTeamsDraft,
    topics,
  ]);
  const remainingAutofillSuggestionCount = countAutofillSuggestions(remainingAutofillSuggestions);

  useEffect(() => {
    if (!pendingBaselineSync) return;
    setSavedSnapshot(editorSnapshot);
    setPendingBaselineSync(false);
  }, [editorSnapshot, pendingBaselineSync]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  function requestEditorTransition(action: () => void, description: string) {
    if (!isDirty) {
      action();
      return;
    }

    setPendingEditorAction({ action, description });
    showNotice("You have unsaved changes.", "info");
  }

  function toggleTopic(topic: string) {
    const key = normalize(topic);
    setTopics((prev) =>
      prev.map(normalize).includes(key) ? prev.filter((x) => normalize(x) !== key) : [...prev, topic]
    );
  }

  function updateSummary(index: number, value: string) {
    setSummary((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function updateSource(index: number, patch: Partial<SourceEditorRow>) {
    setSources((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;

      const merged = { ...current, ...patch };

      next[index] =
        merged.leanMode === "auto"
          ? {
              ...merged,
              lean: getAutoLean(merged.name, merged.url),
            }
          : merged;
      return next;
    });
  }

  function addSourceRow() {
    setSources((prev) => [...prev, createSourceRow()]);
  }

  function removeSourceRow(index: number) {
    setSources((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      if (prev.length === 1) return [createSourceRow()];
      return prev.filter((_, currentIndex) => currentIndex !== index);
    });
  }

  function moveSourceRow(index: number, direction: "up" | "down") {
    setSources((prev) => {
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;

      const next = [...prev];
      const [row] = next.splice(index, 1);
      next.splice(targetIndex, 0, row);
      return next;
    });
  }

  function moveSourceRowTo(fromIndex: number, toIndex: number) {
    setSources((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length) return prev;
      if (toIndex < 0 || toIndex >= prev.length) return prev;
      if (fromIndex === toIndex) return prev;

      const next = [...prev];
      const [row] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, row);
      return next;
    });
  }

  function applySourceSuggestion(suggested: SourcePreview, preferredIndex?: number) {
    setSources((prev) => {
      const next = [...prev];
      const emptyIndex = next.findIndex((source) => !source.name.trim() && !source.title.trim() && !source.url.trim());
      const index = preferredIndex ?? (emptyIndex >= 0 ? emptyIndex : next.length);
      const existing = next[index] ?? createSourceRow();
      const name = suggested.name.trim() || existing.name.trim() || guessSourceLabel(suggested.url) || "";
      const row: SourceEditorRow = {
        ...existing,
        name,
        title: suggested.title.trim() || existing.title,
        url: suggested.url.trim(),
        lean: getAutoLean(name, suggested.url),
        leanMode: "auto",
      };

      if (index >= next.length) next.push(row);
      else next[index] = row;
      return next;
    });
  }

  useEffect(() => {
    if (discoveryImportChecked) return;
    setDiscoveryImportChecked(true);
    if (requestedStoryId || searchParams.get("from") !== "discovery") return;

    try {
      const raw = window.sessionStorage.getItem(DISCOVERY_SOURCE_IMPORT_KEY);
      if (!raw) return;

      const imported = JSON.parse(raw) as DiscoverySourceImport;
      const importedSources = Array.isArray(imported.sources)
        ? imported.sources
            .map((source) => ({
              name: String(source.name ?? "").trim(),
              title: String(source.title ?? "").trim(),
              url: String(source.url ?? "").trim(),
            }))
            .filter((source) => source.url)
        : [];

      if (importedSources.length === 0) return;

      for (const source of importedSources) {
        applySourceSuggestion(source);
      }

      if (!title.trim() && imported.storyTitle?.trim()) {
        setTitle(imported.storyTitle.trim());
      }

      window.sessionStorage.removeItem(DISCOVERY_SOURCE_IMPORT_KEY);
      showNotice(`Imported ${importedSources.length} selected source links from RSS discovery.`, "success");
    } catch {
      showNotice("We couldn't import the selected RSS discovery links.", "error");
    }
  }, [discoveryImportChecked, requestedStoryId, searchParams, showNotice, title]);

  async function addSourceFromUrl(rawUrl: string, preferredIndex?: number) {
    const url = rawUrl.trim();
    if (!url) {
      showNotice("Paste a source URL first.", "error");
      return;
    }

    setSourcePreviewLoading(true);

    try {
      const res = await fetch("/api/admin/source-preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        source?: SourcePreview;
      };

      if (!res.ok || !json.source) {
        showNotice(`Could not fill source: ${json.error ?? res.statusText}`, "error");
        return;
      }

      applySourceSuggestion(json.source, preferredIndex);
      if (preferredIndex == null) setSourceUrlDraft("");
      showNotice("Source details filled from the article link.", "success");
    } finally {
      setSourcePreviewLoading(false);
    }
  }

  async function previewSource(rawUrl: string) {
    const url = rawUrl.trim();
    if (!url) return null;

    const res = await fetch("/api/admin/source-preview", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      source?: SourcePreview;
    };

    if (!res.ok || !json.source) {
      throw new Error(json.error ?? "We couldn't preview that source.");
    }

    return json.source;
  }

  function dismissAutofillSuggestion(kind: "topic" | "selectedEntity" | "primaryEntity", value: string) {
    setAutofillSuggestions((current) => {
      if (!current) return current;

      if (kind === "topic") {
        return { ...current, topics: removeByNormalized(current.topics, value) };
      }

      if (kind === "primaryEntity") {
        return { ...current, primaryEntities: removeByNormalized(current.primaryEntities, value) };
      }

      return { ...current, selectedEntities: removeByNormalized(current.selectedEntities, value) };
    });
  }

  function dismissKnowledgeSuggestion(field: StoryKnowledgeField, value: string) {
    setAutofillSuggestions((current) => {
      if (!current) return current;
      return {
        ...current,
        knowledge: {
          ...current.knowledge,
          [field]: removeByNormalized(current.knowledge[field], value),
        },
      };
    });
  }

  function appendStructuredSuggestion(field: StoryKnowledgeField, value: string) {
    const apply = (
      draft: string,
      setDraft: (nextDraft: string) => void,
      setList: (nextList: string[]) => void
    ) => {
      const next = mergeUniqueValues(normalizeStructuredList(draft), [value]);
      setList(next);
      setDraft(formatStructuredList(next));
    };

    switch (field) {
      case "facets":
        apply(facetsDraft, setFacetsDraft, setFacets);
        break;
      case "industries":
        apply(industriesDraft, setIndustriesDraft, setIndustries);
        break;
      case "locations":
        apply(locationsDraft, setLocationsDraft, setLocations);
        break;
      case "offices":
        apply(officesDraft, setOfficesDraft, setOffices);
        break;
      case "organizations":
        apply(organizationsDraft, setOrganizationsDraft, setOrganizations);
        break;
      case "people":
        apply(peopleDraft, setPeopleDraft, setPeople);
        break;
      case "sports_teams":
        apply(sportsTeamsDraft, setSportsTeamsDraft, setSportsTeams);
        break;
    }

    dismissKnowledgeSuggestion(field, value);
  }

  function applyTopicSuggestion(topic: string) {
    setTopics((current) => mergeUniqueValues(current, [topic]));
    dismissAutofillSuggestion("topic", topic);
  }

  function applySelectedEntitySuggestion(entity: string) {
    setSelectedEntities((current) => mergeUniqueValues(current, [entity]));
    dismissAutofillSuggestion("selectedEntity", entity);
  }

  function applyPrimaryEntitySuggestion(entity: string) {
    setSelectedEntities((current) => mergeUniqueValues(current, [entity]));
    setPrimaryEntities((current) => mergeUniqueValues(current, [entity]));
    dismissAutofillSuggestion("primaryEntity", entity);
  }

  function applyAllAutofillSuggestions() {
    if (!remainingAutofillSuggestions) return;

    const nextLocations = mergeUniqueValues(normalizeStructuredList(locationsDraft), remainingAutofillSuggestions.knowledge.locations);
    const nextOrganizations = mergeUniqueValues(normalizeStructuredList(organizationsDraft), remainingAutofillSuggestions.knowledge.organizations);
    const nextPeople = mergeUniqueValues(normalizeStructuredList(peopleDraft), remainingAutofillSuggestions.knowledge.people);
    const nextIndustries = mergeUniqueValues(normalizeStructuredList(industriesDraft), remainingAutofillSuggestions.knowledge.industries);
    const nextSportsTeams = mergeUniqueValues(normalizeStructuredList(sportsTeamsDraft), remainingAutofillSuggestions.knowledge.sports_teams);
    const nextOffices = mergeUniqueValues(normalizeStructuredList(officesDraft), remainingAutofillSuggestions.knowledge.offices);
    const nextFacets = mergeUniqueValues(normalizeStructuredList(facetsDraft), remainingAutofillSuggestions.knowledge.facets);

    setLocations(nextLocations);
    setLocationsDraft(formatStructuredList(nextLocations));
    setOrganizations(nextOrganizations);
    setOrganizationsDraft(formatStructuredList(nextOrganizations));
    setPeople(nextPeople);
    setPeopleDraft(formatStructuredList(nextPeople));
    setIndustries(nextIndustries);
    setIndustriesDraft(formatStructuredList(nextIndustries));
    setSportsTeams(nextSportsTeams);
    setSportsTeamsDraft(formatStructuredList(nextSportsTeams));
    setOffices(nextOffices);
    setOfficesDraft(formatStructuredList(nextOffices));
    setFacets(nextFacets);
    setFacetsDraft(formatStructuredList(nextFacets));
    setTopics((current) => mergeUniqueValues(current, remainingAutofillSuggestions.topics));
    setSelectedEntities((current) =>
      mergeUniqueValues(current, remainingAutofillSuggestions.selectedEntities, remainingAutofillSuggestions.primaryEntities)
    );
    setPrimaryEntities((current) => mergeUniqueValues(current, remainingAutofillSuggestions.primaryEntities));
    setAutofillSuggestions(null);
  }

  async function autofillStoryKnowledge() {
    setPendingKnowledgeAutofill(true);

    try {
      const currentLocations = normalizeStructuredList(locationsDraft);
      const currentOrganizations = normalizeStructuredList(organizationsDraft);
      const currentPeople = normalizeStructuredList(peopleDraft);
      const currentIndustries = normalizeStructuredList(industriesDraft);
      const currentSportsTeams = normalizeStructuredList(sportsTeamsDraft);
      const currentOffices = normalizeStructuredList(officesDraft);
      const currentFacets = normalizeStructuredList(facetsDraft);
      const refreshedSources = await Promise.all(
        sources.map(async (source) => {
          if (!source.url.trim() || source.title.trim()) {
            return source;
          }

          try {
            const preview = await previewSource(source.url);
            if (!preview) return source;

            return {
              ...source,
              name: source.name.trim() || preview.name,
              title: source.title.trim() || preview.title,
              url: preview.url,
            };
          } catch {
            return source;
          }
        })
      );

      setSources(refreshedSources);

      const sourceNames = refreshedSources.map((source) => source.name);
      const sourceTitles = refreshedSources.map((source) => source.title);
      const autofillResponse = await fetch("/api/admin/story-knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current: {
            facets: currentFacets,
            industries: currentIndustries,
            locations: currentLocations,
            offices: currentOffices,
            organizations: currentOrganizations,
            people: currentPeople,
            sports_teams: currentSportsTeams,
          },
          currentPrimaryEntities: primaryEntities,
          currentSelectedEntities: selectedEntities,
          entities,
          sources: refreshedSources.map((source) => ({ name: source.name, title: source.title })),
          summary,
          title,
          topics,
        }),
      });
      const autofillJson = (await autofillResponse.json().catch(() => ({}))) as {
        error?: string;
        knowledge?: StoryKnowledgeFields;
        primaryEntities?: string[];
        selectedEntities?: string[];
        winkSuggestions?: StoryKnowledgeFields;
      };

      if (!autofillResponse.ok || !autofillJson.knowledge) {
        throw new Error(autofillJson.error ?? "We couldn't auto-fill story knowledge.");
      }

      const inferred = autofillJson.knowledge;
      const inferredPrimaryEntities = Array.isArray(autofillJson.primaryEntities) ? autofillJson.primaryEntities : primaryEntities;
      const inferredSelectedEntities = Array.isArray(autofillJson.selectedEntities) ? autofillJson.selectedEntities : selectedEntities;
      const inferredTopics = inferTopicsFromDraft({
        currentTopics: topics,
        inferredKnowledge: inferred,
        sourceNames,
        sourceTitles,
        summary,
        title,
      });
      const nextSuggestions: AutofillSuggestions = {
        knowledge: {
          facets: differenceByNormalized(inferred.facets, currentFacets),
          industries: differenceByNormalized(inferred.industries, currentIndustries),
          locations: differenceByNormalized(inferred.locations, currentLocations),
          offices: differenceByNormalized(inferred.offices, currentOffices),
          organizations: differenceByNormalized(inferred.organizations, currentOrganizations),
          people: differenceByNormalized(inferred.people, currentPeople),
          sports_teams: differenceByNormalized(inferred.sports_teams, currentSportsTeams),
        },
        primaryEntities: differenceByNormalized(inferredPrimaryEntities, primaryEntities),
        selectedEntities: differenceByNormalized(inferredSelectedEntities, selectedEntities),
        topics: differenceByNormalized(inferredTopics, topics),
      };
      const suggestionCount = countAutofillSuggestions(nextSuggestions);

      setAutofillSuggestions(suggestionCount > 0 ? nextSuggestions : null);
      if (suggestionCount > 0) {
        window.setTimeout(() => {
          document.getElementById("story-autofill-suggestions")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
      }
      showNotice(
        suggestionCount > 0
          ? `${suggestionCount} story metadata suggestion${suggestionCount === 1 ? "" : "s"} ready to review.`
          : "No new story metadata suggestions found.",
        suggestionCount > 0 ? "success" : "info"
      );
    } catch (knowledgeError) {
      showNotice(knowledgeError instanceof Error ? knowledgeError.message : "We couldn't auto-fill story knowledge.", "error");
    } finally {
      setPendingKnowledgeAutofill(false);
    }
  }

  function setSourceLeanMode(index: number, leanMode: "auto" | "manual") {
    setSources((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;

      next[index] =
        leanMode === "auto"
          ? { ...current, leanMode, lean: getAutoLean(current.name, current.url) }
          : { ...current, leanMode };

      return next;
    });
  }

  function toggleEntity(name: string) {
    setSelectedEntities((prev) => {
      const has = prev.includes(name);
      const next = has ? prev.filter((x) => x !== name) : [...prev, name];
      if (has) setPrimaryEntities((existing) => existing.filter((x) => x !== name));
      return next;
    });
  }

  function togglePrimary(name: string) {
    if (!selectedEntities.includes(name)) {
      setSelectedEntities((prev) => (prev.includes(name) ? prev : [...prev, name]));
    }
    setPrimaryEntities((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
  }

  function toggleRelatedStory(id: string) {
    setRelatedStoryIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  async function uploadImage(file: File) {
    setUploadingImage(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("storyId", storyId);
      if (imagePath && imagePath !== savedImagePath) {
        formData.append("previousPath", imagePath);
      }

      const res = await fetch("/api/admin/story-images", {
        method: "POST",
        body: formData,
      });

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        imagePath?: string;
        imageUrl?: string;
      };

      if (!res.ok || !json.imagePath || !json.imageUrl) {
        showNotice(`Upload failed: ${json.error ?? res.statusText}`, "error");
        return;
      }

      setImagePath(json.imagePath);
      setImageUrl(json.imageUrl);
      setEmbeddedImageUrlDraft("");
      setImageFocusX(DEFAULT_IMAGE_FOCUS);
      setImageFocusY(DEFAULT_IMAGE_FOCUS);
      setImageDisplay("contain");
      setImageShowOnHomepage(true);
      setImageShowOnBriefing(true);
      setImageShowOnStoryPage(false);
      showNotice("Image uploaded.", "success");
    } finally {
      setUploadingImage(false);
    }
  }

  async function embedImageFromUrl() {
    const normalizedUrl = normalizeHttpUrl(embeddedImageUrlDraft);
    if (!normalizedUrl) {
      showNotice("Embedded image URL must start with http:// or https://.", "error");
      return;
    }

    if (imagePath && imagePath !== savedImagePath) {
      const res = await fetch("/api/admin/story-images", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imagePath }),
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        showNotice(`Previous upload removal failed: ${json.error ?? res.statusText}`, "error");
        return;
      }
    }

    setImageUrl(normalizedUrl);
    setImagePath(null);
    setEmbeddedImageUrlDraft(normalizedUrl);
    setImageFocusX(DEFAULT_IMAGE_FOCUS);
    setImageFocusY(DEFAULT_IMAGE_FOCUS);
    setImageDisplay("cover");
    setImageShowOnHomepage(false);
    setImageShowOnBriefing(false);
    setImageShowOnStoryPage(true);
    showNotice("Embedded image set. Add a credit, then save the story.", "success");
  }

  async function removeImage() {
    if (!imagePath && !imageUrl) return;

    if (imagePath && imagePath !== savedImagePath) {
      const res = await fetch("/api/admin/story-images", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imagePath }),
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        showNotice(`Image removal failed: ${json.error ?? res.statusText}`, "error");
        return;
      }
    }

    setImageUrl(null);
    setImagePath(null);
    setEmbeddedImageUrlDraft("");
    setImageCredit("");
    setImageCreditUrl("");
    setImageFocusX(DEFAULT_IMAGE_FOCUS);
    setImageFocusY(DEFAULT_IMAGE_FOCUS);
    setImageDisplay("contain");
    setImageShowOnHomepage(true);
    setImageShowOnBriefing(true);
    setImageShowOnStoryPage(false);
    showNotice("Image removed. Save the story to make that change permanent.", "info");
  }

  function updateImageFocusFromClick(event: MouseEvent<HTMLButtonElement>) {
    if (imageDisplay !== "cover") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setImageFocusX(clampImageFocus(x));
    setImageFocusY(clampImageFocus(y));
  }

  async function onSave() {
    const cleanedSummary = summary.map((line) => line.trim()).filter(Boolean);
    const cleanedLocations = normalizeStructuredList(locationsDraft);
    const cleanedOrganizations = normalizeStructuredList(organizationsDraft);
    const cleanedPeople = normalizeStructuredList(peopleDraft);
    const cleanedIndustries = normalizeStructuredList(industriesDraft);
    const cleanedSportsTeams = normalizeStructuredList(sportsTeamsDraft);
    const cleanedOffices = normalizeStructuredList(officesDraft);
    const cleanedFacets = normalizeStructuredList(facetsDraft);
    const cleanedRelatedInterestSignals = normalizeStructuredList(relatedInterestSignalsDraft);
    const cleanedSources = sources
      .map((source) => ({
        badge: (source.badge ?? "").trim() || null,
        name: source.name.trim(),
        title: source.title.trim() || null,
        url: source.url.trim(),
        lean: source.lean,
      }))
      .filter((source) => source.name && source.url);
    const trimmedBeaconHeadline = beaconHeadline.trim();
    const trimmedBeaconSummary = beaconSummary.trim();
    const nextStoryId = activeStoryId ?? normalizeStoryIdInput(slugInput || generatedId);

    if (!title.trim()) {
      showNotice("Title is required.", "error");
      return;
    }
    if (!nextStoryId) {
      showNotice("Story slug is required.", "error");
      return;
    }
    if (cleanedSummary.length === 0) {
      showNotice("Add at least 1 summary line.", "error");
      return;
    }
    if (cleanedSources.length === 0) {
      showNotice("Add at least 1 source.", "error");
      return;
    }
    const storyEntities = selectedEntities
  .map((name) => entities.find((e) => e.name === name))
  .filter(Boolean)
  .map((e) => ({ name: e!.name, aliases: e!.aliases }));

    const story: Story = {
      id: nextStoryId,
      status,
      title: title.trim(),
      summary: cleanedSummary,
      sources: cleanedSources,
      date,
      image_url: imageUrl,
      image_path: imagePath,
      image_credit: imageUrl ? imageCredit.trim() || null : null,
      image_credit_url: imageUrl ? imageCreditUrl.trim() || null : null,
      image_focus_x: imageUrl ? imageFocusX : null,
      image_focus_y: imageUrl ? imageFocusY : null,
      image_display: imageUrl ? imageDisplay : null,
      image_show_on_homepage: imageUrl ? imageShowOnHomepage : false,
      image_show_on_briefing: imageUrl ? imageShowOnBriefing : false,
      image_show_on_story_page: imageUrl ? imageShowOnStoryPage : false,
      urgent,
      pinned: pinnedStory,
      beacon_include: beaconInclude,
      beacon_lead_style: beaconLeadStyle,
      beacon_headline: trimmedBeaconHeadline || null,
      beacon_summary: trimmedBeaconSummary || null,
      topics: topics.map(normalize),
      entities: storyEntities,
      primary_entities: primaryEntities,
      locations: cleanedLocations,
      organizations: cleanedOrganizations,
      people: cleanedPeople,
      industries: cleanedIndustries,
      sports_teams: cleanedSportsTeams,
      offices: cleanedOffices,
      facets: cleanedFacets,
      related_interest_signals: cleanedRelatedInterestSignals,
      related_story_ids: relatedStoryIds,
      tags: [
        ...topics.map(normalize),
        ...selectedEntities.map(normalize),
        ...cleanedLocations.map(normalize),
        ...cleanedOrganizations.map(normalize),
        ...cleanedPeople.map(normalize),
        ...cleanedIndustries.map(normalize),
        ...cleanedSportsTeams.map(normalize),
        ...cleanedOffices.map(normalize),
        ...cleanedFacets.map(normalize),
      ],
      comments: 0,
    };

    const res = await fetch("/api/stories", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(story),
    });

    const json = (await res.json().catch(() => ({}))) as { error?: string; story?: Story };
    if (!res.ok) {
      showNotice(`Save failed: ${json.error ?? res.statusText}`, "error");
      return;
    }

    await loadStories();
    await searchStories(storySearch);
    await loadRevisions(story.id);
    setActiveStoryId(story.id);
    setSlugInput(story.id);
    setImageUrl(json.story?.image_url ?? imageUrl);
    setImagePath(json.story?.image_path ?? imagePath ?? null);
    setSavedImagePath(json.story?.image_path ?? imagePath ?? null);
    setEmbeddedImageUrlDraft(json.story?.image_path ? "" : json.story?.image_url ?? imageUrl ?? "");
    setImageCredit(json.story?.image_credit ?? imageCredit.trim());
    setImageCreditUrl(json.story?.image_credit_url ?? imageCreditUrl.trim());
    setLocations(cleanedLocations);
    setOrganizations(cleanedOrganizations);
    setPeople(cleanedPeople);
    setIndustries(cleanedIndustries);
    setSportsTeams(cleanedSportsTeams);
    setOffices(cleanedOffices);
    setFacets(cleanedFacets);
    setRelatedInterestSignals(cleanedRelatedInterestSignals);
    setPendingDelete(false);
    setPendingBaselineSync(true);
    showNotice(`Saved ${story.status === "published" ? "published" : story.status} story: ${story.id}`, "success");
  }

  async function onDeleteConfirmed() {
    const id = storyId;
    if (!id || id === "new-story") {
      showNotice("Save the story before trying to delete it.", "error");
      return;
    }

    const res = await fetch(`/api/stories/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      showNotice(`Delete failed: ${err.error ?? res.statusText}`, "error");
      return;
    }

    await loadStories();
    await searchStories(storySearch);
    setRevisions([]);
    resetForm();
    setPendingBaselineSync(true);
    showNotice(`Deleted: ${id}`, "success");
  }
  async function createEntity(name: string) {
    const res = await fetch("/api/entities", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, aliases: [] }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      showNotice(`Create entity failed: ${json?.error ?? res.statusText}`, "error");
      return null;
    }

    const created = json.entity as Entity;
    setEntities((prev) => {
      const next = [...prev, created];
      next.sort((a, b) => a.name.localeCompare(b.name));
      return next;
    });

    return created;
  }

  async function saveAliases(entityName: string, aliases: string[]) {
    const res = await fetch(`/api/entities/${encodeURIComponent(entityName)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ aliases }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      showNotice(`Update aliases failed: ${json?.error ?? res.statusText}`, "error");
      return;
    }

    const updated = json.entity as Entity;
    setEntities((prev) => prev.map((e) => (e.name === updated.name ? updated : e)));
    showNotice(`Updated aliases for ${updated.name}.`, "success");
  }

  async function restoreRevision(revisionId: string) {
    if (typeof window !== "undefined" && !window.confirm("Restore this story revision into the editor?")) {
      return;
    }

    setBusyRevisionId(revisionId);
    try {
      const response = await fetch("/api/admin/story-revisions", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ revisionId }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; story?: StoryWithViews };
      if (!response.ok || !data.story) {
        throw new Error(data.error ?? "We couldn't restore that revision.");
      }

      loadStoryIntoForm(data.story);
      await loadStories();
      await searchStories(storySearch);
      await loadRevisions(data.story.id);
      setPendingBaselineSync(true);
      showNotice(`Restored ${data.story.id} from revision history.`, "success");
    } catch (restoreError) {
      showNotice(restoreError instanceof Error ? restoreError.message : "We couldn't restore that revision.", "error");
    } finally {
      setBusyRevisionId(null);
    }
  }
  return (
    <main className="min-h-screen bg-transparent px-3 pb-24 pt-5 text-neutral-100 sm:px-5 sm:py-7 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 rounded-2xl border border-[#183149]/65 bg-[#07131e] p-4 shadow-[0_16px_36px_rgba(0,0,0,0.2)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Admin</div>
            <div className="mt-1 text-lg font-semibold text-neutral-100">Story Editor</div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/admin" className="text-xs text-neutral-400 hover:text-neutral-200">
              Control center
            </Link>
            <button
              onClick={() => requestEditorTransition(resetForm, "start a new story")}
              className="text-xs text-neutral-400 hover:text-neutral-200"
            >
              New story
            </button>
            <Link href="/admin/briefing" className="text-xs text-neutral-400 hover:text-neutral-200">
              Manage briefing order
            </Link>
            <Link href="/admin/discovery" className="text-xs text-neutral-400 hover:text-neutral-200">
              RSS discovery
            </Link>
            <Link href="/admin/moderation" className="text-xs text-neutral-400 hover:text-neutral-200">
              Moderation
            </Link>
            <BackLink href="/" />
          </div>
        </div>

        {notice ? (
          <div
            className={`mt-6 rounded-2xl border px-5 py-4 text-sm shadow-[0_18px_45px_rgba(0,0,0,0.25)] ${
              notice.tone === "error"
                ? "border-red-500/60 bg-red-500/10 text-red-100"
                : notice.tone === "success"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                  : "border-[#8f7740]/50 bg-[#07101a] text-[#e6d3a6]"
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div>{notice.text}</div>
              <button type="button" onClick={() => setNotice(null)} className="text-xs uppercase tracking-[0.18em] opacity-80 hover:opacity-100">
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        {pendingEditorAction ? (
          <div className="mt-6 rounded-2xl border border-[#8f7740]/50 bg-[#07101a] px-5 py-4 text-sm text-[#e6d3a6] shadow-[0_18px_45px_rgba(0,0,0,0.25)]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>You have unsaved changes. Leave them behind and {pendingEditorAction.description}?</div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setPendingEditorAction(null)}
                  className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-200 hover:bg-neutral-800"
                >
                  Stay here
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const action = pendingEditorAction.action;
                    setPendingEditorAction(null);
                    action();
                  }}
                  className="rounded-full border border-[#8f7740]/70 bg-[#0a1724] px-4 py-2 text-xs font-semibold text-neutral-100 hover:border-[#b89a55]"
                >
                  Discard changes
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <details id="editor-stories" className={`${ADMIN_PANEL} mt-6 scroll-mt-24 p-5`}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold uppercase tracking-[0.14em] text-neutral-300 [&::-webkit-details-marker]:hidden">
            <span>Current Stories</span>
            <span className="inline-flex items-center gap-3 text-xs font-normal normal-case tracking-normal text-neutral-500">
              {loadingStories ? "Loading..." : `${filteredStories.length} stories`}
              <span className="rounded-full border border-[#28445d] px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-neutral-400">
                Toggle
              </span>
            </span>
          </summary>
          <div className="mt-5">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={storySearch}
                onChange={(e) => setStorySearch(e.target.value)}
                placeholder="Search stories..."
                className="min-h-11 flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
              />
              <button
                onClick={() => void loadStories()}
                className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                type="button"
              >
                Refresh
              </button>
            </div>
            <div className="mt-4 grid max-h-[26rem] gap-3 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
              {filteredStories.map((story) => {
                const active = story.id === activeStoryId;
                return (
                  <button
                    key={story.id}
                    type="button"
                    onClick={() => requestEditorTransition(() => loadStoryIntoForm(story), `open "${story.title}"`)}
                    className={`rounded-xl border p-4 text-left transition ${
                      active
                        ? "border-neutral-300 bg-neutral-100/10"
                        : "border-[#1a334b]/75 bg-[#081521] hover:border-neutral-500"
                    }`}
                  >
                    <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">{story.date}</div>
                    <div className="mt-2 line-clamp-2 text-sm font-semibold text-neutral-100">{story.title}</div>
                    <div className="mt-2 truncate text-xs text-neutral-500">{story.id}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                      <span>{story.status}</span>
                      {story.beacon_include ? <span className="text-red-300">Briefing</span> : null}
                      {story.pinned ? <span className="text-amber-300">Tracking</span> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </details>
      </div>

      <div className="mx-auto mt-6 max-w-3xl sm:mt-8">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 sm:grid-cols-[1fr_auto_1fr] sm:gap-4">
          <BackLink href="/admin" className="justify-self-start" />
          <div className="justify-self-center text-center">
            <Link href="/" aria-label="Go to The Beacon home page" className="inline-block">
              <Image
                src="/small logo.png"
                alt="Signal logo"
                width={600}
                height={140}
                priority
                className="h-auto w-[122px] sm:w-[156px] md:w-[184px]"
              />
            </Link>
            <p className="mt-1 hidden text-[11px] text-neutral-500 sm:block md:text-xs">One Story, Multiple Perspectives.</p>
          </div>
          <div className="justify-self-end">
            <button
              type="button"
              onClick={() => requestEditorTransition(resetForm, "start a new story")}
              className="inline-flex min-h-10 rounded-full border border-[#8f7740]/60 bg-[#08131d] px-3 py-2 text-xs font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0b1824] sm:px-4"
            >
              New story
            </button>
          </div>
        </div>
      </div>

      <nav className="sticky top-0 z-30 -mx-3 mt-5 border-y border-[#183149]/70 bg-[#020b14]/95 px-3 py-2 backdrop-blur xl:hidden">
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[
            { href: "#editor-story", label: "Story" },
            { href: "#editor-setup", label: "Setup" },
            { href: "#editor-metadata", label: "Metadata" },
            { href: "#editor-sources", label: "Sources" },
            { href: "#editor-related", label: "Related" },
            { href: "#editor-publish-mobile", label: "Publish" },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-full border border-[#28445d] bg-[#06131e] px-4 py-2 text-xs font-semibold text-neutral-200"
            >
              {item.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="mx-auto mt-6 max-w-[108rem] sm:mt-8 xl:grid xl:grid-cols-[1fr_20rem_minmax(0,48rem)_18rem_1fr] xl:gap-6">
        <div className="hidden xl:block" />
        <aside className="hidden xl:col-start-2 xl:block xl:w-80 xl:self-start xl:pt-1">
          <div className="space-y-5">
          <div className="rounded-[22px] border border-[#183149]/45 bg-[#06131d]/64 p-5 shadow-[0_10px_22px_rgba(0,0,0,0.1)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d7c08d]">Story Setup</div>
            <div className="mt-4 space-y-4 text-sm">
              <label className="block">
                <span className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">Date</span>
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-[#214765]/70 bg-[#020b14] px-3 py-2 text-sm text-neutral-200 outline-none focus:border-[#8f7740]/70"
                />
              </label>

              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">Status</div>
                <div className="mt-2 grid gap-2">
                  {STORY_STATUS_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setStatus(option.value)}
                      className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                        status === option.value
                          ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                          : "border-[#214765]/70 bg-[#020b14] text-neutral-300 hover:border-[#8f7740]/70"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">Story slug</span>
                <input
                  value={activeStoryId ? storyId : slugInput || generatedId}
                  onChange={(event) => setSlugInput(normalizeStoryIdInput(event.target.value))}
                  readOnly={Boolean(activeStoryId)}
                  className="mt-2 w-full rounded-lg border border-[#214765]/70 bg-[#020b14] px-3 py-2 text-sm text-neutral-200 outline-none read-only:opacity-70 focus:border-[#8f7740]/70"
                  placeholder="story-slug"
                />
              </label>
            </div>
          </div>
          <div className="rounded-[22px] border border-[#183149]/45 bg-[#06131d]/64 p-5 shadow-[0_10px_22px_rgba(0,0,0,0.1)]">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d7c08d]">Entities</div>
              <button
                type="button"
                onClick={() => void autofillStoryKnowledge()}
                disabled={pendingKnowledgeAutofill}
                className="rounded-full border border-[#8f7740]/60 px-3 py-1 text-[11px] font-semibold text-[#e3cca0] transition hover:bg-[#8f7740]/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingKnowledgeAutofill ? "Filling" : "Auto-fill"}
              </button>
            </div>
            <div className="mt-4 flex gap-2">
              <input
                value={entitySearch}
                onChange={(event) => setEntitySearch(event.target.value)}
                placeholder="Search or add entity"
                className="min-w-0 flex-1 rounded-lg border border-[#214765]/70 bg-[#020b14] px-3 py-2 text-sm text-neutral-200 outline-none focus:border-[#8f7740]/70"
              />
              <button
                type="button"
                onClick={async () => {
                  const name = entitySearch.trim();
                  if (!name) return;
                  const existing = entities.find((entity) => entity.name.toLowerCase() === name.toLowerCase());
                  const entity = existing ?? (await createEntity(name));
                  if (!entity) return;
                  setSelectedEntities((current) => (current.includes(entity.name) ? current : [...current, entity.name]));
                  setEntitySearch("");
                }}
                className="rounded-lg bg-neutral-100 px-3 py-2 text-sm font-semibold text-neutral-900"
              >
                Add
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedEntities.length > 0 ? (
                selectedEntities.map((name) => (
                  <button
                    key={`left-selected-${name}`}
                    type="button"
                    onClick={() => togglePrimary(name)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${
                      primaryEntities.includes(name)
                        ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                        : "border-[#28445d] text-neutral-300 hover:border-[#8f7740]/70"
                    }`}
                    title="Click to toggle primary"
                  >
                    {name}
                  </button>
                ))
              ) : (
                <span className="text-xs text-neutral-500">No entities selected.</span>
              )}
            </div>
            <div className="mt-4 max-h-48 space-y-2 overflow-y-auto pr-1">
              {entities
                .filter((entity) =>
                  entitySearch.trim()
                    ? entity.name.toLowerCase().includes(entitySearch.trim().toLowerCase())
                    : selectedEntities.length > 0
                      ? !selectedEntities.includes(entity.name)
                      : true
                )
                .slice(0, 18)
                .map((entity) => {
                  const selected = selectedEntities.includes(entity.name);
                  return (
                    <button
                      key={`left-entity-${entity.name}`}
                      type="button"
                      onClick={() => toggleEntity(entity.name)}
                      className={`block w-full rounded-lg border px-3 py-2 text-left text-xs transition ${
                        selected
                          ? "border-neutral-100 bg-neutral-100/10 text-neutral-100"
                          : "border-[#214765]/70 bg-[#020b14] text-neutral-300 hover:border-[#8f7740]/70"
                      }`}
                    >
                      {selected ? "Selected: " : "+ "}
                      {entity.name}
                    </button>
                  );
                })}
            </div>
          </div>
          <div className="rounded-[22px] border border-[#183149]/45 bg-[#06131d]/64 p-5 shadow-[0_10px_22px_rgba(0,0,0,0.1)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d7c08d]">Metadata</div>
            <div className="mt-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">Topics</div>
              <div className="mt-2 flex max-h-44 flex-wrap gap-2 overflow-y-auto pr-1">
                {TOPICS.map((topic) => {
                  const selected = topics.map(normalize).includes(normalize(topic));
                  return (
                    <button
                      key={`left-topic-${topic}`}
                      type="button"
                      onClick={() => toggleTopic(topic)}
                      className={`rounded-full border px-3 py-1.5 text-xs transition ${
                        selected
                          ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                          : "border-[#28445d] text-neutral-300 hover:border-[#8f7740]/70"
                      }`}
                    >
                      {topic}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 grid gap-3">
              {[
                { label: "People", value: peopleDraft, setValue: setPeopleDraft, placeholder: "Name per line" },
                { label: "Organizations", value: organizationsDraft, setValue: setOrganizationsDraft, placeholder: "Org per line" },
                { label: "Locations", value: locationsDraft, setValue: setLocationsDraft, placeholder: "Place per line" },
                { label: "Industries", value: industriesDraft, setValue: setIndustriesDraft, placeholder: "Industry per line" },
                { label: "Sports Teams", value: sportsTeamsDraft, setValue: setSportsTeamsDraft, placeholder: "Team per line" },
                { label: "Offices", value: officesDraft, setValue: setOfficesDraft, placeholder: "Office per line" },
                { label: "Facets", value: facetsDraft, setValue: setFacetsDraft, placeholder: "Facet per line" },
                {
                  label: "Related Signals",
                  value: relatedInterestSignalsDraft,
                  setValue: setRelatedInterestSignalsDraft,
                  placeholder: "Signal per line",
                },
              ].map((field) => (
                <label key={`left-meta-${field.label}`} className="block">
                  <span className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">{field.label}</span>
                  <textarea
                    value={field.value}
                    onChange={(event) => field.setValue(event.target.value)}
                    rows={2}
                    className="mt-2 w-full resize-y rounded-lg border border-[#214765]/70 bg-[#020b14] px-3 py-2 text-xs leading-5 text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-[#8f7740]/70"
                    placeholder={field.placeholder}
                  />
                </label>
              ))}
            </div>
          </div>
          </div>
        </aside>

        <div className="min-w-0 xl:col-start-3">
            <article id="editor-story" className="min-w-0 max-w-full scroll-mt-24 rounded-[18px] border border-[#1d3952]/50 bg-[#081520]/88 p-4 shadow-[0_12px_28px_rgba(0,0,0,0.12)] sm:rounded-[22px] sm:p-8">
              <header className="border-b border-[#1a3349]/70 pb-5 sm:pb-6">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  <span>{date || "Set date below"}</span>
                  <span className="text-[#35556f]">/</span>
                  <span>{status}</span>
                  {isDirty ? (
                    <>
                      <span className="text-[#35556f]">/</span>
                      <span className="text-amber-300">Unsaved</span>
                    </>
                  ) : null}
                </div>
                <textarea
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  rows={2}
                  className="block w-full resize-none rounded-xl border border-transparent bg-transparent px-0 py-1 text-[2rem] font-semibold leading-[1.05] text-neutral-50 outline-none transition placeholder:text-neutral-600 focus:border-[#28445d] focus:bg-[#06131e] focus:px-4 sm:text-[2.55rem]"
                  placeholder="Click to add the story title..."
                />
              </header>

              <div
                className={
                  imageUrl && imageShowOnStoryPage && imageDisplay === "contain"
                    ? "mt-6 flex flex-col gap-6 xl:flex-row xl:items-start"
                    : "mt-6"
                }
              >
                <div
                  className={
                    imageUrl && imageShowOnStoryPage && imageDisplay === "contain"
                      ? "min-w-0 w-full xl:w-auto xl:max-w-[24rem] xl:shrink-0"
                      : "min-w-0 w-full"
                  }
                >
                  {imageUrl && imageShowOnStoryPage ? (
                    <button
                      type="button"
                      onClick={updateImageFocusFromClick}
                      className="block w-full overflow-hidden rounded-[18px] border border-[#214765]/70 bg-[#06131e] text-left"
                      title={imageDisplay === "cover" ? "Click to set the crop focus point" : "Image is shown fully in fit mode"}
                    >
                      <div
                        className={`relative ${
                          imageDisplay === "contain"
                            ? "flex min-h-[260px] items-center justify-center p-4"
                            : "aspect-[16/10]"
                        }`}
                      >
                        {imageDisplay === "contain" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={imageUrl}
                            alt="Story image preview"
                            className="block max-h-[420px] max-w-full object-contain"
                          />
                        ) : (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={imageUrl}
                              alt="Story image preview"
                              className="absolute inset-0 h-full w-full object-cover"
                              style={{ objectPosition: imageObjectPosition({ image_focus_x: imageFocusX, image_focus_y: imageFocusY }) }}
                            />
                            <div
                              className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white/20"
                              style={{ left: `${imageFocusX}%`, top: `${imageFocusY}%` }}
                            />
                          </>
                        )}
                      </div>
                    </button>
                  ) : (
                    <label className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-[18px] border border-dashed border-[#214765]/80 bg-[#06131e]/70 px-5 py-8 text-center transition hover:border-[#8f7740]/70 hover:bg-[#071622]">
                      <span className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Story image</span>
                      <span className="mt-2 text-base text-neutral-300">
                        {imageUrl ? "Image is hidden on story pages" : "Click to upload an image"}
                      </span>
                      <span className="mt-1 text-xs text-neutral-500">Use the image controls below for placement and framing.</span>
                      <input
                        type="file"
                        accept={STORY_IMAGE_ACCEPT}
                        className="sr-only"
                        disabled={uploadingImage}
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (!file) return;
                          await uploadImage(file);
                          setImageShowOnStoryPage(true);
                        }}
                      />
                    </label>
                  )}
                </div>

                <div
                  className={
                    imageUrl && imageShowOnStoryPage && imageDisplay === "contain"
                      ? "min-w-0 flex-1 space-y-3.5 text-[1.02rem] text-neutral-200 sm:text-[1.08rem]"
                      : "space-y-3.5 text-[1.02rem] text-neutral-200 sm:text-[1.08rem]"
                  }
                >
                  {summary.map((point, index) => (
                    <textarea
                      key={index}
                      value={point}
                      onChange={(event) => updateSummary(index, event.target.value)}
                      rows={2}
                      className="block w-full resize-y rounded-xl border border-transparent bg-transparent px-0 py-1 leading-7 text-neutral-200 outline-none transition placeholder:text-neutral-600 focus:border-[#28445d] focus:bg-[#06131e] focus:px-4 sm:leading-8"
                      placeholder={`Click to add summary point ${index + 1}...`}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => setSummary((current) => [...current, ""])}
                    className="rounded-full border border-[#28445d] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400 transition hover:border-[#8f7740]/70 hover:text-neutral-100"
                  >
                    Add summary point
                  </button>
                </div>
              </div>

              <section className="mt-8 border-t border-[#1a3349]/70 pt-5">
                <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d7c08d]">Sources</div>
                <div className="mb-4 rounded-[14px] border border-[#214765]/70 bg-[#06131e] p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                    Add source from URL
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={sourceUrlDraft}
                      onChange={(event) => setSourceUrlDraft(event.target.value)}
                      className="min-h-11 flex-1 rounded-lg border border-[#214765]/70 bg-[#020b14] px-3 py-2 text-sm text-neutral-200 outline-none transition placeholder:text-neutral-600 focus:border-[#8f7740]/70"
                      placeholder="Paste article URL"
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addSourceFromUrl(sourceUrlDraft);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => addSourceFromUrl(sourceUrlDraft)}
                      disabled={sourcePreviewLoading || !sourceUrlDraft.trim()}
                      className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {sourcePreviewLoading ? "Adding..." : "Add from link"}
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  {sources.map((source, index) => {
                    const isDragging = sourceDragIndex === index;
                    const isDropTarget = sourceDropIndex === index && sourceDragIndex !== null && sourceDragIndex !== index;
                    const dropBefore = isDropTarget && sourceDragIndex > index;
                    const dropAfter = isDropTarget && sourceDragIndex < index;

                    return (
                    <div
                      key={index}
                      className="relative"
                    >
                      {dropBefore ? (
                        <div className="mb-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#e3cca0]">
                          <span className="h-px flex-1 bg-[#e3cca0]" />
                          Drop here
                          <span className="h-px flex-1 bg-[#e3cca0]" />
                        </div>
                      ) : null}
                      <div
                        draggable
                        onDragStart={(event) => {
                          setSourceDragIndex(index);
                          setSourceDropIndex(index);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnter={(event) => {
                          event.preventDefault();
                          setSourceDropIndex(index);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          setSourceDropIndex(index);
                          event.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (sourceDragIndex != null) moveSourceRowTo(sourceDragIndex, index);
                          setSourceDragIndex(null);
                          setSourceDropIndex(null);
                        }}
                        onDragEnd={() => {
                          setSourceDragIndex(null);
                          setSourceDropIndex(null);
                        }}
                        className={`rounded-[14px] border bg-[#0a1926] p-4 transition focus-within:border-[#8f7740]/70 sm:p-5 ${
                          isDragging
                            ? "scale-[0.99] border-[#8f7740]/80 opacity-55"
                            : isDropTarget
                              ? "border-[#e3cca0] shadow-[0_0_0_1px_rgba(227,204,160,0.35)]"
                              : "border-[#214765]/70"
                        }`}
                      >
                      <div className="mb-3 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                        <span>Source {index + 1}</span>
                        <span className="cursor-grab select-none rounded-full border border-[#28445d] px-3 py-1 text-neutral-400 active:cursor-grabbing">
                          Drag
                        </span>
                      </div>
                      <input
                        value={source.name}
                        onChange={(event) => updateSource(index, { name: event.target.value })}
                        className="w-full rounded-lg border border-transparent bg-transparent px-0 py-1 text-[1.08rem] font-semibold text-neutral-50 outline-none transition placeholder:text-neutral-600 focus:border-[#28445d] focus:bg-[#06131e] focus:px-3"
                        placeholder="Source outlet"
                      />
                      <input
                        value={source.title}
                        onChange={(event) => updateSource(index, { title: event.target.value })}
                        className="mt-2 w-full rounded-lg border border-transparent bg-transparent px-0 py-1 text-[15px] leading-6 text-neutral-300 outline-none transition placeholder:text-neutral-600 focus:border-[#28445d] focus:bg-[#06131e] focus:px-3"
                        placeholder="Source article title"
                      />
                      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_8rem]">
                        <input
                          value={source.url}
                          onChange={(event) => updateSource(index, { url: event.target.value })}
                          onBlur={() => {
                            if (!source.name.trim()) {
                              const guessedName = guessSourceLabel(source.url);
                              if (guessedName) updateSource(index, { name: guessedName });
                            }
                          }}
                          className="rounded-lg border border-[#214765]/70 bg-[#06131e] px-3 py-2 text-sm text-neutral-200 outline-none transition placeholder:text-neutral-600 focus:border-[#8f7740]/70"
                          placeholder="https://..."
                        />
                        <select
                          value={source.lean}
                          onChange={(event) => updateSource(index, { lean: event.target.value as Lean, leanMode: "manual" })}
                          className="rounded-lg border border-[#214765]/70 bg-[#06131e] px-3 py-2 text-sm text-neutral-200 outline-none transition focus:border-[#8f7740]/70"
                        >
                          <option value="Left">Left</option>
                          <option value="Center">Center</option>
                          <option value="Right">Right</option>
                        </select>
                      </div>
                      <input
                        value={source.badge ?? ""}
                        onChange={(event) => updateSource(index, { badge: event.target.value })}
                        className="mt-3 w-full rounded-lg border border-[#214765]/70 bg-[#06131e] px-3 py-2 text-sm text-neutral-200 outline-none transition placeholder:text-neutral-600 focus:border-[#8f7740]/70"
                        placeholder="Optional badge, e.g. Press Release or Official Broadcast"
                      />
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                        <button
                          type="button"
                          onClick={() => addSourceFromUrl(source.url, index)}
                          disabled={sourcePreviewLoading || !source.url.trim()}
                          className="rounded-full border border-[#28445d] px-3 py-1.5 font-semibold text-neutral-300 transition hover:border-[#8f7740]/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {sourcePreviewLoading ? "Autofilling..." : "Autofill from URL"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSourceLeanMode(index, "auto")}
                          className="rounded-full border border-[#28445d] px-3 py-1.5 font-semibold text-neutral-300 transition hover:border-[#8f7740]/70 hover:text-white"
                        >
                          Use auto lean
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSourceRow(index, "up")}
                          disabled={index === 0}
                          className="rounded-full border border-[#28445d] px-3 py-1.5 font-semibold text-neutral-300 transition hover:border-[#8f7740]/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Move up
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSourceRow(index, "down")}
                          disabled={index === sources.length - 1}
                          className="rounded-full border border-[#28445d] px-3 py-1.5 font-semibold text-neutral-300 transition hover:border-[#8f7740]/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Move down
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSourceRow(index)}
                          className="rounded-full border border-[#5b2a2a] px-3 py-1.5 font-semibold text-[#f0c8c8] transition hover:bg-[#190b0c]"
                        >
                          Remove
                        </button>
                        <span>
                          {source.leanMode === "auto"
                            ? `Auto-detected lean: ${source.lean}`
                            : `Manual override: ${source.lean}`}
                        </span>
                      </div>
                      </div>
                      {dropAfter ? (
                        <div className="mt-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#e3cca0]">
                          <span className="h-px flex-1 bg-[#e3cca0]" />
                          Drop here
                          <span className="h-px flex-1 bg-[#e3cca0]" />
                        </div>
                      ) : null}
                    </div>
                  );
                  })}
                </div>
                <button
                  type="button"
                  onClick={addSourceRow}
                  className="mt-4 rounded-full border border-[#28445d] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400 transition hover:border-[#8f7740]/70 hover:text-neutral-100"
                >
                  Add source
                </button>
              </section>

              <div className="mt-8 flex flex-col gap-3 border-t border-[#1a3349]/70 pt-5 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void onSave()}
                  className="flex-1 rounded-xl bg-neutral-100 py-3 font-semibold text-neutral-900 transition hover:bg-white"
                >
                  {saveButtonLabel(status)}
                </button>
                <Link
                  href={`/story/${storyId}`}
                  target="_blank"
                  className="rounded-xl border border-[#28445d] px-6 py-3 text-center text-sm font-semibold text-neutral-200 transition hover:border-[#8f7740]/70 hover:text-white"
                >
                  Preview public URL
                </Link>
              </div>
            </article>

            <section className={`mt-8 ${ADMIN_PANEL} p-6`}>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d7c08d]">
                    Editor Controls
                  </div>
                  <p className="mt-2 text-sm leading-6 text-neutral-500">
                    The page above is the story canvas. Use these panels for hidden fields, matching, entities, briefing placement, and revision history.
                  </p>
                </div>
                <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                  {activeStoryId ? "Existing story" : "New story"}
                </div>
              </div>
              <div className="space-y-4">
              <EditorSection
                id="editor-setup"
                title="Story Setup"
                description="Core story details, image, and publishing controls."
              >
          <div id="editor-related" className="scroll-mt-24 bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <label className="block text-sm text-neutral-300 mb-2">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg"
              placeholder="Headline..."
            />
            <div className="mt-4">
              <label className="block text-sm text-neutral-300 mb-2">Story slug</label>
              <input
                value={activeStoryId ? storyId : slugInput || generatedId}
                onChange={(e) => setSlugInput(normalizeStoryIdInput(e.target.value))}
                readOnly={Boolean(activeStoryId)}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg read-only:opacity-70"
                placeholder="story-slug"
              />
              <div className="mt-2 text-xs text-neutral-500">
                {activeStoryId
                  ? "Saved stories keep the same slug so existing links do not break."
                  : "This auto-fills from the title until you edit it manually."}
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm text-neutral-300 mb-2">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg"
              />
            </div>
            <div className="mt-4">
              <div className="block text-sm text-neutral-300 mb-2">Status</div>
              <div className="flex flex-wrap gap-2">
                {STORY_STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatus(option.value)}
                    className={`rounded-full border px-3 py-2 text-sm transition ${
                      status === option.value
                        ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                        : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-neutral-500">
                Drafts stay out of public feeds and story pages. Publish when you want the story to go live.
              </p>
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <div className="text-sm font-semibold text-neutral-300 mb-3 uppercase">Story Image</div>
            <p className="text-sm text-neutral-500">
              Optional. Upload an image or embed an external image URL. Embedded images should include a visible credit.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900">
                {uploadingImage ? "Uploading..." : imageUrl ? "Replace image" : "Upload image"}
                <input
                  type="file"
                  accept={STORY_IMAGE_ACCEPT}
                  className="sr-only"
                  disabled={uploadingImage}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    await uploadImage(file);
                  }}
                />
              </label>

              {imageUrl ? (
                <button
                  type="button"
                  onClick={() => void removeImage()}
                  className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  Remove image
                </button>
              ) : null}
            </div>

            <div className="mt-4 rounded-2xl border border-neutral-700 bg-neutral-950/30 p-4">
              <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
                Embedded image URL
                <input
                  type="url"
                  value={embeddedImageUrlDraft}
                  onChange={(event) => setEmbeddedImageUrlDraft(event.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm font-normal normal-case tracking-normal text-neutral-100 outline-none focus:border-neutral-400"
                />
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void embedImageFromUrl()}
                  className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  Use embedded image
                </button>
                {imageUrl ? (
                  <span className="text-xs text-neutral-500">
                    Current image: {imagePath ? "uploaded" : "embedded"}
                  </span>
                ) : null}
              </div>
            </div>

            <p className="mt-3 text-xs text-neutral-500">
              JPG, PNG, WEBP, or GIF up to 5MB.
            </p>
            {imageUrl ? (
              <div className="mt-4 rounded-2xl border border-neutral-700 bg-neutral-950/30 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Image credit</div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="block text-sm text-neutral-300">
                    Credit text
                    <input
                      type="text"
                      value={imageCredit}
                      onChange={(event) => setImageCredit(event.target.value)}
                      placeholder="AP / Getty Images / Source name"
                      className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-400"
                    />
                  </label>
                  <label className="block text-sm text-neutral-300">
                    Credit link
                    <input
                      type="url"
                      value={imageCreditUrl}
                      onChange={(event) => setImageCreditUrl(event.target.value)}
                      placeholder="https://example.com/article"
                      className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-400"
                    />
                  </label>
                </div>
              </div>
            ) : null}
            {imageUrl ? (
              <div className="mt-4 rounded-2xl border border-neutral-700 bg-neutral-950/30 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Image placement</div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="inline-flex items-center gap-3 text-sm text-neutral-300">
                    <input
                      type="checkbox"
                      checked={imageShowOnHomepage}
                      onChange={(e) => setImageShowOnHomepage(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Show this image on the main page
                  </label>
                  <label className="inline-flex items-center gap-3 text-sm text-neutral-300">
                    <input
                      type="checkbox"
                      checked={imageShowOnBriefing}
                      onChange={(e) => setImageShowOnBriefing(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Show this image on The Briefing
                  </label>
                  <label className="inline-flex items-center gap-3 text-sm text-neutral-300">
                    <input
                      type="checkbox"
                      checked={imageShowOnStoryPage}
                      onChange={(e) => setImageShowOnStoryPage(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Show this image on story pages
                  </label>
                </div>
              </div>
            ) : null}
            {imageUrl ? (
              <div className="mt-4 rounded-2xl border border-neutral-700 bg-neutral-950/30 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Image Framing</div>
                <p className="mt-2 text-sm text-neutral-500">
                  Choose whether this image should crop to fill story cards or fit fully inside them. For cropped images,
                  click the preview to choose what part stays centered.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {([
                    { value: "cover" as StoryImageDisplay, label: "Crop to fill" },
                    { value: "contain" as StoryImageDisplay, label: "Fit whole image" },
                  ]).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setImageDisplay(option.value)}
                      className={`rounded-full border px-3 py-2 text-sm transition ${
                        imageDisplay === option.value
                          ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                          : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-neutral-300">
                    Horizontal focus: {Math.round(imageFocusX)}%
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={imageFocusX}
                      disabled={imageDisplay !== "cover"}
                      onChange={(e) => setImageFocusX(clampImageFocus(Number(e.target.value)))}
                      className="mt-2 w-full disabled:opacity-40"
                    />
                  </label>
                  <label className="text-sm text-neutral-300">
                    Vertical focus: {Math.round(imageFocusY)}%
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={imageFocusY}
                      disabled={imageDisplay !== "cover"}
                      onChange={(e) => setImageFocusY(clampImageFocus(Number(e.target.value)))}
                      className="mt-2 w-full disabled:opacity-40"
                    />
                  </label>
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setImageFocusX(DEFAULT_IMAGE_FOCUS);
                      setImageFocusY(DEFAULT_IMAGE_FOCUS);
                    }}
                    className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                  >
                    Reset framing
                  </button>
                </div>
              </div>
            ) : null}
            {savedImagePath && !imagePath ? (
              <p className="mt-2 text-xs text-amber-300">
                This saved image will be removed after you click Save story.
              </p>
            ) : null}

            {imageUrl ? (
              <button
                type="button"
                onClick={updateImageFocusFromClick}
                className="mt-5 block w-full overflow-hidden rounded-2xl bg-neutral-950 text-left"
                title={imageDisplay === "cover" ? "Click to set the crop focus point" : "Image is shown fully in fit mode"}
              >
                <div className={`relative ${imageDisplay === "contain" ? "flex min-h-[320px] items-center justify-center p-4" : "aspect-[16/10]"}`}>
                  {imageDisplay === "contain" ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageUrl}
                        alt="Story image preview"
                        className="block max-h-[420px] max-w-full rounded-xl object-contain"
                      />
                    </>
                  ) : (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageUrl}
                        alt="Story image preview"
                        className="absolute inset-0 h-full w-full object-cover"
                        style={{ objectPosition: imageObjectPosition({ image_focus_x: imageFocusX, image_focus_y: imageFocusY }) }}
                      />
                      <div
                        className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white/20 shadow-[0_0_0_999px_rgba(255,255,255,0)]"
                        style={{ left: `${imageFocusX}%`, top: `${imageFocusY}%` }}
                      />
                    </>
                  )}
                </div>
              </button>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-neutral-700 bg-neutral-950/40 p-6 text-sm text-neutral-500">
                No image selected.
              </div>
            )}
          </div>

          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <label className="inline-flex items-center gap-3 text-sm text-neutral-300">
              <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="h-4 w-4" />
              Urgent (Drudge-style emphasis)
            </label>
          </div>

          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <label className="inline-flex items-center gap-3 text-sm text-neutral-300">
              <input type="checkbox" checked={pinnedStory} onChange={(e) => setPinnedStory(e.target.checked)} className="h-4 w-4" />
              Pin this story to the top of Popular and Recent as a tracking story
            </label>
            <p className="mt-3 text-xs text-neutral-500">
              Pinned stories stay at the top of the built-in home tabs. Keyword tabs keep their normal ordering.
            </p>
          </div>

          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <div className="text-sm font-semibold text-neutral-300 mb-4 uppercase">The Briefing</div>
            <label className="inline-flex items-center gap-3 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={beaconInclude}
                onChange={(e) => setBeaconInclude(e.target.checked)}
                className="h-4 w-4"
              />
              Show this story in The Briefing
            </label>

            <div className="mt-4">
              <label className="block text-sm text-neutral-300 mb-2">Lead story style</label>
              <select
                value={beaconLeadStyle}
                onChange={(e) => setBeaconLeadStyle(e.target.value as BriefingLeadStyle)}
                disabled={!beaconInclude}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg disabled:opacity-50"
              >
                <option value="default">Default lead</option>
                <option value="alert">Huge story alert</option>
              </select>
            </div>

            <div className="mt-4">
              <label className="block text-sm text-neutral-300 mb-2">Briefing Headline</label>
              <input
                value={beaconHeadline}
                onChange={(e) => setBeaconHeadline(e.target.value)}
                disabled={!beaconInclude}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg disabled:opacity-50"
                placeholder="Optional alternate headline"
              />
            </div>

            <div className="mt-4">
              <label className="block text-sm text-neutral-300 mb-2">Briefing Summary</label>
              <textarea
                value={beaconSummary}
                onChange={(e) => setBeaconSummary(e.target.value)}
                disabled={!beaconInclude}
                rows={3}
                className="w-full resize-y px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg disabled:opacity-50"
                placeholder="Optional alternate summary. Leave blank to use the first story summary bullet."
              />
            </div>

            <p className="mt-3 text-xs text-neutral-500">
              Placement is now handled in the briefing manager. Leave the headline or summary blank to reuse the story title and first summary bullet.
            </p>
          </div>
              </EditorSection>

              <EditorSection
                id="editor-metadata"
                title="Metadata and Matching"
                description="Topics, entities, summary, and structured hints used around the site."
              >
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <div className="text-sm font-semibold text-neutral-300 mb-3 uppercase">Topics</div>
            <div className="flex flex-wrap gap-2">
              {TOPICS.map((topic) => {
                const selected = topics.map(normalize).includes(normalize(topic));
                return (
                  <button
                    key={topic}
                    onClick={() => toggleTopic(topic)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition ${
                      selected
                        ? "bg-neutral-100 text-neutral-900 border-neutral-100"
                        : "bg-neutral-900 text-neutral-300 border-neutral-700 hover:bg-neutral-800"
                    }`}
                  >
                    {topic}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-neutral-300 mb-3 uppercase">Story Knowledge</div>
                <p className="text-sm text-neutral-500">
                  Optional structured hints for matching. Add one item per line or separate values with commas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void autofillStoryKnowledge()}
                disabled={pendingKnowledgeAutofill}
                className="rounded-full border border-[#8f7740]/60 px-4 py-2 text-xs font-semibold text-[#e3cca0] transition hover:bg-[#8f7740]/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingKnowledgeAutofill ? "Filling..." : "Auto-fill from draft"}
              </button>
            </div>
            {remainingAutofillSuggestions && remainingAutofillSuggestionCount > 0 ? (
              <div id="story-autofill-suggestions" className="mt-5 scroll-mt-24 rounded-2xl border border-[#8f7740]/40 bg-[#0c1821] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#e3cca0]">
                      Suggested tags
                    </div>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">
                      Review what auto-fill found from the draft, sources, entities, and wink NLP.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={applyAllAutofillSuggestions}
                      className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-900 transition hover:bg-white"
                    >
                      Add all
                    </button>
                    <button
                      type="button"
                      onClick={() => setAutofillSuggestions(null)}
                      className="rounded-full border border-[#28445d] px-3 py-1.5 text-xs font-semibold text-neutral-300 transition hover:border-[#8f7740]/70"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="mt-4 space-y-4">
                  {remainingAutofillSuggestions.selectedEntities.length > 0 ? (
                    <div>
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                        Suggested entities
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {remainingAutofillSuggestions.selectedEntities.map((entity) => (
                          <span
                            key={`suggested-entity-${entity}`}
                            className="inline-flex items-center gap-2 rounded-full border border-[#28445d] bg-[#06131e] px-3 py-1.5 text-xs text-neutral-200"
                          >
                            {entity}
                            <button
                              type="button"
                              onClick={() => applySelectedEntitySuggestion(entity)}
                              className="font-semibold text-[#e3cca0]"
                            >
                              Add
                            </button>
                            <button
                              type="button"
                              onClick={() => dismissAutofillSuggestion("selectedEntity", entity)}
                              className="text-neutral-500 hover:text-neutral-200"
                            >
                              x
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {remainingAutofillSuggestions.primaryEntities.length > 0 ? (
                    <div>
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                        Suggested primary entities
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {remainingAutofillSuggestions.primaryEntities.map((entity) => (
                          <span
                            key={`suggested-primary-entity-${entity}`}
                            className="inline-flex items-center gap-2 rounded-full border border-[#8f7740]/50 bg-[#06131e] px-3 py-1.5 text-xs text-neutral-200"
                          >
                            {entity}
                            <button
                              type="button"
                              onClick={() => applyPrimaryEntitySuggestion(entity)}
                              className="font-semibold text-[#e3cca0]"
                            >
                              Add primary
                            </button>
                            <button
                              type="button"
                              onClick={() => dismissAutofillSuggestion("primaryEntity", entity)}
                              className="text-neutral-500 hover:text-neutral-200"
                            >
                              x
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {remainingAutofillSuggestions.topics.length > 0 ? (
                    <div>
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                        Suggested topics
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {remainingAutofillSuggestions.topics.map((topic) => (
                          <span
                            key={`suggested-topic-${topic}`}
                            className="inline-flex items-center gap-2 rounded-full border border-[#28445d] bg-[#06131e] px-3 py-1.5 text-xs text-neutral-200"
                          >
                            {topic}
                            <button
                              type="button"
                              onClick={() => applyTopicSuggestion(topic)}
                              className="font-semibold text-[#e3cca0]"
                            >
                              Add
                            </button>
                            <button
                              type="button"
                              onClick={() => dismissAutofillSuggestion("topic", topic)}
                              className="text-neutral-500 hover:text-neutral-200"
                            >
                              x
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {(Object.keys(AUTOFILL_KNOWLEDGE_LABELS) as StoryKnowledgeField[]).map((field) => {
                    const values = remainingAutofillSuggestions.knowledge[field];
                    if (values.length === 0) return null;

                    return (
                      <div key={`suggested-${field}`}>
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                          Suggested {AUTOFILL_KNOWLEDGE_LABELS[field]}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {values.map((value) => (
                            <span
                              key={`suggested-${field}-${value}`}
                              className="inline-flex items-center gap-2 rounded-full border border-[#28445d] bg-[#06131e] px-3 py-1.5 text-xs text-neutral-200"
                            >
                              {value}
                              <button
                                type="button"
                                onClick={() => appendStructuredSuggestion(field, value)}
                                className="font-semibold text-[#e3cca0]"
                              >
                                Add
                              </button>
                              <button
                                type="button"
                                onClick={() => dismissKnowledgeSuggestion(field, value)}
                                className="text-neutral-500 hover:text-neutral-200"
                              >
                                x
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Locations</div>
                <textarea
                  value={locationsDraft}
                  onChange={(e) => setLocationsDraft(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                  placeholder={"California\nLos Angeles\nAnaheim"}
                />
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">People</div>
                <textarea
                  value={peopleDraft}
                  onChange={(e) => setPeopleDraft(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                  placeholder={"Kamala Harris\nEric Swalwell"}
                />
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Organizations</div>
                <textarea
                  value={organizationsDraft}
                  onChange={(e) => setOrganizationsDraft(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                  placeholder={"Federal Reserve\nOpenAI"}
                />
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Industries</div>
                <textarea
                  value={industriesDraft}
                  onChange={(e) => setIndustriesDraft(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                  placeholder={"Artificial intelligence\nBanking"}
                />
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Sports Teams</div>
                <textarea
                  value={sportsTeamsDraft}
                  onChange={(e) => setSportsTeamsDraft(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                  placeholder={"Los Angeles Angels\nGolden State Warriors"}
                />
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Offices</div>
                <textarea
                  value={officesDraft}
                  onChange={(e) => setOfficesDraft(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                  placeholder={"Vice President\nGovernor"}
                />
              </div>
            </div>
            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Facets</div>
              <textarea
                value={facetsDraft}
                onChange={(e) => setFacetsDraft(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                placeholder={"Female politician\nCalifornia sports\nAI company"}
              />
            </div>
            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Related Interest Signals</div>
              <textarea
                value={relatedInterestSignalsDraft}
                onChange={(e) => setRelatedInterestSignalsDraft(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                placeholder={"Ohio State\nMichigan\nGeorgia"}
              />
              <p className="mt-2 text-xs leading-5 text-neutral-500">
                Hidden from readers. Use this for weaker Following matches when the story matters to an audience without naming them as a primary entity.
              </p>
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <div className="text-sm font-semibold text-neutral-300 mb-3 uppercase">Related Stories</div>
            <p className="text-sm text-neutral-500">
              Optional. These manual links will show first in the story-page related rail before the automatic matches.
            </p>

            <input
              value={relatedStorySearch}
              onChange={(e) => setRelatedStorySearch(e.target.value)}
              placeholder="Search stories to mark as related"
              className="mt-4 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
            />

            <div className="mt-4 flex flex-wrap gap-2">
              {selectedRelatedStories.map((story) => (
                <button
                  key={story.id}
                  type="button"
                  onClick={() => toggleRelatedStory(story.id)}
                  className="rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
                  title="Remove related story"
                >
                  x {story.title}
                </button>
              ))}
              {selectedRelatedStories.length === 0 ? (
                <span className="text-xs text-neutral-500">No manual related stories selected.</span>
              ) : null}
            </div>

            <div className="mt-4 space-y-2">
              {relatedStoryOptions.map((story) => (
                <button
                  key={story.id}
                  type="button"
                  onClick={() => toggleRelatedStory(story.id)}
                  className="flex w-full items-start justify-between gap-4 rounded-xl border border-neutral-700 bg-neutral-950/40 px-4 py-3 text-left transition hover:border-neutral-500"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-neutral-100">{story.title}</div>
                    <div className="mt-1 text-xs text-neutral-500">{story.id}</div>
                  </div>
                  <div className="shrink-0 rounded-full border border-neutral-700 px-3 py-1 text-[11px] text-neutral-300">
                    Add
                  </div>
                </button>
              ))}
              {relatedStoryOptions.length === 0 && relatedStorySearch.trim() ? (
                <div className="text-xs text-neutral-500">No matching stories found.</div>
              ) : null}
            </div>
          </div>

          {/* Entities */}
<div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
  <div className="text-sm font-semibold text-neutral-300 mb-3 uppercase">
    Entities
  </div>

  {/* Search + create */}
  <div className="flex gap-2 mb-4">
    <input
      value={entitySearch}
      onChange={(e) => setEntitySearch(e.target.value)}
      placeholder='Search entities (e.g. "Middle East")'
      className="flex-1 px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg text-sm"
    />
    <button
      onClick={async () => {
        const name = entitySearch.trim();
        if (!name) return;

        // If it exists, just select it
        const existing = entities.find((e) => e.name.toLowerCase() === name.toLowerCase());
        const entity = existing ?? (await createEntity(name));
        if (!entity) return;

        // select it
        setSelectedEntities((prev) => (prev.includes(entity.name) ? prev : [...prev, entity.name]));
        setEntitySearch("");
      }}
      className="px-4 py-2 bg-neutral-100 text-neutral-900 rounded-lg text-sm"
      title="Create if missing, otherwise select"
    >
      Add
    </button>
  </div>

  <div className="text-xs text-neutral-500 mb-3">
    Tip: Type a new entity name and hit <span className="text-neutral-300">Add</span> to create it instantly.
  </div>

  {/* List entities (filtered) */}
  <div className="flex flex-wrap gap-2">
    {entities
      .filter((e) =>
        !entitySearch.trim()
          ? true
          : e.name.toLowerCase().includes(entitySearch.trim().toLowerCase())
      )
      .slice(0, 50)
      .map((e) => {
        const selected = selectedEntities.includes(e.name);
        const primary = primaryEntities.includes(e.name);

        return (
          <div
            key={e.name}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${
              selected ? "border-neutral-500 bg-neutral-950/30" : "border-neutral-700 bg-neutral-900"
            }`}
          >
            <button
              onClick={() => toggleEntity(e.name)}
              className={`text-xs transition ${selected ? "text-neutral-100" : "text-neutral-300"}`}
              title={selected ? "Remove entity" : "Add entity"}
            >
              {selected ? "✓ " : "+ "}
              {e.name}
            </button>

            <button
              onClick={() => togglePrimary(e.name)}
              className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
                primary
                  ? "bg-neutral-100 text-neutral-900 border-neutral-100"
                  : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
              }`}
              title="Toggle primary"
            >
              Primary
            </button>
          </div>
        );
      })}
  </div>

  {/* Alias editor for selected entities */}
  {selectedEntities.length > 0 && (
    <div className="mt-6 space-y-4">
      <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">
        Aliases (for selected entities)
      </div>

      {selectedEntities.map((name) => {
        const entity = entities.find((e) => e.name === name);
        const aliases = entity?.aliases ?? [];
        const draft = aliasDraft[name] ?? "";

        return (
          <div key={name} className="border border-neutral-700 rounded-xl p-4 bg-neutral-950/20">
            <div className="flex items-center justify-between">
              <div className="text-sm text-neutral-200 font-medium">{name}</div>
              <div className="text-xs text-neutral-500">{aliases.length} aliases</div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {aliases.map((a) => (
                <button
                  key={a}
                  onClick={async () => {
                    const next = aliases.filter((x) => x !== a);
                    await saveAliases(name, next);
                  }}
                  className="text-xs px-2 py-1 rounded-full border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                  title="Remove alias"
                >
                  ✕ {a}
                </button>
              ))}
              {aliases.length === 0 && (
                <span className="text-xs text-neutral-500">No aliases yet.</span>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setAliasDraft((prev) => ({ ...prev, [name]: e.target.value }))}
                placeholder='Add alias (e.g. "Dubai")'
                className="flex-1 px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg text-sm"
                onKeyDown={async (e) => {
                  if (e.key !== "Enter") return;
                  const alias = draft.trim();
                  if (!alias) return;
                  await saveAliases(name, [...aliases, alias]);
                  setAliasDraft((prev) => ({ ...prev, [name]: "" }));
                }}
              />
              <button
                onClick={async () => {
                  const alias = draft.trim();
                  if (!alias) return;
                  await saveAliases(name, [...aliases, alias]);
                  setAliasDraft((prev) => ({ ...prev, [name]: "" }));
                }}
                className="px-3 py-2 rounded-lg bg-neutral-100 text-neutral-900 text-sm"
              >
                Add alias
              </button>
            </div>
          </div>
        );
      })}
    </div>
  )}
</div>

          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <div className="text-sm font-semibold text-neutral-300 mb-3 uppercase">Summary</div>
            <div className="space-y-3">
              {summary.map((line, index) => (
                <input
                  key={index}
                  value={line}
                  onChange={(e) => updateSummary(index, e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg"
                  placeholder={`Summary line ${index + 1}`}
                />
              ))}
            </div>
          </div>
              </EditorSection>

              <EditorSection
                id="editor-sources"
                title="Sources"
                description="Source links, titles, and lean settings."
              >
                <SourceEditorSection
                  addSourceFromUrl={(url, preferredIndex) => void addSourceFromUrl(url, preferredIndex)}
                  addSourceRow={addSourceRow}
                  moveSourceRow={moveSourceRow}
                  removeSourceRow={removeSourceRow}
                  setSourceLeanMode={setSourceLeanMode}
                  setSourceUrlDraft={setSourceUrlDraft}
                  sourcePreviewLoading={sourcePreviewLoading}
                  sourceUrlDraft={sourceUrlDraft}
                  sources={sources}
                  updateSource={updateSource}
                />
              </EditorSection>

              <EditorSection
                id="editor-revisions"
                title="Revision History"
                description="Restore an earlier saved version if you need to roll something back."
              >
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-neutral-300 uppercase">Revision History</div>
                <p className="mt-2 text-sm text-neutral-500">
                  Every save and delete writes a snapshot. Restore a previous version directly into the editor when you need to back out a change.
                </p>
              </div>
              <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                {activeStoryId ? activeStoryId : "Save first"}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {!activeStoryId ? (
                <div className="text-sm text-neutral-500">Save the story once to start storing revision history.</div>
              ) : loadingRevisions ? (
                <div className="text-sm text-neutral-500">Loading revisions...</div>
              ) : revisions.length === 0 ? (
                <div className="text-sm text-neutral-500">No revisions yet.</div>
              ) : (
                revisions.map((revision) => (
                  <div key={revision.id} className={`flex flex-wrap items-center justify-between gap-4 ${ADMIN_INSET} p-4`}>
                    <div>
                      <div className="text-sm text-neutral-100">{revision.story.title}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-neutral-500">
                        {revision.action} • {formatUpdatedAt(revision.createdAt)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void restoreRevision(revision.id)}
                      disabled={busyRevisionId === revision.id}
                      className="rounded-full border border-[#8f7740]/60 px-4 py-2 text-xs font-semibold text-[#e3cca0] transition hover:bg-[#8f7740]/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busyRevisionId === revision.id ? "Restoring..." : "Restore"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
              </EditorSection>

              <div id="editor-publish-mobile" className={`${ADMIN_PANEL} scroll-mt-24 p-5`}>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button onClick={() => void onSave()} className="flex-1 rounded-xl bg-neutral-100 py-3 font-semibold text-neutral-900">
                    {saveButtonLabel(status)}
                  </button>

                  {pendingDelete ? (
                    <div className="flex-1 rounded-2xl border border-red-500/50 bg-red-950/20 p-5">
                      <div className="text-sm font-semibold text-red-100">Delete this story?</div>
                      <p className="mt-2 text-sm leading-6 text-red-100/80">
                        This will permanently remove <span className="font-semibold">{storyId}</span>.
                      </p>
                      <div className="mt-4 flex gap-3">
                        <button
                          type="button"
                          onClick={() => setPendingDelete(false)}
                          className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-200 hover:bg-neutral-800"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDeleteConfirmed()}
                          className="rounded-full border border-red-400 px-4 py-2 text-xs font-semibold text-red-200 hover:bg-red-950/30"
                        >
                          Confirm delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        if (!activeStoryId) {
                          showNotice("Save the story before trying to delete it.", "error");
                          return;
                        }
                        setPendingDelete(true);
                      }}
                      className="rounded-xl border border-red-400 px-6 py-3 font-semibold text-red-300 hover:bg-red-950/30"
                    >
                      Delete story
                    </button>
                  )}
                </div>
              </div>
              </div>
            </section>
          </div>
          <aside id="editor-publish" className="hidden scroll-mt-24 xl:sticky xl:top-8 xl:col-start-4 xl:block xl:w-72 xl:self-start xl:pt-1">
            <div className="max-h-[calc(100vh-5rem)] overflow-y-auto rounded-[22px] border border-[#183149]/45 bg-[#06131d]/64 p-5 shadow-[0_10px_22px_rgba(0,0,0,0.1)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d7c08d]">Publish</div>
              <div className="mt-4 space-y-4 text-sm">
                <button
                  type="button"
                  onClick={() => void onSave()}
                  className="w-full rounded-xl bg-neutral-100 px-4 py-3 font-semibold text-neutral-900 transition hover:bg-white"
                >
                  {saveButtonLabel(status)}
                </button>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">Story slug</div>
                  <div className="mt-1 break-words text-neutral-300">{storyId}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">Status</div>
                  <div
                    className={`mt-1 font-semibold ${
                      status === "published"
                        ? "text-emerald-300"
                        : status === "archived"
                          ? "text-neutral-400"
                          : "text-amber-300"
                    }`}
                  >
                    {status}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">Changes</div>
                  <div className={`mt-1 font-semibold ${isDirty ? "text-amber-300" : "text-neutral-400"}`}>
                    {isDirty ? "Unsaved" : "Saved"}
                  </div>
                </div>
                <div className="space-y-2 border-t border-[#183149]/65 pt-4">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">Readiness</div>
                  <div className="space-y-1.5">
                    {readinessChecklist.map((item) => (
                      <div key={item.label} className="flex items-start justify-between gap-3 text-xs">
                        <span className={item.done ? "text-neutral-300" : "text-amber-300"}>
                          {item.done ? "OK" : "Fix"} {item.label}
                        </span>
                        {item.detail ? <span className="shrink-0 text-neutral-500">{item.detail}</span> : null}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2 border-t border-[#183149]/65 pt-4">
                  <label className="flex items-start gap-3 text-sm text-neutral-300">
                    <input
                      type="checkbox"
                      checked={urgent}
                      onChange={(event) => setUrgent(event.target.checked)}
                      className="mt-1 h-4 w-4"
                    />
                    <span>Urgent emphasis</span>
                  </label>
                  <label className="flex items-start gap-3 text-sm text-neutral-300">
                    <input
                      type="checkbox"
                      checked={pinnedStory}
                      onChange={(event) => setPinnedStory(event.target.checked)}
                      className="mt-1 h-4 w-4"
                    />
                    <span>Pin as tracking story</span>
                  </label>
                  <label className="flex items-start gap-3 text-sm text-neutral-300">
                    <input
                      type="checkbox"
                      checked={beaconInclude}
                      onChange={(event) => setBeaconInclude(event.target.checked)}
                      className="mt-1 h-4 w-4"
                    />
                    <span>Show in The Briefing</span>
                  </label>
                  {beaconInclude ? (
                    <div className="space-y-3 rounded-xl border border-[#214765]/70 bg-[#020b14] p-3">
                      <label className="block">
                        <span className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">Lead style</span>
                        <select
                          value={beaconLeadStyle}
                          onChange={(event) => setBeaconLeadStyle(event.target.value as BriefingLeadStyle)}
                          className="mt-2 w-full rounded-lg border border-[#214765]/70 bg-[#06131e] px-3 py-2 text-sm text-neutral-200 outline-none focus:border-[#8f7740]/70"
                        >
                          <option value="default">Default lead</option>
                          <option value="alert">Huge story alert</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">Briefing headline</span>
                        <input
                          value={beaconHeadline}
                          onChange={(event) => setBeaconHeadline(event.target.value)}
                          className="mt-2 w-full rounded-lg border border-[#214765]/70 bg-[#06131e] px-3 py-2 text-sm text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-[#8f7740]/70"
                          placeholder="Optional alternate headline"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">Briefing summary</span>
                        <textarea
                          value={beaconSummary}
                          onChange={(event) => setBeaconSummary(event.target.value)}
                          rows={3}
                          className="mt-2 w-full resize-y rounded-lg border border-[#214765]/70 bg-[#06131e] px-3 py-2 text-sm leading-6 text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-[#8f7740]/70"
                          placeholder="Optional alternate summary"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
                <div className="space-y-2 border-t border-[#183149]/65 pt-4">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">Image</div>
                  <label className="block cursor-pointer rounded-lg border border-[#28445d] px-4 py-2 text-center text-xs font-semibold text-neutral-200 transition hover:border-[#8f7740]/70 hover:text-white">
                    {uploadingImage ? "Uploading..." : imageUrl ? "Replace image" : "Upload image"}
                    <input
                      type="file"
                      accept={STORY_IMAGE_ACCEPT}
                      className="sr-only"
                      disabled={uploadingImage}
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (!file) return;
                        await uploadImage(file);
                      }}
                    />
                  </label>
                  <div className="space-y-2 rounded-xl border border-[#214765]/70 bg-[#020b14] p-3">
                    <input
                      type="url"
                      value={embeddedImageUrlDraft}
                      onChange={(event) => setEmbeddedImageUrlDraft(event.target.value)}
                      placeholder="Embed image URL"
                      className="w-full rounded-lg border border-[#28445d] bg-[#07131e] px-3 py-2 text-xs text-neutral-100 outline-none focus:border-[#8f7740]/70"
                    />
                    <button
                      type="button"
                      onClick={() => void embedImageFromUrl()}
                      className="w-full rounded-lg border border-[#28445d] px-3 py-2 text-xs font-semibold text-neutral-300 transition hover:border-[#8f7740]/70"
                    >
                      Use embedded image
                    </button>
                  </div>
                  {imageUrl ? (
                    <>
                      <div className="space-y-2 rounded-xl border border-[#214765]/70 bg-[#020b14] p-3">
                        <input
                          type="text"
                          value={imageCredit}
                          onChange={(event) => setImageCredit(event.target.value)}
                          placeholder="Image credit"
                          className="w-full rounded-lg border border-[#28445d] bg-[#07131e] px-3 py-2 text-xs text-neutral-100 outline-none focus:border-[#8f7740]/70"
                        />
                        <input
                          type="url"
                          value={imageCreditUrl}
                          onChange={(event) => setImageCreditUrl(event.target.value)}
                          placeholder="Credit link"
                          className="w-full rounded-lg border border-[#28445d] bg-[#07131e] px-3 py-2 text-xs text-neutral-100 outline-none focus:border-[#8f7740]/70"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { value: "contain" as StoryImageDisplay, label: "Fit whole" },
                          { value: "cover" as StoryImageDisplay, label: "Crop" },
                        ]).map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setImageDisplay(option.value)}
                            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                              imageDisplay === option.value
                                ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                                : "border-[#28445d] text-neutral-300 hover:border-[#8f7740]/70"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <div className="grid gap-2">
                        <label className="flex items-start gap-3 text-xs text-neutral-300">
                          <input
                            type="checkbox"
                            checked={imageShowOnHomepage}
                            onChange={(event) => setImageShowOnHomepage(event.target.checked)}
                            className="mt-0.5 h-4 w-4"
                          />
                          <span>Homepage</span>
                        </label>
                        <label className="flex items-start gap-3 text-xs text-neutral-300">
                          <input
                            type="checkbox"
                            checked={imageShowOnBriefing}
                            onChange={(event) => setImageShowOnBriefing(event.target.checked)}
                            className="mt-0.5 h-4 w-4"
                          />
                          <span>Briefing</span>
                        </label>
                        <label className="flex items-start gap-3 text-xs text-neutral-300">
                          <input
                            type="checkbox"
                            checked={imageShowOnStoryPage}
                            onChange={(event) => setImageShowOnStoryPage(event.target.checked)}
                            className="mt-0.5 h-4 w-4"
                          />
                          <span>Story page</span>
                        </label>
                      </div>
                      {imageDisplay === "cover" ? (
                        <div className="space-y-3 rounded-xl border border-[#214765]/70 bg-[#020b14] p-3">
                          <label className="block text-xs text-neutral-300">
                            Horizontal focus: {Math.round(imageFocusX)}%
                            <input
                              type="range"
                              min="0"
                              max="100"
                              step="1"
                              value={imageFocusX}
                              onChange={(event) => setImageFocusX(clampImageFocus(Number(event.target.value)))}
                              className="mt-2 w-full"
                            />
                          </label>
                          <label className="block text-xs text-neutral-300">
                            Vertical focus: {Math.round(imageFocusY)}%
                            <input
                              type="range"
                              min="0"
                              max="100"
                              step="1"
                              value={imageFocusY}
                              onChange={(event) => setImageFocusY(clampImageFocus(Number(event.target.value)))}
                              className="mt-2 w-full"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setImageFocusX(DEFAULT_IMAGE_FOCUS);
                              setImageFocusY(DEFAULT_IMAGE_FOCUS);
                            }}
                            className="rounded-lg border border-[#28445d] px-3 py-2 text-xs font-semibold text-neutral-300 transition hover:border-[#8f7740]/70"
                          >
                            Reset crop focus
                          </button>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void removeImage()}
                        className="w-full rounded-lg border border-[#5b2a2a] px-3 py-2 text-xs font-semibold text-[#f0c8c8] transition hover:bg-[#190b0c]"
                      >
                        Remove image
                      </button>
                      {savedImagePath && !imagePath ? (
                        <p className="text-xs leading-5 text-amber-300">This saved image will be removed after you save.</p>
                      ) : null}
                    </>
                  ) : null}
                </div>
                <div className="space-y-3 border-t border-[#183149]/65 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">Related Stories</div>
                    <span className="text-[11px] text-neutral-500">{selectedRelatedStories.length}</span>
                  </div>
                  <input
                    value={relatedStorySearch}
                    onChange={(event) => setRelatedStorySearch(event.target.value)}
                    placeholder="Search stories"
                    className="w-full rounded-lg border border-[#214765]/70 bg-[#020b14] px-3 py-2 text-sm text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-[#8f7740]/70"
                  />
                  <div className="space-y-2">
                    {selectedRelatedStories.length > 0 ? (
                      selectedRelatedStories.map((story) => (
                        <button
                          key={`rail-related-selected-${story.id}`}
                          type="button"
                          onClick={() => toggleRelatedStory(story.id)}
                          className="block w-full rounded-lg border border-[#8f7740]/50 bg-[#8f7740]/10 px-3 py-2 text-left text-xs text-neutral-200 transition hover:border-[#b89a55]"
                          title="Remove related story"
                        >
                          <span className="line-clamp-2">{story.title}</span>
                        </button>
                      ))
                    ) : (
                      <div className="text-xs leading-5 text-neutral-500">No manual related stories selected.</div>
                    )}
                  </div>
                  <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                    {relatedStoryOptions.slice(0, 8).map((story) => (
                      <button
                        key={`rail-related-option-${story.id}`}
                        type="button"
                        onClick={() => toggleRelatedStory(story.id)}
                        className="block w-full rounded-lg border border-[#214765]/70 bg-[#020b14] px-3 py-2 text-left text-xs text-neutral-300 transition hover:border-[#8f7740]/70 hover:text-neutral-100"
                      >
                        <span className="line-clamp-2">{story.title}</span>
                        <span className="mt-1 block truncate text-[11px] text-neutral-500">{story.id}</span>
                      </button>
                    ))}
                    {relatedStoryOptions.length === 0 && relatedStorySearch.trim() ? (
                      <div className="text-xs text-neutral-500">No matching stories found.</div>
                    ) : null}
                  </div>
                </div>
                <Link
                  href={`/story/${storyId}`}
                  target="_blank"
                  className="block rounded-full border border-[#28445d] px-4 py-2 text-center text-xs font-semibold text-neutral-200 transition hover:border-[#8f7740]/70 hover:text-white"
                >
                  Public URL
                </Link>
                {pendingDelete ? (
                  <div className="rounded-xl border border-red-500/50 bg-red-950/20 p-3">
                    <div className="text-sm font-semibold text-red-100">Delete this story?</div>
                    <p className="mt-2 text-xs leading-5 text-red-100/80">This permanently removes {storyId}.</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPendingDelete(false)}
                        className="rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDeleteConfirmed()}
                        className="rounded-lg border border-red-400 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-950/30"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (!activeStoryId) {
                        showNotice("Save the story before trying to delete it.", "error");
                        return;
                      }
                      setPendingDelete(true);
                    }}
                    className="w-full rounded-full border border-red-400 px-4 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-950/30"
                  >
                    Delete story
                  </button>
                )}
              </div>
            </div>
          </aside>
          <div className="hidden xl:block" />
        </div>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#183149]/80 bg-[#020b14]/96 px-3 py-3 shadow-[0_-18px_44px_rgba(0,0,0,0.42)] backdrop-blur xl:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <a
            href="#editor-stories"
            className="rounded-xl border border-[#28445d] px-3 py-3 text-center text-xs font-semibold text-neutral-200"
          >
            Stories
          </a>
          <a
            href="#editor-publish-mobile"
            className="rounded-xl border border-[#28445d] px-3 py-3 text-center text-xs font-semibold text-neutral-200"
          >
            Publish
          </a>
          <button
            type="button"
            onClick={() => void onSave()}
            className="min-h-11 flex-1 rounded-xl bg-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-900"
          >
            {saveButtonLabel(status)}
          </button>
        </div>
      </div>
    </main>
  );
}
