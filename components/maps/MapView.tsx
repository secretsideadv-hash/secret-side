"use client";

import { type RefObject, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { distanceMeters } from "@/features/engine/geo";
import { formatDistance } from "@/lib/format";
import { CloseIcon, ExpandIcon, ExternalIcon, LocateIcon } from "../ui/icons";
import { buttonClass } from "../ui/primitives";
import type { LiveMap, MapMode } from "./live-map";
import { StaticMap } from "./StaticMap";
import type { MapViewProps } from "./types";

/**
 * The only map component screens use (provider behind it: MapLibre GL +
 * OpenFreeMap tiles, see live-map.ts).
 *
 * 1. Renders the static map at once (no network, no WebGL).
 * 2. When the map scrolls into view and WebGL works, loads MapLibre lazily and
 *    fades the live 3D map in over it.
 * 3. Falls back to the static map for good if the live map errors before its
 *    first render, takes longer than 8 s, or loses its WebGL context.
 *
 * Markers come from VisibleState (markersFromState), so locked stops are never
 * drawn. The player's position stays in the browser.
 *
 * "Expand map" opens the same map full screen in a modal <dialog> (focus stays
 * inside, Escape closes, the page behind is inert). The live map's container is a
 * node React never renders, so it moves between the card and the dialog without
 * reloading; the static map is simply drawn again. `fullscreenAction` (the SOS
 * button on play screens) sits in the full-screen top bar.
 */

type Phase = "static" | "loading" | "live" | "fallback";

/** Further than this from the stop, the player isn't in the play area yet: show the distance, don't zoom. */
const PLAY_AREA_RADIUS_M = 5_000;

const MODE_KEY = "ss_map_mode";
const MODE_EVENT = "ss-map-mode";

function readMode(): MapMode {
  try {
    return localStorage.getItem(MODE_KEY) === "2d" ? "2d" : "3d";
  } catch {
    return "3d";
  }
}

function subscribeMode(notify: () => void) {
  window.addEventListener(MODE_EVENT, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(MODE_EVENT, notify);
    window.removeEventListener("storage", notify);
  };
}

function saveMode(mode: MapMode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
  window.dispatchEvent(new Event(MODE_EVENT));
}

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function MapView({
  center,
  markers,
  player = null,
  zoom = 16,
  pitch = 60,
  bearing = -17,
  interactive = true,
  label,
  externalLink,
  fullscreenAction,
  className = "",
}: MapViewProps) {
  const frame = useRef<HTMLDivElement>(null);
  const cardSlot = useRef<HTMLDivElement>(null);
  const fullSlot = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  /** MapLibre's container: created here, never rendered by React, moved between the card and full screen. */
  const canvasNode = useRef<HTMLDivElement | null>(null);
  const live = useRef<LiveMap | null>(null);
  const expandedNow = useRef(false);
  const wasExpanded = useRef(false);
  const [phase, setPhase] = useState<Phase>("static");
  const [playerInView, setPlayerInView] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState(false);
  const playerDistance = player ? distanceMeters(center, player) : null;
  const playerFar = playerDistance !== null && playerDistance > PLAY_AREA_RADIUS_M;
  const mode = useSyncExternalStore(subscribeMode, readMode, () => "3d" as MapMode);

  // Latest values for the async start (the effect below runs once).
  const latest = useRef({ center, markers, player, zoom, pitch, bearing, interactive, mode });
  useEffect(() => {
    latest.current = { center, markers, player, zoom, pitch, bearing, interactive, mode };
  });

  // Start the live map once it scrolls into view.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    let cancelled = false;

    const start = async () => {
      if (!webglAvailable()) return setPhase("fallback");
      setPhase("loading");
      try {
        const { createLiveMap } = await import("./live-map");
        if (cancelled) return;
        const node = document.createElement("div");
        node.className = "size-full";
        canvasNode.current = node;
        placeCanvas(canvasNode, live, expandedNow, cardSlot, fullSlot);
        live.current = createLiveMap(node, latest.current, {
          onReady: () => !cancelled && setPhase("live"),
          onPlayerInView: (inView) => !cancelled && setPlayerInView(inView),
          onFail: () => {
            live.current?.destroy();
            live.current = null;
            if (!cancelled) setPhase("fallback");
          },
        });
        placeCanvas(canvasNode, live, expandedNow, cardSlot, fullSlot); // gestures for where it is now
      } catch {
        if (!cancelled) setPhase("fallback"); // the map code itself failed to load
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          void start();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
      live.current?.destroy();
      live.current = null;
      canvasNode.current?.remove();
      canvasNode.current = null;
    };
  }, []);

  // Keep markers and the player's dot current (cheap: compares a key, not objects).
  const dataKey = JSON.stringify([markers, player]);
  useEffect(() => {
    live.current?.update(latest.current.markers, latest.current.player);
  }, [dataKey, phase]);

  useEffect(() => {
    live.current?.setMode(mode);
  }, [mode, phase]);

  const openFullscreen = () => {
    expandedNow.current = true;
    setExpanded(true);
  };
  // Move the map back before the full-screen layer unmounts, so its canvas is never detached.
  const closeFullscreen = () => {
    if (!expandedNow.current) return;
    expandedNow.current = false;
    placeCanvas(canvasNode, live, expandedNow, cardSlot, fullSlot);
    setExpanded(false);
  };

  useLayoutEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (expanded) {
      if (!d.open) d.showModal();
      placeCanvas(canvasNode, live, expandedNow, cardSlot, fullSlot);
    } else if (wasExpanded.current) {
      if (d.open) d.close();
      expandButton.current?.focus();
    }
    wasExpanded.current = expanded;
  }, [expanded]);

  const isLive = phase === "live";

  /** Everything drawn on a map surface; `full` adds the top bar and keeps clear of the safe areas. */
  const layer = (full: boolean) => (
    <>
      {/* Far away, the player's dot would shrink the stops to nothing: leave it out and show the distance. */}
      <StaticMap markers={markers} player={playerFar ? null : player} label={label} hidden={isLive} />

      <div
        aria-hidden={!isLive || undefined}
        aria-label={isLive ? label : undefined}
        role={isLive ? "region" : undefined}
        className={`absolute inset-0 transition-opacity duration-500 ${isLive ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        {/* placeCanvas() appends the live map's container here; React renders no children in this slot. */}
        <div ref={full ? fullSlot : cardSlot} className="size-full" />
      </div>

      {full && (
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 pt-[max(env(safe-area-inset-top),0.75rem)] pr-[max(env(safe-area-inset-right),0.75rem)] pl-[max(env(safe-area-inset-left),0.75rem)]">
          <button
            type="button"
            autoFocus
            onClick={closeFullscreen}
            aria-label="Close full-screen map"
            className={`${buttonClass.icon} bg-ground/85`}
          >
            <CloseIcon className="size-5" />
          </button>
          {/* A solid backing, so a translucent action (the SOS button) stays readable over the map. */}
          {fullscreenAction && <div className="rounded-full bg-ground">{fullscreenAction}</div>}
        </div>
      )}

      <div
        className={`absolute flex flex-col items-start gap-2 ${
          full
            ? "top-[calc(max(env(safe-area-inset-top),0.75rem)+3.5rem)] left-[max(env(safe-area-inset-left),0.75rem)]"
            : "top-2.5 left-2.5"
        }`}
      >
        {phase === "fallback" && (
          <span className="rounded-full bg-ground/85 px-2.5 py-1 text-[11px] font-medium text-muted">Simplified map</span>
        )}

        {isLive && (
          <div className="flex rounded-full bg-ground/85 p-0.5 backdrop-blur" role="group" aria-label="Map view">
            {(["2d", "3d"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => saveMode(m)}
                className={`inline-flex size-touch items-center justify-center rounded-full font-display text-sm font-semibold transition ${
                  mode === m ? "bg-amber text-on-amber" : "text-fg"
                }`}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        {playerFar && playerDistance !== null ? (
          <p role="status" className="rounded-full bg-ground/90 px-3 py-1.5 text-xs font-medium text-fg backdrop-blur">
            You&apos;re {formatDistance(playerDistance)} away
          </p>
        ) : (
          isLive &&
          player &&
          playerInView === false && (
            <button
              type="button"
              onClick={() => live.current?.showPlayer()}
              className="inline-flex h-touch items-center gap-1.5 rounded-full bg-ground/90 px-4 text-sm font-semibold text-fg backdrop-blur"
            >
              <LocateIcon className="size-4 text-azulejo" />
              Show me
            </button>
          )
        )}
      </div>

      {!full && (
        <button
          ref={expandButton}
          type="button"
          onClick={openFullscreen}
          aria-label="Expand map"
          aria-haspopup="dialog"
          className={`${buttonClass.icon} absolute top-2.5 right-2.5 bg-ground/85`}
        >
          <ExpandIcon className="size-5" />
        </button>
      )}

      {externalLink && (
        <a
          href={externalLink.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`absolute inline-flex h-touch items-center gap-1.5 rounded-full bg-ground/90 px-4 text-sm font-semibold text-fg backdrop-blur ${
            full
              ? "right-[max(env(safe-area-inset-right),0.625rem)] bottom-[calc(env(safe-area-inset-bottom)+2.75rem)]"
              : "right-2.5 bottom-11"
          }`}
        >
          {externalLink.label}
          <ExternalIcon className="size-4" />
        </a>
      )}
    </>
  );

  return (
    <>
      <div
        ref={frame}
        data-map-state={phase}
        className={`relative aspect-[4/3] overflow-hidden rounded-card border border-line bg-raised ${className}`}
      >
        {layer(false)}
      </div>
      <dialog
        ref={dialog}
        aria-label="Full-screen map"
        // React passes a nested dialog's close event up (the Emergency view opened from here): ignore it.
        onClose={(e) => e.target === e.currentTarget && closeFullscreen()}
        className="fixed inset-0 m-0 size-full max-h-none max-w-none overflow-hidden overscroll-none border-0 bg-raised p-0 text-fg backdrop:bg-ground"
      >
        {expanded && (
          <div data-map-fullscreen className="ss-map-full relative size-full">
            {layer(true)}
          </div>
        )}
      </dialog>
    </>
  );
}

/** Put the live map where it's shown now (card or full screen), fit it there and set its gestures. */
function placeCanvas(
  canvasNode: RefObject<HTMLDivElement | null>,
  live: RefObject<LiveMap | null>,
  expanded: RefObject<boolean>,
  cardSlot: RefObject<HTMLDivElement | null>,
  fullSlot: RefObject<HTMLDivElement | null>,
) {
  const node = canvasNode.current;
  const slot = (expanded.current ? fullSlot : cardSlot).current;
  if (node && slot && node.parentElement !== slot) slot.append(node);
  live.current?.resize();
  live.current?.setCooperativeGestures(!expanded.current);
}
