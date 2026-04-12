import { supabaseServer } from "@/app/lib/supabase.server";
import { notifyAdminsAboutCommentReport, notifyUserAboutCommentReply } from "@/app/lib/notifications.server";

const COMMENT_EDIT_WINDOW_MINUTES = 15;
const COMMENT_POST_LIMIT_PER_10_MINUTES = 6;
const COMMENT_POST_LIMIT_PER_DAY = 20;
const COMMENT_REPORT_LIMIT_PER_DAY = 10;
const COMMENT_VOTE_LIMIT_PER_HOUR = 200;
const MAX_COMMENT_LENGTH = 1200;
const MIN_COMMENT_LENGTH = 2;
const MAX_REPORT_DETAILS_LENGTH = 500;
const BLOCKED_COMMENT_TERMS = [
  "chink",
  "cunt",
  "faggot",
  "fag",
  "gook",
  "kike",
  "nigga",
  "nigger",
  "retard",
  "spic",
  "tranny",
  "wetback",
] as const;
const MODERATION_SUBSTITUTIONS: Record<string, string> = {
  "!": "i",
  "$": "s",
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
};

type CommentRow = {
  body: string;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  depth: number | null;
  edited_at: string | null;
  id: string;
  parent_comment_id: string | null;
  root_comment_id: string | null;
  story_id: string;
  updated_at: string;
  user_id: string;
};

type CommentVoteRow = {
  comment_id: string;
  user_id: string;
  vote: number;
};

type CommentUserRow = {
  user_id: string;
  username: string;
};

type StoryRow = {
  id: string;
};

type BaseStoryComment = {
  body: string | null;
  canEdit: boolean;
  createdAt: string;
  deleted: boolean;
  depth: number;
  downvotes: number;
  editedAt: string | null;
  id: string;
  parentCommentId: string | null;
  removedMessage: string | null;
  storyId: string;
  topScore: number;
  totalReplies: number;
  updatedAt: string;
  upvotes: number;
  userId: string;
  username: string;
  viewerOwns: boolean;
  viewerVote: -1 | 0 | 1;
};

export type CommentSort = "controversial" | "most-liked" | "new" | "old" | "top";

export type StoryComment = BaseStoryComment & {
  children: StoryComment[];
};

export type StoryCommentsResult = {
  comments: StoryComment[];
  totalCount: number;
};

export type AccountCommentHistoryItem = {
  body: string;
  createdAt: string;
  id: string;
  storyId: string;
  storyTitle: string | null;
};

export type AccountCommentHistoryResult = {
  comments: AccountCommentHistoryItem[];
  totalCount: number;
};

type CommentActionType = "comment_edit" | "comment_post" | "comment_report" | "comment_vote";
type CommentReportStatus = "dismissed" | "open" | "reviewed";

export type AdminCommentReport = {
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
  status: CommentReportStatus;
  storyTitle: string | null;
};

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function compactForModeration(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split("")
    .map((char) => MODERATION_SUBSTITUTIONS[char] ?? char)
    .join("")
    .replace(/[^a-z]/g, "");
}

