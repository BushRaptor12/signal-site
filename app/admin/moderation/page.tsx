"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/app/admin/admin-auth";
import { formatUpdatedAt } from "@/app/lib/dates";

type ReportStatus = "dismissed" | "open" | "reviewed";

type AdminCommentReport = {
  comment: {
    body: string | null;
    createdAt: string;
    deleted: boolean;
    editedAt: string | null;
    id: string;
    storyId: string;
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

export default function AdminModerationPage() {
  const { adminToken, clearToken } = useAdminAuth();
  const [reports, setReports] = useState<AdminCommentReport[]>([]);
  const [statusFilter, setStatusFilter] = useState<ReportStatus>("open");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const loadReports = useCallback(
    async (token = adminToken, nextStatus = statusFilter) => {
      if (!token) return;

      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/admin/comments?status=${encodeURIComponent(nextStatus)}`, {
          cache: "no-store",
          headers: { "x-admin-token": token },
        });
        const data = (await response.json().catch(() => ({}))) as AdminCommentsResponse;

        if (response.status === 401) {
          clearToken();
          return;
        }

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
    },
    [adminToken, clearToken, statusFilter]
  );

  useEffect(() => {
    if (!adminToken) return;
    void loadReports(adminToken, statusFilter);
  }, [adminToken, loadReports, statusFilter]);

  async function updateReport(reportId: string, nextStatus: Exclude<ReportStatus, "open">) {
    setBusyAction(`report:${reportId}:${nextStatus}`);
    setError("");
    setStatus("");

    try {
      const response = await fetch("/api/admin/comments", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-admin-token": adminToken,
        },
        body: JSON.stringify({ reportId, status: nextStatus }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (response.status === 401) {
        clearToken();
        return;
      }

      if (!response.ok) {
        throw new Error(data.error ?? "We couldn't update that report.");
      }

      setStatus(nextStatus === "dismissed" ? "Report dismissed." : "Report marked reviewed.");
      await loadReports(adminToken, statusFilter);
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
      await loadReports(adminToken, statusFilter);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "We couldn't remove that comment.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-900 p-8 text-neutral-100">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.22em] text-neutral-500">Admin</div>
            <h1 className="mt-2 text-3xl font-bold">Comment Moderation</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
              Review reports, remove comments when necessary, and keep a visible trail of what was handled.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={clearToken} className="text-xs text-neutral-400 hover:text-neutral-200">
              Lock admin
            </button>
            <Link
              href="/admin/editor"
              className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
            >
              Story editor
            </Link>
            <Link
              href="/admin/briefing"
              className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
            >
              Briefing manager
            </Link>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-neutral-700 bg-neutral-900 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
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

            <div className="flex flex-wrap items-center gap-3">
              {status ? <div className="text-sm text-emerald-400">{status}</div> : null}
              {error ? <div className="text-sm text-red-300">{error}</div> : null}
              <button
                type="button"
                onClick={() => void loadReports(adminToken, statusFilter)}
                disabled={!adminToken || loading || Boolean(busyAction)}
                className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Loading..." : "Refresh"}
              </button>
            </div>
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
              {reports.map((report) => (
                <article key={report.id} className="rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
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

                  <div className="mt-5 rounded-2xl border border-[#13314b] bg-[#04111b] p-5">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                      Comment by {report.comment.username}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">{formatUpdatedAt(report.comment.createdAt)}</div>
                    {report.comment.editedAt ? <div className="mt-1 text-xs uppercase tracking-[0.16em] text-neutral-500">Edited</div> : null}
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-300">
                      {report.comment.deleted ? "Removed by admin." : report.comment.body ?? ""}
                    </p>
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
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
