import type { AccountProfile, CommentModerationStatus, StaffRole } from "@/app/lib/account.server";
import { toCommentModerationStatus, toStaffRole } from "@/app/lib/account.server";
import { getCommunitySettings } from "@/app/lib/community-settings";
import { supabaseServer } from "@/app/lib/supabase.server";
import { coerceStory, type StoryDbRow } from "@/app/lib/stories";

type UserProfileAdminRow = {
  admin_granted_at?: string | null;
  comment_moderation_note?: string | null;
  comment_moderation_status?: string | null;
  comment_moderation_until?: string | null;
  created_at: string;
  email: string;
  is_admin: boolean;
  staff_role?: string | null;
  updated_at?: string | null;
  user_id: string;
  username: string;
};

type StoryLiteRow = Pick<
  StoryDbRow,
  "id" | "title" | "status" | "summary" | "sources" | "image_path" | "image_url" | "topics" | "entities" | "updated_at" | "created_at" | "beacon_include"
>;

type InterestSignalRow = {
  created_at: string;
  normalized_query: string;
  query: string;
  updated_at: string;
  user_id: string;
};

type EntityLookupRow = {
  aliases: string[] | null;
  name: string;
};

export type AdminManagedUser = {
  adminGrantedAt: string | null;
  commentCount: number;
  commentModerationNote: string | null;
  commentModerationStatus: CommentModerationStatus;
  commentModerationUntil: string | null;
  createdAt: string;
  email: string;
  isAdmin: boolean;
  openReportCount: number;
  staffRole: StaffRole;
  updatedAt: string | null;
  userId: string;
  username: string;
};

export type AdminDashboardStoryIssue = {
  id: string;
  issues: string[];
  status: string;
  title: string;
  updatedAt: string | null;
};

export type AdminDashboardRecentComment = {
  body: string;
  createdAt: string;
  id: string;
  storyId: string;
  storyTitle: string | null;
  userId: string;
  username: string;
};

export type AdminDashboardRecentSignup = {
  createdAt: string;
  email: string;
  staffRole: StaffRole;
  userId: string;
  username: string;
};

export type AdminDashboardRecentRevision = {
  action: string;
  createdAt: string;
  id: string;
  storyId: string;
};

export type AdminInterestSignal = {
  entityMatchName: string | null;
  entityMatchType: "alias" | "entity" | "none";
  normalizedQuery: string;
  query: string;
  readerCount: number;
  updatedAt: string;
};

export type AdminEntity = {
  aliases: string[];
  name: string;
};

export type AdminOperationalHealth = {
  embeddingErrors: number;
  embeddingPending: number;
  feedErrors: Array<{ lastError: string; title: string; url: string }>;
  latestRssScan: { error: string | null; finishedAt: string | null; startedAt: string; status: string } | null;
  pushSubscriptions: number;
};

export type AdminDashboardData = {
  attentionStories: AdminDashboardStoryIssue[];
  communitySettings: Awaited<ReturnType<typeof getCommunitySettings>>;
  operationalHealth: AdminOperationalHealth;
  recentInterestSignals: AdminInterestSignal[];
  recentComments: AdminDashboardRecentComment[];
  recentRevisions: AdminDashboardRecentRevision[];
  recentSignups: AdminDashboardRecentSignup[];
  summary: {
    archivedStories: number;
    briefingStories: number;
    commentsToday: number;
    drafts: number;
    openReports: number;
    publishedStories: number;
    signups7d: number;
    unreadAdminNotifications: number;
  };
};

function relationMissing(error: unknown, relationName: string) {
  return error instanceof Error && new RegExp(`relation .*${relationName}.* does not exist`, "i").test(error.message);
}

function sanitizeSearchTerm(value: string) {
  return value.replace(/[,%]/g, " ").trim();
}

