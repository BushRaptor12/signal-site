"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import PageBrandHeader from "@/app/page-brand-header";
import { supabaseBrowser } from "@/app/lib/supabase-browser";

type ApiResponse = {
  error?: string;
  message?: string;
  ok?: boolean;
};

const MIN_PASSWORD_LENGTH = 8;

function cleanRecoveryUrl(pathname: string) {
  window.history.replaceState({}, document.title, pathname);
}

export default function ResetPasswordPageClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [isCheckingRecovery, setIsCheckingRecovery] = useState(true);
  const [isRequestPending, setIsRequestPending] = useState(false);
  const [isUpdatePending, setIsUpdatePending] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let cancelled = false;

    function applyRecoverySession(session: { user?: { email?: string | null } | null } | null) {
      if (cancelled) return;

      const nextEmail = session?.user?.email?.trim() ?? "";
      setRecoveryReady(Boolean(session?.user));
      setRecoveryEmail(nextEmail);
      if (session?.user) {
        setUpdateError(null);
      }
    }

    async function syncRecoverySession() {
      const url = new URL(window.location.href);
      const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
      const code = url.searchParams.get("code");
      const accessToken = url.searchParams.get("access_token") ?? hashParams.get("access_token");
      const refreshToken = url.searchParams.get("refresh_token") ?? hashParams.get("refresh_token");
      const hasRecoveryParams = Boolean(code || (accessToken && refreshToken));

      try {
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          applyRecoverySession(data.session);
        } else if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          applyRecoverySession(data.session);
        } else {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          applyRecoverySession(session);
        }
      } catch {
        if (!cancelled) {
          setRecoveryReady(false);
          setRecoveryEmail("");
          setUpdateError("This password reset link is invalid or has expired. Request a new one below.");
        }
      } finally {
        if (hasRecoveryParams) {
          cleanRecoveryUrl(url.pathname);
        }
        if (!cancelled) {
          setIsCheckingRecovery(false);
        }
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        applyRecoverySession(session);
      }
    });

    void syncRecoverySession();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function handleRequestReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestError(null);
    setRequestMessage(null);
    setIsRequestPending(true);

    try {
      const response = await fetch("/api/account/password-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiResponse;

      if (!response.ok || !data.ok) {
        setRequestError(data.error ?? "We couldn't send a password reset email.");
        return;
      }

      setRequestMessage(data.message ?? "If that email is registered, a password reset link is on its way.");
    } catch {
      setRequestError("We couldn't send a password reset email.");
    } finally {
      setIsRequestPending(false);
    }
  }

  async function handleUpdatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUpdateError(null);
    setUpdateMessage(null);

    if (newPassword.trim().length < MIN_PASSWORD_LENGTH) {
      setUpdateError("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setUpdateError("New password and confirmation must match.");
      return;
    }

    setIsUpdatePending(true);

    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setUpdateError(error.message || "We couldn't update your password.");
        return;
      }

      if (recoveryEmail) {
        const loginResponse = await fetch("/api/account/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: recoveryEmail,
            password: newPassword,
          }),
        });
        const loginData = (await loginResponse.json().catch(() => ({}))) as ApiResponse;

        if (loginResponse.ok && loginData.ok) {
          router.push("/account");
          router.refresh();
          return;
        }
      }

      setUpdateMessage("Password updated. You can now log in with your new password.");
      await supabase.auth.signOut().catch(() => null);
      router.push("/account/login");
      router.refresh();
    } catch {
      setUpdateError("We couldn't update your password.");
    } finally {
      setIsUpdatePending(false);
    }
  }

  const requestIntro =
    "Enter the email you used for your account and we will send you a password reset link.";
  const updateIntro = recoveryEmail
    ? `Choose a new password for ${recoveryEmail}.`
    : "Choose a new password for your account.";

  return (
    <main className="min-h-screen bg-transparent px-6 py-12 text-neutral-100">
      <div className="mx-auto max-w-4xl">
        <PageBrandHeader backHref="/account/login" />

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">
              {recoveryReady ? "Reset password" : "Forgot password"}
            </div>
            <h1 className="mt-3 text-4xl font-semibold text-neutral-100">
              {recoveryReady ? "Choose a new password" : "Reset your password"}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-300">
              {isCheckingRecovery ? "Checking your reset link..." : recoveryReady ? updateIntro : requestIntro}
            </p>

            {isCheckingRecovery ? (
              <div className="mt-8 rounded-2xl border border-[#163754] bg-[#020b14] px-4 py-4 text-sm text-neutral-300">
                Verifying your reset link.
              </div>
            ) : recoveryReady ? (
              <form className="mt-8 space-y-5" onSubmit={handleUpdatePassword}>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-neutral-200">New password</span>
                  <input
                    autoComplete="new-password"
                    className="w-full rounded-2xl border border-[#163754] bg-[#020b14] px-4 py-3 text-base text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]"
                    minLength={MIN_PASSWORD_LENGTH}
                    name="newPassword"
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="At least 8 characters"
                    required
                    type="password"
                    value={newPassword}
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-neutral-200">Confirm new password</span>
                  <input
                    autoComplete="new-password"
                    className="w-full rounded-2xl border border-[#163754] bg-[#020b14] px-4 py-3 text-base text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]"
                    minLength={MIN_PASSWORD_LENGTH}
                    name="confirmPassword"
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repeat your new password"
                    required
                    type="password"
                    value={confirmPassword}
                  />
                </label>

                {updateError ? (
                  <div className="rounded-2xl border border-red-500/60 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {updateError}
                  </div>
                ) : null}

                {updateMessage ? (
                  <div className="rounded-2xl border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                    {updateMessage}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-4">
                  <p className="text-sm text-neutral-400">After saving, we will try to sign you back in automatically.</p>
                  <button
                    type="submit"
                    disabled={isUpdatePending}
                    className="inline-flex rounded-full border border-[#8f7740]/70 bg-[#07101a] px-6 py-3 text-sm font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isUpdatePending ? "Saving..." : "Save new password"}
                  </button>
                </div>
              </form>
            ) : (
              <form className="mt-8 space-y-5" onSubmit={handleRequestReset}>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-neutral-200">Email</span>
                  <input
                    autoComplete="email"
                    className="w-full rounded-2xl border border-[#163754] bg-[#020b14] px-4 py-3 text-base text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]"
                    name="email"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    required
                    type="email"
                    value={email}
                  />
                </label>

                {requestError ? (
                  <div className="rounded-2xl border border-red-500/60 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {requestError}
                  </div>
                ) : null}

                {requestMessage ? (
                  <div className="rounded-2xl border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                    {requestMessage}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-4">
                  <p className="text-sm text-neutral-400">Reset links usually arrive within a minute or two.</p>
                  <button
                    type="submit"
                    disabled={isRequestPending}
                    className="inline-flex rounded-full border border-[#8f7740]/70 bg-[#07101a] px-6 py-3 text-sm font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isRequestPending ? "Sending..." : "Email reset link"}
                  </button>
                </div>
              </form>
            )}
          </section>

          <aside className="rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">How it works</div>
            <h2 className="mt-3 text-2xl font-semibold text-neutral-100">Account recovery</h2>
            <div className="mt-6 space-y-4 text-sm leading-7 text-neutral-300">
              <p>Request a reset email, open the link from your inbox, and choose a new password on this page.</p>
              <p>If a link has expired, come back here and request another one.</p>
              <p>
                Remembered it after all?{" "}
                <Link href="/account/login" className="text-neutral-100 underline decoration-[#8f7740]/50 underline-offset-4">
                  Return to login
                </Link>
                .
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
