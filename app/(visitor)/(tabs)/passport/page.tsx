import type { Metadata } from "next";
import { PlaceholderScreen } from "@/components/ui/PlaceholderScreen";

export const metadata: Metadata = { title: "Passport" };

// MOCK: Passport placeholder (stamps arrive in M7).
export default function PassportPage() {
  return (
    <PlaceholderScreen
      eyebrow="Passport"
      title="Your Porto passport"
      body="Finish an adventure to earn your first stamp."
    />
  );
}
