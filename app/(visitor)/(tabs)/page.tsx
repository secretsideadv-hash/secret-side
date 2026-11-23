import { Suspense } from "react";
import {
  CategoryChips,
  ContinueCard,
  FeaturedAdventureCard,
  TwoHoursCard,
} from "@/components/discover/DiscoverCards";
import { PinIcon } from "@/components/ui/icons";
import { Pill } from "@/components/ui/primitives";
import { getFeaturedSummary } from "@/server/catalog";
import { getContinueCard } from "@/server/play";

/** Reads the session cookie, so it streams in per request; the rest of Discover is prerendered. */
async function ContinueSection() {
  const card = await getContinueCard();
  return card ? <ContinueCard card={card} /> : null;
}

async function FeaturedSection() {
  const featured = await getFeaturedSummary("porto");
  if (!featured) return null;
  return (
    <section aria-labelledby="featured-heading" className="flex flex-col gap-3">
      <h2 id="featured-heading" className="text-lg font-semibold">
        Featured adventure
      </h2>
      <FeaturedAdventureCard adventure={featured} />
    </section>
  );
}

export default function DiscoverPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-2">
        <Pill icon={<PinIcon className="size-3.5 text-amber" />}>Porto</Pill>
        {/* MOCK: always "guest" until Supabase anonymous auth / accounts (M2). */}
        <Pill>Playing as guest</Pill>
      </header>

      <h1 className="text-[2.5rem] leading-[1.02] font-bold tracking-tight">
        Don&apos;t just visit. <span className="block text-amber">Play Porto.</span>
      </h1>

      <Suspense fallback={null}>
        <ContinueSection />
      </Suspense>

      <FeaturedSection />

      <TwoHoursCard />

      <section aria-labelledby="categories-heading" className="flex flex-col gap-3">
        <h2 id="categories-heading" className="text-lg font-semibold">
          Browse by mood
        </h2>
        <CategoryChips />
      </section>
    </div>
  );
}
