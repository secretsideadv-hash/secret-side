"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import type { AnswerInput, VisibleCurrentStop, VisibleState } from "@/features/engine/types";
import { googleMapsDirectionsUrl } from "@/lib/maps";
import type { PlayActionResult, PlayActions, PlayErrorCode } from "@/lib/play-types";
import { MapView } from "../maps/MapView";
import { mapLabel, markersFromState } from "../maps/markers";
import { BulbIcon, CheckCircleIcon, PinIcon } from "../ui/icons";
import { buttonClass } from "../ui/primitives";
import { PlayHeader, PlayShell } from "./PlayChrome";

type Feedback = { tone: "error" | "info"; message: string };
type Confirm = "skip" | "reveal" | null;

const ERROR_MESSAGES: Record<PlayErrorCode, string> = {
  not_found: "This adventure isn't saved on this phone any more.",
  stale: "Things moved on. Here's where you are now.",
  not_allowed: "That isn't available yet.",
  invalid: "That answer couldn't be read. Try again.",
};

export function PlayScreen({ initialState, actions }: { initialState: VisibleState; actions: PlayActions }) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [coolingUntil, setCoolingUntil] = useState<string | null>(initialState.current?.cooldownUntil ?? null);

  // A refresh (e.g. after a "stale" error) brings newer server state: adopt it, so the
  // next action carries the current version. (React's "adjust state on prop change".)
  const [seenInitial, setSeenInitial] = useState(initialState);
  if (initialState !== seenInitial) {
    setSeenInitial(initialState);
    if (initialState.session.version > state.session.version) {
      setState(initialState);
      setCoolingUntil(initialState.current?.cooldownUntil ?? null);
    }
  }

  // Re-enable "Check answer" when the server-side cooldown ends.
  useEffect(() => {
    if (!coolingUntil) return;
    const timer = setTimeout(() => setCoolingUntil(null), Math.max(0, Date.parse(coolingUntil) - Date.now()));
    return () => clearTimeout(timer);
  }, [coolingUntil]);

  const current = state.current;
  if (!current) return null; // the page redirects completed sessions; nothing to play
  const sessionId = state.session.id;
  const version = state.session.version;
  const stopId = current.stopId;

  function perform(call: () => Promise<PlayActionResult>, onOk?: (r: Extract<PlayActionResult, { ok: true }>) => void) {
    setConfirm(null);
    startTransition(async () => {
      const result = await call();
      if (result.ok) {
        setState(result.state);
        onOk?.(result);
        return;
      }
      setFeedback({ tone: "error", message: ERROR_MESSAGES[result.error] });
      if (result.error === "stale" || result.error === "not_allowed") router.refresh();
    });
  }

  function onCheckIn() {
    setFeedback(null);
    perform(() => actions.checkIn(sessionId, version, stopId));
  }

  function onHint() {
    const next = current?.hints.find((h) => h.text === null && h.available);
    if (!next) return;
    setFeedback(null);
    perform(() => actions.revealHint(sessionId, version, stopId, next.level));
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!current?.challenge || coolingUntil) return;
    const answer: AnswerInput | null =
      current.challenge.type === "multiple_choice"
        ? selected
          ? { type: "multiple_choice", optionId: selected }
          : null
        : text.trim()
          ? { type: "text", text }
          : null;
    if (!answer) return;
    setFeedback(null);
    // A correct answer redirects to the Unlocked screen from the server.
    perform(
      () => actions.submitAnswer(sessionId, version, stopId, answer),
      ({ outcome }) => {
        if (outcome?.outcome === "wrong") {
          setFeedback({ tone: "error", message: "Not quite. Try again, or take a hint." });
          if (outcome.cooldownUntil) setCoolingUntil(outcome.cooldownUntil);
        } else if (outcome?.outcome === "cooldown") {
          setCoolingUntil(outcome.cooldownUntil);
        }
      },
    );
  }

  const arrived = current.status === "arrived";

  return (
    <PlayShell
      bottomBar={
        <BottomBar
          current={current}
          pending={pending}
          confirm={confirm}
          coolingDown={coolingUntil !== null}
          canCheck={current.challenge?.type === "multiple_choice" ? selected !== null : text.trim() !== ""}
          onCheckIn={onCheckIn}
          onHint={onHint}
          onAskConfirm={setConfirm}
          onRevealAnswer={() => perform(() => actions.revealAnswer(sessionId, version, stopId))}
          onSkip={() => perform(() => actions.skip(sessionId, version, stopId))}
        />
      }
    >
      <PlayHeader state={state} />

      <main className="flex flex-col gap-4 px-5 pt-5">
        {arrived ? (
          <p className="flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-4 py-2.5 text-sm font-semibold text-success">
            <CheckCircleIcon className="size-5 shrink-0" />
            Checked in at {current.venueName}
          </p>
        ) : (
          <HeadToStop state={state} current={current} />
        )}

        {arrived && current.story && current.challenge && (
          <form id="answer-form" onSubmit={onSubmit} className="flex flex-col gap-4">
            <article className="rounded-card border border-line bg-surface p-5">
              <p className="text-xs font-semibold tracking-[0.12em] text-amber uppercase">
                Stop {current.position} · {current.title}
              </p>
              <p className="mt-3 text-[15px] leading-relaxed text-fg">{current.story}</p>
              <h1 id="question" className="mt-4 font-display text-xl leading-snug font-bold">
                {current.challenge.prompt}
              </h1>
            </article>

            {current.challenge.type === "multiple_choice" ? (
              <fieldset aria-labelledby="question" className="grid grid-cols-2 gap-2.5">
                {current.challenge.options.map((option) => {
                  const isSelected = selected === option.id;
                  return (
                    <label
                      key={option.id}
                      className={`flex min-h-button cursor-pointer items-center rounded-2xl border px-4 py-3 text-sm font-medium transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-amber ${
                        isSelected ? "border-amber bg-amber/10 text-fg" : "border-line bg-surface text-fg"
                      }`}
                    >
                      <input
                        type="radio"
                        name="answer"
                        value={option.id}
                        checked={isSelected}
                        onChange={() => {
                          setSelected(option.id);
                          setFeedback(null);
                        }}
                        className="sr-only"
                      />
                      {option.label}
                    </label>
                  );
                })}
              </fieldset>
            ) : (
              <div className="flex flex-col gap-2">
                <label htmlFor="text-answer" className="sr-only">
                  Your answer
                </label>
                <input
                  id="text-answer"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="go"
                  maxLength={100}
                  value={text}
                  placeholder={current.challenge.placeholder ?? "Your answer"}
                  onChange={(e) => {
                    setText(e.target.value);
                    setFeedback(null);
                  }}
                  className="h-button rounded-2xl border border-line bg-surface px-4 text-base text-fg placeholder:text-muted focus:border-amber focus:outline-none"
                />
              </div>
            )}

            <RevealedHints current={current} />
          </form>
        )}

        <div aria-live="polite" className="min-h-6">
          {coolingUntil ? (
            <p className="text-sm text-error">Lots of tries in a row. Take a breath, then try again.</p>
          ) : feedback ? (
            <p className={`text-sm ${feedback.tone === "error" ? "text-error" : "text-muted"}`}>{feedback.message}</p>
          ) : null}
        </div>
      </main>
    </PlayShell>
  );
}

