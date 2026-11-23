import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  AdventureHero,
  AdventureIntro,
  FactTiles,
  GoodToKnow,
  HowItWorks,
  NightNotes,
  PriceLabel,
} from "@/components/adventure/AdventureDetails";
import { UnlockButton } from "@/components/adventure/UnlockButton";
import { getSummaryBySlug, listPublishedSlugs } from "@/server/catalog";
import { unlockAdventure } from "./actions";

export async function generateStaticParams() {
  return (await listPublishedSlugs("porto")).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/adventures/[slug]">): Promise<Metadata> {
  const adventure = await getSummaryBySlug((await params).slug);
  return adventure ? { title: adventure.title, description: adventure.tagline } : {};
}

/** Depends on the URL (`slug`), so it streams behind Suspense; the hero is in the instant shell. */
async function AdventureBody({ params }: { params: Promise<{ slug: string }> }) {
  const adventure = await getSummaryBySlug((await params).slug);
  if (!adventure) notFound();

  return (
    <>
      <main className="relative -mt-6 flex flex-col gap-6 px-5">
        <AdventureIntro adventure={adventure} />
        <FactTiles adventure={adventure} />
        <NightNotes adventure={adventure} />
        <HowItWorks />
        <GoodToKnow />
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-raised/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <form
          action={unlockAdventure.bind(null, adventure.slug)}
          className="mx-auto flex max-w-[430px] items-center gap-4 px-5 py-3"
        >
          <PriceLabel adventure={adventure} />
          <UnlockButton />
        </form>
      </div>
    </>
  );
}

function BodySkeleton() {
  return (
    <div className="relative -mt-6 flex flex-col gap-4 px-5" aria-busy="true" aria-label="Loading adventure">
      <div className="h-4 w-40 rounded-full bg-surface" />
      <div className="h-10 w-2/3 rounded-xl bg-surface" />
      <div className="h-16 w-full rounded-xl bg-surface" />
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-surface" />
        ))}
      </div>
    </div>
  );
}

export default function AdventureDetailsPage({ params }: PageProps<"/adventures/[slug]">) {
  return (
    <div className="mx-auto min-h-dvh max-w-[430px] bg-ground pb-[calc(6.5rem+env(safe-area-inset-bottom))] min-[431px]:border-x min-[431px]:border-line">
      <AdventureHero backHref="/" />
      <Suspense fallback={<BodySkeleton />}>
        <AdventureBody params={params} />
      </Suspense>
    </div>
  );
}
