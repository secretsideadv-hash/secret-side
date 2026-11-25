import Link from "next/link";
import type { ReactNode } from "react";
import type { VisibleState } from "@/features/engine/types";
import type { PlayActions } from "@/lib/play-types";
import { CloseIcon } from "../ui/icons";
import { buttonClass, ProgressSegments } from "../ui/primitives";
import { EmergencyButton } from "./EmergencyButton";

/** Phone-width column for active-adventure screens: no nav, no ads, no suggestions. */
export function PlayShell({ children, bottomBar }: { children: ReactNode; bottomBar?: ReactNode }) {
  return (
    <div
      className={`mx-auto flex min-h-dvh max-w-[430px] flex-col bg-ground min-[431px]:border-x min-[431px]:border-line ${
        bottomBar ? "pb-[calc(9.5rem+env(safe-area-inset-bottom))]" : "pb-10"
      }`}
    >
      {children}
      {bottomBar && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-raised/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto max-w-[430px] px-5 pt-3 pb-2">{bottomBar}</div>
        </div>
      )}
    </div>
  );
}

/**
 * Close button, title, the "2/5" counter, the Emergency button (active screens:
 * pass `endEarly`) and the 5-segment progress.
 */
export function PlayHeader({ state, endEarly }: { state: VisibleState; endEarly?: PlayActions["endEarly"] }) {
  const { session, experience, completedStops } = state;
  const position = Math.min(session.currentPosition, session.totalStops);
  return (
    <header className="flex flex-col gap-3 px-5 pt-[max(env(safe-area-inset-top),1rem)]">
      <div className="flex items-center gap-3">
        <Link href="/" aria-label="Close adventure (progress is saved)" className={`${buttonClass.icon} bg-surface`}>
          <CloseIcon className="size-5" />
        </Link>
        <p className="min-w-0 flex-1 truncate text-center font-display text-base font-semibold">
          {experience.title}
        </p>
        <p className="w-touch text-right font-display text-sm font-semibold text-muted" aria-label={`Stop ${position} of ${session.totalStops}`}>
          {position}/{session.totalStops}
        </p>
        {endEarly && <EmergencyButton state={state} endEarly={endEarly} />}
      </div>
      <ProgressSegments
        total={session.totalStops}
        completed={completedStops.length}
        label={`${completedStops.length} of ${session.totalStops} stops done`}
      />
    </header>
  );
}