function HeadToStop({ state, current }: { state: VisibleState; current: VisibleCurrentStop }) {
  return (
    <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5">
      <p className="text-xs font-semibold tracking-[0.12em] text-amber uppercase">
        Stop {current.position} · {current.title}
      </p>
      <h1 className="font-display text-2xl leading-tight font-bold">Head to your next stop</h1>
      <p className="text-[15px] leading-relaxed text-fg">{current.teaser}</p>
      <p className="flex items-center gap-2 text-sm text-muted">
        <PinIcon className="size-4 shrink-0 text-amber" />
        {current.venueName}
      </p>
      <MapView
        center={{ lat: current.lat, lng: current.lng }}
        markers={markersFromState(state)}
        pitch={60}
        label={mapLabel(state)}
        externalLink={{ href: googleMapsDirectionsUrl(current.lat, current.lng), label: "Open in Google Maps" }}
      />
      {/* MOCK: manual check-in only until GPS check-in (M3). */}
      <p className="text-xs text-muted">When you get there, tap &ldquo;I&apos;m here&rdquo; to read the story and the clue.</p>
    </section>
  );
}

function RevealedHints({ current }: { current: VisibleCurrentStop }) {
  const revealed = current.hints.filter((h) => h.text !== null);
  if (revealed.length === 0) return null;
  return (
    <section aria-label="Hints" className="flex flex-col gap-2 rounded-card border border-azulejo/40 bg-azulejo/10 p-4">
      {revealed.map((hint) => (
        <p key={hint.level} className="flex gap-2 text-sm text-fg">
          <BulbIcon className="mt-0.5 size-4 shrink-0 text-azulejo" />
          <span>
            <span className="font-semibold text-azulejo">Hint {hint.level}: </span>
            {hint.text}
          </span>
        </p>
      ))}
    </section>
  );
}

