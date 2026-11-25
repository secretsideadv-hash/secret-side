/**
 * Next cache tags for content. A content import calls POST /api/revalidate,
 * which expires both, so the next request reads fresh rows from Supabase.
 */
export const CACHE_TAGS = {
  /** Catalog summaries: Discover, Coming soon, Details pages. */
  catalog: "catalog",
  /** Full experience content (answers included) used by the engine on the server. */
  content: "content",
} as const;
