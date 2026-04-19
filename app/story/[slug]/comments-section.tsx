"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { emitStoryCommentCountUpdated } from "@/app/lib/comment-events";
import { formatUpdatedAgo, formatUpdatedAt } from "@/app/lib/dates";
import { supabaseBrowser } from "@/app/lib/supabase-browser";

type CommentSort = "controversial" | "most-liked" | "new" | "old" | "top";
type StaffRole = "admin" | "moderator" | "reader";
type CommunitySettings = {
  allowCommentRealtime: boolean;
  allowCommentReplies: boolean;
  allowCommentVoting: boolean;
  allowNewComments: boolean;
  commentsReadOnly: boolean;
};

type StoryComment = {
  body: string | null;
  canEdit: boolean;
  children: StoryComment[];
  createdAt: string;
  deleted: boolean;
  depth: number;
  downvotes: number;
  editedAt: string | null;
  id: string;
  parentCommentId: string | null;
  removedMessage: string | null;
  storyId: string;
  staffRole: StaffRole;
  totalReplies: number;
  updatedAt: string;
  upvotes: number;
  userId: string;
  username: string;
  viewerOwns: boolean;
  viewerVote: -1 | 0 | 1;
};

type StoryCommentsResponse = {
  comments?: StoryComment[];
  communitySettings?: CommunitySettings;
  error?: string;
  totalCount?: number;
};

type CommentsSectionProps = {
  authenticated: boolean;
  currentUserId: string | null;
  embedded?: boolean;
  isAdmin: boolean;
  storyId: string;
};

type CommentCardProps = {
  activeReplyParentId: string | null;
  authenticated: boolean;
  busyAction: string | null;
  collapsed: boolean;
  comment: StoryComment;
  communitySettings: CommunitySettings;
  collapsedCommentIds: Record<string, boolean>;
  editingCommentId: string | null;
  editDraft: string;
  expandedReplyIds: Record<string, boolean>;
  isAdmin: boolean;
  onDelete: (comment: StoryComment, mode: "purge" | "soft") => Promise<void>;
  onEditCancel: () => void;
  onEditDraftChange: (value: string) => void;
  onEditSave: (commentId: string) => Promise<void>;
  onEditStart: (comment: StoryComment) => void;
  onOpenReport: (comment: StoryComment) => void;
  onReplyToggle: (commentId: string) => void;
  onReplySubmit: (commentId: string) => Promise<void>;
  onShowAuthDialog: (actionLabel: string) => void;
  onToggleCollapsed: (commentId: string) => void;
  onToggleReplies: (commentId: string) => void;
  onVote: (commentId: string, nextVote: -1 | 1, currentVote: -1 | 0 | 1) => Promise<void>;
  replyDraft: string;
  repliesExpanded: boolean;
  setReplyDraft: (value: string) => void;
};

const SORT_OPTIONS: Array<{ label: string; value: CommentSort }> = [
  { label: "Top", value: "top" },
  { label: "New", value: "new" },
  { label: "Controversial", value: "controversial" },
  { label: "Most Liked", value: "most-liked" },
  { label: "Old", value: "old" },
];

function ThumbUpIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M9 22H5.5A1.5 1.5 0 0 1 4 20.5v-8A1.5 1.5 0 0 1 5.5 11H9m0 11V11m0 11h7.165a2 2 0 0 0 1.942-1.52l1.286-5.5A2 2 0 0 0 17.445 11H14V7.5c0-1.933-1.567-3.5-3.5-3.5L9 11"
      />
    </svg>
  );
}

function ThumbDownIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M15 2h3.5A1.5 1.5 0 0 1 20 3.5v8A1.5 1.5 0 0 1 18.5 13H15M15 2v11m0-11H7.835a2 2 0 0 0-1.942 1.52l-1.286 5.5A2 2 0 0 0 6.555 13H10v3.5c0 1.933 1.567 3.5 3.5 3.5L15 13"
      />
    </svg>
  );
}

function CollapseToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
      <rect x="2.5" y="2.5" width="15" height="15" rx="3" />
      <path strokeLinecap="round" d="M6 10h8" />
      {collapsed ? <path strokeLinecap="round" d="M10 6v8" /> : null}
    </svg>
  );
}

function collectCommentIds(commentTree: StoryComment[], ids = new Set<string>()) {
  for (const comment of commentTree) {
    ids.add(comment.id);
    collectCommentIds(comment.children, ids);
  }

  return ids;
}

function commentStaffBadge(role: StaffRole) {
  if (role === "admin") return "admin";
  if (role === "moderator") return "mod";
  return null;
}

