const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const multer = require("multer");

/* ---------- tiny .env loader (no dependency) ---------- */
try {
  const readEnvFile = (p) => {
    if (!fs.existsSync(p)) return;
    // Strip BOM (TextEdit/Notepad often add one) and accept CRLF line endings
    const raw = fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        let v = m[2].trim();
        if (
          (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
          (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
        ) {
          v = v.slice(1, -1);
        }
        if (v) process.env[m[1]] = v;
      }
    }
  };
  readEnvFile(path.join(__dirname, ".env"));
  // Convenience for nested installs (e.g. providers/providers): a .env one
  // folder up also works, so a misplaced key file still gets picked up.
  readEnvFile(path.join(__dirname, "..", ".env"));
} catch {
  /* ignore missing .env */
}

const app = express();
app.use(express.json({ limit: "5mb" }));

const SESSION_DAYS = 30;
const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOAD_DIR = path.join(__dirname, "data", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Static routes
app.use("/uploads", express.static(UPLOAD_DIR));
app.use("/images", express.static(path.join(PUBLIC_DIR, "images")));

/* ---------- validation ---------- */
function digits(p) {
  let d = String(p).replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}
const isValidPhone = (p) => /^[6-9]\d{9}$/.test(digits(p));
const isValidEmail = (e) =>
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(String(e).trim());

/* ---------- passwords & sessions ---------- */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
}
function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const a = crypto.scryptSync(pw, salt, 64);
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > -1)
      out[part.slice(0, i).trim()] = decodeURIComponent(
        part.slice(i + 1).trim()
      );
  }
  return out;
}

