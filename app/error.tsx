"use client"; // Error boundaries must be Client Components

import Link from "next/link";
import { useEffect } from "react";
import { StatusScreen } from "@/components/ui/StatusScreen";
import { AlertIcon } from "@/components/ui/icons";
import { buttonClass } from "@/components/ui/primitives";

/** Catches errors in any screen below the root layout. Server error details never reach the browser in production. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;

  return (
    <>
      <title>Something went wrong · Secret Side · Porto</title>
      <StatusScreen
        icon={<AlertIcon className="size-8" />}
        eyebrow="Something went wrong"
        title="We lost the trail."
        body="This screen didn't load. Your progress is saved, so you can try again or head back to Discover."
        footnote={digest ? `Reference: ${digest}` : undefined}
      >
        <button type="button" onClick={() => retry()} className={buttonClass.primary}>
          Try again
        </button>
        <Link href="/" className={buttonClass.secondary}>
          Back to Discover
        </Link>
      </StatusScreen>
    </>
  );
}
