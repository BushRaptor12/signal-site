"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !key) {
    throw new Error("Missing browser Supabase env vars for password recovery.");
  }

  if (!client) {
    client = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: true,
        flowType: "pkce",
        persistSession: false,
      },
    });
  }

  return client;
}
