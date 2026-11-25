import "server-only";

import type { Experience, ExperienceContent, Id } from "@/features/engine/types";
import { experienceFromRow, experienceRowSchema, fromRows } from "./content-rows";
import { supabaseAdmin } from "./supabase/admin";

/** Public listing data. No stops, no answers. */
export interface ExperienceSummary {
  experience: Experience;
  stopCount: number;
}

/**
 * Storage-agnostic content access. Uncached: server/content.ts and
 * server/catalog.ts add the Next cache on top.
 */
export interface ContentRepository {
  listPublished(citySlug: string): Promise<ExperienceSummary[]>;
  getSummaryBySlug(slug: string): Promise<ExperienceSummary | null>;
  /** Full content incl. answers: engine/server use only, never pass to UI. */
  getContent(experienceId: Id): Promise<ExperienceContent | null>;
}

const SUMMARY_COLUMNS = "*, stops(count)";

function toSummary(row: unknown): ExperienceSummary {
  const stops = (row as { stops?: { count: number }[] }).stops;
  return { experience: experienceFromRow(experienceRowSchema.parse(row)), stopCount: stops?.[0]?.count ?? 0 };
}

/**
 * Reads content from Supabase with the secret key (stops, answers and hints have
 * no guest access at all). Content gets there via `npm run content:import`.
 */
export function createSupabaseContentRepository(db = supabaseAdmin): ContentRepository {
  return {
    async listPublished(citySlug) {
      const { data, error } = await db()
        .from("experiences")
        .select(SUMMARY_COLUMNS)
        .eq("city_slug", citySlug)
        .eq("status", "published")
        .order("is_flagship", { ascending: false })
        .order("title");
      if (error) throw new Error(`listPublished failed: ${error.message}`);
      return data.map(toSummary);
    },

    async getSummaryBySlug(slug) {
      const { data, error } = await db()
        .from("experiences")
        .select(SUMMARY_COLUMNS)
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();
      if (error) throw new Error(`getSummaryBySlug failed: ${error.message}`);
      return data ? toSummary(data) : null;
    },

    async getContent(experienceId) {
      const { data, error } = await db().rpc("get_experience_content", { experience_id: experienceId });
      if (error) throw new Error(`getContent failed: ${error.message}`);
      return data === null ? null : fromRows(data);
    },
  };
}

export const contentRepository: ContentRepository = createSupabaseContentRepository();
