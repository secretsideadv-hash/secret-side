import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { toVisibleSummary, type VisibleExperienceSummary } from "@/features/engine";
import { CACHE_TAGS } from "./cache-tags";
import { getExperienceContent } from "./content";
import { contentRepository } from "./content-repository";

/**
 * Public catalog reads for Discover and Details. Cached ("use cache") so those
 * pages prerender; each returns allow-listed summaries, never stops or answers.
 * Tagged `catalog`: a content import expires them (POST /api/revalidate).
 */

export async function listPublishedSummaries(citySlug: string): Promise<VisibleExperienceSummary[]> {
  "use cache";
  cacheTag(CACHE_TAGS.catalog);
  cacheLife("days");
  const summaries = await contentRepository.listPublished(citySlug);
  const contents = await Promise.all(summaries.map((s) => getExperienceContent(s.experience.id)));
  return contents.filter((c) => c !== null).map(toVisibleSummary);
}

export async function getFeaturedSummary(citySlug: string): Promise<VisibleExperienceSummary | null> {
  "use cache";
  cacheTag(CACHE_TAGS.catalog);
  cacheLife("days");
  const all = await listPublishedSummaries(citySlug);
  return all.find((s) => s.isFlagship) ?? all[0] ?? null;
}

export async function getSummaryBySlug(slug: string): Promise<VisibleExperienceSummary | null> {
  "use cache";
  cacheTag(CACHE_TAGS.catalog);
  cacheLife("days");
  const summary = await contentRepository.getSummaryBySlug(slug);
  if (!summary) return null;
  const content = await getExperienceContent(summary.experience.id);
  return content ? toVisibleSummary(content) : null;
}

export async function listPublishedSlugs(citySlug: string): Promise<string[]> {
  "use cache";
  cacheTag(CACHE_TAGS.catalog);
  cacheLife("days");
  return (await listPublishedSummaries(citySlug)).map((s) => s.slug);
}
