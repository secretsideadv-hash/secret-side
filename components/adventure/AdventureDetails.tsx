import Link from "next/link";
import type { ReactNode } from "react";
import type { VisibleExperienceSummary } from "@/features/engine/types";
import { DIFFICULTY_LABEL, formatDistance, formatDuration, formatPrice, KIND_LABEL } from "@/lib/format";
import { ArrowLeftIcon, ClockIcon, MoonIcon, PinIcon, PuzzleIcon, WalkIcon } from "../ui/icons";
import { buttonClass, Eyebrow } from "../ui/primitives";
import { AdventureArt } from "./AdventureArt";

export function AdventureHero({ backHref }: { backHref: string }) {
  return (
    <div className="relative aspect-[4/3] w-full">
      <AdventureArt className="absolute inset-0 size-full" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ground to-transparent" />
      <Link
        href={backHref}
        aria-label="Back"
        className={`${buttonClass.icon} absolute top-[max(env(safe-area-inset-top),1rem)] left-4`}
      >
        <ArrowLeftIcon className="size-5" />
      </Link>
    </div>
  );
}

function Tile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <li className="flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-surface px-2 py-3">
      <span className="text-amber">{icon}</span>
      <span className="font-display text-[15px] leading-tight font-bold whitespace-nowrap">{value}</span>
      <span className="text-[11px] leading-tight text-muted">{label}</span>
    </li>
  );
}

export function FactTiles({ adventure }: { adventure: VisibleExperienceSummary }) {
  return (
    <ul className="grid grid-cols-4 gap-2" aria-label="Adventure facts">
      <Tile icon={<ClockIcon className="size-5" />} label="Duration" value={formatDuration(adventure.durationMinutes)} />
      <Tile icon={<PinIcon className="size-5" />} label="Stops" value={String(adventure.stopCount)} />
      <Tile icon={<PuzzleIcon className="size-5" />} label="Puzzles" value={String(adventure.puzzleCount)} />
      {/* Walking difficulty stays visible up front (CLAUDE.md safety). */}
      <Tile
        icon={<WalkIcon className="size-5" />}
        label={`${DIFFICULTY_LABEL[adventure.walkingDifficulty]} walk`}
        value={formatDistance(adventure.distanceMeters)}
      />
    </ul>
  );
}

/** CLAUDE.md safety: walking difficulty and night-time conditions up front. */
export function NightNotes({ adventure }: { adventure: VisibleExperienceSummary }) {
  const window =
    adventure.recommendedStartFrom && adventure.recommendedStartTo
      ? `Best started between ${adventure.recommendedStartFrom} and ${adventure.recommendedStartTo}.`
      : null;
  if (!window && !adventure.nightNotes) return null;
  return (
    <div className="flex gap-3 rounded-card border border-line bg-surface p-4">
      <MoonIcon className="mt-0.5 size-5 shrink-0 text-azulejo" />
      <div className="text-sm">
        {window && <p className="font-semibold text-fg">{window}</p>}
        {adventure.nightNotes && <p className="mt-1 text-muted">{adventure.nightNotes}</p>}
      </div>
    </div>
  );
}

const STEPS = [
  { title: "Find the stop", body: "Walk to each stop and check in when you get there." },
  { title: "Read the story, crack the clue", body: "Every stop has a short local story and one puzzle." },
  { title: "Unlock what's next", body: "The right answer reveals where to go next. Until then, it stays secret." },
] as const;

export function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="flex flex-col gap-3">
      <h2 id="how-heading" className="text-lg font-semibold">
        How it works
      </h2>
      <ol className="flex flex-col gap-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-amber/15 font-display text-sm font-bold text-amber">
              {i + 1}
            </span>
            <div>
              <p className="font-semibold">{step.title}</p>
              <p className="text-sm text-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

const GOOD_TO_KNOW = [
  "Drinks not included",
  "Non-drinker friendly",
  "Skip any stop",
  "Hints always available",
] as const;

export function GoodToKnow() {
  return (
    <section aria-labelledby="gtk-heading" className="flex flex-col gap-2">
      <h2 id="gtk-heading" className="text-sm font-semibold text-muted">
        Good to know
      </h2>
      <p className="text-sm text-fg">{GOOD_TO_KNOW.join(" · ")}</p>
    </section>
  );
}

export function AdventureIntro({ adventure }: { adventure: VisibleExperienceSummary }) {
  const tag = [KIND_LABEL[adventure.kind], adventure.isFlagship ? "Flagship" : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex flex-col gap-2">
      <Eyebrow>{tag}</Eyebrow>
      <h1 className="text-4xl leading-none font-bold tracking-tight">{adventure.title}</h1>
      <p className="mt-1 text-base font-medium text-fg">{adventure.tagline}</p>
      <p className="text-sm leading-relaxed text-muted">{adventure.description}</p>
    </div>
  );
}

export function PriceLabel({ adventure }: { adventure: VisibleExperienceSummary }) {
  return (
    <div className="min-w-0">
      <p className="font-display text-2xl leading-none font-bold">
        {formatPrice(adventure.priceCents, adventure.currency)}
        {adventure.priceCents > 0 && (
          <span className="ml-1 font-sans text-xs font-normal text-muted">per group</span>
        )}
      </p>
      {/* MOCK: M1 is free; Stripe Checkout arrives in M6. */}
      <p className="mt-1 text-xs text-success">Free during preview</p>
    </div>
  );
}
