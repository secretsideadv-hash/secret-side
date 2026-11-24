import type { Metadata } from "next";
import Link from "next/link";
import { StatusScreen } from "@/components/ui/StatusScreen";
import { CompassIcon } from "@/components/ui/icons";
import { buttonClass } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <StatusScreen
      icon={<CompassIcon className="size-8" />}
      eyebrow="404 · Wrong turn"
      title="This street doesn't go anywhere."
      body="The page you're looking for isn't here. The link may be old, or it took a wrong turn somewhere."
    >
      <Link href="/" className={buttonClass.primary}>
        Back to Discover
      </Link>
    </StatusScreen>
  );
}
