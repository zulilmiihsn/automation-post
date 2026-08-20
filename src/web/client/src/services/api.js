export const api = {
  getConfig: async () => {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error('Failed to fetch config');
    return res.json();
  },
  setConfig: async (key, value) => {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value })
    });
    if (!res.ok) throw new Error('Failed to save config');
    return res.json();
  },
  getAccounts: async () => {
    const res = await fetch('/api/accounts');
    if (!res.ok) throw new Error('Failed to fetch accounts');
    return res.json();
  },
  getListings: async () => {
    const res = await fetch('/api/listings');
    if (!res.ok) throw new Error('Failed to fetch listings');
    return res.json();
  },
  createListing: async (data) => {
    const res = await fetch('/api/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create listing');
    }
    return res.json();
  },
  updateListing: async (id, data) => {
    const res = await fetch(`/api/listings/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update listing');
    }
    return res.json();
  },
  bulkUpdateListings: async (ids, updates) => {
    const res = await fetch('/api/listings/bulk-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, updates })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to bulk update listings');
    }
    return res.json();
  },
  bulkDeleteListings: async (ids) => {
    const res = await fetch('/api/listings/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to bulk delete listings');
    }
    return res.json();
  },
  generateTags: async (data) => {
    const res = await fetch('/api/listings/generate-tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to generate tags');
    }
    return res.json();
  },
  generateFields: async (data) => {
    const res = await fetch('/api/listings/generate-fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to generate fields');
    }
    return res.json();
  },
  uploadPhotos: async (formData) => {
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to upload photos');
    }
    return res.json();
  },
  cloneToAppliance: async (data = {}) => {
    const res = await fetch('/api/listings/clone-to-appliance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to clone listings');
    }
    return res.json();
  },

  // --- AI Agent ---
  runAgent: async (data) => {
    const res = await fetch('/api/run-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to start agent');
    }
    return res.json();
  },
  stopAgent: async () => {
    const res = await fetch('/api/stop-agent', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to stop agent');
    }
    return res.json();
  },
  runSundul: async (data) => {
    const res = await fetch('/api/run-sundul', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to start sundul');
    }
    return res.json();
  },

  // --- Persistent Logs ---
  getLogs: async (params = {}) => {
    const qs = new URLSearchParams();
    if (params.mode) qs.set('mode', params.mode);
    if (params.level) qs.set('level', params.level);
    if (params.search) qs.set('search', params.search);
    if (params.limit) qs.set('limit', params.limit);
    if (params.before) qs.set('before', params.before);
    const res = await fetch(`/api/logs?${qs.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch logs');
    return res.json();
  },
  clearLogs: async (olderThanDays = 7) => {
    const res = await fetch('/api/logs', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ olderThanDays })
    });
    if (!res.ok) throw new Error('Failed to clear logs');
    return res.json();
  },
  getLogStats: async () => {
    const res = await fetch('/api/logs/stats');
    if (!res.ok) throw new Error('Failed to fetch log stats');
    return res.json();
  },

  // --- AI Intelligence ---
  suggestPrice: async (data) => {
    const res = await fetch('/api/listings/suggest-price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to suggest price');
    }
    return res.json();
  },
  detectDuplicates: async (title) => {
    const res = await fetch('/api/listings/detect-duplicates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    if (!res.ok) throw new Error('Failed to detect duplicates');
    return res.json();
  },

  // --- Agent Analytics ---
  getAgentStats: async () => {
    const res = await fetch('/api/agent/stats');
    if (!res.ok) throw new Error('Failed to fetch agent stats');
    return res.json();
  },
  getAgentInteractions: async (params = {}) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', params.limit);
    if (params.author) qs.set('author', params.author);
    const res = await fetch(`/api/agent/interactions?${qs.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch agent interactions');
    return res.json();
  },
  getAgentMemories: async (params = {}) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.limit) qs.set('limit', params.limit);
    const res = await fetch(`/api/agent/memories?${qs.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch memories');
    return res.json();
  },

  // --- Health ---
  getHealth: async () => {
    const res = await fetch('/api/health');
    if (!res.ok) throw new Error('Failed to fetch health');
    return res.json();
  },
  getActionBudget: async (accountId) => {
    const qs = accountId ? `?accountId=${accountId}` : '';
    const res = await fetch(`/api/health/action-budget${qs}`);
    if (!res.ok) throw new Error('Failed to fetch action budget');
    return res.json();
  },

  // --- Groups ---
  getGroups: async () => {
    const res = await fetch('/api/groups');
    if (!res.ok) throw new Error('Failed to fetch groups');
    return res.json();
  },
  addGroup: async (data) => {
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to add group');
    return res.json();
  },
  updateGroup: async (id, data) => {
    const res = await fetch(`/api/groups/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update group');
    return res.json();
  },
  deleteGroup: async (id) => {
    const res = await fetch(`/api/groups/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete group');
    return res.json();
  },
  toggleGroup: async (id, isActive) => {
    const res = await fetch(`/api/groups/${id}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive })
    });
    if (!res.ok) throw new Error('Failed to toggle group');
    return res.json();
  },
  activateGroupExclusive: async (id) => {
    const res = await fetch(`/api/groups/${id}/activate-exclusive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error('Failed to activate group exclusively');
    return res.json();
  },
  addGroupListing: async (groupId, listingId) => {
    const res = await fetch(`/api/groups/${groupId}/listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId })
    });
    if (!res.ok) throw new Error('Failed to add listing to group');
    return res.json();
  },
  removeGroupListing: async (groupId, listingId) => {
    const res = await fetch(`/api/groups/${groupId}/listings/${listingId}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to remove listing from group');
    return res.json();
  },

  // --- Schedules ---
  getSchedules: async () => {
    const res = await fetch('/api/schedules');
    if (!res.ok) throw new Error('Failed to fetch schedules');
    return res.json();
  },
  addSchedule: async (data) => {
    const res = await fetch('/api/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to add schedule');
    return res.json();
  },
  updateSchedule: async (id, data) => {
    const res = await fetch(`/api/schedules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update schedule');
    return res.json();
  },
  deleteSchedule: async (id) => {
    const res = await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete schedule');
    return res.json();
  },

  // --- Notifications ---
  getNotifications: async (params = {}) => {
    const qs = new URLSearchParams();
    if (params.unreadOnly) qs.set('unreadOnly', 'true');
    if (params.limit) qs.set('limit', params.limit);
    const res = await fetch(`/api/notifications?${qs.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch notifications');
    return res.json();
  },
  getUnreadCount: async () => {
    const res = await fetch('/api/notifications/unread-count');
    if (!res.ok) throw new Error('Failed to fetch unread count');
    return res.json();
  },
  markNotificationRead: async (id) => {
    const res = await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to mark read');
    return res.json();
  },
  markAllNotificationsRead: async () => {
    const res = await fetch('/api/notifications/read-all', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to mark all read');
    return res.json();
  },

  // --- Analytics & Reports ---
  getAnalyticsActivity: async (days = 7) => {
    const res = await fetch(`/api/analytics/activity?days=${days}`);
    if (!res.ok) throw new Error('Failed to fetch analytics');
    return res.json();
  },
  getListingStats: async () => {
    const res = await fetch('/api/analytics/listing-stats');
    if (!res.ok) throw new Error('Failed to fetch listing stats');
    return res.json();
  },
  getDailyReports: async (limit = 30) => {
    const res = await fetch(`/api/reports/daily?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch reports');
    return res.json();
  },
  generateReport: async () => {
    const res = await fetch('/api/reports/generate', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to generate report');
    return res.json();
  }
};
