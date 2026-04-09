"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const TOKEN_KEY = "signal_admin_token";

type AdminAuthContextValue = {
  adminToken: string;
  clearToken: () => void;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

async function verifyAdminToken(token: string) {
  const res = await fetch("/api/admin/auth", {
    cache: "no-store",
    headers: { "x-admin-token": token },
  });

  return res.ok;
}

export function useAdminAuth() {
  const value = useContext(AdminAuthContext);
  if (!value) {
    throw new Error("useAdminAuth must be used within AdminAuthBoundary.");
  }

  return value;
}

export function AdminAuthBoundary({ children }: { children: React.ReactNode }) {
  const [adminToken, setAdminToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [isChecking, setIsChecking] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function restoreToken() {
      try {
        const savedToken = (localStorage.getItem(TOKEN_KEY) ?? "").trim();
        if (!savedToken) {
          if (!cancelled) setIsChecking(false);
          return;
        }

        if (await verifyAdminToken(savedToken)) {
          if (!cancelled) {
            setAdminToken(savedToken);
            setTokenDraft(savedToken);
            setError("");
          }
        } else {
          try {
            localStorage.removeItem(TOKEN_KEY);
          } catch {
            // ignore localStorage remove failure
          }

          if (!cancelled) {
            setTokenDraft("");
            setError("That token is not valid anymore.");
          }
        }
      } finally {
        if (!cancelled) setIsChecking(false);
      }
    }

    void restoreToken();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitToken() {
    const token = tokenDraft.trim();
    if (!token) {
      setError("Enter the admin token to continue.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const valid = await verifyAdminToken(token);
      if (!valid) {
        setError("Invalid admin token.");
        return;
      }

      try {
        localStorage.setItem(TOKEN_KEY, token);
      } catch {
        // ignore localStorage write failure
      }

      setAdminToken(token);
      setTokenDraft(token);
    } finally {
      setIsSubmitting(false);
    }
  }

  const clearToken = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore localStorage remove failure
    }

    setAdminToken("");
    setTokenDraft("");
    setError("");
  }, []);

  const value = useMemo(
    () => ({
      adminToken,
      clearToken,
    }),
    [adminToken, clearToken]
  );

  if (isChecking) {
    return (
      <main className="min-h-screen bg-neutral-950 px-6 py-12 text-neutral-100">
        <div className="mx-auto max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
          <div className="text-sm font-semibold uppercase tracking-[0.22em] text-neutral-500">Admin</div>
          <h1 className="mt-3 text-2xl font-semibold">Checking access</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-400">Verifying the stored admin token before loading the admin tools.</p>
        </div>
      </main>
    );
  }

  if (!adminToken) {
    return (
      <main className="min-h-screen bg-neutral-950 px-6 py-12 text-neutral-100">
        <div className="mx-auto max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
          <div className="text-sm font-semibold uppercase tracking-[0.22em] text-neutral-500">Admin</div>
          <h1 className="mt-3 text-2xl font-semibold">Token required</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-400">
            Enter the admin token to unlock the editor and briefing tools.
          </p>
          <input
            type="password"
            value={tokenDraft}
            onChange={(event) => setTokenDraft(event.target.value)}
            placeholder="Enter admin token..."
            className="mt-5 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submitToken();
              }
            }}
          />
          {error ? <div className="mt-3 text-sm text-red-300">{error}</div> : null}
          <button
            type="button"
            onClick={() => void submitToken()}
            disabled={isSubmitting}
            className="mt-5 w-full rounded-xl bg-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-900 disabled:cursor-wait disabled:opacity-70"
          >
            {isSubmitting ? "Checking..." : "Unlock admin"}
          </button>
        </div>
      </main>
    );
  }

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}
