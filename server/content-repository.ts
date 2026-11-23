import "server-only";

import { portoExperiences } from "@/content/porto";
import type { Experience, ExperienceContent, Id } from "@/features/engine/types";

/** Public listing data. No stops, no answers. */
export interface ExperienceSummary {
  experience: Experience;
  stopCount: number;
}

/**
 * Storage-agnostic content access. M1 reads typed files; M2 adds a Supabase
 * implementation with the same interface (snake_case rows mapped here).
 */
export interface ContentRepository {
  listPublished(citySlug: string): Promise<ExperienceSummary[]>;
  getSummaryBySlug(slug: string): Promise<ExperienceSummary | null>;
  /** Full content incl. answers: engine/server use only, never pass to UI. */
  getContent(experienceId: Id): Promise<ExperienceContent | null>;
}

function summarise(content: ExperienceContent): ExperienceSummary {
  return { experience: content.experience, stopCount: content.stops.length };
}

// MOCK: file-backed repository until Supabase (M2).
export function createFileContentRepository(
  all: readonly ExperienceContent[] = portoExperiences,
): ContentRepository {
  const published = all.filter((c) => c.experience.status === "published");
  return {
    async listPublished(citySlug) {
      return published.filter((c) => c.experience.citySlug === citySlug).map(summarise);
    },
    async getSummaryBySlug(slug) {
      const found = published.find((c) => c.experience.slug === slug);
      return found ? summarise(found) : null;
    },
    async getContent(experienceId) {
      return all.find((c) => c.experience.id === experienceId) ?? null;
    },
  };
}

export const contentRepository: ContentRepository = createFileContentRepository();
