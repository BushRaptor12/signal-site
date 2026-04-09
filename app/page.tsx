import { Suspense } from "react";
import HomePageClient from "./home-page-client";

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-transparent p-8 text-neutral-100">
          <div className="mx-auto max-w-4xl rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-10 text-center shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
            <h2 className="text-2xl font-semibold text-neutral-100">Loading stories...</h2>
            <p className="mt-3 text-neutral-400">Pulling together the latest coverage.</p>
          </div>
        </main>
      }
    >
      <HomePageClient />
    </Suspense>
  );
}