/* ---------- database ---------- */
fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
const db = new Database(path.join(__dirname, "data", "leads.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
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
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    pass_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'editor',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
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
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL,
    stored_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT '',
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    uploaded_by INTEGER
  );

  CREATE TABLE IF NOT EXISTS site_visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
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
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    preheader TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT 'Charul'
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    user_id INTEGER,
    user_name TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

// Migration helpers
const ensureColumn = (table, col, def) => {
  const cols = db.pragma(`table_info(${table})`).map((c) => c.name);
  if (!cols.includes(col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  }
};

ensureColumn("leads", "status", "TEXT NOT NULL DEFAULT 'new'");
ensureColumn("leads", "notes", "TEXT NOT NULL DEFAULT ''");
ensureColumn("leads", "assigned_to", "TEXT NOT NULL DEFAULT 'Vipul'");
ensureColumn("users", "role", "TEXT NOT NULL DEFAULT 'editor'");
ensureColumn("listings", "images_json", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("listings", "video_url", "TEXT NOT NULL DEFAULT ''");
ensureColumn("listings", "description", "TEXT NOT NULL DEFAULT ''");
ensureColumn("listings", "features_json", "TEXT NOT NULL DEFAULT '[]'");

const LEAD_STATUSES = [
  "new",
  "contacted",
  "site visit",
  "negotiation",
  "closed",
  "lost",
];

const MARKETING_STAGES = [
  "needs ad",
  "ad ready",
  "published",
  "negotiation",
  "closed",
];

function logActivity(user, entityType, entityId, action, detail) {
  try {
    db.prepare(
      `INSERT INTO activity_log (user_id, user_name, entity_type, entity_id, action, detail)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      user?.id || null,
      user?.name || "System",
      entityType,
      entityId ?? null,
      action,
      typeof detail === "string" ? detail : JSON.stringify(detail || {})
    );
  } catch {
    /* ignore logging error */
  }
}

function parseJSON(val, fallback) {
  try {
    return JSON.parse(val || "[]");
  } catch {
    return fallback;
  }
}

function rowToPublicListing(row) {
  let specs = parseJSON(row.specs_json, []);
  let images = parseJSON(row.images_json, []);
  if (!images.length && row.image_url) {
    images = [row.image_url];
  }
  let features = parseJSON(row.features_json, []);

  return {
    id: row.id,
    title: row.title,
    location: row.location,
    type: row.property_type,
    status: row.listing_type,
    badge: row.badge,
    price: row.price,
    specs,
    image: row.image_url || (images.length ? images[0] : ""),
    images,
    description: row.description || "",
    features,
  };
}

/* ---------- seed default listings & sample data ---------- */
const DEFAULT_LISTINGS = [
  {
    title: "Premium Shop at M3M Urbana",
    location: "Sector 67, Gurugram",
    property_type: "Retail",
    listing_type: "sale",
    badge: "For Sale",
    price: "Price on request",
    specs: [
      "A spacious size of 666 sq. ft.",
      "A corner unit which is two side open",
      "Ground floor · high pedestrian footfall",
      "Pre-leased / High rental yield potential",
    ],
    features: [
      "Centrally air-conditioned high-street architecture",
      "100% full power backup & fire suppression",
      "Multi-level basement parking for 1,500+ cars",
      "24/7 security with CCTV surveillance",
    ],
    description:
      "A prime ground-floor corner retail showroom in M3M Urbana, Sector 67, Gurugram. Two-side open visibility on the main pedestrian boulevard makes it one of the premier retail assets for flagship brands, cafes, or high-yield commercial investment.",
    image_url: "/images/m3m-urbana-ad.jpg",
    images: [
      "/images/m3m-urbana-ad.jpg",
      "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1519642918688-7e43b19245d8?auto=format&fit=crop&w=1400&q=80",
    ],
    video_url: "",
    marketing_status: "published",
    published: 1,
  },
  {
    title: "Park-Facing 3 BHK Luxury Builder Floor",
    location: "Greater Kailash I, South Delhi",
    property_type: "Residential",
    listing_type: "sale",
    badge: "Park Facing",
    price: "₹ 4.85 Cr",
    specs: [
      "1,850 sq. ft. built-up (approx.)",
      "3 Ensuite Bedrooms · Powder Room · Family Lounge",
      "Direct park-facing expansive balcony",
      "Stilt parking for 2 large vehicles · Schindler Lift",
    ],
    features: [
      "Imported Italian marble flooring throughout",
      "Fully fitted German modular kitchen with built-in appliances",
      "Dedicated staff accommodation with private bath",
      "Gated, guarded avenue with tree-lined tranquil surroundings",
    ],
    description:
      "A masterpiece of refined modern living in prime Greater Kailash I, South Delhi. Overlooking lush park greenery, this floor features sun-drenched interiors, Italian marble, private elevator access, and double stilt parking.",
    image_url:
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=80",
    images: [
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1400&q=80",
    ],
    video_url: "",
    marketing_status: "published",
    published: 1,
  },
  {
    title: "Ultra-Luxury Independent Villa with Private Pool",
    location: "DLF Phase 1, Gurugram",
    property_type: "Residential",
    listing_type: "sale",
    badge: "Exclusive",
    price: "₹ 11.75 Cr",
    specs: [
      "5 BHK · 4,800 sq. ft. built-up · 500 sq. yd. plot",
      "Private landscaped lawn & temperature-controlled splash pool",
      "Basement entertainment den & 8-seat Dolby Atmos theatre",
      "Covered driveway parking for 3 executive cars",
    ],
    features: [
      "Private infinity splash pool with wooden sun deck",
      "Double-height entrance foyer with grand architectural staircase",
      "Integrated smart home automation (lighting, curtains, HVAC)",
      "High-security biometric access and perimeter surveillance",
    ],
    description:
      "An iconic trophy residence in DLF Phase 1, moments from Golf Course Road. Crafted for elevated entertaining and family luxury, featuring soaring double-height ceilings, a basement private cinema, manicured lawn, and bespoke architectural finishes.",
    image_url:
      "https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1400&q=80",
    images: [
      "https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1400&q=80",
    ],
    video_url: "",
    marketing_status: "published",
    published: 1,
  },
];

const listingCount = db.prepare("SELECT COUNT(*) c FROM listings").get().c;
if (listingCount === 0) {
  const ins = db.prepare(`
    INSERT INTO listings (
      title, location, property_type, listing_type, badge, price, specs_json,
      image_url, images_json, video_url, description, features_json,
      published, marketing_status, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  DEFAULT_LISTINGS.forEach((l, i) => {
    ins.run(
      l.title,
      l.location,
      l.property_type,
      l.listing_type,
      l.badge,
      l.price,
      JSON.stringify(l.specs),
      l.image_url,
      JSON.stringify(l.images),
      l.video_url,
      l.description,
      JSON.stringify(l.features),
      l.published,
      l.marketing_status,
      i
    );
  });
}

// Ensure listing 1 uses the real ad creative image
db.prepare(
  "UPDATE listings SET image_url = ?, images_json = ? WHERE id = 1"
).run(
  "/images/m3m-urbana-ad.jpg",
  JSON.stringify([
    "/images/m3m-urbana-ad.jpg",
    "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1519642918688-7e43b19245d8?auto=format&fit=crop&w=1400&q=80",
  ])
);

// Seed default email templates for Brevo marketing if empty
const campaignCount = db
  .prepare("SELECT COUNT(*) c FROM email_campaigns")
  .get().c;
if (campaignCount === 0) {
  const insCampaign = db.prepare(`
    INSERT INTO email_campaigns (title, subject, preheader, body, created_by)
    VALUES (?, ?, ?, ?, ?)
  `);

  insCampaign.run(
    "High-Footfall Commercial Retail at M3M Urbana",
    "Commercial Investment Alert: Ground Floor Retail at M3M Urbana, Gurugram",
    "Double-height corner showroom with high pedestrian footfall and strong rental yields",
    `Dear {{First_Name}},

For clients seeking solid capital growth and robust rental yields in Gurugram, we have secured an exceptional commercial asset at M3M Urbana (Sector 67, Golf Course Extension Road).

Investment Overview:
• 666 sq. ft. super area on the primary pedestrian boulevard
• Ground floor, two-side open corner frontage
• Part of Gurugram's most active open-air high street retail ecosystem
• Estimated gross rental yield: 6.8% – 7.5% per annum

Commercial units of this configuration on the ground level rarely come to market. 

To receive the comprehensive asset dossier or coordinate a site inspection, reply directly to this email or call +91 98103 33886.

Best regards,
Providers Real Estate Advisory Team`,
    "Charul"
  );

  insCampaign.run(
    "Exclusive Off-Market Luxury Builder Floor in GK-1",
    "Private Off-Market Briefing: Park-Facing 3 BHK in Greater Kailash I",
    "Rare direct park-facing floor with stilt parking & Italian marble",
    `Dear {{First_Name}},

We are pleased to share a discreet, off-market acquisition opportunity in one of South Delhi's most sought-after enclaves — Greater Kailash I.

Property Highlights:
• 1,850 sq. ft. built-up area overlooking lush park greenery
• 3 Ensuite Bedrooms with walk-in wardrobes & powder room
• Fully fitted German modular kitchen with built-in appliances
• Italian marble flooring & VRV climate control
• Schindler passenger elevator & dedicated double stilt parking

Price: ₹ 4.85 Cr (Strictly on private request)

This floor has not been listed on public portals and is currently open for private viewings this week.

Would you be available for a 20-minute private walkthrough this Thursday or Saturday?

Warm regards,
Vipul Agnihotri
Principal Advisor | Providers Real Estate`,
    "Charul"
  );
}

/* ---------- team accounts ---------- */
const DEFAULT_TEAM_PASSWORD =
  process.env.TEAM_DEFAULT_PASSWORD || "Providers@123";
const TEAM_ACCOUNTS = [
  { username: "charul", name: "Charul", role: "admin" },
  { username: "vipul", name: "Vipul Agnihotri", role: "admin" },
  { username: "rohan", name: "Rohan Agnihotri", role: "viewer" },
];

const upsertTeamUser = db.prepare(`
  INSERT OR IGNORE INTO users (username, name, pass_hash, role) VALUES (?, ?, ?, ?)
`);
for (const acct of TEAM_ACCOUNTS) {
  upsertTeamUser.run(
    acct.username,
    acct.name,
    hashPassword(DEFAULT_TEAM_PASSWORD),
    acct.role
  );
}
db.prepare(
  `UPDATE users SET role = 'admin' WHERE username IN ('charul', 'vipul')`
).run();
db.prepare(`UPDATE users SET role = 'viewer' WHERE username = 'rohan'`).run();

/* ---------- auth middleware ---------- */
function currentUser(req) {
  const token = parseCookies(req).session;
  if (!token) return null;
  return (
    db
      .prepare(
        `SELECT u.id, u.username, u.name, u.pass_hash, u.role
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > ?`
      )
      .get(token, Date.now()) || null
  );
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user)
    return res.status(401).json({ ok: false, error: "Please sign in." });
  req.user = user;
  next();
}

function requireEditor(req, res, next) {
  if (req.user.role === "viewer") {
    return res
      .status(403)
      .json({ ok: false, error: "View-only access — cannot edit." });
  }
  next();
}

/* ---------- media upload setup ---------- */
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").slice(0, 12);
      cb(null, `${crypto.randomBytes(16).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB for high-res ad creatives & photos
});

/* ---------- page routes ---------- */
app.get("/login", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "login.html"));
});

/* ---------- auth API ---------- */
app.post("/api/login", (req, res) => {
  const username = String((req.body && req.body.username) || "")
    .trim()
    .toLowerCase();
  const password = String((req.body && req.body.password) || "");
  const user = db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username);
  if (!user || !verifyPassword(password, user.pass_hash)) {
    return res
      .status(401)
      .json({ ok: false, error: "Incorrect username or password." });
  }
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
  ).run(token, user.id, Date.now() + SESSION_DAYS * 86400000);
  res.setHeader(
    "Set-Cookie",
    `session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${
      SESSION_DAYS * 86400
    }`
  );
  res.json({ ok: true, user: { name: user.name, role: user.role } });
});

app.post("/api/logout", (req, res) => {
  const token = parseCookies(req).session;
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  res.setHeader(
    "Set-Cookie",
    "session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0"
  );
  res.json({ ok: true });
});

app.get("/api/admin/me", requireAuth, (req, res) => {
  res.json({
    ok: true,
    username: req.user.username,
    name: req.user.name,
    role: req.user.role,
    canEdit: req.user.role !== "viewer",
  });
});

/* ---------- public listings ---------- */
app.get("/api/listings", (req, res) => {
  const type = String(req.query.type || "all").toLowerCase();
  let rows = db
    .prepare(
      `SELECT * FROM listings WHERE published = 1 ORDER BY sort_order ASC, id DESC`
    )
    .all();
  if (type === "sale" || type === "rent") {
    rows = rows.filter((r) => r.listing_type === type);
  }
  res.json({ ok: true, listings: rows.map(rowToPublicListing) });
});

/* ---------- 100% FREE Built-in AI Real Estate Concierge ---------- */

/* Conversation-flow intent helpers (shared by the deterministic overrides
   and the fallback brain). These keep the client capture flow working even
   when the Gemini API key is missing, quota-exhausted or the call fails. */
const CHAT_AFFIRM_RX =
  /^(yes|yep|yeah|ya|haan|haan\s?ji|hanji|ok|okay|sure|please|pls|plz|kindly|why not|of course|certainly|definitely|absolutely|sounds good|sounds great|great|perfect|interested|book it|arrange it|do it|i would like that|i would love that|i'?d like that|i'?d love that)\b/i;
const CHAT_NEGATIVE_RX =
  /^(no|nope|nah|nahi|not now|no thanks|no thank you|not interested|maybe later|nothing as of now|nothing else)\b/i;
/* Offers the concierge makes that, when accepted, should start contact capture */
const CHAT_OFFER_RX =
  /(arrange|schedule|coordinate|inspection|site visit|private viewing|viewing|floor plans|consultation|callback|connect with you|reach out|note your (contact|number)|share matching options)/i;
/* If the guest's short answer already carries a property topic, it is not a
   pure yes ("please send villa details" is a request, not an affirmation). */
const CHAT_TOPIC_RX =
  /\b(villas?|floors?|shops?|retail|commercial|bhk|rent|lease|tenant|budget|crore|cr|lakh|lac|sector|colony|kailash|vihar|niketan|dlf|price|valuation|sell|selling|picture|photo)s?\b/i;
/* Detects an LLM reply that asks the guest for contact details, so the client
   can switch into structured lead-capture mode. */
const CHAT_ASK_CONTACT_RX =
  /(your name|good name|name and|10-digit|mobile number|phone number|best number|contact number|contact details|may i have your|kindly share your)/i;
const CHAT_LOCALITIES_RX =
  /(defence colony|defense colony|greater kailash|vasant vihar|vasant kunj|anand niketan|shanti niketan|west end|golf links|jor bagh|green park|hauz khas|safdarjung|pamposh enclave|geetanjali|chanakyapuri|new friends colony|friends colony|chittaranjan park|cr park|kalkaji|malviya nagar|golf course road|golf course extension|golf course extn|sohna road|sohna|dlf phase\s*\d|cyber city|sushant lok|south city|mg road|sector\s*\d+)/i;

function isAffirmativeAnswer(t) {
  const s = String(t || "").trim().toLowerCase();
  return s.length <= 30 && CHAT_AFFIRM_RX.test(s) && !CHAT_TOPIC_RX.test(s);
}
function isNegativeAnswer(t) {
  const s = String(t || "").trim().toLowerCase();
  return s.length <= 30 && CHAT_NEGATIVE_RX.test(s);
}
/* Strip [LISTING:id] markers and tidy punctuation left behind */
function cleanChatReply(s) {
  return String(s || "")
    .replace(/\[LISTING:\d+\]/g, "")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
const titleCase = (s) =>
  String(s).replace(/\b\w/g, (c) => c.toUpperCase());

function builtInRealEstateAI(messages, listings) {
  const lastUserMsg =
    messages.slice().reverse().find((m) => m.role === "user")?.content || "";
  const t = lastUserMsg.toLowerCase().trim();
  const turnCount = messages.filter((m) => m.role === "user").length;

  const shop =
    listings.find((l) => /m3m|urbana|retail/i.test(l.title + " " + l.location + " " + l.type)) ||
    listings[0];
  const floor =
    listings.find((l) => /floor|kailash|delhi/i.test(l.title + " " + l.location)) ||
    listings[1];
  const villa =
    listings.find((l) => /villa|dlf|pool/i.test(l.title + " " + l.location)) ||
    listings[2];

  // 0a. Guest accepted an earlier offer → begin discreet contact capture
  if (isAffirmativeAnswer(t)) {
    return {
      reply:
        "Wonderful. May I have your good name, and the best 10-digit mobile number or email for Vipul Agnihotri to coordinate with you discreetly?",
      recommendedListingIds: [],
      action: "start_capture",
    };
  }

  // 0b. Bare yes/ok with no property topic — guide instead of guessing
  if (/^(yes|yep|yeah|ya|haan|hanji|ok|okay|sure)\b/i.test(t) && t.length <= 12) {
    return {
      reply:
        "Lovely. Would you like me to walk you through our commercial retail at M3M Urbana, the South Delhi builder floors, or the DLF Phase 1 villa? I can also arrange a private consultation with Vipul Agnihotri.",
      recommendedListingIds: listings.slice(0, 3).map((l) => l.id),
    };
  }

  // 0c. Polite decline — never push
  if (isNegativeAnswer(t)) {
    return {
      reply:
        "Understood — no pressure at all. Please browse the curated portfolio at your leisure; I am here whenever you need listings, pricing guidance or a private consultation.",
      recommendedListingIds: [],
    };
  }

  // 0d. Gratitude / farewell
  if (
    /^(thanks|thank you|thank u|dhanyavad|shukriya|bye|goodbye|good night)\b/i.test(t) &&
    t.length <= 40
  ) {
    return {
      reply:
        "It has been a pleasure. Should you wish to view any property or need a valuation, Vipul Agnihotri is one message away on +91 98103 33886. Have a splendid day!",
      recommendedListingIds: [],
    };
  }

  // 1. Sell with us / valuation
  if (/\b(sell|selling|valuation|list my|market my)\b/.test(t)) {
    return {
      reply:
        "We would be honoured to represent your property. Providers offers discreet, white-glove representation across South Delhi and Gurugram, backed by a verified buyer network. May I have your name and the best 10-digit mobile for a confidential valuation by Vipul Agnihotri?",
      recommendedListingIds: [],
      action: "start_capture",
    };
  }

  // 2. Direct contact / callback / human advisor
  if (
    /\b(call|talk|human|agent|broker|vipul|phone|number|whatsapp|reach|contact|appointment|consultation|advisor)\b/.test(
      t
    )
  ) {
    return {
      reply:
        "You can reach our principal advisor Vipul Agnihotri directly on WhatsApp or phone at +91 98103 33886, or email vipulproviders@gmail.com. Would you like me to note your contact number for a callback within 24 hours?",
      recommendedListingIds: [],
    };
  }

  // 3. Commercial / Retail / M3M Urbana / High Footfall / Sector 67
  if (
    /\b(shop|shops|retail|commercial|store|showroom|m3m|urbana|sector ?67|666|footfall|yield|roi|investment)\b/.test(
      t
    )
  ) {
    return {
      reply:
        "For commercial investments, we feature a ground-floor corner retail shop at M3M Urbana (Sector 67, Gurugram). It spans 666 sq. ft. with two-side open visibility, high pedestrian footfall, and strong rental yield potential [LISTING:" +
        shop?.id +
        "]. Would you like to review the complete specifications or schedule a private viewing?",
      recommendedListingIds: shop ? [shop.id] : [],
    };
  }

  // 4. Builder floor / South Delhi / 3 BHK
  if (
    /\b(builder floor|floor|gk|greater kailash|south delhi|delhi|3 bhk|three bhk|park facing|balcony|apartment|flat)\b/.test(
      t
    )
  ) {
    return {
      reply:
        "In South Delhi, we have an exquisite 1,850 sq. ft. park-facing 3 BHK builder floor in Greater Kailash I with Schindler lift, double stilt parking, and Italian marble [LISTING:" +
        floor?.id +
        "]. Shall I coordinate with Vipul Agnihotri to arrange an inspection for you?",
      recommendedListingIds: floor ? [floor.id] : [],
    };
  }

  // 5. Luxury Villa / DLF / Private Pool / Bungalow / 4-5 BHK
  if (
    /\b(villa|bungalow|house|dlf|pool|luxury home|independent|lawn|4 bhk|5 bhk|theatre|cinema)\b/.test(
      t
    )
  ) {
    return {
      reply:
        "For independent luxury living, we present an ultra-luxury 5 BHK villa in DLF Phase 1, Gurugram with a private pool, manicured lawn, and Dolby Atmos cinema [LISTING:" +
        villa?.id +
        "]. Would you like to review the floor plans?",
      recommendedListingIds: villa ? [villa.id] : [],
    };
  }

  // 6. Locality mentioned → acknowledge the micro-market, then capture
  const locMatch = t.match(CHAT_LOCALITIES_RX);
  if (locMatch) {
    const loc = titleCase(locMatch[0]);
    const isGgn =
      /(golf course|sohna|dlf phase|cyber city|sushant lok|south city|mg road|sector\s*\d+)/i.test(
        locMatch[0]
      );
    const rec = isGgn ? villa : floor;
    return {
      reply:
        "Noted — " +
        loc +
        " is one of our core " +
        (isGgn ? "Gurugram" : "South Delhi") +
        " micro-markets, and we regularly have off-market and pre-market options there. The closest match in our current portfolio is the " +
        rec?.title +
        " in " +
        rec?.location +
        " [LISTING:" +
        rec?.id +
        "]. Kindly share your name and the best 10-digit mobile or email, and Vipul Agnihotri will send you matching options before they reach the market.",
      recommendedListingIds: rec ? [rec.id] : [],
      action: "start_capture",
    };
  }

  // 7. Budget inquiry (under 2 cr, 5 cr, 10 cr)
  if (/\b(budget|price|cost|how much|rate|crore|cr|lakh|lac)\b/.test(t)) {
    if (/(\b2\b|two|\b1\b|one|1\.5|1\.8)/.test(t)) {
      return {
        reply:
          "In the ₹ 1.5 Cr – ₹ 2.5 Cr bracket, our premier commercial asset is the Ground Floor Retail Showroom at M3M Urbana, Gurugram [LISTING:" +
          shop?.id +
          "].",
        recommendedListingIds: shop ? [shop.id] : [],
      };
    }
    if (/(\b4\b|four|\b5\b|five)/.test(t)) {
      return {
        reply:
          "In the ₹ 4 Cr – ₹ 6 Cr bracket, our flagship residential property is the Park-Facing 3 BHK Builder Floor in Greater Kailash I, South Delhi (₹ 4.85 Cr) [LISTING:" +
          floor?.id +
          "].",
        recommendedListingIds: floor ? [floor.id] : [],
      };
    }
    return {
      reply:
        "Our curated portfolio ranges from boutique commercial retail at M3M Urbana to prime South Delhi builder floors and DLF Phase 1 villas. All transactions are handled discreetly. Shall I arrange a consultation with Vipul Agnihotri?",
      recommendedListingIds: listings.slice(0, 2).map((l) => l.id),
    };
  }

  // 8. Rentals — strictly word-bounded ("please" no longer matches "lease"!)
  if (/\b(rent|rental|rentals|renting|leasing|lease|tenant)\b/.test(t)) {
    return {
      reply:
        "Our curated South Delhi and Gurugram luxury rental portfolio is releasing shortly. Kindly share your preferred locality and monthly budget, and I will note your requirement so our team can share pre-market options with you first.",
      recommendedListingIds: [],
    };
  }

  // 9. Find your fit / recommendations
  if (
    /(find your fit|match me|right (property|home|fit)|suggest.*(property|option|home)|which property suits)/.test(
      t
    )
  ) {
    return {
      reply:
        "With pleasure. Our Find Your Fit explorer on this page walks you through four quick questions — purpose, location, configuration and budget — and curates the portfolio to your profile. Alternatively, tell me your preferred locality and budget here, and I will shortlist for you personally.",
      recommendedListingIds: [],
    };
  }

  // 10. Pictures / Ad Listing questions
  if (
    /\b(picture|pictures|photo|photos|image|images|gallery|ad|ads|flyer|creative|creatives)\b/.test(
      t
    )
  ) {
    const first = shop || listings[0];
    return {
      reply:
        "You can click on any of our property cards to open the high-definition ad listing creative and complete picture gallery [LISTING:" +
        first?.id +
        "]. Tap on a card anytime to explore the photos.",
      recommendedListingIds: [first?.id].filter(Boolean),
    };
  }

  // Default — history-aware; NEVER repeat the welcome mid-conversation
  if (turnCount >= 2) {
    return {
      reply:
        "So I may curate precisely — which location (South Delhi or Gurugram) and budget range should I focus on? You may also ask me to arrange a private consultation with Vipul Agnihotri.",
      recommendedListingIds: [],
    };
  }
  return {
    reply:
      "Namaste! Providers Real Estate specializes in curated luxury homes and prime retail across South Delhi and Gurugram. How may I assist your property search today?",
    recommendedListingIds: listings.slice(0, 2).map((l) => l.id),
  };
}

// Optional Gemini API call if key is set
let geminiFailureLogged = false;
function warnGeminiOnce(msg) {
  if (geminiFailureLogged) return;
  geminiFailureLogged = true;
  console.warn(`[Gemini] ${msg} The built-in concierge brain takes over automatically.`);
}

async function geminiChatIfConfigured(messages, listings) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const catalog = listings.map((l) => ({
    id: l.id,
    title: l.title,
    location: l.location,
    type: l.type,
    status: l.status,
    price: l.price,
    specs: l.specs,
    badge: l.badge,
  }));

  const systemInstruction = `You are "Providers Concierge", the elite AI Real Estate Advisor for Providers Real Estate Pvt. Ltd. (Founder: Vipul Agnihotri).
Territory: South Delhi (Greater Kailash, Defence Colony, Vasant Vihar, Anand Niketan, Golf Links) and Gurugram (Golf Course Road, DLF Phase 1-5, Sector 67 / M3M Urbana, Sohna Road).
Tone: Luxurious, discreet, articulate, courteous. Mirror the guest's politeness and language (English or Hinglish). Maximum 2 to 3 sentences per reply.

Available live listings portfolio:
${JSON.stringify(catalog, null, 2)}

Direct Contacts:
- Vipul Agnihotri (Founder & Principal Consultant): +91 98103 33886 (Call/WhatsApp)
- Email: vipulproviders@gmail.com
- Instagram: @providersrealestate

Conversation rules (follow strictly):
1. READ THE FULL HISTORY. A short guest message such as "yes please", "defence colony" or "2 crore" is an ANSWER to your previous question, not a new topic. NEVER restart the conversation, NEVER repeat the welcome message, and NEVER repeat a recommendation you have already made.
2. If the guest affirms an offer you made (inspection, viewing, consultation, callback), thank them and ask for their name and 10-digit mobile number so the visit can be coordinated discreetly.
3. If the guest names a locality (e.g., Defence Colony, Greater Kailash, DLF Phase 1), acknowledge it by name as one of your core micro-markets, mention off-market and pre-market availability, recommend the closest listing from the portfolio with [LISTING:id], and ask for their name and 10-digit mobile.
4. When recommending a property, mention 1-2 key highlights and format its reference as [LISTING:id] so the UI renders an interactive card.
5. Pricing: quote the price only if it appears in the portfolio; for anything else say pricing is shared confidentially to protect negotiation leverage, and offer a private call with Vipul.
6. If the guest wants to sell or get a valuation, offer a confidential valuation and ask for their name and 10-digit mobile number.
7. DO NOT mention videos. Our listings feature ad creatives and photo galleries.
8. NEVER invent listings, localities inventory, or prices beyond the portfolio above.`;

  const contents = [
    { role: "user", parts: [{ text: systemInstruction }] },
    {
      role: "model",
      parts: [
        {
          text: "Understood. I am Providers Concierge, ready to guide clients with discretion and domain expertise.",
        },
      ],
    },
  ];

  for (const m of messages.slice(-10)) {
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "") }],
    });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(
    key
  )}`;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 350 },
      }),
    });
    if (!r.ok) {
      if (r.status === 400) {
        warnGeminiOnce(
          `HTTP 400 — the GEMINI_API_KEY in your .env looks invalid. Re-copy it from Google AI Studio (it should start with "AIza").`
        );
      } else if (r.status === 403) {
        warnGeminiOnce(`HTTP 403 — key rejected. Generate a fresh key in Google AI Studio.`);
      } else if (r.status === 429) {
        geminiFailureLogged = false; // quota resets — log again on the next burst
        warnGeminiOnce(`HTTP 429 — free-tier quota exhausted for now.`);
      } else {
        warnGeminiOnce(`HTTP ${r.status} from the Gemini endpoint.`);
      }
      return null;
    }
    const data = await r.json();
    const reply =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
    return reply.trim() || null;
  } catch (err) {
    warnGeminiOnce(
      `Could not reach the Gemini API (${err && err.cause ? err.cause.code || err.cause.message : err.message || "network error"}).`
    );
    return null;
  }
}

