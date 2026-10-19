require("dotenv").config();
const path = require("node:path");

// Helper lokal: ambil listing aktif dari SQLite, dorong ke Worker /queue.
// Text-only dulu (tanpa upload R2) biar Phase 0 bisa jalan $0 tanpa storage.
// Template dipotong 500 char mengikuti limit Threads.

const ROOT = path.join(__dirname, "..");
const DB_FILE = path.join(ROOT, "data", "database.sqlite");

function args() {
  const out = { limit: 5, dryRun: false };
  for (const a of process.argv.slice(2)) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a.startsWith("--limit=")) out.limit = Number(a.split("=")[1]) || 5;
  }
  return out;
}

function buildText(r) {
  const price = Number(String(r.price || "0").replace(/[^0-9]/g, "")) || 0;
  const priceStr = price > 0 ? `Rp${price.toLocaleString("id-ID")}` : "Tanya harga";
  const loc = r.location ? ` | ${r.location}` : "";
  const base = `${r.title || "Untitled"} — ${priceStr}${loc}`;
  const desc = String(r.description || "").replace(/\s+/g, " ").trim().slice(0, 300);
  let text = desc ? `${base}\n\n${desc}` : base;
  if (text.length > 500) text = text.slice(0, 497) + "...";
  return text;
}

async function main() {
  const opt = args();
  const workerUrl = (process.env.THREADS_WORKER_URL || "").replace(/\/+$/, "");
  const secret = process.env.THREADS_PUBLISHER_SECRET || "";
  if (!workerUrl || !secret) {
    throw new Error("Isi THREADS_WORKER_URL dan THREADS_PUBLISHER_SECRET di .env dulu");
  }
  const Database = require("better-sqlite3");
  const db = new Database(DB_FILE, { readonly: true });
  const rows = db
    .prepare("SELECT * FROM listings WHERE isActive = 1 ORDER BY id DESC LIMIT ?")
    .all(opt.limit);
  db.close();
  if (!rows.length) {
    console.log("[THREADS] tidak ada listing aktif");
    return;
  }
  for (const r of rows) {
    const text = buildText(r);
    console.log(`\n[THREADS] local-${r.id} (${text.length} char):\n${text.slice(0, 200)}...`);
    if (opt.dryRun) continue;
    const res = await fetch(`${workerUrl}/queue`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ text }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`queue gagal: ${res.status} ${JSON.stringify(body)}`);
    console.log(`[THREADS] queued id=${body.id}`);
  }
  if (opt.dryRun) console.log("\n[THREADS] dry-run, tambah tanpa --dry-run untuk kirim beneran");
}

main().catch((e) => {
  console.error(`[THREADS] GAGAL: ${e.message}`);
  process.exit(1);
});
