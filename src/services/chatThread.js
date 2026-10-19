const escRx = (s) => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const BUBBLE_SELECTOR = 'div[role="presentation"], [data-testid="message-text"]';

const THREAD_ROW_JS = () => {
	const out = [];
	for (const el of Array.from(document.querySelectorAll('div[role="button"], a[role="link"]'))) {
		const t = (el.innerText || "").trim();
		if (!t || t.length < 10 || t.length > 300 || !/·/.test(t)) continue;
		if (/pesan belum dibaca|dalam \d+\s*km|telusuri|notifikasi|pengaturan/i.test(t)) continue;
		const lines = t.split("\n").map((l) => l.trim()).filter((l) => l && l !== "·");
		const buyer = (lines[0] || "").slice(0, 80);
		if (!buyer || buyer.length > 40 || /[:\d]{4,}/.test(buyer)) continue;
		const topicLine = lines.find((l) => /·/.test(l)) || "";
		const topic = topicLine.replace(/^·\s*/, "").slice(0, 80);
		if (!/(19|20)\d{2}\s+[A-Za-z]/.test(topic)) continue;
		const line = t.slice(0, 150);
		if (out.some((o) => o.line === line)) continue;
		out.push({ buyer, topic, line });
		if (out.length >= 15) break;
	}
	return out;
};

const BUBBLES_JS = ({ buyerFirst, myName }) => {
	const main = document.querySelector('[role="main"]');
	const rect = main ? main.getBoundingClientRect() : { left: 0, right: window.innerWidth };
	const els = Array.from(document.querySelectorAll('div[role="presentation"], [data-testid="message-text"]'));
	const out = [];
	for (const b of els) {
		const t = (b.innerText || b.textContent || "").trim();
		if (!t || t.length <= 1 || t.length >= 500) continue;
		if (/detail percakapan/i.test(t)) continue;
		if (/^(sen|sel|rab|kam|jum|sab|min)\b/i.test(t) && t.length < 30) continue;
		if (/^message sent$/i.test(t)) continue;
		if (/^(yes, are you interested\?|ketuk tanggapan|kirim tanggapan cepat)/i.test(t)) continue;
		const r = b.getBoundingClientRect();
		if (r.width === 0) continue;
		let named = "";
		let sentAt = "";
		let p = b;
		for (let d = 0; d < 5 && p; d++) {
			const a = (p.getAttribute && p.getAttribute("aria-label")) || "";
			const m = a.match(/(?:pukul|at)\s+([^,]+),\s*(.+?)\s*:/i);
			if (m) {
				named = m[2].toLowerCase();
				sentAt = m[1].trim().slice(0, 40);
				break;
			}
			p = p.parentElement;
		}
		let out2;
		if (named && buyerFirst && named.includes(buyerFirst)) out2 = false;
		else if (named && (named.includes("anda") || (myName && named.includes(myName)))) out2 = true;
		else if (b.closest('div[role="article"]')) out2 = false;
		else {
			const aria = (b.getAttribute("aria-label") || "").toLowerCase();
			if (buyerFirst && aria.includes(buyerFirst)) out2 = false;
			else if (myName && aria.includes(myName)) out2 = true;
			else out2 = (rect.right - r.right) < (r.left - rect.left);
		}
		const sys = /memulai obrolan|menamai grup|mengubah foto|bergabung facebook|menunggu tanggapan|membuat grup/i.test(t);
		out.push({ text: t, out: out2, sys, sentAt });
	}
	const seen = new Set();
	return out.filter((m) => {
		if (seen.has(m.text)) return false;
		seen.add(m.text);
		return true;
	}).slice(-30);
};

async function openThreadByBuyer(page, engine, thread, timeout = 5000) {
	const first = (thread.topic || "").split(" ").filter(Boolean)[0] || "";
	const locs = [
		page.locator('div[role="button"], a[role="link"]').filter({ hasText: new RegExp(escRx(thread.buyer) + ".*" + escRx(first), "i") }).first(),
		page.locator('div[role="button"], a[role="link"]').filter({ hasText: new RegExp(escRx(thread.buyer), "i") }).first(),
	];
	const delay = (ms) => new Promise((r) => setTimeout(r, ms));
	for (const loc of locs) {
		try {
			await loc.click({ timeout });
			await delay(3000);
			const box = page.locator('div[role="textbox"]').first();
			if (await box.isVisible().catch(() => false)) {
				const label = (await box.getAttribute("aria-label").catch(() => "")) || "";
				if (!thread.buyer || label.toLowerCase().includes(thread.buyer.split(" ")[0].toLowerCase())) return true;
			}
		} catch (_e) {}
	}
	return false;
}

async function sendTextToThread(page, engine, text) {
	const box = page.locator('div[role="textbox"]').first();
	if (!(await box.isVisible({ timeout: 5000 }).catch(() => false))) {
		throw new Error("Kotak chat tak terbuka.");
	}
	await box.focus();
	if (engine && engine.humanType) {
		await engine.humanType(box, text);
		await engine.delay(500, 1000);
	} else {
		await page.keyboard.type(text, { delay: 40 });
		await new Promise((r) => setTimeout(r, 800));
	}
	await page.keyboard.press("Enter");
	await new Promise((r) => setTimeout(r, 2500));
}

module.exports = { escRx, BUBBLE_SELECTOR, THREAD_ROW_JS, BUBBLES_JS, openThreadByBuyer, sendTextToThread };
