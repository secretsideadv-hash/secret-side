import type { Metadata } from "next";
import { PlaceholderScreen } from "@/components/ui/PlaceholderScreen";

export const metadata: Metadata = { title: "My adventures" };

// MOCK: My adventures placeholder.
export default function MyAdventuresPage() {
  return (
    <PlaceholderScreen
      eyebrow="My adventures"
      title="Your adventures"
      body="Adventures you start will show up here, so you can pick up where you left off."
    />
  );
}
