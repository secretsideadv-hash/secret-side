/**
 * Read-only health check of the LIVE project and site, for after a release:
 *
 *   npm run verify:live
 *
 * - every migration in supabase/migrations is applied on live
 * - live content equals content/<city>/*.ts exactly
 * - security: RLS on every table, guest grants exactly the allow-list, no
 *   function guests can run, search_path pinned on every function
 * - the abandon job is scheduled and active
 * - the site answers: Discover and Saúde! pages load, /api/revalidate refuses
 *   requests without the secret
 *
 * Runs in a read-only database transaction; changes nothing. Needs
 * SUPABASE_LIVE_DB_URL and LIVE_SITE_URL in .env.live.local.
 */
import { existsSync, readdirSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { Client } from "pg";
import { portoExperiences } from "@/content/porto";
import type { ExperienceContent } from "@/features/engine/types";
import { fromRows } from "@/server/content-rows";

const LIVE_REF = "qfbrbtzezcaelelnstzb";
const GUEST_GRANTS = [
  "experiences anon SELECT",
  "experiences authenticated SELECT",
  "session_stops authenticated SELECT",
  "sessions authenticated SELECT",
];
const OUR_FUNCTIONS = `n.nspname in ('public', 'private')
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`;

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ✓" : "  ✖"} ${name}${detail ? `: ${detail}` : ""}`);
}

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

async function verifyDatabase(url: string) {
  const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query("begin read only");
    const rows = async <T>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as T[];

    console.log("Database (live, read-only)");
    const files = readdirSync("supabase/migrations").map((f) => f.split("_")[0]!).sort();
    const applied = (
      await rows<{ version: string }>("select version from supabase_migrations.schema_migrations order by version")
    ).map((r) => r.version);
    const missing = files.filter((f) => !applied.includes(f));
    check("migrations applied", missing.length === 0, missing.length ? `missing ${missing.join(", ")}` : `${applied.length} of ${files.length}`);

    for (const content of portoExperiences) {
      const [row] = await rows<{ c: unknown }>("select public.get_experience_content($1) as c", [content.experience.id]);
      const same = row?.c ? isDeepStrictEqual(canonical(fromRows(row.c)), canonical(content)) : false;
      check(`content ${content.experience.slug} matches the file`, same, row?.c ? "" : "not imported");
    }

    const noRls = await rows<{ relname: string }>(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`);
    check("RLS on every table", noRls.length === 0, noRls.map((r) => r.relname).join(", "));

    const grants = (
      await rows<{ g: string }>(`
      select c.relname || ' ' || r.role || ' ' || p.priv as g
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('anon'), ('authenticated')) r(role)
      cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(priv)
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
        and case when p.priv in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
                 then has_any_column_privilege(r.role, c.oid, p.priv)
                 else has_table_privilege(r.role, c.oid, p.priv) end
      order by 1`)
    ).map((r) => r.g);
    check("guest table grants are exactly the allow-list", isDeepStrictEqual(grants, GUEST_GRANTS), grants.join("; "));

    const callable = await rows<{ fn: string }>(`
      select p.oid::regprocedure::text as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      cross join (values ('anon'), ('authenticated')) r(role)
      where ${OUR_FUNCTIONS} and has_function_privilege(r.role, p.oid, 'EXECUTE')`);
    check("no function guests can run", callable.length === 0, callable.map((r) => r.fn).join(", "));

    const unpinned = await rows<{ fn: string }>(`
      select p.oid::regprocedure::text as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where ${OUR_FUNCTIONS} and not coalesce(p.proconfig @> array['search_path=""'], false)`);
    check("search_path pinned on every function", unpinned.length === 0, unpinned.map((r) => r.fn).join(", "));

    const jobs = await rows<{ active: boolean }>("select active from cron.job where jobname = 'abandon-idle-sessions'");
    check("abandon job scheduled and active", jobs.length === 1 && jobs[0]!.active);
  } finally {
    await db.query("rollback").catch(() => {});
    await db.end();
  }
}

async function verifySite(site: string) {
  console.log(`Site (${site})`);
  for (const path of ["/", "/adventures/saude"]) {
    const res = await fetch(new URL(path, site));
    check(`GET ${path}`, res.ok, String(res.status));
  }
  const page = await (await fetch(new URL("/adventures/saude", site))).text();
  check("Saúde! page shows its content", page.includes("Saúde!"));
  const revalidate = await fetch(new URL("/api/revalidate", site), { method: "POST" });
  check("/api/revalidate refuses requests without the secret", revalidate.status === 401, String(revalidate.status));
}

async function main() {
  if (existsSync(".env.live.local")) process.loadEnvFile(".env.live.local");
  const url = process.env.SUPABASE_LIVE_DB_URL;
  const site = process.env.LIVE_SITE_URL;
  if (!url?.includes(LIVE_REF) || !site) {
    console.error("Set SUPABASE_LIVE_DB_URL (live project) and LIVE_SITE_URL in .env.live.local.");
    process.exit(1);
  }
  await verifyDatabase(url);
  await verifySite(site);
  console.log(failures === 0 ? "\nLive looks healthy." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
