import "server-only";

import { toVisibleSummary, type VisibleExperienceSummary } from "@/features/engine";
import { contentRepository } from "./content-repository";

/**
 * Public catalog reads for Discover and Details. Cached ("use cache") so those
 * pages prerender; each returns allow-listed summaries, never stops or answers.
 * M2: add cacheTag/cacheLife and revalidate when content is imported.
 */

export async function listPublishedSummaries(citySlug: string): Promise<VisibleExperienceSummary[]> {
  "use cache";
  const summaries = await contentRepository.listPublished(citySlug);
  const contents = await Promise.all(
    summaries.map((s) => contentRepository.getContent(s.experience.id)),
  );
  return contents.filter((c) => c !== null).map(toVisibleSummary);
}

export async function getFeaturedSummary(citySlug: string): Promise<VisibleExperienceSummary | null> {
  "use cache";
  const all = await listPublishedSummaries(citySlug);
  return all.find((s) => s.isFlagship) ?? all[0] ?? null;
}

export async function getSummaryBySlug(slug: string): Promise<VisibleExperienceSummary | null> {
  "use cache";
  const summary = await contentRepository.getSummaryBySlug(slug);
  if (!summary) return null;
  const content = await contentRepository.getContent(summary.experience.id);
  return content ? toVisibleSummary(content) : null;
}

export async function listPublishedSlugs(citySlug: string): Promise<string[]> {
  "use cache";
  return (await listPublishedSummaries(citySlug)).map((s) => s.slug);
}
