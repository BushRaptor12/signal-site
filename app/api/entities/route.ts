export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type EntityRow = {
  name: string;
  aliases: string[];
};

function normalize(s: string) {
  return String(s).trim();
}

function uniqNormalized(arr: string[]) {
  const set = new Set(
    arr.map((a) => normalize(a)).filter(Boolean)
  );
  return Array.from(set);
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  try {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("entities")
      .select("name,aliases")
      .order("name", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const incoming = (await req.json()) as Partial<EntityRow>;

    const name = normalize(incoming.name ?? "");
    if (!name) {
      return NextResponse.json({ error: "Entity name is required." }, { status: 400 });
    }

    const aliases = uniqNormalized(incoming.aliases ?? []);
    // Keep canonical name out of aliases
    const cleanedAliases = aliases.filter((a) => a.toLowerCase() !== name.toLowerCase());

    const { data, error } = await supabase
      .from("entities")
      .insert({ name, aliases: cleanedAliases })
      .select("name,aliases")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, entity: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
