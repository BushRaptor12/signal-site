"use client";

import { useState } from "react";
import { emitAccountFollowsUpdated } from "@/app/lib/account-events";
import { formatUpdatedAt } from "@/app/lib/dates";
import type { FollowedInterest } from "@/app/lib/account.server";

type AccountInterestsManagerProps = {
  initialInterests: FollowedInterest[];
};

export default function AccountInterestsManager({ initialInterests }: AccountInterestsManagerProps) {
  const [interests, setInterests] = useState(initialInterests);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingCreate, setPendingCreate] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

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
        interest?: FollowedInterest;
      };

      if (!response.ok || !data.interest) {
        throw new Error(data.error ?? "We couldn't save that interest.");
      }

      setInterests((current) => {
        const existingIndex = current.findIndex((interest) => interest.id === data.interest!.id);
        if (existingIndex >= 0) {
          return current.map((interest) => (interest.id === data.interest!.id ? data.interest! : interest));
        }

        return [data.interest!, ...current];
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
      emitAccountFollowsUpdated();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "We couldn't remove that interest.");
    } finally {
      setPendingDeleteId(null);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-[#13314b] bg-[#04111b] p-5">
      <div className="text-sm leading-7 text-neutral-300">
        Add subjects you want to follow here. The Following feed will pull in stories related to your interests.
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add an interest like Music"
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
        <div className="mt-5 flex flex-wrap gap-3">
          {interests.map((interest) => (
            <button
              key={interest.id}
              type="button"
              onClick={() => void removeInterest(interest.id)}
              disabled={pendingDeleteId === interest.id}
              className="rounded-full border border-[#163754] bg-[#020b14] px-4 py-2 text-left text-sm text-neutral-200 transition hover:border-[#8f7740]/50 hover:bg-[#07101a] disabled:cursor-not-allowed disabled:opacity-60"
              title="Remove interest"
            >
              <span className="font-medium">{interest.query}</span>
              <span className="ml-2 text-xs uppercase tracking-[0.18em] text-neutral-500">
                {pendingDeleteId === interest.id ? "Removing" : formatUpdatedAt(interest.updatedAt)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
