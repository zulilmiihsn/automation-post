const path = require("node:path");
const fs = require("node:fs");
const BrowserManager = require("./src/core/browserManager");
const Logger = require("./src/utils/logger");

const logger = new Logger("RECORDER");

const FEATURES = ["marketplace", "feed", "share", "comment", "chat", "scrape", "generic"];

function parseArgs(argv) {
	const out = { account: "akun_1", feature: "generic", featureGiven: false, outFile: "", auto: false, help: false, ask: false };
	for (const a of argv.slice(2)) {
		if (a === "--help" || a === "-h") out.help = true;
		else if (a === "--auto") out.auto = true;
		else if (a === "--ask") out.ask = true;
		else if (a.startsWith("--feature=")) {
			out.feature = a.split("=")[1] || "generic";
			out.featureGiven = true;
		} else if (a.startsWith("--out=")) out.outFile = a.substring(6);
		else if (a.startsWith("--")) continue;
		else if (out.account === "akun_1" && !a.startsWith("-")) out.account = a;
	}
	if (!FEATURES.includes(out.feature)) {
		out.feature = "generic";
		out.featureGiven = false;
	}
	return out;
}

async function askFeatureInteractive() {
	const rl = require("node:readline").createInterface({ input: process.stdin, output: process.stdout });
	const menu = FEATURES.map((f, i) => `  ${i + 1}. ${f}`).join("\n");
	const ans = await new Promise((res) => rl.question(`Pilih fitur automation:\n${menu}\nNomor [7=generic]: `, res));
	rl.close();
	const n = parseInt(String(ans).trim(), 10);
	if (n >= 1 && n <= FEATURES.length) return FEATURES[n - 1];
	return "generic";
}

function pickHdUrl(src, srcset) {
	try {
		return require("./src/utils/hdImage").pickHdUrl(src, srcset);
	} catch (_e) {
		return src || "";
	}
}

function printHelp() {
	console.log(`Unified Recorder — 1 script rekam automation anti-rapuh
Pakai:
  node custom_recorder.js [akun_1] [--feature=marketplace] [--ask] [--auto] [--out=path] [--help]
Fitur: ${FEATURES.join(", ")}
Mode:
  default      : tahan ALT + klik/seret untuk rekam; isi/ketik/pilih/upload/gulir terekam otomatis
  --auto       : klik juga terekam otomatis tanpa ALT (berisik, untuk flow cepat)
  --ask        : tanya pilih fitur via menu bila --feature tak diberi
Gambar: klik gambar besar = lihat-gambar + hdUrl; ALT+D hover = unduh-gambar
Seret: tahan-klik geser >12px = seret dx/dy; gulir roda = gulir dx/dy; bingkai iframe dicatat
Output: assets/recordings/rec_<feature>_<timestamp>.json + rec_latest.json
Aturan locator: role/aria/testid/teks/placeholder dulu. Class x... tidak pernah disimpan.
Contoh:
  node custom_recorder.js akun_1 --feature=marketplace
  node custom_recorder.js akun_1 --ask
  node custom_recorder.js akun_1 --feature=feed --auto`);
}

