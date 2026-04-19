import Link from "next/link";
import { redirect } from "next/navigation";
import AdminEntitiesManagerClient from "@/app/admin/entities/admin-entities-manager-client";
import { getAccountProfile } from "@/app/lib/account.server";
import { listAdminEntities, listAdminInterestSignals } from "@/app/lib/admin-tools";
import { ADMIN_PANEL } from "@/app/lib/surfaces";

export default async function AdminEntitiesPage() {
  const profile = await getAccountProfile();
  if (!profile?.isAdmin) {
    redirect("/account");
  }

  const [initialEntities, initialInterestSignals] = await Promise.all([
    listAdminEntities(500),
    listAdminInterestSignals(30),
  ]);

  return (
    <main className="min-h-screen bg-neutral-900 p-8 text-neutral-100">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.22em] text-neutral-500">Admin</div>
            <h1 className="mt-2 text-3xl font-bold">Entities Manager</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-400">
              Manage canonical entities and aliases, then use real reader interest input to decide what should become part of the system.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/admin" className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white">
              Control center
            </Link>
            <Link href="/admin/editor" className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white">
              Story editor
            </Link>
          </div>
        </div>

        <div className={`mt-8 ${ADMIN_PANEL} p-8`}>
          <AdminEntitiesManagerClient initialEntities={initialEntities} initialInterestSignals={initialInterestSignals} />
        </div>
      </div>
    </main>
  );
}
