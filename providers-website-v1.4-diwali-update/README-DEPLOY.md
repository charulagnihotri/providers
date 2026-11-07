# 🚀 Providers Real Estate — Diwali Launch Guide
### GitHub → Supabase → Netlify, click by click. Total cost: ₹0.

Everything is already built and tested inside this folder. This guide takes
you from "files on my Mac" to "live website my clients can open on Diwali".

**What changed in this update (files to copy over your v1.4):**

| File | What it is |
|---|---|
| `server.js` | Rewritten for Supabase Postgres + Netlify |
| `db.js` | **NEW** — Postgres data layer |
| `seed.js` | Now works with Supabase |
| `package.json` | New dependencies (`pg`, `serverless-http`) |
| `netlify.toml` | **NEW** — Netlify configuration |
| `netlify/functions/api.js` | **NEW** — the serverless wrapper |
| `scripts/migrate-to-supabase.js` | **NEW** — moves your old data + photos |
| `.gitignore` | **NEW** — keeps secrets out of GitHub |
| `public/index.html` | 25+ years, Promise, founder note, closed wall, testimonials, Diwali card, SEO |
| `public/css/style.css` | Styles for all new sections + festive theme |
| `public/js/main.js` | ✏️ EDIT-ME facts block (your closed deals & testimonials) |
| `public/admin/admin.js` | Ad Studio photos now work from cloud storage |

> Copy these files into your existing `providers/providers` folder,
> replacing the old ones. Nothing else moved.

---

## STEP 0 — What you need (all free, 10 minutes)

Accounts (skip the ones you already have):
1. **GitHub** — github.com → Sign up
2. **Supabase** — supabase.com → Start your project (free plan)
3. **Netlify** — app.netlify.com → Sign up with GitHub (easiest)

---

## STEP 1 — Prepare Supabase (your free database)

1. Log in at **supabase.com** → click **New project**
2. Name: `providers` · pick a strong **database password** (SAVE IT — you
   will paste it in the connection string) · Region: **Mumbai (ap-south-1)**
3. Wait ~2 minutes for it to be ready.

**Get your connection string:**
4. Top bar → **Connect** (or the ⚙️ gear → Database)
5. Under **Connection string**, choose the **Transaction pooler** tab
6. Copy it. It looks like:
   `postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`
7. Replace `[YOUR-PASSWORD]` with the password from step 2.

**Create the photo bucket:**
8. Left sidebar → **Storage** → **New bucket**
9. Name: `uploads` · toggle **Public bucket** ON → Create.

**Get your API keys:**
10. ⚙️ Project Settings → **API**
11. Note down: **Project URL** (`https://xxxx.supabase.co`) and the
    **service_role** key (long `eyJ...` string). Keep the service_role key
    secret — never share or commit it.

**Put these in your local `.env`** (the file next to server.js — create it
if missing):

```
DATABASE_URL=postgresql://postgres.abcdefgh:YOUR-PASSWORD@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOi...your...service...role...key
GEMINI_API_KEY=AIza...your...gemini...key
```

---

## STEP 2 — Bring your old data over (optional but recommended)

If your current `data/leads.db` has real leads/listings you want to keep:

```bash
cd ~/Documents/providers/providers     # wherever your project lives
npm install
npm run migrate
```

You should see: `✔ Migration finished — N rows moved, N photos uploaded`.
Your leads, listings and photos are now in Supabase. (This is safe to run twice.)

If you'd rather start clean, skip this — the site auto-creates its tables and
seed data on first launch.

---

## STEP 3 — Put the project on GitHub

1. Go to **github.com** → click **+** (top-right) → **New repository**
2. Name: `providers-website` · keep it **Private** · **do not** tick "add a
   README" → **Create repository**
3. GitHub shows you commands. In your Terminal:

```bash
cd ~/Documents/providers/providers    # your project folder

git init
git add .
git commit -m "Providers Real Estate — Diwali release"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/providers-website.git
git push -u origin main
```

