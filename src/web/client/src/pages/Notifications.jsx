import { useState, useEffect } from 'react';
import { Bell, CheckCheck, AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-react';
import { api } from '../services/api';

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await api.getNotifications({
        unreadOnly: filter === 'unread',
        limit: 100,
      });
      setNotifications(data || []);
    } catch (err) {
      console.error('Notifications fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [filter]);

  const markRead = async (id) => {
    try {
      await api.markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
    } catch (err) {
      console.error('Mark read error:', err);
    }
  };

  const markAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    } catch (err) {
      console.error('Mark all read error:', err);
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'warning': return <AlertTriangle size={16} color="#fbbf24" />;
      case 'error': return <XCircle size={16} color="#ef4444" />;
      case 'success': return <CheckCircle size={16} color="#4ade80" />;
      default: return <Info size={16} color="#60a5fa" />;
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div style={{ padding: '0 4px' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', alignItems: 'center' }}>
        {[{id: 'all', label: 'semua'}, {id: 'unread', label: 'belum dibaca'}].map(f => (
          <button
            key={f.id}
            className={`btn ${filter === f.id ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setFilter(f.id)}
            style={{ textTransform: 'capitalize' }}
          >
            {f.label} {f.id === 'unread' && unreadCount > 0 ? `(${unreadCount})` : ''}
          </button>
        ))}
        <div style={{ marginLeft: 'auto' }}>
          {unreadCount > 0 && (
            <button className="btn btn-outline" onClick={markAllRead} style={{ fontSize: '12px', padding: '6px 12px' }}>
              <CheckCheck size={14} style={{ marginRight: '4px' }} /> Tandai Semua Dibaca
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Memuat notifikasi...</div>
      ) : notifications.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {notifications.map(notif => (
            <div
              key={notif.id}
              onClick={() => !notif.is_read && markRead(notif.id)}
              style={{
                padding: '14px 16px',
                background: notif.is_read ? 'var(--card)' : 'rgba(96,165,250,0.04)',
                border: `1px solid ${notif.is_read ? 'var(--border)' : 'rgba(96,165,250,0.15)'}`,
                borderRadius: 'var(--radius-md)',
                cursor: notif.is_read ? 'default' : 'pointer',
                display: 'flex', alignItems: 'flex-start', gap: '12px',
                transition: 'background 0.15s',
              }}
            >
              <div style={{ marginTop: '2px', flexShrink: 0 }}>
                {getIcon(notif.type)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: notif.is_read ? 400 : 500, marginBottom: '2px' }}>
                  {notif.title || 'Notifikasi'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {notif.message || ''}
                </div>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {notif.created_at ? new Date(notif.created_at).toLocaleString() : ''}
              </div>
              {!notif.is_read && (
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#60a5fa', flexShrink: 0, marginTop: '6px' }} />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
          padding: '40px', textAlign: 'center',
        }}>
          <Bell size={32} color="var(--text-muted)" style={{ marginBottom: '12px' }} />
          <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            {filter === 'unread' ? 'Tidak ada notifikasi yang belum dibaca' : 'Belum ada notifikasi'}
          </div>
        </div>
      )}
    </div>
  );
}
