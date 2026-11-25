"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RULES } from "@/features/engine/rules";
import type { GpsFix } from "@/features/engine/types";

/**
 * Browser location for GPS check-in (GAME_RULES §5).
 *
 * - Never asks for permission by itself: watching starts only after the player
 *   taps "Use my location", or straight away if they already granted it.
 * - Watches only while `active` (current stop not checked in yet) and the page
 *   is visible; stops on check-in and in the background (battery).
 * - Keeps the most accurate fix from the last 10 s; that is what a check-in sends.
 * - `manualOffered` turns true when there is no usable fix after 20 s.
 */

export type LocationPermission = "unknown" | "prompt" | "granted" | "denied" | "unsupported";

export interface Fix {
  lat: number;
  lng: number;
  accuracyM: number;
  /** Phone clock, ms (Position.timestamp). */
  at: number;
}

const BEST_FIX_WINDOW_MS = 10_000;

const noSubscription = () => () => {};
const onVisibilityChange = (notify: () => void) => {
  document.addEventListener("visibilitychange", notify);
  return () => document.removeEventListener("visibilitychange", notify);
};

export function useLocation(active: boolean) {
  const supported = useSyncExternalStore(noSubscription, () => "geolocation" in navigator, () => true);
  const visible = useSyncExternalStore(onVisibilityChange, () => document.visibilityState === "visible", () => true);
  const [queried, setQueried] = useState<LocationPermission>("unknown");
  const permission: LocationPermission = supported ? queried : "unsupported";
  const [wanted, setWanted] = useState(false); // the player asked for location (or had granted it)
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [waitedLong, setWaitedLong] = useState(false);
  const startedAt = useRef<number | null>(null);

  // What does the browser already know? (No prompt is shown by this query.)
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    let status: PermissionStatus | null = null;
    const apply = (state: PermissionState) => {
      if (cancelled) return;
      setQueried(state);
      if (state === "granted") setWanted(true);
    };
    // Older browsers have no Permissions API: treat as "not asked yet".
    const query = navigator.permissions?.query({ name: "geolocation" }) ?? Promise.reject(new Error("no Permissions API"));
    query
      .then((s) => {
        status = s;
        apply(s.state);
        s.onchange = () => apply(s.state);
      })
      .catch(() => !cancelled && setQueried("prompt"));
    return () => {
      cancelled = true;
      if (status) status.onchange = null;
    };
  }, [supported]);

  const watching = active && wanted && visible && permission !== "denied" && permission !== "unsupported";

  useEffect(() => {
    if (!watching) return;
    startedAt.current ??= Date.now();
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setQueried("granted");
        const fix: Fix = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracyM: Math.max(1, p.coords.accuracy || 1),
          at: p.timestamp,
        };
        setFixes((prev) => [...prev.filter((f) => fix.at - f.at <= BEST_FIX_WINDOW_MS), fix]);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) setQueried("denied");
        // POSITION_UNAVAILABLE / TIMEOUT: keep watching; the 20 s rule offers manual.
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: RULES.gpsManualAfterMs },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [watching]);

  // 20 s without a usable fix → offer manual check-in.
  useEffect(() => {
    if (!watching || waitedLong) return;
    const elapsed = Date.now() - (startedAt.current ?? Date.now());
    const timer = setTimeout(() => setWaitedLong(true), Math.max(0, RULES.gpsManualAfterMs - elapsed));
    return () => clearTimeout(timer);
  }, [watching, waitedLong]);

  const latest = fixes.at(-1) ?? null;
  const best = fixes.length ? fixes.reduce((a, b) => (b.accuracyM < a.accuracyM ? b : a)) : null;
  const usable = latest !== null && latest.accuracyM <= RULES.gpsMaxAccuracyM;

  /** The fix to send with a check-in: the most accurate of the last 10 s, aged on the phone's clock. */
  const fixToSend = useCallback((): GpsFix | null => {
    if (!best) return null;
    return { lat: best.lat, lng: best.lng, accuracyM: best.accuracyM, ageMs: Math.max(0, Date.now() - best.at) };
  }, [best]);

  return {
    permission,
    /** Start watching; the browser shows its permission prompt if needed. */
    request: () => setWanted(true),
    watching,
    latest,
    usable,
    /** No usable fix after 20 s (or the GPS stays worse than 100 m). */
    manualOffered: waitedLong && !usable,
    fixToSend,
  };
}
