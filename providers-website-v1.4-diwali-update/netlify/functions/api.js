/* ═══════════════════════════════════════════════════════════════
   Netlify Function — wraps the entire Express app in one handler.
   Every request to /api/* on your Netlify site lands here
   (see netlify.toml redirect), and the Express routes do the rest.

   On cold start it initialises the Supabase schema + seeds once.
   ═══════════════════════════════════════════════════════════════ */
const serverless = require("serverless-http");
const { app, initDb } = require("../../server");

let readyPromise = null;

function ensureReady() {
  if (!readyPromise) {
    readyPromise = initDb().catch((err) => {
      readyPromise = null; // allow retry on next invocation
      throw err;
    });
  }
  return readyPromise;
}

module.exports.handler = async (req, context) => {
  try {
    await ensureReady();
  } catch (err) {
    console.error("Database init failed:", err.message);
    return {
      statusCode: 503,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: "Database is not reachable. Check DATABASE_URL in Netlify environment variables.",
      }),
    };
  }
  const handler = serverless(app);
  return handler(req, context);
};
