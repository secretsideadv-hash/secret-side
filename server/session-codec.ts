import "server-only";

import type { Session } from "@/features/engine/types";
import { sealJson, unsealJson } from "./crypto";
import { sessionSchema } from "./session-schema";

const PURPOSE = "session-cookie";

/** Pure encode/decode, split from the cookie store so it's testable without Next. */
export function encodeSession(session: Session, secret: string): string {
  return sealJson(session, secret, PURPOSE);
}

export function decodeSession(token: string, secret: string): Session | null {
  const parsed = sessionSchema.safeParse(unsealJson(token, secret, PURPOSE));
  return parsed.success ? parsed.data : null;
}
