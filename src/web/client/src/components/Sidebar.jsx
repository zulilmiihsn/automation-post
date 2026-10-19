import { Users, Zap, BarChart3, Bot, Settings, Bell, MessageSquare, Layers, Terminal } from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function Sidebar({
  activeTab,
  setActiveTab
}) {
  const [unreadCount, setUnreadCount] = useState(0);

  const steps = [
    { id: 'accounts', label: 'Akun', icon: Users, hint: 'Hubungkan Facebook' },
    { id: 'workspace', label: 'Produk', icon: Layers, hint: 'Kelola dagangan' },
    { id: 'analytics', label: 'Hasil', icon: BarChart3, hint: 'Lihat laku' },
  ];
  const advanced = [
    { id: 'workspaces', label: 'Atur Workspace', icon: Layers },
    { id: 'chat', label: 'Balas Chat', icon: MessageSquare },
    { id: 'agent', label: 'AI Agent', icon: Bot },
  ];

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const data = await api.getUnreadCount();
        setUnreadCount(data.count || 0);
      } catch { /* ignore */ }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    window.addEventListener('autopost:notifications-changed', fetchUnread);
    return () => {
      clearInterval(interval);
      window.removeEventListener('autopost:notifications-changed', fetchUnread);
    };
  }, []);

  return (
    <aside className="sidebar">
      <div className="logo">
        <Zap fill="currentColor" size={20} />
        <span>Autopost Facebook</span>
      </div>

      <nav className="nav-menu" aria-label="Menu utama">
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#71717A', letterSpacing: '0.08em', padding: '4px 14px 2px 14px' }}>
          LANGKAH
        </div>
        {steps.map(item => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
              title={item.hint}
            >
              <Icon size={18} /> {item.label}
            </div>
          )
        })}
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#71717A', letterSpacing: '0.08em', padding: '10px 14px 2px 14px' }}>
          LANJUTAN
        </div>
        {advanced.map(item => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <Icon size={18} /> {item.label}
            </div>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          className="nav-item"
          onClick={() => window.dispatchEvent(new Event('autopost:open-console'))}
          style={{ marginBottom: '8px', position: 'relative', width: '100%', background: 'transparent', border: 'none', textAlign: 'left', fontFamily: 'inherit', fontSize: 'inherit', cursor: 'pointer' }}
        >
          <Terminal size={18} /> Konsol
        </button>
        <div 
          className="nav-item notif-item" 
          onClick={() => setActiveTab('notifications')}
          style={{ marginBottom: '8px', position: 'relative' }}
        >
          <Bell size={18} /> Notifikasi
          {unreadCount > 0 && (
            <span style={{
              background: 'var(--danger)',
              color: '#fff',
              fontSize: '11px',
              fontWeight: 600,
              padding: '1px 6px',
              borderRadius: '10px',
              marginLeft: 'auto',
              minWidth: '20px',
              textAlign: 'center',
            }}>{unreadCount}</span>
          )}
        </div>
        <div
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <Settings size={18} /> Pengaturan
        </div>
      </div>
    </aside>
  );
}