app.post("/api/chat", async (req, res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  if (!messages.length && req.body?.message) {
    messages.push({ role: "user", content: req.body.message });
  }

  const listings = db
    .prepare(
      `SELECT * FROM listings WHERE published = 1 ORDER BY sort_order ASC, id DESC`
    )
    .all()
    .map(rowToPublicListing);

  const lastUserMsg =
    messages.slice().reverse().find((m) => m.role === "user")?.content || "";
  const prevAssistantMsg =
    messages.slice().reverse().find((m) => m.role === "assistant")?.content ||
    "";

  /* Deterministic conversation-flow intents — these MUST work even if the
     LLM is down, so lead capture never breaks. */
  if (isAffirmativeAnswer(lastUserMsg) && CHAT_OFFER_RX.test(prevAssistantMsg)) {
    return res.json({
      ok: true,
      reply:
        "Wonderful. May I have your good name, and the best 10-digit mobile number or email for Vipul Agnihotri to coordinate with you discreetly?",
      recommendedListings: [],
      action: "start_capture",
    });
  }
  if (isNegativeAnswer(lastUserMsg)) {
    return res.json({
      ok: true,
      reply:
        "Understood — no pressure at all. Please browse the curated portfolio at your leisure; I am here whenever you need listings, pricing guidance or a private consultation.",
      recommendedListings: [],
      action: null,
    });
  }

  let replyText = await geminiChatIfConfigured(messages, listings);
  let recommendedListingIds = [];
  let action = null;

  if (replyText) {
    const matches = [...replyText.matchAll(/\[LISTING:(\d+)\]/g)];
    recommendedListingIds = [
      ...new Set(matches.map((m) => Number(m[1]))),
    ].filter(Boolean);
    replyText = cleanChatReply(replyText);
    // If the LLM reply asks for contact details, tell the client to open capture
    if (CHAT_ASK_CONTACT_RX.test(replyText)) action = "start_capture";
  } else {
    // 100% Free Built-in AI Real Estate Brain
    const fallback = builtInRealEstateAI(messages, listings);
    replyText = cleanChatReply(fallback.reply);
    recommendedListingIds = fallback.recommendedListingIds;
    action = fallback.action || null;
  }

  const recommendedListings = listings.filter((l) =>
    recommendedListingIds.includes(l.id)
  );

  res.json({
    ok: true,
    reply: replyText,
    recommendedListings,
    action,
  });
});

