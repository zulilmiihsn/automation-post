const cron = require('node-cron');
const Logger = require('../utils/logger');

// Logger methods are instance-based; use a module-scoped instance.
const logger = new Logger('SCHEDULER');

/**
 * SchedulerService - Cron-based automation scheduler.
 * Stores schedules in SQLite (automation_schedules table) and
 * uses node-cron to trigger automation runs.
 */
class SchedulerService {
  constructor() {
    this._jobs = new Map(); // scheduleId -> cron.Task
    this._started = false;
  }

  /**
   * Start the scheduler: load all enabled schedules from DB and register cron jobs.
   */
  start() {
    if (this._started) return;
    this._started = true;

    try {
      const DataService = require('../web/services/dataService');
      const schedules = DataService.getSchedules();
      for (const sched of schedules) {
        if (sched.enabled) {
          this._registerJob(sched);
        }
      }
      logger.info(`Started with ${schedules.filter(s => s.enabled).length} active schedule(s)`);
    } catch (err) {
      logger.error(`Failed to start: ${err.message}`);
    }
  }

  /**
   * Register a cron job for a schedule.
   */
  _registerJob(sched) {
    if (this._jobs.has(sched.id)) {
      this._jobs.get(sched.id).stop();
    }

    if (!cron.validate(sched.cron_expr)) {
      logger.warn(`Invalid cron expression for schedule ${sched.id}: ${sched.cron_expr}`);
      return;
    }

    const task = cron.schedule(sched.cron_expr, () => {
      this._executeSchedule(sched);
    }, {
      scheduled: true,
      timezone: 'Asia/Jakarta',
    });

    this._jobs.set(sched.id, task);
    logger.info(`Registered schedule ${sched.id}: "${sched.name}" [${sched.cron_expr}]`);
  }

  /**
   * Execute a scheduled automation run.
   */
  async _executeSchedule(sched) {
    logger.info(`Executing schedule ${sched.id}: "${sched.name}" (mode: ${sched.mode})`);

    try {
      const DataService = require('../web/services/dataService');
      const QueueService = require('../web/services/queueService');

      // Notify before execution
      try {
        DataService.addNotification({
          type: 'info',
          title: 'Scheduled Automation Starting',
          message: `Running "${sched.name}" (${sched.mode}) as scheduled.`,
        });
      } catch { /* non-critical */ }

      // Trigger automation
      const queue = QueueService.getQueue(sched.mode === 'full' ? 'all' : sched.mode);
      let started;
      if (sched.mode === 'sundul') {
        let accountName = 'Semua Akun Aktif';
        let profileDir = null;
        if (sched.account_id) {
          const path = require('node:path');
          const accounts = await DataService.getAccounts();
          const account = accounts.find(item => item.id === sched.account_id);
          if (!account || !account.isActive || !account.linked) {
            throw new Error(`Akun sundul ${sched.account_id} tidak aktif atau belum tertaut`);
          }
          accountName = account.fbName || account.name;
          profileDir = path.join(__dirname, '../..', account.profile);
        }
        started = queue.startSundul('auto', accountName, profileDir, sched.account_id || null);
      } else {
        started = queue.startFullAutomation(sched.mode, sched.account_id || null);
      }

      if (!started) {
        logger.warn(`Could not start schedule ${sched.id} - another process is running`);
        DataService.addNotification({
          type: 'warning',
          title: 'Schedule Skipped',
          message: `"${sched.name}" was skipped because another automation is running.`,
        });
        return;
      }

      // Listen for completion
      queue.once('done', () => {
        try {
          DataService.markScheduleRun(sched.id);
          DataService.addNotification({
            type: 'success',
            title: 'Scheduled Automation Complete',
            message: `"${sched.name}" finished successfully.`,
          });
        } catch { /* non-critical */ }
      });

      // Mark as run regardless (fire-and-forget update)
      DataService.markScheduleRun(sched.id);
    } catch (err) {
      logger.error(`Error executing schedule ${sched.id}: ${err.message}`);
      try {
        const DataService = require('../web/services/dataService');
        DataService.addNotification({
          type: 'error',
          title: 'Schedule Failed',
          message: `"${sched.name}" failed: ${err.message}`,
        });
      } catch { /* non-critical */ }
    }
  }

  /**
   * Add or update a schedule - re-registers the cron job.
   */
  reloadSchedule(sched) {
    if (sched.enabled) {
      this._registerJob(sched);
    } else {
      this.removeSchedule(sched.id);
    }
  }

  /**
   * Remove a cron job for a schedule.
   */
  removeSchedule(id) {
    const job = this._jobs.get(id);
    if (job) {
      job.stop();
      this._jobs.delete(id);
      logger.info(`Removed schedule ${id}`);
    }
  }

  /**
   * Stop all scheduled jobs.
   */
  stop() {
    for (const [id, job] of this._jobs) {
      job.stop();
    }
    this._jobs.clear();
    this._started = false;
    logger.info('Stopped all schedules');
  }

  /**
   * Get active schedule count.
   */
  getActiveCount() {
    return this._jobs.size;
  }
}

// Singleton
module.exports = new SchedulerService();
