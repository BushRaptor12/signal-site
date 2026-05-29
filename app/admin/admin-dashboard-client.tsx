"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUpdatedAt } from "@/app/lib/dates";
import { ADMIN_INSET, ADMIN_INSET_INTERACTIVE, ADMIN_PANEL } from "@/app/lib/surfaces";
import type { AdminDashboardData, AdminInterestSignal, AdminManagedUser } from "@/app/lib/admin-tools";
import type { CommunitySettings } from "@/app/lib/community-settings";
import type { StaffRole } from "@/app/lib/account.server";

type AdminDashboardClientProps = {
  initialData: AdminDashboardData;
  initialUsers: AdminManagedUser[];
};

type ToggleKey =
  | "allowNewComments"
  | "allowCommentReplies"
  | "allowCommentVoting"
  | "allowCommentRealtime"
  | "commentsReadOnly";

const TOGGLE_OPTIONS: Array<{ description: string; key: ToggleKey; label: string }> = [
  { description: "Allow new top-level comments.", key: "allowNewComments", label: "New comments" },
  { description: "Allow replies under existing comments.", key: "allowCommentReplies", label: "Replies" },
  { description: "Allow thumbs up and thumbs down.", key: "allowCommentVoting", label: "Voting" },
  { description: "Allow live browser subscriptions on story pages.", key: "allowCommentRealtime", label: "Realtime" },
  { description: "Freeze comments into read-only mode.", key: "commentsReadOnly", label: "Read only" },
];

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className={`${ADMIN_INSET} p-5`}>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-neutral-100">{value}</div>
    </div>
  );
}

