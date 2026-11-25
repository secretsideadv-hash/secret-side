import type { ReactNode } from "react";

/**
 * Provider-agnostic map props, named after MapLibre GL JS camera options.
 * Never pass locked stops: markers come from VisibleState only (markersFromState).
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapMarker extends LatLng {
  id: string;
  kind: "current" | "completed";
  /** Stop number shown on the pin. */
  position: number;
  /** Accessible name, e.g. "Stop 2: [Stop 2 venue]". */
  label: string;
}

/** The player's own position from the browser (GPS check-in), drawn as a blue dot with an accuracy ring. */
export interface PlayerPosition extends LatLng {
  accuracyM: number;
}

export interface MapViewProps {
  /** Camera target, normally the current stop. */
  center: LatLng;
  markers: MapMarker[];
  /** Where the player is, if they shared their location. Never stored or sent anywhere by the map. */
  player?: PlayerPosition | null;
  /** Map zoom level. The static map fits all markers instead. */
  zoom?: number;
  /** Camera tilt in degrees for the 3D view (0 in 2D). */
  pitch?: number;
  /** Camera rotation in degrees. */
  bearing?: number;
  /** Pan/zoom gestures (two fingers, so the page still scrolls). The static map is never interactive. */
  interactive?: boolean;
  /** Text alternative describing what the map shows. */
  label: string;
  /** Optional overlay link, e.g. walking directions in Google Maps. */
  externalLink?: { href: string; label: string };
  /**
   * Shown in the full-screen map's top bar. Active play screens pass the SOS button,
   * so the Emergency view stays one tap away (GAME_RULES §11).
   */
  fullscreenAction?: ReactNode;
  className?: string;
}
