const { db } = require("../services/database");

function safeJSON(v, fb) {
	try {
		const p = JSON.parse(v || "");
		return p ?? fb;
	} catch {
		return fb;
	}
}

// GET /api/catalog — etalase publik, field aman saja.
function getCatalog(req, res) {
	try {
		const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
		const rows = db
			.prepare("SELECT id, title, price, description, category, `condition`, location, photos, attributes, status FROM listings WHERE isActive = 1 ORDER BY id DESC LIMIT ?")
			.all(limit);
		const items = rows.map((r) => {
			const photos = safeJSON(r.photos, []);
			const list = Array.isArray(photos) ? photos.filter(Boolean) : [];
			return {
				id: r.id,
				title: r.title,
				price: Number(String(r.price || "0").replace(/[^0-9]/g, "")) || 0,
				description: r.description || "",
				category: r.category || "",
				condition: r.condition || "",
				location: r.location || "",
				photos: list,
				cover: list[0] || null,
				attributes: safeJSON(r.attributes, {}),
				status: r.status || "pending",
			};
		});
		res.set("Cache-Control", "public, max-age=60");
		return res.json({ count: items.length, items });
	} catch (e) {
		return res.status(500).json({ error: e.message });
	}
}

module.exports = { getCatalog };
