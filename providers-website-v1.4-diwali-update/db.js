/* ═══════════════════════════════════════════════════════════════════════
   db.js — Postgres / Supabase data layer for Providers Real Estate

   Replaces better-sqlite3 so the site can run FREE on:
     • Netlify Functions  (serverless hosting)
     • Supabase           (Postgres database + file storage)

   It mimics the better-sqlite3 API (prepare().get()/.all()/.run(),
   exec, pragma) but returns PROMISES — so server.js keeps its SQL
   almost unchanged, just with `await` added.

   Configuration (environment variables):
     DATABASE_URL           Supabase "Transaction pooler" connection string
                            e.g. postgresql://postgres.abc123:PASS@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
     SUPABASE_URL           https://abc123.supabase.co            (optional — enables cloud photo storage)
     SUPABASE_SERVICE_KEY   service_role key from Supabase → Settings → API
     SUPABASE_BUCKET        storage bucket name (default: "uploads")
   ═══════════════════════════════════════════════════════════════════════ */

const pg = require("pg");

/* Big integers (session expiry timestamps in ms) must arrive as JS numbers */
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
    name TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    interest TEXT DEFAULT 'General',
    message TEXT DEFAULT '',
    source TEXT DEFAULT 'website',
    status TEXT NOT NULL DEFAULT 'new',
    notes TEXT NOT NULL DEFAULT '',
    assigned_to TEXT NOT NULL DEFAULT 'Vipul'
  );

  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    pass_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'editor',
    created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS listings (
    id SERIAL PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
    updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
    title TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    property_type TEXT NOT NULL DEFAULT 'Residential',
    listing_type TEXT NOT NULL DEFAULT 'sale',
    badge TEXT NOT NULL DEFAULT 'For Sale',
    price TEXT NOT NULL DEFAULT 'Price on request',
    specs_json TEXT NOT NULL DEFAULT '[]',
    image_url TEXT NOT NULL DEFAULT '',
    images_json TEXT NOT NULL DEFAULT '[]',
    video_url TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    features_json TEXT NOT NULL DEFAULT '[]',
    published INTEGER NOT NULL DEFAULT 0,
    marketing_status TEXT NOT NULL DEFAULT 'needs ad',
    marketing_note TEXT NOT NULL DEFAULT '',
    marketing_link TEXT NOT NULL DEFAULT '',
    follow_up_at TEXT,
    follow_up_note TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS listing_assets (
    id SERIAL PRIMARY KEY,
    listing_id INTEGER NOT NULL,
    stored_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT '',
    uploaded_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
    uploaded_by INTEGER
  );

  CREATE TABLE IF NOT EXISTS site_visits (
    id SERIAL PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
    client_name TEXT NOT NULL,
    client_phone TEXT NOT NULL DEFAULT '',
    client_email TEXT NOT NULL DEFAULT '',
    property_title TEXT NOT NULL DEFAULT '',
    visit_date TEXT NOT NULL,
    visit_time TEXT NOT NULL DEFAULT '11:00 AM',
    status TEXT NOT NULL DEFAULT 'scheduled',
    notes TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS email_campaigns (
    id SERIAL PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
    updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    preheader TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT 'Charul'
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
    user_id INTEGER,
    user_name TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT ''
  );
`;

/* SQLite's datetime('now','localtime') produced "YYYY-MM-DD HH:MM:SS" in the
   server's timezone. Our tables keep that exact TEXT format (IST) so every
   dashboard and CSV keeps working unchanged. */
function nowStr() {
  return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" });
}

/* First day of the current month, same TEXT format (for the stats query) */
function monthStartStr() {
  const d = new Date();
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  return m.toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" });
}

class PgShim {
  constructor(pool) {
    this.pool = pool;
    this._idCols = new Set(); // tables known to have an "id" column
    this._idColsChecked = new Set();
  }

  _toPgSql(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  }

  async _tableHasId(table) {
    if (this._idColsChecked.has(table)) return this._idCols.has(table);
    this._idColsChecked.add(table);
    try {
      // ⚠️ Scope to OUR schema (current_schema). Without this, a real Supabase
      // project matches its built-in auth.sessions / auth.users tables, which
      // have an "id" column our tables may not have — that once made the shim
      // append "RETURNING id" to INSERT INTO sessions and crash login.
      const r = await this.pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = $1 AND column_name = 'id'
           AND table_schema = current_schema()
         LIMIT 1`,
        [table]
      );
      if (r.rowCount > 0) this._idCols.add(table);
    } catch {
      /* table may not exist yet — assume no id column */
    }
    return this._idCols.has(table);
  }

  prepare(sql) {
    const clean = sql.trim().replace(/;+\s*$/, "");
    const pgSql = this._toPgSql(clean);
    const isWrite = /^(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(pgSql);
    const isInsert = /^INSERT\b/i.test(pgSql);
    const tableMatch = pgSql.match(
      /^(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?([A-Za-z_][\w]*)"?/i
    );
    const table = tableMatch ? tableMatch[1] : null;

    let finalSql = pgSql;
    if (isInsert && !/\bRETURNING\b/i.test(pgSql)) {
      // append RETURNING lazily at run() time (async check) — see run()
    }

    const q = async (params) => {
      let sqlToRun = finalSql;
      let returningAdded = false;
      if (isInsert && !/\bRETURNING\b/i.test(sqlToRun)) {
        if (table && (await this._tableHasId(table))) {
          sqlToRun = `${sqlToRun} RETURNING id`;
          returningAdded = true;
        }
      }
      try {
        return await this.pool.query(sqlToRun, params);
      } catch (err) {
        // Safety net: if our RETURNING-id guess is wrong (code 42703 =
        // "column does not exist"), retry once WITHOUT it and remember
        // the table has no id. A write must never fail over this.
        if (returningAdded && err && err.code === "42703") {
          this._idCols.delete(table);
          return this.pool.query(finalSql, params);
        }
        throw err;
      }
    };

    return {
      get: async (...params) => {
        const r = await q(params);
        return r.rows[0] || undefined;
      },
      all: async (...params) => {
        const r = await q(params);
        return r.rows;
      },
      run: async (...params) => {
        const r = await q(params);
        return {
          changes: r.rowCount,
          lastInsertRowid: r.rows && r.rows[0] ? r.rows[0].id : null,
        };
      },
    };
  }

  async exec(sql) {
    await this.pool.query(sql);
  }

  /* Supports pragma("table_info(x")-style introspection; everything else is a no-op */
  async pragma(q) {
    const m = String(q).match(/table_info\((\w+)\)/i);
    if (m) {
      const r = await this.pool.query(
        `SELECT column_name AS name FROM information_schema.columns
         WHERE table_name = $1 ORDER BY ordinal_position`,
        [m[1]]
      );
      return r.rows;
    }
    return [];
  }

  async close() {
    try {
      await this.pool.end();
    } catch {
      /* ignore */
    }
  }
}

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Create a free Supabase project, then set DATABASE_URL to its " +
        "'Transaction pooler' connection string (Supabase → Connect → Connection string). " +
        "You can put it in a .env file next to server.js:\nDATABASE_URL=postgresql://postgres.XXXX:PASSWORD@aws-0-xxxx.pooler.supabase.com:6543/postgres"
    );
  }
  const isLocal = /localhost|127\.0\.0\.1|\[::1\]/.test(url);
  const pool = new pg.Pool({
    connectionString: url,
    max: 5,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
  pool.on("error", (err) => console.error("Postgres pool error:", err.message));
  return new PgShim(pool);
}

module.exports = { createDb, SCHEMA_SQL, nowStr, monthStartStr };
