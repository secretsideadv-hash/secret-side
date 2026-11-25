import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { MapView } from "@/components/maps/MapView";
import { mapLabel, markersFromState } from "@/components/maps/markers";
import { EmergencyButton } from "@/components/play/EmergencyButton";
import { NotOnThisPhone } from "@/components/play/NotOnThisPhone";
import { PlayHeader, PlayShell } from "@/components/play/PlayChrome";
import { CheckCircleIcon, ExternalIcon, PinIcon, UnlockIcon } from "@/components/ui/icons";
import { buttonClass } from "@/components/ui/primitives";
import type { VisibleCompletedStop } from "@/features/engine/types";
import { googleMapsDirectionsUrl } from "@/lib/maps";
import { getPlayState } from "@/server/play";
import { endEarlyAction } from "../actions";

export const metadata: Metadata = { title: "Destination unlocked" };

function PreviousResult({ stop }: { stop: VisibleCompletedStop }) {
  const heading =
    stop.resolution === "answered"
      ? "Correct!"
      : stop.resolution === "revealed"
        ? `The answer was: ${stop.answer}`
        : `Stop ${stop.position} skipped`;
  return (
    <section className="flex flex-col gap-1.5 rounded-card border border-line bg-surface p-4">
      <p className="flex items-center gap-2 font-semibold text-success">
        <CheckCircleIcon className="size-5 shrink-0" />
        {heading}
      </p>
      {stop.explanation && <p className="text-sm text-muted">{stop.explanation}</p>}
    </section>
  );
}

async function UnlockedLoader({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const state = await getPlayState(sessionId);
  if (!state) return <NotOnThisPhone />;
  if (state.session.status === "completed" || !state.current) redirect(`/play/${sessionId}/complete`);

  const next = state.current;
  const previous = state.completedStops.at(-1);
  // Only meaningful right after a stop is completed and before arriving at the next one.
  if (!previous || next.status !== "unlocked") redirect(`/play/${sessionId}`);

  return (
    <PlayShell>
      <PlayHeader state={state} endEarly={endEarlyAction} />
      <main className="flex flex-col gap-6 px-5 pt-5">
        <PreviousResult stop={previous} />

        <div className="flex flex-col items-center gap-3 pt-2 text-center">
          <span className="inline-flex size-20 items-center justify-center rounded-full bg-amber/15 text-amber">
            <UnlockIcon className="size-10" />
          </span>
          <p className="text-sm font-semibold text-amber">
            Stop {next.position} of {state.session.totalStops} unlocked
          </p>
          <h1 className="text-4xl leading-none font-bold tracking-tight">Destination unlocked</h1>
        </div>

        <MapView
          center={{ lat: next.lat, lng: next.lng }}
          markers={markersFromState(state)}
          label={mapLabel(state)}
          fullscreenAction={<EmergencyButton state={state} endEarly={endEarlyAction} />}
        />

        <section className="flex flex-col gap-2 rounded-card border border-line bg-surface p-5">
          <h2 className="font-display text-2xl font-bold">{next.title}</h2>
          <p className="flex items-center gap-2 text-sm text-muted">
            <PinIcon className="size-4 shrink-0 text-amber" />
            {next.venueName}
          </p>
          <p className="text-[15px] leading-relaxed text-fg">{next.teaser}</p>
        </section>

        <div className="flex flex-col gap-3">
          <Link href={`/play/${sessionId}`} className={buttonClass.primary}>
            Take me there
          </Link>
          <a
            href={googleMapsDirectionsUrl(next.lat, next.lng)}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass.secondary}
          >
            Open in Google Maps
            <ExternalIcon className="size-4" />
          </a>
        </div>
      </main>
    </PlayShell>
  );
}

export default function UnlockedPage({ params }: PageProps<"/play/[sessionId]/unlocked">) {
  return (
    <Suspense fallback={<div className="mx-auto min-h-dvh max-w-[430px]" aria-busy="true" />}>
      <UnlockedLoader params={params} />
    </Suspense>
  );
}
