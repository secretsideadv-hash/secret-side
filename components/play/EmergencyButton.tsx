"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { VisibleState } from "@/features/engine/types";
import { googleMapsDirectionsUrl } from "@/lib/maps";
import type { PlayActions } from "@/lib/play-types";
import { MapView } from "../maps/MapView";
import { markersFromState } from "../maps/markers";
import { CloseIcon, ExternalIcon, LifebuoyIcon, PhoneIcon } from "../ui/icons";
import { buttonClass } from "../ui/primitives";

/**
 * GAME_RULES §11: the Emergency view. The button sits in the play header on every
 * active screen and is never disabled. Everything in the view comes from what the
 * screen already has, so it works offline; only "show all remaining stops" needs
 * the server, and that ends the adventure first.
 */
export function EmergencyButton({ state, endEarly }: { state: VisibleState; endEarly: PlayActions["endEarly"] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label="Emergency (SOS)"
        onClick={() => setOpen(true)}
        className="inline-flex h-touch shrink-0 items-center justify-center gap-1 rounded-full border border-error/40 bg-error/10 px-3 font-display text-sm font-bold text-error transition active:scale-95"
      >
        <LifebuoyIcon className="size-5" />
        SOS
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="emergency-title"
        // React passes a nested dialog's close event up (the full-screen map inside this view): ignore it.
        onClose={(e) => e.target === e.currentTarget && setOpen(false)}
        className="fixed inset-0 m-0 size-full max-h-none max-w-none overflow-y-auto border-0 bg-ground p-0 text-fg backdrop:bg-ground"
      >
        {open && <EmergencyView state={state} endEarly={endEarly} onClose={() => setOpen(false)} />}
      </dialog>
    </>
  );
}

type Position = { lat: number; lng: number; accuracyM: number };
type PositionState =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "found"; position: Position }
  | { kind: "off" }
  | { kind: "unavailable" };

const noSubscription = () => () => {};

