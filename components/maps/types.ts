/**
 * Provider-agnostic map props. Named after MapLibre GL JS camera options so the
 * M3 implementation (3D buildings, pitched camera) is a drop-in swap behind
 * <MapView>. Never pass locked stops: markers come from VisibleState only.
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

export interface MapViewProps {
  /** Camera target, normally the current stop. */
  center: LatLng;
  markers: MapMarker[];
  /** Map zoom level (M3). The static map fits all markers instead. */
  zoom?: number;
  /** Camera tilt in degrees for the 3D view (M3). */
  pitch?: number;
  /** Camera rotation in degrees (M3). */
  bearing?: number;
  /** Pan/zoom gestures (M3). The static map is never interactive. */
  interactive?: boolean;
  /** Text alternative describing what the map shows. */
  label: string;
  /** Optional overlay link, e.g. walking directions in Google Maps. */
  externalLink?: { href: string; label: string };
  className?: string;
}
