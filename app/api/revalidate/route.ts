import { createHash, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/server/cache-tags";

/**
 * Called by `npm run content:import` after it writes to the database, so the
 * catalog and engine content are read fresh on the next request.
 * Auth: `Authorization: Bearer <REVALIDATE_SECRET>`.
 */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || secret.length < 32) {
    return Response.json({ error: "Revalidation is not configured" }, { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!sameSecret(given, secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // expire: 0 → the next request waits for fresh data instead of being served the old copy.
  const tags = [CACHE_TAGS.catalog, CACHE_TAGS.content];
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: tags });
}

/** Constant-time comparison (hashing first makes the lengths equal). */
function sameSecret(a: string, b: string): boolean {
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}
