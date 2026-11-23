import type { Metadata } from "next";
import { PlaceholderScreen } from "@/components/ui/PlaceholderScreen";

export const metadata: Metadata = { title: "Explore" };

// MOCK: Explore placeholder.
export default function ExplorePage() {
  return (
    <PlaceholderScreen
      eyebrow="Explore"
      title="Explore Porto"
      body="A map of adventures across the historic centre is coming soon."
    />
  );
}
