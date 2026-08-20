const DataService = require("../services/dataService");
const SchedulerService = require("../../services/schedulerService");

class GroupController {
	static async getGroups(req, res) {
		try {
			res.json(DataService.getGroups());
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async addGroup(req, res) {
		try {
			const { name, accounts, listings } = req.body;
			const id = DataService.addGroup(name, accounts, listings);
			res.json({ success: true, id });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async updateGroup(req, res) {
		try {
			const id = parseInt(req.params.id, 10);
			const { name, accounts, listings } = req.body;
			DataService.updateGroup(id, name, accounts, listings);
			res.json({ success: true });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async deleteGroup(req, res) {
		try {
			DataService.deleteGroup(parseInt(req.params.id, 10));
			res.json({ success: true });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async toggleGroup(req, res) {
		try {
			const id = parseInt(req.params.id, 10);
			const { isActive } = req.body;
			DataService.toggleGroupState(id, isActive);
			res.json({ success: true });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async activateGroupExclusive(req, res) {
		try {
			const id = parseInt(req.params.id, 10);
			DataService.activateGroupExclusive(id);
			res.json({ success: true });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async addListingToGroup(req, res) {
		try {
			const id = parseInt(req.params.id, 10);
			const { listingId } = req.body;
			if (!listingId) return res.status(400).json({ error: "listingId is required" });
			DataService.addGroupListing(id, listingId);
			res.json({ success: true });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async removeListingFromGroup(req, res) {
		try {
			const id = parseInt(req.params.id, 10);
			const listingId = parseInt(req.params.listingId, 10);
			DataService.removeGroupListing(id, listingId);
			res.json({ success: true });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}
}

module.exports = GroupController;
