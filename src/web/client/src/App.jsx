import { useState, useEffect, lazy, Suspense } from 'react';
import Layout from './components/Layout';
import Accounts from './pages/Accounts';
import Workspace from './pages/Workspace';

// Lazy-load heavier pages (code splitting)
const Analytics = lazy(() => import('./pages/Analytics'));
const AgentDashboard = lazy(() => import('./pages/AgentDashboard'));
const ChatDashboard = lazy(() => import('./pages/ChatDashboard'));
const Settings = lazy(() => import('./pages/Settings'));
const Notifications = lazy(() => import('./pages/Notifications'));

import { api } from './services/api';

const TAB_INFO = {
  accounts: {
    title: "Manajer Akun Facebook",
    subtitle: "Kelola profil Facebook, sesi login, dan status akun Anda.",
  },
  workspace: {
    title: "Workspace & Listing",
    subtitle: "Pusat kelola toko, akun Facebook, katalog produk, dan eksekusi bot otomatisasi.",
  },
  listings: {
    title: "Workspace & Listing",
    subtitle: "Pusat kelola toko, akun Facebook, katalog produk, dan eksekusi bot otomatisasi.",
  },
  groups: {
    title: "Workspace & Listing",
    subtitle: "Pusat kelola toko, akun Facebook, katalog produk, dan eksekusi bot otomatisasi.",
  },
  analytics: {
    title: "Analitik & Laporan",
    subtitle: "Ringkasan performa, grafik aktivitas, dan pantauan kesehatan sistem.",
  },
  agent: {
    title: "Dashboard AI Agent",
    subtitle: "Statistik interaksi feed, memori pengguna, dan riwayat interaksi.",
  },
  chat: {
    title: "Auto-Reply Chat",
    subtitle: "Otomatisasi balasan inbox dan chat marketplace menggunakan AI.",
  },
  settings: {
    title: "Pengaturan",
    subtitle: "Konfigurasi bot, limit aksi, pengaturan AI, anti-deteksi, dan jadwal otomatisasi.",
  },
  notifications: {
    title: "Notifikasi",
    subtitle: "Peringatan sistem, hasil otomatisasi, dan pengingat tugas terjadwal.",
  },
};

function App() {
  const [activeTab, setActiveTab] = useState('workspace');
  const [selectedGroupId, setSelectedGroupId] = useState(() => {
    const saved = localStorage.getItem('autopost_selected_group');
    return saved ? Number(saved) : null;
  });
  const [data, setData] = useState({ accounts: [], listings: [], groups: [] });
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);

  const initFetch = async () => {
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

  const activeGroup = selectedGroupId ? data.groups.find(g => g.id === selectedGroupId) : null;

  const renderPage = () => {
    if (loading) return <div style={{ padding: '20px', color: 'var(--text-muted)' }}>Loading...</div>;
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
      case 'listings':
      case 'groups':
        return (
          <Workspace 
            listings={data.listings} 
            accounts={data.accounts} 
            groups={data.groups}
            selectedGroupId={selectedGroupId}
            onSelectGroup={handleSelectGroup}
            onRefresh={fetchData} 
          />
        );
      case 'analytics': return <Analytics selectedGroupId={selectedGroupId} groups={data.groups} />;
      case 'agent': return <AgentDashboard />;
      case 'chat': return <ChatDashboard />;
      case 'settings': return <Settings />;
      case 'notifications': return <Notifications />;
      default: return (
        <Workspace 
          listings={data.listings} 
          accounts={data.accounts} 
          groups={data.groups}
          selectedGroupId={selectedGroupId}
          onSelectGroup={handleSelectGroup}
          onRefresh={fetchData} 
        />
      );
    }
  };

  return (
    <Layout 
      activeTab={activeTab} 
      setActiveTab={setActiveTab}
      title={activeGroup ? `${tabInfo.title} — ${activeGroup.name}` : tabInfo.title}
      subtitle={tabInfo.subtitle}
      groups={data.groups}
      selectedGroupId={selectedGroupId}
      onSelectGroup={handleSelectGroup}
      onRefresh={fetchData}
    >
      <Suspense fallback={<div style={{ padding: '20px', color: 'var(--text-muted)' }}>Loading...</div>}>
        {renderPage()}
      </Suspense>
    </Layout>
  );
}

export default App;
