export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requestHasAdminAccess } from "@/app/lib/admin.server";

type EntityRow = {
  aliases: string[] | null;
  name: string;
};

type StoryEntity = {
  aliases?: string[] | null;
  name?: string | null;
};

type StoryRow = {
  entities: StoryEntity[] | null;
  id: string;
  primary_entities: string[] | null;
};

function messageFromError(e: unknown) {
  if (e instanceof Error) return e.message;
  return String(e);
}

function normalize(s: string) {
  return String(s).trim();
}

function normalizeKey(s: string) {
  return normalize(s).toLowerCase();
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

function mergeAliasLists(...lists: string[][]) {
  return uniqNormalized(lists.flat()).sort((left, right) => left.localeCompare(right));
}

function rewriteStoryEntities(row: StoryRow, sourceName: string, targetName?: string) {
  const sourceKey = normalizeKey(sourceName);
  const targetKey = targetName ? normalizeKey(targetName) : null;
  const orderedKeys: string[] = [];
  const entityMap = new Map<string, { aliases: string[]; name: string }>();

  for (const entity of row.entities ?? []) {
    const canonicalName = normalize(entity?.name ?? "");
    if (!canonicalName) continue;

    const currentKey = normalizeKey(canonicalName);
    if (!currentKey) continue;
    if (!targetKey && currentKey === sourceKey) {
      continue;
    }

    const nextKey = targetKey && currentKey === sourceKey ? targetKey : currentKey;
    const nextName = nextKey === targetKey ? targetName! : canonicalName;
    const nextAliases = uniqNormalized([
      ...((entity?.aliases ?? []).map((alias) => normalize(alias)).filter(Boolean)),
      ...(targetKey && currentKey === sourceKey ? [sourceName] : []),
    ]).filter((alias) => normalizeKey(alias) !== normalizeKey(nextName));

    const existing = entityMap.get(nextKey);
    if (!existing) {
      orderedKeys.push(nextKey);
      entityMap.set(nextKey, {
        aliases: nextAliases,
        name: nextName,
      });
      continue;
    }

    entityMap.set(nextKey, {
      aliases: mergeAliasLists(existing.aliases, nextAliases),
      name: existing.name,
    });
  }

  const nextEntities = orderedKeys.map((key) => {
    const entity = entityMap.get(key)!;
    return {
      aliases: entity.aliases,
      name: entity.name,
    };
  });

  const nextPrimaryEntities = uniqNormalized(
    (row.primary_entities ?? [])
      .map((entityName) => normalize(entityName))
      .flatMap((entityName) => {
        const key = normalizeKey(entityName);
        if (!key) return [];
        if (!targetKey && key === sourceKey) return [];
        if (targetKey && key === sourceKey) return [targetName!];
        return [entityName];
      })
  );

  const previousEntities = JSON.stringify((row.entities ?? []).map((entity) => ({
    aliases: uniqNormalized((entity?.aliases ?? []).map((alias) => normalize(alias)).filter(Boolean)),
    name: normalize(entity?.name ?? ""),
  })));
  const previousPrimaryEntities = JSON.stringify(
    uniqNormalized((row.primary_entities ?? []).map((entityName) => normalize(entityName)).filter(Boolean))
  );
  const changed =
    previousEntities !== JSON.stringify(nextEntities) || previousPrimaryEntities !== JSON.stringify(nextPrimaryEntities);

  return {
    changed,
    entities: nextEntities,
    primary_entities: nextPrimaryEntities,
  };
}

async function syncStoriesForEntityChange(supabase: ReturnType<typeof supabaseAdmin>, sourceName: string, targetName?: string) {
  const { data, error } = await supabase.from("stories").select("id, entities, primary_entities");
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as StoryRow[];
  for (const row of rows) {
    const rewritten = rewriteStoryEntities(row, sourceName, targetName);
    if (!rewritten.changed) continue;

    const { error: updateError } = await supabase
      .from("stories")
      .update({
        entities: rewritten.entities,
        primary_entities: rewritten.primary_entities,
      })
      .eq("id", row.id);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    if (!(await requestHasAdminAccess(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = supabaseAdmin();
    const { name } = await params;

    const canonical = normalize(decodeURIComponent(name));
    if (!canonical) {
      return NextResponse.json({ error: "Missing entity name in route." }, { status: 400 });
    }

    const body = (await req.json()) as { aliases?: string[]; mergeIntoName?: string };
    const mergeIntoName = normalize(body.mergeIntoName ?? "");

    if (mergeIntoName) {
      if (normalizeKey(mergeIntoName) === normalizeKey(canonical)) {
        return NextResponse.json({ error: "Choose a different entity to merge into." }, { status: 400 });
      }

      const { data: entities, error: entityError } = await supabase
        .from("entities")
        .select("name,aliases")
        .in("name", [canonical, mergeIntoName]);

      if (entityError) return NextResponse.json({ error: entityError.message }, { status: 500 });

      const sourceEntity = ((entities ?? []) as EntityRow[]).find((entity) => normalizeKey(entity.name) === normalizeKey(canonical));
      const targetEntity = ((entities ?? []) as EntityRow[]).find((entity) => normalizeKey(entity.name) === normalizeKey(mergeIntoName));

      if (!sourceEntity || !targetEntity) {
        return NextResponse.json({ error: "Both entities must exist before merging." }, { status: 404 });
      }

      const nextAliases = mergeAliasLists(
        (targetEntity.aliases ?? []).map((alias) => normalize(alias)).filter(Boolean),
        (sourceEntity.aliases ?? []).map((alias) => normalize(alias)).filter(Boolean),
        [sourceEntity.name]
      ).filter((alias) => normalizeKey(alias) !== normalizeKey(targetEntity.name));

      const { data: updatedTarget, error: updateError } = await supabase
        .from("entities")
        .update({ aliases: nextAliases })
        .eq("name", targetEntity.name)
        .select("name,aliases")
        .single();

      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

      const { error: deleteError } = await supabase.from("entities").delete().eq("name", sourceEntity.name);
      if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

      await syncStoriesForEntityChange(supabase, sourceEntity.name, targetEntity.name);

      return NextResponse.json({ ok: true, entity: updatedTarget, mergedFrom: sourceEntity.name });
    }

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
  } catch (e: unknown) {
    return NextResponse.json({ error: messageFromError(e) }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    if (!(await requestHasAdminAccess(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = supabaseAdmin();
    const { name } = await params;
    const canonical = normalize(decodeURIComponent(name));
    if (!canonical) {
      return NextResponse.json({ error: "Missing entity name in route." }, { status: 400 });
    }

    const { error } = await supabase.from("entities").delete().eq("name", canonical);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await syncStoriesForEntityChange(supabase, canonical);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: messageFromError(e) }, { status: 500 });
  }
}
