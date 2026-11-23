// MOCK: placeholder screen used until each tab is built (Discover in M1 step 3, others later).
interface PlaceholderScreenProps {
  eyebrow: string;
  title: string;
  body: string;
}

export function PlaceholderScreen({ eyebrow, title, body }: PlaceholderScreenProps) {
  return (
    <section className="flex flex-col gap-4">
      <p className="w-fit rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted">
        {eyebrow}
      </p>
      <h1 className="text-4xl leading-[1.05] font-bold tracking-tight">{title}</h1>
      <div className="rounded-card border border-line bg-surface p-5 text-muted">{body}</div>
    </section>
  );
}
