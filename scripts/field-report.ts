/**
 * Read-only report of a field-test walk on the LIVE project (docs/FIELD_TEST.md):
 *
 *   npm run field:report                 the 5 most recent sessions, to find yours
 *   npm run field:report -- <session id> per stop: how you checked in, the distance and
 *                                        accuracy the server saw, and the slack left
 *
 * GPS check-ins store only distance and accuracy (GAME_RULES §5), never coordinates,
 * so this is everything there is to tune radii with, besides the walker's notes.
 * Runs in a read-only transaction. Needs SUPABASE_LIVE_DB_URL in .env.live.local.
 */
import { existsSync } from "node:fs";
import { Client } from "pg";
import { RULES } from "@/features/engine/rules";

const time = (d: Date | null) =>
  d ? d.toLocaleTimeString("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit" }) : "–";

async function main() {
  if (existsSync(".env.live.local")) process.loadEnvFile(".env.live.local");
  const url = process.env.SUPABASE_LIVE_DB_URL;
  if (!url) throw new Error("SUPABASE_LIVE_DB_URL is missing (put it in .env.live.local)");
  const sessionId = process.argv[2];
  if (sessionId && !/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error("Pass a session id (the part of the URL after /play/).");

  const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query("begin read only");

    if (!sessionId) {
      const { rows } = await db.query(`
        select s.id, s.status, s.end_reason, s.current_position, s.started_at, e.slug
        from public.sessions s join public.experiences e on e.id = s.experience_id
        order by s.started_at desc limit 5`);
      console.log("Most recent sessions on live (Porto time):");
      for (const r of rows)
        console.log(`  ${r.id}  ${r.slug}  started ${r.started_at.toISOString().slice(0, 10)} ${time(r.started_at)}  ${r.status}${r.end_reason ? ` (${r.end_reason})` : ""}, at stop ${r.current_position}`);
      return;
    }

    const { rows: [session] } = await db.query(
      `select s.status, s.end_reason, s.score, s.started_at, e.title from public.sessions s
       join public.experiences e on e.id = s.experience_id where s.id = $1`, [sessionId]);
    if (!session) throw new Error("No such session on live.");
    console.log(`${session.title}: ${session.status}${session.end_reason ? ` (${session.end_reason})` : ""}, score ${session.score}, started ${time(session.started_at)}`);

    const { rows } = await db.query(`
      select st.position, st.title, st.check_in_radius_m as radius, ss.status, ss.check_in_method as method,
             ss.check_in_distance_m as distance, ss.check_in_accuracy_m as accuracy, ss.resolution,
             ss.wrong_attempts, ss.revealed_hint_levels as hints, ss.arrived_at, ss.completed_at
      from public.session_stops ss join public.stops st on st.id = ss.stop_id
      where ss.session_id = $1 order by st.position`, [sessionId]);

    for (const r of rows) {
      let gps = "";
      if (r.method === "gps") {
        // §5: accepted if distance − min(accuracy, cap) ≤ radius. Slack = how much further out it would still have passed.
        const slack = r.radius + Math.min(r.accuracy, RULES.gpsAccuracyAllowanceCapM) - r.distance;
        gps = `  ${r.distance} m away, ±${r.accuracy} m (radius ${r.radius} m, slack ${slack} m)`;
      }
      console.log(
        `  ${r.position}. ${r.title.padEnd(24)} ${(r.method ?? "–").padEnd(6)} arrived ${time(r.arrived_at)}  ${r.status}` +
          `${r.resolution ? ` (${r.resolution})` : ""}, ${r.wrong_attempts} wrong, hints [${r.hints.join(",")}]${gps}`,
      );
    }
  } finally {
    await db.query("rollback").catch(() => {});
    await db.end();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
