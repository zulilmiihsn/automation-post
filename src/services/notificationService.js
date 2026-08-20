const Logger = require('../utils/logger');

// Logger methods are instance-based; use a module-scoped instance.
const logger = new Logger('NOTIFICATION');

/**
 * NotificationService - Centralized notification system.
 * Creates notifications in SQLite and optionally pushes to frontend via SSE/WebSocket.
 */
class NotificationService {
  constructor() {
    this._listeners = [];
  }

  /**
   * Register a listener for real-time push (e.g., SSE emitter).
   * @param {Function} fn - Callback(notification)
   */
  onNotification(fn) {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter(l => l !== fn);
    };
  }

  /**
   * Create and persist a notification.
   */
  async notify({ type = 'info', title, message } = {}) {
    const notif = { type, title, message };

    try {
      const DataService = require('../web/services/dataService');
      const created = DataService.addNotification(notif);
      notif.id = created?.id;
      notif.created_at = new Date().toISOString();

      // Push to real-time listeners
      for (const fn of this._listeners) {
        try { fn(notif); } catch { /* listener error, skip */ }
      }

      return notif;
    } catch (err) {
      logger.error(`Failed to create: ${err.message}`);
      return null;
    }
  }

  /**
   * Notify: Account restricted by Facebook.
   */
  async accountRestricted(accountId, details) {
    return this.notify({
      type: 'warning',
      title: 'Account Restricted',
      message: `Account ${accountId} appears to be restricted by Facebook. ${details || ''}`,
    });
  }

  /**
   * Notify: Automation run completed.
   */
  async automationComplete(mode, summary) {
    return this.notify({
      type: summary.errors > 0 ? 'warning' : 'success',
      title: `Automation Complete (${mode})`,
      message: `Finished ${mode} run: ${summary.success || 0} succeeded, ${summary.errors || 0} errors.`,
    });
  }

  /**
   * Notify: AI Agent finished.
   */
  async agentComplete(summary) {
    return this.notify({
      type: 'success',
      title: 'AI Agent Complete',
      message: `Agent scanned ${summary.posts || 0} posts, liked ${summary.likes || 0}, commented ${summary.comments || 0}.`,
    });
  }

  /**
   * Notify: System health warning.
   */
  async healthWarning(message) {
    return this.notify({
      type: 'warning',
      title: 'Health Warning',
      message,
    });
  }

  /**
   * Notify: Error/fatal event.
   */
  async systemError(message) {
    return this.notify({
      type: 'error',
      title: 'System Error',
      message,
    });
  }
}

// Singleton
module.exports = new NotificationService();