function toPlaywrightCode(step) {
	const p = step.primary;
	if (!p) return `// langkah ${step.seq} tanpa locator valid`;
	if (step.aksi === "lihat-gambar" || step.aksi === "unduh-gambar") {
		const hd = step.hdUrl ? ` // HD: ${String(step.hdUrl).slice(0, 90)}` : "";
		if (step.aksi === "unduh-gambar") return `// unduh HD via downloadImage(hdUrl)${hd}`;
		return `// klik gambar, HD tersedia di recipe.hdUrl${hd}`;
	}
	if (step.aksi === "isi-rahasia") {
		return `// RAHASIA dimask. Isi via env/secret saat replay, jangan hardcode.`;
	}
	if (step.aksi === "seret") {
		return `await page.mouse.move(0,0); // seret dx=${step.dx || 0} dy=${step.dy || 0} — replay presisi via replay_recording.js`;
	}
	if (step.aksi === "gulir") {
		return `await page.mouse.wheel(${step.dx || 0}, ${step.dy || 0});`;
	}
	if (p.kind === "role") {
		const safe = String(p.name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const base = safe
			? `page.getByRole('${p.role}', { name: /${safe}/i })`
			: `page.getByRole('${p.role}')`;
		if (step.aksi === "klik") return `await ${base}.click();`;
		if (step.aksi === "isi") return `await ${base}.fill('${String(step.value || "").replace(/'/g, "\\'")}');`;
		if (step.aksi === "pilih") return `await ${base}.selectOption('${String(step.value || "").replace(/'/g, "\\'")}');`;
		return `await ${base}.click();`;
	}
	if (p.kind === "testid") {
		const base = `page.getByTestId('${p.value}')`;
		if (step.aksi === "isi") return `await ${base}.fill('...');`;
		return `await ${base}.click();`;
	}
	if (p.kind === "aria") {
		const safe = String(p.value).replace(/"/g, '\\"');
		return `await page.locator('[aria-label="${safe}"]').first().click();`;
	}
	if (p.kind === "text") {
		const safe = String(p.value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return `await page.getByText(/${safe}/i).click();`;
	}
	if (p.kind === "placeholder") {
		return `await page.getByPlaceholder('${String(p.value).replace(/'/g, "\\'")}').fill('...');`;
	}
	if (step.aksi === "upload") {
		return `await page.locator('${p.value || "input[type=file]"}').first().setInputFiles(['foto1.jpg']); // ganti path asli`;
	}
	if (step.aksi === "kombo-ketik") {
		const safe = String(step.value || "").replace(/'/g, "\\'");
		if (p.kind === "role") {
			const nm = String(p.name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			return `await page.getByRole('${p.role}', { name: /${nm}/i }).fill('${safe}'); await page.keyboard.press('Enter');`;
		}
		return `// kombo-ketik '${safe}' lalu Enter`;
	}
	if (step.aksi === "enter") return `await page.keyboard.press('Enter');`;
	if (step.aksi === "centang" || step.aksi === "hapus-centang") return `// ${step.aksi}: klik via primary di atas`;
	return `await page.locator('${p.value}').first().click(); // cek manual, kandidat lemah`;
}

function injectScript() {
	// Dijalankan di dalam browser via addInitScript. Dilarang pakai closure luar.
	const fn = (opts) => {
		const autoClick = !!opts.auto;
		let activeEl = null;
		let inspectMode = false;
		let lastInput = 0;

		const isVolatileClass = (cls) => /^(x[a-z0-9]+|__fb|fb[a-z]*)$/i.test(cls) || /^x[a-z0-9]{5,}/i.test(cls);
		const stableAttrs = (node) => {
			const out = [];
			for (const a of Array.from(node.attributes || [])) {
				if (a.name === "style") continue;
				if (a.name === "class") {
					const kept = String(a.value).split(/\s+/).filter((c) => c && !isVolatileClass(c));
					if (kept.length === 0) continue;
					out.push(`class="${kept.join(" ")}[stable-only]"`);
					continue;
				}
				if (a.name === "id" && (/^[a-z0-9:_-]{15,}$/i.test(a.value) || /^x/i.test(a.value))) continue;
				if (["role", "aria-label", "data-testid", "data-test-id", "type", "name", "placeholder", "href"].includes(a.name)) {
					out.push(`${a.name}="${String(a.value).slice(0, 80)}"`);
				}
			}
			return out.join(" ");
		};
		const buildCandidates = (startEl) => {
			const list = [];
			let curr = startEl;
			for (let lvl = 0; lvl < 4 && curr; lvl++) {
				const role = curr.getAttribute && curr.getAttribute("role");
				const aria = curr.getAttribute && curr.getAttribute("aria-label");
				const testid = curr.getAttribute && (curr.getAttribute("data-testid") || curr.getAttribute("data-test-id"));
				const tag = (curr.tagName || "").toLowerCase();
				const text = ((curr.innerText || "").trim().split("\n")[0] || "").slice(0, 50);
				const placeholder = curr.getAttribute && curr.getAttribute("placeholder");
				const type = curr.getAttribute && curr.getAttribute("type");
				const nameA = curr.getAttribute && curr.getAttribute("name");
				if (testid) list.push({ kind: "testid", value: String(testid).slice(0, 80) });
				if (role && (aria || text)) list.push({ kind: "role", role: String(role).toLowerCase(), name: String(aria || text).slice(0, 50) });
				else if (role) list.push({ kind: "role", role: String(role).toLowerCase(), name: "" });
				if (aria) list.push({ kind: "aria", value: String(aria).slice(0, 80) });
				if (placeholder) list.push({ kind: "placeholder", value: String(placeholder).slice(0, 80) });
				if (text && text.length >= 2 && text.length < 50 && !/^\d+$/.test(text)) list.push({ kind: "text", value: text });
				if ((tag === "input" || tag === "textarea" || tag === "select") && type) {
					list.push({ kind: "css", value: `${tag}[type="${type}"]` });
				} else if ((tag === "input" || tag === "textarea" || tag === "select") && nameA && !/^x/i.test(nameA)) {
					list.push({ kind: "css", value: `${tag}[name="${String(nameA).slice(0, 40)}"]` });
				}
				curr = curr.parentElement;
			}
			const seen = new Set();
			return list.filter((c) => {
				const k = c.kind + ":" + (c.value || c.role + (c.name || ""));
				if (seen.has(k)) return false;
				seen.add(k);
				return true;
			}).slice(0, 5);
		};
		const hierarchy = (node) => {
			let dump = "";
			let ptr = node;
			for (let i = 0; i < 3 && ptr; i++) {
				const tagStr = "<" + (ptr.tagName || "?").toLowerCase() + (stableAttrs(ptr) ? " " + stableAttrs(ptr) : "") + ">";
				dump = "L" + i + ": " + tagStr + "\n" + dump;
				ptr = ptr.parentElement;
			}
			return dump;
		};
		const send = (payload) => {
			try {
				if (window.logStep) window.logStep(payload);
			} catch (_e) {}
		};

		document.addEventListener("keydown", (e) => {
			if (e.key === "Alt") {
				inspectMode = true;
				if (!document.getElementById("pw-inspect-style")) {
					const style = document.createElement("style");
					style.id = "pw-inspect-style";
					style.innerHTML = ".pw-hover-highlight{outline:3px solid #ff00ff !important;background:rgba(255,0,255,.2) !important;cursor:crosshair !important;}";
					if (document.documentElement) document.documentElement.appendChild(style);
				}
			}
		});
		document.addEventListener("keyup", (e) => {
			if (e.key === "Alt") {
				inspectMode = false;
				if (activeEl) {
					activeEl.classList.remove("pw-hover-highlight");
					activeEl = null;
				}
			}
		});
		document.addEventListener("mouseover", (e) => {
			if (!inspectMode && !autoClick) return;
			if (activeEl) activeEl.classList.remove("pw-hover-highlight");
			activeEl = e.target;
			try {
				activeEl.classList.add("pw-hover-highlight");
			} catch (_e) {}
		});
		const shouldRecordClick = () => autoClick || inspectMode;
		const pickHd = (img) => {
			try {
				if (!img) return { thumb: "", hd: "", w: 0, h: 0 };
				const src = img.currentSrc || img.src || "";
				const srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset") || "";
				let best = "";
				let bestW = -1;
				if (srcset) {
					for (const part of String(srcset).split(",")) {
						const m = part.trim().match(/^(https?:\S+)\s+(\d+)w$/);
						if (m && parseInt(m[2], 10) > bestW) {
							bestW = parseInt(m[2], 10);
							best = m[1];
						}
					}
				}
				const hd = best && /^https?:/.test(best) ? best : (/^https?:/.test(src) && !src.startsWith("blob:") && !src.startsWith("data:") ? src : "");
				return { thumb: String(src).slice(0, 300), hd: String(hd).slice(0, 500), w: img.naturalWidth || img.width || 0, h: img.naturalHeight || img.height || 0 };
			} catch (_e) {
				return { thumb: "", hd: "", w: 0, h: 0 };
			}
		};
		const findImage = (t) => {
			if (!t) return null;
			if (t.tagName === "IMG") return t;
			const img = t.querySelector && t.querySelector("img[src*=fbcdn], img[src*=scontent], img");
			if (img && img.offsetWidth > 80) return img;
			if (t.closest) {
				const p = t.closest('[role="dialog"], article, div[role="main"]');
				if (p) {
					const big = Array.from(p.querySelectorAll("img[src*=fbcdn], img[src*=scontent]")).find((i) => i.offsetWidth > 200);
					if (big) return big;
				}
			}
			return null;
		};
		const frameInfo = () => {
			try {
				const inFrame = window.self !== window.top;
				return { inFrame, frameUrl: location.href, topUrl: inFrame ? "" : location.href };
			} catch (_e) {
				return { inFrame: true, frameUrl: location.href, topUrl: "" };
			}
		};
		let dragStart = null;
		let lastScroll = 0;
		document.addEventListener("mousedown", (e) => {
			if (!shouldRecordClick()) return;
			if (e.button !== 0) return;
			dragStart = { x: e.clientX, y: e.clientY, t: Date.now(), candidates: buildCandidates(e.target), hierarchy: hierarchy(e.target), frame: frameInfo() };
		}, { capture: true });
		document.addEventListener("mouseup", (e) => {
			if (!dragStart) return;
			const dx = e.clientX - dragStart.x;
			const dy = e.clientY - dragStart.y;
			const dist = Math.hypot(dx, dy);
			const held = Date.now() - dragStart.t;
			const start = dragStart;
			dragStart = null;
			if (dist < 12 || held < 120) return; // klik biasa, bukan seret
			if (!shouldRecordClick()) return;
			send({ aksi: "seret", url: location.href, candidates: start.candidates, hierarchy: start.hierarchy, frame: start.frame, dx: Math.round(dx), dy: Math.round(dy), dist: Math.round(dist), toCandidates: buildCandidates(e.target) });
		}, { capture: true });
		document.addEventListener("wheel", (e) => {
			const now = Date.now();
			if (now - lastScroll < 1200) return; // hemat, 1 langkah per 1.2 dtk
			if (Math.abs(e.deltaY) < 60 && Math.abs(e.deltaX) < 60) return;
			lastScroll = now;
			const t = e.target;
			send({ aksi: "gulir", url: location.href, candidates: buildCandidates(t), hierarchy: hierarchy(t), frame: frameInfo(), dx: Math.round(e.deltaX), dy: Math.round(e.deltaY) });
		}, { capture: true, passive: true });
		document.addEventListener("click", (e) => {
			if (!shouldRecordClick()) return;
			const t = e.target;
			if (t && t.closest && t.closest("input, textarea, select")) return; // isi ditangani event input/change
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
			const candidates = buildCandidates(t);
			const img = findImage(t);
			const meta = img ? pickHd(img) : null;
			const isGallery = !!(img && img.offsetWidth > 200);
			send({ aksi: isGallery ? "lihat-gambar" : "klik", url: location.href, frame: frameInfo(), candidates, hierarchy: hierarchy(t), ...(meta && meta.hd ? { thumbUrl: meta.thumb, hdUrl: meta.hd, imgW: meta.w, imgH: meta.h } : {}) });
		}, { capture: true });
		document.addEventListener("keydown", (e) => {
			// ALT+D: rekam gambar hover sebagai unduh-gambar tanpa klik
			if (!(e.altKey && (e.key === "d" || e.key === "D"))) return;
			const t = activeEl || document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
			const img = findImage(t);
			if (!img) return;
			e.preventDefault();
			e.stopPropagation();
			const meta = pickHd(img);
			if (!meta.hd) return;
			send({ aksi: "unduh-gambar", url: location.href, candidates: buildCandidates(img), hierarchy: hierarchy(img), thumbUrl: meta.thumb, hdUrl: meta.hd, imgW: meta.w, imgH: meta.h });
		}, { capture: true });
		document.addEventListener("input", (e) => {
			const t = e.target;
			if (!t || !t.matches || !t.matches("input:not([type=password]):not([type=file]), textarea")) return;
			const now = Date.now();
			if (now - lastInput < 800) return; // debounce ketikan
			lastInput = now;
			// Jangan rekam rahasia: PIN / password / kode OTP selalu mask
			const secretHint = ((t.getAttribute && (t.getAttribute("aria-label") || "")) + " " + (t.placeholder || "") + " " + (t.name || "")).toLowerCase();
			const isSecret = (t.type === "password") || /pin|password|otp|kode.*verif|token/.test(secretHint);
			if (isSecret) {
				send({
					aksi: "isi-rahasia",
					url: location.href,
					candidates: buildCandidates(t),
					hierarchy: hierarchy(t),
					value: "***",
					varHint: "SECRET",
				});
				return;
			}
			const inCombo = !!(t.closest && t.closest('[role="combobox"], label[role="combobox"]'));
			send({
				aksi: inCombo ? "kombo-ketik" : "isi",
				url: location.href,
				candidates: buildCandidates(t),
				hierarchy: hierarchy(t),
				value: String(t.value || t.placeholder || "").slice(0, 200),
				varHint: t.placeholder || t.name || (inCombo ? "kombo" : "teks"),
			});
		}, { capture: true });
		document.addEventListener("change", (e) => {
			const t = e.target;
			if (!t || !t.matches) return;
			if (t.matches('input[type="file"]')) {
				const files = Array.from(t.files || []).map((f) => f.name).slice(0, 10);
				send({
					aksi: "upload",
					url: location.href,
					candidates: buildCandidates(t),
					hierarchy: hierarchy(t),
					value: `${files.length} file`,
					files,
					accept: t.getAttribute("accept") || "",
				});
			} else if (t.matches("select")) {
				const opt = t.selectedOptions && t.selectedOptions[0];
				send({
					aksi: "pilih",
					url: location.href,
					candidates: buildCandidates(t),
					hierarchy: hierarchy(t),
					value: String((opt && (opt.value || opt.text)) || t.value || "").slice(0, 200),
				});
			} else if (t.matches("input[type=checkbox], input[type=radio]")) {
				send({
					aksi: t.checked ? "centang" : "hapus-centang",
					url: location.href,
					candidates: buildCandidates(t),
					hierarchy: hierarchy(t),
				});
			}
		}, { capture: true });
		document.addEventListener("keydown", (e) => {
			if (e.key !== "Enter") return;
			const t = e.target;
			if (!t || !t.matches || !t.matches("input, textarea")) return;
			send({ aksi: "enter", url: location.href, candidates: buildCandidates(t), hierarchy: hierarchy(t) });
		}, { capture: true });
	};
	return { fn };
}

async function main() {
	const args = parseArgs(process.argv);
	if (args.help) {
		printHelp();
		process.exit(0);
	}
	if ((args.ask || !args.featureGiven) && process.stdin.isTTY && !process.env.CI) {
		if (args.ask || process.argv.length <= 3) {
			args.feature = await askFeatureInteractive();
		}
	}
	const profilePath = path.join(__dirname, "profiles", args.account);
	const outDir = path.join(__dirname, "assets/recordings");
	fs.mkdirSync(outDir, { recursive: true });
	const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	const outFile = args.outFile || path.join(outDir, `rec_${args.feature}_${stamp}.json`);
	const latestFile = path.join(outDir, "rec_latest.json");

	console.log(`[REC] Unified recorder untuk akun: ${args.account}`);
	console.log(`[REC] Fitur target: ${args.feature} | mode klik: ${args.auto ? "AUTO" : "ALT tahan"}`);
	console.log(`[REC] Merekam: klik / seret / gulir / lihat-gambar / unduh-gambar ALT+D / isi / kombo-ketik / pilih / upload / centang / enter / pindah URL`);
	console.log(`[REC] Output: ${path.relative(process.cwd(), outFile)}`);
	console.log(`[REC] Locator: role/aria/testid/teks/placeholder dulu. Class x... ditolak.`);
	console.log(`[REC] Tutup browser / Ctrl+C untuk selesai.\n`);

	const recipe = { feature: args.feature, account: args.account, startedAt: new Date().toISOString(), steps: [] };
	const save = () => {
		try {
			fs.writeFileSync(outFile, JSON.stringify(recipe, null, 2));
			fs.writeFileSync(latestFile, JSON.stringify(recipe, null, 2));
		} catch (_e) {}
	};

	const browser = new BrowserManager({ accountName: `Recorder-${args.account}`, userDataDir: profilePath });
	const cleanCandidates = (cands) =>
		(Array.isArray(cands) ? cands : []).filter(
			(c) => c && c && (c.value || c.role) && !/\.x[a-z0-9]{5,}/i.test(c.value || "") && !/x1n2onr6|__fb/i.test(c.value || ""),
		);

	const handleStep = (data) => {
		const clean = cleanCandidates(data.candidates);
		const primary = clean[0] || (Array.isArray(data.candidates) ? data.candidates[0] : null);
		if (!primary) {
			console.log("\n[REC] Langkah tanpa locator valid dilewati.");
			return;
		}
		const seq = recipe.steps.length + 1;
		const step = {
			seq,
			aksi: data.aksi || "klik",
			url: data.url || "",
			feature: args.feature,
			primary,
			fallbacks: clean.slice(1, 4),
			...(data.value !== undefined ? { value: data.value } : {}),
			...(data.varHint ? { varHint: data.varHint } : {}),
			...(data.files ? { files: data.files } : {}),
			...(data.accept ? { accept: data.accept } : {}),
			...(data.hdUrl ? { hdUrl: data.hdUrl } : {}),
			...(data.thumbUrl ? { thumbUrl: data.thumbUrl } : {}),
			...(data.imgW ? { imgW: data.imgW, imgH: data.imgH } : {}),
			...(data.dx !== undefined ? { dx: data.dx, dy: data.dy || 0 } : {}),
			...(data.dist ? { dist: data.dist } : {}),
			...(data.toCandidates ? { toCandidates: data.toCandidates.slice(0, 3) } : {}),
			...(data.frame && data.frame.inFrame ? { frame: data.frame } : {}),
			at: new Date().toISOString(),
		};
		recipe.steps.push(step);
		save();
		console.log(`\n[REC #${seq}] ${step.aksi} -> ${toPlaywrightCode(step)}`);
		if (step.hdUrl) console.log(`   HD: ${String(step.hdUrl).slice(0, 100)}${step.imgW ? ` (${step.imgW}x${step.imgH})` : ""}`);
		if (step.fallbacks.length > 0) {
			step.fallbacks.forEach((c, i) => console.log(`   fallback ${i + 2}. [${c.kind}] ${String(c.value || c.role + ":" + c.name).slice(0, 80)}`));
		}
	};

	let context;
	try {
		await browser.init({ headless: false });
		context = browser.context;
		if (!context) throw new Error("Browser context gagal init");
	} catch (e) {
		logger.error("Gagal buka browser", e);
		process.exit(1);
	}

	try {
		await context.exposeFunction("logStep", handleStep);
	} catch (_e) {}
	const { fn } = injectScript();
	try {
		await context.addInitScript(fn, { auto: args.auto });
	} catch (_e) {}
	// Halaman yang sudah terbuka sebelum addInitScript
	for (const p of context.pages()) {
		try {
			await p.evaluate((o) => {
				window.__REC_AUTO = o.auto;
			}, { auto: args.auto });
		} catch (_e) {}
	}
	// Rekam navigasi utama
	let lastUrl = "";
	try {
		const pages = context.pages();
		const first = pages.length > 0 ? pages[0] : await context.newPage();
		lastUrl = first.url();
		first.on("framenavigated", (frame) => {
			try {
				if (!frame.isMainFrame()) return;
				const url = frame.url();
				if (!url || url === lastUrl || url === "about:blank") return;
				if (/^chrome-|^about:/.test(url)) {
					lastUrl = url;
					return;
				}
				lastUrl = url;
				const seq = recipe.steps.length + 1;
				recipe.steps.push({ seq, aksi: "buka", url, feature: args.feature, at: new Date().toISOString() });
				save();
				console.log(`\n[REC #${seq}] buka -> await page.goto('${url}');`);
			} catch (_e) {}
		});
		await first.goto("https://www.facebook.com", { waitUntil: "domcontentloaded" }).catch(() => {});
	} catch (_e) {}

	async function shutdown(signal) {
		save();
		console.log(`\n[REC] ${signal}. Tersimpan ${recipe.steps.length} langkah -> ${path.relative(process.cwd(), outFile)}`);
		try {
			await browser.close();
		} catch (_e) {}
		process.exit(0);
	}
	process.on("SIGINT", () => shutdown("SIGINT"));
	process.on("SIGTERM", () => shutdown("SIGTERM"));
	// Tetap hidup sampai user tutup browser
	try {
		while (true) {
			await new Promise((r) => setTimeout(r, 1000));
			if (context.pages().length === 0) {
				await shutdown("BROWSER_CLOSED");
				break;
			}
		}
	} catch (_e) {}
}

if (require.main === module) {
	main();
}

module.exports = { parseArgs, toPlaywrightCode, pickHdUrl, FEATURES };
