"use client";

import { useEffect, useState } from "react";
import { distanceMeters } from "@/features/engine/geo";
import { RULES } from "@/features/engine/rules";
import type { VisibleCurrentStop } from "@/features/engine/types";
import { PinIcon } from "../ui/icons";
import type { useLocation } from "./useLocation";

type Location = ReturnType<typeof useLocation>;

const HINT_SEEN_KEY = "ss_location_hint_seen";

/** Display only: the server decides check-ins with the same rule (GAME_RULES §5). */
export function proximity(stop: VisibleCurrentStop, location: Location) {
  const fix = location.latest;
  if (!fix) return null;
  const distance = distanceMeters(stop, fix);
  const allowance = Math.min(fix.accuracyM, RULES.gpsAccuracyAllowanceCapM);
  return {
    distanceM: Math.round(distance / 10) * 10,
    accuracyM: Math.ceil(fix.accuracyM),
    inRange: fix.accuracyM <= RULES.gpsMaxAccuracyM && distance - allowance <= stop.checkInRadiusM,
  };
}

/** The location line on "Head to your next stop": why we ask, live distance, or the manual path. */
export function LocationStatus({ stop, location }: { stop: VisibleCurrentStop; location: Location }) {
  const { permission, watching, latest, usable, manualOffered } = location;
  const near = proximity(stop, location);

  if (permission === "unsupported") {
    return <Note>This browser can&apos;t share your location. Tap &ldquo;I&apos;m here&rdquo; when you arrive.</Note>;
  }
  if (permission === "denied") return <DeniedNote />;

  if (!watching) {
    return (
      <div className="flex flex-col gap-1 rounded-2xl border border-line bg-ground/40 p-4">
        <p className="flex items-center gap-2 font-semibold text-fg">
          <PinIcon className="size-4 shrink-0 text-amber" />
          Check in with your location
        </p>
        <p className="text-sm text-muted">
          Turn on location to check in when you arrive and see how far you are. We only use it during the adventure and
          never store where you are.
        </p>
      </div>
    );
  }

  if (!latest) {
    return (
      <Status>
        <span className="animate-pulse">Finding you…</span>
        {manualOffered && <span className="block text-muted">No GPS signal yet. You can check in with &ldquo;I&apos;m here&rdquo;.</span>}
      </Status>
    );
  }
  if (!usable) {
    return (
      <Status>
        GPS is unsure here (±{Math.ceil(latest.accuracyM)} m).
        <span className="block text-muted">
          {manualOffered ? "Tap “I'm here” if you've arrived." : "Try stepping into the open for a moment."}
        </span>
      </Status>
    );
  }
  return (
    <Status>
      {near?.inRange ? (
        <span className="font-semibold text-success">You&apos;re here.</span>
      ) : (
        <>About {near?.distanceM} m away</>
      )}
      <span className="text-muted"> · GPS ±{near?.accuracyM} m</span>
    </Status>
  );
}

function Status({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-fg" role="status">
      {children}
    </p>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

/** Location refused: no nagging, the manual path, and how to turn it on (shown once). */
function DeniedNote() {
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(HINT_SEEN_KEY)) return;
      localStorage.setItem(HINT_SEEN_KEY, "1");
      setShowHint(true); // eslint-disable-line react-hooks/set-state-in-effect -- read once from storage after mount
    } catch {
      // Storage unavailable (private mode): just don't show the hint.
    }
  }, []);
  return (
    <Note>
      Location is off for this site, so tap &ldquo;I&apos;m here&rdquo; when you arrive.
      {showHint && (
        <span className="mt-1 block">
          To use it next time, allow location for this site in your browser settings (on iPhone: Settings › Privacy &amp;
          Security › Location Services › Safari Websites).
        </span>
      )}
    </Note>
  );
}
