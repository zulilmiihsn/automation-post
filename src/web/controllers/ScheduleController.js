const DataService = require("../services/dataService");
const SchedulerService = require("../../services/schedulerService");

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
			const { name, cronExpr, mode, accountId } = req.body;
			if (!name || !cronExpr) return res.status(400).json({ error: "Name dan cron expression wajib" });
			const id = DataService.addSchedule(name, cronExpr, mode, accountId);
			
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
			DataService.updateSchedule(id, req.body);
			
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
