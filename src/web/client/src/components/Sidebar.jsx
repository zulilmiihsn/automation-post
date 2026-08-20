import { Users, Package, Zap, BarChart3, Bot, Settings, Bell, MessageSquare, Folder, Layers, ChevronDown, Check, Plus } from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function Sidebar({ 
  activeTab, 
  setActiveTab, 
  groups = [], 
  selectedGroupId = null, 
  onSelectGroup 
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [openWorkspaceDropdown, setOpenWorkspaceDropdown] = useState(false);

  const navItems = [
    { id: 'accounts', label: 'Akun Facebook', icon: Users },
    { id: 'workspace', label: 'Workspace & Listing', icon: Layers },
    { id: 'analytics', label: 'Analitik', icon: BarChart3 },
    { id: 'chat', label: 'Chat Bot', icon: MessageSquare },
    { id: 'agent', label: 'AI Agent', icon: Bot },
    { id: 'settings', label: 'Pengaturan', icon: Settings },
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
    return () => clearInterval(interval);
  }, []);

  const currentGroup = selectedGroupId ? groups.find(g => g.id === Number(selectedGroupId)) : null;

  return (
    <aside className="sidebar">
      <div className="logo">
        <Zap fill="currentColor" size={20} />
        <span>AUTOPOST WB</span>
      </div>

      {/* WORKSPACE SELECTOR */}
      <div style={{ padding: '0 16px', marginBottom: '16px', position: 'relative' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#71717A', letterSpacing: '0.08em', marginBottom: '6px', textTransform: 'uppercase' }}>
          Workspace Aktif
        </div>
        
        <div
          onClick={() => setOpenWorkspaceDropdown(!openWorkspaceDropdown)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            background: currentGroup ? 'rgba(16, 185, 129, 0.08)' : '#18181B',
            border: `1px solid ${currentGroup ? 'rgba(16, 185, 129, 0.3)' : '#27272A'}`,
            borderRadius: '10px',
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              background: currentGroup ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Layers size={14} color={currentGroup ? '#10B981' : '#A1A1AA'} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: currentGroup ? '#FAFAFA' : '#E4E4E7', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentGroup ? currentGroup.name : 'Semua (Global)'}
              </div>
              <div style={{ fontSize: '11px', color: '#71717A' }}>
                {currentGroup ? `${currentGroup.accounts.length} Akun • ${currentGroup.listings.length} Produk` : 'Katalog Penuh'}
              </div>
            </div>
          </div>
          <ChevronDown size={14} color="#71717A" style={{ transform: openWorkspaceDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </div>

        {/* Dropdown Menu */}
        {openWorkspaceDropdown && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: '16px',
            right: '16px',
            background: '#121214',
            border: '1px solid #27272A',
            borderRadius: '12px',
            padding: '6px',
            zIndex: 100,
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.6)'
          }}>
            <div
              onClick={() => {
                if (onSelectGroup) onSelectGroup(null);
                setOpenWorkspaceDropdown(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                borderRadius: '8px',
                background: !selectedGroupId ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                color: !selectedGroupId ? '#10B981' : '#D4D4D8'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={13} />
                <span>Semua (Global)</span>
              </div>
              {!selectedGroupId && <Check size={13} color="#10B981" />}
            </div>

            <div style={{ height: '1px', background: '#27272A', margin: '4px 0' }} />

            <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {groups.map(g => {
                const isSelected = selectedGroupId === g.id;
                return (
                  <div
                    key={g.id}
                    onClick={() => {
                      if (onSelectGroup) onSelectGroup(g.id);
                      setOpenWorkspaceDropdown(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: isSelected ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: isSelected ? '#10B981' : '#D4D4D8'
                    }}
                  >
                    <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <div>{g.name}</div>
                      <div style={{ fontSize: '10px', color: '#71717A' }}>
                        {g.accounts.length} Akun &bull; {g.listings.length} Produk
                      </div>
                    </div>
                    {isSelected && <Check size={13} color="#10B981" />}
                  </div>
                );
              })}
            </div>

            <div style={{ height: '1px', background: '#27272A', margin: '4px 0' }} />

            <div
              onClick={() => {
                setActiveTab('workspace');
                setOpenWorkspaceDropdown(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 10px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '12px',
                color: '#10B981',
                fontWeight: 600
              }}
            >
              <Plus size={13} />
              <span>Kelola / Buat Grup</span>
            </div>
          </div>
        )}
      </div>
      
      <nav className="nav-menu">
        {navItems.map(item => {
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
        <div className="version-info">v3.0.0-PRO (React)</div>
        <div className="server-status">Status Server: <span className="status-online">Online</span></div>
      </div>
    </aside>
  );
}
