/* Threads publisher on Cloudflare Workers (free tier).
 * Terpisah dari Express lokal yang localhost-only (src/web/app.js).
 * Tanggung jawab: OAuth callback, simpan long-lived token di D1,
 * antrean publish, cron tiap 15 menit, hormati limit 250 post/24 jam.
 */

const SCOPES = [
  "threads_basic",
  "threads_content_publish",
  "threads_read_replies",
  "threads_manage_replies",
  "threads_manage_insights",
].join(",");

const nowSec = () => Math.floor(Date.now() / 1000);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requirePublisherSecret(req, env) {
  const got = req.headers.get("authorization") || "";
  const want = `Bearer ${env.PUBLISHER_SECRET || ""}`;
  if (!env.PUBLISHER_SECRET || got !== want) {
    return json({ error: "unauthorized" }, 401);
  }
  return null;
}

async function getToken(env) {
  return env.DB.prepare("SELECT * FROM threads_tokens WHERE id = 1").first();
}

async function log(env, queueId, level, message) {
  try {
    await env.DB.prepare(
      "INSERT INTO threads_logs (queue_id, level, message, created_at) VALUES (?, ?, ?, ?)",
    )
      .bind(queueId, level, String(message).slice(0, 2000), nowSec())
      .run();
  } catch {
    /* non-critical */
  }
}

