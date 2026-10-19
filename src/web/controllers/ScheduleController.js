const DataService = require("../services/dataService");
const SchedulerService = require("../../services/schedulerService");
const cron = require("node-cron");

const SCHEDULE_MODES = new Set(["full", "all", "marketplace", "viral", "comment", "chat", "sundul"]);

class ScheduleController {
	static async getSchedules(_req, res) {
		try {
			res.json(DataService.getSchedules());
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async addSchedule(req, res) {
		try {
			const { name, cronExpr, mode, accountId } = req.body || {};
			if (typeof name !== "string" || !name.trim() || name.trim().length > 80 || typeof cronExpr !== "string" || !cronExpr.trim() || cronExpr.length > 100) {
				return res.status(400).json({ error: "Nama (maksimal 80 karakter) dan cron expression (maksimal 100 karakter) wajib" });
			}
			if (mode && !SCHEDULE_MODES.has(mode)) return res.status(400).json({ error: "Mode jadwal tidak valid" });
			if (!cron.validate(cronExpr)) return res.status(400).json({ error: "Format cron tidak valid. Gunakan 5 kolom: menit jam tanggal bulan hari." });
			if (accountId && typeof accountId !== "string") return res.status(400).json({ error: "Akun jadwal tidak valid" });
			if (accountId) {
				const accounts = await DataService.getAccounts();
				if (!accounts.some((account) => account.id === accountId)) {
					return res.status(400).json({ error: "Akun jadwal tidak ditemukan" });
				}
			}
			const id = DataService.addSchedule(name.trim(), cronExpr.trim(), mode, accountId);
			
			const sched = DataService.getSchedules().find(s => s.id === id);
			if (sched) SchedulerService.reloadSchedule(sched);

			res.json({ success: true, id });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async updateSchedule(req, res) {
		try {
			const id = parseInt(req.params.id, 10);
			const updates = req.body || {};
			if ("name" in updates && (typeof updates.name !== "string" || !updates.name.trim() || updates.name.trim().length > 80)) {
				return res.status(400).json({ error: "Nama jadwal harus 1-80 karakter" });
			}
			if ("cronExpr" in updates && (typeof updates.cronExpr !== "string" || updates.cronExpr.length > 100 || !cron.validate(updates.cronExpr))) {
				return res.status(400).json({ error: "Format cron tidak valid" });
			}
			if (updates.mode && !SCHEDULE_MODES.has(updates.mode)) {
				return res.status(400).json({ error: "Mode jadwal tidak valid" });
			}
			if ("account_id" in updates && updates.account_id != null && typeof updates.account_id !== "string") {
				return res.status(400).json({ error: "Akun jadwal tidak valid" });
			}
			if ("enabled" in updates && ![true, false, 0, 1].includes(updates.enabled)) {
				return res.status(400).json({ error: "Status jadwal tidak valid" });
			}
			DataService.updateSchedule(id, updates);
			
			const sched = DataService.getSchedules().find(s => s.id === id);
			if (sched) SchedulerService.reloadSchedule(sched);

			res.json({ success: true });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async deleteSchedule(req, res) {
		try {
			const id = parseInt(req.params.id, 10);
			DataService.deleteSchedule(id);
			
			SchedulerService.removeSchedule(id);

			res.json({ success: true });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}
}

module.exports = ScheduleController;