/* ---------- 100% FREE Built-in "Find Your Fit" (AI Property Matcher) ---------- */
function ruleBasedRecommend(answers, listings) {
  const want = String(answers.intent || "buy").toLowerCase();
  const area = String(answers.area || "any").toLowerCase();
  const kind = String(answers.propertyKind || "any").toLowerCase();
  const budget = String(answers.budget || "any").toLowerCase();

  let scored = listings.map((l) => {
    let score = 50; // base score

    // Intent match
    if (want.includes("retail") || want.includes("invest")) {
      if (l.type.toLowerCase().includes("retail") || l.type.toLowerCase().includes("commercial")) score += 25;
    }
    if (want.includes("buy") || want.includes("home")) {
      if (l.type.toLowerCase().includes("residential")) score += 20;
    }
    if (want.includes("rent") && l.status === "rent") score += 25;

    // Format match
    if (kind.includes("retail") && (l.type.toLowerCase().includes("retail") || l.type.toLowerCase().includes("commercial"))) score += 30;
    if (kind.includes("villa") && /villa/i.test(l.title)) score += 30;
    if (kind.includes("floor") && /floor/i.test(l.title)) score += 30;

    // Area match
    if (area.includes("delhi") && l.location.toLowerCase().includes("delhi")) score += 20;
    if (area.includes("guru") && /guru|ggn|gurgaon/i.test(l.location)) score += 20;
    if (area.includes("any")) score += 10;

    // Budget match
    if (budget.includes("retail") || budget.includes("1.5") || budget.includes("2")) {
      if (l.type.toLowerCase().includes("retail")) score += 20;
    }
    if (budget.includes("floor") || budget.includes("4") || budget.includes("5")) {
      if (/floor/i.test(l.title)) score += 20;
    }
    if (budget.includes("villa") || budget.includes("10")) {
      if (/villa/i.test(l.title)) score += 20;
    }

    return { listing: l, score: Math.min(score, 98) };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 2);

  const areas =
    area === "any"
      ? ["South Delhi (Greater Kailash, Def Col)", "Gurugram (Golf Course Rd, Sector 67)"]
      : area.includes("delhi")
      ? ["Greater Kailash 1 & 2", "Defence Colony", "Vasant Vihar"]
      : ["Sector 67 High Street", "Golf Course Road", "DLF Phase 1–5"];

  return {
    summary:
      top.length > 0
        ? "Based on your criteria, our AI matched these signature properties with an optimal strategic fit score."
        : "We are currently curating off-market options matching your exact criteria.",
    listingIds: top.map((p) => p.listing.id),
    listings: top.map((p) => p.listing),
    matchScores: top.map((p) => p.score),
    suggestedAreas: areas,
    tip: "You can click on the ad listing image to view high-resolution photos and detailed shop/floor specifications.",
  };
}

app.post("/api/explorer/recommend", async (req, res) => {
  const answers = req.body || {};
  const listings = db
    .prepare(
      `SELECT * FROM listings WHERE published = 1 ORDER BY sort_order ASC, id DESC`
    )
    .all()
    .map(rowToPublicListing);

  const result = ruleBasedRecommend(answers, listings);

  // Auto-log exploratory lead in CRM
  try {
    if (answers.name || answers.phone || answers.email) {
      db.prepare(
        `INSERT INTO leads (name, phone, email, interest, message, source)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        String(answers.name || "Explorer User").slice(0, 120),
        answers.phone ? digits(answers.phone) : "",
        String(answers.email || "").slice(0, 160),
        `AI Match: ${answers.propertyKind || "Property"} in ${answers.area || "Any"}`,
        `Quiz preferences: Intent=${answers.intent}, Type=${answers.propertyKind}, Area=${answers.area}, Budget=${answers.budget}`,
        "AI Explorer"
      );
    }
  } catch {
    /* ignore */
  }

  res.json({ ok: true, ...result });
});

/* ---------- admin: overview & stats ---------- */
app.get("/api/admin/stats", requireAuth, (req, res) => {
  const totalLeads = db.prepare("SELECT COUNT(*) c FROM leads").get().c;
  const monthLeads = db
    .prepare(
      `SELECT COUNT(*) c FROM leads
       WHERE created_at >= datetime('now','localtime','start of month')`
    )
    .get().c;

  const byStatus = {};
  for (const r of db
    .prepare("SELECT status, COUNT(*) c FROM leads GROUP BY status")
    .all()) {
    byStatus[r.status] = r.c;
  }

  const liveListings = db
    .prepare("SELECT COUNT(*) c FROM listings WHERE published = 1")
    .get().c;
  const totalListings = db
    .prepare("SELECT COUNT(*) c FROM listings")
    .get().c;

  const scheduledVisits = db
    .prepare(
      "SELECT COUNT(*) c FROM site_visits WHERE status = 'scheduled'"
    )
    .get().c;

  const totalCampaigns = db
    .prepare("SELECT COUNT(*) c FROM email_campaigns")
    .get().c;

  res.json({
    ok: true,
    total: totalLeads,
    month: monthLeads,
    byStatus,
    liveListings,
    totalListings,
    scheduledVisits,
    totalCampaigns,
  });
});

/* ---------- admin: leads CRM ---------- */
app.get("/api/admin/leads", requireAuth, (req, res) => {
  res.json({
    ok: true,
    leads: db.prepare("SELECT * FROM leads ORDER BY id DESC").all(),
  });
});

app.post("/api/admin/leads", requireAuth, requireEditor, (req, res) => {
  const b = req.body || {};
  if (!b.name && !b.phone && !b.email) {
    return res
      .status(400)
      .json({ ok: false, error: "Please provide a name, phone, or email." });
  }
  const r = db
    .prepare(
      `INSERT INTO leads (name, phone, email, interest, message, source, status, notes, assigned_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      String(b.name || "").trim().slice(0, 120),
      b.phone ? digits(b.phone) : "",
      String(b.email || "").trim().slice(0, 160),
      String(b.interest || "General").slice(0, 60),
      String(b.message || "").slice(0, 2000),
      String(b.source || "Manual Entry").slice(0, 40),
      LEAD_STATUSES.includes(b.status) ? b.status : "new",
      String(b.notes || "").slice(0, 2000),
      String(b.assigned_to || "Vipul").slice(0, 60)
    );

  logActivity(req.user, "lead", r.lastInsertRowid, "created_manually", {
    name: b.name,
  });
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.patch("/api/admin/leads/:id", requireAuth, requireEditor, (req, res) => {
  const lead = db
    .prepare("SELECT id FROM leads WHERE id = ?")
    .get(req.params.id);
  if (!lead)
    return res.status(404).json({ ok: false, error: "Lead not found." });

  const b = req.body || {};
  const fields = [];
  const vals = [];

  if (b.status !== undefined) {
    if (!LEAD_STATUSES.includes(b.status))
      return res.status(400).json({ ok: false, error: "Invalid status." });
    fields.push("status = ?");
    vals.push(b.status);
    logActivity(req.user, "lead", lead.id, "status_changed", {
      status: b.status,
    });
  }
  if (b.notes !== undefined) {
    fields.push("notes = ?");
    vals.push(String(b.notes).slice(0, 2000));
    logActivity(req.user, "lead", lead.id, "notes_updated", {});
  }
  if (b.assigned_to !== undefined) {
    fields.push("assigned_to = ?");
    vals.push(String(b.assigned_to).slice(0, 60));
  }
  if (b.interest !== undefined) {
    fields.push("interest = ?");
    vals.push(String(b.interest).slice(0, 60));
  }

  if (!fields.length)
    return res.status(400).json({ ok: false, error: "Nothing to update." });

  vals.push(lead.id);
  db.prepare(`UPDATE leads SET ${fields.join(", ")} WHERE id = ?`).run(...vals);
  res.json({ ok: true });
});

app.delete("/api/admin/leads/:id", requireAuth, requireEditor, (req, res) => {
  db.prepare("DELETE FROM leads WHERE id = ?").run(req.params.id);
  logActivity(req.user, "lead", Number(req.params.id), "deleted", {});
  res.json({ ok: true });
});

app.get("/api/admin/leads.csv", requireAuth, (req, res) => {
  const leads = db.prepare("SELECT * FROM leads ORDER BY id DESC").all();
  const csv = [
    "Date,Name,Phone,Email,Interest,Source,Status,Assigned To,Notes,Message",
    ...leads.map((l) =>
      [
        l.created_at,
        l.name,
        l.phone,
        l.email,
        l.interest,
        l.source,
        l.status,
        l.assigned_to,
        l.notes,
        l.message,
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    ),
  ].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="leads.csv"');
  res.send(csv);
});

app.get("/api/admin/listings.csv", requireAuth, (req, res) => {
  const listings = db
    .prepare("SELECT * FROM listings ORDER BY id ASC")
    .all();
  const csv = [
    "Added,Title,Location,Type,Transaction,Price,Website Status,Marketing Stage,Photos,Follow-up Date,Marketing Note",
    ...listings.map((l) => {
      let photos = 0;
      try {
        photos = JSON.parse(l.images_json || "[]").length;
      } catch {
        photos = 0;
      }
      return [
        l.created_at,
        l.title,
        l.location,
        l.property_type,
        l.listing_type,
        l.price,
        l.published ? "Live" : "Draft",
        l.marketing_status,
        photos,
        l.follow_up_at || "",
        l.marketing_note,
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",");
    }),
  ].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="listings.csv"');
  res.send(csv);
});

/* ---------- admin: listings & inventory ---------- */
app.get("/api/admin/listings", requireAuth, (req, res) => {
  const listings = db
    .prepare("SELECT * FROM listings ORDER BY sort_order ASC, id DESC")
    .all();
  res.json({ ok: true, listings });
});

app.post("/api/admin/listings", requireAuth, requireEditor, (req, res) => {
  const b = req.body || {};
  if (!String(b.title || "").trim()) {
    return res.status(400).json({ ok: false, error: "Title is required." });
  }

  const specs = Array.isArray(b.specs)
    ? b.specs
    : String(b.specs || "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

  const images = Array.isArray(b.images)
    ? b.images
    : String(b.images || "")
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);

  const features = Array.isArray(b.features)
    ? b.features
    : String(b.features || "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

  const mainImage = String(b.image_url || (images.length ? images[0] : "")).trim();
  const marketing = MARKETING_STAGES.includes(b.marketing_status)
    ? b.marketing_status
    : "needs ad";

  const published =
    b.published !== undefined
      ? b.published
        ? 1
        : 0
      : marketing === "published"
      ? 1
      : 0;

  const r = db
    .prepare(
      `INSERT INTO listings (
        title, location, property_type, listing_type, badge, price, specs_json,
        image_url, images_json, video_url, description, features_json,
        published, marketing_status, marketing_note, marketing_link,
        follow_up_at, follow_up_note, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      String(b.title).trim().slice(0, 200),
      String(b.location || "").slice(0, 160),
      String(b.property_type || "Residential").slice(0, 60),
      b.listing_type === "rent" ? "rent" : "sale",
      String(b.badge || "For Sale").slice(0, 60),
      String(b.price || "Price on request").slice(0, 80),
      JSON.stringify(specs),
      mainImage.slice(0, 500),
      JSON.stringify(images),
      "",
      String(b.description || "").slice(0, 5000),
      JSON.stringify(features),
      published,
      marketing,
      String(b.marketing_note || "").slice(0, 2000),
      String(b.marketing_link || "").slice(0, 500),
      b.follow_up_at || null,
      String(b.follow_up_note || "").slice(0, 500),
      Number(b.sort_order) || 0
    );

  logActivity(req.user, "listing", r.lastInsertRowid, "created", {
    title: b.title,
  });
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.patch("/api/admin/listings/:id", requireAuth, requireEditor, (req, res) => {
  const row = db
    .prepare("SELECT * FROM listings WHERE id = ?")
    .get(req.params.id);
  if (!row)
    return res.status(404).json({ ok: false, error: "Listing not found." });

  const b = req.body || {};
  const fields = [];
  const vals = [];
  const set = (col, val) => {
    fields.push(`${col} = ?`);
    vals.push(val);
  };

  if (b.title !== undefined) set("title", String(b.title).slice(0, 200));
  if (b.location !== undefined)
    set("location", String(b.location).slice(0, 160));
  if (b.property_type !== undefined)
    set("property_type", String(b.property_type).slice(0, 60));
  if (b.listing_type !== undefined)
    set("listing_type", b.listing_type === "rent" ? "rent" : "sale");
  if (b.badge !== undefined) set("badge", String(b.badge).slice(0, 60));
  if (b.price !== undefined) set("price", String(b.price).slice(0, 80));
  if (b.image_url !== undefined)
    set("image_url", String(b.image_url).slice(0, 500));
  if (b.description !== undefined)
    set("description", String(b.description).slice(0, 5000));

  if (b.images !== undefined) {
    const images = Array.isArray(b.images)
      ? b.images
      : String(b.images)
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean);
    set("images_json", JSON.stringify(images));
    if (!b.image_url && images.length) {
      set("image_url", images[0]);
    }
  }

  if (b.specs !== undefined) {
    const specs = Array.isArray(b.specs)
      ? b.specs
      : String(b.specs)
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
    set("specs_json", JSON.stringify(specs));
  }

  if (b.features !== undefined) {
    const features = Array.isArray(b.features)
      ? b.features
      : String(b.features)
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
    set("features_json", JSON.stringify(features));
  }

  if (b.published !== undefined) set("published", b.published ? 1 : 0);

  if (b.marketing_status !== undefined) {
    if (!MARKETING_STAGES.includes(b.marketing_status)) {
      return res.status(400).json({ ok: false, error: "Invalid stage." });
    }
    set("marketing_status", b.marketing_status);
    if (b.published === undefined) {
      set("published", b.marketing_status === "published" ? 1 : 0);
    }
  }

  if (b.marketing_note !== undefined)
    set("marketing_note", String(b.marketing_note).slice(0, 2000));
  if (b.marketing_link !== undefined)
    set("marketing_link", String(b.marketing_link).slice(0, 500));
  if (b.follow_up_at !== undefined) set("follow_up_at", b.follow_up_at || null);
  if (b.follow_up_note !== undefined)
    set("follow_up_note", String(b.follow_up_note).slice(0, 500));
  if (b.sort_order !== undefined) set("sort_order", Number(b.sort_order) || 0);

  if (!fields.length)
    return res.status(400).json({ ok: false, error: "Nothing to update." });

  fields.push(`updated_at = datetime('now','localtime')`);
  vals.push(row.id);
  db.prepare(`UPDATE listings SET ${fields.join(", ")} WHERE id = ?`).run(
    ...vals
  );
  logActivity(req.user, "listing", row.id, "updated", b);
  res.json({ ok: true });
});

app.delete("/api/admin/listings/:id", requireAuth, requireEditor, (req, res) => {
  const assets = db
    .prepare("SELECT stored_name FROM listing_assets WHERE listing_id = ?")
    .all(req.params.id);
  for (const a of assets) {
    try {
      fs.unlinkSync(path.join(UPLOAD_DIR, a.stored_name));
    } catch {
      /* ignore */
    }
  }
  db.prepare("DELETE FROM listing_assets WHERE listing_id = ?").run(
    req.params.id
  );
  db.prepare("DELETE FROM listings WHERE id = ?").run(req.params.id);
  logActivity(req.user, "listing", Number(req.params.id), "deleted", {});
  res.json({ ok: true });
});

/* ---------- admin: direct media upload ---------- */
app.post(
  "/api/admin/upload",
  requireAuth,
  requireEditor,
  upload.single("file"),
  (req, res) => {
    if (!req.file)
      return res.status(400).json({ ok: false, error: "No file uploaded." });
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({
      ok: true,
      url: fileUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });
  }
);

app.post(
  "/api/admin/upload-multiple",
  requireAuth,
  requireEditor,
  upload.array("files", 25),
  (req, res) => {
    if (!req.files || !req.files.length) {
      return res.status(400).json({ ok: false, error: "No files uploaded." });
    }
    const uploaded = req.files.map((f) => ({
      url: `/uploads/${f.filename}`,
      filename: f.filename,
      originalName: f.originalname,
      mimetype: f.mimetype,
      size: f.size,
    }));
    res.json({ ok: true, files: uploaded });
  }
);

/* ---------- admin: site visits scheduler ---------- */
app.get("/api/admin/site-visits", requireAuth, (req, res) => {
  const visits = db
    .prepare("SELECT * FROM site_visits ORDER BY visit_date ASC, id DESC")
    .all();
  res.json({ ok: true, visits });
});

app.post("/api/admin/site-visits", requireAuth, requireEditor, (req, res) => {
  const b = req.body || {};
  if (!b.client_name || !b.visit_date) {
    return res
      .status(400)
      .json({ ok: false, error: "Client name and visit date are required." });
  }

  const r = db
    .prepare(
      `INSERT INTO site_visits (client_name, client_phone, client_email, property_title, visit_date, visit_time, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      String(b.client_name).trim().slice(0, 120),
      b.client_phone ? digits(b.client_phone) : "",
      String(b.client_email || "").slice(0, 160),
      String(b.property_title || "").slice(0, 200),
      String(b.visit_date).slice(0, 20),
      String(b.visit_time || "11:00 AM").slice(0, 30),
      b.status || "scheduled",
      String(b.notes || "").slice(0, 2000)
    );

  logActivity(req.user, "visit", r.lastInsertRowid, "scheduled", {
    client: b.client_name,
    date: b.visit_date,
  });
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.patch(
  "/api/admin/site-visits/:id",
  requireAuth,
  requireEditor,
  (req, res) => {
    const b = req.body || {};
    const fields = [];
    const vals = [];
    const set = (col, val) => {
      fields.push(`${col} = ?`);
      vals.push(val);
    };

    if (b.status !== undefined) set("status", b.status);
    if (b.visit_date !== undefined) set("visit_date", b.visit_date);
    if (b.visit_time !== undefined) set("visit_time", b.visit_time);
    if (b.notes !== undefined) set("notes", b.notes);

    if (!fields.length)
      return res.status(400).json({ ok: false, error: "Nothing to update." });

    vals.push(req.params.id);
    db.prepare(`UPDATE site_visits SET ${fields.join(", ")} WHERE id = ?`).run(
      ...vals
    );
    res.json({ ok: true });
  }
);

app.delete(
  "/api/admin/site-visits/:id",
  requireAuth,
  requireEditor,
  (req, res) => {
    db.prepare("DELETE FROM site_visits WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  }
);

/* ---------- admin: email marketing campaigns (Brevo) ---------- */
app.get("/api/admin/email-campaigns", requireAuth, (req, res) => {
  const campaigns = db
    .prepare("SELECT * FROM email_campaigns ORDER BY id DESC")
    .all();
  res.json({ ok: true, campaigns });
});

app.post("/api/admin/email-campaigns", requireAuth, requireEditor, (req, res) => {
  const b = req.body || {};
  if (!b.subject || !b.body) {
    return res
      .status(400)
      .json({ ok: false, error: "Subject line and main body are required." });
  }

  const r = db
    .prepare(
      `INSERT INTO email_campaigns (title, subject, preheader, body, created_by)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      String(b.title || b.subject).slice(0, 160),
      String(b.subject).slice(0, 250),
      String(b.preheader || "").slice(0, 250),
      String(b.body || ""),
      req.user.name || "Charul"
    );

  logActivity(req.user, "email_campaign", r.lastInsertRowid, "saved", {
    title: b.title || b.subject,
  });
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.delete(
  "/api/admin/email-campaigns/:id",
  requireAuth,
  requireEditor,
  (req, res) => {
    db.prepare("DELETE FROM email_campaigns WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  }
);

/* ---------- admin: AI email copywriter (free Gemini tier) ---------- */
function geminiEmailIfConfigured({ brief, listing, tone }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const toneText =
    tone === "urgent"
      ? "Urgent investor-alert tone — scarcity and closing timelines, but never pushy or gimmicky."
      : tone === "warm"
      ? "Warm, relationship-first tone — like a trusted family advisor checking in."
      : "Discreet, exclusive, understated luxury tone — confident, no exclamation marks.";

  const listingBlock = listing
    ? `Feature this listing in the email:
Title: ${listing.title}
Location: ${listing.location}
Type: ${listing.type} (${listing.status})
Price display: ${listing.price}
Key specs: ${(listing.specs || []).join(" | ")}
Highlights: ${(listing.features || []).join(" | ")}
Description: ${listing.description}`
    : "No specific listing — write a general portfolio / relationship briefing email.";

  const system = `You are the senior copywriter for Providers Real Estate Pvt. Ltd., a discreet family-run luxury brokerage in South Delhi & Gurugram (Founder: Vipul Agnihotri, +91 98103 33886, vipulproviders@gmail.com, Instagram @providersrealestate). Motto: Trust · Value · Tomorrow. Tagline: "Invest today. Live tomorrow."

Audience: high-net-worth Indian families and investors. Write in polished Indian-English. Never invent facts, numbers, prices or deadlines that are not provided. Use "{{First_Name}}" as the salutation placeholder.

${toneText}

${listingBlock}

Brief from the team: ${brief || "Announce and present this property to our private client list, invite replies and site visits."}

Return STRICT JSON only (no markdown fences, no commentary) in exactly this shape:
{"subject": "...", "preheader": "...", "body": "..."}

Rules for the JSON:
- subject: under 65 characters, specific, no clickbait, no ALL CAPS words.
- preheader: 80-110 characters, complements the subject, inbox preview line.
- body: plain text (\\n for line breaks, blank line between paragraphs). 140-220 words. Structure: personalised opening line → 3-5 value bullets (lines starting with "• ") → a single clear call-to-action (reply, call, or private viewing) → sign-off "Warm regards,\\nVipul Agnihotri\\nPrincipal Advisor | Providers Real Estate\\n+91 98103 33886". Do NOT include the company footer, unsubscribe lines, or the subject inside the body.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(
    key
  )}`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: system }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 900 },
    }),
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data) return null;
      const raw =
        data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ||
        "";
      const cleaned = raw
        .trim()
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/, "")
        .trim();
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (!m) return null;
      try {
        const parsed = JSON.parse(m[0]);
        if (!parsed.subject || !parsed.body) return null;
        return {
          subject: String(parsed.subject).slice(0, 250),
          preheader: String(parsed.preheader || "").slice(0, 250),
          body: String(parsed.body),
        };
      } catch {
        return null;
      }
    })
    .catch(() => null);
}

app.post("/api/admin/ai-email", requireAuth, requireEditor, async (req, res) => {
  const { brief, listingId, tone } = req.body || {};

  let listing = null;
  if (listingId) {
    const row = db
      .prepare("SELECT * FROM listings WHERE id = ?")
      .get(listingId);
    if (row) listing = rowToPublicListing(row);
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(400).json({
      ok: false,
      error:
        "GEMINI_API_KEY is not set. Add GEMINI_API_KEY=your_key to the .env file in the project folder and restart the server.",
    });
  }

  const result = await geminiEmailIfConfigured({ brief, listing, tone });
  if (!result) {
    return res.status(502).json({
      ok: false,
      error:
        "Gemini did not return usable copy (quota or network). Please try again in a moment.",
    });
  }

  logActivity(req.user, "email_campaign", null, "ai_draft_generated", {
    listing: listing ? listing.title : "general",
    tone: tone || "discreet",
  });
  res.json({ ok: true, ...result });
});

/* ---------- admin: Brevo integration & direct email sending ---------- */
function getBrevoConfig() {
  let dbKey = "";
  let dbSender = "";
  let dbSenderName = "";
  try {
    dbKey = db.prepare("SELECT value FROM app_settings WHERE key = 'brevo_api_key'").get()?.value || "";
    dbSender = db.prepare("SELECT value FROM app_settings WHERE key = 'brevo_sender_email'").get()?.value || "";
    dbSenderName = db.prepare("SELECT value FROM app_settings WHERE key = 'brevo_sender_name'").get()?.value || "";
  } catch {
    /* fallback if table is not yet migrated */
  }

  const key = process.env.BREVO_API_KEY || dbKey || "";
  const senderEmail = process.env.BREVO_SENDER_EMAIL || dbSender || "vipulproviders@gmail.com";
  const senderName = process.env.BREVO_SENDER_NAME || dbSenderName || "Providers Real Estate";

  return { key, senderEmail, senderName };
}

app.get("/api/admin/brevo-status", requireAuth, (req, res) => {
  const { key, senderEmail, senderName } = getBrevoConfig();
  const configured = Boolean(key);
  const maskedKey = configured
    ? (key.length > 10 ? `${key.slice(0, 8)}••••••••${key.slice(-4)}` : "••••••••")
    : "";
  res.json({
    ok: true,
    configured,
    senderEmail,
    senderName,
    maskedKey,
  });
});

app.post("/api/admin/brevo-config", requireAuth, requireEditor, async (req, res) => {
  const { apiKey, senderEmail, senderName } = req.body || {};
  
  if (apiKey !== undefined && String(apiKey).trim()) {
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at) VALUES ('brevo_api_key', ?, datetime('now','localtime'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(String(apiKey).trim());
  }
  if (senderEmail !== undefined && String(senderEmail).trim()) {
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at) VALUES ('brevo_sender_email', ?, datetime('now','localtime'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(String(senderEmail).trim());
  }
  if (senderName !== undefined && String(senderName).trim()) {
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at) VALUES ('brevo_sender_name', ?, datetime('now','localtime'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(String(senderName).trim());
  }

  const cfg = getBrevoConfig();
  if (cfg.key) {
    try {
      const resp = await fetch("https://api.brevo.com/v3/account", {
        headers: { "api-key": cfg.key },
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        return res.status(400).json({
          ok: false,
          error: errData.message || "Brevo rejected this API key. Please check your key at brevo.com.",
        });
      }
      const acct = await resp.json();
      logActivity(req.user, "settings", null, "brevo_configured", { email: acct.email });
      return res.json({
        ok: true,
        message: `Successfully connected to Brevo account: ${acct.email}`,
        accountEmail: acct.email,
        senderEmail: cfg.senderEmail,
        senderName: cfg.senderName,
      });
    } catch (e) {
      return res.status(500).json({
        ok: false,
        error: "Network error connecting to Brevo: " + e.message,
      });
    }
  }

  res.json({ ok: true, message: "Configuration saved." });
});

app.post(
  "/api/admin/brevo/test-send",
  requireAuth,
  requireEditor,
  async (req, res) => {
    const { apiKey, recipientEmail, subject, htmlContent } = req.body || {};
    const cfg = getBrevoConfig();
    const key = apiKey || cfg.key;
    if (!key) {
      return res.status(400).json({
        ok: false,
        error:
          "Brevo API key is required. Paste it once in the field below or configure it in the dashboard.",
      });
    }

    const recipients = String(recipientEmail || "")
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (!recipients.length) {
      return res.status(400).json({
        ok: false,
        error: "Add at least one recipient email address.",
      });
    }
    const invalid = recipients.filter((e) => !isValidEmail(e));
    if (invalid.length) {
      return res.status(400).json({
        ok: false,
        error: `Invalid email address: ${invalid.join(", ")}`,
      });
    }

    try {
      const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": key,
        },
        body: JSON.stringify({
          sender: {
            name: cfg.senderName || "Providers Real Estate",
            email: cfg.senderEmail || "vipulproviders@gmail.com",
          },
          to: recipients.map((e) => ({ email: e })),
          subject: subject || "Providers Real Estate — Luxury Portfolio",
          htmlContent: htmlContent,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        return res.status(400).json({
          ok: false,
          error: data.message || "Failed to send email via Brevo.",
        });
      }
      logActivity(req.user, "email_campaign", null, "test_email_sent", {
        to: recipients.join(", "),
        subject: subject || "",
      });
      res.json({ ok: true, messageId: data.messageId, sentTo: recipients });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err.message || "Network error communicating with Brevo.",
      });
    }
  }
);

/* Direct Campaign Broadcast to Client Recipients via Brevo */
app.post(
  "/api/admin/brevo/send",
  requireAuth,
  requireEditor,
  async (req, res) => {
    const { recipients, subject, htmlContent, campaignTitle, apiKey } = req.body || {};
    const cfg = getBrevoConfig();
    const key = apiKey || cfg.key;

    if (!key) {
      return res.status(400).json({
        ok: false,
        error: "Brevo API key is not configured. Please configure your Brevo API key under 'Configure Brevo Key' first.",
      });
    }

    // Parse recipients list
    let rawList = [];
    if (Array.isArray(recipients)) {
      rawList = recipients.map((e) => String(e).trim()).filter(Boolean);
    } else {
      rawList = String(recipients || "")
        .split(/[\r\n,;]+/)
        .map((e) => e.trim())
        .filter(Boolean);
    }

    // Deduplicate
    const seen = new Set();
    const cleanRecipients = [];
    for (const email of rawList) {
      const lower = email.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        cleanRecipients.push(email);
      }
    }

    if (!cleanRecipients.length) {
      return res.status(400).json({
        ok: false,
        error: "Please enter at least one recipient email address.",
      });
    }

    const invalid = cleanRecipients.filter((e) => !isValidEmail(e));
    if (invalid.length) {
      return res.status(400).json({
        ok: false,
        error: `Invalid email address(es): ${invalid.slice(0, 5).join(", ")}${
          invalid.length > 5 ? ` and ${invalid.length - 5} more` : ""
        }`,
      });
    }

    if (!subject) {
      return res.status(400).json({ ok: false, error: "Subject line is required." });
    }
    if (!htmlContent) {
      return res.status(400).json({ ok: false, error: "Email body content is required." });
    }

    // Match client names from CRM leads for discrete personal salutations
    const allLeads = db
      .prepare("SELECT name, email FROM leads WHERE email IS NOT NULL AND email != ''")
      .all();
    const nameByEmail = new Map();
    for (const l of allLeads) {
      if (l.email && l.name) {
        nameByEmail.set(l.email.toLowerCase().trim(), l.name.trim());
      }
    }

    const results = {
      total: cleanRecipients.length,
      sent: 0,
      failed: [],
      messageIds: [],
    };

    const senderEmail = req.body.senderEmail || cfg.senderEmail || "vipulproviders@gmail.com";
    const senderName = req.body.senderName || cfg.senderName || "Providers Real Estate";

    // Send individual personalized emails so recipients never see each other's addresses
    const BATCH_SIZE = 5;
    for (let i = 0; i < cleanRecipients.length; i += BATCH_SIZE) {
      const chunk = cleanRecipients.slice(i, i + BATCH_SIZE);
      await Promise.all(
        chunk.map(async (email) => {
          const clientName = nameByEmail.get(email.toLowerCase()) || "";
          let customizedHtml = htmlContent;
          if (clientName) {
            const firstName = clientName.split(/\s+/)[0];
            customizedHtml = customizedHtml.replace(/\{\{First_Name\}\}/g, firstName);
          } else {
            customizedHtml = customizedHtml.replace(/\{\{First_Name\}\}/g, "Client");
          }

          try {
            const brevoResp = await fetch("https://api.brevo.com/v3/smtp/email", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "api-key": key,
              },
              body: JSON.stringify({
                sender: { name: senderName, email: senderEmail },
                to: [{ email, name: clientName || undefined }],
                subject: subject,
                htmlContent: customizedHtml,
              }),
            });

            const data = await brevoResp.json();
            if (brevoResp.ok) {
              results.sent++;
              if (data.messageId) results.messageIds.push(data.messageId);
            } else {
              results.failed.push({ email, error: data.message || "Failed to send" });
            }
          } catch (err) {
            results.failed.push({ email, error: err.message || "Network error" });
          }
        })
      );
    }

    logActivity(req.user, "email_campaign", null, "campaign_sent", {
      title: campaignTitle || subject,
      total: cleanRecipients.length,
      sent: results.sent,
      failed: results.failed.length,
    });

    return res.json({
      ok: results.sent > 0,
      total: results.total,
      sentCount: results.sent,
      failedCount: results.failed.length,
      failedList: results.failed,
      message:
        results.sent === results.total
          ? `🎉 Successfully sent email to all ${results.sent} recipient${results.sent === 1 ? "" : "s"} via Brevo!`
          : `Sent to ${results.sent} of ${results.total} recipients. (${results.failed.length} failed)`,
    });
  }
);

/* ---------- admin: reminders & activity ---------- */
app.get("/api/admin/reminders", requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, title, follow_up_at, follow_up_note, marketing_status
       FROM listings
       WHERE follow_up_at IS NOT NULL AND follow_up_at != ''
       ORDER BY follow_up_at ASC`
    )
    .all();
  res.json({ ok: true, reminders: rows });
});

app.get("/api/admin/activity", requireAuth, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 80, 200);
  const rows = db
    .prepare(`SELECT * FROM activity_log ORDER BY id DESC LIMIT ${limit}`)
    .all();
  res.json({ ok: true, activity: rows });
});

app.post("/api/admin/password", requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  if (!verifyPassword(String(current || ""), req.user.pass_hash)) {
    return res
      .status(400)
      .json({ ok: false, error: "Current password is incorrect." });
  }
  if (String(next || "").length < 8) {
    return res.status(400).json({
      ok: false,
      error: "New password must be at least 8 characters.",
    });
  }
  db.prepare("UPDATE users SET pass_hash = ? WHERE id = ?").run(
    hashPassword(next),
    req.user.id
  );
  res.json({ ok: true });
});

/* ---------- public: lead capture ---------- */
app.post("/api/leads", (req, res) => {
  const b = req.body || {};
  if (b.company) return res.json({ ok: true }); // honeypot
  if (!b.phone && !b.email) {
    return res
      .status(400)
      .json({ ok: false, error: "Phone or email is required." });
  }
  if (b.phone && !isValidPhone(b.phone)) {
    return res.status(400).json({
      ok: false,
      error: "Please enter a valid 10-digit Indian mobile number.",
    });
  }
  if (b.email && !isValidEmail(b.email)) {
    return res
      .status(400)
      .json({ ok: false, error: "Please enter a valid email address." });
  }

  const r = db
    .prepare(
      `INSERT INTO leads (name, phone, email, interest, message, source, status, assigned_to)
       VALUES (?, ?, ?, ?, ?, ?, 'new', 'Vipul')`
    )
    .run(
      (b.name || "").trim().slice(0, 120),
      b.phone ? digits(b.phone) : "",
      (b.email || "").trim().slice(0, 160),
      (b.interest || "General").slice(0, 60),
      (b.message || "").slice(0, 2000),
      (b.source || "website").slice(0, 40)
    );

  logActivity(null, "lead", r.lastInsertRowid, "submitted_online", {
    name: b.name,
    source: b.source,
  });

  res.json({ ok: true });
});

/* ---------- static files last ---------- */
app.use(express.static(PUBLIC_DIR));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Providers Real Estate → http://localhost:${PORT}`);
  console.log(`Site: /  ·  Login: /login or /login.html  ·  Dashboard: /admin`);
  console.log(
    `Team: ${TEAM_ACCOUNTS.map((a) => `${a.username} (${a.role})`).join(", ")}`
  );
  const key = process.env.GEMINI_API_KEY;
  if (key) {
    const looksValid = /^AIza[\w-]{20,}$/.test(key);
    console.log(
      `AI Concierge: Gemini API (gemini-2.0-flash) — key loaded${
        looksValid ? "" : " ⚠️ key format looks wrong (expected to start with AIza…)"
      }`
    );
  } else {
    console.log(
      `AI Concierge: Built-in brain (free, no key). To enable Gemini, create a .env file NEXT TO server.js containing: GEMINI_API_KEY=your_key`
    );
  }
});