function sanitizeCommentBody(value: string) {
  return value.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function parseCommentDate(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function minutesSince(value: string, nowMs: number) {
  return Math.max(0, (nowMs - parseCommentDate(value)) / 60_000);
}

function hoursSince(value: string, nowMs: number) {
  return Math.max(0, (nowMs - parseCommentDate(value)) / 3_600_000);
}

function isCommentEditableByUser(comment: Pick<CommentRow, "created_at" | "deleted_at" | "user_id">, viewerUserId: string | null | undefined, nowMs: number) {
  return Boolean(
    viewerUserId &&
      comment.user_id === viewerUserId &&
      !comment.deleted_at &&
      minutesSince(comment.created_at, nowMs) <= COMMENT_EDIT_WINDOW_MINUTES
  );
}

function wilsonLowerBound(upvotes: number, downvotes: number) {
  const total = upvotes + downvotes;
  if (total <= 0) return 0;

  const z = 1.96;
  const positiveRatio = upvotes / total;
  const zSquared = z * z;
  const numerator =
    positiveRatio +
    zSquared / (2 * total) -
    z * Math.sqrt((positiveRatio * (1 - positiveRatio) + zSquared / (4 * total)) / total);
  const denominator = 1 + zSquared / total;
  return numerator / denominator;
}

function topCommentScore(
  upvotes: number,
  downvotes: number,
  totalReplies: number,
  createdAt: string,
  nowMs: number
) {
  const confidence = wilsonLowerBound(upvotes + 1, downvotes + 1);
  const totalVotes = upvotes + downvotes;
  const ageHours = hoursSince(createdAt, nowMs);
  const voteVolumeBoost = Math.min(0.18, Math.log10(totalVotes + 1) * 0.08);
  const discussionBoost = Math.min(0.18, Math.log10(totalReplies + 1) * 0.12);
  const freshnessBoost = Math.max(0, 0.28 - ageHours / (24 * 10));
  const disagreementPenalty = downvotes > upvotes ? Math.min(0.22, ((downvotes - upvotes) / Math.max(1, totalVotes)) * 0.22) : 0;

  return confidence + voteVolumeBoost + discussionBoost + freshnessBoost - disagreementPenalty;
}

function controversialCommentScore(upvotes: number, downvotes: number, createdAt: string, nowMs: number) {
  const totalVotes = upvotes + downvotes;
  if (totalVotes < 4) return 0;

  const balance = 1 - Math.abs(upvotes - downvotes) / totalVotes;
  const ageHours = hoursSince(createdAt, nowMs);
  return balance * Math.log10(totalVotes + 1) - ageHours / (24 * 21);
}

function sortChildrenOldestFirst(left: StoryComment, right: StoryComment) {
  const createdDiff = parseCommentDate(left.createdAt) - parseCommentDate(right.createdAt);
  if (createdDiff !== 0) return createdDiff;
  return left.id.localeCompare(right.id);
}

function sortTopLevelComments(left: StoryComment, right: StoryComment, sort: CommentSort, nowMs: number) {
  switch (sort) {
    case "new": {
      const createdDiff = parseCommentDate(right.createdAt) - parseCommentDate(left.createdAt);
      if (createdDiff !== 0) return createdDiff;
      return right.id.localeCompare(left.id);
    }
    case "old": {
      const createdDiff = parseCommentDate(left.createdAt) - parseCommentDate(right.createdAt);
      if (createdDiff !== 0) return createdDiff;
      return left.id.localeCompare(right.id);
    }
    case "most-liked": {
      const likedDiff = right.upvotes - left.upvotes;
      if (likedDiff !== 0) return likedDiff;
      const netDiff = right.upvotes - right.downvotes - (left.upvotes - left.downvotes);
      if (netDiff !== 0) return netDiff;
      const topDiff = right.topScore - left.topScore;
      if (topDiff !== 0) return topDiff;
      return parseCommentDate(right.createdAt) - parseCommentDate(left.createdAt);
    }
    case "controversial": {
      const controversialDiff =
        controversialCommentScore(right.upvotes, right.downvotes, right.createdAt, nowMs) -
        controversialCommentScore(left.upvotes, left.downvotes, left.createdAt, nowMs);
      if (controversialDiff !== 0) return controversialDiff;
      const voteDiff = right.upvotes + right.downvotes - (left.upvotes + left.downvotes);
      if (voteDiff !== 0) return voteDiff;
      return parseCommentDate(right.createdAt) - parseCommentDate(left.createdAt);
    }
    case "top":
    default: {
      const topDiff = right.topScore - left.topScore;
      if (topDiff !== 0) return topDiff;
      const netDiff = right.upvotes - right.downvotes - (left.upvotes - left.downvotes);
      if (netDiff !== 0) return netDiff;
      return parseCommentDate(right.createdAt) - parseCommentDate(left.createdAt);
    }
  }
}

function toCommentSort(value: string | null | undefined): CommentSort {
  switch (value) {
    case "new":
    case "old":
    case "most-liked":
    case "controversial":
    case "top":
      return value;
    default:
      return "top";
  }
}

function toVoteValue(value: number): -1 | 0 | 1 {
  if (value === -1) return -1;
  if (value === 1) return 1;
  return 0;
}

function messageFromDatabaseError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    if (/same story/i.test(error.message)) return "Replies must stay on the same story.";
    if (/replies cannot be added/i.test(error.message)) return "You cannot reply to a removed comment.";
    if (/does not exist/i.test(error.message) && /Parent comment/i.test(error.message)) return "That comment no longer exists.";
    if (/comment_reports_unique_reporter/i.test(error.message)) return "You already reported this comment.";
    return error.message;
  }

  return fallback;
}

