"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { emitStoryCommentCountUpdated } from "@/app/lib/comment-events";
import { formatUpdatedAgo, formatUpdatedAt } from "@/app/lib/dates";

type CommentSort = "controversial" | "most-liked" | "new" | "old" | "top";

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
  error?: string;
  totalCount?: number;
};

type CommentsSectionProps = {
  authenticated: boolean;
  currentUserId: string | null;
  isAdmin: boolean;
  storyId: string;
};

type CommentCardProps = {
  activeReplyParentId: string | null;
  authenticated: boolean;
  busyAction: string | null;
  comment: StoryComment;
  editingCommentId: string | null;
  editDraft: string;
  isAdmin: boolean;
  onDelete: (commentId: string) => Promise<void>;
  onEditCancel: () => void;
  onEditDraftChange: (value: string) => void;
  onEditSave: (commentId: string) => Promise<void>;
  onEditStart: (comment: StoryComment) => void;
  onOpenReport: (comment: StoryComment) => void;
  onReplyToggle: (commentId: string) => void;
  onReplySubmit: (commentId: string) => Promise<void>;
  onShowAuthDialog: (actionLabel: string) => void;
  onVote: (commentId: string, nextVote: -1 | 1, currentVote: -1 | 0 | 1) => Promise<void>;
  replyDraft: string;
  setReplyDraft: (value: string) => void;
};