// POST https://graph.threads.net/oauth/access_token (code -> short 1 jam)
async function exchangeCodeForShort(env, code, redirectUri) {
  const body = new URLSearchParams({
    client_id: env.THREADS_APP_ID,
    client_secret: env.THREADS_APP_SECRET,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });
  const r = await fetch(`${env.THREADS_API_BASE}/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error(`short token gagal: ${r.status} ${await r.text()}`);
  return r.json(); // { access_token, user_id, ... }
}

// GET .../access_token?grant_type=th_exchange_token (short -> long 60 hari)
async function exchangeShortForLong(env, shortToken) {
  const u = new URL(`${env.THREADS_API_BASE}/access_token`);
  u.searchParams.set("grant_type", "th_exchange_token");
  u.searchParams.set("client_secret", env.THREADS_APP_SECRET);
  u.searchParams.set("access_token", shortToken);
  const r = await fetch(u);
  if (!r.ok) throw new Error(`long token gagal: ${r.status} ${await r.text()}`);
  return r.json(); // { access_token, expires_in, ... }
}

async function refreshLongToken(env, longToken) {
  const u = new URL(`${env.THREADS_API_BASE}/refresh_access_token`);
  u.searchParams.set("grant_type", "th_refresh_token");
  u.searchParams.set("access_token", longToken);
  const r = await fetch(u);
  if (!r.ok) throw new Error(`refresh gagal: ${r.status} ${await r.text()}`);
  return r.json();
}

async function ensureFreshToken(env) {
  const row = await getToken(env);
  if (!row) throw new Error("belum connect. Buka /auth/start dulu.");
  // Refresh proaktif kalau sisa < 7 hari.
  if (row.expires_at - nowSec() < 7 * 86400) {
    const refreshed = await refreshLongToken(env, row.long_token);
    const expiresAt = nowSec() + (refreshed.expires_in || 5184000);
    await env.DB.prepare(
      "UPDATE threads_tokens SET long_token = ?, expires_at = ?, updated_at = ? WHERE id = 1",
    )
      .bind(refreshed.access_token, expiresAt, nowSec())
      .run();
    return { ...row, long_token: refreshed.access_token, expires_at: expiresAt };
  }
  return row;
}

// Flow 2-step: POST /{user}/threads (container) -> POST /{user}/threads_publish
async function publishOne(env, item, tokenRow) {
  const base = env.THREADS_API_BASE;
  const params = new URLSearchParams({
    media_type: item.image_url ? "IMAGE" : "TEXT",
    access_token: tokenRow.long_token,
  });
  if (item.text) params.set("text", item.text);
  if (item.image_url) params.set("image_url", item.image_url);
  if (item.topic_tag) params.set("topic_tag", item.topic_tag);
  if (item.reply_control) params.set("reply_control", item.reply_control);

  const cRes = await fetch(`${base}/${tokenRow.threads_user_id}/threads?${params}`, {
    method: "POST",
  });
  const cBody = await cRes.json().catch(() => ({}));
  if (!cRes.ok || !cBody.id) {
    throw new Error(`container gagal: ${cRes.status} ${JSON.stringify(cBody).slice(0, 500)}`);
  }
  const p = new URLSearchParams({
    creation_id: cBody.id,
    access_token: tokenRow.long_token,
  });
  const pRes = await fetch(`${base}/${tokenRow.threads_user_id}/threads_publish?${p}`, {
    method: "POST",
  });
  const pBody = await pRes.json().catch(() => ({}));
  if (!pRes.ok || !pBody.id) {
    throw new Error(`publish gagal: ${pRes.status} ${JSON.stringify(pBody).slice(0, 500)}`);
  }
  return pBody.id;
}

async function processNext(env, limit = 1) {
  const results = [];
  const tokenRow = await ensureFreshToken(env);
  for (let i = 0; i < limit; i++) {
    const item = await env.DB.prepare(
      `SELECT * FROM threads_queue WHERE status = 'pending'
       AND (scheduled_for IS NULL OR scheduled_for <= ?)
       ORDER BY id ASC LIMIT 1`,
    )
      .bind(nowSec())
      .first();
    if (!item) break;
    await env.DB.prepare("UPDATE threads_queue SET attempts = attempts + 1 WHERE id = ?")
      .bind(item.id)
      .run();
    try {
      const postId = await publishOne(env, item, tokenRow);
      await env.DB.prepare(
        "UPDATE threads_queue SET status = 'published', threads_post_id = ?, published_at = ?, error = NULL WHERE id = ?",
      )
        .bind(postId, nowSec(), item.id)
        .run();
      await log(env, item.id, "info", `published ${postId}`);
      results.push({ id: item.id, status: "published", postId });
    } catch (e) {
      const msg = e.message || "unknown error";
      // 429 / rate limit: kembalikan ke pending biar dicoba cron berikutnya.
      const rateLimited = /429|rate|limit|429/i.test(msg);
      await env.DB.prepare(
        `UPDATE threads_queue SET status = ?, error = ? WHERE id = ?`,
      )
        .bind(rateLimited ? "pending" : "failed", msg.slice(0, 1000), item.id)
        .run();
      await log(env, item.id, "error", msg);
      results.push({ id: item.id, status: rateLimited ? "pending" : "failed", error: msg });
      if (rateLimited) break;
    }
    // Jeda 5 detik antar post biar sopan ke rate limit.
    await new Promise((r) => setTimeout(r, 5000));
  }
  return results;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const redirectUri = `${url.origin}/auth/callback`;

    if (url.pathname === "/" && req.method === "GET") {
      const token = await getToken(env).catch(() => null);
      const pending = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM threads_queue WHERE status = 'pending'",
      )
        .first()
        .catch(() => ({ n: -1 }));
      return json({
        ok: true,
        service: "threads-publisher",
        connected: !!token,
        expires_at: token?.expires_at || null,
        pending: pending?.n ?? -1,
      });
    }

    if (url.pathname === "/auth/start" && req.method === "GET") {
      const u = new URL(env.THREADS_OAUTH_AUTHORIZE);
      u.searchParams.set("client_id", env.THREADS_APP_ID);
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("scope", SCOPES);
      u.searchParams.set("response_type", "code");
      return Response.redirect(u.toString(), 302);
    }

    if (url.pathname === "/auth/callback" && req.method === "GET") {
      const code = url.searchParams.get("code");
      const err = url.searchParams.get("error");
      if (err) return json({ error: err }, 400);
      if (!code) return json({ error: "code kosong" }, 400);
      try {
        const short = await exchangeCodeForShort(env, code, redirectUri);
        const long = await exchangeShortForLong(env, short.access_token);
        await env.DB.prepare(
          `INSERT INTO threads_tokens (id, threads_user_id, long_token, expires_at, scopes, updated_at)
           VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
           threads_user_id = excluded.threads_user_id, long_token = excluded.long_token,
           expires_at = excluded.expires_at, scopes = excluded.scopes, updated_at = excluded.updated_at`,
        )
          .bind(
            String(short.user_id || short.threads_user_id || ""),
            long.access_token,
            nowSec() + (long.expires_in || 5184000),
            SCOPES,
            nowSec(),
          )
          .run();
        return json({ ok: true, user_id: String(short.user_id || "") });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    if (url.pathname === "/queue" && req.method === "POST") {
      const auth = requirePublisherSecret(req, env);
      if (auth) return auth;
      const body = await req.json().catch(() => ({}));
      const text = String(body.text || "").trim();
      if (!text) return json({ error: "text wajib" }, 400);
      if (text.length > 500) return json({ error: `text ${text.length}/500 char, kepanjangan` }, 400);
      const row = await env.DB.prepare(
        `INSERT INTO threads_queue (text, image_url, topic_tag, reply_control, scheduled_for, created_at)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      )
        .bind(
          text,
          body.image_url || null,
          body.topic_tag || null,
          body.reply_control || "everyone",
          body.scheduled_for || null,
          nowSec(),
        )
        .first();
      return json({ ok: true, id: row.id }, 201);
    }

    if (url.pathname === "/queue" && req.method === "GET") {
      const auth = requirePublisherSecret(req, env);
      if (auth) return auth;
      const status = url.searchParams.get("status") || "pending";
      const rows = await env.DB.prepare(
        "SELECT * FROM threads_queue WHERE status = ? ORDER BY id DESC LIMIT 50",
      )
        .bind(status)
        .all();
      return json({ items: rows.results || [] });
    }

    if (url.pathname === "/publish-now" && req.method === "POST") {
      const auth = requirePublisherSecret(req, env);
      if (auth) return auth;
      try {
        const results = await processNext(env, 1);
        return json({ ok: true, results });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    if (url.pathname === "/quota" && req.method === "GET") {
      const auth = requirePublisherSecret(req, env);
      if (auth) return auth;
      try {
        const tokenRow = await ensureFreshToken(env);
        const u = new URL(`${env.THREADS_API_BASE}/${tokenRow.threads_user_id}/threads_publishing_limit`);
        u.searchParams.set("access_token", tokenRow.long_token);
        const r = await fetch(u);
        return json(await r.json(), r.ok ? 200 : r.status);
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    return json({ error: "not found" }, 404);
  },

  // Cron Trigger gratis tiap 15 menit: publish 1 antrean + refresh token proaktif.
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      processNext(env, 1).catch((e) => log(env, null, "error", `cron: ${e.message}`)),
    );
  },
};
