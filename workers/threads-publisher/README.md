# Threads Publisher (Cloudflare free, $0)

Microservice terpisah dari automasi FB lokal. FB tetap jalan via Playwright lokal,
Threads jalan via official API dari Worker ini.

## 1. Setup sekali (5 menit)

```bash
cd workers/threads-publisher
npx wrangler d1 create threads-publisher
# copy database_id ke wrangler.toml
npx wrangler d1 migrations apply threads-publisher
npx wrangler r2 bucket create threads-media
npx wrangler secret put THREADS_APP_ID
npx wrangler secret put THREADS_APP_SECRET
npx wrangler secret put PUBLISHER_SECRET
npx wrangler deploy
```

## 2. Daftarkan ke Meta App Dashboard

1. Buat app + use case Threads API di `developers.facebook.com`.
2. Redirect URI isi persis: `https://threads-publisher.<subdomain>.workers.dev/auth/callback`
3. Scope: `threads_basic,threads_content_publish,threads_read_replies,threads_manage_replies,threads_manage_insights`.

## 3. Connect akun

Buka `https://<worker>/auth/start`, login Threads, approve.
Cek: `GET /` harus `connected: true`.

## 4. Antrekan dari lokal

```bash
# text-only dari listing aktif (max 500 char otomatis dipotong template)
node scripts/push-threads.js --limit=5 --dry-run
node scripts/push-threads.js --limit=5

# manual satu post + cek quota
# (ganti WORKER_URL dan PUBLISHER_SECRET di .env)
curl -X POST $WORKER_URL/queue -H "Authorization: Bearer $PUBLISHER_SECRET" \
  -H "Content-Type: application/json" -d '{"text":"Halo Threads!"}'
curl $WORKER_URL/quota -H "Authorization: Bearer $PUBLISHER_SECRET"
curl -X POST $WORKER_URL/publish-now -H "Authorization: Bearer $PUBLISHER_SECRET"
```

Cron bawaan (`*/15 * * * *` di wrangler.toml) publish 1 antrean per tick,
auto-refresh token kalau sisa < 7 hari, hormati limit 250 post/24 jam.

## Batasan free tier

* Workers 100k req/hari — cukup (limit Threads cuma 250 post/hari).
* D1 5GB + R2 10GB — khusus Threads saja, jangan jadi CDN katalog.
* Media harus URL publik. Untuk image: upload ke R2 (`npx wrangler r2 object put`)
  lalu kirim `image_url` publiknya di `/queue`. Text-only bisa langsung tanpa R2.
