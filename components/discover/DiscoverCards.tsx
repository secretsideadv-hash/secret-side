import Link from "next/link";
import type { VisibleContinueCard, VisibleExperienceSummary } from "@/features/engine/types";
import { DIFFICULTY_LABEL, formatDuration, formatPrice, KIND_LABEL } from "@/lib/format";
import { AdventureArt } from "../adventure/AdventureArt";
import { ArrowRightIcon, ClockIcon } from "../ui/icons";
import { Eyebrow, ProgressSegments } from "../ui/primitives";

export function ContinueCard({ card }: { card: VisibleContinueCard }) {
  return (
    <Link
      href={`/play/${card.sessionId}`}
      className="block rounded-card border border-line bg-surface p-4 transition active:scale-[0.99]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow>Continue</Eyebrow>
          <p className="mt-1 truncate font-display text-lg font-semibold">{card.experienceTitle}</p>
          <p className="truncate text-sm text-muted">
            Stop {card.currentPosition} of {card.totalStops} · {card.currentTitle}
          </p>
        </div>
        <span className="inline-flex size-touch shrink-0 items-center justify-center rounded-full bg-amber text-on-amber">
          <ArrowRightIcon className="size-5" />
          <span className="sr-only">Continue {card.experienceTitle}</span>
        </span>
      </div>
      <div className="mt-4">
        <ProgressSegments
          total={card.totalStops}
          completed={card.completedCount}
          label={`${card.completedCount} of ${card.totalStops} stops done`}
        />
      </div>
    </Link>
  );
}

export function FeaturedAdventureCard({ adventure }: { adventure: VisibleExperienceSummary }) {
  const tag = [KIND_LABEL[adventure.kind], adventure.isFlagship ? "Flagship" : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link
      href={`/adventures/${adventure.slug}`}
      prefetch // resolve the URL-specific details ahead of the tap (Partial Prefetching)
      className="block overflow-hidden rounded-card border border-line bg-surface transition active:scale-[0.99]"
    >
      <div className="relative aspect-[16/10] w-full">
        <AdventureArt className="absolute inset-0 size-full" />
        <span className="absolute top-3 left-3 rounded-full bg-ground/80 px-3 py-1.5 text-xs font-semibold text-amber backdrop-blur">
          {tag}
        </span>
      </div>
      <div className="p-4">
        <h3 className="text-2xl font-bold tracking-tight">{adventure.title}</h3>
        <p className="mt-1 text-sm text-muted">{adventure.tagline}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <ClockIcon className="size-4 shrink-0" />
            <span>
              {formatDuration(adventure.durationMinutes)} · {adventure.stopCount} stops ·{" "}
              {DIFFICULTY_LABEL[adventure.walkingDifficulty]}
            </span>
          </p>
          <p className="shrink-0 text-right">
            <span className="block font-display text-lg leading-none font-bold text-amber">
              {formatPrice(adventure.priceCents, adventure.currency)}
            </span>
            {adventure.priceCents > 0 && <span className="text-[11px] text-muted">per group</span>}
          </p>
        </div>
      </div>
    </Link>
  );
}

export function TwoHoursCard() {
  return (
    <Link
      href="/coming-soon"
      className="flex items-center justify-between gap-4 rounded-card bg-amber p-4 text-on-amber transition active:scale-[0.99]"
    >
      <div>
        <p className="font-display text-xl font-bold">I have 2 hours</p>
        <p className="text-sm font-medium">Tell us where you are. We&apos;ll plan the rest.</p>
      </div>
      <span className="inline-flex size-touch shrink-0 items-center justify-center rounded-full bg-on-amber text-amber">
        <ArrowRightIcon className="size-5" />
      </span>
    </Link>
  );
}

// MOCK: categories link to "coming soon" until there's more than one adventure to filter.
const CATEGORIES = ["Mysteries", "Night out", "Food quests", "Hidden gems"] as const;

export function CategoryChips() {
  return (
    <nav aria-label="Categories" className="-mx-5 overflow-x-auto px-5 [scrollbar-width:none]">
      <ul className="flex w-max gap-2">
        {CATEGORIES.map((c) => (
          <li key={c}>
            <Link
              href="/coming-soon"
              className="inline-flex h-touch items-center rounded-full border border-line bg-surface px-4 text-sm font-medium text-fg transition active:scale-95"
            >
              {c}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
