export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function normalize(s: string) {
  return String(s).trim();
}

function uniqNormalized(arr: string[]) {
  const set = new Set(arr.map((a) => normalize(a)).filter(Boolean));
  return Array.from(set);
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const supabase = supabaseAdmin();
    const { name } = await params;

    const canonical = normalize(decodeURIComponent(name));
    if (!canonical) {
      return NextResponse.json({ error: "Missing entity name in route." }, { status: 400 });
    }

    const body = (await req.json()) as { aliases?: string[] };
    const aliases = uniqNormalized(body.aliases ?? []).filter(
      (a) => a.toLowerCase() !== canonical.toLowerCase()
    );

    const { data, error } = await supabase
      .from("entities")
      .update({ aliases })
      .eq("name", canonical)
      .select("name,aliases")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, entity: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
