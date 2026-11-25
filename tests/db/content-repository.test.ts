/**
 * The Supabase content repository against the dev project, after
 * `npm run content:import -- dev`. Proves the imported content is exactly the
 * file content and that summaries carry no stops or answers.
 */
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { saude } from "@/content/porto/saude";
import type { ExperienceContent } from "@/features/engine/types";
import { createSupabaseContentRepository } from "@/server/content-repository";
import { anonClient, expectDenied } from "./clients";

const repo = createSupabaseContentRepository(() =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }),
);

function canonical(c: ExperienceContent) {
  const byId = <T extends { id: string }>(xs: readonly T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
  return {
    ...c,
    challenges: byId(c.challenges),
    hints: byId(c.hints),
    answerKeys: [...c.answerKeys].sort((a, b) => a.challengeId.localeCompare(b.challengeId)),
  };
}

describe("Supabase content repository (dev)", () => {
  it("returns exactly the imported Saúde! content", async () => {
    const content = await repo.getContent(saude.experience.id);
    expect(content, "run `npm run content:import -- dev` first").not.toBeNull();
    expect(canonical(content!)).toEqual(canonical(saude));
  });

  it("lists Saúde! as Porto's flagship with 5 stops", async () => {
    const list = await repo.listPublished("porto");
    const found = list.find((s) => s.experience.slug === "saude");
    expect(found?.stopCount).toBe(5);
    expect(list[0]?.experience.isFlagship).toBe(true);
  });

  it("summaries hold the experience and a count, nothing else", async () => {
    const summary = await repo.getSummaryBySlug("saude");
    expect(Object.keys(summary!).sort()).toEqual(["experience", "stopCount"]);
    expect(JSON.stringify(summary)).not.toContain(saude.stops[0]!.id);
  });

  it("returns null for unknown slugs and ids", async () => {
    expect(await repo.getSummaryBySlug("no-such-adventure")).toBeNull();
    expect(await repo.getContent("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("the content functions can't be called with the publishable key", async () => {
    const anon = anonClient();
    expectDenied(await anon.rpc("get_experience_content", { experience_id: saude.experience.id }), "read content");
    expectDenied(await anon.rpc("import_experience", { content: {} }), "import content");
  });
});
