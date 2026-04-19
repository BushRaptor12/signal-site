"use client";

import { useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { PUBLIC_INSET } from "@/app/lib/surfaces";

type SettingsFormsProps = {
  email: string;
  username: string;
};

function SettingsCard({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className={`${PUBLIC_INSET} p-5`}>
      <h2 className="text-lg font-semibold text-neutral-100">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-neutral-400">{description}</p>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function FormMessage({ error, success }: { error: string; success: string }) {
  if (error) {
    return <p className="mt-3 text-sm text-red-200">{error}</p>;
  }

  if (success) {
    return <p className="mt-3 text-sm text-[#d7c08d]">{success}</p>;
  }

  return null;
}

export default function SettingsForms({ email, username }: SettingsFormsProps) {
  const router = useRouter();
  const [usernameValue, setUsernameValue] = useState(username);
  const [emailValue, setEmailValue] = useState(email);
  const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [usernamePending, setUsernamePending] = useState(false);
  const [emailPending, setEmailPending] = useState(false);
  const [passwordPending, setPasswordPending] = useState(false);

  const [usernameError, setUsernameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const [usernameSuccess, setUsernameSuccess] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  async function saveUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (usernamePending) return;

    setUsernamePending(true);
    setUsernameError("");
    setUsernameSuccess("");

    try {
      const response = await fetch("/api/account/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "username",
          username: usernameValue,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        profile?: { email: string; username: string };
      };

      if (!response.ok) {
        setUsernameError(data.error ?? "We couldn't update your username.");
        return;
      }

      if (data.profile?.username) {
        setUsernameValue(data.profile.username);
      }

      setUsernameSuccess("Username updated.");
      router.refresh();
    } catch {
      setUsernameError("We couldn't update your username.");
    } finally {
      setUsernamePending(false);
    }
  }

  async function saveEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (emailPending) return;

    setEmailPending(true);
    setEmailError("");
    setEmailSuccess("");

    try {
      const response = await fetch("/api/account/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "email",
          currentPassword: emailPassword,
          email: emailValue,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        profile?: { email: string; username: string };
      };

      if (!response.ok) {
        setEmailError(data.error ?? "We couldn't update your email.");
        return;
      }

      if (data.profile?.email) {
        setEmailValue(data.profile.email);
      }

      setEmailPassword("");
      setEmailSuccess("Email updated.");
      router.refresh();
    } catch {
      setEmailError("We couldn't update your email.");
    } finally {
      setEmailPending(false);
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordPending) return;

    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation must match.");
      setPasswordSuccess("");
      return;
    }

    setPasswordPending(true);
    setPasswordError("");
    setPasswordSuccess("");

    try {
      const response = await fetch("/api/account/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "password",
          confirmPassword,
          currentPassword,
          newPassword,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setPasswordError(data.error ?? "We couldn't update your password.");
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess("Password updated.");
    } catch {
      setPasswordError("We couldn't update your password.");
    } finally {
      setPasswordPending(false);
    }
  }

  return (
    <div className="mt-8 space-y-4">
      <div className={`${PUBLIC_INSET} p-5`}>
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Current account</div>
        <div className="mt-3 text-xl font-semibold text-neutral-100">{usernameValue}</div>
        <div className="mt-1 text-sm text-neutral-400">{emailValue}</div>
      </div>

      <SettingsCard
        title="Username"
        description='Usernames stay unique regardless of letter case.'
      >
        <form className="space-y-3" onSubmit={(event) => void saveUsername(event)}>
          <input
            type="text"
            autoComplete="username"
            value={usernameValue}
            onChange={(event) => setUsernameValue(event.target.value)}
            className="w-full rounded-2xl border border-[#163754] bg-[#020b14] px-4 py-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]"
          />
          <button
            type="submit"
            disabled={usernamePending}
            className="rounded-full border border-[#8f7740]/70 bg-[#07101a] px-5 py-3 text-sm font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {usernamePending ? "Saving..." : "Save username"}
          </button>
        </form>
        <FormMessage error={usernameError} success={usernameSuccess} />
      </SettingsCard>

      <SettingsCard
        title="Email"
        description="Email changes require your current password."
      >
        <form className="space-y-3" onSubmit={(event) => void saveEmail(event)}>
          <input
            type="email"
            autoComplete="email"
            value={emailValue}
            onChange={(event) => setEmailValue(event.target.value)}
            className="w-full rounded-2xl border border-[#163754] bg-[#020b14] px-4 py-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]"
          />
          <input
            type="password"
            autoComplete="current-password"
            value={emailPassword}
            onChange={(event) => setEmailPassword(event.target.value)}
            placeholder="Current password"
            className="w-full rounded-2xl border border-[#163754] bg-[#020b14] px-4 py-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]"
          />
          <button
            type="submit"
            disabled={emailPending}
            className="rounded-full border border-[#8f7740]/70 bg-[#07101a] px-5 py-3 text-sm font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {emailPending ? "Saving..." : "Save email"}
          </button>
        </form>
        <FormMessage error={emailError} success={emailSuccess} />
      </SettingsCard>

      <SettingsCard
        title="Password"
        description="Enter your current password first, then choose a new one with at least 8 characters."
      >
        <form className="space-y-3" onSubmit={(event) => void savePassword(event)}>
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder="Current password"
            className="w-full rounded-2xl border border-[#163754] bg-[#020b14] px-4 py-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]"
          />
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="New password"
            className="w-full rounded-2xl border border-[#163754] bg-[#020b14] px-4 py-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]"
          />
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirm new password"
            className="w-full rounded-2xl border border-[#163754] bg-[#020b14] px-4 py-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]"
          />
          <button
            type="submit"
            disabled={passwordPending}
            className="rounded-full border border-[#8f7740]/70 bg-[#07101a] px-5 py-3 text-sm font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {passwordPending ? "Saving..." : "Save password"}
          </button>
        </form>
        <FormMessage error={passwordError} success={passwordSuccess} />
      </SettingsCard>
    </div>
  );
}