async function ensureStoryExists(storyId: string) {
  const supabase = supabaseServer();
  const { data, error } = await supabase.from("stories").select("id").eq("id", storyId).maybeSingle();

  if (error) {
    throw new Error(messageFromDatabaseError(error, "We couldn't load this story."));
  }

  if (!data) {
    throw new Error("That story could not be found.");
  }

  return data as StoryRow;
}

async function getUsernameForUser(userId: string) {
  const supabase = supabaseServer();
  const { data, error } = await supabase.from("user_profiles").select("username").eq("user_id", userId).maybeSingle();
  if (error) {
    throw new Error(messageFromDatabaseError(error, "We couldn't load your profile."));
  }

  return typeof data?.username === "string" && data.username.trim() ? data.username : "Reader";
}

async function getCommentRowById(commentId: string) {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("user_comments")
    .select("id, user_id, story_id, body, parent_comment_id, root_comment_id, depth, created_at, updated_at, edited_at, deleted_at, deleted_by")
    .eq("id", commentId)
    .maybeSingle();

  if (error) {
    throw new Error(messageFromDatabaseError(error, "We couldn't load that comment."));
  }

  return (data ?? null) as CommentRow | null;
}

async function recordCommentActionEvent(input: {
  actionType: CommentActionType;
  commentId?: string | null;
  storyId?: string | null;
  userId: string;
}) {
  const supabase = supabaseServer();
  const { error } = await supabase.from("comment_action_events").insert({
    action_type: input.actionType,
    comment_id: input.commentId ?? null,
    story_id: input.storyId ?? null,
    user_id: input.userId,
  });

  if (error) {
    throw new Error(messageFromDatabaseError(error, "We couldn't save comment activity."));
  }
}

async function countRecentCommentActions(userId: string, actionType: CommentActionType, sinceIso: string) {
  const supabase = supabaseServer();
  const { count, error } = await supabase
    .from("comment_action_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action_type", actionType)
    .gte("created_at", sinceIso);

  if (error) {
    throw new Error(messageFromDatabaseError(error, "We couldn't verify comment rate limits."));
  }

  return count ?? 0;
}

async function enforceCommentRateLimit(input: {
  actionType: CommentActionType;
  limit: number;
  message: string;
  userId: string;
  windowMs: number;
}) {
  const sinceIso = new Date(Date.now() - input.windowMs).toISOString();
  const recentCount = await countRecentCommentActions(input.userId, input.actionType, sinceIso);
  if (recentCount >= input.limit) {
    throw new Error(input.message);
  }
}

function normalizeReportReason(value: string) {
  const reason = value.trim().replace(/\s+/g, " ");
  if (reason.length < 3) {
    throw new Error("Please choose a valid report reason.");
  }

  if (reason.length > 120) {
    throw new Error("Report reasons must stay under 120 characters.");
  }

  return reason;
}

function normalizeReportDetails(value: string | null | undefined) {
  const details = value?.trim() ?? "";
  if (!details) return null;
  return details.slice(0, MAX_REPORT_DETAILS_LENGTH);
}

