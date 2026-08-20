const path = require("node:path");
const DataService = require("../services/dataService");
const AIService = require("../../services/aiService");
const ASSETS_DIR = path.join(__dirname, "../../../assets");

class ListingController {
	static async getListings(_req, res) {
		try {
			const data = await DataService.getListings();
			res.json(data);
		} catch (_err) {
			res.status(500).json({ error: "Failed to load listings" });
		}
	}

	static async createListing(req, res) {
		try {
			const data = req.body;
			if (!data) throw new Error("No data provided");

			if (Array.isArray(data)) {
				const ids = [];
				for (const item of data) {
					const id = await DataService.addListing(item);
					ids.push(id);
				}
				res.json({ success: true, ids });
			} else {
				const id = await DataService.addListing(data);
				res.json({ success: true, id });
			}
		} catch (err) {
			res.status(500).json({ error: `Failed to create listing: ${err.message}` });
		}
	}

	static async bulkUpdateListingsActive(req, res) {
		try {
			const { isActive } = req.body;
			await DataService.bulkUpdateListingsActive(isActive);
			res.json({ success: true });
		} catch (err) {
			res.status(500).json({ error: `Failed to update listings: ${err.message}` });
		}
	}

	static async bulkUpdateListingsFeed(req, res) {
		try {
			const { autoFeed } = req.body;
			await DataService.bulkUpdateListingsFeed(autoFeed);
			res.json({ success: true });
		} catch (err) {
			res.status(500).json({ error: `Failed to update listings: ${err.message}` });
		}
	}

	static async bulkUpdateListings(req, res) {
		try {
			const { ids, updates } = req.body;
			if (!Array.isArray(ids) || !updates || typeof updates !== "object") {
				return res.status(400).json({ error: "Parameter ids dan updates diperlukan" });
			}
			const count = await DataService.bulkUpdateListings(ids, updates);
			res.json({ success: true, count });
		} catch (err) {
			res.status(500).json({ error: `Gagal bulk update: ${err.message}` });
		}
	}

	static async bulkDeleteListings(req, res) {
		try {
			const { ids } = req.body;
			if (!Array.isArray(ids)) {
				return res.status(400).json({ error: "Parameter ids diperlukan" });
			}
			const count = await DataService.bulkDeleteListings(ids);
			res.json({ success: true, count });
		} catch (err) {
			res.status(500).json({ error: `Gagal bulk delete: ${err.message}` });
		}
	}

	static async clearAllListingsUrls(_req, res) {
		try {
			await DataService.clearAllExistingPostUrls();
			res.json({ success: true, message: "Semua link URL listingan berhasil dihapus" });
		} catch (err) {
			res.status(500).json({ error: `Gagal menghapus link URL: ${err.message}` });
		}
	}

	static async updateListingById(req, res) {
		try {
			const id = parseInt(req.params.id, 10);
			const l = req.body;
			await DataService.updateListingById(id, l);
			res.json({ success: true });
		} catch (err) {
			res.status(500).json({ error: `Failed to update listing: ${err.message}` });
		}
	}

	static async deleteListingById(req, res) {
		try {
			const id = parseInt(req.params.id, 10);
			await DataService.deleteListing(id);
			res.json({ success: true });
		} catch (err) {
			res.status(500).json({ error: `Failed to delete listing: ${err.message}` });
		}
	}

	static async uploadImages(req, res) {
		try {
			res.json({
				success: true,
				folderPath: ASSETS_DIR,
				files: req.files ? req.files.map((f) => f.filename) : [],
			});
		} catch (_err) {
			res.status(500).json({ error: "Upload failed" });
		}
	}

	static async generateTags(req, res) {
		try {
			const { title, location, category, condition } = req.body;
			if (!title) {
				return res.status(400).json({ error: "Nama produk/title wajib diisi" });
			}
			const tags = await AIService.generateTags({ title, location, category, condition });
			res.json({ success: true, tags });
		} catch (error) {
			res.status(500).json({ error: error.message });
		}
	}

	static async generateFields(req, res) {
		try {
			const { description } = req.body;
			if (!description) {
				return res.status(400).json({ error: "Deskripsi wajib diisi" });
			}
			const result = await AIService.generateFieldsFromDescription({ description });
			res.json({ success: true, ...result });
		} catch (error) {
			res.status(500).json({ error: error.message });
		}
	}

	static async suggestPrice(req, res) {
		try {
			const { title, category, condition, attributes } = req.body;
			if (!title) return res.status(400).json({ error: "Title wajib diisi" });
			const result = await AIService.suggestPrice({ title, category, condition, attributes });
			res.json({ success: true, ...result });
		} catch (error) {
			res.status(500).json({ error: error.message });
		}
	}

	static async detectDuplicates(req, res) {
		try {
			const { title } = req.body;
			if (!title) return res.status(400).json({ error: "Title wajib diisi" });
			const listings = await DataService.getListings();
			const duplicates = AIService.detectDuplicates(title, listings);
			res.json({ success: true, duplicates, count: duplicates.length });
		} catch (error) {
			res.status(500).json({ error: error.message });
		}
	}

	static async cloneToAppliance(req, res) {
		try {
			const { ids, targetGroupId, prefix, stripBrands } = req.body || {};
			const result = DataService.cloneListingsToAppliance({
				ids: Array.isArray(ids) ? ids : [],
				targetGroupId: targetGroupId ? parseInt(targetGroupId, 10) : null,
				prefix: prefix !== undefined ? prefix : "[READY BERAU] ",
				stripBrands: stripBrands !== undefined ? stripBrands : true,
			});
			res.json({
				success: true,
				message: `Berhasil meng-clone ${result.count} produk ke kategori Peralatan Rumah Tangga (Anti-Restrict).`,
				...result,
			});
		} catch (error) {
			res.status(500).json({ error: `Gagal clone produk: ${error.message}` });
		}
	}
}

module.exports = ListingController;
