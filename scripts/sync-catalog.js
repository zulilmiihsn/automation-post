require("dotenv").config();
const fs = require("fs-extra");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const DB_FILE = path.join(ROOT, "data", "database.sqlite");

function args() {
	const out = { push: false, uploadPhotos: false, limit: 0, out: "data/catalog.json" };
	for (const a of process.argv.slice(2)) {
		if (a === "--push") out.push = true;
		else if (a === "--upload-photos") out.uploadPhotos = true;
		else if (a.startsWith("--limit=")) out.limit = Number(a.split("=")[1]) || 0;
		else if (a.startsWith("--out=")) out.out = a.split("=")[1];
	}
	return out;
}

function parseJSON(v, fb) {
	try {
		const p = JSON.parse(v || "");
		return p ?? fb;
	} catch {
		return fb;
	}
}

function fileExists(rel) {
	try {
		const clean = String(rel || "").replace(/^[/\\]+/, "");
		if (!clean) return false;
		return fs.existsSync(path.join(ROOT, clean));
	} catch {
		return false;
	}
}

function mapRow(r) {
	const photos = parseJSON(r.photos, []);
	const attrs = parseJSON(r.attributes, {});
	const price = Number(String(r.price || "0").replace(/[^0-9]/g, "")) || 0;
	const allPhotos = Array.isArray(photos) ? photos.filter(Boolean) : [];
	const okPhotos = allPhotos.filter(fileExists);
	return {
		external_id: `local-${r.id}`,
		local_id: r.id,
		title: String(r.title || "Untitled").slice(0, 100),
		price,
		description: r.description || "",
		category: r.category || "",
		condition: r.condition || "",
		location: r.location || "",
		photos: okPhotos,
		cover: okPhotos[0] || null,
		photo_count: okPhotos.length,
		missing_photos: allPhotos.length - okPhotos.length,
		attributes: typeof attrs === "object" ? attrs : {},
		status: r.status || "pending",
		updated_at: new Date().toISOString(),
	};
}

async function main() {
	const opt = args();
	const Database = require("better-sqlite3");
	if (!fs.existsSync(DB_FILE)) throw new Error(`DB tidak ada: ${DB_FILE}`);
	const db = new Database(DB_FILE, { readonly: true });

	let rows = db
		.prepare("SELECT * FROM listings WHERE isActive = 1 ORDER BY id DESC")
		.all();
	if (opt.limit > 0) rows = rows.slice(0, opt.limit);
	const items = rows.map(mapRow);
	db.close();

	// Selalu tulis JSON lokal (fallback etalase statis)
	const outPath = path.isAbsolute(opt.out) ? opt.out : path.join(ROOT, opt.out);
	fs.ensureDirSync(path.dirname(outPath));
	fs.writeJsonSync(outPath, { count: items.length, synced_at: new Date().toISOString(), items }, { spaces: 1 });
	console.log(`[CATALOG] ${items.length} item -> ${path.relative(ROOT, outPath)}`);

	if (!opt.push) {
		console.log("[CATALOG] dry-run. Tambah --push untuk kirim ke Supabase.");
		console.log(JSON.stringify(items.slice(0, 2), null, 1).slice(0, 1500));
		return;
	}

	const url = process.env.SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_KEY;
	if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY kosong di .env");
	let supabase;
	try {
		supabase = require("@supabase/supabase-js").createClient(url, key);
	} catch {
		throw new Error("npm i @supabase/supabase-js dulu");
	}

	const table = process.env.SUPABASE_TABLE || "catalog_items";
	const bucket = process.env.SUPABASE_BUCKET || "catalog";

	// Upload foto opsional: /assets/xxx.jpg -> storage bucket
	for (const it of items) {
		if (!opt.uploadPhotos) break;
		const urls = [];
		for (const p of it.photos.slice(0, 10)) {
			const rel = String(p).replace(/^[/\\]+/, "");
			const full = path.join(ROOT, rel);
			if (!fs.existsSync(full)) continue;
			const dest = `${it.external_id}/${path.basename(full)}`;
			const buf = fs.readFileSync(full);
			const { error } = await supabase.storage.from(bucket).upload(dest, buf, { upsert: true, contentType: "image/jpeg" });
			if (error) {
				console.warn(`[CATALOG] upload gagal ${dest}: ${error.message}`);
				continue;
			}
			const { data } = supabase.storage.from(bucket).getPublicUrl(dest);
			if (data?.publicUrl) urls.push(data.publicUrl);
		}
		if (urls.length) it.photo_urls = urls;
	}

	const payload = items
		.filter((it) => it.photos.length > 0)
		.map(({ photos, ...rest }) => ({
			...rest,
			cover: rest.cover || photos[0] || null,
		}));
	const skipped = items.length - payload.length;
	if (skipped > 0) console.log(`[CATALOG] skip ${skipped} item tanpa foto (cover null)`);
	const { error } = await supabase.from(table).upsert(payload, { onConflict: "external_id" });
	if (error) throw new Error(`Supabase upsert gagal: ${error.message}`);
	console.log(`[CATALOG] push OK: ${payload.length} item -> ${table}`);
}

main().catch((e) => {
	console.error(`[CATALOG] GAGAL: ${e.message}`);
	process.exit(1);
});

/*
SQL Supabase (jalankan sekali di SQL Editor):

create table if not exists catalog_items (
  external_id text primary key,
  local_id int,
  title text,
  price bigint default 0,
  description text,
  category text,
  condition text,
  location text,
  photos text[] default '{}',
  photo_urls text[] default '{}',
  cover text,
  attributes jsonb default '{}',
  status text,
  updated_at timestamptz default now()
);
alter table catalog_items enable row level security;
create policy "public read" on catalog_items for select using (true);
*/