(First push will ask you to log in — use your browser or a Personal Access
Token; GitHub's website walks you through it.)

**The branch → merge flow (so you never break the live site again):**

```bash
git checkout -b release/diwali       # 1. create a working branch
# ...make any last edits, then:
git add .
git commit -m "Diwali content final"
git push -u origin release/diwali    # 2. push the branch
```

3. On GitHub, your repo will show a yellow banner: **"Compare & pull request"**
   → click it → write anything → **Create pull request**
4. Review the changes shown → click **Merge pull request** → **Confirm merge**
5. `main` now has the final Diwali version. ✅

---

## STEP 4 — Deploy on Netlify

1. Log in at **app.netlify.com** → **Add new site** → **Import an existing project**
2. Choose **GitHub** → authorise → pick `providers-website`
3. Netlify reads `netlify.toml` automatically. Settings should show:
   - Build command: anything (it's preconfigured)
   - Functions directory: `netlify/functions`
   - Publish directory: `public`
   Just click **Deploy site**.
4. While it deploys, set your secret keys:
   **Site configuration → Environment variables → Add a variable** — add these
   four (copy values from your `.env`):

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | your Transaction pooler string with the real password |
   | `SUPABASE_URL` | `https://xxxx.supabase.co` |
   | `SUPABASE_SERVICE_KEY` | the service_role key |
   | `GEMINI_API_KEY` | your Gemini key (powers the concierge + email writer) |

5. **Deploys → Trigger deploy → Deploy site** once more so the new keys load.
6. Netlify gives you a URL like `providers-website.netlify.app` — open it! 🎉

---

## STEP 5 — Rotate passwords (DO THIS before sharing the link)

The default `Providers@123` is public knowledge (it ships in the code), so:

1. Open `https://YOUR-SITE.netlify.app/login` → sign in as `charul` with the
   default password.
2. Top-right → **Personal Settings** → change the password to a strong one.
3. Repeat for `vipul` and `rohan` (log out, log in as each).
   *(Or from your computer: `npm run seed -- --password "StrongPass@123"` —
   but the dashboard way is easier.)*

---

## STEP 6 — Point your own domain (optional)

In Netlify: **Site configuration → Domains → Add a domain** → type your
domain (e.g. `providersrealestate.in`) → Netlify shows the DNS records to
set at your domain seller (GoDaddy/BigRock/etc. — usually two `ALIAS`/`A`
records or a `CNAME`). DNS can take a few hours. Netlify gives you **free
HTTPS** automatically.

Your old Netlify static site can be deleted or kept as a redirect — the new
site replaces it.

---

## STEP 7 — Launch-week checklist

- [ ] Site loads, listings show with *Representative · Off-Market* tags
- [ ] Edit `public/js/main.js` → **SITE_FACTS**: replace the SAMPLE closed
      deals & testimonials with real ones (or delete rows — sections hide
      themselves)
- [ ] Founder note wording — pick Option A, B or C in `index.html` (marked
      in a comment) or ask me to tweak it
- [ ] Send a test email from **Email Marketing** to your own Gmail
- [ ] Diwali theme window is set in `main.js` (`festive.start / end`) — it
      switches itself off on 16 Nov
- [ ] Optional: add Google Analytics (spot marked in `index.html` head)
- [ ] Change all three passwords (Step 5)

**Every time you edit anything later:** work on a branch → push → merge the
pull request → Netlify redeploys automatically in ~1 minute.

---

## Local development (running on your Mac)

```bash
cd providers/providers
npm install
npm start          # needs DATABASE_URL in .env (Step 1) — uses Supabase directly
```

## Troubleshooting

| Problem | Fix |
|---|---|
| "Database is not reachable" on Netlify | `DATABASE_URL` missing/wrong in Netlify env vars, or password has special chars — URL-encode `@` as `%40` etc. |
| Photos fail to upload | Photos must be under ~4 MB on Netlify (function limit). Resize big ones. |
| `supabase` project paused | Free projects pause after ~7 days with zero traffic — open the Supabase dashboard and click Restore. Site traffic keeps it awake. |
| Chatbot replies feel generic | That's the free built-in brain; with `GEMINI_API_KEY` set it's much sharper. |
| Netlify deploy fails at install | Make sure `package.json` from this update was committed (it lists `pg` + `serverless-http`). |
