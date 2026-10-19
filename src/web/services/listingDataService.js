const fs = require("fs-extra");
const path = require("node:path");
const Logger = require("../../utils/logger");
const { resolveAssetPath } = require("../../utils/assetFiles");
const { db } = require("./database");
const { initializeDatabase } = require("./databaseBootstrap");

const logger = new Logger("DB");
initializeDatabase(db);

class DataService {
	static async getListings() {
		const rows = db.prepare("SELECT * FROM listings").all();
		return rows.map((r) => ({
			...r,
			isActive: !!r.isActive,
			autoFeed: r.autoFeed !== undefined ? !!r.autoFeed : true,
			postMarketplace: r.postMarketplace !== undefined ? !!r.postMarketplace : true,
			existingPostUrl: r.existingPostUrl || "",
			photos: JSON.parse(r.photos || "[]"),
			attributes: JSON.parse(r.attributes || "{}"),
			photoUsage: JSON.parse(r.photoUsage || "{}"),
		}));
	}

	static async addListing(l, groupId = null) {
		const targetGroupId = groupId || l.groupId || null;
		const insert = db.prepare(
			`INSERT INTO listings (title, price, description, category, condition, availability, location, tags, sku, targetGroup, maxGroups, isActive, photoDir, photos, attributes, autoFeed, postMarketplace, existingPostUrl, photoUsage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		);

		// Fix photo paths before saving or if they are broken
		const normalizedPhotos = (l.photos || []).map((p) => {
			if (p.includes("scraped\\")) {
				return p.split("scraped\\")[1]
					? `assets/scraped/${p.split("scraped\\")[1]}`
					: p;
			}
			return p;
		});

		const safeStr = (v) => {
			if (v === null || v === undefined) return '';
			if (Array.isArray(v)) return v.join(', ');
			if (typeof v === 'object') return JSON.stringify(v);
			return String(v);
		};

		let listingId;
		db.transaction(() => {
			const result = insert.run(
				String(l.title || "Untitled").substring(0, 100),
				String(l.price || "0").replace(/[^0-9]/g, ""),
				safeStr(l.description),
				safeStr(l.category),
				safeStr(l.condition),
				safeStr(l.availability),
				safeStr(l.location),
				safeStr(l.tags),
				safeStr(l.sku),
				safeStr(l.targetGroup) || "berau",
				Number(l.maxGroups) || 20,
				l.isActive !== false ? 1 : 0,
				safeStr(l.photoDir),
				JSON.stringify(normalizedPhotos),
				JSON.stringify(l.attributes || {}),
				l.autoFeed !== false ? 1 : 0,
				l.postMarketplace !== false ? 1 : 0,
				safeStr(l.existingPostUrl),
				JSON.stringify(l.photoUsage || {})
			);
			listingId = result.lastInsertRowid;

			if (targetGroupId) {
				db.prepare(
					"INSERT OR IGNORE INTO app_group_listings (group_id, listing_id) VALUES (?, ?)"
				).run(Number(targetGroupId), listingId);
			}
		})();

		return listingId;
	}



	static async updateListingById(id, l) {
		const safeStr = (v) => {
			if (v === null || v === undefined) return '';
			if (Array.isArray(v)) return v.join(', ');
			if (typeof v === 'object') return JSON.stringify(v);
			return String(v);
		};
		db.prepare(`UPDATE listings SET
            title=?, price=?, description=?, category=?, condition=?,
            availability=?, location=?, tags=?, sku=?, targetGroup=?,
            maxGroups=?, isActive=?, photoDir=?, photos=?, attributes=?,
            autoFeed=?, postMarketplace=?, existingPostUrl=?, photoUsage=?
            WHERE id=?`).run(
			String(l.title || "Untitled").substring(0, 100),
			String(l.price || "0").replace(/[^0-9]/g, ""),
			safeStr(l.description),
			safeStr(l.category),
			safeStr(l.condition),
			safeStr(l.availability),
			safeStr(l.location),
			safeStr(l.tags),
			safeStr(l.sku),
			safeStr(l.targetGroup),
			Number(l.maxGroups) || 20,
			l.isActive !== false ? 1 : 0,
			safeStr(l.photoDir),
			JSON.stringify(l.photos || []),
			JSON.stringify(l.attributes || {}),
			l.autoFeed !== false ? 1 : 0,
			l.postMarketplace !== false ? 1 : 0,
			safeStr(l.existingPostUrl),
			JSON.stringify(l.photoUsage || {}),
			id,
		);
	}

	static async deleteListing(id) {
		const numId = Number(id);
		try {
			// Get listing photos before deletion
			const listing = db
				.prepare("SELECT photos FROM listings WHERE id = ?")
				.get(numId);
			if (listing?.photos) {
				let photos = [];
				try {
					const parsed = JSON.parse(listing.photos);
					photos = Array.isArray(parsed) ? parsed : [parsed];
				} catch {
					photos = typeof listing.photos === "string" ? [listing.photos] : [];
				}

				// Refcount: jangan hapus file fisik bila masih dipakai listing lain
				// (clone lama berbagi path foto sama persis dengan ori)
				let usedElsewhere = new Set();
				let usedBasenames = new Set();
				try {
					const others = db
						.prepare("SELECT photos FROM listings WHERE id != ?")
						.all(numId);
					for (const row of others) {
						try {
							const arr = JSON.parse(row.photos || "[]");
							const list = Array.isArray(arr) ? arr : [arr];
							for (const p of list) {
								if (!p) continue;
								usedElsewhere.add(p);
								usedBasenames.add(
									String(p).split("/").pop().split("\\").pop(),
								);
							}
						} catch {}
					}
				} catch {}

				// Gunakan map dan Promise.all agar hapus file berjalan paralel & asinkronus murni
				const deletePromises = photos.filter(Boolean).map(async (photoPath) => {
					const basename = String(photoPath).split("/").pop().split("\\").pop();
					if (usedElsewhere.has(photoPath) || usedBasenames.has(basename)) {
						console.log(`[CLEANUP] Skip hapus (dipakai listing lain): ${photoPath}`);
						return;
					}
					const fullPath = resolveAssetPath(String(photoPath));
					if (!fullPath) {
						console.warn(`[CLEANUP] Skip invalid image path: ${photoPath}`);
						return;
					}

					if (await fs.pathExists(fullPath)) {
						await fs.unlink(fullPath);
						console.log(`[CLEANUP] Berhasil hapus: ${relativePath}`);
					} else {
						console.log(`[CLEANUP] File tidak ditemukan (skip): ${fullPath}`);
					}
				});

				await Promise.all(deletePromises);
			}
		} catch (err) {
			console.warn(`[CLEANUP] Failed to delete some assets: ${err.message}`);
		}

		// Foreign key CASCADE will automatically delete rows in app_group_listings
		db.prepare("DELETE FROM listings WHERE id = ?").run(numId);
	}

	static trashListings(ids) {
		if (!Array.isArray(ids) || ids.length === 0) return { count: 0, trashIds: [] };
		const getRow = db.prepare("SELECT * FROM listings WHERE id = ?");
		const delRow = db.prepare("DELETE FROM listings WHERE id = ?");
		const delJunction = db.prepare("DELETE FROM app_group_listings WHERE listing_id = ?");
		const insTrash = db.prepare(
			"INSERT INTO deleted_listings (original_id, data) VALUES (?, ?)",
		);
		const trashIds = [];
		db.transaction(() => {
			for (const rawId of ids) {
				const numId = Number(rawId);
				if (!numId) continue;
				const row = getRow.get(numId);
				if (!row) continue;
				const res = insTrash.run(numId, JSON.stringify(row));
				trashIds.push(res.lastInsertRowid);
				try {
					delJunction.run(numId);
				} catch {}
				delRow.run(numId);
			}
		})();
		return { count: trashIds.length, trashIds };
	}

	static restoreTrash(trashIds) {
		if (!Array.isArray(trashIds) || trashIds.length === 0)
			return { count: 0, ids: [] };
		const getTrash = db.prepare("SELECT * FROM deleted_listings WHERE trash_id = ?");
		const delTrash = db.prepare("DELETE FROM deleted_listings WHERE trash_id = ?");
		const cols = [
			"title", "price", "description", "category", "condition",
			"availability", "location", "tags", "sku", "targetGroup",
			"maxGroups", "isActive", "photoDir", "photos", "attributes",
			"status", "last_posted", "autoFeed", "existingPostUrl",
			"postMarketplace", "photoUsage",
		];
		const ids = [];
		db.transaction(() => {
			for (const rawTid of trashIds) {
				const tid = Number(rawTid);
				if (!tid) continue;
				const t = getTrash.get(tid);
				if (!t) continue;
				let data = {};
				try {
					data = JSON.parse(t.data);
				} catch {
					continue;
				}
				const values = cols.map((c) => data[c] ?? null);
				const placeholders = cols.map(() => "?").join(",");
				const res = db
					.prepare(`INSERT INTO listings (${cols.join(",")}) VALUES (${placeholders})`)
					.run(...values);
				ids.push(res.lastInsertRowid);
				delTrash.run(tid);
			}
		})();
		return { count: ids.length, ids };
	}

	static purgeTrash(olderThanDays = 30) {
		const cutoff = new Date(Date.now() - olderThanDays * 86400000)
			.toISOString()
			.replace("T", " ")
			.split(".")[0];
		const old = db
			.prepare("SELECT trash_id, data FROM deleted_listings WHERE deleted_at < ?")
			.all(cutoff);
		let purged = 0;
		const delTrash = db.prepare("DELETE FROM deleted_listings WHERE trash_id = ?");
		db.transaction(() => {
			for (const t of old) {
				let data = {};
				try {
					data = JSON.parse(t.data);
				} catch {}
				let photos = [];
				try {
					const parsed = JSON.parse(data.photos || "[]");
					photos = Array.isArray(parsed) ? parsed : [parsed];
				} catch {}
				for (const p of photos.filter(Boolean)) {
					DataService.deletePhotoIfUnused(p);
				}
				delTrash.run(t.trash_id);
				purged++;
			}
		})();
		return { purged };
	}

	static listTrash(limit = 100) {
		const rows = db
			.prepare("SELECT trash_id, original_id, data, deleted_at FROM deleted_listings ORDER BY deleted_at DESC LIMIT ?")
			.all(Math.max(1, Math.min(500, Number(limit) || 100)));
		return rows.map((r) => {
			let data = {};
			try {
				data = JSON.parse(r.data);
			} catch {}
			let photos = [];
			try {
				const parsed = JSON.parse(data.photos || "[]");
				photos = Array.isArray(parsed) ? parsed : [parsed];
			} catch {}
			return {
				trash_id: r.trash_id,
				original_id: r.original_id,
				title: data.title || "(tanpa judul)",
				price: data.price || 0,
				photoCount: photos.filter(Boolean).length,
				firstPhoto: photos.filter(Boolean)[0] || null,
				deleted_at: r.deleted_at,
			};
		});
	}

	static deleteTrashPermanent(trashIds) {
		if (!Array.isArray(trashIds) || trashIds.length === 0) return { count: 0 };
		const getTrash = db.prepare("SELECT data FROM deleted_listings WHERE trash_id = ?");
		const delTrash = db.prepare("DELETE FROM deleted_listings WHERE trash_id = ?");
		let count = 0;
		db.transaction(() => {
			for (const rawTid of trashIds) {
				const tid = Number(rawTid);
				if (!tid) continue;
				const t = getTrash.get(tid);
				if (!t) continue;
				let data = {};
				try {
					data = JSON.parse(t.data);
				} catch {}
				let photos = [];
				try {
					const parsed = JSON.parse(data.photos || "[]");
					photos = Array.isArray(parsed) ? parsed : [parsed];
				} catch {}
				for (const p of photos.filter(Boolean)) {
					DataService.deletePhotoIfUnused(p);
				}
				delTrash.run(tid);
				count++;
			}
		})();
		return { count };
	}

	static listOrphanFiles() {
		const rows = db.prepare("SELECT photos FROM listings").all();
		const used = new Set();
		for (const row of rows) {
			try {
				const arr = JSON.parse(row.photos || "[]");
				for (const p of (Array.isArray(arr) ? arr : [arr]).filter(Boolean)) {
					used.add(String(p).split("/").pop().split("\\").pop());
				}
			} catch {}
		}
		const collect = (dir) => {
			try {
				return fs.readdirSync(dir).filter((f) => {
					try {
						return fs.statSync(path.join(dir, f)).isFile();
					} catch {
						return false;
					}
				});
			} catch {
				return [];
			}
		};
		const assetsDir = path.join(process.cwd(), "assets");
		const scrapedDir = path.join(assetsDir, "scraped");
		const orphans = [];
		for (const f of collect(assetsDir)) {
			if (!used.has(f)) orphans.push(`assets/${f}`);
		}
		for (const f of collect(scrapedDir)) {
			if (!used.has(f)) orphans.push(`assets/scraped/${f}`);
		}
		return { count: orphans.length, files: orphans.slice(0, 200) };
	}

	static cleanOrphanFiles(limit = 200) {
		const { files } = DataService.listOrphanFiles();
		const targets = files.slice(0, Math.max(1, Math.min(500, Number(limit) || 200)));
		let deleted = 0;
		for (const rel of targets) {
			try {
				const full = path.join(process.cwd(), rel);
				if (fs.existsSync(full)) {
					fs.removeSync(full);
					deleted++;
				}
			} catch {}
		}
		return { deleted, scanned: files.length };
	}

	static updateListingStatus(id, status) {
		return db.prepare(`
			UPDATE listings
			SET status = ?,
				last_posted = CASE
					WHEN ? = 'success' THEN CURRENT_TIMESTAMP
					ELSE last_posted
				END
			WHERE id = ?
		`).run(status, status, id);
	}

	static resetFailedListings() {
		return db.prepare(`
			UPDATE listings SET status = 'ready' WHERE status = 'failed'
		`).run();
	}

	static resetHangingListings() {
		// Bersihkan status 'posting' yang nyangkut biar UI bisa stop otomatis
		const stmt = db.prepare(
			"UPDATE listings SET status = 'ready' WHERE status = 'posting'",
		);
		return stmt.run();
	}

	static bulkUpdateListingsActive(isActive) {
		db.prepare("UPDATE listings SET isActive = ?").run(isActive ? 1 : 0);
		return true;
	}

	static bulkUpdateListingsFeed(autoFeed) {
		db.prepare("UPDATE listings SET autoFeed = ?").run(autoFeed ? 1 : 0);
		return true;
	}

	static async bulkUpdateListings(ids, updates) {
		if (!Array.isArray(ids) || ids.length === 0 || !updates || typeof updates !== "object") {
			return 0;
		}
		const allowedFields = [
			"title", "price", "description", "category", "condition",
			"availability", "location", "tags", "sku", "targetGroup",
			"maxGroups", "isActive", "photoDir", "photos", "attributes",
			"autoFeed", "postMarketplace", "existingPostUrl", "photoUsage"
		];

		const setClauses = [];
		const values = [];

		for (const [key, rawVal] of Object.entries(updates)) {
			if (!allowedFields.includes(key)) continue;

			if (key === "isActive" || key === "autoFeed" || key === "postMarketplace") {
				setClauses.push(`${key} = ?`);
				values.push(rawVal ? 1 : 0);
			} else if (key === "price") {
				setClauses.push("price = ?");
				values.push(String(rawVal || "0").replace(/[^0-9]/g, ""));
			} else if (key === "photos" || key === "attributes" || key === "photoUsage") {
				setClauses.push(`${key} = ?`);
				values.push(JSON.stringify(rawVal));
			} else if (key === "maxGroups") {
				setClauses.push("maxGroups = ?");
				values.push(Number(rawVal) || 20);
			} else {
				setClauses.push(`${key} = ?`);
				values.push(String(rawVal ?? ""));
			}
		}

		if (setClauses.length === 0) return 0;

		const placeholders = ids.map(() => "?").join(",");
		const sql = `UPDATE listings SET ${setClauses.join(", ")} WHERE id IN (${placeholders})`;
		const stmt = db.prepare(sql);
		const info = stmt.run(...values, ...ids.map(Number));
		return info.changes;
	}

	static async bulkDeleteListings(ids) {
		if (!Array.isArray(ids) || ids.length === 0) return 0;
		for (const id of ids) {
			await DataService.deleteListing(Number(id));
		}
		return ids.length;
	}

	static clearAllExistingPostUrls() {
		db.prepare("UPDATE listings SET existingPostUrl = ''").run();
		return true;
	}



	static deletePhotoIfUnused(photoPath) {
		if (!photoPath) return { deleted: false, reason: "empty" };
		const target = String(photoPath);
		const targetBase = target.split("/").pop().split("\\").pop();
		const rows = db.prepare("SELECT photos FROM listings").all();
		for (const row of rows) {
			try {
				const arr = JSON.parse(row.photos || "[]");
				const list = Array.isArray(arr) ? arr : [arr];
				for (const p of list.filter(Boolean)) {
					if (String(p) === target) return { deleted: false, reason: "used" };
					if (String(p).split("/").pop().split("\\").pop() === targetBase)
						return { deleted: false, reason: "used" };
				}
			} catch {}
		}
		const full = resolveAssetPath(target);
		if (!full) return { deleted: false, reason: "invalid-path" };
		try {
			if (fs.existsSync(full)) {
				fs.removeSync(full);
				return { deleted: true };
			}
			return { deleted: false, reason: "missing" };
		} catch (e) {
			return { deleted: false, reason: e.message };
		}
	}

	static getPhotoHealth() {		const rows = db.prepare("SELECT id, title, photos FROM listings").all();
		let totalRefs = 0;
		const missing = [];
		const usedBasenames = new Set();
		for (const r of rows) {
			let arr = [];
			try {
				const parsed = JSON.parse(r.photos || "[]");
				arr = Array.isArray(parsed) ? parsed : [parsed];
			} catch {
				arr = [];
			}
			for (const p of arr.filter(Boolean)) {
				totalRefs++;
				usedBasenames.add(String(p).split("/").pop().split("\\").pop());
				const rel = String(p).startsWith("/") ? String(p).substring(1) : String(p);
				const full = path.join(process.cwd(), rel);
				let exists = false;
				try {
					exists = fs.existsSync(full);
				} catch {
					exists = false;
				}
				if (!exists && missing.length < 100) {
					missing.push({ id: r.id, title: r.title, photo: p });
				}
			}
		}
		let diskAssets = 0;
		let diskScraped = 0;
		let orphanAssets = 0;
		try {
			const assetsDir = path.join(process.cwd(), "assets");
			const files = fs.readdirSync(assetsDir).filter((f) => {
				try {
					return fs.statSync(path.join(assetsDir, f)).isFile();
				} catch {
					return false;
				}
			});
			diskAssets = files.length;
			orphanAssets = files.filter((f) => !usedBasenames.has(f)).length;
		} catch {}
		try {
			const scrapedDir = path.join(process.cwd(), "assets", "scraped");
			const files = fs.readdirSync(scrapedDir).filter((f) => {
				try {
					return fs.statSync(path.join(scrapedDir, f)).isFile();
				} catch {
					return false;
				}
			});
			diskScraped = files.length;
			orphanAssets += 0;
			const orphanScraped = files.filter((f) => !usedBasenames.has(f)).length;
			return {
				totalRefs,
				missingCount: missing.length,
				missing,
				diskAssets,
				diskScraped,
				orphanAssets,
				orphanScraped,
			};
		} catch {
			return {
				totalRefs,
				missingCount: missing.length,
				missing,
				diskAssets,
				diskScraped,
				orphanAssets,
				orphanScraped: 0,
			};
		}
	}

	static cloneListingsToAppliance({ ids = [], targetGroupId = null, prefix = "[READY BERAU] ", stripBrands = true } = {}) {
		const brandRegex = /^(yamaha|honda|suzuki|kawasaki|vespa|piaggio|toyota|daihatsu|mitsubishi|nissan|isuzu|mazda|hyundai|wuling)\s+/i;

		let sourceListings = [];
		if (Array.isArray(ids) && ids.length > 0) {
			const placeholders = ids.map(() => "?").join(",");
			sourceListings = db.prepare(`SELECT * FROM listings WHERE id IN (${placeholders})`).all(...ids);
		} else if (targetGroupId) {
			sourceListings = db.prepare(`
				SELECT l.* FROM listings l
				JOIN app_group_listings agl ON agl.listing_id = l.id
				WHERE agl.group_id = ?
			`).all(targetGroupId);
		} else {
			sourceListings = db.prepare("SELECT * FROM listings WHERE category = 'Kendaraan'").all();
		}

		if (sourceListings.length === 0) {
			sourceListings = db.prepare("SELECT * FROM listings").all();
		}

		const insertListing = db.prepare(`
			INSERT INTO listings (
				title, price, description, category, condition, availability,
				location, tags, sku, targetGroup, maxGroups, isActive,
				photoDir, photos, attributes, status, last_posted, autoFeed,
				existingPostUrl, postMarketplace, commentTargetUrl, photoUsage
			) VALUES (
				?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
			)
		`);

		const insertGroupListing = targetGroupId
			? db.prepare("INSERT OR IGNORE INTO app_group_listings (group_id, listing_id) VALUES (?, ?)")
			: null;

		const clonedIds = [];

		const transaction = db.transaction(() => {
			for (const item of sourceListings) {
				let originalAttrs = {};
				try {
					if (item.attributes) originalAttrs = JSON.parse(item.attributes);
				} catch (_) {}

				let cleanTitle = item.title || "";
				if (stripBrands) {
					cleanTitle = cleanTitle.replace(brandRegex, "").trim();
					cleanTitle = cleanTitle.replace(/^(YAMAHA|HONDA|SUZUKI|KAWASAKI)\s+/i, "").trim();
				}

				const pfx = prefix ? prefix.trim() + " " : "";
				const finalTitle = cleanTitle.startsWith(pfx.trim()) ? cleanTitle : `${pfx}${cleanTitle}`.trim();

				let newDesc = item.description || "";
				const specs = Object.entries(originalAttrs)
					.filter(([k, v]) => v && typeof v === "string")
					.map(([k, v]) => `${k}: ${v}`)
					.join("\n");

				if (specs && !newDesc.includes("Spesifikasi:")) {
					newDesc += "\n\nSpesifikasi:\n" + specs;
				}

				let labelProd = originalAttrs["Model"] || originalAttrs["Merek"] || cleanTitle;
				if (stripBrands && typeof labelProd === "string") {
					labelProd = labelProd.replace(brandRegex, "").trim();
				}

				const newAttrs = {
					Warna: originalAttrs["Warna eksterior"] || originalAttrs["Warna"] || "Hitam",
					"Label produk": labelProd || "Peralatan"
				};

				// Copy fisik foto agar clone mandiri (hapus satu tidak bunuh lain)
				let clonedPhotosJson = "[]";
				try {
					let srcArr = [];
					if (Array.isArray(item.photos)) srcArr = item.photos;
					else if (typeof item.photos === "string") {
						const parsed = JSON.parse(item.photos || "[]");
						srcArr = Array.isArray(parsed) ? parsed : [parsed];
					}
					const dstArr = [];
					for (const srcPhoto of srcArr.filter(Boolean)) {
						try {
							const rel = String(srcPhoto).startsWith("/")
								? String(srcPhoto).substring(1)
								: String(srcPhoto);
							const fullSrc = path.join(process.cwd(), rel);
							if (!fs.existsSync(fullSrc)) {
								dstArr.push(srcPhoto);
								continue;
							}
							const dir = path.dirname(fullSrc);
							const ext = path.extname(fullSrc) || ".jpg";
							const newName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
							const fullDst = path.join(dir, newName);
							fs.copySync(fullSrc, fullDst);
							const newRel = path
								.relative(process.cwd(), fullDst)
								.replace(/\\/g, "/");
							dstArr.push(newRel.startsWith("/") ? newRel : `/${newRel}`);
						} catch {
							dstArr.push(srcPhoto);
						}
					}
					clonedPhotosJson = JSON.stringify(dstArr);
				} catch {
					clonedPhotosJson = Array.isArray(item.photos)
						? JSON.stringify(item.photos)
						: item.photos || "[]";
				}

				const res = insertListing.run(
					finalTitle,
					item.price || 0,
					newDesc,
					"Peralatan rumah tangga",
					item.condition || "Bekas - Seperti Baru",
					item.availability || "in_stock",
					"", // location kosong / skip
					item.tags || "",
					item.sku || "",
					item.targetGroup || "berau",
					item.maxGroups || 20,
					1,
					item.photoDir || "",
					clonedPhotosJson,
					JSON.stringify(newAttrs),
					"pending",
					null,
					item.autoFeed !== undefined ? item.autoFeed : 1,
					"",
					item.postMarketplace !== undefined ? item.postMarketplace : 1,
					item.commentTargetUrl || "",
					"{}"
				);

				const newId = res.lastInsertRowid;
				clonedIds.push(newId);

				if (insertGroupListing && targetGroupId) {
					insertGroupListing.run(targetGroupId, newId);
				}
			}
		});

		transaction();
		return { count: clonedIds.length, ids: clonedIds };
	}
}

// Auto-prune logs older than 7 days on startup
try {
	const pruned = db.prepare("DELETE FROM bot_logs WHERE timestamp < ?").run(
		new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
	);
	if (pruned.changes > 0) {
		logger.info(`Pruned ${pruned.changes} old log entries (>7 days)`);
	}
} catch (_e) {
	logger.warn(`Auto-prune failed: ${_e.message}`);
}

module.exports = DataService;