function buildStoryCommentTree(
  commentRows: CommentRow[],
  votesByCommentId: Map<string, { downvotes: number; upvotes: number; viewerVote: -1 | 0 | 1 }>,
  usernamesByUserId: Map<string, string>,
  sort: CommentSort,
  viewerUserId?: string | null
) {
  const nowMs = Date.now();
  const rowsById = new Map(commentRows.map((row) => [row.id, row]));
  const childrenByParentId = new Map<string, string[]>();

  for (const row of commentRows) {
    if (!row.parent_comment_id) continue;
    const siblings = childrenByParentId.get(row.parent_comment_id) ?? [];
    siblings.push(row.id);
    childrenByParentId.set(row.parent_comment_id, siblings);
  }

  const buildNode = (commentId: string): StoryComment | null => {
    const row = rowsById.get(commentId);
    if (!row) return null;

    const childNodes = (childrenByParentId.get(commentId) ?? [])
      .map((childId) => buildNode(childId))
      .filter((child): child is StoryComment => Boolean(child))
      .sort(sortChildrenOldestFirst);

    const totalReplies = childNodes.reduce((sum, child) => sum + 1 + child.totalReplies, 0);
    const voteSummary = votesByCommentId.get(commentId) ?? {
      downvotes: 0,
      upvotes: 0,
      viewerVote: 0 as const,
    };

    return {
      body: row.deleted_at ? null : row.body,
      canEdit: isCommentEditableByUser(row, viewerUserId, nowMs),
      children: childNodes,
      createdAt: row.created_at,
      deleted: Boolean(row.deleted_at),
      depth: Number(row.depth ?? 0),
      downvotes: voteSummary.downvotes,
      editedAt: row.edited_at,
      id: row.id,
      parentCommentId: row.parent_comment_id,
      removedMessage: row.deleted_at ? (row.deleted_by ? "Removed by admin." : "<deleted>") : null,
      storyId: row.story_id,
      topScore: topCommentScore(voteSummary.upvotes, voteSummary.downvotes, totalReplies, row.created_at, nowMs),
      totalReplies,
      updatedAt: row.updated_at,
      upvotes: voteSummary.upvotes,
      userId: row.user_id,
      username: usernamesByUserId.get(row.user_id) ?? "Reader",
      viewerOwns: Boolean(viewerUserId && row.user_id === viewerUserId),
      viewerVote: voteSummary.viewerVote,
    };
  };

  return commentRows
    .filter((row) => !row.parent_comment_id)
    .map((row) => buildNode(row.id))
    .filter((comment): comment is StoryComment => Boolean(comment))
    .sort((left, right) => sortTopLevelComments(left, right, sort, nowMs));
}

export function parseCommentSort(value: string | null | undefined) {
  return toCommentSort(value);
}

export function getCommentModerationError(body: string) {
  const sanitized = sanitizeCommentBody(body);
  if (!sanitized) {
    return "Comment text is required.";
  }

  if (sanitized.length < MIN_COMMENT_LENGTH) {
    return "Comments need at least 2 characters.";
  }

  if (sanitized.length > MAX_COMMENT_LENGTH) {
    return `Comments must be ${MAX_COMMENT_LENGTH} characters or fewer.`;
  }

  const compact = compactForModeration(sanitized);
  for (const term of BLOCKED_COMMENT_TERMS) {
    if (compact.includes(compactForModeration(term))) {
      return "That comment was rejected by automatic moderation.";
    }
  }

  return null;
}

export function normalizeCommentBody(body: string) {
  const sanitized = sanitizeCommentBody(body);
  const moderationError = getCommentModerationError(sanitized);
  if (moderationError) {
    throw new Error(moderationError);
  }

  return sanitized;
}

export async function listStoryComments(storyId: string, sort: CommentSort, viewerUserId?: string | null): Promise<StoryCommentsResult> {
  await ensureStoryExists(storyId);

  const supabase = supabaseServer();
  const { data: commentData, error: commentError } = await supabase
    .from("user_comments")
    .select("id, user_id, story_id, body, parent_comment_id, root_comment_id, depth, created_at, updated_at, deleted_at, deleted_by")
    .eq("story_id", storyId)
    .order("created_at", { ascending: true });

  if (commentError) {
    throw new Error(messageFromDatabaseError(commentError, "We couldn't load comments."));
  }

  const commentRows = (commentData ?? []) as CommentRow[];
  if (commentRows.length === 0) {
    return { comments: [], totalCount: 0 };
  }

  const commentIds = commentRows.map((row) => row.id);
  const userIds = Array.from(new Set(commentRows.map((row) => row.user_id)));

  const [{ data: voteData, error: voteError }, { data: userData, error: userError }] = await Promise.all([
    supabase.from("comment_votes").select("comment_id, user_id, vote").in("comment_id", commentIds),
    supabase.from("user_profiles").select("user_id, username").in("user_id", userIds),
  ]);

  if (voteError) {
    throw new Error(messageFromDatabaseError(voteError, "We couldn't load comment votes."));
  }

  if (userError) {
    throw new Error(messageFromDatabaseError(userError, "We couldn't load comment authors."));
  }

  const votesByCommentId = new Map<string, { downvotes: number; upvotes: number; viewerVote: -1 | 0 | 1 }>();
  for (const row of (voteData ?? []) as CommentVoteRow[]) {
    const current = votesByCommentId.get(row.comment_id) ?? {
      downvotes: 0,
      upvotes: 0,
      viewerVote: 0 as const,
    };

    if (row.vote > 0) {
      current.upvotes += 1;
    } else if (row.vote < 0) {
      current.downvotes += 1;
    }

    if (viewerUserId && row.user_id === viewerUserId) {
      current.viewerVote = toVoteValue(row.vote);
    }

    votesByCommentId.set(row.comment_id, current);
  }

  const usernamesByUserId = new Map(
    ((userData ?? []) as CommentUserRow[]).map((row) => [row.user_id, row.username])
  );

  return {
    comments: buildStoryCommentTree(commentRows, votesByCommentId, usernamesByUserId, sort, viewerUserId),
    totalCount: commentRows.filter((row) => !row.deleted_at).length,
  };
}