/** One-shot position: automatic if location is already allowed, otherwise one tap. Never stored or sent. */
function usePosition() {
  const supported = useSyncExternalStore(noSubscription, () => "geolocation" in navigator, () => true);
  const [state, setState] = useState<PositionState>({ kind: "idle" });

  const locate = () => {
    setState({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      (p) =>
        setState({
          kind: "found",
          position: { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.max(1, Math.ceil(p.coords.accuracy)) },
        }),
      (error) => setState({ kind: error.code === error.PERMISSION_DENIED ? "off" : "unavailable" }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  };

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((s) => {
        if (cancelled) return;
        if (s.state === "granted") locate();
        else if (s.state === "denied") setState({ kind: "off" });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [supported]);

  return { state: supported ? state : ({ kind: "unavailable" } as const), locate };
}

function EmergencyView({
  state,
  endEarly,
  onClose,
}: {
  state: VisibleState;
  endEarly: PlayActions["endEarly"];
  onClose: () => void;
}) {
  const router = useRouter();
  const { state: where, locate } = usePosition();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reached = [
    ...state.completedStops.map((s) => ({ position: s.position, title: s.title, venueName: s.venueName, lat: s.lat, lng: s.lng })),
    ...(state.current ? [state.current] : []),
  ].sort((a, b) => a.position - b.position);
  const start = reached.find((s) => s.position === 1);
  const remaining = state.session.totalStops - reached.length;
  const player = where.kind === "found" ? where.position : null;

  function endAndReveal() {
    setMessage(null);
    if (!navigator.onLine) {
      setMessage("You need a connection to show the remaining stops. Everything else here works offline.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await endEarly(state.session.id, state.session.version);
        // On success the server redirects to the finale; we only get here on an error.
        if (!result.ok) {
          setMessage(
            result.error === "stale"
              ? "Your adventure changed on another screen. Close this, then try again."
              : "That didn't work. Check your connection and try again.",
          );
          router.refresh();
        }
      } catch {
        setMessage("That didn't work. Check your connection and try again.");
      }
    });
  }

  return (
    <div className="mx-auto flex min-h-full max-w-[430px] flex-col gap-6 px-5 pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
      <div className="flex items-center justify-between gap-3">
        <h2 id="emergency-title" className="flex items-center gap-2 font-display text-2xl font-bold">
          <LifebuoyIcon className="size-6 text-error" />
          Emergency
        </h2>
        <button type="button" onClick={onClose} aria-label="Close emergency view" className={`${buttonClass.icon} bg-surface`}>
          <CloseIcon className="size-5" />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <a
          href="tel:112"
          autoFocus
          className="inline-flex h-16 items-center justify-center gap-3 rounded-full bg-error font-display text-xl font-bold text-ground transition active:scale-[0.98]"
        >
          <PhoneIcon className="size-6" />
          Call 112
        </a>
        <p className="text-center text-sm text-muted">Free EU emergency number for police, ambulance and fire.</p>
      </div>

      <section aria-labelledby="emergency-position" className="flex flex-col gap-3">
        <h3 id="emergency-position" className="text-lg font-semibold">
          Where you are
        </h3>
        <PositionLine state={where} onLocate={locate} />
        <MapView
          center={player ?? start ?? reached[0] ?? { lat: 41.1456, lng: -8.6112 }}
          markers={markersFromState(state)}
          player={player}
          label={`Map of where you are and the stops you've reached${player ? ", with your position" : ""}.`}
        />
      </section>

      <section aria-labelledby="emergency-reached" className="flex flex-col gap-2">
        <h3 id="emergency-reached" className="text-lg font-semibold">
          Stops you&apos;ve reached
        </h3>
        <ol className="flex flex-col gap-2">
          {reached.map((s) => (
            <li key={s.position} className="rounded-2xl border border-line bg-surface px-4 py-3">
              <span className="block font-medium">
                {s.position}. {s.title}
              </span>
              <span className="block text-sm text-muted">{s.venueName}</span>
            </li>
          ))}
        </ol>
      </section>

      {start && (
        <section aria-labelledby="emergency-start" className="flex flex-col gap-2">
          <h3 id="emergency-start" className="text-lg font-semibold">
            Back to the start
          </h3>
          <p className="text-sm text-muted">
            Stop 1, {start.venueName}: where the adventure began.
          </p>
          <a
            href={googleMapsDirectionsUrl(start.lat, start.lng)}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass.secondary}
          >
            Walking directions to the start
            <ExternalIcon className="size-4" />
          </a>
        </section>
      )}

      {remaining > 0 && (
        <section aria-labelledby="emergency-remaining" className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
          <h3 id="emergency-remaining" className="font-semibold">
            Need to see the rest of the route?
          </h3>
          {confirming ? (
            <>
              <p className="text-sm text-fg">
                This <strong>ends your adventure</strong>. You&apos;ll see where all {remaining} remaining{" "}
                {remaining === 1 ? "stop is" : "stops are"}, keep your score so far, and can&apos;t continue playing. It
                can&apos;t be undone.
              </p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setConfirming(false)} className={`${buttonClass.secondary} flex-1`}>
                  Keep playing
                </button>
                <button type="button" disabled={pending} onClick={endAndReveal} className={`${buttonClass.primary} flex-1`}>
                  {pending ? "Ending…" : "End and show stops"}
                </button>
              </div>
            </>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className={buttonClass.secondary}>
              Show all remaining stops
            </button>
          )}
          <div aria-live="polite">{message && <p className="text-sm text-error">{message}</p>}</div>
        </section>
      )}
    </div>
  );
}

function PositionLine({ state, onLocate }: { state: PositionState; onLocate: () => void }) {
  switch (state.kind) {
    case "found": {
      const { lat, lng, accuracyM } = state.position;
      return (
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="font-display text-lg font-semibold tabular-nums">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </p>
          <p className="text-sm text-muted">
            Accurate to about {accuracyM} m. If you call for help, you can read these numbers out.
          </p>
        </div>
      );
    }
    case "locating":
      return <p className="text-sm text-fg">Finding your position…</p>;
    case "off":
      return (
        <p className="text-sm text-muted">
          Location is off for this site, so your position can&apos;t be shown. The stops you&apos;ve reached are below.
        </p>
      );
    case "unavailable":
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">Your position isn&apos;t available right now.</p>
          <button type="button" onClick={onLocate} className={buttonClass.secondary}>
            Try again
          </button>
        </div>
      );
    default:
      return (
        <button type="button" onClick={onLocate} className={buttonClass.secondary}>
          Show my position
        </button>
      );
  }
}
