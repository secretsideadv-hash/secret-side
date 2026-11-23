import type { ReactNode } from "react";

/** Shared class strings so buttons and links look identical. */
export const buttonClass = {
  primary:
    "inline-flex h-button min-w-touch items-center justify-center gap-2 rounded-full bg-amber px-6 font-display text-base font-semibold text-on-amber transition active:scale-[0.98] disabled:opacity-60",
  secondary:
    "inline-flex h-button min-w-touch items-center justify-center gap-2 rounded-full border border-line bg-surface px-6 font-display text-base font-semibold text-fg transition active:scale-[0.98]",
  icon: "inline-flex size-touch items-center justify-center rounded-full bg-ground/70 text-fg backdrop-blur transition active:scale-95",
} as const;

export function Pill({
  children,
  tone = "default",
  icon,
}: {
  children: ReactNode;
  tone?: "default" | "amber";
  icon?: ReactNode;
}) {
  const tones = {
    default: "border-line bg-surface text-fg",
    amber: "border-amber/40 bg-amber/10 text-amber",
  };
  return (
    <span
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${tones[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold tracking-[0.12em] text-amber uppercase">{children}</p>
  );
}

/** N segments: completed = amber, current = amber outline, rest = line. */
export function ProgressSegments({
  total,
  completed,
  label,
}: {
  total: number;
  completed: number;
  label: string;
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={completed}
      className="flex gap-1.5"
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 flex-1 rounded-full ${
            i < completed ? "bg-amber" : i === completed ? "bg-amber/35" : "bg-line"
          }`}
        />
      ))}
    </div>
  );
}
