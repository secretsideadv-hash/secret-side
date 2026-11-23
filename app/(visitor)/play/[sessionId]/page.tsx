import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { NotOnThisPhone } from "@/components/play/NotOnThisPhone";
import { PlayScreen } from "@/components/play/PlayScreen";
import type { PlayActions } from "@/lib/play-types";
import { getPlayState } from "@/server/play";
import {
  checkInAction,
  revealAnswerAction,
  revealHintAction,
  skipStopAction,
  submitAnswerAction,
} from "./actions";

export const metadata: Metadata = { title: "Playing" };

const actions: PlayActions = {
  checkIn: checkInAction,
  revealHint: revealHintAction,
  submitAnswer: submitAnswerAction,
  revealAnswer: revealAnswerAction,
  skip: skipStopAction,
};

async function PlayLoader({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const state = await getPlayState(sessionId);
  if (!state) return <NotOnThisPhone />;
  if (state.session.status === "completed" || !state.current) redirect(`/play/${sessionId}/complete`);

  const c = state.current;
  // Remount when the server state moves on (e.g. after router.refresh()).
  const key = `${c.stopId}:${c.status}:${c.hints.filter((h) => h.text).length}`;
  return <PlayScreen key={key} initialState={state} actions={actions} />;
}

function PlaySkeleton() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col gap-4 px-5 pt-6" aria-busy="true" aria-label="Loading your adventure">
      <div className="h-11 w-full rounded-full bg-surface" />
      <div className="h-1.5 w-full rounded-full bg-surface" />
      <div className="h-64 w-full rounded-card bg-surface" />
    </div>
  );
}

export default function PlayPage({ params }: PageProps<"/play/[sessionId]">) {
  return (
    <Suspense fallback={<PlaySkeleton />}>
      <PlayLoader params={params} />
    </Suspense>
  );
}
