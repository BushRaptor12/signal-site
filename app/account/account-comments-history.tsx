"use client";

import Link from "next/link";
import { useState } from "react";
import { formatUpdatedAt } from "@/app/lib/dates";

type AccountCommentHistoryItem = {
  body: string;
  createdAt: string;
  id: string;
  storyId: string;
  storyTitle: string | null;
};

type AccountCommentsHistoryProps = {
  initialComments: AccountCommentHistoryItem[];
  totalCount: number;
};

const LOAD_MORE_COUNT = 10;

export default function AccountCommentsHistory({
  initialComments,
  totalCount,
}: AccountCommentsHistoryProps) {
  const [comments, setComments] = useState(initialComments);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const hasMore = comments.length < totalCount;

  async function loadMore() {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/account/comments?offset=${encodeURIComponent(String(comments.length))}&limit=${LOAD_MORE_COUNT}`,
        { cache: "no-store" }
      );
      const data = (await response.json().catch(() => ({}))) as {
        comments?: AccountCommentHistoryItem[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "We couldn't load more comments.");
      }

      const nextComments = Array.isArray(data.comments) ? data.comments : [];
      setComments((current) => [...current, ...nextComments]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "We couldn't load more comments.");
    } finally {
      setLoadingMore(false);
    }
  }

  if (comments.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-[#13314b] bg-[#04111b] p-5 text-sm leading-7 text-neutral-400">
        Your comment history will appear here after you join the conversation on story pages.
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {comments.map((comment) => (
        <div key={comment.id} className="rounded-2xl border border-[#13314b] bg-[#04111b] p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
            {formatUpdatedAt(comment.createdAt)}
          </div>
          {comment.storyTitle ? (
            <div className="mt-2 text-sm text-neutral-400">
              On{" "}
              <Link
                href={`/story/${comment.storyId}?from=account&comment=${encodeURIComponent(comment.id)}#comment-${comment.id}`}
                className="text-neutral-200 transition hover:text-white"
              >
                {comment.storyTitle}
              </Link>
            </div>
          ) : null}
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-300">{comment.body}</p>
        </div>
      ))}

      {error ? <div className="text-sm text-[#f0b7b7]">{error}</div> : null}

      {hasMore ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="inline-flex rounded-full border border-[#8f7740]/70 bg-[#07101a] px-5 py-2 text-sm font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingMore ? "Loading..." : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
