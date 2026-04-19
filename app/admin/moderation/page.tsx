"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatUpdatedAt } from "@/app/lib/dates";
import { ADMIN_INSET, ADMIN_PANEL } from "@/app/lib/surfaces";

type ReportStatus = "dismissed" | "open" | "reviewed";
type StaffRole = "admin" | "moderator" | "reader";
type CommentModerationStatus = "active" | "banned" | "muted";

type AdminCommentReport = {
  comment: {
    body: string | null;
    createdAt: string;
    deleted: boolean;
    editedAt: string | null;
    id: string;
    staffRole: StaffRole;
    storyId: string;
    userId: string;
    username: string;
  };
  commentAuthor: {
    commentCount: number;
    moderationStatus: CommentModerationStatus;
    moderationUntil: string | null;
    openReportCount: number;
    staffRole: StaffRole;
    userId: string;
    username: string;
  };
  createdAt: string;
  details: string | null;
  id: string;
  reason: string;
  reporterUsername: string;
  status: ReportStatus;
  storyTitle: string | null;
};

type AdminCommentsResponse = {
  error?: string;
  reports?: AdminCommentReport[];
};

const STATUS_OPTIONS: Array<{ label: string; value: ReportStatus }> = [
  { label: "Open", value: "open" },
  { label: "Reviewed", value: "reviewed" },
  { label: "Dismissed", value: "dismissed" },
];

function staffBadge(role: StaffRole) {
  if (role === "admin") return "admin";
  if (role === "moderator") return "mod";
  return null;
}

function moderationLabel(status: CommentModerationStatus, until: string | null) {
  if (status === "active") return "Active";
  if (status === "banned") return "Comment banned";
  if (!until) return "Muted";
  return `Muted until ${formatUpdatedAt(until)}`;
}