function pruneCommentUiState(state: Record<string, boolean>, commentTree: StoryComment[]) {
  const validIds = collectCommentIds(commentTree);
  const nextState: Record<string, boolean> = {};

  for (const [commentId, value] of Object.entries(state)) {
    if (value && validIds.has(commentId)) {
      nextState[commentId] = true;
    }
  }

  return nextState;
}

function updateCommentTree(
  commentTree: StoryComment[],
  commentId: string,
  updater: (comment: StoryComment) => StoryComment
): StoryComment[] {
  let changed = false;

  const nextTree = commentTree.map((comment) => {
    let nextComment = comment;

    if (comment.id === commentId) {
      nextComment = updater(comment);
      changed = true;
    }

    const nextChildren = updateCommentTree(comment.children, commentId, updater);
    if (nextChildren !== comment.children) {
      nextComment = { ...nextComment, children: nextChildren };
      changed = true;
    }

    return nextComment;
  });

  return changed ? nextTree : commentTree;
}

function findCommentPath(commentTree: StoryComment[], targetCommentId: string, path: string[] = []): string[] | null {
  for (const comment of commentTree) {
    const nextPath = [...path, comment.id];
    if (comment.id === targetCommentId) {
      return nextPath;
    }

    const childPath = findCommentPath(comment.children, targetCommentId, nextPath);
    if (childPath) {
      return childPath;
    }
  }

  return null;
}

