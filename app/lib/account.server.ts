import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { coerceStory, type StoryDbRow } from "@/app/lib/stories";
import { supabaseServer } from "@/app/lib/supabase.server";
import type { StoryWithViews } from "@/app/lib/types";

const ACCOUNT_SESSION_COOKIE = "beacon_account";
const ACCOUNT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,24}$/;

type SessionPayload = {
  exp: number;
  sub: string;
  v: 1;
};

type UserProfileRow = {
  created_at: string;
  email: string;
  updated_at: string;
  user_id: string;
  username: string;
  username_normalized: string;
};

type UserStoryFollowRow = {
  created_at: string;
  story_id: string;
};

type UserCommentRow = {
  body: string;
  created_at: string;
  id: string;
  story_id: string;
};

export type AccountProfile = {
  createdAt: string;
  email: string;
  updatedAt: string;
  userId: string;
  username: string;
};

export type FollowedStory = {
  followedAt: string;
  story: StoryWithViews;
};

export type AccountComment = {
  body: string;
  createdAt: string;
  id: string;
  storyId: string;
  storyTitle: string | null;
};

export type AccountDashboard = {
  comments: AccountComment[];
  followedStories: FollowedStory[];
  profile: AccountProfile;
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

  if (/password/i.test(message) || /email/i.test(message)) {
    return message;
  }

  if (/relation .* does not exist/i.test(message)) {
    return "Account tables are not set up yet. Run the account SQL migration first.";
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

function toAccountProfile(row: UserProfileRow): AccountProfile {
  return {
    createdAt: row.created_at,
    email: row.email,
    updatedAt: row.updated_at,
    userId: row.user_id,
    username: row.username,
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

export async function getAccountProfile() {
  const userId = await getAccountUserId();
  if (!userId) return null;

  const supabase = supabaseServer();
  const { data, error } = await supabase.from("user_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error) {
    throw new Error(friendlyAuthError(error.message, "We couldn't load this account."));
  }

  return data ? toAccountProfile(data as UserProfileRow) : null;
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

export async function signupWithEmail(email: string, password: string, username: string) {
  const normalizedEmail = normalizeEmail(email);
  const displayUsername = username.trim();
  const usernameNormalized = normalizeUsername(displayUsername);

  if (!normalizedEmail || !password.trim() || !displayUsername) {
    throw new Error("Email, password, and username are required.");
  }

  if (!isValidUsername(displayUsername)) {
    throw new Error("Username must be 3-24 characters and use only letters, numbers, or underscores.");
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

  return toAccountProfile(insertedProfile as UserProfileRow);
}

export async function getAccountDashboard(userId: string): Promise<AccountDashboard> {
  const supabase = supabaseServer();
  const [
    { data: profileData, error: profileError },
    { data: followRows, error: followError },
    { data: commentRows, error: commentError },
  ] = await Promise.all([
    supabase.from("user_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("user_story_follows").select("story_id, created_at").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("user_comments").select("id, story_id, body, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
  ]);

  if (profileError) {
    throw new Error(friendlyAuthError(profileError.message, "We couldn't load this account."));
  }

  if (followError) {
    throw new Error(friendlyAuthError(followError.message, "We couldn't load followed stories."));
  }

  if (commentError) {
    throw new Error(friendlyAuthError(commentError.message, "We couldn't load comment history."));
  }

  if (!profileData) {
    throw new Error("This account profile could not be found.");
  }

  const storyIds = new Set<string>();
  for (const row of (followRows ?? []) as UserStoryFollowRow[]) {
    storyIds.add(row.story_id);
  }
  for (const row of (commentRows ?? []) as UserCommentRow[]) {
    storyIds.add(row.story_id);
  }

  const storiesById = new Map<string, StoryWithViews>();
  if (storyIds.size > 0) {
    const { data: storyRows, error: storyError } = await supabase.from("stories").select("*").in("id", [...storyIds]);
    if (storyError) {
      throw new Error(storyError.message);
    }

    for (const row of (storyRows ?? []) as StoryDbRow[]) {
      const story = coerceStory(row);
      storiesById.set(story.id, story);
    }
  }

  return {
    comments: ((commentRows ?? []) as UserCommentRow[]).map((row) => ({
      body: row.body,
      createdAt: row.created_at,
      id: row.id,
      storyId: row.story_id,
      storyTitle: storiesById.get(row.story_id)?.title ?? null,
    })),
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