export default function AdminModerationPage() {
  const [reports, setReports] = useState<AdminCommentReport[]>([]);
  const [statusFilter, setStatusFilter] = useState<ReportStatus>("open");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const loadReports = useCallback(async (nextStatus = statusFilter, nextSearch = search) => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      params.set("status", nextStatus);
      if (nextSearch.trim()) {
        params.set("search", nextSearch.trim());
      }

      const response = await fetch(`/api/admin/comments?${params.toString()}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as AdminCommentsResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "We couldn't load the moderation queue.");
      }

      setReports(Array.isArray(data.reports) ? data.reports : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "We couldn't load the moderation queue.");
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    void loadReports(statusFilter, search);
  }, [loadReports, search, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchDraft.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);

  async function updateReport(reportId: string, nextStatus: Exclude<ReportStatus, "open">) {
    setBusyAction(`report:${reportId}:${nextStatus}`);
    setError("");
    setStatus("");

    try {
      const response = await fetch("/api/admin/comments", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ reportId, status: nextStatus }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "We couldn't update that report.");
      }

      setStatus(nextStatus === "dismissed" ? "Report dismissed." : "Report marked reviewed.");
      await loadReports(statusFilter, search);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "We couldn't update that report.");
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteComment(commentId: string) {
    if (typeof window !== "undefined" && !window.confirm("Permanently delete this comment and all of its replies?")) {
      return;
    }

    setBusyAction(`delete:${commentId}`);
    setError("");
    setStatus("");

    try {
      const response = await fetch(`/api/comments/${encodeURIComponent(commentId)}?mode=purge`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "We couldn't remove that comment.");
      }

      setStatus("Comment thread deleted.");
      await loadReports(statusFilter, search);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "We couldn't remove that comment.");
    } finally {
      setBusyAction(null);
    }
  }

  async function updateUserModeration(
    targetUserId: string,
    nextStatus: CommentModerationStatus,
    options?: { note?: string | null; until?: string | null }
  ) {
    const busyKey = `user:${targetUserId}:${nextStatus}:${options?.until ?? "none"}`;
    setBusyAction(busyKey);
    setError("");
    setStatus("");

    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          commentModerationNote: nextStatus === "active" ? null : options?.note ?? "Set from moderation queue",
          commentModerationStatus: nextStatus,
          commentModerationUntil: nextStatus === "active" ? null : options?.until ?? null,
          targetUserId,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "We couldn't update that user.");
      }

      setStatus(
        nextStatus === "active"
          ? "Comment restriction cleared."
          : nextStatus === "banned"
            ? "User comment-banned."
            : "User muted."
      );
      await loadReports(statusFilter, search);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "We couldn't update that user.");
    } finally {
      setBusyAction(null);
    }
  }

  function muteUntil(days: number) {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  return (
    <main className="min-h-screen bg-neutral-900 p-8 text-neutral-100">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.22em] text-neutral-500">Admin</div>
            <h1 className="mt-2 text-3xl font-bold">Moderation Console</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
              Search reports by user, story, or comment id, then handle the thread and the account from one place.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/admin" className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white">
              Control center
            </Link>
            <Link href="/admin/editor" className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white">
              Story editor
            </Link>
            <Link href="/admin/briefing" className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white">
              Briefing manager
            </Link>
          </div>
        </div>

        <div className={`mt-8 ${ADMIN_PANEL} p-6`}>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatusFilter(option.value)}
                  className={`rounded-full border px-4 py-2 text-sm transition ${
                    statusFilter === option.value
                      ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                      : "border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="w-full xl:max-w-sm">
              <input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search by username, story, reason, or comment id"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {status ? <div className="text-sm text-emerald-400">{status}</div> : null}
            {error ? <div className="text-sm text-red-300">{error}</div> : null}
            <button
              type="button"
              onClick={() => void loadReports(statusFilter, search)}
              disabled={loading || Boolean(busyAction)}
              className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>

          <div className="mt-4 text-sm text-neutral-500">
            {loading ? "Loading reports..." : `${reports.length} report${reports.length === 1 ? "" : "s"} in ${statusFilter}.`}
          </div>

          {reports.length === 0 && !loading ? (
            <div className="mt-6 rounded-2xl border border-dashed border-neutral-700 px-6 py-10 text-center text-sm text-neutral-500">
              No reports in this queue.
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {reports.map((report) => {
                const badge = staffBadge(report.commentAuthor.staffRole);
                return (
                  <article key={report.id} className={`${ADMIN_PANEL} p-6`}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                          Reported {formatUpdatedAt(report.createdAt)}
                        </div>
                        <h2 className="mt-2 text-xl font-semibold text-neutral-100">{report.reason}</h2>
                        <div className="mt-2 text-sm text-neutral-400">
                          Reporter: <span className="text-neutral-200">{report.reporterUsername}</span>
                        </div>
                        {report.storyTitle ? (
                          <div className="mt-1 text-sm text-neutral-400">
                            Story:{" "}
                            <Link href={`/story/${report.comment.storyId}`} className="text-neutral-200 transition hover:text-white">
                              {report.storyTitle}
                            </Link>
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-full border border-[#163754] px-3 py-1 text-xs uppercase tracking-[0.16em] text-neutral-400">
                        {report.status}
                      </div>
                    </div>

                    {report.details ? (
                      <div className="mt-4 rounded-2xl border border-[#163754] bg-[#020b14] p-4 text-sm leading-7 text-neutral-300">
                        {report.details}
                      </div>
                    ) : null}

                    <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                      <div className={`${ADMIN_INSET} p-5`}>
                        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                          <span>Comment by {report.comment.username}</span>
                          {badge ? (
                            <span className="rounded-full border border-[#8f7740]/35 px-2 py-0.5 text-[10px] tracking-[0.2em] text-[#d7c08d]">
                              {badge}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-neutral-500">{formatUpdatedAt(report.comment.createdAt)}</div>
                        {report.comment.editedAt ? <div className="mt-1 text-xs uppercase tracking-[0.16em] text-neutral-500">Edited</div> : null}
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-300">
                          {report.comment.deleted ? "Removed by admin." : report.comment.body ?? ""}
                        </p>
                      </div>

                      <div className={`${ADMIN_INSET} p-5`}>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Account context</div>
                        <div className="mt-3 text-sm text-neutral-200">{report.commentAuthor.username}</div>
                        <div className="mt-2 text-sm text-neutral-400">
                          {report.commentAuthor.commentCount} comment{report.commentAuthor.commentCount === 1 ? "" : "s"} total
                        </div>
                        <div className="mt-1 text-sm text-neutral-400">
                          {report.commentAuthor.openReportCount} open report{report.commentAuthor.openReportCount === 1 ? "" : "s"} tied to this user
                        </div>
                        <div className="mt-1 text-sm text-neutral-400">
                          {moderationLabel(report.commentAuthor.moderationStatus, report.commentAuthor.moderationUntil)}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void updateUserModeration(report.commentAuthor.userId, "muted", { until: muteUntil(1) })}
                            disabled={Boolean(busyAction)}
                            className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Mute 24h
                          </button>
                          <button
                            type="button"
                            onClick={() => void updateUserModeration(report.commentAuthor.userId, "muted", { until: muteUntil(7) })}
                            disabled={Boolean(busyAction)}
                            className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Mute 7d
                          </button>
                          <button
                            type="button"
                            onClick={() => void updateUserModeration(report.commentAuthor.userId, "banned")}
                            disabled={Boolean(busyAction)}
                            className="rounded-full border border-red-400/50 px-3 py-2 text-xs text-red-200 transition hover:bg-red-950/30 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Ban comments
                          </button>
                          <button
                            type="button"
                            onClick={() => void updateUserModeration(report.commentAuthor.userId, "active")}
                            disabled={Boolean(busyAction)}
                            className="rounded-full border border-[#8f7740]/60 px-3 py-2 text-xs text-[#e3cca0] transition hover:bg-[#8f7740]/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Clear restriction
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <Link
                        href={`/story/${report.comment.storyId}?comment=${encodeURIComponent(report.comment.id)}#comment-${report.comment.id}`}
                        className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
                      >
                        Open story
                      </Link>
                      {!report.comment.deleted ? (
                        <button
                          type="button"
                          onClick={() => void deleteComment(report.comment.id)}
                          disabled={busyAction === `delete:${report.comment.id}`}
                          className="rounded-full border border-red-400/50 px-4 py-2 text-sm text-red-200 transition hover:bg-red-950/30 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {busyAction === `delete:${report.comment.id}` ? "Deleting..." : "Delete thread"}
                        </button>
                      ) : null}
                      {report.status === "open" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void updateReport(report.id, "reviewed")}
                            disabled={busyAction === `report:${report.id}:reviewed`}
                            className="rounded-full border border-[#8f7740]/60 px-4 py-2 text-sm text-[#e3cca0] transition hover:bg-[#8f7740]/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {busyAction === `report:${report.id}:reviewed` ? "Saving..." : "Mark reviewed"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void updateReport(report.id, "dismissed")}
                            disabled={busyAction === `report:${report.id}:dismissed`}
                            className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {busyAction === `report:${report.id}:dismissed` ? "Saving..." : "Dismiss"}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
