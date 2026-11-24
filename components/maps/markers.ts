import type { VisibleState } from "@/features/engine/types";
import type { MapMarker } from "./types";

/** Markers for what the player may see: completed stops plus the current one. Never locked stops. */
export function markersFromState(state: VisibleState): MapMarker[] {
  const completed: MapMarker[] = state.completedStops.map((s) => ({
    id: s.stopId,
    lat: s.lat,
    lng: s.lng,
    kind: "completed",
    position: s.position,
    label: `Stop ${s.position}: ${s.venueName}`,
  }));
  const c = state.current;
  return c
    ? [
        ...completed,
        { id: c.stopId, lat: c.lat, lng: c.lng, kind: "current", position: c.position, label: `Stop ${c.position}: ${c.venueName}` },
      ]
    : completed;
}

export function mapLabel(state: VisibleState): string {
  const c = state.current;
  const done = state.completedStops.length;
  const where = c ? `Stop ${c.position}, ${c.venueName}` : "your completed stops";
  return `Map preview showing ${where}${done && c ? ` and ${done} completed stop${done === 1 ? "" : "s"}` : ""}.`;
}
