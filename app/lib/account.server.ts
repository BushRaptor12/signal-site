import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { queueUsernameReview } from "@/app/lib/notifications.server";
import {
  getSemanticStoryMatchesForUser,
  getSemanticStoryIdsForUser,
  normalizeInterestQuery,
  SENTENCE_TRANSFORMER_MODEL,
  toEmbeddingState,
  updateInterestEmbeddingRecord,
  type EmbeddingState,
} from "@/app/lib/semantic-search";
import { coerceStory, type StoryDbRow } from "@/app/lib/stories";
import { supabaseServer } from "@/app/lib/supabase.server";
import type { StoryWithViews } from "@/app/lib/types";
import { getUsernameModerationError, getUsernameReviewReason } from "@/app/lib/username-moderation";
import { listAccountCommentHistory } from "@/app/lib/comments";

const ACCOUNT_SESSION_COOKIE = "beacon_account";
const ACCOUNT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,24}$/;

type SessionPayload = {
  exp: number;
  sub: string;
  v: 1;
};

type UserProfileRow = {
  admin_granted_at: string | null;
  comment_moderated_at?: string | null;
  comment_moderated_by?: string | null;
  comment_moderation_note?: string | null;
  comment_moderation_status?: string | null;
  comment_moderation_until?: string | null;
  created_at: string;
  email: string;
  is_admin: boolean;
  staff_role?: string | null;
  updated_at: string;
  user_id: string;
  username: string;
  username_normalized: string;
};

type UserStoryFollowRow = {
  created_at: string;
  story_id: string;
};

type UserStorySeenRow = {
  story_id: string;
};

type UserInterestFollowRow = {
  created_at: string;
  embedding_state?: string | null;
  id: number | string;
  normalized_query: string;
  query: string;
  updated_at: string;
};

export type StaffRole = "admin" | "moderator" | "reader";
export type CommentModerationStatus = "active" | "banned" | "muted";

export type AccountProfile = {
  adminGrantedAt: string | null;
  commentModeratedAt: string | null;
  commentModeratedBy: string | null;
  commentModerationNote: string | null;
  commentModerationStatus: CommentModerationStatus;
  commentModerationUntil: string | null;
  createdAt: string;
  email: string;
  isAdmin: boolean;
  staffRole: StaffRole;
  updatedAt: string;
  userId: string;
  username: string;
};

export type FollowedStory = {
  followedAt: string;
  story: StoryWithViews;
};

export type FollowedInterest = {
  createdAt: string;
  embeddingState: EmbeddingState;
  id: string;
  normalizedQuery: string;
  query: string;
  updatedAt: string;
};

export type FollowedInterestStoryMatch = {
  reasons: string[];
  score: number;
  story: StoryWithViews;
};

export type FollowedInterestWithMatches = FollowedInterest & {
  hiddenCount: number;
  matches: FollowedInterestStoryMatch[];
};

export type AccountComment = {
  body: string;
  createdAt: string;
  id: string;
  storyId: string;
  storyTitle: string | null;
};

export type AccountDashboard = {
  commentCount: number;
  comments: AccountComment[];
  followedInterests: FollowedInterestWithMatches[];
  followedStories: FollowedStory[];
  profile: AccountProfile;
};

export type AccountStoryState = {
  following: boolean;
  seen: boolean;
};

function cookieSecret() {
  const value = process.env.AUTH_COOKIE_SECRET?.trim() || process.env.VIEW_HASH_SECRET?.trim();
  if (!value) {
    throw new Error("Missing AUTH_COOKIE_SECRET (or VIEW_HASH_SECRET fallback) for account sessions.");
  }

  return value;
}

function supabasePasswordAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    throw new Error("Missing Supabase auth env vars for account login.");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function createSessionValue(userId: string) {
  const payload: SessionPayload = {
    exp: Date.now() + ACCOUNT_SESSION_MAX_AGE_SECONDS * 1000,
    sub: userId,
    v: 1,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", cookieSecret()).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function parseSessionValue(value: string | undefined) {
  if (!value) return null;

  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = createHmac("sha256", cookieSecret()).update(encodedPayload).digest();
  const receivedSignature = Buffer.from(signature, "base64url");

  if (receivedSignature.length !== expectedSignature.length) return null;
  if (!timingSafeEqual(receivedSignature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (payload.v !== 1) return null;
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

function friendlyAuthError(message: string, fallback: string) {
  if (/invalid login credentials/i.test(message)) {
    return "Incorrect email or password.";
  }

  if (/user already registered/i.test(message)) {
    return "An account with that email already exists.";
  }

  if (/duplicate key value violates unique constraint/i.test(message) && /username/i.test(message)) {
    return "That username is already taken.";
  }

  if (/duplicate key value violates unique constraint/i.test(message) && /email/i.test(message)) {
    return "That email is already in use.";
  }

  if (/password/i.test(message) || /email/i.test(message)) {
    return message;
  }

  if (/relation .* does not exist/i.test(message)) {
    return "Account tables are not set up yet. Run the account SQL migration first.";
  }

  return fallback;
}

function friendlyInterestError(message: string, fallback: string) {
  if (/relation .*user_interest_follows.* does not exist/i.test(message)) {
    return "Interest follows are not set up yet. Run the new interest SQL migration first.";
  }

  return fallback;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function sanitizeUsernameSeed(value: string) {
  const cleaned = value.trim().replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.slice(0, 24);
}

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function isValidUsername(username: string) {
  return USERNAME_PATTERN.test(username.trim());
}

function validateUsernameInput(username: string) {
  const displayUsername = username.trim();
  if (!displayUsername) {
    throw new Error("Username is required.");
  }

  if (!isValidUsername(displayUsername)) {
    throw new Error("Username must be 3-24 characters and use only letters, numbers, or underscores.");
  }

  const moderationError = getUsernameModerationError(displayUsername);
  if (moderationError) {
    throw new Error(moderationError);
  }

  return {
    displayUsername,
    usernameNormalized: normalizeUsername(displayUsername),
  };
}

function validatePasswordInput(password: string) {
  const trimmed = password.trim();
  if (!trimmed) {
    throw new Error("Password is required.");
  }

  if (trimmed.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  return trimmed;
}

function readCookieValue(cookieHeader: string | null | undefined, key: string) {
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${key}=`)) continue;
    return trimmed.slice(key.length + 1);
  }

  return undefined;
}

export function toStaffRole(value: string | null | undefined, isAdmin = false): StaffRole {
  if (value === "admin" || value === "moderator" || value === "reader") {
    return value;
  }

  return isAdmin ? "admin" : "reader";
}

export function toCommentModerationStatus(value: string | null | undefined): CommentModerationStatus {
  if (value === "muted" || value === "banned") {
    return value;
  }

  return "active";
}

export function isCommentRestrictionActive(profile: Pick<AccountProfile, "commentModerationStatus" | "commentModerationUntil">, now = new Date()) {
  if (profile.commentModerationStatus === "active") return false;
  if (profile.commentModerationStatus === "banned") return true;
  if (!profile.commentModerationUntil) return true;

  const untilMs = new Date(profile.commentModerationUntil).getTime();
  if (!Number.isFinite(untilMs)) return true;
  return untilMs > now.getTime();
}

function toAccountProfile(row: UserProfileRow): AccountProfile {
  return {
    adminGrantedAt: row.admin_granted_at,
    commentModeratedAt: row.comment_moderated_at ?? null,
    commentModeratedBy: row.comment_moderated_by ?? null,
    commentModerationNote: row.comment_moderation_note ?? null,
    commentModerationStatus: toCommentModerationStatus(row.comment_moderation_status),
    commentModerationUntil: row.comment_moderation_until ?? null,
    createdAt: row.created_at,
    email: row.email,
    isAdmin: Boolean(row.is_admin),
    staffRole: toStaffRole(row.staff_role, Boolean(row.is_admin)),
    updatedAt: row.updated_at,
    userId: row.user_id,
    username: row.username,
  };
}

function toFollowedInterest(row: UserInterestFollowRow): FollowedInterest {
  return {
    createdAt: row.created_at,
    embeddingState: toEmbeddingState(row.embedding_state),
    id: String(row.id),
    normalizedQuery: row.normalized_query,
    query: row.query,
    updatedAt: row.updated_at,
  };
}

async function findAvailableUsername(seed: string) {
  const supabase = supabaseServer();
  const base = sanitizeUsernameSeed(seed) || "reader";

  for (let index = 0; index < 40; index += 1) {
    const suffix = index === 0 ? "" : String(index + 1);
    const trimmedBase = base.slice(0, Math.max(3, 24 - suffix.length));
    const username = `${trimmedBase}${suffix}`;
    const usernameNormalized = normalizeUsername(username);

    if (getUsernameModerationError(username)) {
      continue;
    }

    const { data, error } = await supabase
      .from("user_profiles")
      .select("user_id")
      .eq("username_normalized", usernameNormalized)
      .maybeSingle();

    if (error && !/relation .* does not exist/i.test(error.message)) {
      throw new Error(error.message);
    }

    if (!data) {
      return { username, usernameNormalized };
    }
  }

  const fallback = `reader${Date.now().toString().slice(-6)}`;
  if (getUsernameModerationError(fallback)) {
    return {
      username: "readernews",
      usernameNormalized: normalizeUsername("readernews"),
    };
  }

  return {
    username: fallback,
    usernameNormalized: normalizeUsername(fallback),
  };
}

async function ensureUserProfile(user: User) {
  const supabase = supabaseServer();
  const { data, error } = await supabase.from("user_profiles").select("*").eq("user_id", user.id).maybeSingle();

  if (error && !/relation .* does not exist/i.test(error.message)) {
    throw new Error(error.message);
  }

  if (data) {
    return toAccountProfile(data as UserProfileRow);
  }

  const email = normalizeEmail(user.email ?? "");
  if (!email) {
    throw new Error("This account is missing an email address.");
  }

  const seededUsername =
    typeof user.user_metadata?.username === "string" && user.user_metadata.username.trim()
      ? user.user_metadata.username.trim()
      : email.split("@")[0] ?? "reader";
  const { username, usernameNormalized } = await findAvailableUsername(seededUsername);

  const { data: inserted, error: insertError } = await supabase
    .from("user_profiles")
    .insert({
      email,
      user_id: user.id,
      username,
      username_normalized: usernameNormalized,
    })
    .select("*")
    .single();

  if (insertError) {
    throw new Error(friendlyAuthError(insertError.message, "We couldn't finish setting up your profile."));
  }

  return toAccountProfile(inserted as UserProfileRow);
}

async function requireAccountProfileByUserId(userId: string) {
  const profile = await getAccountProfileByUserId(userId);
  if (!profile) {
    throw new Error("This account profile could not be found.");
  }

  return profile;
}

async function verifyCurrentPassword(email: string, password: string) {
  const currentPassword = password.trim();
  if (!currentPassword) {
    throw new Error("Current password is required.");
  }

  const supabase = supabasePasswordAuthClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(email),
    password: currentPassword,
  });

  if (error) {
    throw new Error("Current password is incorrect.");
  }
}

export function accountSessionCookie(userId: string) {
  return {
    httpOnly: true,
    maxAge: ACCOUNT_SESSION_MAX_AGE_SECONDS,
    name: ACCOUNT_SESSION_COOKIE,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    value: createSessionValue(userId),
  } as const;
}

export function clearedAccountSessionCookie() {
  return {
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    name: ACCOUNT_SESSION_COOKIE,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    value: "",
  } as const;
}

export async function getAccountUserId() {
  const cookieStore = await cookies();
  const session = parseSessionValue(cookieStore.get(ACCOUNT_SESSION_COOKIE)?.value);
  return session?.sub ?? null;
}

export function getAccountUserIdFromCookieHeader(cookieHeader: string | null | undefined) {
  const session = parseSessionValue(readCookieValue(cookieHeader, ACCOUNT_SESSION_COOKIE));
  return session?.sub ?? null;
}

export async function getAccountProfileByUserId(userId: string) {
  const supabase = supabaseServer();
  const { data, error } = await supabase.from("user_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error) {
    throw new Error(friendlyAuthError(error.message, "We couldn't load this account."));
  }

  return data ? toAccountProfile(data as UserProfileRow) : null;
}

export async function getAccountProfile() {
  const userId = await getAccountUserId();
  if (!userId) return null;
  return getAccountProfileByUserId(userId);
}

export async function getFollowedStoryIds(userId: string) {
  const supabase = supabaseServer();
  const { data, error } = await supabase.from("user_story_follows").select("story_id").eq("user_id", userId);

  if (error) {
    throw new Error(friendlyAuthError(error.message, "We couldn't load followed stories."));
  }

  return ((data ?? []) as UserStoryFollowRow[]).map((row) => row.story_id);
}

export async function getFollowedInterests(userId: string) {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("user_interest_follows")
    .select("id, query, normalized_query, embedding_state, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    if (/relation .* does not exist/i.test(error.message)) {
      return [] as FollowedInterest[];
    }

    throw new Error(friendlyInterestError(error.message, "We couldn't load followed interests."));
  }

  return ((data ?? []) as UserInterestFollowRow[]).map(toFollowedInterest);
}

async function getStoriesById(storyIds: string[]) {
  if (storyIds.length === 0) {
    return new Map<string, StoryWithViews>();
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase.from("stories").select("*").in("id", storyIds);
  if (error) {
    throw new Error(error.message);
  }

  const storiesById = new Map<string, StoryWithViews>();
  for (const row of (data ?? []) as StoryDbRow[]) {
    const story = coerceStory(row);
    storiesById.set(story.id, story);
  }

  return storiesById;
}

export async function getFollowedInterestsWithMatches(userId: string, interests?: FollowedInterest[]) {
  const followedInterests = interests ?? (await getFollowedInterests(userId));
  if (followedInterests.length === 0) {
    return [] as FollowedInterestWithMatches[];
  }

  const matchGroups = await getSemanticStoryMatchesForUser(userId, {
    interestIds: followedInterests.map((interest) => interest.id),
  });
  const storyIds = [...new Set(matchGroups.flatMap((group) => group.matches.map((match) => match.storyId)))];
  const storiesById = await getStoriesById(storyIds);
  const matchesByInterestId = new Map(matchGroups.map((group) => [group.interestId, group] as const));

  return followedInterests.map((interest) => {
    const group = matchesByInterestId.get(interest.id);
    return {
      ...interest,
      hiddenCount: group?.hiddenCount ?? 0,
      matches: (group?.matches ?? [])
        .map((match) => {
          const story = storiesById.get(match.storyId);
          return story
            ? {
                reasons: match.reasons,
                score: match.score,
                story,
              }
            : null;
        })
        .filter((value): value is FollowedInterestStoryMatch => Boolean(value)),
    };
  });
}

export async function getSeenStoryIds(userId: string, storyIds?: string[]) {
  if (!userId) return [];
  if (storyIds && storyIds.length === 0) return [];

  const supabase = supabaseServer();
  let query = supabase.from("user_story_seen").select("story_id").eq("user_id", userId);
  if (storyIds && storyIds.length > 0) {
    query = query.in("story_id", storyIds);
  }

  const { data, error } = await query;
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) {
      return [];
    }

    throw new Error(friendlyAuthError(error.message, "We couldn't load seen-story history."));
  }

  return ((data ?? []) as UserStorySeenRow[]).map((row) => row.story_id);
}

export async function getAccountStoryState(userId: string, storyId: string): Promise<AccountStoryState> {
  const supabase = supabaseServer();
  const [{ data: followRow, error: followError }, { data: seenRow, error: seenError }] = await Promise.all([
    supabase.from("user_story_follows").select("story_id").eq("user_id", userId).eq("story_id", storyId).maybeSingle(),
    supabase.from("user_story_seen").select("story_id").eq("user_id", userId).eq("story_id", storyId).maybeSingle(),
  ]);

  if (followError) {
    throw new Error(friendlyAuthError(followError.message, "We couldn't load followed stories."));
  }

  if (seenError && !/relation .* does not exist/i.test(seenError.message)) {
    throw new Error(friendlyAuthError(seenError.message, "We couldn't load seen-story history."));
  }

  return {
    following: Boolean(followRow),
    seen: Boolean(seenRow),
  };
}

export async function setStoryFollow(userId: string, storyId: string, following: boolean) {
  const supabase = supabaseServer();

  if (following) {
    const { error } = await supabase.from("user_story_follows").upsert(
      {
        story_id: storyId,
        user_id: userId,
      },
      { onConflict: "user_id,story_id", ignoreDuplicates: false }
    );

    if (error) {
      throw new Error(friendlyAuthError(error.message, "We couldn't follow this story."));
    }

    return;
  }

  const { error } = await supabase.from("user_story_follows").delete().eq("user_id", userId).eq("story_id", storyId);
  if (error) {
    throw new Error(friendlyAuthError(error.message, "We couldn't update this follow."));
  }
}

export async function createInterestFollow(userId: string, query: string) {
  const trimmedQuery = query.trim().replace(/\s+/g, " ");
  const normalizedQuery = normalizeInterestQuery(trimmedQuery);
  if (!trimmedQuery || !normalizedQuery) {
    throw new Error("Interest text is required.");
  }

  if (trimmedQuery.length > 120) {
    throw new Error("Interests must be 120 characters or fewer.");
  }

  const supabase = supabaseServer();
  const { data: existing, error: existingError } = await supabase
    .from("user_interest_follows")
    .select("id, query, normalized_query, embedding_state, created_at, updated_at")
    .eq("user_id", userId)
    .eq("normalized_query", normalizedQuery)
    .maybeSingle();

  if (existingError) {
    throw new Error(friendlyInterestError(existingError.message, "We couldn't save that interest."));
  }

  if (existing) {
    const followedInterest = toFollowedInterest(existing as UserInterestFollowRow);
    if (followedInterest.embeddingState !== "ready") {
      await updateInterestEmbeddingRecord(followedInterest.id, followedInterest.query);
    }
    return followedInterest;
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("user_interest_follows")
    .insert({
      user_id: userId,
      query: trimmedQuery,
      normalized_query: normalizedQuery,
      embedding_model: SENTENCE_TRANSFORMER_MODEL,
      embedding_state: "pending",
      embedding_updated_at: nowIso,
      updated_at: nowIso,
    })
    .select("id, query, normalized_query, embedding_state, created_at, updated_at")
    .single();

  if (error) {
    throw new Error(friendlyInterestError(error.message, "We couldn't save that interest."));
  }

  const followedInterest = toFollowedInterest(data as UserInterestFollowRow);
  await updateInterestEmbeddingRecord(followedInterest.id, followedInterest.query);
  return followedInterest;
}

export async function removeInterestFollow(userId: string, interestId: string) {
  const numericId = Number(interestId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw new Error("Interest id is invalid.");
  }

  const supabase = supabaseServer();
  const { error } = await supabase.from("user_interest_follows").delete().eq("user_id", userId).eq("id", numericId);
  if (error) {
    throw new Error(friendlyInterestError(error.message, "We couldn't remove that interest."));
  }
}

export async function hideInterestStoryMatch(userId: string, interestId: string, storyId: string) {
  const numericInterestId = Number(interestId);
  if (!Number.isInteger(numericInterestId) || numericInterestId <= 0) {
    throw new Error("Interest id is invalid.");
  }

  const trimmedStoryId = storyId.trim();
  if (!trimmedStoryId) {
    throw new Error("Story id is required.");
  }

  const supabase = supabaseServer();
  const nowIso = new Date().toISOString();
  const { error } = await supabase.from("user_interest_story_feedback").upsert(
    {
      feedback: "hidden",
      interest_id: numericInterestId,
      story_id: trimmedStoryId,
      updated_at: nowIso,
      user_id: userId,
    },
    { onConflict: "user_id,interest_id,story_id", ignoreDuplicates: false }
  );

  if (error) {
    if (/relation .*user_interest_story_feedback.* does not exist/i.test(error.message)) {
      throw new Error("Interest feedback is not set up yet. Run the new SQL migration first.");
    }

    throw new Error(friendlyInterestError(error.message, "We couldn't hide that story for this interest."));
  }
}

export async function markStorySeen(userId: string, storyId: string) {
  const supabase = supabaseServer();
  const nowIso = new Date().toISOString();
  const { error } = await supabase.from("user_story_seen").upsert(
    {
      story_id: storyId,
      updated_at: nowIso,
      user_id: userId,
    },
    { onConflict: "user_id,story_id", ignoreDuplicates: false }
  );

  if (error) {
    if (/relation .* does not exist/i.test(error.message)) {
      return;
    }

    throw new Error(friendlyAuthError(error.message, "We couldn't save your story history."));
  }
}

export async function loginWithEmail(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password.trim()) {
    throw new Error("Email and password are required.");
  }

  const supabase = supabasePasswordAuthClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error || !data.user) {
    throw new Error(friendlyAuthError(error?.message ?? "", "We couldn't sign you in."));
  }

  return ensureUserProfile(data.user);
}

export async function requestPasswordReset(email: string, redirectTo: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("Email is required.");
  }

  if (!redirectTo.trim()) {
    throw new Error("Missing password reset redirect URL.");
  }

  const supabase = supabasePasswordAuthClient();
  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo,
  });

  if (error) {
    throw new Error(friendlyAuthError(error.message, "We couldn't send a password reset email."));
  }
}

export async function signupWithEmail(email: string, password: string, username: string) {
  const normalizedEmail = normalizeEmail(email);
  const { displayUsername, usernameNormalized } = validateUsernameInput(username);

  if (!normalizedEmail || !password.trim() || !displayUsername) {
    throw new Error("Email, password, and username are required.");
  }

  const supabase = supabaseServer();
  const { data: existingUsername, error: existingUsernameError } = await supabase
    .from("user_profiles")
    .select("user_id")
    .eq("username_normalized", usernameNormalized)
    .maybeSingle();

  if (existingUsernameError && !/relation .* does not exist/i.test(existingUsernameError.message)) {
    throw new Error(existingUsernameError.message);
  }

  if (existingUsername) {
    throw new Error("That username is already taken.");
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    email_confirm: true,
    password,
    user_metadata: {
      username: displayUsername,
    },
  });

  if (error || !data.user) {
    throw new Error(friendlyAuthError(error?.message ?? "", "We couldn't create your account."));
  }

  const user = data.user;
  const { data: insertedProfile, error: profileError } = await supabase
    .from("user_profiles")
    .insert({
      email: normalizedEmail,
      user_id: user.id,
      username: displayUsername,
      username_normalized: usernameNormalized,
    })
    .select("*")
    .single();

  if (profileError) {
    await supabase.auth.admin.deleteUser(user.id).catch(() => null);
    throw new Error(friendlyAuthError(profileError.message, "We couldn't finish creating your account."));
  }

  const reviewReason = getUsernameReviewReason(displayUsername);
  if (reviewReason) {
    try {
      await queueUsernameReview({
        email: normalizedEmail,
        reason: reviewReason,
        userId: user.id,
        username: displayUsername,
      });
    } catch {
      // A review alert should not prevent account creation.
    }
  }

  return toAccountProfile(insertedProfile as UserProfileRow);
}

export async function updateAccountUsername(userId: string, username: string) {
  const { displayUsername, usernameNormalized } = validateUsernameInput(username);
  const supabase = supabaseServer();

  const { data: existingUsername, error: existingUsernameError } = await supabase
    .from("user_profiles")
    .select("user_id")
    .eq("username_normalized", usernameNormalized)
    .maybeSingle();

  if (existingUsernameError) {
    throw new Error(friendlyAuthError(existingUsernameError.message, "We couldn't update your username."));
  }

  if (existingUsername && existingUsername.user_id !== userId) {
    throw new Error("That username is already taken.");
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .update({
      username: displayUsername,
      username_normalized: usernameNormalized,
    })
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) {
    throw new Error(friendlyAuthError(error.message, "We couldn't update your username."));
  }

  return toAccountProfile(data as UserProfileRow);
}

export async function updateAccountEmail(userId: string, email: string, currentPassword: string) {
  const profile = await requireAccountProfileByUserId(userId);
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("Email is required.");
  }

  await verifyCurrentPassword(profile.email, currentPassword);

  const supabase = supabaseServer();
  const { data: existingEmail, error: existingEmailError } = await supabase
    .from("user_profiles")
    .select("user_id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existingEmailError) {
    throw new Error(friendlyAuthError(existingEmailError.message, "We couldn't update your email."));
  }

  if (existingEmail && existingEmail.user_id !== userId) {
    throw new Error("That email is already in use.");
  }

  const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
    email: normalizedEmail,
    email_confirm: true,
  });

  if (authError) {
    throw new Error(friendlyAuthError(authError.message, "We couldn't update your email."));
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .update({
      email: normalizedEmail,
    })
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) {
    throw new Error(friendlyAuthError(error.message, "We couldn't update your email."));
  }

  return toAccountProfile(data as UserProfileRow);
}

export async function updateAccountPassword(userId: string, currentPassword: string, nextPassword: string) {
  const profile = await requireAccountProfileByUserId(userId);
  await verifyCurrentPassword(profile.email, currentPassword);
  const validatedPassword = validatePasswordInput(nextPassword);

  const supabase = supabaseServer();
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    password: validatedPassword,
  });

  if (error) {
    throw new Error(friendlyAuthError(error.message, "We couldn't update your password."));
  }
}

export async function getAccountDashboard(userId: string): Promise<AccountDashboard> {
  const supabase = supabaseServer();
  const [
    { data: profileData, error: profileError },
    { data: followRows, error: followError },
    interestResult,
    commentHistory,
  ] = await Promise.all([
    supabase.from("user_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("user_story_follows").select("story_id, created_at").eq("user_id", userId).order("created_at", { ascending: false }),
    getFollowedInterests(userId),
    listAccountCommentHistory(userId, { limit: 5, offset: 0 }),
  ]);

  if (profileError) {
    throw new Error(friendlyAuthError(profileError.message, "We couldn't load this account."));
  }

  if (followError) {
    throw new Error(friendlyAuthError(followError.message, "We couldn't load followed stories."));
  }

  if (!profileData) {
    throw new Error("This account profile could not be found.");
  }

  const followedInterests = await getFollowedInterestsWithMatches(userId, interestResult);
  const storyIds = new Set<string>();
  for (const row of (followRows ?? []) as UserStoryFollowRow[]) {
    storyIds.add(row.story_id);
  }
  for (const comment of commentHistory.comments) {
    storyIds.add(comment.storyId);
  }
  for (const interest of followedInterests) {
    for (const match of interest.matches) {
      storyIds.add(match.story.id);
    }
  }

  const storiesById = await getStoriesById([...storyIds]);

  return {
    commentCount: commentHistory.totalCount,
    comments: commentHistory.comments.map((comment) => ({
      body: comment.body,
      createdAt: comment.createdAt,
      id: comment.id,
      storyId: comment.storyId,
      storyTitle: comment.storyTitle ?? storiesById.get(comment.storyId)?.title ?? null,
    })),
    followedInterests,
    followedStories: ((followRows ?? []) as UserStoryFollowRow[])
      .map((row) => {
        const story = storiesById.get(row.story_id);
        return story
          ? {
              followedAt: row.created_at,
              story,
            }
          : null;
      })
      .filter((value): value is FollowedStory => Boolean(value)),
    profile: toAccountProfile(profileData as UserProfileRow),
  };
}

export async function getSemanticFollowedStoryIds(userId: string) {
  return getSemanticStoryIdsForUser(userId);
}