const SORT_OPTIONS: Array<{ label: string; value: CommentSort }> = [
  { label: "Top", value: "top" },
  { label: "New", value: "new" },
  { label: "Controversial", value: "controversial" },
  { label: "Most Liked", value: "most-liked" },
  { label: "Old", value: "old" },
];

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
  comment,
  editingCommentId,
  editDraft,
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
  onVote,
  replyDraft,
  setReplyDraft,
}: CommentCardProps) {
  const showingReplyBox = activeReplyParentId === comment.id;
  const editing = editingCommentId === comment.id;
  const voteBusy = busyAction === `vote:${comment.id}`;
  const deleteBusy = busyAction === `delete:${comment.id}`;
  const replyBusy = busyAction === `reply:${comment.id}`;
  const editBusy = busyAction === `edit:${comment.id}`;
  const [showAllReplies, setShowAllReplies] = useState(comment.children.length <= 3);
  const visibleChildren = showAllReplies ? comment.children : comment.children.slice(0, 3);

  return (
    <div className={`${comment.depth > 0 ? "mt-4 border-l border-[#163754] pl-5" : ""}`}>
      <article id={`comment-${comment.id}`} className="rounded-2xl border border-[#13314b] bg-[#04111b] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-neutral-100">{comment.username}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.16em] text-neutral-500" title={formatUpdatedAt(comment.createdAt)}>
              {formatUpdatedAgo(comment.createdAt)}
            </div>
          </div>

          {!comment.deleted ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void onVote(comment.id, 1, comment.viewerVote)}
                disabled={voteBusy}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  comment.viewerVote === 1
                    ? "border-[#8f7740]/80 bg-[#8f7740]/15 text-[#e3cca0]"
                    : "border-[#0d2438] bg-[#020b14] text-[#d7e2ef] hover:bg-[#03101b]"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                Thumbs up {comment.upvotes}
              </button>
              <button
                type="button"
                onClick={() => void onVote(comment.id, -1, comment.viewerVote)}
                disabled={voteBusy}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  comment.viewerVote === -1
                    ? "border-[#7d2a2a]/80 bg-[#7d2a2a]/15 text-[#f1b6b6]"
                    : "border-[#0d2438] bg-[#020b14] text-[#d7e2ef] hover:bg-[#03101b]"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                Thumbs down {comment.downvotes}
              </button>
            </div>
          ) : null}
        </div>

        {comment.deleted ? (
          <p className="mt-4 text-sm italic leading-7 text-neutral-500">{comment.removedMessage ?? "Comment removed."}</p>
        ) : editing ? (
          <div className="mt-4">
            <textarea
              value={editDraft}
              onChange={(event) => onEditDraftChange(event.target.value)}
              rows={4}
              className="w-full resize-y rounded-2xl border border-[#163754] bg-[#020b14] px-4 py-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]/60"
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
            <p className="whitespace-pre-wrap text-sm leading-7 text-neutral-300">{comment.body}</p>
            {comment.editedAt ? <div className="mt-2 text-xs uppercase tracking-[0.16em] text-neutral-500">Edited</div> : null}
          </div>
        )}

        {!comment.deleted ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {comment.canEdit ? (
              <button
                type="button"
                onClick={() => onEditStart(comment)}
                className="text-sm font-medium text-neutral-300 transition hover:text-white"
              >
                Edit
              </button>
            ) : null}
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
            {authenticated && !comment.viewerOwns ? (
              <button
                type="button"
                onClick={() => onOpenReport(comment)}
                className="text-sm font-medium text-neutral-300 transition hover:text-white"
              >
                Report
              </button>
            ) : null}

            {comment.totalReplies > 0 ? (
              <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">
                {comment.totalReplies} {comment.totalReplies === 1 ? "reply" : "replies"}
              </div>
            ) : null}

            {isAdmin ? (
              <button
                type="button"
                onClick={() => void onDelete(comment.id)}
                disabled={deleteBusy}
                className="text-sm font-medium text-[#f0b7b7] transition hover:text-[#ffd2d2] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleteBusy ? "Removing..." : "Delete"}
              </button>
            ) : null}
          </div>
        ) : null}

        {showingReplyBox ? (
          <div className="mt-5 rounded-2xl border border-[#163754] bg-[#03101b] p-4">
            <textarea
              value={replyDraft}
              onChange={(event) => setReplyDraft(event.target.value)}
              rows={4}
              className="w-full resize-y rounded-2xl border border-[#163754] bg-[#020b14] px-4 py-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]/60"
              placeholder="Write a reply..."
            />
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void onReplySubmit(comment.id)}
                disabled={replyBusy}
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

      {comment.children.length > 0 ? (
        <div className="space-y-0">
          {visibleChildren.map((child) => (
            <CommentCard
              key={child.id}
              activeReplyParentId={activeReplyParentId}
              authenticated={authenticated}
              busyAction={busyAction}
              comment={child}
              editingCommentId={editingCommentId}
              editDraft={editDraft}
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
              onVote={onVote}
              replyDraft={replyDraft}
              setReplyDraft={setReplyDraft}
            />
          ))}
          {!showAllReplies && comment.children.length > 3 ? (
            <button
              type="button"
              onClick={() => setShowAllReplies(true)}
              className="mt-4 text-sm font-medium text-[#d9bf82] transition hover:text-[#edd7a8]"
            >
              Show {comment.children.length - 3} more {comment.children.length - 3 === 1 ? "reply" : "replies"}
            </button>
          ) : null}
          {showAllReplies && comment.children.length > 3 ? (
            <button
              type="button"
              onClick={() => setShowAllReplies(false)}
              className="mt-4 text-sm font-medium text-neutral-400 transition hover:text-neutral-200"
            >
              Collapse replies
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function CommentsSection({ authenticated, currentUserId, isAdmin, storyId }: CommentsSectionProps) {
  const [comments, setComments] = useState<StoryComment[]>([]);
  const [composerDraft, setComposerDraft] = useState("");
  const [editDraft, setEditDraft] = useState("");
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

  const loadComments = useCallback(async (nextSort: CommentSort) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/comments/stories/${encodeURIComponent(storyId)}?sort=${encodeURIComponent(nextSort)}`, {
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as StoryCommentsResponse;
      if (!response.ok) {
        throw new Error(data.error ?? "We couldn't load comments.");
      }

      setComments(Array.isArray(data.comments) ? data.comments : []);
      setTotalCount(Number(data.totalCount ?? 0));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "We couldn't load comments.");
      setComments([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [storyId]);

  useEffect(() => {
    setSort("top");
    void loadComments("top");
  }, [loadComments, storyId]);

  useEffect(() => {
    emitStoryCommentCountUpdated(storyId, totalCount);
  }, [storyId, totalCount]);

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

    setBusyAction(`vote:${commentId}`);
    setError(null);

    try {
      const response = await fetch(`/api/comments/${encodeURIComponent(commentId)}/vote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vote: currentVote === nextVote ? 0 : nextVote }),
      });

      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "We couldn't update your vote.");
      }

      await loadComments(sort);
    } catch (voteError) {
      setError(voteError instanceof Error ? voteError.message : "We couldn't update your vote.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDelete(commentId: string) {
    if (!isAdmin) return;
    if (typeof window !== "undefined" && !window.confirm("Delete this comment? Replies will stay attached to a removed placeholder.")) {
      return;
    }

    setBusyAction(`delete:${commentId}`);
    setError(null);

    try {
      const response = await fetch(`/api/comments/${encodeURIComponent(commentId)}`, {
        method: "DELETE",
      });

      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "We couldn't remove that comment.");
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
    setReplyParentId(commentId);
    setReplyDraft("");
  }

  return (
    <section className="mt-10 rounded-2xl border border-[#13314b] bg-[#03101b] p-6 shadow-[0_16px_38px_rgba(0,0,0,0.18)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2 className="text-lg font-semibold">Comments</h2>
        <label className="flex items-center gap-3 text-sm text-neutral-400">
          <span>Sort</span>
          <select
            value={sort}
            onChange={(event) => void changeSort(event.target.value as CommentSort)}
            disabled={loading}
            className="rounded-full border border-[#0d2438] bg-[#020b14] px-4 py-2 text-sm text-[#d7e2ef] outline-none transition hover:bg-[#03101b] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 rounded-xl border border-[#13314b] bg-[#04111b] p-3">
        <textarea
          value={composerDraft}
          onChange={(event) => setComposerDraft(event.target.value)}
          rows={2}
          className="w-full resize-y rounded-xl border border-[#163754] bg-[#020b14] px-4 py-2.5 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]/60"
          placeholder="Add a comment..."
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => void submitComment(null)}
            disabled={busyAction === "post"}
            className="inline-flex rounded-full border border-[#8f7740]/70 bg-[#07101a] px-5 py-2 text-sm font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyAction === "post" ? "Posting..." : "Post"}
          </button>
        </div>
      </div>

      {error ? <div className="mt-5 text-sm text-[#f0b7b7]">{error}</div> : null}

      {loading ? (
        <div className="mt-6 rounded-2xl border border-[#13314b] bg-[#04111b] p-6 text-sm text-neutral-400">Loading comments...</div>
      ) : comments.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-[#13314b] bg-[#04111b] p-6 text-sm leading-7 text-neutral-400">
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
              comment={comment}
              editingCommentId={editingCommentId}
              editDraft={editDraft}
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
              onVote={handleVote}
              replyDraft={replyDraft}
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
