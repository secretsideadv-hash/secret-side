import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass, Eyebrow, ProgressSegments } from "@/components/ui/primitives";
import { getPlayState } from "@/server/play";

export const metadata: Metadata = { title: "Playing" };

// MOCK: placeholder so "Unlock adventure" lands somewhere real. The Play screen is M1 step 5.
async function SessionPreview({ params }: { params: Promise<{ sessionId: string }> }) {
  const state = await getPlayState((await params).sessionId);
  if (!state) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold">This adventure isn&apos;t on this phone</h1>
        <p className="text-muted">Start it from the adventure page to play here.</p>
        <Link href="/" className={buttonClass.secondary}>
          Back to Discover
        </Link>
      </div>
    );
  }
  const current = state.current;
  return (
    <div className="flex flex-col gap-5">
      <Eyebrow>{state.experience.title}</Eyebrow>
      <ProgressSegments
        total={state.session.totalStops}
        completed={state.completedStops.length}
        label={`${state.completedStops.length} of ${state.session.totalStops} stops done`}
      />
      {current && (
        <div className="rounded-card border border-line bg-surface p-5">
          <p className="text-sm text-muted">
            Stop {current.position} of {state.session.totalStops} unlocked
          </p>
          <h1 className="mt-1 text-3xl font-bold">{current.title}</h1>
          <p className="mt-2 text-muted">{current.teaser}</p>
        </div>
      )}
      <p className="text-sm text-muted">The play screen arrives in the next step.</p>
      <Link href="/" className={buttonClass.secondary}>
        Back to Discover
      </Link>
    </div>
  );
}

export default function PlayPage({ params }: PageProps<"/play/[sessionId]">) {
  return (
    <main className="mx-auto min-h-dvh max-w-[430px] px-5 pt-[max(env(safe-area-inset-top),1.5rem)] pb-10">
      <Suspense fallback={<p className="text-muted">Loading your adventure…</p>}>
        <SessionPreview params={params} />
      </Suspense>
    </main>
  );
}
