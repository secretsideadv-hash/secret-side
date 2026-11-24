/**
 * Privilege audit of the dev database, plus a probe proving that a table or
 * function added later is NOT reachable with the publishable key by default
 * (even with RLS forgotten). Runs as `postgres` over SUPABASE_DEV_DB_URL.
 */
import { randomUUID } from "node:crypto";
import type { Client as PgClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, devPostgres, expectDenied, guestClient } from "./clients";

let pg: PgClient;

beforeAll(async () => {
  pg = await devPostgres();
});

afterAll(async () => {
  await pg?.end();
});

const rows = async <T>(sql: string): Promise<T[]> => (await pg.query(sql)).rows as T[];

const NOT_EXTENSION = `not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`;

describe("privilege audit", () => {
  it("has RLS enabled on every table in public", async () => {
    const missing = await rows<{ table: string }>(`
      select c.relname as table
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`);
    expect(missing).toEqual([]);
  });

  it("grants guests exactly the allow-listed table privileges", async () => {
    const granted = await rows<{ grant: string }>(`
      select c.relname || ' ' || r.role || ' ' || p.priv as grant
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('anon'), ('authenticated')) r(role)
      cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                         ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(priv)
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
        and case when p.priv in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
                 then has_any_column_privilege(r.role, c.oid, p.priv)
                 else has_table_privilege(r.role, c.oid, p.priv) end
      order by 1`);
    expect(granted.map((g) => g.grant)).toEqual([
      "experiences anon SELECT",
      "experiences authenticated SELECT",
      "session_stops authenticated SELECT",
      "sessions authenticated SELECT",
    ]);
  });

  it("grants guests no sequences and no functions", async () => {
    const sequences = await rows(`
      select c.relname, r.role from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('anon'), ('authenticated')) r(role)
      where n.nspname = 'public' and c.relkind = 'S'
        and has_sequence_privilege(r.role, c.oid, 'USAGE,SELECT,UPDATE')`);
    expect(sequences).toEqual([]);

    const functions = await rows(`
      select p.oid::regprocedure::text as fn, r.role from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join (values ('anon'), ('authenticated')) r(role)
      where n.nspname in ('public', 'private') and ${NOT_EXTENSION}
        and has_function_privilege(r.role, p.oid, 'EXECUTE')`);
    expect(functions).toEqual([]);
  });

  it("pins search_path = '' on every function of ours", async () => {
    const unpinned = await rows(`
      select p.oid::regprocedure::text as fn, p.prosecdef as security_definer, p.proconfig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') and ${NOT_EXTENSION}
        and not coalesce(p.proconfig @> array['search_path=""'], false)`);
    expect(unpinned).toEqual([]);
  });

  it("keeps the private schema closed to guests", async () => {
    const [row] = await rows<{ anon: boolean; authenticated: boolean }>(`
      select has_schema_privilege('anon', 'private', 'USAGE') as anon,
             has_schema_privilege('authenticated', 'private', 'USAGE') as authenticated`);
    expect(row).toEqual({ anon: false, authenticated: false });
  });

  // Scope: our schemas plus the global (all-schemas) defaults. Supabase manages its
  // own schemas (storage, graphql, realtime…) and their defaults; Storage relies on them.
  it("has no default privileges giving guests or PUBLIC anything new in our schemas", async () => {
    const defaults = await rows(`
      select d.defaclobjtype as kind, coalesce(n.nspname, '(all schemas)') as schema,
             case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end as grantee,
             a.privilege_type
      from pg_default_acl d
      left join pg_namespace n on n.oid = d.defaclnamespace
      cross join lateral aclexplode(d.defaclacl) a
      where d.defaclrole = 'postgres'::regrole
        and (d.defaclnamespace = 0 or n.nspname in ('public', 'private'))
        and (a.grantee = 0 or a.grantee in ('anon'::regrole, 'authenticated'::regrole))`);
    expect(defaults).toEqual([]);

    // With no global entry, Postgres' built-in default (EXECUTE for PUBLIC) would apply.
    const [global] = await rows<{ present: boolean }>(`
      select exists (select 1 from pg_default_acl
                     where defaclrole = 'postgres'::regrole and defaclnamespace = 0
                       and defaclobjtype = 'f') as present`);
    expect(global?.present).toBe(true);
  });
});

describe("a table and function added later", () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const table = `zz_probe_${suffix}`;
  const fn = `zz_probe_fn_${suffix}`;
  const SECRET = `PROBE_SECRET_${suffix}`;

  afterAll(async () => {
    await pg?.query(`drop function if exists public.${fn}(); drop table if exists public.${table};
                     notify pgrst, 'reload schema';`);
  });

  it("are not readable or callable with the publishable key, even without RLS", async () => {
    // Created the way a careless future migration would: no RLS, no explicit revoke.
    await pg.query(`
      create table public.${table} (id int primary key, secret text not null);
      insert into public.${table} values (1, '${SECRET}');
      create function public.${fn}() returns text language sql set search_path = ''
        as $$ select '${SECRET}'::text $$;
      notify pgrst, 'reload schema';`);
    // Only so the test can tell when the API has picked the new objects up.
    await pg.query(`grant select on public.${table} to service_role;
                    grant execute on function public.${fn}() to service_role;
                    notify pgrst, 'reload schema';`);

    const admin = adminClient();
    let visible = false;
    for (let i = 0; i < 40 && !visible; i++) {
      const res = await admin.from(table).select("secret");
      visible = res.error === null;
      if (!visible) await new Promise((r) => setTimeout(r, 500));
    }
    expect(visible, "the API never picked up the probe table").toBe(true);

    const anon = anonClient();
    const { client: guest, userId } = await guestClient();
    try {
      for (const [who, c] of [["visitor", anon], ["guest", guest]] as const) {
        const read = await c.from(table).select("*");
        expectDenied(read, `${who} reads new table`);
        const call = await c.rpc(fn);
        expectDenied(call, `${who} calls new function`);
        expect(JSON.stringify([read, call])).not.toContain(SECRET);
      }
    } finally {
      await admin.auth.admin.deleteUser(userId);
    }
  });
});