export default function AdminDashboardClient({ initialData, initialUsers }: AdminDashboardClientProps) {
  const [settings, setSettings] = useState<CommunitySettings>(initialData.communitySettings);
  const [interestSignals, setInterestSignals] = useState<AdminInterestSignal[]>(initialData.recentInterestSignals);
  const [users, setUsers] = useState<AdminManagedUser[]>(initialUsers);
  const [userSearchDraft, setUserSearchDraft] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setUserSearch(userSearchDraft.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [userSearchDraft]);

  useEffect(() => {
    let cancelled = false;

    async function loadUsers() {
      setBusyAction((current) => current ?? "user-search");
      try {
        const params = new URLSearchParams();
        if (userSearch) params.set("search", userSearch);
        const response = await fetch(`/api/admin/users?${params.toString()}`, { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as { error?: string; users?: AdminManagedUser[] };
        if (!response.ok) {
          throw new Error(data.error ?? "We couldn't load users.");
        }
        if (!cancelled) {
          setUsers(Array.isArray(data.users) ? data.users : []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "We couldn't load users.");
        }
      } finally {
        if (!cancelled) {
          setBusyAction((current) => (current === "user-search" ? null : current));
        }
      }
    }

    void loadUsers();
    return () => {
      cancelled = true;
    };
  }, [userSearch]);

  async function updateSetting(key: ToggleKey, value: boolean) {
    const previous = settings;
    const nextSettings = { ...settings, [key]: value };
    setSettings(nextSettings);
    setBusyAction(`setting:${String(key)}`);
    setError("");
    setStatus("");

    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(nextSettings),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; settings?: CommunitySettings };
      if (!response.ok || !data.settings) {
        throw new Error(data.error ?? "We couldn't update site settings.");
      }

      setSettings(data.settings);
      setStatus("Community settings updated.");
    } catch (updateError) {
      setSettings(previous);
      setError(updateError instanceof Error ? updateError.message : "We couldn't update site settings.");
    } finally {
      setBusyAction(null);
    }
  }

  async function updateStaffRole(userId: string, staffRole: StaffRole) {
    setBusyAction(`role:${userId}`);
    setError("");
    setStatus("");

    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ staffRole, targetUserId: userId }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; user?: AdminManagedUser };
      if (!response.ok || !data.user) {
        throw new Error(data.error ?? "We couldn't update that user.");
      }

      setUsers((current) => current.map((user) => (user.userId === userId ? data.user! : user)));
      setStatus(`Updated ${data.user.username}.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "We couldn't update that user.");
    } finally {
      setBusyAction(null);
    }
  }

  async function addInterestAsEntity(signal: AdminInterestSignal) {
    const actionKey = `entity:${signal.normalizedQuery}`;
    setBusyAction(actionKey);
    setError("");
    setStatus("");

    try {
      const response = await fetch("/api/entities", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          aliases: [],
          name: signal.query,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        entity?: { name?: string };
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "We couldn't create that entity.");
      }

      const entityName = data.entity?.name?.trim() || signal.query;
      setInterestSignals((current) =>
        current.map((item) =>
          item.normalizedQuery === signal.normalizedQuery
            ? {
                ...item,
                entityMatchName: entityName,
                entityMatchType: "entity",
                query: entityName,
              }
            : item
        )
      );
      setStatus(`Added ${entityName} to entities.`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "We couldn't create that entity.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-900 p-8 text-neutral-100">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.22em] text-neutral-500">Admin</div>
            <h1 className="mt-2 text-3xl font-bold">Control Center</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-400">
              Launch view for community controls, staff access, story QA, recent activity, and the main editorial tools.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/admin/editor" className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white">
              Story editor
            </Link>
            <Link href="/admin/entities" className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white">
              Entities
            </Link>
            <Link href="/admin/moderation" className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white">
              Moderation
            </Link>
            <Link href="/admin/analytics" className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white">
              Analytics
            </Link>
            <Link href="/admin/briefing" className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white">
              Briefing manager
            </Link>
            <Link href="/admin/coverage" className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white">
              Coverage editor
            </Link>
            <Link href="/admin/discovery" className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white">
              RSS discovery
            </Link>
            <Link href="#reader-interests" className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white">
              Reader interests
            </Link>
            <Link href="/notifications" className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white">
              Notifications
            </Link>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          {status ? <div className="text-sm text-emerald-400">{status}</div> : null}
          {error ? <div className="text-sm text-red-300">{error}</div> : null}
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Open Reports" value={initialData.summary.openReports} />
          <SummaryCard label="Unread Alerts" value={initialData.summary.unreadAdminNotifications} />
          <SummaryCard label="Draft Stories" value={initialData.summary.drafts} />
          <SummaryCard label="Comments Today" value={initialData.summary.commentsToday} />
          <SummaryCard label="Published Stories" value={initialData.summary.publishedStories} />
          <SummaryCard label="Archived Stories" value={initialData.summary.archivedStories} />
          <SummaryCard label="Briefing Stories" value={initialData.summary.briefingStories} />
          <SummaryCard label="New Signups (7d)" value={initialData.summary.signups7d} />
        </section>

        <div className="mt-8 grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
          <section className={`${ADMIN_PANEL} p-8`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Community</div>
                <h2 className="mt-2 text-2xl font-semibold text-neutral-100">Emergency Controls</h2>
              </div>
              <div className="text-xs text-neutral-500">
                Updated {settings.updatedAt ? formatUpdatedAt(settings.updatedAt) : "just now"}
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {TOGGLE_OPTIONS.map((toggle) => {
                const enabled = settings[toggle.key];
                const actionKey = `setting:${toggle.key}`;
                return (
                  <div key={toggle.key} className={`flex items-center justify-between gap-4 ${ADMIN_INSET} px-4 py-4`}>
                    <div>
                      <div className="text-sm font-medium text-neutral-100">{toggle.label}</div>
                      <div className="mt-1 text-sm text-neutral-400">{toggle.description}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void updateSetting(toggle.key, !enabled)}
                      disabled={busyAction === actionKey}
                      className={`rounded-full border px-4 py-2 text-sm transition ${
                        enabled
                          ? "border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/10"
                          : "border-red-400/40 text-red-200 hover:bg-red-500/10"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {busyAction === actionKey ? "Saving..." : enabled ? "On" : "Off"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <section className={`${ADMIN_PANEL} p-8`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Operations</div>
                <h2 className="mt-2 text-2xl font-semibold text-neutral-100">System Health</h2>
              </div>
              <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">
                {initialData.operationalHealth.latestRssScan?.status ?? "No scan"}
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className={`${ADMIN_INSET} p-4`}>
                <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">Embeddings pending</div>
                <div className="mt-2 text-2xl font-semibold text-neutral-100">{initialData.operationalHealth.embeddingPending}</div>
              </div>
              <div className={`${ADMIN_INSET} p-4`}>
                <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">Embedding errors</div>
                <div className="mt-2 text-2xl font-semibold text-neutral-100">{initialData.operationalHealth.embeddingErrors}</div>
              </div>
              <div className={`${ADMIN_INSET} p-4`}>
                <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">Push subscribers</div>
                <div className="mt-2 text-2xl font-semibold text-neutral-100">{initialData.operationalHealth.pushSubscriptions}</div>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {initialData.operationalHealth.latestRssScan ? (
                <div className={`${ADMIN_INSET} p-4`}>
                  <div className="text-sm font-medium text-neutral-100">Latest RSS scan</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.16em] text-neutral-500">
                    Started {formatUpdatedAt(initialData.operationalHealth.latestRssScan.startedAt)}
                    {initialData.operationalHealth.latestRssScan.finishedAt
                      ? ` • Finished ${formatUpdatedAt(initialData.operationalHealth.latestRssScan.finishedAt)}`
                      : ""}
                  </div>
                  {initialData.operationalHealth.latestRssScan.error ? (
                    <div className="mt-2 text-sm leading-6 text-red-200">{initialData.operationalHealth.latestRssScan.error}</div>
                  ) : null}
                </div>
              ) : null}

              {initialData.operationalHealth.feedErrors.length > 0 ? (
                <div className={`${ADMIN_INSET} p-4`}>
                  <div className="text-sm font-medium text-neutral-100">Feed errors</div>
                  <div className="mt-3 space-y-3">
                    {initialData.operationalHealth.feedErrors.map((feed) => (
                      <div key={feed.url}>
                        <div className="text-sm text-neutral-200">{feed.title}</div>
                        <div className="mt-1 line-clamp-2 text-sm leading-6 text-red-200">{feed.lastError}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className={`${ADMIN_INSET} p-4 text-sm text-neutral-500`}>No feed errors currently reported.</div>
              )}
            </div>
          </section>

          <section className={`${ADMIN_PANEL} p-8`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Staff</div>
                <h2 className="mt-2 text-2xl font-semibold text-neutral-100">Access</h2>
              </div>
            </div>

            <input
              value={userSearchDraft}
              onChange={(event) => setUserSearchDraft(event.target.value)}
              placeholder="Search by username or email"
              className="mt-6 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500"
            />

            <div className="mt-4 space-y-3">
              {users.map((user) => (
                <div key={user.userId} className={`${ADMIN_INSET} p-4`}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-neutral-100">{user.username}</div>
                      <div className="mt-1 text-sm text-neutral-400">{user.email}</div>
                      <div className="mt-2 text-xs uppercase tracking-[0.16em] text-neutral-500">
                        {user.commentCount} comments • {user.openReportCount} open reports
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={user.staffRole}
                        onChange={(event) => void updateStaffRole(user.userId, event.target.value as StaffRole)}
                        disabled={busyAction === `role:${user.userId}`}
                        className="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
                      >
                        <option value="reader">Reader</option>
                        <option value="moderator">Moderator</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              {users.length === 0 ? <div className="text-sm text-neutral-500">No accounts matched that search.</div> : null}
            </div>
          </section>
        </div>

        <div className="mt-8 grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
          <section
            id="reader-interests"
            className={`${ADMIN_PANEL} p-8`}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Reader Interests</div>
                <h2 className="mt-2 text-2xl font-semibold text-neutral-100">What people are trying to follow</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
                  Use this to spot recurring interests and promote them into your entity system when they should be first-class concepts.
                </p>
              </div>
              <Link
                href="/admin/entities"
                className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
              >
                Open manager
              </Link>
            </div>

            <div className="mt-6 space-y-3">
              {interestSignals.map((signal) => {
                const actionKey = `entity:${signal.normalizedQuery}`;
                const isBusy = busyAction === actionKey;

                return (
                  <div key={signal.normalizedQuery} className={`${ADMIN_INSET} p-4`}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="text-base font-medium text-neutral-100">{signal.query}</div>
                        <div className="mt-2 text-xs uppercase tracking-[0.16em] text-neutral-500">
                          {signal.readerCount} reader{signal.readerCount === 1 ? "" : "s"} • Updated {formatUpdatedAt(signal.updatedAt)}
                        </div>
                        <div className="mt-3 text-sm text-neutral-400">
                          {signal.entityMatchType === "entity"
                            ? `Already an entity: ${signal.entityMatchName}`
                            : signal.entityMatchType === "alias"
                              ? `Already covered as an alias on ${signal.entityMatchName}`
                              : "Not in entities yet."}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {signal.entityMatchType === "none" ? (
                          <button
                            type="button"
                            onClick={() => void addInterestAsEntity(signal)}
                            disabled={isBusy}
                            className="rounded-full border border-[#8f7740]/70 bg-[#07101a] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isBusy ? "Adding..." : "Add as entity"}
                          </button>
                        ) : (
                          <span className="rounded-full border border-[#163754] px-3 py-2 text-xs uppercase tracking-[0.16em] text-neutral-300">
                            {signal.entityMatchType === "entity" ? "Entity exists" : "Alias exists"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {interestSignals.length === 0 ? <div className="text-sm text-neutral-500">No reader interests found yet.</div> : null}
            </div>
          </section>

          <section className={`${ADMIN_PANEL} p-8`}>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Story QA</div>
            <h2 className="mt-2 text-2xl font-semibold text-neutral-100">Attention Needed</h2>

            <div className="mt-6 space-y-4">
              {initialData.attentionStories.map((story) => (
                <Link
                  key={story.id}
                  href={`/admin/editor?story=${encodeURIComponent(story.id)}`}
                  className={`block ${ADMIN_INSET_INTERACTIVE} p-5 hover:border-[#8f7740]/60`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-neutral-100">{story.title}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-neutral-500">
                        {story.status} • Updated {story.updatedAt ? formatUpdatedAt(story.updatedAt) : "recently"}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {story.issues.map((issue) => (
                      <span key={issue} className="rounded-full border border-[#163754] px-3 py-1 text-xs text-neutral-300">
                        {issue}
                      </span>
                    ))}
                  </div>
                </Link>
              ))}
              {initialData.attentionStories.length === 0 ? <div className="text-sm text-neutral-500">No major story QA issues found.</div> : null}
            </div>
          </section>

          <section className={`${ADMIN_PANEL} p-8`}>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Recent Activity</div>
            <h2 className="mt-2 text-2xl font-semibold text-neutral-100">Launch Feed</h2>

            <div className="mt-6 space-y-6">
              <div>
                <div className="text-sm font-medium text-neutral-200">Recent comments</div>
                <div className="mt-3 space-y-3">
                  {initialData.recentComments.map((comment) => (
                    <Link
                      key={comment.id}
                      href={`/story/${comment.storyId}?comment=${encodeURIComponent(comment.id)}#comment-${comment.id}`}
                      className={`block ${ADMIN_INSET_INTERACTIVE} p-4 hover:border-[#8f7740]/60`}
                    >
                      <div className="text-sm text-neutral-100">{comment.username}</div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {comment.storyTitle ?? comment.storyId} • {formatUpdatedAt(comment.createdAt)}
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-neutral-300">{comment.body}</p>
                    </Link>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-neutral-200">Recent signups</div>
                <div className="mt-3 space-y-3">
                  {initialData.recentSignups.map((signup) => (
                    <div key={signup.userId} className={`${ADMIN_INSET} p-4`}>
                      <div className="text-sm text-neutral-100">{signup.username}</div>
                      <div className="mt-1 text-sm text-neutral-400">{signup.email}</div>
                      <div className="mt-2 text-xs uppercase tracking-[0.16em] text-neutral-500">
                        {signup.staffRole} • {formatUpdatedAt(signup.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-neutral-200">Recent revisions</div>
                <div className="mt-3 space-y-3">
                  {initialData.recentRevisions.map((revision) => (
                    <Link
                      key={revision.id}
                      href={`/admin/editor?story=${encodeURIComponent(revision.storyId)}`}
                      className={`block ${ADMIN_INSET_INTERACTIVE} p-4 hover:border-[#8f7740]/60`}
                    >
                      <div className="text-sm text-neutral-100">{revision.storyId}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-neutral-500">
                        {revision.action} • {formatUpdatedAt(revision.createdAt)}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
