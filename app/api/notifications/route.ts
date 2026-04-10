export const runtime = "nodejs";

import { NextResponse } from "next/server";
import type { SiteNotificationEntry } from "@/app/lib/notification-store";
import { supabaseServer } from "@/app/lib/supabase.server";

function messageFromError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rawLimit = Number(url.searchParams.get("limit") ?? 20);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 20;

    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("site_notifications")
      .select("id, type, title, body, href, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    const notifications: SiteNotificationEntry[] = ((data ?? []) as Array<{
      id?: number | string | null;
      type?: "urgent" | null;
      title?: string | null;
      body?: string | null;
      href?: string | null;
      created_at?: string | null;
    }>).map((item) => ({
      id: String(item.id ?? ""),
      type: item.type === "urgent" ? "urgent" : "urgent",
      title: item.title ?? "Notification",
      body: item.body ?? "",
      href: item.href ?? "/notifications",
      createdAt: item.created_at ?? new Date().toISOString(),
      read: true,
    }));

    return NextResponse.json(notifications);
  } catch (error) {
    return NextResponse.json({ error: messageFromError(error) }, { status: 500 });
  }
}
