"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import type { AnswerInput, GpsCheckInOutcome, VisibleCurrentStop, VisibleState } from "@/features/engine/types";
import { googleMapsDirectionsUrl } from "@/lib/maps";
import type { PlayActionResult, PlayActions, PlayErrorCode } from "@/lib/play-types";
import { MapView } from "../maps/MapView";
import { mapLabel, markersFromState } from "../maps/markers";
import { BulbIcon, CheckCircleIcon, PinIcon } from "../ui/icons";
import { buttonClass } from "../ui/primitives";
import { LocationStatus, proximity } from "./LocationStatus";
import { PlayHeader, PlayShell } from "./PlayChrome";
import { useLocation } from "./useLocation";

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
  // §5: the server said "too far" once → offer manual check-in.
  const [tooFarOnce, setTooFarOnce] = useState(false);
  // Watch location only while the current stop still needs a check-in.
  const location = useLocation(state.current?.status === "unlocked");

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

  function onGpsCheckIn() {
    const fix = location.fixToSend();
    if (!fix) return;
    setFeedback(null);
    perform(
      () => actions.gpsCheckIn(sessionId, version, stopId, fix),
      ({ checkIn }) => {
        const message = checkInMessage(checkIn);
        if (message) setFeedback({ tone: "info", message });
        if (checkIn?.outcome === "too_far") setTooFarOnce(true);
      },
    );
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
          checkIn={{
            location,
            inRange: proximity(current, location)?.inRange ?? false,
            manualOffered: location.manualOffered || tooFarOnce,
            onRequestLocation: location.request,
            onGpsCheckIn,
          }}
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
      <PlayHeader state={state} endEarly={actions.endEarly} />

      <main className="flex flex-col gap-4 px-5 pt-5">
        {arrived ? (
          <p className="flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-4 py-2.5 text-sm font-semibold text-success">
            <CheckCircleIcon className="size-5 shrink-0" />
            Checked in at {current.venueName}
          </p>
        ) : (
          <HeadToStop state={state} current={current} location={location} />
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

/** What the server's answer to a GPS check-in means for the player. */
function checkInMessage(result: GpsCheckInOutcome | undefined): string | null {
  switch (result?.outcome) {
    case "too_far":
      return `Your GPS puts you about ${result.distanceM} m from the stop. Keep going, or tap “I'm here” if you're already there.`;
    case "inaccurate":
      return `Your GPS is unsure right now (±${result.accuracyM} m). Try again in the open, or tap “I'm here”.`;
    case "stale_fix":
      return "That location was too old. Wait a moment for a fresh one and try again.";
    default:
      return null;
  }
}

function HeadToStop({
  state,
  current,
  location,
}: {
  state: VisibleState;
  current: VisibleCurrentStop;
  location: ReturnType<typeof useLocation>;
}) {
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
        player={location.latest ? { lat: location.latest.lat, lng: location.latest.lng, accuracyM: location.latest.accuracyM } : null}
        label={mapLabel(state)}
        externalLink={{ href: googleMapsDirectionsUrl(current.lat, current.lng), label: "Open in Google Maps" }}
      />
      <LocationStatus stop={current} location={location} />
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

/**
 * Check-in buttons (GAME_RULES §5). Manual check-in is always called "I'm here".
 * - location off or unsupported: "I'm here" only
 * - not asked yet: "Use my location", with "I'm here" beside it
 * - finding a fix: "Finding you…"; "I'm here" appears after 20 s
 * - a fix: GPS check-in; "I'm here" appears after 20 s without a usable fix or a "too far" answer
 */
function CheckInButtons(props: {
  location: ReturnType<typeof useLocation>;
  inRange: boolean;
  manualOffered: boolean;
  pending: boolean;
  onRequestLocation: () => void;
  onGpsCheckIn: () => void;
  onManualCheckIn: () => void;
}) {
  const { location, pending } = props;
  const manual = (primary: boolean) => (
    <button
      type="button"
      disabled={pending}
      onClick={props.onManualCheckIn}
      className={primary ? `${buttonClass.primary} w-full` : buttonClass.secondary}
    >
      {pending && primary ? "Checking in…" : "I'm here"}
    </button>
  );

  if (location.permission === "denied" || location.permission === "unsupported") return manual(true);

  let primary;
  if (!location.watching) {
    primary = (
      <button type="button" onClick={props.onRequestLocation} className={`${buttonClass.primary} flex-1`}>
        Use my location
      </button>
    );
  } else {
    const ready = location.latest !== null;
    primary = (
      <button
        type="button"
        disabled={pending || !ready}
        onClick={props.onGpsCheckIn}
        className={`${buttonClass.primary} flex-1 disabled:opacity-60`}
      >
        {pending ? "Checking in…" : !ready ? "Finding you…" : props.inRange ? "You're here: check in" : "Check in here"}
      </button>
    );
  }
  const showManual = !location.watching || props.manualOffered;
  return (
    <div className="flex gap-3">
      {showManual && manual(false)}
      {primary}
    </div>
  );
}

function BottomBar(props: {
  current: VisibleCurrentStop;
  checkIn: {
    location: ReturnType<typeof useLocation>;
    inRange: boolean;
    manualOffered: boolean;
    onRequestLocation: () => void;
    onGpsCheckIn: () => void;
  };
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
        <CheckInButtons {...props.checkIn} pending={pending} onManualCheckIn={props.onCheckIn} />
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
