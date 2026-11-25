"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ExternalIcon } from "../ui/icons";
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
 */

type Phase = "static" | "loading" | "live" | "fallback";

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
  className = "",
}: MapViewProps) {
  const frame = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const live = useRef<LiveMap | null>(null);
  const [phase, setPhase] = useState<Phase>("static");
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
        if (cancelled || !canvasHost.current) return;
        live.current = createLiveMap(canvasHost.current, latest.current, {
          onReady: () => !cancelled && setPhase("live"),
          onFail: () => {
            live.current?.destroy();
            live.current = null;
            if (!cancelled) setPhase("fallback");
          },
        });
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

  const isLive = phase === "live";

  return (
    <div
      ref={frame}
      data-map-state={phase}
      className={`relative aspect-[4/3] overflow-hidden rounded-card border border-line bg-raised ${className}`}
    >
      <StaticMap markers={markers} player={player} label={label} hidden={isLive} />

      <div
        aria-hidden={!isLive || undefined}
        aria-label={isLive ? label : undefined}
        role={isLive ? "region" : undefined}
        className={`absolute inset-0 transition-opacity duration-500 ${isLive ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        {/* MapLibre owns this element and adds its own classes: React must never re-render its className. */}
        <div ref={canvasHost} className="size-full" />
      </div>

      {phase === "fallback" && (
        <span className="absolute top-2.5 left-2.5 rounded-full bg-ground/85 px-2.5 py-1 text-[11px] font-medium text-muted">
          Simplified map
        </span>
      )}

      {isLive && (
        <div className="absolute top-2.5 left-2.5 flex rounded-full bg-ground/85 p-0.5 backdrop-blur" role="group" aria-label="Map view">
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

      {externalLink && (
        <a
          href={externalLink.href}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute right-2.5 bottom-11 inline-flex h-touch items-center gap-1.5 rounded-full bg-ground/90 px-4 text-sm font-semibold text-fg backdrop-blur"
        >
          {externalLink.label}
          <ExternalIcon className="size-4" />
        </a>
      )}
    </div>
  );
}
