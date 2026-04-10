export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase.server";
import { toStoredPushSubscription } from "@/app/lib/push";

function messageFromError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { subscription?: unknown; urgentNews?: boolean };
    const subscription = toStoredPushSubscription(body.subscription);
    if (!subscription) {
      return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
    }

    const supabase = supabaseServer();
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        urgent_news: body.urgentNews !== false,
        user_agent: req.headers.get("user-agent"),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: messageFromError(error) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { endpoint?: unknown };
    const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
    if (!endpoint) {
      return NextResponse.json({ error: "Endpoint is required." }, { status: 400 });
    }

    const supabase = supabaseServer();
    const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: messageFromError(error) }, { status: 500 });
  }
}
