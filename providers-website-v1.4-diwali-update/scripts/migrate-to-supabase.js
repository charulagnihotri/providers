/* ═══════════════════════════════════════════════════════════════════════
   migrate-to-supabase.js — one-time move of your old local data to Supabase

   What it does:
   1. Creates the Postgres schema in Supabase (same tables as server.js)
   2. Copies users, leads, listings, listing_assets, site_visits,
      email_campaigns and activity_log from your old data/leads.db
   3. Uploads every photo in data/uploads to the Supabase Storage bucket
      and rewrites the old "/uploads/…" links to public Supabase URLs
   4. Fixes id sequences so new records never collide with old ids

   Usage (from the project folder):
     1) Put your Supabase details in .env next to server.js:
          DATABASE_URL=postgresql://postgres.XXXX:PASSWORD@aws-0-xxxx.pooler.supabase.com:6543/postgres
          SUPABASE_URL=https://xxxx.supabase.co
          SUPABASE_SERVICE_KEY=eyJhbGciOi...   (service_role key)
     2) Run:  npm run migrate

   Safe to run twice — existing rows are skipped, photos are overwritten.
   (Sessions are intentionally NOT copied: simply sign in again.)
   ═══════════════════════════════════════════════════════════════════════ */

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const { createDb, SCHEMA_SQL } = require("../db");

/* ---------- tiny .env loader (same format as server.js) ---------- */
try {
  for (const p of [path.join(__dirname, "..", ".env"), path.join(__dirname, "..", "..", ".env")]) {
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");
      for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) {
          process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
        }
      }
    }
  }
} catch {
  /* ignore */
}

const SQLITE_PATH = process.argv.includes("--db")
  ? process.argv[process.argv.indexOf("--db") + 1]
  : path.join(__dirname, "..", "data", "leads.db");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || "";
const BUCKET = process.env.SUPABASE_BUCKET || "uploads";
const UPLOAD_DIR = path.join(__dirname, "..", "data", "uploads");

const TABLES = [
  "users",
  "leads",
  "listings",
  "listing_assets",
  "site_visits",
  "email_campaigns",
  "activity_log",
];

async function main() {
  if (!fs.existsSync(SQLITE_PATH)) {
    console.error(`✗ Old database not found at ${SQLITE_PATH}\n  (If you never ran the old version, there is nothing to migrate.)`);
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("✗ DATABASE_URL is not set. Add it to .env first (see file header comments).");
    process.exit(1);
  }

  console.log("→ Opening old SQLite database…");
  const sqlite = new Database(SQLITE_PATH, { readonly: false });

  console.log("→ Connecting to Supabase Postgres…");
  const pg = createDb();
  await pg.exec(SCHEMA_SQL);
  console.log("  ✓ schema ready");

  let totalCopied = 0;
  for (const table of TABLES) {
    const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
    if (!rows.length) {
      console.log(`  • ${table}: 0 rows`);
      continue;
    }
    const cols = Object.keys(rows[0]);
    let copied = 0;
    for (const row of rows) {
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      const colList = cols.map((c) => `"${c}"`).join(", ");
      const values = cols.map((c) => {
        const v = row[c];
        if (Buffer.isBuffer(v)) return v.toString("latin1");
        return v === undefined ? null : v;
      });
      await pg.pool.query(
        `INSERT INTO ${table} (${colList}) VALUES (${placeholders})
         ON CONFLICT DO NOTHING`,
        values
      );
      copied++;
    }
    totalCopied += copied;
    // keep SERIAL sequences ahead of the copied ids
    if (cols.includes("id")) {
      await pg.pool.query(
        `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1))`
      );
    }
    console.log(`  ✓ ${table}: ${copied} rows copied`);
  }

  /* ---------- photos → Supabase Storage ---------- */
  let storageDone = 0;
  const useStorage = Boolean(SUPABASE_URL && SUPABASE_KEY);
  if (useStorage && fs.existsSync(UPLOAD_DIR)) {
    const files = fs.readdirSync(UPLOAD_DIR).filter((f) => !f.startsWith("."));
    if (files.length) {
      console.log(`→ Uploading ${files.length} photo(s) to Supabase Storage…`);
      for (const f of files) {
        const full = path.join(UPLOAD_DIR, f);
        if (!fs.statSync(full).isFile()) continue;
        const buf = fs.readFileSync(full);
        const mime = f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "image/jpeg";
        const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${f}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": mime,
            "x-upsert": "true",
          },
          body: buf,
        });
        if (!res.ok) {
          console.log(`    ⚠ ${f}: HTTP ${res.status} (skipped)`);
          continue;
        }
        storageDone++;
      }
      console.log(`  ✓ ${storageDone}/${files.length} photos uploaded`);

      // rewrite old /uploads/<name> links to the public Storage URLs
      const pub = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}`;
      const r1 = await pg.pool.query(
        `UPDATE listings
         SET image_url = ${pub} || '/' || regexp_replace(image_url, '^/uploads/', ''),
             images_json = replace(images_json, '"/uploads/', '"${pub}/')
         WHERE image_url LIKE '/uploads/%' OR images_json LIKE '%/uploads/%'`
      );
      console.log(`  ✓ listing photo links rewritten (${r1.rowCount} rows)`);
      const r2 = await pg.pool.query(
        `UPDATE listing_assets SET stored_name = stored_name WHERE true`
      ); // stored_name stays the filename — the delete API resolves it in the bucket
      void r2;
    }
  } else if (!useStorage) {
    console.log(
      "  • SUPABASE_URL / SUPABASE_SERVICE_KEY not set — photos were NOT uploaded.\n    Old /uploads/ links will only work locally until you set those keys and re-run."
    );
  }

  sqlite.close();
  await pg.close();
  console.log(
    `\n✔ Migration finished — ${totalCopied} rows moved${storageDone ? `, ${storageDone} photos uploaded` : ""}.\n  Next: sign in at your deployed site and change the team passwords.`
  );
}

main().catch((err) => {
  console.error("\n✗ Migration failed:", err.message);
  process.exit(1);
});
