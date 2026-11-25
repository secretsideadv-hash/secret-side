import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import type { ExperienceContent, Id } from "@/features/engine/types";
import { CACHE_TAGS } from "./cache-tags";
import { contentRepository } from "./content-repository";

/**
 * Engine content for one experience, cached on the server (this includes answer
 * keys, so it must never be returned to a client: the play flow projects it with
 * toVisibleState()). Refreshed by a content import via the `content` tag.
 */
export async function getExperienceContent(experienceId: Id): Promise<ExperienceContent | null> {
  "use cache";
  cacheTag(CACHE_TAGS.content, `${CACHE_TAGS.content}:${experienceId}`);
  cacheLife("days");
  return contentRepository.getContent(experienceId);
}