function AuthRequiredDialog({
  actionLabel,
  onClose,
}: {
  actionLabel: string | null;
  onClose: () => void;
}) {
  if (!actionLabel) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-6"
      role="alertdialog"
      aria-labelledby="comment-auth-dialog-title"
      aria-describedby="comment-auth-dialog-description"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-3xl border border-[#15324d] bg-[#03101b] p-7 shadow-[0_30px_80px_rgba(0,0,0,0.48)]">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Sign in required</div>
        <h3 id="comment-auth-dialog-title" className="mt-3 text-2xl font-semibold text-neutral-100">
          You need an account for that
        </h3>
        <p id="comment-auth-dialog-description" className="mt-4 text-sm leading-7 text-neutral-300">
          Please sign in to {actionLabel}.{" "}
          <Link href="/account/login" className="text-[#d9bf82] underline decoration-[#8f7740]/60 underline-offset-4">
            Log in here
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 inline-flex rounded-full border border-[#0d2438] bg-[#020b14] px-5 py-2 text-sm text-neutral-100 transition hover:border-[#163754] hover:bg-[#03101b]"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function ReportDialog({
  details,
  onClose,
  onDetailsChange,
  onReasonChange,
  onSubmit,
  reason,
  submitting,
}: {
  details: string;
  onClose: () => void;
  onDetailsChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onSubmit: () => Promise<void>;
  reason: string;
  submitting: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-6"
      role="dialog"
      aria-labelledby="comment-report-dialog-title"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-3xl border border-[#15324d] bg-[#03101b] p-7 shadow-[0_30px_80px_rgba(0,0,0,0.48)]">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Report comment</div>
        <h3 id="comment-report-dialog-title" className="mt-3 text-2xl font-semibold text-neutral-100">
          Send a moderator report
        </h3>
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-sm text-neutral-300">Reason</span>
            <select
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-[#163754] bg-[#020b14] px-4 py-3 text-sm text-neutral-100 outline-none focus:border-[#8f7740]/60"
            >
              <option value="Harassment or hate speech">Harassment or hate speech</option>
              <option value="Spam or manipulation">Spam or manipulation</option>
              <option value="Threats or violence">Threats or violence</option>
              <option value="Other rule concern">Other rule concern</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm text-neutral-300">Details</span>
            <textarea
              value={details}
              onChange={(event) => onDetailsChange(event.target.value)}
              rows={4}
              className="mt-2 w-full resize-y rounded-2xl border border-[#163754] bg-[#020b14] px-4 py-3 text-sm text-neutral-100 outline-none focus:border-[#8f7740]/60"
              placeholder="Optional context for admins"
            />
          </label>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={submitting}
            className="inline-flex rounded-full border border-[#8f7740]/70 bg-[#07101a] px-5 py-2 text-sm font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Sending..." : "Submit report"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex rounded-full border border-[#0d2438] bg-[#020b14] px-5 py-2 text-sm text-neutral-100 transition hover:border-[#163754] hover:bg-[#03101b]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentCard({
  activeReplyParentId,
  authenticated,
  busyAction,
  collapsed,
  comment,
  communitySettings,
  collapsedCommentIds,
  editingCommentId,
  editDraft,
  expandedReplyIds,
  isAdmin,
  onDelete,
  onEditCancel,
  onEditDraftChange,
  onEditSave,
  onEditStart,
  onOpenReport,
  onReplyToggle,
  onReplySubmit,
  onShowAuthDialog,
  onToggleCollapsed,
  onToggleReplies,
  onVote,
  replyDraft,
  repliesExpanded,
  setReplyDraft,
}: CommentCardProps) {
  const showingReplyBox = activeReplyParentId === comment.id;
  const editing = editingCommentId === comment.id;
  const voteBusy = busyAction === `vote:${comment.id}`;
  const deleteBusy = busyAction === `delete:${comment.id}`;
  const replyBusy = busyAction === `reply:${comment.id}`;
  const editBusy = busyAction === `edit:${comment.id}`;
  const staffBadge = commentStaffBadge(comment.staffRole);

  function handleCollapseToggle() {
    if (!collapsed) {
      if (showingReplyBox) {
        onReplyToggle(comment.id);
      }
      if (editing) {
        onEditCancel();
      }
    }

    onToggleCollapsed(comment.id);
  }

  return (
    <div className={`${comment.depth > 0 ? "mt-4 border-l border-[#1b3a54]/65 pl-5" : ""}`}>
      <article
        id={`comment-${comment.id}`}
        className={`rounded-2xl border border-[#183149]/60 bg-[#07131e]/76 ${collapsed ? "p-3.5" : "p-5"}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={handleCollapseToggle}
              className="inline-flex h-5 w-5 items-center justify-center text-neutral-400 transition hover:text-neutral-100"
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Expand comment" : "Collapse comment"}
              title={collapsed ? "Expand comment" : "Collapse comment"}
            >
              <CollapseToggleIcon collapsed={collapsed} />
            </button>
            <div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <div className="text-sm font-semibold text-neutral-100">{comment.username}</div>
                {staffBadge ? (
                  <span className="rounded-full border border-[#8f7740]/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d7c08d]">
                    {staffBadge}
                  </span>
                ) : null}
                <div
                  className="text-[11px] uppercase tracking-[0.16em] text-neutral-500"
                  title={formatUpdatedAt(comment.createdAt)}
                >
                  {formatUpdatedAgo(comment.createdAt)}
                </div>
              </div>
            </div>
          </div>

          {!comment.deleted && !collapsed ? (
            <div className="flex items-start gap-4">
              <button
                type="button"
                onClick={() => void onVote(comment.id, 1, comment.viewerVote)}
                disabled={voteBusy || !communitySettings.allowCommentVoting || communitySettings.commentsReadOnly}
                aria-label={`Thumbs up comment by ${comment.username}`}
                title="Thumbs up"
                className={`flex flex-col items-center gap-1 text-xs transition ${
                  comment.viewerVote === 1
                    ? "text-[#d9bf82]"
                    : "text-[#7fa8c9] hover:text-[#9fc0d9]"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <ThumbUpIcon className="block h-6 w-6" />
                <span className="text-[11px] font-semibold text-[#78c892]">{comment.upvotes}</span>
              </button>
              <button
                type="button"
                onClick={() => void onVote(comment.id, -1, comment.viewerVote)}
                disabled={voteBusy || !communitySettings.allowCommentVoting || communitySettings.commentsReadOnly}
                aria-label={`Thumbs down comment by ${comment.username}`}
                title="Thumbs down"
                className={`flex flex-col items-center gap-1 text-xs transition ${
                  comment.viewerVote === -1
                    ? "text-[#d9bf82]"
                    : "text-[#7fa8c9] hover:text-[#9fc0d9]"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <ThumbDownIcon className="block h-6 w-6" />
                <span className="text-[11px] font-semibold text-[#d98a8a]">{comment.downvotes}</span>
              </button>
            </div>
          ) : null}
        </div>

        {collapsed ? null : comment.deleted ? (
          <p className="mt-4 text-sm italic leading-7 text-neutral-500">{comment.removedMessage ?? "Comment removed."}</p>
        ) : editing ? (
          <div className="mt-4">
            <textarea
              value={editDraft}
              onChange={(event) => onEditDraftChange(event.target.value)}
              rows={4}
              className="w-full resize-y rounded-2xl border border-[#1c3953]/70 bg-[#08131d] px-4 py-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]/60"
            />
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void onEditSave(comment.id)}
                disabled={editBusy}
                  className="inline-flex rounded-full border border-[#8f7740]/70 bg-[#07101a] px-4 py-2 text-sm font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {editBusy ? "Saving..." : "Save edit"}
              </button>
              <button
                type="button"
                onClick={onEditCancel}
                  className="inline-flex rounded-full border border-[#0d2438] bg-[#020b14] px-4 py-2 text-sm text-[#d7e2ef] transition hover:border-[#163754] hover:bg-[#03101b]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <p className="whitespace-pre-wrap text-[15px] leading-7 text-neutral-300">{comment.body}</p>
            {comment.editedAt ? <div className="mt-2 text-xs uppercase tracking-[0.16em] text-neutral-500">Edited</div> : null}
          </div>
        )}

        {!comment.deleted && !collapsed ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {comment.canEdit && !communitySettings.commentsReadOnly ? (
              <button
                type="button"
                onClick={() => onEditStart(comment)}
                className="text-sm font-medium text-neutral-300 transition hover:text-white"
              >
                Edit
              </button>
            ) : null}
            {communitySettings.allowCommentReplies && !communitySettings.commentsReadOnly ? (
              <button
                type="button"
                onClick={() => {
                  if (!authenticated) {
                    onShowAuthDialog("reply");
                    return;
                  }

                  onReplyToggle(comment.id);
                }}
                className="text-sm font-medium text-neutral-300 transition hover:text-white"
              >
                Reply
              </button>
            ) : null}
            {authenticated && !comment.viewerOwns ? (
              <button
                type="button"
                onClick={() => onOpenReport(comment)}
                className="text-sm font-medium text-neutral-300 transition hover:text-white"
              >
                Report
              </button>
            ) : null}

            {comment.children.length > 0 ? (
              <button
                type="button"
                onClick={() => onToggleReplies(comment.id)}
                className="text-sm font-medium text-[#d9bf82] transition hover:text-[#edd7a8]"
              >
                {repliesExpanded ? "Hide Replies" : `View Replies (${comment.totalReplies})`}
              </button>
            ) : null}

            {comment.viewerOwns && !communitySettings.commentsReadOnly ? (
              <button
                type="button"
                onClick={() => void onDelete(comment, "soft")}
                disabled={deleteBusy}
                className="text-sm font-medium text-[#f0b7b7] transition hover:text-[#ffd2d2] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleteBusy ? "Deleting..." : "Delete"}
              </button>
            ) : null}

            {isAdmin ? (
              <button
                type="button"
                onClick={() => void onDelete(comment, "purge")}
                disabled={deleteBusy}
                className="text-sm font-medium text-[#f0b7b7] transition hover:text-[#ffd2d2] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleteBusy ? "Deleting..." : "Delete thread"}
              </button>
            ) : null}
          </div>
        ) : null}

        {comment.deleted && !collapsed && comment.children.length > 0 ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => onToggleReplies(comment.id)}
              className="text-sm font-medium text-[#d9bf82] transition hover:text-[#edd7a8]"
            >
              {repliesExpanded ? "Hide Replies" : `View Replies (${comment.totalReplies})`}
            </button>
          </div>
        ) : null}

        {showingReplyBox && !collapsed ? (
          <div className="mt-5 rounded-2xl border border-[#183149]/60 bg-[#08131d]/80 p-4">
            <textarea
              value={replyDraft}
              onChange={(event) => setReplyDraft(event.target.value)}
              rows={4}
              className="w-full resize-y rounded-2xl border border-[#1c3953]/70 bg-[#08131d] px-4 py-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]/60"
              placeholder="Write a reply..."
            />
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void onReplySubmit(comment.id)}
                disabled={replyBusy || communitySettings.commentsReadOnly || !communitySettings.allowCommentReplies}
                className="inline-flex rounded-full border border-[#8f7740]/70 bg-[#07101a] px-4 py-2 text-sm font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {replyBusy ? "Posting..." : "Post reply"}
              </button>
              <button
                type="button"
                onClick={() => onReplyToggle(comment.id)}
                className="inline-flex rounded-full border border-[#0d2438] bg-[#020b14] px-4 py-2 text-sm text-[#d7e2ef] transition hover:border-[#163754] hover:bg-[#03101b]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </article>

      {comment.children.length > 0 && repliesExpanded && !collapsed ? (
        <div className="space-y-0">
          {comment.children.map((child) => (
            <CommentCard
              key={child.id}
              activeReplyParentId={activeReplyParentId}
              authenticated={authenticated}
              busyAction={busyAction}
              collapsed={Boolean(collapsedCommentIds[child.id])}
              comment={child}
              communitySettings={communitySettings}
              collapsedCommentIds={collapsedCommentIds}
              editingCommentId={editingCommentId}
              editDraft={editDraft}
              expandedReplyIds={expandedReplyIds}
              isAdmin={isAdmin}
              onDelete={onDelete}
              onEditCancel={onEditCancel}
              onEditDraftChange={onEditDraftChange}
              onEditSave={onEditSave}
              onEditStart={onEditStart}
              onOpenReport={onOpenReport}
              onReplyToggle={onReplyToggle}
              onReplySubmit={onReplySubmit}
              onShowAuthDialog={onShowAuthDialog}
              onToggleCollapsed={onToggleCollapsed}
              onToggleReplies={onToggleReplies}
              onVote={onVote}
              replyDraft={replyDraft}
              repliesExpanded={Boolean(expandedReplyIds[child.id])}
              setReplyDraft={setReplyDraft}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function CommentsSection({ authenticated, currentUserId, embedded = false, isAdmin, storyId }: CommentsSectionProps) {
  const [communitySettings, setCommunitySettings] = useState<CommunitySettings>({
    allowCommentRealtime: true,
    allowCommentReplies: true,
    allowCommentVoting: true,
    allowNewComments: true,
    commentsReadOnly: false,
  });
  const [comments, setComments] = useState<StoryComment[]>([]);
  const [collapsedCommentIds, setCollapsedCommentIds] = useState<Record<string, boolean>>({});
  const [composerDraft, setComposerDraft] = useState("");
  const [editDraft, setEditDraft] = useState("");
  const [expandedReplyIds, setExpandedReplyIds] = useState<Record<string, boolean>>({});
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyParentId, setReplyParentId] = useState<string | null>(null);
  const [reportDetails, setReportDetails] = useState("");
  const [reportReason, setReportReason] = useState("Harassment or hate speech");
  const [reportingComment, setReportingComment] = useState<StoryComment | null>(null);
  const [sort, setSort] = useState<CommentSort>("top");
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authDialogAction, setAuthDialogAction] = useState<string | null>(null);
  const loadRequestRef = useRef(0);
  const historyFocusCommentRef = useRef<string | null>(null);
  const pendingRealtimeRefreshRef = useRef(false);
  const realtimeRefreshTimerRef = useRef<number | null>(null);

  const loadComments = useCallback(async (nextSort: CommentSort, options?: { background?: boolean }) => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;

    if (!options?.background) {
      setLoading(true);
      setError(null);
    }

    try {
      const response = await fetch(`/api/comments/stories/${encodeURIComponent(storyId)}?sort=${encodeURIComponent(nextSort)}`, {
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as StoryCommentsResponse;
      if (!response.ok) {
        throw new Error(data.error ?? "We couldn't load comments.");
      }

      if (loadRequestRef.current !== requestId) {
        return;
      }

      const nextComments = Array.isArray(data.comments) ? data.comments : [];
      const nextSettings = data.communitySettings ?? {
        allowCommentRealtime: true,
        allowCommentReplies: true,
        allowCommentVoting: true,
        allowNewComments: true,
        commentsReadOnly: false,
      };
      setComments(nextComments);
      setCommunitySettings(nextSettings);
      setCollapsedCommentIds((current) => pruneCommentUiState(current, nextComments));
      setExpandedReplyIds((current) => pruneCommentUiState(current, nextComments));
      setTotalCount(Number(data.totalCount ?? 0));
    } catch (loadError) {
      if (loadRequestRef.current !== requestId) {
        return;
      }

      if (!options?.background) {
        setError(loadError instanceof Error ? loadError.message : "We couldn't load comments.");
        setComments([]);
        setCommunitySettings({
          allowCommentRealtime: true,
          allowCommentReplies: true,
          allowCommentVoting: true,
          allowNewComments: true,
          commentsReadOnly: false,
        });
        setCollapsedCommentIds({});
        setExpandedReplyIds({});
        setTotalCount(0);
      }
    } finally {
      if (!options?.background && loadRequestRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [storyId]);

  useEffect(() => {
    setSort("top");
    void loadComments("top");
  }, [loadComments, storyId]);

  useEffect(() => {
    emitStoryCommentCountUpdated(storyId, totalCount);
  }, [storyId, totalCount]);

  useEffect(() => {
    historyFocusCommentRef.current = null;
  }, [storyId]);

  useEffect(() => {
    if (!communitySettings.allowCommentRealtime) {
      pendingRealtimeRefreshRef.current = false;
      return;
    }

    const flushRealtimeRefresh = () => {
      if (document.visibilityState !== "visible") return;
      if (loading || busyAction || editingCommentId || replyParentId || reportingComment) {
        pendingRealtimeRefreshRef.current = true;
        return;
      }

      pendingRealtimeRefreshRef.current = false;
      void loadComments(sort, { background: true });
    };

    const scheduleRealtimeRefresh = () => {
      if (realtimeRefreshTimerRef.current) {
        window.clearTimeout(realtimeRefreshTimerRef.current);
      }

      realtimeRefreshTimerRef.current = window.setTimeout(() => {
        realtimeRefreshTimerRef.current = null;
        flushRealtimeRefresh();
      }, 250);
    };

    let channel: ReturnType<ReturnType<typeof supabaseBrowser>["channel"]> | null = null;

    try {
      const supabase = supabaseBrowser();
      channel = supabase
        .channel(`story-comments:${storyId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            filter: `story_id=eq.${storyId}`,
            schema: "public",
            table: "user_comments",
          },
          scheduleRealtimeRefresh
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            filter: `story_id=eq.${storyId}`,
            schema: "public",
            table: "comment_vote_totals",
          },
          scheduleRealtimeRefresh
        )
        .subscribe();
    } catch {
      channel = null;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (pendingRealtimeRefreshRef.current) {
          flushRealtimeRefresh();
        }
      }
    };

    const handleWindowFocus = () => {
      if (pendingRealtimeRefreshRef.current) {
        flushRealtimeRefresh();
      }
    };

    if (!busyAction && !editingCommentId && !replyParentId && !reportingComment && pendingRealtimeRefreshRef.current) {
      flushRealtimeRefresh();
    }

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      if (realtimeRefreshTimerRef.current) {
        window.clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }
      if (channel) {
        void channel.unsubscribe();
      }
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [busyAction, communitySettings.allowCommentRealtime, editingCommentId, loadComments, loading, replyParentId, reportingComment, sort, storyId]);

  useEffect(() => {
    if (loading || comments.length === 0 || typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const commentFromQuery = params.get("comment")?.trim() ?? "";
    const hash = window.location.hash.startsWith("#comment-") ? window.location.hash.slice("#comment-".length).trim() : "";
    const targetCommentId = commentFromQuery || hash;

    if (!targetCommentId || historyFocusCommentRef.current === targetCommentId) {
      return;
    }

    const path = findCommentPath(comments, targetCommentId);
    if (!path) {
      return;
    }

    historyFocusCommentRef.current = targetCommentId;

    setCollapsedCommentIds((current) => {
      const next = { ...current };
      for (const commentId of path) {
        delete next[commentId];
      }
      return next;
    });

    setExpandedReplyIds((current) => {
      const next = { ...current };
      for (const commentId of path) {
        next[commentId] = true;
      }
      return next;
    });

    window.setTimeout(() => {
      const element = document.getElementById(`comment-${targetCommentId}`);
      if (!element) return;
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  }, [comments, loading]);

  async function changeSort(nextSort: CommentSort) {
    if (nextSort === sort) return;
    setSort(nextSort);
    await loadComments(nextSort);
  }

  async function submitComment(parentCommentId?: string | null) {
    if (!authenticated) {
      setAuthDialogAction(parentCommentId ? "reply" : "post a comment");
      return;
    }

    if (communitySettings.commentsReadOnly) {
      setError("Comments are temporarily read-only.");
      return;
    }

    if (parentCommentId && !communitySettings.allowCommentReplies) {
      setError("Replies are temporarily disabled.");
      return;
    }

    if (!parentCommentId && !communitySettings.allowNewComments) {
      setError("New comments are temporarily disabled.");
      return;
    }

    const draft = parentCommentId ? replyDraft : composerDraft;
    if (!draft.trim()) {
      setError(parentCommentId ? "Write a reply before posting." : "Write a comment before posting.");
      return;
    }

    setBusyAction(parentCommentId ? `reply:${parentCommentId}` : "post");
    setError(null);

    try {
      const response = await fetch(`/api/comments/stories/${encodeURIComponent(storyId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: draft,
          parentCommentId: parentCommentId ?? null,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "We couldn't save your comment.");
      }

      if (parentCommentId) {
        setExpandedReplyIds((current) => ({ ...current, [parentCommentId]: true }));
        setReplyDraft("");
        setReplyParentId(null);
      } else {
        setComposerDraft("");
      }

      await loadComments(sort);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "We couldn't save your comment.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleVote(commentId: string, nextVote: -1 | 1, currentVote: -1 | 0 | 1) {
    if (!authenticated) {
      setAuthDialogAction("vote on comments");
      return;
    }

    if (communitySettings.commentsReadOnly) {
      setError("Comments are temporarily read-only.");
      return;
    }

    if (!communitySettings.allowCommentVoting) {
      setError("Comment voting is temporarily disabled.");
      return;
    }

    setBusyAction(`vote:${commentId}`);
    setError(null);

    const finalVote = currentVote === nextVote ? 0 : nextVote;
    setComments((current) =>
      updateCommentTree(current, commentId, (comment) => {
        let upvotes = comment.upvotes;
        let downvotes = comment.downvotes;

        if (currentVote === 1) {
          upvotes = Math.max(0, upvotes - 1);
        } else if (currentVote === -1) {
          downvotes = Math.max(0, downvotes - 1);
        }

        if (finalVote === 1) {
          upvotes += 1;
        } else if (finalVote === -1) {
          downvotes += 1;
        }

        return {
          ...comment,
          downvotes,
          upvotes,
          viewerVote: finalVote,
        };
      })
    );

    try {
      const response = await fetch(`/api/comments/${encodeURIComponent(commentId)}/vote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vote: finalVote }),
      });

      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "We couldn't update your vote.");
      }
      void loadComments(sort, { background: true });
    } catch (voteError) {
      setComments((current) =>
        updateCommentTree(current, commentId, (comment) => {
          let upvotes = comment.upvotes;
          let downvotes = comment.downvotes;

          if (finalVote === 1) {
            upvotes = Math.max(0, upvotes - 1);
          } else if (finalVote === -1) {
            downvotes = Math.max(0, downvotes - 1);
          }

          if (currentVote === 1) {
            upvotes += 1;
          } else if (currentVote === -1) {
            downvotes += 1;
          }

          return {
            ...comment,
            downvotes,
            upvotes,
            viewerVote: currentVote,
          };
        })
      );
      setError(voteError instanceof Error ? voteError.message : "We couldn't update your vote.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDelete(comment: StoryComment, mode: "purge" | "soft") {
    const commentId = comment.id;
    const confirmationMessage =
      mode === "purge"
        ? "Permanently delete this comment and all of its replies?"
        : "Delete this comment? It will display as <deleted> and any replies will stay visible.";

    if (typeof window !== "undefined" && !window.confirm(confirmationMessage)) {
      return;
    }

    setBusyAction(`delete:${commentId}`);
    setError(null);

    try {
      const response = await fetch(`/api/comments/${encodeURIComponent(commentId)}?mode=${mode}`, {
        method: "DELETE",
      });

      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "We couldn't remove that comment.");
      }

      if (replyParentId === commentId) {
        setReplyParentId(null);
        setReplyDraft("");
      }
      if (editingCommentId === commentId) {
        setEditingCommentId(null);
        setEditDraft("");
      }

      await loadComments(sort);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "We couldn't remove that comment.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleEditSave(commentId: string) {
    setBusyAction(`edit:${commentId}`);
    setError(null);

    try {
      const response = await fetch(`/api/comments/${encodeURIComponent(commentId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: editDraft }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "We couldn't update that comment.");
      }

      setEditingCommentId(null);
      setEditDraft("");
      await loadComments(sort);
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : "We couldn't update that comment.");
    } finally {
      setBusyAction(null);
    }
  }

  function handleEditStart(comment: StoryComment) {
    setEditingCommentId(comment.id);
    setEditDraft(comment.body ?? "");
    setReplyParentId(null);
    setReplyDraft("");
    setReportingComment(null);
  }

  function handleOpenReport(comment: StoryComment) {
    if (!authenticated) {
      setAuthDialogAction("report comments");
      return;
    }

    if (comment.userId === currentUserId) {
      setError("You cannot report your own comment.");
      return;
    }

    setReportingComment(comment);
    setReportReason("Harassment or hate speech");
    setReportDetails("");
    setEditingCommentId(null);
    setReplyParentId(null);
    setReplyDraft("");
  }

  async function handleSubmitReport() {
    if (!reportingComment) return;

    setBusyAction(`report:${reportingComment.id}`);
    setError(null);

    try {
      const response = await fetch(`/api/comments/${encodeURIComponent(reportingComment.id)}/report`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          details: reportDetails,
          reason: reportReason,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "We couldn't submit your report.");
      }

      setReportingComment(null);
      setReportDetails("");
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "We couldn't submit your report.");
    } finally {
      setBusyAction(null);
    }
  }

  function toggleReply(commentId: string) {
    if (replyParentId === commentId) {
      setReplyParentId(null);
      setReplyDraft("");
      return;
    }

    setEditingCommentId(null);
    setReportingComment(null);
    setExpandedReplyIds((current) => ({ ...current, [commentId]: true }));
    setReplyParentId(commentId);
    setReplyDraft("");
  }

  function toggleCollapsed(commentId: string) {
    setCollapsedCommentIds((current) => {
      const next = { ...current };
      if (next[commentId]) {
        delete next[commentId];
      } else {
        next[commentId] = true;
      }
      return next;
    });
  }

  function toggleReplies(commentId: string) {
    setExpandedReplyIds((current) => {
      const next = { ...current };
      if (next[commentId]) {
        delete next[commentId];
      } else {
        next[commentId] = true;
      }
      return next;
    });
  }

  return (
    <section className={embedded ? "mt-6 border-t border-[#163754]/70 pt-5" : "mt-10 rounded-2xl border border-[#13314b] bg-[#03101b] p-6 shadow-[0_16px_38px_rgba(0,0,0,0.18)]"}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2 className={`font-semibold text-neutral-200 ${embedded ? "text-base" : "text-lg"}`}>Comments</h2>
        <label className={`flex items-center gap-3 text-neutral-400 ${embedded ? "text-[13px]" : "text-sm"}`}>
          <span>Sort</span>
          <select
            value={sort}
            onChange={(event) => void changeSort(event.target.value as CommentSort)}
            disabled={loading}
            className={`rounded-full border border-[#1c3953]/70 bg-[#08131d] text-[#d7e2ef] outline-none transition hover:bg-[#0b1824] disabled:cursor-not-allowed disabled:opacity-60 ${embedded ? "px-3.5 py-1.5 text-[13px]" : "px-4 py-2 text-sm"}`}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 rounded-[20px] border border-[#183149]/60 bg-[#07131e]/76 p-4">
        <textarea
          value={composerDraft}
          onChange={(event) => setComposerDraft(event.target.value)}
          rows={2}
          className="w-full resize-y rounded-xl border border-[#1c3953]/70 bg-[#08131d] px-4 py-2.5 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]/60"
          disabled={communitySettings.commentsReadOnly || !communitySettings.allowNewComments}
          placeholder={
            communitySettings.commentsReadOnly
              ? "Comments are temporarily read-only."
              : communitySettings.allowNewComments
                ? "Add a comment..."
                : "New comments are temporarily disabled."
          }
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => void submitComment(null)}
            disabled={busyAction === "post" || communitySettings.commentsReadOnly || !communitySettings.allowNewComments}
            className="inline-flex rounded-full border border-[#8f7740]/70 bg-[#07101a] px-5 py-2 text-sm font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyAction === "post" ? "Posting..." : "Post"}
          </button>
        </div>
      </div>

      {error ? <div className="mt-5 text-sm text-[#f0b7b7]">{error}</div> : null}

      {loading ? (
        <div className="mt-6 rounded-2xl border border-[#183149]/60 bg-[#07131e]/76 p-6 text-sm text-neutral-400">Loading comments...</div>
      ) : comments.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-[#183149]/60 bg-[#07131e]/76 p-6 text-sm leading-7 text-neutral-400">
          No comments yet. Start the conversation.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {comments.map((comment) => (
            <CommentCard
              key={comment.id}
              activeReplyParentId={replyParentId}
              authenticated={authenticated}
              busyAction={busyAction}
              collapsed={Boolean(collapsedCommentIds[comment.id])}
              comment={comment}
              communitySettings={communitySettings}
              collapsedCommentIds={collapsedCommentIds}
              editingCommentId={editingCommentId}
              editDraft={editDraft}
              expandedReplyIds={expandedReplyIds}
              isAdmin={isAdmin}
              onDelete={handleDelete}
              onEditCancel={() => {
                setEditingCommentId(null);
                setEditDraft("");
              }}
              onEditDraftChange={setEditDraft}
              onEditSave={handleEditSave}
              onEditStart={handleEditStart}
              onOpenReport={handleOpenReport}
              onReplyToggle={toggleReply}
              onReplySubmit={async (commentId) => submitComment(commentId)}
              onShowAuthDialog={setAuthDialogAction}
              onToggleCollapsed={toggleCollapsed}
              onToggleReplies={toggleReplies}
              onVote={handleVote}
              replyDraft={replyDraft}
              repliesExpanded={Boolean(expandedReplyIds[comment.id])}
              setReplyDraft={setReplyDraft}
            />
          ))}
        </div>
      )}

      {reportingComment ? (
        <ReportDialog
          details={reportDetails}
          onClose={() => setReportingComment(null)}
          onDetailsChange={setReportDetails}
          onReasonChange={setReportReason}
          onSubmit={handleSubmitReport}
          reason={reportReason}
          submitting={busyAction === `report:${reportingComment.id}`}
        />
      ) : null}
      <AuthRequiredDialog actionLabel={authDialogAction} onClose={() => setAuthDialogAction(null)} />
    </section>
  );
}
