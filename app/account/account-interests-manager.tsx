"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { emitAccountFollowsUpdated } from "@/app/lib/account-events";
import { formatStoryDate, formatUpdatedAt } from "@/app/lib/dates";
import type { FollowedInterest, FollowedInterestWithMatches } from "@/app/lib/account.server";

type AccountInterestsManagerProps = {
  initialInterests: FollowedInterestWithMatches[];
  storyLinkFrom?: string;
};

type KeywordDraftState = {
  excludeKeywords: string;
  matchKeywords: string;
};

type InterestSuggestion = {
  hint: string | null;
  kind: "entity" | "topic";
  value: string;
};

function toInterestGroup(interest: FollowedInterest | FollowedInterestWithMatches) {
  const candidate = interest as Partial<FollowedInterestWithMatches>;
  return {
    ...interest,
    hiddenCount: typeof candidate.hiddenCount === "number" ? candidate.hiddenCount : 0,
    hiddenStoryIds: Array.isArray(candidate.hiddenStoryIds) ? candidate.hiddenStoryIds : [],
    matches: Array.isArray(candidate.matches) ? candidate.matches : [],
  } satisfies FollowedInterestWithMatches;
}

function toKeywordDraft(values: string[]) {
  return values.join("\n");
}

function parseKeywordDraft(value: string) {
  return [...new Set(value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean))];
}

