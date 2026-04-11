"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import PageBrandHeader from "@/app/page-brand-header";

type Mode = "login" | "signup";

type AuthResponse = {
  error?: string;
  ok?: boolean;
};

const MODE_COPY: Record<Mode, { blurb: string; cta: string; eyebrow: string; helper: string }> = {
  login: {
    blurb: "Sign back in to keep up with the stories you follow and your reader history.",
    cta: "Log in",
    eyebrow: "Welcome back",
    helper: "Use the email and password you signed up with.",
  },
  signup: {
    blurb: "Create a Beacon account to save your reader identity for follows, comments, and future account tools.",
    cta: "Create account",
    eyebrow: "Join The Beacon",
    helper: "Usernames can use letters, numbers, and underscores.",
  },
};

export default function AuthPageClient() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    try {
      const response = await fetch(mode === "login" ? "/api/account/login" : "/api/account/signup", {
        body: JSON.stringify({
          email,
          password,
          username,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const data = (await response.json()) as AuthResponse;
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }

      router.push("/account");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  const copy = MODE_COPY[mode];

  return (
    <main className="min-h-screen bg-transparent px-6 py-12 text-neutral-100">
      <div className="mx-auto max-w-4xl">
        <PageBrandHeader backHref="/" />

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">{copy.eyebrow}</div>
            <h1 className="mt-3 text-4xl font-semibold text-neutral-100">
              {mode === "login" ? "Log in to your account" : "Create your account"}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-300">{copy.blurb}</p>

            <div className="mt-8 inline-flex rounded-full border border-[#0d2438] bg-[#020b14] p-1">
              {(["login", "signup"] as Mode[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setMode(value);
                    setError(null);
                  }}
                  className={`rounded-full px-4 py-2 text-sm transition ${
                    mode === value
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-neutral-300 hover:bg-[#03101b] hover:text-white"
                  }`}
                >
                  {value === "login" ? "Log in" : "Sign up"}
                </button>
              ))}
            </div>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              {mode === "signup" ? (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-neutral-200">Username</span>
                  <input
                    autoComplete="username"
                    className="w-full rounded-2xl border border-[#163754] bg-[#020b14] px-4 py-3 text-base text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]"
                    maxLength={24}
                    name="username"
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="username"
                    required
                    value={username}
                  />
                </label>
              ) : null}

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-neutral-200">Email</span>
                <input
                  autoComplete={mode === "login" ? "email" : "new-email"}
                  className="w-full rounded-2xl border border-[#163754] bg-[#020b14] px-4 py-3 text-base text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]"
                  name="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                  type="email"
                  value={email}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-neutral-200">Password</span>
                <input
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="w-full rounded-2xl border border-[#163754] bg-[#020b14] px-4 py-3 text-base text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]"
                  minLength={8}
                  name="password"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === "login" ? "Your password" : "At least 8 characters"}
                  required
                  type="password"
                  value={password}
                />
              </label>

              {error ? (
                <div className="rounded-2xl border border-red-500/60 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-sm text-neutral-400">{copy.helper}</p>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex rounded-full border border-[#8f7740]/70 bg-[#07101a] px-6 py-3 text-sm font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isPending ? "Working..." : copy.cta}
                </button>
              </div>
            </form>
          </section>

          <aside className="rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">Reader account</div>
            <h2 className="mt-3 text-2xl font-semibold text-neutral-100">What you get</h2>
            <div className="mt-6 space-y-4 text-sm leading-7 text-neutral-300">
              <p>Your account page will show the stories you follow and the comment history tied to your username.</p>
              <p>Comments are coming soon, so the history section will be ready for that rollout instead of needing another redesign later.</p>
              <p>Account settings are also in place so we can expand into profile editing and reader preferences cleanly.</p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
