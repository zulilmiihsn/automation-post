const path = require("node:path");
const fs = require("node:fs");
const BrowserManager = require("./src/core/browserManager");
const Logger = require("./src/utils/logger");

const logger = new Logger("REPLAY");

function parseArgs(argv) {
	const o = { file: "", account: "", headless: false, dry: false, timeout: 8000, vars: {}, feature: "", listingJson: "" };
	for (const a of argv.slice(2)) {
		if (a === "--headless") o.headless = true;
		else if (a === "--dry") o.dry = true;
		else if (a.startsWith("--account=")) o.account = a.substring(10);
		else if (a.startsWith("--feature=")) o.feature = a.substring(10);
		else if (a.startsWith("--listing=")) o.listingJson = a.substring(10);
		else if (a.startsWith("--timeout=")) o.timeout = Number(a.substring(10)) || 8000;
		else if (a.startsWith("--var=")) {
			const kv = a.substring(6).split("=");
			o.vars[kv[0]] = kv.slice(1).join("=");
		} else if (a.startsWith("--")) continue;
		else if (!o.file) o.file = a;
	}
	return o;
}

const { applyVarsToValue: applyVars, applyVarsToRecipe, filterByFeature, toListingVars, missingVars } = require("./src/services/recipeAdapter");

function toLocators(page, cands) {
	const out = [];
	for (const c of cands) {
		try {
			if (!c) continue;
			if (c.kind === "testid") out.push(page.getByTestId(c.value));
			else if (c.kind === "role") {
				out.push(c.name ? page.getByRole(c.role, { name: new RegExp(c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }) : page.getByRole(c.role));
			} else if (c.kind === "aria") out.push(page.locator(`[aria-label*="${String(c.value).replace(/"/g, "")}"]`));
			else if (c.kind === "placeholder") out.push(page.getByPlaceholder(c.value));
			else if (c.kind === "text") out.push(page.getByText(new RegExp(String(c.value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")));
			else if (c.kind === "css") out.push(page.locator(c.value));
		} catch (_e) {}
	}
	return out;
}

async function resolveVisible(locators, timeout) {
	for (const loc of locators) {
		try {
			const el = loc.first();
			if (await el.isVisible({ timeout: Math.min(3000, timeout) })) return el;
		} catch (_e) {}
	}
	return null;
}

async function run() {
	const args = parseArgs(process.argv);
	if (!args.file) {
		console.log(`Pakai: node replay_recording.js <resep.json> [--account=akun_1] [--headless] [--dry] [--var=k=v]`);
		process.exit(1);
	}
	const abs = path.isAbsolute(args.file) ? args.file : path.join(process.cwd(), args.file);
	const raw = JSON.parse(fs.readFileSync(abs, "utf8"));
	let vars = { ...args.vars };
	if (args.listingJson) {
		try {
			const listing = JSON.parse(fs.readFileSync(args.listingJson, "utf8"));
			vars = { ...toListingVars(listing), ...vars };
		} catch (_e) {}
	}
	const scoped = args.feature ? filterByFeature(raw, args.feature) : raw;
	const recipe = applyVarsToRecipe(scoped, vars);
	const steps = Array.isArray(recipe) ? recipe : recipe.steps || [];
	const miss = missingVars(scoped, vars);
	console.log(`[REPLAY] ${steps.length} langkah | fitur=${recipe.feature || args.feature || "?"} | dry=${args.dry}${miss.length ? ` | var kurang: ${miss.join(",")}` : ""}`);
	if (args.dry) {
		steps.forEach((s, i) => console.log(` ${i + 1}. ${s.aksi} [${s.primary?.kind || "?"}] ${(s.primary?.value || s.primary?.role || "").toString().slice(0, 60)}`));
		return;
	}
	const account = args.account || recipe.account || "akun_1";
	const profilePath = path.join(__dirname, "profiles", account);
	const browser = new BrowserManager({ accountName: `Replay-${account}`, userDataDir: profilePath });
	await browser.init({ headless: args.headless });
	const page = browser.page;
	const report = { file: abs, startedAt: new Date().toISOString(), ok: 0, fail: 0, details: [] };
	for (const s of steps) {
		const label = `#${s.seq || "?"} ${s.aksi}`;
		try {
			if (s.aksi === "buka") {
				await page.goto(s.url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
				report.ok++;
				report.details.push({ seq: s.seq, aksi: s.aksi, status: "ok" });
				continue;
			}
			if (s.aksi === "unduh-gambar") {
				const hd = applyVars(s.hdUrl || s.value || "", args.vars);
				if (!hd || !/^https?:/.test(hd)) throw new Error("hdUrl kosong / bukan http");
				const host = new URL(hd).hostname.toLowerCase();
				if (!host.endsWith(".fbcdn.net") && !host.endsWith(".fbsbx.com") && !host.includes("scontent")) {
					throw new Error("host gambar bukan CDN FB, skip aman");
				}
				const res = await page.request.get(hd, { timeout: 15000 }).catch(() => null);
				if (!res || !res.ok()) throw new Error(`unduh HTTP ${res ? res.status() : "gagal"}`);
				const buf = await res.body();
				if (!buf || buf.length < 5000) throw new Error("file terlalu kecil, bukan HD");
				const dir = path.join("assets", "downloads");
				fs.mkdirSync(dir, { recursive: true });
				const ext = (hd.match(/\.(jpg|jpeg|png|webp)(\?|$)/i) || ["", "jpg"])[1].toLowerCase();
				const file = path.join(dir, `replay_${Date.now()}_${s.seq || "x"}.${ext}`);
				fs.writeFileSync(file, buf);
				report.ok++;
				report.details.push({ seq: s.seq, aksi: s.aksi, status: "ok", file: path.relative(process.cwd(), file), bytes: buf.length });
				console.log(`[OK] ${label} -> ${path.relative(process.cwd(), file)} (${Math.round(buf.length / 1024)}KB)`);
				continue;
			}
			const cands = [s.primary, ...(s.fallbacks || [])];
			const locs = toLocators(page, cands);
			const el = await resolveVisible(locs, args.timeout);
			if (!el && s.aksi !== "gulir" && s.aksi !== "seret") throw new Error("locator tak terlihat (semua fallback gagal)");
			if (s.aksi === "klik" || s.aksi === "lihat-gambar" || s.aksi === "centang" || s.aksi === "hapus-centang") {
				if (s.aksi === "centang") await el.check({ force: true }).catch(() => el.click());
				else if (s.aksi === "hapus-centang") await el.uncheck({ force: true }).catch(() => el.click());
				else await el.click({ timeout: args.timeout });
				if ((s.aksi === "lihat-gambar") && s.hdUrl) {
					report.details.push({ seq: s.seq, aksi: s.aksi, status: "ok", hdUrl: s.hdUrl });
					console.log(`[OK] ${label} HD tercatat`);
					report.ok++;
					continue;
				}
			} else if (s.aksi === "isi" || s.aksi === "kombo-ketik") {
				const val = applyVars(s.value || "", args.vars);
				await el.fill(val, { timeout: args.timeout }).catch(() => page.keyboard.type(val));
				await new Promise((r) => setTimeout(r, 400));
				if (s.aksi === "kombo-ketik") await page.keyboard.press("Enter");
			} else if (s.aksi === "pilih") {
				await el.selectOption(applyVars(s.value || "", args.vars), { timeout: args.timeout });
			} else if (s.aksi === "enter") {
				await page.keyboard.press("Enter");
			} else if (s.aksi === "gulir") {
				await page.mouse.wheel(Number(s.dx || 0), Number(s.dy || 0));
			} else if (s.aksi === "seret") {
				const from = el || await resolveVisible(toLocators(page, [s.primary, ...(s.fallbacks || [])]), args.timeout);
				if (!from) throw new Error("titik seret tak terlihat");
				const box = await from.boundingBox().catch(() => null);
				const sx = box ? box.x + box.width / 2 : 400;
				const sy = box ? box.y + box.height / 2 : 300;
				await page.mouse.move(sx, sy);
				await page.mouse.down();
				await page.mouse.move(sx + Number(s.dx || 0), sy + Number(s.dy || 0), { steps: 12 });
				await page.mouse.up();
			} else if (s.aksi === "upload") {
				throw new Error("upload butuh file asli — isi via UI / tambah --var (skip aman)");
			} else {
				await el.click({ timeout: args.timeout });
			}
			report.ok++;
			report.details.push({ seq: s.seq, aksi: s.aksi, status: "ok" });
			console.log(`[OK] ${label}`);
		} catch (e) {
			report.fail++;
			report.details.push({ seq: s.seq, aksi: s.aksi, status: "fail", error: e.message });
			console.log(`[FAIL] ${label}: ${e.message}`);
			try {
				await page.screenshot({ path: path.join("assets/debug", `replay_fail_${Date.now()}.png`) });
			} catch (_e) {}
		}
		if (s.url && s.aksi !== "buka") {
			await new Promise((r) => setTimeout(r, 500));
		}
	}
	report.finishedAt = new Date().toISOString();
	const out = abs.replace(/\.json$/, ".report.json");
	fs.writeFileSync(out, JSON.stringify(report, null, 2));
	console.log(`[REPLAY] ok=${report.ok} fail=${report.fail} -> ${path.relative(process.cwd(), out)}`);
	await browser.close().catch(() => {});
	if (report.fail > 0) process.exit(2);
}

if (require.main === module) {
	run().catch((e) => {
		logger.error("Replay gagal", e);
		process.exit(1);
	});
}

module.exports = { parseArgs, toLocators, applyVars };