export default function AccountInterestsManager({
  initialInterests,
  storyLinkFrom = "account-interests",
}: AccountInterestsManagerProps) {
  const [interests, setInterests] = useState(initialInterests);
  const [expandedInterestIds, setExpandedInterestIds] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [keywordDrafts, setKeywordDrafts] = useState<Record<string, KeywordDraftState>>({});
  const [pendingCreate, setPendingCreate] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingHideKey, setPendingHideKey] = useState<string | null>(null);
  const [pendingUpdateId, setPendingUpdateId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<InterestSuggestion[]>([]);
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  useEffect(() => {
    const trimmedDraft = draft.trim();
    if (!suggestionsVisible || !trimmedDraft) {
      setSuggestions([]);
      setLoadingSuggestions(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const response = await fetch(`/api/account/interests/suggestions?q=${encodeURIComponent(trimmedDraft)}`, {
          cache: "no-store",
        });
        const data = (await response.json().catch(() => ({}))) as {
          suggestions?: InterestSuggestion[];
        };

        if (!cancelled) {
          setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
        }
      } catch {
        if (!cancelled) {
          setSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingSuggestions(false);
        }
      }
    }, 140);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [draft, suggestionsVisible]);

  async function addInterest() {
    const trimmedDraft = draft.trim();
    if (!trimmedDraft || pendingCreate) return;

    setPendingCreate(true);
    setError(null);

    try {
      const response = await fetch("/api/account/interests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: trimmedDraft }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        interest?: FollowedInterest | FollowedInterestWithMatches;
      };

      if (!response.ok || !data.interest) {
        throw new Error(data.error ?? "We couldn't save that interest.");
      }

      const nextInterest = toInterestGroup(data.interest);
      setInterests((current) => {
        const existingIndex = current.findIndex((interest) => interest.id === nextInterest.id);
        if (existingIndex >= 0) {
          return current.map((interest) => (interest.id === nextInterest.id ? nextInterest : interest));
        }

        return [nextInterest, ...current];
      });
      setKeywordDrafts((current) => ({
        ...current,
        [nextInterest.id]: {
          excludeKeywords: toKeywordDraft(nextInterest.excludeKeywords),
          matchKeywords: toKeywordDraft(nextInterest.matchKeywords),
        },
      }));
      setExpandedInterestIds((current) => [...new Set([nextInterest.id, ...current])]);
      setDraft("");
      setSuggestions([]);
      setSuggestionsVisible(false);
      emitAccountFollowsUpdated();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "We couldn't save that interest.");
    } finally {
      setPendingCreate(false);
    }
  }

  async function removeInterest(id: string) {
    if (pendingDeleteId) return;

    setPendingDeleteId(id);
    setError(null);

    try {
      const response = await fetch(`/api/account/interests/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "We couldn't remove that interest.");
      }

      setInterests((current) => current.filter((interest) => interest.id !== id));
      setExpandedInterestIds((current) => current.filter((interestId) => interestId !== id));
      setKeywordDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      emitAccountFollowsUpdated();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "We couldn't remove that interest.");
    } finally {
      setPendingDeleteId(null);
    }
  }

  async function hideMatch(interestId: string, storyId: string) {
    const pendingKey = `${interestId}:${storyId}`;
    if (pendingHideKey) return;

    setPendingHideKey(pendingKey);
    setError(null);

    try {
      const response = await fetch(
        `/api/account/interests/${encodeURIComponent(interestId)}/stories/${encodeURIComponent(storyId)}`,
        {
          method: "POST",
        }
      );
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "We couldn't hide that story for this interest.");
      }

      setInterests((current) =>
        current.map((interest) =>
          interest.id === interestId
            ? {
                ...interest,
                hiddenCount: interest.hiddenCount + 1,
                matches: interest.matches.filter((match) => match.story.id !== storyId),
              }
            : interest
        )
      );
      emitAccountFollowsUpdated();
    } catch (hideError) {
      setError(hideError instanceof Error ? hideError.message : "We couldn't hide that story for this interest.");
    } finally {
      setPendingHideKey(null);
    }
  }

  function toggleInterestExpansion(id: string) {
    setExpandedInterestIds((current) =>
      current.includes(id) ? current.filter((interestId) => interestId !== id) : [...current, id]
    );
  }

  function draftStateForInterest(interest: FollowedInterestWithMatches) {
    return (
      keywordDrafts[interest.id] ?? {
        excludeKeywords: toKeywordDraft(interest.excludeKeywords),
        matchKeywords: toKeywordDraft(interest.matchKeywords),
      }
    );
  }

  async function saveInterestSettings(interest: FollowedInterestWithMatches) {
    if (pendingUpdateId) return;

    const draftState = draftStateForInterest(interest);
    setPendingUpdateId(interest.id);
    setError(null);

    try {
      const response = await fetch(`/api/account/interests/${encodeURIComponent(interest.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          excludeKeywords: parseKeywordDraft(draftState.excludeKeywords),
          matchKeywords: parseKeywordDraft(draftState.matchKeywords),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        interest?: FollowedInterest | FollowedInterestWithMatches;
      };

      if (!response.ok || !data.interest) {
        throw new Error(data.error ?? "We couldn't update that interest.");
      }

      const nextInterest = toInterestGroup(data.interest);
      setInterests((current) => current.map((item) => (item.id === nextInterest.id ? nextInterest : item)));
      setKeywordDrafts((current) => ({
        ...current,
        [nextInterest.id]: {
          excludeKeywords: toKeywordDraft(nextInterest.excludeKeywords),
          matchKeywords: toKeywordDraft(nextInterest.matchKeywords),
        },
      }));
      emitAccountFollowsUpdated();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "We couldn't update that interest.");
    } finally {
      setPendingUpdateId(null);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-[#13314b] bg-[#04111b] p-5">
      <div className="text-sm leading-7 text-neutral-300">
        Add subjects you want to follow here. Expand one when you want to review matched stories or hide bad matches.
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={() => setSuggestionsVisible(true)}
            onBlur={() => {
              window.setTimeout(() => setSuggestionsVisible(false), 120);
            }}
            placeholder="Add an interest like California sports"
            className="w-full rounded-xl border border-[#163754] bg-[#020b14] px-4 py-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]/70"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void addInterest();
              }
            }}
          />

          {suggestionsVisible && (loadingSuggestions || suggestions.length > 0 || draft.trim()) ? (
            <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 rounded-2xl border border-[#163754] bg-[#04111b] p-2 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
              {loadingSuggestions ? (
                <div className="px-3 py-2 text-sm text-neutral-400">Loading suggestions...</div>
              ) : suggestions.length > 0 ? (
                <div className="space-y-1">
                  {suggestions.map((suggestion) => (
                    <button
                      key={`${suggestion.kind}:${suggestion.value}`}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setDraft(suggestion.value);
                        setSuggestionsVisible(false);
                      }}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition hover:bg-[#081521]"
                    >
                      <span className="text-sm text-neutral-100">{suggestion.value}</span>
                      <span className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                        {suggestion.hint ?? suggestion.kind}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-2 text-sm text-neutral-500">No existing entity or topic suggestions. You can still add free text.</div>
              )}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void addInterest()}
          disabled={pendingCreate}
          className="inline-flex justify-center rounded-xl border border-[#8f7740]/70 bg-[#07101a] px-5 py-3 text-sm font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pendingCreate ? "Saving..." : "Add interest"}
        </button>
      </div>

      <div className="mt-3 text-xs uppercase tracking-[0.16em] text-neutral-500">
        Autocomplete suggests existing topics and entities, but you can still follow any free-text interest.
      </div>

      {error ? <div className="mt-3 text-sm text-[#f0b7b7]">{error}</div> : null}

      {interests.length === 0 ? (
        <div className="mt-5 text-sm leading-7 text-neutral-400">
          No interests followed yet. Add a short interest to start shaping your Following feed.
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {interests.map((interest) => {
            const isExpanded = expandedInterestIds.includes(interest.id);
            const keywordDraft = draftStateForInterest(interest);
            const pendingUpdate = pendingUpdateId === interest.id;

            return (
              <section key={interest.id} className="rounded-2xl border border-[#163754] bg-[#020b14] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h4 className="text-lg font-semibold text-neutral-100">{interest.query}</h4>
                    <div className="mt-2 text-xs uppercase tracking-[0.18em] text-neutral-500">
                      {pendingDeleteId === interest.id ? "Removing" : `Updated ${formatUpdatedAt(interest.updatedAt)}`}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleInterestExpansion(interest.id)}
                      className="inline-flex rounded-full border border-[#163754] bg-[#07101a] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-300 transition hover:border-[#8f7740]/50 hover:text-neutral-100"
                    >
                      {isExpanded ? "Collapse" : "Expand"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeInterest(interest.id)}
                      disabled={pendingDeleteId === interest.id}
                      className="inline-flex rounded-full border border-[#163754] bg-[#07101a] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-300 transition hover:border-[#8f7740]/50 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {!isExpanded ? null : interest.matches.length === 0 ? (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-2xl border border-[#13314b] bg-[#04111b] p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Advanced</div>
                      <p className="mt-2 text-sm leading-6 text-neutral-400">
                        Use include keywords to force a stronger link for obscure interests. Use exclude keywords to filter false positives.
                      </p>

                      <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        <label className="block">
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Must match keywords</div>
                          <textarea
                            value={keywordDraft.matchKeywords}
                            onChange={(event) =>
                              setKeywordDrafts((current) => ({
                                ...current,
                                [interest.id]: {
                                  ...draftStateForInterest(interest),
                                  matchKeywords: event.target.value,
                                },
                              }))
                            }
                            rows={5}
                            placeholder="artist&#10;album&#10;concert"
                            className="mt-2 w-full rounded-xl border border-[#163754] bg-[#020b14] px-4 py-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]/70"
                          />
                        </label>

                        <label className="block">
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Exclude keywords</div>
                          <textarea
                            value={keywordDraft.excludeKeywords}
                            onChange={(event) =>
                              setKeywordDrafts((current) => ({
                                ...current,
                                [interest.id]: {
                                  ...draftStateForInterest(interest),
                                  excludeKeywords: event.target.value,
                                },
                              }))
                            }
                            rows={5}
                            placeholder="school choir&#10;principal"
                            className="mt-2 w-full rounded-xl border border-[#163754] bg-[#020b14] px-4 py-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]/70"
                          />
                        </label>
                      </div>

                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={() => void saveInterestSettings(interest)}
                          disabled={pendingUpdate}
                          className="inline-flex rounded-full border border-[#8f7740]/70 bg-[#07101a] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {pendingUpdate ? "Saving" : "Save settings"}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#13314b] bg-[#04111b] p-4 text-sm leading-7 text-neutral-400">
                      No live matches yet for this interest. Try a more specific phrase, add must-match keywords, or wait for newer stories.
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-2xl border border-[#13314b] bg-[#04111b] p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Advanced</div>
                      <p className="mt-2 text-sm leading-6 text-neutral-400">
                        Use include keywords to force a stronger link for obscure interests. Use exclude keywords to filter false positives.
                      </p>

                      <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        <label className="block">
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Must match keywords</div>
                          <textarea
                            value={keywordDraft.matchKeywords}
                            onChange={(event) =>
                              setKeywordDrafts((current) => ({
                                ...current,
                                [interest.id]: {
                                  ...draftStateForInterest(interest),
                                  matchKeywords: event.target.value,
                                },
                              }))
                            }
                            rows={5}
                            placeholder="artist&#10;album&#10;concert"
                            className="mt-2 w-full rounded-xl border border-[#163754] bg-[#020b14] px-4 py-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]/70"
                          />
                        </label>

                        <label className="block">
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Exclude keywords</div>
                          <textarea
                            value={keywordDraft.excludeKeywords}
                            onChange={(event) =>
                              setKeywordDrafts((current) => ({
                                ...current,
                                [interest.id]: {
                                  ...draftStateForInterest(interest),
                                  excludeKeywords: event.target.value,
                                },
                              }))
                            }
                            rows={5}
                            placeholder="school choir&#10;principal"
                            className="mt-2 w-full rounded-xl border border-[#163754] bg-[#020b14] px-4 py-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]/70"
                          />
                        </label>
                      </div>

                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={() => void saveInterestSettings(interest)}
                          disabled={pendingUpdate}
                          className="inline-flex rounded-full border border-[#8f7740]/70 bg-[#07101a] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {pendingUpdate ? "Saving" : "Save settings"}
                        </button>
                      </div>
                    </div>

                    {interest.hiddenCount > 0 ? (
                      <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">
                        Hidden matches: {interest.hiddenCount}
                      </div>
                    ) : null}

                    {interest.matches.map((match) => {
                      const matchKey = `${interest.id}:${match.story.id}`;
                      const pendingHide = pendingHideKey === matchKey;

                      return (
                        <div key={match.story.id} className="rounded-2xl border border-[#13314b] bg-[#04111b] p-4">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <Link
                                href={`/story/${match.story.id}?from=${encodeURIComponent(storyLinkFrom)}`}
                                className="text-base font-semibold text-neutral-100 transition hover:text-[#d7c08d]"
                              >
                                {match.story.title}
                              </Link>
                              {match.story.summary[0] ? (
                                <p className="mt-2 text-sm leading-6 text-neutral-400">{match.story.summary[0]}</p>
                              ) : null}
                              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.16em] text-neutral-500">
                                <span>{formatStoryDate(match.story.date)}</span>
                                {match.reasons.length > 0 ? <span>{match.reasons.join(" | ")}</span> : null}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => void hideMatch(interest.id, match.story.id)}
                              disabled={pendingHide}
                              className="inline-flex rounded-full border border-[#163754] bg-[#020b14] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-300 transition hover:border-[#8f7740]/50 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {pendingHide ? "Hiding" : "Hide match"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