function BottomBar(props: {
  current: VisibleCurrentStop;
  pending: boolean;
  confirm: Confirm;
  coolingDown: boolean;
  canCheck: boolean;
  onCheckIn: () => void;
  onHint: () => void;
  onAskConfirm: (c: Confirm) => void;
  onRevealAnswer: () => void;
  onSkip: () => void;
}) {
  const { current, pending, confirm } = props;

  if (confirm) {
    const isSkip = confirm === "skip";
    return (
      <div className="flex flex-col gap-2" role="group" aria-label={isSkip ? "Confirm skip" : "Confirm reveal"}>
        <p className="text-center text-sm text-fg">
          {isSkip
            ? "Skip this stop? You'll go straight to the next one."
            : "Reveal the answer? You'll move on to the next stop."}
        </p>
        <div className="flex gap-3">
          <button type="button" className={`${buttonClass.secondary} flex-1`} onClick={() => props.onAskConfirm(null)}>
            Keep playing
          </button>
          <button
            type="button"
            disabled={pending}
            className={`${buttonClass.primary} flex-1`}
            onClick={isSkip ? props.onSkip : props.onRevealAnswer}
          >
            {isSkip ? "Skip stop" : "Show answer"}
          </button>
        </div>
      </div>
    );
  }

  const skipLink = (
    <button
      type="button"
      onClick={() => props.onAskConfirm("skip")}
      className="mx-auto flex h-touch items-center px-3 text-sm text-muted underline-offset-4 hover:underline"
    >
      Stuck? Skip this stop
    </button>
  );

  if (current.status !== "arrived") {
    return (
      <div className="flex flex-col gap-1">
        <button type="button" disabled={pending} onClick={props.onCheckIn} className={`${buttonClass.primary} w-full`}>
          {pending ? "Checking in…" : "I'm here"}
        </button>
        {skipLink}
      </div>
    );
  }

  const nextHint = current.hints.find((h) => h.text === null && h.available);
  const hintButton = current.canRevealAnswer ? (
    <button type="button" disabled={pending} onClick={() => props.onAskConfirm("reveal")} className={buttonClass.secondary}>
      Reveal answer
    </button>
  ) : (
    <button
      type="button"
      disabled={pending || !nextHint}
      onClick={props.onHint}
      className={`${buttonClass.secondary} disabled:opacity-50`}
    >
      <BulbIcon className="size-5 text-azulejo" />
      {nextHint?.level === 2 ? "Hint 2" : "Hint"}
    </button>
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-3">
        {hintButton}
        <button
          type="submit"
          form="answer-form"
          disabled={pending || props.coolingDown || !props.canCheck}
          className={`${buttonClass.primary} flex-1 disabled:opacity-50`}
        >
          {pending ? "Checking…" : "Check answer"}
        </button>
      </div>
      {skipLink}
    </div>
  );
}
