import { StaticMap } from "./StaticMap";
import type { MapViewProps } from "./types";

/**
 * The only map component screens use. The provider lives behind it.
 * MOCK: renders the static placeholder in M1; M3 swaps in MapLibre GL JS
 * (client-only, lazy-loaded) using the same props.
 */
export function MapView(props: MapViewProps) {
  return <StaticMap {...props} />;
}
