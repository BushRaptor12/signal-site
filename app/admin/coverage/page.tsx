import { redirect } from "next/navigation";
import CoverageEditorClient from "@/app/admin/coverage/coverage-editor-client";
import { getAccountProfile } from "@/app/lib/account.server";
import { listCoverageHubs } from "@/app/lib/coverage-hubs.server";
import { supabaseServer } from "@/app/lib/supabase.server";
import { coerceStory, type StoryDbRow } from "@/app/lib/stories";

async function loadPublishedStories() {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("stories")
    .select("*")
    .eq("status", "published")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(250);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as StoryDbRow[]).map(coerceStory);
}

export default async function AdminCoveragePage() {
  const profile = await getAccountProfile();
  if (!profile?.isAdmin) {
    redirect("/account");
  }

  const [initialHubs, initialStories] = await Promise.all([listCoverageHubs(), loadPublishedStories()]);

  return <CoverageEditorClient initialHubs={initialHubs} initialStories={initialStories} />;
}
