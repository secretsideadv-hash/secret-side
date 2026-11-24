import type { ReactNode } from "react";

/**
 * Full-screen message for 404 and error states, in the app's style.
 * No hooks or server APIs, so error boundaries (client components) can use it too.
 */
export function StatusScreen({
  icon,
  eyebrow,
  title,
  body,
  children,
  footnote,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  body: string;
  children: ReactNode;
  footnote?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col justify-center gap-8 bg-ground px-5 pt-[max(env(safe-area-inset-top),1.5rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)] min-[431px]:border-x min-[431px]:border-line">
      <div className="flex flex-col gap-4">
        <span className="inline-flex size-16 items-center justify-center rounded-full bg-amber/15 text-amber">
          {icon}
        </span>
        <p className="text-xs font-semibold tracking-[0.12em] text-amber uppercase">{eyebrow}</p>
        <h1 className="text-4xl leading-[1.05] font-bold tracking-tight">{title}</h1>
        <p className="text-[15px] leading-relaxed text-muted">{body}</p>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
      {footnote && <p className="text-xs text-muted">{footnote}</p>}
    </main>
  );
}
