// The map without WebGL or network: an abstract night-street backdrop with the
// real positions of the visible stops (and the player) projected on top.
// Shown first while the live map loads, and as the fallback when it can't.
import { fitPoints } from "./projection";
import type { MapMarker, PlayerPosition } from "./types";

const W = 320;
const H = 240; // 4:3, the MapView frame

export function StaticMap({
  markers,
  player,
  label,
  hidden = false,
}: {
  markers: MapMarker[];
  player?: PlayerPosition | null;
  label: string;
  hidden?: boolean;
}) {
  const ordered = [...markers].sort((a, b) => a.position - b.position);
  const points = fitPoints(player ? [...ordered, player] : ordered, { width: W, height: H, padding: 34 });
  const placed = ordered.map((m, i) => ({ ...m, ...points[i]! }));
  const you = player ? points[ordered.length]! : null;
  const route = placed.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="absolute inset-0 block size-full"
      role={hidden ? undefined : "img"}
      aria-label={hidden ? undefined : label}
      aria-hidden={hidden || undefined}
    >
      {/* abstract streets and river (decorative), drawn for 320×180 and stretched to 4:3 */}
      <g transform={`scale(1 ${H / 180})`}>
        <g stroke="#2A3347" strokeWidth="1.2" fill="none" opacity="0.9" vectorEffect="non-scaling-stroke">
          <path d="M-10 40 L120 58 L330 30" />
          <path d="M-10 96 L90 86 L190 104 L330 92" />
          <path d="M40 -10 L58 80 L44 190" />
          <path d="M150 -10 L140 70 L160 190" />
          <path d="M250 -10 L262 90 L240 190" />
          <path d="M-10 140 L110 128 L330 150" />
        </g>
        <g stroke="#1E2638" strokeWidth="5" fill="none" strokeLinecap="round">
          <path d="M70 20 L200 130" />
          <path d="M300 10 L210 170" />
        </g>
        <path d="M-10 172 C 80 160, 180 182, 330 166 L330 200 L-10 200 Z" fill="#16233F" opacity="0.8" />
      </g>

      {placed.length > 1 && (
        <polyline
          points={route}
          fill="none"
          stroke="#F2A93B"
          strokeWidth="2"
          strokeDasharray="2 6"
          strokeLinecap="round"
          opacity="0.8"
        />
      )}

      {placed.map((m) =>
        m.kind === "current" ? (
          <g key={m.id} transform={`translate(${m.x.toFixed(1)} ${m.y.toFixed(1)})`}>
            <circle r="16" fill="#F2A93B" opacity="0.18" />
            <path d="M0 0 C -9 -10, -9 -22, 0 -24 C 9 -22, 9 -10, 0 0 Z" fill="#F2A93B" />
            <text y="-12" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0E1320">
              {m.position}
            </text>
          </g>
        ) : (
          <g key={m.id} transform={`translate(${m.x.toFixed(1)} ${m.y.toFixed(1)})`}>
            <circle r="8" fill="#171E2E" stroke="#8FE0B8" strokeWidth="1.5" />
            <text y="3.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#8FE0B8">
              {m.position}
            </text>
          </g>
        ),
      )}

      {you && (
        <g transform={`translate(${you.x.toFixed(1)} ${you.y.toFixed(1)})`}>
          <circle r="14" fill="#5B8DEF" opacity="0.18" />
          <circle r="6" fill="#5B8DEF" stroke="#F3EEE4" strokeWidth="2" />
        </g>
      )}
    </svg>
  );
}
