import { useState, useEffect, lazy, Suspense } from 'react';
import Layout from './components/Layout';
import Accounts from './pages/Accounts';
import Workspace from './pages/Workspace';
import { applyTheme, getSavedTheme } from './utils/theme';

// Lazy-load heavier pages (code splitting)
const Analytics = lazy(() => import('./pages/Analytics'));
const AgentDashboard = lazy(() => import('./pages/AgentDashboard'));
const ChatDashboard = lazy(() => import('./pages/ChatDashboard'));
const Settings = lazy(() => import('./pages/Settings'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Groups = lazy(() => import('./pages/Groups'));

import { api } from './services/api';

const TAB_INFO = {
  accounts: {
    title: "Langkah 1 — Akun",
    subtitle: "Hubungkan Facebook dulu. Tanpa ini bot tidak bisa jalan.",
  },
  workspace: {
    title: "Langkah 2 — Produk",
    subtitle: "Tambah dagangan, atur foto, lalu tekan satu tombol untuk jualan.",
  },
  workspaces: {
    title: "Atur Workspace",
    subtitle: "Satu workspace = satu tim akun + satu katalog produk.",
  },
  analytics: {
    title: "Langkah 3 — Hasil",
    subtitle: "Lihat apa yang laku dan apa yang gagal.",
  },
  agent: {
    title: "AI Agent",
    subtitle: "Suka dan komentar otomatis di feed (lanjutan).",
  },
  chat: {
    title: "Balas Chat",
    subtitle: "Balas inbox pembeli otomatis (lanjutan).",
  },
  settings: {
    title: "Pengaturan",
    subtitle: "Tampilan, batas harian, AI, dan jadwal otomatis.",
  },
  notifications: {
    title: "Notifikasi",
    subtitle: "Kabar dari sistem dan bot.",
  },
};

function App() {
  const [activeTab, setActiveTab] = useState('workspace');
  const [theme, setTheme] = useState(getSavedTheme);
  const [selectedGroupId, setSelectedGroupId] = useState(() => {
    const saved = localStorage.getItem('autopost_selected_group');
    return saved ? Number(saved) : null;
  });
  const [data, setData] = useState({ accounts: [], listings: [], groups: [] });
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const initFetch = async () => {
    setLoadError('');
    try {
      const [accounts, listings, cfg, groups] = await Promise.all([
        api.getAccounts(),
        api.getListings(),
        api.getConfig(),
        api.getGroups()
      ]);
      setData({ accounts, listings, groups: groups || [] });
      setConfig(cfg);
    } catch (err) {
      console.error("Failed to fetch data:", err);
      setLoadError('Gagal memuat data. Periksa server backend lalu coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    await initFetch();
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    initFetch();
  }, []);

  const handleSelectGroup = (groupId) => {
    const id = groupId ? Number(groupId) : null;
    setSelectedGroupId(id);
    if (id) {
      localStorage.setItem('autopost_selected_group', String(id));
    } else {
      localStorage.removeItem('autopost_selected_group');
    }
  };

  const tabInfo = TAB_INFO[activeTab] || TAB_INFO.workspace;

  const renderPage = () => {
    if (loading) return (
      <div aria-busy="true" aria-label="Memuat data">
        <div className="skeleton skeleton-title" />
        <div className="skeleton-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-card" />
          ))}
        </div>
      </div>
    );
    if (loadError) return (
      <div role="alert" className="load-error">
        <p>{loadError}</p>
        <button className="btn btn-primary" onClick={() => { setLoading(true); initFetch(); }}>Coba Lagi</button>
      </div>
    );
    switch (activeTab) {
      case 'accounts': return (
        <Accounts 
          accounts={data.accounts} 
          groups={data.groups}
          selectedGroupId={selectedGroupId}
          onSelectGroup={handleSelectGroup}
          config={config} 
          onRefresh={fetchData} 
        />
      );
      case 'workspace':
        return (
          <Workspace
            listings={data.listings}
            accounts={data.accounts}
            groups={data.groups}
            selectedGroupId={selectedGroupId}
            onSelectGroup={handleSelectGroup}
            onManageWorkspaces={() => setActiveTab('workspaces')}
            onRefresh={fetchData}
          />
        );
      case 'workspaces': return (
        <Groups
          selectedGroupId={selectedGroupId}
          onSelectGroup={handleSelectGroup}
          onOpenWorkspace={(id) => { handleSelectGroup(id); setActiveTab('workspace'); }}
          onRefresh={fetchData}
        />
      );
      case 'analytics': return (
        <Analytics
          selectedGroupId={selectedGroupId}
          groups={data.groups}
          onOpenProducts={() => { handleSelectGroup(null); setActiveTab('workspace'); }}
        />
      );
      case 'agent': return <AgentDashboard />;
      case 'chat': return <ChatDashboard />;
      case 'settings': return <Settings theme={theme} onThemeChange={setTheme} />;
      case 'notifications': return <Notifications />;
      default: return (
        <Workspace
          listings={data.listings}
          accounts={data.accounts}
          groups={data.groups}
          selectedGroupId={selectedGroupId}
          onSelectGroup={handleSelectGroup}
          onManageWorkspaces={() => setActiveTab('workspaces')}
          onRefresh={fetchData}
        />
      );
    }
  };

  return (
    <Layout 
      activeTab={activeTab} 
      setActiveTab={setActiveTab}
      title={tabInfo.title}
      subtitle={tabInfo.subtitle}
      onRefresh={fetchData}
    >
      <Suspense fallback={<div style={{ padding: '20px', color: 'var(--text-muted)' }}>Loading...</div>}>
        {!loading && !loadError && (data.accounts.length === 0 || data.listings.length === 0) && (
          <div role="note" aria-label="Panduan mulai" style={{ padding: '14px 18px', borderRadius: 12, marginBottom: 4, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)', color: 'var(--info-strong)', fontSize: 13, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong>Mulai cepat:</strong>
            <span>1. {data.accounts.length === 0 ? 'Tambah akun di tab Akun Facebook' : 'Akun siap ✓'}</span>
            <span>2. {data.listings.length === 0 ? 'Tambah produk / Scrape FB di Workspace' : 'Produk siap ✓'}</span>
            <span>3. Jalankan Post / Viral dari bar aksi</span>
            {data.accounts.length === 0 && (
              <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setActiveTab('accounts')}>Ke Akun</button>
            )}
          </div>
        )}
        {renderPage()}
      </Suspense>
    </Layout>
  );
}

export default App;