export async function createComment(input: {
  body: string;
  parentCommentId?: string | null;
  storyId: string;
  userId: string;
}) {
  const storyId = input.storyId.trim();
  const userId = input.userId.trim();
  const body = normalizeCommentBody(input.body);
  const parentCommentId = input.parentCommentId?.trim() || null;

  if (!storyId) {
    throw new Error("Story id is required.");
  }

  if (!userId) {
    throw new Error("You must be signed in to comment.");
  }

  await enforceCommentRateLimit({
    actionType: "comment_post",
    limit: COMMENT_POST_LIMIT_PER_10_MINUTES,
    message: "You are posting too quickly. Please wait a few minutes before commenting again.",
    userId,
    windowMs: 10 * 60 * 1000,
  });
  await enforceCommentRateLimit({
    actionType: "comment_post",
    limit: COMMENT_POST_LIMIT_PER_DAY,
    message: "You have reached the daily comment limit. Please come back later.",
    userId,
    windowMs: 24 * 60 * 60 * 1000,
  });

  await ensureStoryExists(storyId);
  const parentComment = parentCommentId ? await getCommentRowById(parentCommentId) : null;

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("user_comments")
    .insert({
      body,
      parent_comment_id: parentCommentId,
      story_id: storyId,
      user_id: userId,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(messageFromDatabaseError(error, "We couldn't save your comment."));
  }

  await recordCommentActionEvent({
    actionType: "comment_post",
    commentId: data.id as string,
    storyId,
    userId,
  });

  if (parentComment && parentComment.user_id !== userId) {
    const actorUsername = await getUsernameForUser(userId);
    await notifyUserAboutCommentReply({
      actorUsername,
      commentId: data.id as string,
      recipientUserId: parentComment.user_id,
      replyBody: body,
      storyId,
    });
  }

  return data as { id: string };
}

export async function updateComment(input: {
  body: string;
  commentId: string;
  userId: string;
}) {
  const commentId = input.commentId.trim();
  const userId = input.userId.trim();
  const body = normalizeCommentBody(input.body);

  if (!commentId) {
    throw new Error("Comment id is required.");
  }

  if (!userId) {
    throw new Error("You must be signed in to edit comments.");
  }

  const existingComment = await getCommentRowById(commentId);
  if (!existingComment) {
    throw new Error("That comment no longer exists.");
  }

  if (existingComment.user_id !== userId) {
    throw new Error("You can only edit your own comments.");
  }

  if (existingComment.deleted_at) {
    throw new Error("Removed comments cannot be edited.");
  }

  if (!isCommentEditableByUser(existingComment, userId, Date.now())) {
    throw new Error(`Comments can only be edited for ${COMMENT_EDIT_WINDOW_MINUTES} minutes after posting.`);
  }

  const supabase = supabaseServer();
  const { error } = await supabase
    .from("user_comments")
    .update({
      body,
      edited_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", commentId);

  if (error) {
    throw new Error(messageFromDatabaseError(error, "We couldn't update your comment."));
  }

  await recordCommentActionEvent({
    actionType: "comment_edit",
    commentId,
    storyId: existingComment.story_id,
    userId,
  });
}

export async function setCommentVote(input: { commentId: string; userId: string; vote: -1 | 0 | 1 }) {
  const commentId = input.commentId.trim();
  const userId = input.userId.trim();

  if (!commentId) {
    throw new Error("Comment id is required.");
  }

  if (!userId) {
    throw new Error("You must be signed in to vote.");
  }

  const supabase = supabaseServer();
  const { data: existingComment, error: commentError } = await supabase
    .from("user_comments")
    .select("id, deleted_at, story_id")
    .eq("id", commentId)
    .maybeSingle();

  if (commentError) {
    throw new Error(messageFromDatabaseError(commentError, "We couldn't load that comment."));
  }

  if (!existingComment) {
    throw new Error("That comment no longer exists.");
  }

  if (existingComment.deleted_at) {
    throw new Error("You cannot vote on a removed comment.");
  }

  if (input.vote !== 0) {
    await enforceCommentRateLimit({
      actionType: "comment_vote",
      limit: COMMENT_VOTE_LIMIT_PER_HOUR,
      message: "You are voting too quickly. Please slow down and try again shortly.",
      userId,
      windowMs: 60 * 60 * 1000,
    });
  }

  if (input.vote === 0) {
    const { error } = await supabase.from("comment_votes").delete().eq("comment_id", commentId).eq("user_id", userId);
    if (error) {
      throw new Error(messageFromDatabaseError(error, "We couldn't update your vote."));
    }
    return;
  }

  const { error } = await supabase.from("comment_votes").upsert(
    {
      comment_id: commentId,
      updated_at: new Date().toISOString(),
      user_id: userId,
      vote: input.vote,
    },
    { onConflict: "comment_id,user_id" }
  );

  if (error) {
    throw new Error(messageFromDatabaseError(error, "We couldn't update your vote."));
  }

  await recordCommentActionEvent({
    actionType: "comment_vote",
    commentId,
    storyId: existingComment.story_id,
    userId,
  });
}

export async function removeCommentAsAdmin(commentId: string, adminUserId: string) {
  const normalizedCommentId = commentId.trim();
  const normalizedAdminUserId = adminUserId.trim();

  if (!normalizedCommentId) {
    throw new Error("Comment id is required.");
  }

  if (!normalizedAdminUserId) {
    throw new Error("Admin account is required.");
  }

  const supabase = supabaseServer();
  const { data: existingComment, error: loadError } = await supabase
    .from("user_comments")
    .select("id, deleted_at")
    .eq("id", normalizedCommentId)
    .maybeSingle();

  if (loadError) {
    throw new Error(messageFromDatabaseError(loadError, "We couldn't load that comment."));
  }

  if (!existingComment) {
    throw new Error("That comment no longer exists.");
  }

  if (existingComment.deleted_at) {
    return;
  }

  const { error } = await supabase
    .from("user_comments")
    .update({
      body: "",
      deleted_at: new Date().toISOString(),
      deleted_by: normalizedAdminUserId,
    })
    .eq("id", normalizedCommentId);

  if (error) {
    throw new Error(messageFromDatabaseError(error, "We couldn't remove that comment."));
  }
}

export async function removeOwnComment(commentId: string, userId: string) {
  const normalizedCommentId = commentId.trim();
  const normalizedUserId = userId.trim();

  if (!normalizedCommentId) {
    throw new Error("Comment id is required.");
  }

  if (!normalizedUserId) {
    throw new Error("You must be signed in to delete comments.");
  }

  const existingComment = await getCommentRowById(normalizedCommentId);
  if (!existingComment) {
    throw new Error("That comment no longer exists.");
  }

  if (existingComment.user_id !== normalizedUserId) {
    throw new Error("You can only delete your own comments.");
  }

  if (existingComment.deleted_at) {
    return;
  }

  const supabase = supabaseServer();
  const { error } = await supabase
    .from("user_comments")
    .update({
      body: "",
      deleted_at: new Date().toISOString(),
      deleted_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", normalizedCommentId);

  if (error) {
    throw new Error(messageFromDatabaseError(error, "We couldn't delete that comment."));
  }
}

export async function hardDeleteCommentThreadAsAdmin(commentId: string, adminUserId: string) {
  const normalizedCommentId = commentId.trim();
  const normalizedAdminUserId = adminUserId.trim();

  if (!normalizedCommentId) {
    throw new Error("Comment id is required.");
  }

  if (!normalizedAdminUserId) {
    throw new Error("Admin account is required.");
  }

  const existingComment = await getCommentRowById(normalizedCommentId);
  if (!existingComment) {
    throw new Error("That comment no longer exists.");
  }

  const supabase = supabaseServer();
  const { error } = await supabase.from("user_comments").delete().eq("id", normalizedCommentId);

  if (error) {
    throw new Error(messageFromDatabaseError(error, "We couldn't fully delete that comment thread."));
  }
}

export async function reportComment(input: {
  commentId: string;
  details?: string | null;
  reason: string;
  userId: string;
}) {
  const commentId = input.commentId.trim();
  const userId = input.userId.trim();
  const reason = normalizeReportReason(input.reason);
  const details = normalizeReportDetails(input.details);

  if (!commentId) {
    throw new Error("Comment id is required.");
  }

  if (!userId) {
    throw new Error("You must be signed in to report comments.");
  }

  await enforceCommentRateLimit({
    actionType: "comment_report",
    limit: COMMENT_REPORT_LIMIT_PER_DAY,
    message: "You have reached the daily report limit.",
    userId,
    windowMs: 24 * 60 * 60 * 1000,
  });

  const targetComment = await getCommentRowById(commentId);
  if (!targetComment) {
    throw new Error("That comment no longer exists.");
  }

  if (targetComment.deleted_at) {
    throw new Error("Removed comments cannot be reported.");
  }

  if (targetComment.user_id === userId) {
    throw new Error("You cannot report your own comment.");
  }

  const reporterUsername = await getUsernameForUser(userId);
  const supabase = supabaseServer();
  const { error } = await supabase.from("comment_reports").insert({
    comment_id: commentId,
    details,
    reason,
    reporter_user_id: userId,
  });

  if (error) {
    throw new Error(messageFromDatabaseError(error, "We couldn't submit your report."));
  }

  await recordCommentActionEvent({
    actionType: "comment_report",
    commentId,
    storyId: targetComment.story_id,
    userId,
  });

  await notifyAdminsAboutCommentReport({
    commentId,
    details,
    reason,
    reporterUsername,
    storyId: targetComment.story_id,
  });
}

export async function listAccountCommentHistory(
  userId: string,
  options?: { limit?: number; offset?: number }
): Promise<AccountCommentHistoryResult> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new Error("Account id is required.");
  }

  const limit = clampInt(options?.limit ?? 5, 1, 25);
  const offset = clampInt(options?.offset ?? 0, 0, 500);
  const supabase = supabaseServer();

  const [
    { data: commentRows, error: commentError },
    { count, error: countError },
  ] = await Promise.all([
    supabase
      .from("user_comments")
      .select("id, story_id, body, created_at")
      .eq("user_id", normalizedUserId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    supabase
      .from("user_comments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", normalizedUserId)
      .is("deleted_at", null),
  ]);

  if (commentError) {
    throw new Error(messageFromDatabaseError(commentError, "We couldn't load comment history."));
  }

  if (countError) {
    throw new Error(messageFromDatabaseError(countError, "We couldn't load comment totals."));
  }

  const typedCommentRows = (commentRows ?? []) as Array<{
    body: string;
    created_at: string;
    id: string;
    story_id: string;
  }>;
  const storyIds = Array.from(new Set(typedCommentRows.map((row) => row.story_id)));
  const storiesById = new Map<string, string>();

  if (storyIds.length > 0) {
    const { data: storyRows, error: storyError } = await supabase.from("stories").select("id, title").in("id", storyIds);
    if (storyError) {
      throw new Error(messageFromDatabaseError(storyError, "We couldn't load story titles."));
    }

    for (const row of (storyRows ?? []) as Array<{ id: string; title: string }>) {
      storiesById.set(row.id, row.title);
    }
  }

  return {
    comments: typedCommentRows.map((row) => ({
      body: row.body,
      createdAt: row.created_at,
      id: row.id,
      storyId: row.story_id,
      storyTitle: storiesById.get(row.story_id) ?? null,
    })),
    totalCount: count ?? 0,
  };
}

export async function listCommentReportsForAdmin(status: CommentReportStatus = "open"): Promise<AdminCommentReport[]> {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("comment_reports")
    .select("id, reason, details, status, created_at, comment_id, reporter_user_id")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(messageFromDatabaseError(error, "We couldn't load comment reports."));
  }

  const reportRows = (data ?? []) as Array<{
    comment_id: string;
    created_at: string;
    details: string | null;
    id: string;
    reason: string;
    reporter_user_id: string;
    status: CommentReportStatus;
  }>;

  if (reportRows.length === 0) return [];

  const commentIds = Array.from(new Set(reportRows.map((row) => row.comment_id)));
  const userIds = Array.from(new Set(reportRows.map((row) => row.reporter_user_id)));
  const { data: commentsData, error: commentsError } = await supabase
    .from("user_comments")
    .select("id, user_id, story_id, body, created_at, edited_at, deleted_at")
    .in("id", commentIds);

  if (commentsError) {
    throw new Error(messageFromDatabaseError(commentsError, "We couldn't load reported comments."));
  }

  const typedComments = (commentsData ?? []) as Array<{
    body: string;
    created_at: string;
    deleted_at: string | null;
    edited_at: string | null;
    id: string;
    story_id: string;
    user_id: string;
  }>;
  for (const row of typedComments) {
    userIds.push(row.user_id);
  }

  const uniqueUserIds = Array.from(new Set(userIds));
  const storyIds = Array.from(new Set(typedComments.map((row) => row.story_id)));

  const [{ data: usersData, error: usersError }, { data: storiesData, error: storiesError }] = await Promise.all([
    supabase.from("user_profiles").select("user_id, username").in("user_id", uniqueUserIds),
    supabase.from("stories").select("id, title").in("id", storyIds),
  ]);

  if (usersError) {
    throw new Error(messageFromDatabaseError(usersError, "We couldn't load report users."));
  }

  if (storiesError) {
    throw new Error(messageFromDatabaseError(storiesError, "We couldn't load report stories."));
  }

  const commentsById = new Map(typedComments.map((row) => [row.id, row]));
  const usernamesByUserId = new Map(((usersData ?? []) as Array<{ user_id: string; username: string }>).map((row) => [row.user_id, row.username]));
  const storiesById = new Map(((storiesData ?? []) as Array<{ id: string; title: string }>).map((row) => [row.id, row.title]));

  return reportRows
    .map((row) => {
      const comment = commentsById.get(row.comment_id);
      if (!comment) return null;

      return {
        comment: {
          body: comment.deleted_at ? null : comment.body,
          createdAt: comment.created_at,
          deleted: Boolean(comment.deleted_at),
          editedAt: comment.edited_at,
          id: comment.id,
          storyId: comment.story_id,
          username: usernamesByUserId.get(comment.user_id) ?? "Reader",
        },
        createdAt: row.created_at,
        details: row.details,
        id: row.id,
        reason: row.reason,
        reporterUsername: usernamesByUserId.get(row.reporter_user_id) ?? "Reader",
        status: row.status,
        storyTitle: storiesById.get(comment.story_id) ?? null,
      } satisfies AdminCommentReport;
    })
    .filter((row): row is AdminCommentReport => Boolean(row));
}

export async function updateCommentReportStatus(
  reportId: string,
  status: Exclude<CommentReportStatus, "open">,
  reviewedByUserId: string
) {
  const normalizedReportId = reportId.trim();
  const normalizedReviewedByUserId = reviewedByUserId.trim();
  if (!normalizedReportId) {
    throw new Error("Report id is required.");
  }
  if (!normalizedReviewedByUserId) {
    throw new Error("Admin user id is required.");
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("comment_reports")
    .update({
      reviewed_by: normalizedReviewedByUserId,
      reviewed_at: new Date().toISOString(),
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", normalizedReportId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(messageFromDatabaseError(error, "We couldn't update that report."));
  }

  if (!data) {
    throw new Error("That report no longer exists.");
  }
}
