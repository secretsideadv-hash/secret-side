// MOCK: static placeholder map for M1. No tiles, no API key, no network: an
// abstract night-street backdrop with the real stop positions projected on top.
// Replaced by the Mapbox GL 3D map behind <MapView> in M3.
import { ExternalIcon } from "../ui/icons";
import { fitPoints } from "./projection";
import type { MapViewProps } from "./types";

const W = 320;
const H = 180;

export function StaticMap({ markers, label, externalLink, className = "" }: MapViewProps) {
  const ordered = [...markers].sort((a, b) => a.position - b.position);
  const points = fitPoints(ordered, { width: W, height: H, padding: 30 });
  const placed = ordered.map((m, i) => ({ ...m, ...points[i]! }));
  const route = placed.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <div className={`relative overflow-hidden rounded-card border border-line bg-raised ${className}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block aspect-[16/9] w-full" role="img" aria-label={label}>
        {/* abstract streets */}
        <g stroke="#2A3347" strokeWidth="1.2" fill="none" opacity="0.9">
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
        {/* river band (decorative) */}
        <path d="M-10 172 C 80 160, 180 182, 330 166 L330 200 L-10 200 Z" fill="#16233F" opacity="0.8" />

        {/* route between visible stops */}
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
      </svg>

      <span className="absolute top-2.5 left-2.5 rounded-full bg-ground/80 px-2.5 py-1 text-[11px] font-medium text-muted">
        Map preview
      </span>
      {externalLink && (
        <a
          href={externalLink.href}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute right-2.5 bottom-2.5 inline-flex h-touch items-center gap-1.5 rounded-full bg-ground/90 px-4 text-sm font-semibold text-fg backdrop-blur"
        >
          {externalLink.label}
          <ExternalIcon className="size-4" />
        </a>
      )}
    </div>
  );
}
