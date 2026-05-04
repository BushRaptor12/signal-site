"use client";

import Link from "next/link";
import { useState } from "react";

type ManualArchiveResponse = {
  archiveKey?: string;
  error?: string;
  ok?: boolean;
  storyCount?: number;
};

export default function ManualArchiveButton() {
  const [saving, setSaving] = useState(false);
  const [archiveKey, setArchiveKey] = useState("");
  const [error, setError] = useState("");

  async function archiveNow() {
    setSaving(true);
    setError("");
    setArchiveKey("");

    try {
      const response = await fetch("/api/admin/briefing/archive", {
        method: "POST",
      });
      const json = (await response.json().catch(() => ({}))) as ManualArchiveResponse;

      if (!response.ok) {
        throw new Error(json.error ?? response.statusText);
      }

      setArchiveKey(json.archiveKey ?? "");
    } catch (archiveError: unknown) {
      setError(archiveError instanceof Error ? archiveError.message : String(archiveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 text-left sm:items-end sm:text-right">
      <button
        type="button"
        onClick={() => void archiveNow()}
        disabled={saving}
        className="rounded-full border border-[#35556f]/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-400 transition hover:border-[#8f7740]/70 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Archiving..." : "Archive now"}
      </button>
      {archiveKey ? (
        <Link
          href={`/briefing/archive/${archiveKey}`}
          className="text-xs text-[#d7c08d] underline decoration-[#8f7740]/50 underline-offset-4 hover:text-[#ead8b6]"
        >
          View saved snapshot
        </Link>
      ) : null}
      {error ? <div className="max-w-[16rem] text-xs leading-5 text-red-300">{error}</div> : null}
    </div>
  );
}
