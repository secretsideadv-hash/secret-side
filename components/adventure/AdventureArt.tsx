// MOCK: placeholder illustration (night river, rooftops, tower, route pins) until real art exists.
export function AdventureArt({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 240"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="art-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1B2340" />
          <stop offset="0.65" stopColor="#2A2340" />
          <stop offset="1" stopColor="#3A2A3A" />
        </linearGradient>
        <linearGradient id="art-river" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141B2E" />
          <stop offset="1" stopColor="#0E1320" />
        </linearGradient>
        <radialGradient id="art-glow" cx="0.72" cy="0.62" r="0.5">
          <stop offset="0" stopColor="#F2A93B" stopOpacity="0.45" />
          <stop offset="1" stopColor="#F2A93B" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="400" height="240" fill="url(#art-sky)" />
      <rect width="400" height="240" fill="url(#art-glow)" />

      {/* moon + stars */}
      <circle cx="176" cy="44" r="14" fill="#F3EEE4" opacity="0.9" />
      <circle cx="182" cy="40" r="12" fill="#1B2340" />
      {[
        [130, 30],
        [190, 52],
        [250, 24],
        [330, 40],
        [365, 70],
        [30, 90],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="#F3EEE4" opacity="0.7" />
      ))}

      {/* tower */}
      <path d="M286 70 l6 -18 l6 18 v8 h4 v80 h-20 v-80 h4 Z" fill="#0F1526" />
      <rect x="289" y="96" width="6" height="9" rx="3" fill="#F2A93B" opacity="0.8" />

      {/* rooftops, back to front */}
      <path
        d="M0 150 L20 138 L40 150 V128 L62 116 L84 128 V146 L104 134 L126 146 V122 L150 108 L174 122 V150 L196 140 L220 150 V130 L240 120 L262 130 V158 H310 V136 L332 124 L354 136 V150 L378 138 L400 150 V176 H0 Z"
        fill="#151C30"
      />
      <path
        d="M0 168 L24 156 L48 168 V152 L74 140 L100 152 V170 L130 158 L160 170 V150 L186 138 L212 150 V172 L240 160 L268 172 V154 L294 142 L320 154 V170 L348 158 L376 170 L400 162 V190 H0 Z"
        fill="#10172A"
      />
      {/* lit windows */}
      {[
        [58, 160],
        [86, 162],
        [140, 166],
        [196, 158],
        [252, 168],
        [304, 162],
        [360, 172],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="5" height="7" rx="1" fill="#F2A93B" opacity="0.85" />
      ))}

      {/* river with reflections */}
      <rect y="188" width="400" height="52" fill="url(#art-river)" />
      {[
        [40, 200, 40],
        [140, 212, 28],
        [250, 204, 46],
        [320, 222, 30],
        [80, 228, 22],
      ].map(([x, y, w]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height="2" rx="1" fill="#F2A93B" opacity="0.35" />
      ))}

      {/* route */}
      <path
        d="M60 196 C 110 150, 150 182, 196 140 S 270 120, 292 112"
        fill="none"
        stroke="#F2A93B"
        strokeWidth="2.5"
        strokeDasharray="2 7"
        strokeLinecap="round"
      />
      {[
        [60, 196],
        [196, 140],
        [292, 112],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r="7" fill="#F2A93B" opacity="0.25" />
          <circle cx={x} cy={y} r="3.5" fill="#F2A93B" />
        </g>
      ))}
    </svg>
  );
}
