"use client";

import Link from "next/link";
import { useState } from "react";
import { emitAccountFollowsUpdated } from "@/app/lib/account-events";
import { formatStoryDate, formatUpdatedAt } from "@/app/lib/dates";
import type { FollowedInterest, FollowedInterestWithMatches } from "@/app/lib/account.server";

type AccountInterestsManagerProps = {
  initialInterests: FollowedInterestWithMatches[];
};

function toInterestGroup(interest: FollowedInterest | FollowedInterestWithMatches) {
  const candidate = interest as Partial<FollowedInterestWithMatches>;
  return {
    ...interest,
    hiddenCount: typeof candidate.hiddenCount === "number" ? candidate.hiddenCount : 0,
    matches: Array.isArray(candidate.matches) ? candidate.matches : [],
  } satisfies FollowedInterestWithMatches;
}

export default function AccountInterestsManager({ initialInterests }: AccountInterestsManagerProps) {
  const [interests, setInterests] = useState(initialInterests);
  const [expandedInterestIds, setExpandedInterestIds] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingCreate, setPendingCreate] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingHideKey, setPendingHideKey] = useState<string | null>(null);

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
      setDraft("");
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

  return (
    <div className="mt-6 rounded-2xl border border-[#13314b] bg-[#04111b] p-5">
      <div className="text-sm leading-7 text-neutral-300">
        Add subjects you want to follow here. Review what each interest is pulling in and hide bad matches without deleting the interest.
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add an interest like California sports"
          className="min-w-0 flex-1 rounded-xl border border-[#163754] bg-[#020b14] px-4 py-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]/70"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void addInterest();
            }
          }}
        />
        <button
          type="button"
          onClick={() => void addInterest()}
          disabled={pendingCreate}
          className="inline-flex justify-center rounded-xl border border-[#8f7740]/70 bg-[#07101a] px-5 py-3 text-sm font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pendingCreate ? "Saving..." : "Add interest"}
        </button>
      </div>

      {error ? <div className="mt-3 text-sm text-[#f0b7b7]">{error}</div> : null}

      {interests.length === 0 ? (
        <div className="mt-5 text-sm leading-7 text-neutral-400">
          No interests followed yet. Add a short interest to start shaping your Following feed.
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {interests.map((interest) => (
            <section key={interest.id} className="rounded-2xl border border-[#163754] bg-[#020b14] p-5">
              {(() => {
                const isExpanded = expandedInterestIds.includes(interest.id);

                return (
                  <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h4 className="text-lg font-semibold text-neutral-100">{interest.query}</h4>
                    <div className="rounded-full border border-[#163754] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                      {interest.matches.length} live matches
                    </div>
                    {interest.hiddenCount > 0 ? (
                      <div className="rounded-full border border-[#163754] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                        {interest.hiddenCount} hidden
                      </div>
                    ) : null}
                  </div>
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
                    {isExpanded ? "Collapse" : `Expand ${interest.matches.length}`}
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
                <div className="mt-4 rounded-2xl border border-[#13314b] bg-[#04111b] p-4 text-sm leading-7 text-neutral-400">
                  No live matches yet for this interest. Try a more specific phrase or wait for newer stories.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {interest.matches.map((match) => {
                    const matchKey = `${interest.id}:${match.story.id}`;
                    const pendingHide = pendingHideKey === matchKey;

                    return (
                      <div
                        key={match.story.id}
                        className="rounded-2xl border border-[#13314b] bg-[#04111b] p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/story/${match.story.id}?from=account`}
                              className="text-base font-semibold text-neutral-100 transition hover:text-[#d7c08d]"
                            >
                              {match.story.title}
                            </Link>
                            {match.story.summary[0] ? (
                              <p className="mt-2 text-sm leading-6 text-neutral-400">{match.story.summary[0]}</p>
                            ) : null}
                            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.16em] text-neutral-500">
                              <span>{formatStoryDate(match.story.date)}</span>
                              {match.reasons.length > 0 ? <span>{match.reasons.join(" · ")}</span> : null}
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
                  </>
                );
              })()}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
