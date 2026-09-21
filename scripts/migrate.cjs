#!/usr/bin/env node
/**
 * Migration ledger runner.
 *
 *   npm run db:migrate                      status: which migrations are applied / pending / edited
 *   npm run db:migrate -- up                show what would run (dry run)
 *   npm run db:migrate -- up --yes          apply pending migrations, oldest first
 *   npm run db:migrate -- list              list the files (no database needed)
 *   npm run db:migrate -- check             lint the migrations folder (no database needed)
 *
 * Migrations are plain, idempotent .sql files in /migrations named NNNN_snake_case.sql. Each ends
 * with `INSERT INTO schema_migrations ... ON CONFLICT DO NOTHING`, so pasting one into the Supabase
 * SQL Editor records it exactly like this runner does. `up` never runs without --yes because
 * DATABASE_URL is often the live database.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "migrations");
const NAME_RE = /^(\d{4})_[a-z0-9_]+\.sql$/;
const REQUIRED_LIST_FILE = path.join(ROOT, "src", "lib", "automation", "schema-check.ts");

function files() {
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => {
      // Normalise line endings so a Windows checkout and a Linux one hash the same.
      const text = fs.readFileSync(path.join(DIR, f), "utf8").replace(/\r\n/g, "\n");
      return { file: f, name: f.replace(/\.sql$/, ""), text, checksum: crypto.createHash("sha256").update(text).digest("hex") };
    });
}

function check() {
  const problems = [];
  const list = files();
  const seen = new Set();
  let expected = 1;
  for (const m of list) {
    const match = m.file.match(NAME_RE);
    if (!match) {
      problems.push(`${m.file}: name must look like 0005_short_description.sql`);
      continue;
    }
    const n = Number(match[1]);
    if (seen.has(n)) problems.push(`${m.file}: duplicate number ${match[1]}`);
    seen.add(n);
    if (n !== expected) problems.push(`${m.file}: expected number ${String(expected).padStart(4, "0")} (numbers must be gapless)`);
    expected = n + 1;
    const record = `INSERT INTO schema_migrations (name) VALUES ('${m.name}') ON CONFLICT (name) DO NOTHING;`;
    if (!m.text.includes(record)) problems.push(`${m.file}: must end with the ledger insert:\n    ${record}`);
    if (/\b(DROP\s+(TABLE|COLUMN|SCHEMA)|TRUNCATE)\b/i.test(m.text) && !/--\s*destructive-ok/i.test(m.text)) {
      problems.push(`${m.file}: contains DROP/TRUNCATE; add a "-- destructive-ok: <why>" comment if that is intended`);
    }
  }
  if (fs.existsSync(REQUIRED_LIST_FILE)) {
    const ts = fs.readFileSync(REQUIRED_LIST_FILE, "utf8");
    for (const m of list) {
      if (!ts.includes(`"${m.name}"`)) {
        problems.push(`${m.file}: add "${m.name}" to REQUIRED_MIGRATIONS in src/lib/automation/schema-check.ts`);
      }
    }
  }
  return problems;
}

async function connect() {
  require("dotenv").config({ path: [path.join(ROOT, ".env.local"), path.join(ROOT, ".env")] });
  const url = process.env.DATABASE_URL;
  if (!url || url.includes("<")) throw new Error("Set DATABASE_URL (in .env.local or .env) before using the database commands.");
  const postgres = require("postgres");
  const sql = postgres(url, { prepare: false, max: 1 });
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "(unparseable)";
    }
  })();
  return { sql, host };
}

async function ledger(sql) {
  const exists = (await sql`select to_regclass('public.schema_migrations') as t`)[0].t;
  if (!exists) return { installed: false, rows: new Map() };
  const rows = await sql`select name, checksum, applied_at, applied_by from schema_migrations`;
  return { installed: true, rows: new Map(rows.map((r) => [r.name, r])) };
}

function classify(list, applied) {
  return list.map((m) => {
    const row = applied.get(m.name);
    if (!row) return { ...m, state: "pending" };
    if (row.checksum && row.checksum !== m.checksum) return { ...m, state: "modified", row };
    return { ...m, state: "applied", row };
  });
}

async function status() {
  const { sql, host } = await connect();
  try {
    const { installed, rows } = await ledger(sql);
    const list = classify(files(), rows);
    console.log(`Database: ${host}`);
    if (!installed) console.log("Ledger table not found. Apply 0001_schema_migrations first (see migrations/README.md).");
    for (const m of list) {
      const when = m.row ? new Date(m.row.applied_at).toISOString().slice(0, 16).replace("T", " ") : "";
      const tag = m.state === "applied" ? "applied " : m.state === "pending" ? "PENDING " : "MODIFIED";
      console.log(`  ${tag}  ${m.name}${when ? `   ${when} by ${m.row.applied_by}` : ""}`);
    }
    const known = new Set(list.map((m) => m.name));
    for (const name of rows.keys()) if (!known.has(name)) console.log(`  UNKNOWN   ${name}   (recorded in the database but no file here)`);
    const pending = list.filter((m) => m.state === "pending").length;
    const modified = list.filter((m) => m.state === "modified").length;
    console.log(pending ? `\n${pending} pending. Apply with: npm run db:migrate -- up --yes` : "\nUp to date.");
    if (modified) console.log(`${modified} file(s) changed after they were applied. Add a NEW migration instead of editing an old one.`);
    return pending || modified ? 1 : 0;
  } finally {
    await sql.end();
  }
}

async function up(confirmed) {
  const problems = check();
  if (problems.length) {
    console.error("Refusing to run: fix the migrations folder first.\n" + problems.map((p) => "  - " + p).join("\n"));
    return 1;
  }
  const { sql, host } = await connect();
  try {
    const { rows } = await ledger(sql);
    const list = classify(files(), rows);
    const modified = list.filter((m) => m.state === "modified");
    if (modified.length) {
      console.error("Refusing to run: already-applied migration(s) were edited:\n" + modified.map((m) => "  - " + m.file).join("\n"));
      return 1;
    }
    const pending = list.filter((m) => m.state === "pending");
    console.log(`Database: ${host}`);
    if (!pending.length) {
      console.log("Nothing to apply. Up to date.");
      return 0;
    }
    console.log(`${pending.length} pending: ${pending.map((m) => m.name).join(", ")}`);
    if (!confirmed) {
      console.log("\nDry run. Nothing was changed. Re-run with --yes to apply to the database above.");
      return 0;
    }
    const by = `runner:${os.userInfo().username}`;
    for (const m of pending) {
      await sql.begin(async (tx) => {
        await tx.unsafe(m.text);
        // The file records its own name; the runner adds the checksum and who ran it.
        await tx`
          insert into schema_migrations (name, checksum, applied_by) values (${m.name}, ${m.checksum}, ${by})
          on conflict (name) do update set checksum = coalesce(schema_migrations.checksum, excluded.checksum)
        `;
      });
      console.log(`  applied  ${m.name}`);
    }
    console.log("Done.");
    return 0;
  } finally {
    await sql.end();
  }
}

async function main() {
  const [cmd = "status", ...rest] = process.argv.slice(2);
  if (cmd === "list") {
    for (const m of files()) console.log(m.file);
    return 0;
  }
  if (cmd === "check") {
    const problems = check();
    if (problems.length) {
      console.error(problems.map((p) => "  - " + p).join("\n"));
      return 1;
    }
    console.log(`OK: ${files().length} migrations, numbering and ledger inserts are consistent.`);
    return 0;
  }
  if (cmd === "status") return status();
  if (cmd === "up") return up(rest.includes("--yes"));
  console.error(`Unknown command "${cmd}". Use: status | up [--yes] | list | check`);
  return 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error("Migration runner failed:", err.message || err);
    process.exit(1);
  },
);
