import { Suspense } from "react";
import { BottomNav, BottomNavLinks, BottomNavShell } from "@/components/ui/BottomNav";

/** App shell for the tabbed visitor screens: phone-width column + bottom navigation. */
export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-ground min-[431px]:border-x min-[431px]:border-line">
      <main className="flex-1 px-5 pt-[max(env(safe-area-inset-top),1.5rem)] pb-[calc(var(--spacing-nav)+env(safe-area-inset-bottom)+1.5rem)]">
        {children}
      </main>
      <BottomNavShell>
        <Suspense fallback={<BottomNavLinks pathname={null} />}>
          <BottomNav />
        </Suspense>
      </BottomNavShell>
    </div>
  );
}