function normalizeSourceUrl(value: string) {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

function normalizeInterestLookupValue(value: string) {
  return value.trim().toLowerCase();
}

function toManagedUser(row: UserProfileAdminRow, stats?: { commentCount?: number; openReportCount?: number }): AdminManagedUser {
  return {
    adminGrantedAt: row.admin_granted_at ?? null,
    commentCount: stats?.commentCount ?? 0,
    commentModerationNote: row.comment_moderation_note ?? null,
    commentModerationStatus: toCommentModerationStatus(row.comment_moderation_status),
    commentModerationUntil: row.comment_moderation_until ?? null,
    createdAt: row.created_at,
    email: row.email,
    isAdmin: Boolean(row.is_admin),
    openReportCount: stats?.openReportCount ?? 0,
    staffRole: toStaffRole(row.staff_role, Boolean(row.is_admin)),
    updatedAt: row.updated_at ?? null,
    userId: row.user_id,
    username: row.username,
  };
}

async function loadUserStats(userIds: string[]) {
  if (userIds.length === 0) {
    return new Map<string, { commentCount: number; openReportCount: number }>();
  }

  const supabase = supabaseServer();
  const { data: commentsData, error: commentsError } = await supabase
    .from("user_comments")
    .select("id, user_id")
    .in("user_id", userIds);

  if (commentsError) {
    throw new Error(commentsError.message);
  }

  const comments = (commentsData ?? []) as Array<{ id: string; user_id: string }>;
  const commentIds = comments.map((comment) => comment.id);
  const commentCountByUserId = new Map<string, number>();
  for (const comment of comments) {
    commentCountByUserId.set(comment.user_id, (commentCountByUserId.get(comment.user_id) ?? 0) + 1);
  }

  const openReportCountByUserId = new Map<string, number>();
  if (commentIds.length > 0) {
    const { data: reportData, error: reportError } = await supabase
      .from("comment_reports")
      .select("comment_id")
      .eq("status", "open")
      .in("comment_id", commentIds);

    if (reportError) {
      throw new Error(reportError.message);
    }

    const commentOwnerById = new Map(comments.map((comment) => [comment.id, comment.user_id]));
    for (const report of (reportData ?? []) as Array<{ comment_id: string }>) {
      const ownerUserId = commentOwnerById.get(report.comment_id);
      if (!ownerUserId) continue;
      openReportCountByUserId.set(ownerUserId, (openReportCountByUserId.get(ownerUserId) ?? 0) + 1);
    }
  }

  return new Map(
    userIds.map((userId) => [
      userId,
      {
        commentCount: commentCountByUserId.get(userId) ?? 0,
        openReportCount: openReportCountByUserId.get(userId) ?? 0,
      },
    ])
  );
}

export async function searchAdminUsers(search: string, limit = 12) {
  const supabase = supabaseServer();
  const sanitizedSearch = sanitizeSearchTerm(search);
  let query = supabase
    .from("user_profiles")
    .select(
      "user_id, username, email, created_at, updated_at, is_admin, staff_role, admin_granted_at, comment_moderation_status, comment_moderation_until, comment_moderation_note"
    );

  if (sanitizedSearch) {
    query = query.or(`username.ilike.%${sanitizedSearch}%,email.ilike.%${sanitizedSearch}%`);
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const { data, error } = await query.limit(Math.max(1, Math.min(limit, 25)));
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as UserProfileAdminRow[];
  const statsByUserId = await loadUserStats(rows.map((row) => row.user_id));
  return rows.map((row) => toManagedUser(row, statsByUserId.get(row.user_id)));
}

export async function updateAdminManagedUser(input: {
  actor: AccountProfile;
  commentModerationNote?: string | null;
  commentModerationStatus?: CommentModerationStatus;
  commentModerationUntil?: string | null;
  staffRole?: StaffRole;
  targetUserId: string;
}) {
  const targetUserId = input.targetUserId.trim();
  if (!targetUserId) {
    throw new Error("Target user is required.");
  }

  if (input.staffRole && input.actor.userId === targetUserId && input.staffRole !== "admin") {
    throw new Error("You cannot remove your own admin access here.");
  }

  const supabase = supabaseServer();
  const { data: existingData, error: existingError } = await supabase
    .from("user_profiles")
    .select(
      "user_id, username, email, created_at, updated_at, is_admin, staff_role, admin_granted_at, comment_moderation_status, comment_moderation_until, comment_moderation_note"
    )
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (!existingData) {
    throw new Error("That account no longer exists.");
  }

  const existing = existingData as UserProfileAdminRow;
  const nextStaffRole = input.staffRole ?? toStaffRole(existing.staff_role, Boolean(existing.is_admin));
  const nextModerationStatus = input.commentModerationStatus ?? toCommentModerationStatus(existing.comment_moderation_status);
  const nextModerationUntil = nextModerationStatus === "active" ? null : input.commentModerationUntil ?? existing.comment_moderation_until ?? null;
  const nextModerationNote =
    nextModerationStatus === "active" ? null : (input.commentModerationNote ?? existing.comment_moderation_note ?? null);
  const nextIsAdmin = nextStaffRole === "admin";

  const { data, error } = await supabase
    .from("user_profiles")
    .update({
      admin_granted_at: nextIsAdmin ? existing.admin_granted_at ?? new Date().toISOString() : null,
      comment_moderated_at: input.commentModerationStatus ? new Date().toISOString() : undefined,
      comment_moderated_by: input.commentModerationStatus ? input.actor.userId : undefined,
      comment_moderation_note: nextModerationNote,
      comment_moderation_status: nextModerationStatus,
      comment_moderation_until: nextModerationUntil,
      is_admin: nextIsAdmin,
      staff_role: nextStaffRole,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", targetUserId)
    .select(
      "user_id, username, email, created_at, updated_at, is_admin, staff_role, admin_granted_at, comment_moderation_status, comment_moderation_until, comment_moderation_note"
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const statsByUserId = await loadUserStats([targetUserId]);
  return toManagedUser(data as UserProfileAdminRow, statsByUserId.get(targetUserId));
}

function getStoryIssues(row: StoryLiteRow) {
  const story = coerceStory(row as StoryDbRow);
  const issues: string[] = [];
  const summaryLines = story.summary.filter((line) => line.trim());
  const duplicateUrls = new Set<string>();
  let hasDuplicateSourceUrl = false;
  let sourceMissingBasics = false;

  for (const source of story.sources) {
    if (!source.name.trim() || !source.url.trim()) {
      sourceMissingBasics = true;
      continue;
    }

    const normalizedUrl = normalizeSourceUrl(source.url);
    if (!normalizedUrl) continue;
    if (duplicateUrls.has(normalizedUrl)) {
      hasDuplicateSourceUrl = true;
      break;
    }
    duplicateUrls.add(normalizedUrl);
  }

  if (summaryLines.length === 0) issues.push("Missing summary");
  if (story.sources.length === 0) issues.push("No sources");
  if (sourceMissingBasics) issues.push("Source missing outlet or URL");
  if (hasDuplicateSourceUrl) issues.push("Duplicate source URLs");

  return issues;
}

export async function listAdminEntities(limit = 400) {
  const supabase = supabaseServer();
  const { data, error } = await supabase.from("entities").select("name, aliases").order("name", { ascending: true }).limit(limit);

  if (error) {
    if (/relation .*entities.* does not exist/i.test(error.message)) {
      return [] as AdminEntity[];
    }

    throw new Error(error.message);
  }

  return ((data ?? []) as EntityLookupRow[]).map((entity) => ({
    aliases: Array.isArray(entity.aliases) ? entity.aliases.map(String).filter(Boolean) : [],
    name: entity.name,
  }));
}

export async function listAdminInterestSignals(limit = 12) {
  const supabase = supabaseServer();
  const [{ data: interestData, error: interestError }, entities] = await Promise.all([
    supabase
      .from("user_interest_follows")
      .select("user_id, query, normalized_query, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(400),
    listAdminEntities(400),
  ]);

  if (interestError) {
    if (/relation .*user_interest_follows.* does not exist/i.test(interestError.message)) {
      return [] as AdminInterestSignal[];
    }

    throw new Error(interestError.message);
  }

  const entityNamesByKey = new Map<string, string>();
  const entityAliasesByKey = new Map<string, string>();
  for (const entity of entities) {
    const normalizedName = normalizeInterestLookupValue(entity.name);
    if (normalizedName && !entityNamesByKey.has(normalizedName)) {
      entityNamesByKey.set(normalizedName, entity.name);
    }

    for (const alias of entity.aliases ?? []) {
      const normalizedAlias = normalizeInterestLookupValue(alias);
      if (normalizedAlias && !entityAliasesByKey.has(normalizedAlias)) {
        entityAliasesByKey.set(normalizedAlias, entity.name);
      }
    }
  }

  const groupedSignals = new Map<
    string,
    {
      normalizedQuery: string;
      query: string;
      readerIds: Set<string>;
      updatedAt: string;
    }
  >();

  for (const row of (interestData ?? []) as InterestSignalRow[]) {
    const normalizedQuery = normalizeInterestLookupValue(row.normalized_query || row.query);
    if (!normalizedQuery) continue;

    const existing = groupedSignals.get(normalizedQuery);
    if (!existing) {
      groupedSignals.set(normalizedQuery, {
        normalizedQuery,
        query: row.query,
        readerIds: new Set([row.user_id]),
        updatedAt: row.updated_at,
      });
      continue;
    }

    existing.readerIds.add(row.user_id);
    if (new Date(row.updated_at).getTime() >= new Date(existing.updatedAt).getTime()) {
      existing.query = row.query;
      existing.updatedAt = row.updated_at;
    }
  }

  return [...groupedSignals.values()]
    .sort((left, right) => {
      const updatedDiff = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      if (updatedDiff !== 0) return updatedDiff;
      return right.readerIds.size - left.readerIds.size;
    })
    .slice(0, Math.max(1, Math.min(limit, 30)))
    .map((signal) => {
      const exactEntityName = entityNamesByKey.get(signal.normalizedQuery) ?? null;
      const aliasEntityName = exactEntityName ? null : (entityAliasesByKey.get(signal.normalizedQuery) ?? null);

      return {
        entityMatchName: exactEntityName ?? aliasEntityName,
        entityMatchType: exactEntityName ? "entity" : aliasEntityName ? "alias" : "none",
        normalizedQuery: signal.normalizedQuery,
        query: signal.query,
        readerCount: signal.readerIds.size,
        updatedAt: signal.updatedAt,
      } satisfies AdminInterestSignal;
    });
}

async function getAdminOperationalHealth(): Promise<AdminOperationalHealth> {
  const supabase = supabaseServer();
  const [
    latestScanResult,
    feedErrorResult,
    storyEmbeddingPendingResult,
    storyEmbeddingErrorResult,
    interestEmbeddingPendingResult,
    interestEmbeddingErrorResult,
    pushSubscriptionResult,
  ] = await Promise.all([
    supabase.from("admin_rss_scan_runs").select("started_at, finished_at, status, error").order("started_at", { ascending: false }).limit(1),
    supabase.from("admin_rss_feeds").select("title, url, last_error").not("last_error", "is", null).order("updated_at", { ascending: false }).limit(5),
    supabase.from("story_embeddings").select("story_id", { count: "exact", head: true }).eq("embedding_state", "pending"),
    supabase.from("story_embeddings").select("story_id", { count: "exact", head: true }).eq("embedding_state", "error"),
    supabase.from("user_interest_follows").select("id", { count: "exact", head: true }).eq("embedding_state", "pending"),
    supabase.from("user_interest_follows").select("id", { count: "exact", head: true }).eq("embedding_state", "error"),
    supabase.from("push_subscriptions").select("endpoint", { count: "exact", head: true }),
  ]);

  const ignorableErrors = [
    [latestScanResult.error, "admin_rss_scan_runs"],
    [feedErrorResult.error, "admin_rss_feeds"],
    [storyEmbeddingPendingResult.error, "story_embeddings"],
    [storyEmbeddingErrorResult.error, "story_embeddings"],
    [interestEmbeddingPendingResult.error, "user_interest_follows"],
    [interestEmbeddingErrorResult.error, "user_interest_follows"],
    [pushSubscriptionResult.error, "push_subscriptions"],
  ] as const;

  for (const [error, relation] of ignorableErrors) {
    if (error && !relationMissing(new Error(error.message), relation)) {
      throw new Error(error.message);
    }
  }

  const latestScan = ((latestScanResult.data ?? []) as Array<{
    error: string | null;
    finished_at: string | null;
    started_at: string;
    status: string;
  }>)[0];

  return {
    embeddingErrors: (storyEmbeddingErrorResult.count ?? 0) + (interestEmbeddingErrorResult.count ?? 0),
    embeddingPending: (storyEmbeddingPendingResult.count ?? 0) + (interestEmbeddingPendingResult.count ?? 0),
    feedErrors: ((feedErrorResult.data ?? []) as Array<{ last_error: string | null; title: string | null; url: string | null }>)
      .filter((feed) => feed.last_error)
      .map((feed) => ({
        lastError: feed.last_error ?? "",
        title: feed.title?.trim() || feed.url?.trim() || "Feed",
        url: feed.url ?? "",
      })),
    latestRssScan: latestScan
      ? {
          error: latestScan.error,
          finishedAt: latestScan.finished_at,
          startedAt: latestScan.started_at,
          status: latestScan.status,
        }
      : null,
    pushSubscriptions: pushSubscriptionResult.count ?? 0,
  };
}

export async function getAdminDashboardData(adminUserId: string): Promise<AdminDashboardData> {
  const supabase = supabaseServer();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: storyData, error: storyError },
    { count: openReports, error: reportsError },
    { count: briefingStories, error: briefingError },
    { count: commentsToday, error: commentsTodayError },
    { count: signups7d, error: signupsError },
    { count: unreadAdminNotifications, error: notificationsError },
    { data: recentCommentsData, error: recentCommentsError },
    { data: recentSignupsData, error: recentSignupsError },
    { data: recentRevisionsData, error: revisionsError },
    communitySettings,
    recentInterestSignals,
    operationalHealth,
  ] = await Promise.all([
    supabase
      .from("stories")
      .select("id, title, status, summary, sources, image_path, image_url, topics, entities, updated_at, created_at, beacon_include"),
    supabase.from("comment_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("stories").select("id", { count: "exact", head: true }).eq("beacon_include", true),
    supabase.from("user_comments").select("id", { count: "exact", head: true }).gte("created_at", startOfDay.toISOString()),
    supabase.from("user_profiles").select("user_id", { count: "exact", head: true }).gte("created_at", sevenDaysAgo),
    supabase.from("account_notifications").select("id", { count: "exact", head: true }).eq("user_id", adminUserId).is("read_at", null),
    supabase
      .from("user_comments")
      .select("id, user_id, story_id, body, created_at, deleted_at")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("user_profiles")
      .select("user_id, username, email, created_at, is_admin, staff_role")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("story_revisions")
      .select("id, story_id, action, created_at")
      .order("created_at", { ascending: false })
      .limit(8),
    getCommunitySettings(),
    listAdminInterestSignals(12),
    getAdminOperationalHealth(),
  ]);

  if (storyError) throw new Error(storyError.message);
  if (reportsError) throw new Error(reportsError.message);
  if (briefingError) throw new Error(briefingError.message);
  if (commentsTodayError) throw new Error(commentsTodayError.message);
  if (signupsError) throw new Error(signupsError.message);
  if (notificationsError) throw new Error(notificationsError.message);
  if (recentCommentsError) throw new Error(recentCommentsError.message);
  if (recentSignupsError) throw new Error(recentSignupsError.message);
  if (revisionsError && !/relation .* does not exist/i.test(revisionsError.message)) throw new Error(revisionsError.message);

  const stories = (storyData ?? []) as StoryLiteRow[];
  const draftCount = stories.filter((story) => story.status === "draft").length;
  const archivedCount = stories.filter((story) => story.status === "archived").length;
  const publishedCount = stories.filter((story) => story.status !== "draft" && story.status !== "archived").length;

  const attentionStories = stories
    .map((story) => ({
      id: story.id,
      issues: getStoryIssues(story),
      status: story.status ?? "published",
      title: story.title,
      updatedAt: story.updated_at ?? story.created_at ?? null,
    }))
    .filter((story) => story.issues.length > 0)
    .sort((left, right) => {
      const issueDiff = right.issues.length - left.issues.length;
      if (issueDiff !== 0) return issueDiff;
      return new Date(right.updatedAt ?? 0).getTime() - new Date(left.updatedAt ?? 0).getTime();
    })
    .slice(0, 10);

  const recentComments = ((recentCommentsData ?? []) as Array<{
    body: string;
    created_at: string;
    deleted_at: string | null;
    id: string;
    story_id: string;
    user_id: string;
  }>).filter((comment) => !comment.deleted_at);
  const recentCommentStoryIds = Array.from(new Set(recentComments.map((comment) => comment.story_id)));
  const recentCommentUserIds = Array.from(new Set(recentComments.map((comment) => comment.user_id)));
  const [{ data: recentCommentStoriesData, error: recentCommentStoriesError }, { data: recentCommentUsersData, error: recentCommentUsersError }] =
    await Promise.all([
      recentCommentStoryIds.length > 0
        ? supabase.from("stories").select("id, title").in("id", recentCommentStoryIds)
        : Promise.resolve({ data: [], error: null }),
      recentCommentUserIds.length > 0
        ? supabase.from("user_profiles").select("user_id, username").in("user_id", recentCommentUserIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (recentCommentStoriesError) throw new Error(recentCommentStoriesError.message);
  if (recentCommentUsersError) throw new Error(recentCommentUsersError.message);

  const storyTitleById = new Map(((recentCommentStoriesData ?? []) as Array<{ id: string; title: string }>).map((story) => [story.id, story.title]));
  const usernameById = new Map(((recentCommentUsersData ?? []) as Array<{ user_id: string; username: string }>).map((user) => [user.user_id, user.username]));

  return {
    attentionStories,
    communitySettings,
    operationalHealth,
    recentInterestSignals,
    recentComments: recentComments.map((comment) => ({
      body: comment.body,
      createdAt: comment.created_at,
      id: comment.id,
      storyId: comment.story_id,
      storyTitle: storyTitleById.get(comment.story_id) ?? null,
      userId: comment.user_id,
      username: usernameById.get(comment.user_id) ?? "Reader",
    })),
    recentRevisions: ((recentRevisionsData ?? []) as Array<{ action: string; created_at: string; id: string; story_id: string }>).map((revision) => ({
      action: revision.action,
      createdAt: revision.created_at,
      id: revision.id,
      storyId: revision.story_id,
    })),
    recentSignups: ((recentSignupsData ?? []) as Array<{
      created_at: string;
      email: string;
      is_admin: boolean;
      staff_role?: string | null;
      user_id: string;
      username: string;
    }>).map((user) => ({
      createdAt: user.created_at,
      email: user.email,
      staffRole: toStaffRole(user.staff_role, Boolean(user.is_admin)),
      userId: user.user_id,
      username: user.username,
    })),
    summary: {
      archivedStories: archivedCount,
      briefingStories: briefingStories ?? 0,
      commentsToday: commentsToday ?? 0,
      drafts: draftCount,
      openReports: openReports ?? 0,
      publishedStories: publishedCount,
      signups7d: signups7d ?? 0,
      unreadAdminNotifications: unreadAdminNotifications ?? 0,
    },
  };
}
