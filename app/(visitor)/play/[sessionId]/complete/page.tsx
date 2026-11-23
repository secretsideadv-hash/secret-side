import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { NotOnThisPhone } from "@/components/play/NotOnThisPhone";
import { PlayHeader, PlayShell } from "@/components/play/PlayChrome";
import { StampIcon } from "@/components/ui/icons";
import { buttonClass } from "@/components/ui/primitives";
import type { Resolution } from "@/features/engine/types";
import { getPlayState } from "@/server/play";

export const metadata: Metadata = { title: "Adventure complete" };

const RESOLUTION_LABEL: Record<Resolution, string> = {
  answered: "Solved",
  revealed: "Revealed",
  skipped: "Skipped",
};

// Simple completion screen for M1. Stamps, titles and the share card are M7.
async function CompleteLoader({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const state = await getPlayState(sessionId);
  if (!state) return <NotOnThisPhone />;
  if (state.session.status !== "completed") redirect(`/play/${sessionId}`);

  const finale = state.completedStops.at(-1)?.explanation;
  return (
    <PlayShell>
      <PlayHeader state={state} />
      <main className="flex flex-col gap-6 px-5 pt-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="inline-flex size-20 items-center justify-center rounded-full bg-amber/15 text-amber">
            <StampIcon className="size-10" />
          </span>
          <p className="text-sm font-semibold text-amber">Adventure complete</p>
          <h1 className="text-4xl leading-none font-bold tracking-tight">{state.experience.title}</h1>
          <p className="text-muted">
            You scored <span className="font-display text-xl font-bold text-fg">{state.session.score}</span> points
          </p>
        </div>

        {finale && (
          <section className="rounded-card border border-amber/30 bg-amber/5 p-5">
            <p className="text-[15px] leading-relaxed text-fg">{finale}</p>
          </section>
        )}

        <section aria-labelledby="stops-heading" className="flex flex-col gap-2">
          <h2 id="stops-heading" className="text-lg font-semibold">
            Your stops
          </h2>
          <ol className="flex flex-col gap-2">
            {state.completedStops.map((stop) => (
              <li key={stop.stopId} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {stop.position}. {stop.title}
                  </span>
                  <span className="block truncate text-xs text-muted">{stop.venueName}</span>
                </span>
                <span className={`shrink-0 text-xs font-semibold ${stop.resolution === "answered" ? "text-success" : "text-muted"}`}>
                  {RESOLUTION_LABEL[stop.resolution]}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <Link href="/" className={buttonClass.primary}>
          Back to Discover
        </Link>
      </main>
    </PlayShell>
  );
}

export default function CompletePage({ params }: PageProps<"/play/[sessionId]/complete">) {
  return (
    <Suspense fallback={<div className="mx-auto min-h-dvh max-w-[430px]" aria-busy="true" />}>
      <CompleteLoader params={params} />
    </Suspense>
  );
}
