import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/primitives";
import { PlaceholderScreen } from "@/components/ui/PlaceholderScreen";
import { getFeaturedSummary } from "@/server/catalog";

export const metadata: Metadata = { title: "Coming soon" };

// MOCK: target for "I have 2 hours" and the category chips until those features exist.
export default async function ComingSoonPage() {
  const featured = await getFeaturedSummary("porto");
  return (
    <div className="flex flex-col gap-6">
      <PlaceholderScreen
        eyebrow="Coming soon"
        title="More ways to play Porto"
        body="Short routes for when you only have a couple of hours, food quests and hidden gems are on the way."
      />
      {featured && (
        <Link href={`/adventures/${featured.slug}`} className={buttonClass.primary}>
          Play {featured.title}
        </Link>
      )}
    </div>
  );
}
