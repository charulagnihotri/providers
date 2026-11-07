/* ============================================================
   Providers Real Estate — Team Account Seeding (Supabase Postgres)
   ------------------------------------------------------------
   Usage:
     npm run seed                                -> ensures the 3 default team accounts
     npm run seed -- username2 username3         -> ensure specific usernames exist
     npm run seed -- --password "NewPass@123"    -> also (re)set the password for
                                                    the accounts touched this run
   Default password for fresh accounts: Providers@123
   (Existing users are NEVER overwritten unless --password is passed.)

   Requires DATABASE_URL (Supabase → Connect → Transaction pooler string),
   either in the environment or in a .env file next to this script.
   ============================================================ */

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { createDb, SCHEMA_SQL } = require("./db");

// tiny .env loader (same format as server.js)
try {
  for (const p of [path.join(__dirname, ".env"), path.join(__dirname, "..", ".env")]) {
    if (fs.existsSync(p)) {
      for (const line of fs.readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) {
          process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
        }
      }
    }
  }
} catch {
  /* ignore */
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
}

const args = process.argv.slice(2);
const usernames = [];
let password = "";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--password") {
    password = args[i + 1];
    i++;
  } else {
    usernames.push(args[i]);
  }
}

const DEFAULT_TEAM = [
  { username: "charul", name: "Charul", role: "admin" },
  { username: "vipul", name: "Vipul Agnihotri", role: "admin" },
  { username: "rohan", name: "Rohan Agnihotri", role: "viewer" },
];

const accounts = usernames.length
  ? usernames.map((u) => ({
      username: u.toLowerCase(),
      name: u.charAt(0).toUpperCase() + u.slice(1),
      role: "editor",
    }))
  : DEFAULT_TEAM;

const finalPassword = password || process.env.TEAM_DEFAULT_PASSWORD || "Providers@123";

(async () => {
  let db;
  try {
    db = createDb();
    await db.exec(SCHEMA_SQL);

    const insert = db.prepare(
      `INSERT INTO users (username, name, pass_hash, role) VALUES (?, ?, ?, ?)
       ON CONFLICT (username) DO NOTHING`
    );
    const updatePw = db.prepare(`UPDATE users SET pass_hash = ? WHERE username = ?`);

    for (const acct of accounts) {
      const res = await insert.run(
        acct.username,
        acct.name,
        hashPassword(finalPassword),
        acct.role
      );
      if (password) await updatePw.run(hashPassword(password), acct.username);
      console.log(
        res.changes > 0
          ? `✔ created ${acct.username} (${acct.role}) — password: ${password ? "(your --password value)" : finalPassword}`
          : `• ${acct.username} already exists${password ? " — password reset" : " (unchanged)"}`
      );
    }

    console.log("\nTeam accounts ready. Sign in at /login");
  } catch (err) {
    console.error("\nSeeding failed:", err.message);
    process.exit(1);
  } finally {
    if (db) await db.close();
  }
})();
