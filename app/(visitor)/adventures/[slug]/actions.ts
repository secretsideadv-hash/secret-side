"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { startOrResumePlay } from "@/server/play";

const slugSchema = z.string().regex(/^[a-z0-9-]{1,64}$/);

/** "Unlock adventure". Server Actions are public endpoints, so validate the input. */
export async function unlockAdventure(slug: string): Promise<never> {
  const sessionId = await startOrResumePlay(slugSchema.parse(slug));
  redirect(`/play/${sessionId}`);
}
