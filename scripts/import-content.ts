/**
 * Content import: content/<city>/*.ts → Supabase, idempotently.
 *
 *   npm run content:import -- dev            validate, import into secret-side-dev, refresh the cache
 *   npm run content:import -- live           the same for the live project (secret-side)
 *   npm run content:import -- dev --dry-run  validate and show what would change, then roll back
 *   npm run content:import -- live --revalidate-only   just refresh the live site's cache
 *
 * 1. Runs the content validator on every experience. Any error: nothing is sent.
 * 2. In ONE transaction, calls public.import_experience() per experience (upsert by
 *    id, delete rows that left the files, leave unchanged rows untouched).
 * 3. Reads everything back and checks it equals the files exactly.
 * 4. Calls POST <site>/api/revalidate so the site serves the new content.
 *
 * Credentials come from gitignored env files: .env.local (dev) and .env.live.local (live).
 */
import { existsSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { Client } from "pg";
import { portoExperiences } from "@/content/porto";
import { validateContent } from "@/features/content/validate";
import type { ExperienceContent } from "@/features/engine/types";
import { fromRows, toRows } from "@/server/content-rows";

const PROJECTS = { dev: "rekuyorpqcszmwkiwcsz", live: "qfbrbtzezcaelelnstzb" } as const;
type Target = keyof typeof PROJECTS;

const ALL_CONTENT: readonly ExperienceContent[] = [...portoExperiences];

function fail(message: string): never {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

function loadEnv(file: string) {
  if (existsSync(file)) process.loadEnvFile(file);
}

function settingsFor(target: Target) {
  loadEnv(".env.local");
  if (target === "live") loadEnv(".env.live.local");
  const dbUrl = target === "live" ? process.env.SUPABASE_LIVE_DB_URL : process.env.SUPABASE_DEV_DB_URL;
  const siteUrl = target === "live" ? process.env.LIVE_SITE_URL : (process.env.DEV_SITE_URL ?? "http://localhost:3000");
  const secret = target === "live" ? process.env.LIVE_REVALIDATE_SECRET : process.env.REVALIDATE_SECRET;
  return { dbUrl, siteUrl, secret };
}

/** Row-order-insensitive form for the read-back comparison (compared structurally, not as JSON text). */
function canonical(c: ExperienceContent) {
  const byId = <T extends { id: string }>(xs: readonly T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
  return {
    ...c,
    stops: byId(c.stops),
    challenges: byId(c.challenges),
    hints: byId(c.hints),
    answerKeys: [...c.answerKeys].sort((a, b) => a.challengeId.localeCompare(b.challengeId)),
  };
}

function validateAll(): void {
  let errorCount = 0;
  for (const content of ALL_CONTENT) {
    const { errors, warnings } = validateContent(content);
    const name = `${content.experience.title} (${content.experience.slug})`;
    for (const w of warnings) console.warn(`  ⚠ ${name} ${w.path}: ${w.message}`);
    for (const e of errors) console.error(`  ✖ ${name} ${e.path}: ${e.message}`);
    errorCount += errors.length;
    if (errors.length === 0) console.log(`  ✓ ${name}: valid (${content.stops.length} stops)`);
  }
  if (errorCount > 0) fail(`${errorCount} content error(s). Nothing was imported.`);
}

function describeCounts(counts: Record<string, number>): string {
  const changes = Object.entries(counts).filter(([, n]) => n > 0);
  return changes.length === 0 ? "no changes" : changes.map(([k, n]) => `${k.replace("_", " ")} ${n}`).join(", ");
}

async function importAll(dbUrl: string, dryRun: boolean): Promise<number> {
  // The pooler's certificate chain isn't in Node's CA store; the URL host is fixed by Supabase.
  const db = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await db.connect();
  let totalChanges = 0;
  try {
    await db.query("begin");
    for (const content of ALL_CONTENT) {
      const { rows } = await db.query<{ counts: Record<string, number> }>(
        "select public.import_experience($1::jsonb) as counts",
        [JSON.stringify(toRows(content))],
      );
      const counts = rows[0]!.counts;
      totalChanges += Object.values(counts).reduce((a, b) => a + b, 0);
      console.log(`  ${content.experience.slug}: ${describeCounts(counts)}`);

      // Read back through the same function the app uses and compare with the file.
      const back = await db.query<{ content: unknown }>("select public.get_experience_content($1) as content", [
        content.experience.id,
      ]);
      if (!isDeepStrictEqual(canonical(fromRows(back.rows[0]!.content)), canonical(content))) {
        throw new Error(`${content.experience.slug}: database content differs from the file after import`);
      }
      console.log(`  ✓ ${content.experience.slug}: read back, database matches the content file`);
    }
    if (dryRun) {
      await db.query("rollback");
      console.log("  Dry run: rolled back, nothing changed.");
    } else {
      await db.query("commit");
    }
  } catch (error) {
    await db.query("rollback").catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
  return totalChanges;
}

async function revalidate(target: Target, siteUrl: string | undefined, secret: string | undefined) {
  const envFile = target === "live" ? ".env.live.local" : ".env.local";
  if (!siteUrl || !secret) {
    console.warn(
      `  ⚠ Cache not refreshed: set ${target === "live" ? "LIVE_SITE_URL and LIVE_REVALIDATE_SECRET" : "REVALIDATE_SECRET"} in ${envFile}.` +
        " The site keeps serving the previous content until its cache expires or the next deploy.",
    );
    return;
  }
  const url = new URL("/api/revalidate", siteUrl);
  try {
    const res = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
    console.log(`  ✓ Cache refreshed on ${url.origin}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const hint = target === "dev" ? " (is the local site running? Otherwise it picks the content up on start.)" : "";
    console.warn(`  ⚠ Could not refresh the cache on ${url.origin}: ${message}${hint}`);
    if (target === "live") process.exitCode = 2;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith("--")) as Target | undefined;
  if (target !== "dev" && target !== "live") {
    fail("Usage: npm run content:import -- dev|live [--dry-run] [--revalidate-only]");
  }
  const dryRun = args.includes("--dry-run");
  const { dbUrl, siteUrl, secret } = settingsFor(target);

  if (args.includes("--revalidate-only")) {
    await revalidate(target, siteUrl, secret);
    return;
  }

  console.log(`Validating ${ALL_CONTENT.length} experience(s)…`);
  validateAll();

  if (!dbUrl) fail(`Missing ${target === "live" ? "SUPABASE_LIVE_DB_URL in .env.live.local" : "SUPABASE_DEV_DB_URL in .env.local"}.`);
  if (!dbUrl.includes(PROJECTS[target])) fail(`That database URL is not the ${target} project (${PROJECTS[target]}).`);

  console.log(`Importing into ${target} (${PROJECTS[target]})${dryRun ? " [dry run]" : ""}…`);
  const changes = await importAll(dbUrl, dryRun).catch((error: unknown) =>
    fail(`Import failed and was rolled back: ${error instanceof Error ? error.message : String(error)}`),
  );

  if (!dryRun && changes > 0) await revalidate(target, siteUrl, secret);
  else if (!dryRun) console.log("  Nothing changed, cache left alone.");
}

void main();
