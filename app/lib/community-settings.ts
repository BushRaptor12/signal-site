import { supabaseServer } from "@/app/lib/supabase.server";

export type CommunitySettings = {
  allowCommentReplies: boolean;
  allowCommentRealtime: boolean;
  allowCommentVoting: boolean;
  allowNewComments: boolean;
  commentsReadOnly: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

type CommunitySettingsRow = {
  allow_comment_realtime?: boolean | null;
  allow_comment_replies?: boolean | null;
  allow_comment_voting?: boolean | null;
  allow_new_comments?: boolean | null;
  comments_read_only?: boolean | null;
  updated_at?: string | null;
  updated_by?: string | null;
};

const DEFAULT_COMMUNITY_SETTINGS: CommunitySettings = {
  allowCommentReplies: true,
  allowCommentRealtime: true,
  allowCommentVoting: true,
  allowNewComments: true,
  commentsReadOnly: false,
  updatedAt: null,
  updatedBy: null,
};

function toCommunitySettings(row: CommunitySettingsRow | null | undefined): CommunitySettings {
  return {
    allowCommentReplies: row?.allow_comment_replies ?? DEFAULT_COMMUNITY_SETTINGS.allowCommentReplies,
    allowCommentRealtime: row?.allow_comment_realtime ?? DEFAULT_COMMUNITY_SETTINGS.allowCommentRealtime,
    allowCommentVoting: row?.allow_comment_voting ?? DEFAULT_COMMUNITY_SETTINGS.allowCommentVoting,
    allowNewComments: row?.allow_new_comments ?? DEFAULT_COMMUNITY_SETTINGS.allowNewComments,
    commentsReadOnly: row?.comments_read_only ?? DEFAULT_COMMUNITY_SETTINGS.commentsReadOnly,
    updatedAt: row?.updated_at ?? null,
    updatedBy: row?.updated_by ?? null,
  };
}

export async function getCommunitySettings() {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("site_settings")
    .select("allow_new_comments, allow_comment_replies, allow_comment_voting, allow_comment_realtime, comments_read_only, updated_at, updated_by")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    if (/relation .* does not exist/i.test(error.message)) {
      return DEFAULT_COMMUNITY_SETTINGS;
    }

    throw new Error(error.message);
  }

  return toCommunitySettings((data ?? null) as CommunitySettingsRow | null);
}

export async function updateCommunitySettings(
  input: Partial<Pick<CommunitySettings, "allowCommentReplies" | "allowCommentRealtime" | "allowCommentVoting" | "allowNewComments" | "commentsReadOnly">>,
  updatedBy: string
) {
  const supabase = supabaseServer();
  const payload = {
    allow_comment_realtime: input.allowCommentRealtime,
    allow_comment_replies: input.allowCommentReplies,
    allow_comment_voting: input.allowCommentVoting,
    allow_new_comments: input.allowNewComments,
    comments_read_only: input.commentsReadOnly,
    id: 1,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  };

  const { data, error } = await supabase
    .from("site_settings")
    .upsert(payload, { onConflict: "id" })
    .select("allow_new_comments, allow_comment_replies, allow_comment_voting, allow_comment_realtime, comments_read_only, updated_at, updated_by")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return toCommunitySettings(data as CommunitySettingsRow);
}
