"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { StatusScreen } from "@/components/ui/StatusScreen";
import { AlertIcon } from "@/components/ui/icons";
import { buttonClass } from "@/components/ui/primitives";
import "./globals.css";

/**
 * Last resort when the root layout itself fails. It replaces the whole document,
 * so it renders its own <html>/<body> and falls back to system fonts.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-ground font-sans text-fg">
        <title>Something went wrong · Secret Side · Porto</title>
        <StatusScreen
          icon={<AlertIcon className="size-8" />}
          eyebrow="Something went wrong"
          title="We lost the trail."
          body="Secret Side didn't load. Your progress is saved, so try again in a moment."
        >
          <button type="button" onClick={() => retry()} className={buttonClass.primary}>
            Try again
          </button>
          {/* A full page load on purpose: the app shell itself failed, so client navigation can't be trusted. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className={buttonClass.secondary}>
            Back to Discover
          </a>
        </StatusScreen>
      </body>
    </html>
  );
}
