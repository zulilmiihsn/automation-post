import { 
  Image, Edit2, Trash2, Plus, ScanSearch, Play, Square as SquareIcon, 
  Terminal as TerminalIcon, X, Check, Layers, Package, Users, ChevronDown, 
  MoreHorizontal, RefreshCw, Zap, Flame, MessageSquare, ShieldCheck, Copy 
} from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import ListingsEdit from './ListingsEdit';
import { useAutoSave, SaveStatus } from '../hooks/useAutoSave';
import ScrapeModal from '../components/ScrapeModal';
import CommentModal from '../components/CommentModal';
import ConsoleModal from '../components/ConsoleModal';
import { api } from '../services/api';
import styles from './Listings.module.css';
import { useToast } from '../components/ToastContext';
import { useConfirm } from '../components/ConfirmContext';

const formatRupiah = (val) => {
  if (!val && val !== 0) return "Rp 0";
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
};

export default function Workspace({ 
  listings = [], 
  accounts = [], 
  groups = [], 
  selectedGroupId = null, 
  onSelectGroup, 
  onRefresh 
}) {
  const [editingItem, setEditingItem] = useState(null);
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [showScrapeModal, setShowScrapeModal] = useState(false);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [showAccountsModal, setShowAccountsModal] = useState(false);
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState({ name: '', accounts: [], listings: [] });
  const [showConsoleModal, setShowConsoleModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeLogs, setScrapeLogs] = useState([]);
  
  // Dropdown UI states
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Bot Engine States
  const [isRunningMp, setIsRunningMp] = useState(false);
  const [isRunningViral, setIsRunningViral] = useState(false);
  const [isRunningComment, setIsRunningComment] = useState(false);
  const [isRunningChat, setIsRunningChat] = useState(false);
  const [isRunningAgent, setIsRunningAgent] = useState(false);
  const [isRunningSundul, setIsRunningSundul] = useState(false);
  
  const toast = useToast();
  const confirm = useConfirm();
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [targetCommentUrl, setTargetCommentUrl] = useState("");
  const [commentAccountId, setCommentAccountId] = useState("");
  const [logs, setLogs] = useState([]);
  const eventSourceRef = useRef(null);
  const termRef = useRef(null);
  const scrapeTermRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = () => {
      setShowAddMenu(false);
      setShowMoreMenu(false);
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const activeGroup = selectedGroupId ? groups.find(g => g.id === Number(selectedGroupId)) : null;
  const filteredListings = activeGroup
    ? listings.filter(l => activeGroup.listings.includes(l.id))
    : listings;
  const groupAccounts = activeGroup
    ? accounts.filter(a => activeGroup.accounts.includes(a.id))
    : accounts;

  const activeAccountsCount = groupAccounts ? groupAccounts.filter(a => a.isActive && a.linked).length : 0;
  const activeMpListingsCount = filteredListings.filter(l => l.postMarketplace !== false && l.isActive !== false).length;
  const activeViralListingsCount = filteredListings.filter(l => l.autoFeed === true && l.isActive !== false).length;

  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [logs, showConsoleModal]);

  useEffect(() => {
    if (scrapeTermRef.current) {
      scrapeTermRef.current.scrollTop = scrapeTermRef.current.scrollHeight;
    }
  }, [scrapeLogs]);

  // Sync bot running status
  useEffect(() => {
    let timer;
    const checkEngineStatus = async () => {
      try {
        const res = await fetch('/api/automation-status');
        if (res.ok) {
          const status = await res.json();
          setIsRunningMp(status.isRunningMp || false);
          setIsRunningViral(status.isRunningViral || false);
          setIsRunningComment(status.isRunningComment || false);
          setIsRunningSundul(status.isRunningSundul || false);
          setIsRunningChat(status.isRunningChat || false);
          setIsRunningAgent(status.isRunningAgent || false);
        }
      } catch { /* silent */ }
    };
    checkEngineStatus();
    timer = setInterval(checkEngineStatus, 3000);
    return () => clearInterval(timer);
  }, []);

  // SSE Real-time Logs
  useEffect(() => {
    const es = new EventSource('/api/stream-logs');
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const item = JSON.parse(e.data);
        if (item && (item.msg || item.message)) {
          setLogs(prev => [...prev.slice(-300), item]);
        }
      } catch { /* ignore */ }
    };

    return () => {
      es.close();
    };
  }, []);

  const deleteListing = async (index) => {
    const item = filteredListings[index];
    if (!item || !item.id) return;
    if (!(await confirm(`Hapus "${item.title || 'produk ini'}"?`))) return;
    try {
      await api.deleteListing(item.id);
      toast.success("Produk berhasil dihapus");
      onRefresh();
    } catch (err) {
      toast.error("Gagal menghapus produk: " + err.message);
    }
  };

  const deleteAllSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!(await confirm(`Hapus ${selectedIds.length} produk terpilih secara massal?`))) return;
    try {
      await api.bulkDeleteListings(selectedIds);
      setSelectedIds([]);
      toast.success(`${selectedIds.length} produk berhasil dihapus`);
      onRefresh();
    } catch (err) {
      toast.error("Gagal hapus massal: " + err.message);
    }
  };

  const clearAllPostUrls = async () => {
    if (!(await confirm("Reset semua riwayat URL postingan? Bot akan posting ulang produk dari awal."))) return;
    try {
      await fetch("/api/listings/clear-urls", { method: "POST" });
      toast.success("Riwayat posting berhasil direset");
      onRefresh();
    } catch (err) {
      toast.error("Gagal reset URL: " + err.message);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectAll = () => {
    if (selectedIds.length === filteredListings.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredListings.map(l => l.id));
    }
  };

  const bulkUpdateToggle = async (field, val) => {
    if (selectedIds.length === 0) return;
    try {
      await api.bulkUpdateListings(selectedIds, { [field]: val });
      toast.success(`Berhasil update ${selectedIds.length} produk`);
      onRefresh();
    } catch (err) {
      toast.error("Gagal update massal: " + err.message);
    }
  };

  const bulkUpdateLocation = async () => {
    if (selectedIds.length === 0) return;
    const loc = prompt("Masukkan nama Kota / Lokasi (mis: Balikpapan, Samarinda):");
    if (!loc) return;
    try {
      await api.bulkUpdateListings(selectedIds, { location: loc });
      toast.success(`Lokasi ${selectedIds.length} produk diubah ke "${loc}"`);
      onRefresh();
    } catch (err) {
      toast.error("Gagal update lokasi: " + err.message);
    }
  };

  const startAutomation = async (mode, accountId = null, targetUrl = null) => {
    try {
      if (activeGroup) {
        await api.activateGroupExclusive(activeGroup.id);
        await new Promise(r => setTimeout(r, 200));
      }

      const res = await fetch("/api/run-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, accountId, targetUrl, commentTargetUrl: targetUrl })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success(data.message || `Otomasi ${mode} dimulai`);
      setShowConsoleModal(true);
    } catch (err) {
      toast.error(`Gagal memulai: ${err.message}`);
    }
  };

  const stopAutomation = async (mode) => {
    try {
      const res = await fetch("/api/stop-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: mode || 'all' })
      });
      const data = await res.json();
      toast.success(data.message || `Otomasi dihentikan`);
      setIsRunningMp(false);
      setIsRunningViral(false);
      setIsRunningSundul(false);
      setIsRunningComment(false);
      setIsRunningChat(false);
      setIsRunningAgent(false);
    } catch (err) {
      toast.error(`Gagal menghentikan: ${err.message}`);
    }
  };

  const handleCloneToAppliance = async (idsToClone = null) => {
    const targetIds = idsToClone || (selectedIds.length > 0 ? selectedIds : null);
    const targetCount = targetIds ? targetIds.length : filteredListings.length;
    const msg = targetIds 
      ? `Clone ${targetCount} produk terpilih ke kategori "Peralatan Rumah Tangga"?\n(Judul akan dibersihkan dari merk & diberi prefix [READY BERAU])`
      : `Clone SEMUA ${targetCount} produk di workspace ini ke kategori "Peralatan Rumah Tangga"?\n(Judul akan dibersihkan dari merk & diberi prefix [READY BERAU])`;
    
    if (!(await confirm(msg))) return;

    try {
      const res = await api.cloneToAppliance({
        ids: targetIds || filteredListings.map(l => l.id),
        targetGroupId: activeGroup ? activeGroup.id : null,
        prefix: "[READY BERAU] ",
        stripBrands: true
      });
      toast.success(res.message || `Berhasil clone ${res.count} produk`);
      onRefresh();
    } catch (err) {
      toast.error(`Gagal clone: ${err.message}`);
    }
  };

  const handleSundulAuto = async () => {
    try {
      if (activeGroup) {
        await api.activateGroupExclusive(activeGroup.id);
        await new Promise(r => setTimeout(r, 200));
      }
      const res = await api.runSundul({ autoMode: true });
      setLogs(prev => [...prev, { type: 'success', msg: `Bot Sundul: ${res.message}`, time: new Date().toLocaleTimeString() }]);
      setShowConsoleModal(true);
    } catch (err) {
      setLogs(prev => [...prev, { type: 'error', msg: `Gagal Sundul Auto: ${err.message}`, time: new Date().toLocaleTimeString() }]);
    }
  };

  const handleScrape = async () => {
    if (!scrapeUrl) return toast.error("Masukkan URL Facebook post");
    setIsScraping(true);
    setScrapeLogs([{ type: 'system', msg: `>>> Memulai scraping untuk URL: ${scrapeUrl} <<<` }]);

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          url: scrapeUrl,
          groupId: selectedGroupId || null
        })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);
      
      setScrapeLogs(prev => [...prev, { type: 'info', msg: data.message }]);

      const es = new EventSource(`/api/stream-logs?mode=all`);
      
      es.onmessage = (event) => {
        const streamData = JSON.parse(event.data);
        if (streamData.msg && streamData.msg.includes('[SCRAPER]')) {
          const rawMsg = streamData.msg.replace('[SCRAPER] ', '');
          let type = 'info';
          if (rawMsg.includes('[WARN]')) type = 'warn';
          if (rawMsg.includes('Berhasil') || rawMsg.includes('selesai')) type = 'success';
          if (rawMsg.includes('Gagal') || rawMsg.includes('ERROR')) type = 'error';
          if (rawMsg.includes('>>>') || rawMsg.includes('<<<')) type = 'system';
          
          setScrapeLogs(prev => [...prev, { type, msg: rawMsg, time: new Date().toLocaleTimeString() }]);

          if (rawMsg.includes('selesai') || rawMsg.includes('berhenti')) {
            es.close();
            setIsScraping(false);
            onRefresh();
          }
        }
      };

      es.onerror = () => {
        es.close();
        setIsScraping(false);
      };

    } catch (err) {
      setScrapeLogs(prev => [...prev, { type: 'error', msg: `Scrape gagal: ${err.message}` }]);
      setIsScraping(false);
    }
  };

  const saveWorkspace = async () => {
    if (!editingWorkspace.name.trim()) return toast.error('Nama Workspace harus diisi');
    try {
      if (editingWorkspace.id) {
        await api.updateGroup(editingWorkspace.id, editingWorkspace);
        toast.success('Workspace berhasil diperbarui');
      } else {
        const created = await api.addGroup(editingWorkspace);
        if (created && created.id && onSelectGroup) {
          onSelectGroup(created.id);
        }
        toast.success('Workspace baru dibuat');
      }
      setShowWorkspaceModal(false);
      onRefresh();
    } catch (err) {
      toast.error('Gagal menyimpan workspace: ' + err.message);
    }
  };

  const deleteWorkspace = async (id) => {
    if (!(await confirm('Hapus workspace ini? Produk dan akun di dalamnya tidak akan terhapus, hanya relasi grupnya.'))) return;
    try {
      await api.deleteGroup(id);
      if (selectedGroupId === id && onSelectGroup) {
        onSelectGroup(null);
      }
      toast.success('Workspace dihapus');
      onRefresh();
    } catch (err) {
      toast.error('Gagal menghapus workspace: ' + err.message);
    }
  };

  const isAnyBotRunning = isRunningMp || isRunningViral || isRunningSundul || isRunningComment || isRunningChat || isRunningAgent;
  const runningBotName = isRunningMp ? 'Marketplace' : isRunningViral ? 'Viral Share' : isRunningSundul ? 'Sundul' : isRunningComment ? 'Komentar' : isRunningChat ? 'Chat' : 'AI Agent';

  if (editingItem) {
    return (
      <ListingsEdit
        listing={editingItem}
        onBack={() => setEditingItem(null)}
        onSave={async (saved) => {
          if (saved && selectedGroupId && saved.id) {
            try {
              await api.addGroupListing(selectedGroupId, saved.id);
            } catch (_) {}
          }
          setEditingItem(null);
          onRefresh();
        }}
      />
    );
  }

  return (
    <section id="section-listings" className={styles.container}>
      
      {/* 1. TOP BAR: WORKSPACE SWITCHER PILLS + MAIN ACTION */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {/* Workspace Switcher Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          <button
            className={!selectedGroupId ? styles.groupPillActive : styles.groupPill}
            onClick={() => onSelectGroup && onSelectGroup(null)}
          >
            <Layers size={14} />
            <span>Semua Produk (Global)</span>
            <span className={!selectedGroupId ? styles.groupPillCountActive : styles.groupPillCount}>
              {listings.length}
            </span>
          </button>

          {groups.map(g => {
            const isSelected = Number(selectedGroupId) === g.id;
            return (
              <button
                key={g.id}
                className={isSelected ? styles.groupPillActive : styles.groupPill}
                onClick={() => onSelectGroup && onSelectGroup(g.id)}
              >
                <span>{g.name}</span>
                <span className={isSelected ? styles.groupPillCountActive : styles.groupPillCount}>
                  {g.listings.length}
                </span>
              </button>
            );
          })}

          <button
            className={styles.groupPill}
            style={{ borderStyle: 'dashed', color: '#10B981', borderColor: 'rgba(16, 185, 129, 0.3)' }}
            onClick={() => {
              setEditingWorkspace({ name: '', accounts: [], listings: [] });
              setShowWorkspaceModal(true);
            }}
          >
            <Plus size={14} />
            <span>Workspace Baru</span>
          </button>
        </div>

        {/* Right Action Group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
          {/* Main + Tambah Produk Dropdown */}
          <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button
              className="btn btn-primary"
              style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => setShowAddMenu(!showAddMenu)}
            >
              <Plus size={15} />
              <span>Tambah Produk</span>
              <ChevronDown size={13} style={{ opacity: 0.7 }} />
            </button>

            {showAddMenu && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: '6px',
                background: '#18181B', border: '1px solid #3F3F46', borderRadius: '14px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)', zIndex: 100, minWidth: '220px',
                overflow: 'hidden', padding: '6px'
              }}>
                <div
                  onClick={() => {
                    setShowAddMenu(false);
                    setEditingItem({ 
                      title: '', price: 0, photos: [], isActive: true, autoFeed: true,
                      targetGroup: 'berau', maxGroups: 20
                    });
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                    borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#FAFAFA',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Plus size={16} color="#10B981" />
                  <div>
                    <div style={{ fontWeight: 500 }}>Tambah Manual</div>
                    <div style={{ fontSize: '11px', color: '#71717A' }}>Buat produk baru sendiri</div>
                  </div>
                </div>

                <div
                  onClick={() => {
                    setShowAddMenu(false);
                    setShowScrapeModal(true);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                    borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#FAFAFA',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <ScanSearch size={16} color="#3B82F6" />
                  <div>
                    <div style={{ fontWeight: 500 }}>Scrape dari Facebook</div>
                    <div style={{ fontSize: '11px', color: '#71717A' }}>Tarik otomatis dari link post FB</div>
                  </div>
                </div>

                <div
                  onClick={() => {
                    setShowAddMenu(false);
                    handleCloneToAppliance();
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                    borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#FAFAFA',
                    transition: 'all 0.15s', borderTop: '1px solid #27272A'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <ShieldCheck size={16} color="#10B981" />
                  <div>
                    <div style={{ fontWeight: 500 }}>Clone Anti-Restrict (Peralatan)</div>
                    <div style={{ fontSize: '11px', color: '#71717A' }}>Hapus merk + ubah ke Peralatan Rumah Tangga</div>
                  </div>
                </div>

                {activeGroup && (
                  <div
                    onClick={() => {
                      setShowAddMenu(false);
                      setShowCatalogModal(true);
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                      borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#FAFAFA',
                      transition: 'all 0.15s', borderTop: '1px solid #27272A'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <Package size={16} color="#F59E0B" />
                    <div>
                      <div style={{ fontWeight: 500 }}>Pilih dari Katalog</div>
                      <div style={{ fontSize: '11px', color: '#71717A' }}>Masukkan produk yang sudah ada</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* More Options Dropdown (...) */}
          <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button
              className="btn btn-secondary"
              style={{ padding: '8px 10px', background: '#18181B', borderColor: '#27272A' }}
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              title="Opsi Lanjutan"
            >
              <MoreHorizontal size={15} />
            </button>

            {showMoreMenu && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: '6px',
                background: '#18181B', border: '1px solid #3F3F46', borderRadius: '14px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)', zIndex: 100, minWidth: '220px',
                overflow: 'hidden', padding: '6px'
              }}>
                <div
                  onClick={() => {
                    setShowMoreMenu(false);
                    handleCloneToAppliance();
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                    borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#10B981',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <ShieldCheck size={14} color="#10B981" />
                  <span>Clone Anti-Restrict (Peralatan)</span>
                </div>

                <div
                  onClick={() => {
                    setShowMoreMenu(false);
                    stopAutomation('all');
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                    borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#EF4444',
                    transition: 'all 0.15s', borderTop: '1px solid #27272A'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <SquareIcon size={14} color="#EF4444" fill="currentColor" />
                  <span>Hentikan Semua Bot (Stop)</span>
                </div>

                <div
                  onClick={() => {
                    setShowMoreMenu(false);
                    clearAllPostUrls();
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                    borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#FAFAFA',
                    transition: 'all 0.15s', borderTop: '1px solid #27272A'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <RefreshCw size={14} color="#F59E0B" />
                  <span>Reset Link Pos</span>
                </div>

                {activeGroup && (
                  <>
                    <div
                      onClick={() => {
                        setShowMoreMenu(false);
                        setEditingWorkspace({ ...activeGroup });
                        setShowWorkspaceModal(true);
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                        borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#FAFAFA',
                        transition: 'all 0.15s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <Edit2 size={14} color="#A1A1AA" />
                      <span>Edit Nama Workspace</span>
                    </div>

                    <div
                      onClick={() => {
                        setShowMoreMenu(false);
                        deleteWorkspace(activeGroup.id);
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                        borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#EF4444',
                        transition: 'all 0.15s', borderTop: '1px solid #27272A'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <Trash2 size={14} color="#EF4444" />
                      <span>Hapus Workspace Ini</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. SUB-LINE: CONTEXT INFO (ACCOUNTS & CATALOG) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#A1A1AA', marginBottom: '16px', paddingLeft: '4px', flexWrap: 'wrap' }}>
        <span style={{ color: '#FAFAFA', fontWeight: 500 }}>{filteredListings.length} Produk</span>
        <span>&bull;</span>
        
        {activeGroup ? (
          <button
            onClick={() => setShowAccountsModal(true)}
            style={{
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: '100px',
              padding: '2px 10px',
              color: '#10B981',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.15)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.08)'}
          >
            <Users size={12} />
            <span>{groupAccounts.length} Akun FB Bertugas</span>
            <span style={{ fontSize: '10px', opacity: 0.7 }}>(Ubah)</span>
          </button>
        ) : (
          <span>{accounts.length} Akun Terdaftar</span>
        )}

        {activeGroup && (
          <>
            <span>&bull;</span>
            <button
              onClick={() => setShowCatalogModal(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#3B82F6',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: 0
              }}
              onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
              onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
            >
              <Package size={12} />
              <span>Pilih dari Katalog</span>
            </button>
          </>
        )}
      </div>

      {/* 3. UNIFIED BOT & SELECTION COMMAND BAR */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#121214',
        border: '1px solid #27272A',
        borderRadius: '14px',
        padding: '10px 18px',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {/* Left: Checkbox Select All + Status + Konsol */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div 
            onClick={selectAll}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}
          >
            <div className={`${styles.customCheckbox} ${(filteredListings.length > 0 && selectedIds.length === filteredListings.length) ? styles.customCheckboxChecked : ''}`} style={{ width: '18px', height: '18px' }}>
              {(filteredListings.length > 0 && selectedIds.length === filteredListings.length) && <Check size={12} color="#000" strokeWidth={3} />}
            </div>
            <span style={{ fontSize: '13px', fontWeight: 500, color: '#D4D4D8' }}>
              Pilih Semua ({filteredListings.length})
            </span>
          </div>

          <div style={{ width: '1px', height: '18px', background: '#27272A' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: isAnyBotRunning ? '#10B981' : '#71717A',
              boxShadow: isAnyBotRunning ? '0 0 8px #10B981' : 'none'
            }} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: isAnyBotRunning ? '#10B981' : '#A1A1AA' }}>
              {isAnyBotRunning ? `Bot Aktif (${runningBotName})` : 'Sistem Idle'}
            </span>
          </div>

          <button 
            className="btn btn-secondary"
            style={{ padding: '4px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '5px', borderRadius: '6px' }}
            onClick={() => setShowConsoleModal(true)}
          >
            <TerminalIcon size={12} />
            <span>Konsol</span>
          </button>
        </div>

        {/* Center: Readiness Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#A1A1AA' }}>
            <strong style={{ color: '#FAFAFA' }}>{activeMpListingsCount}</strong>
            <span style={{ fontSize: '11px' }}>MP</span>
          </div>
          <span style={{ color: '#27272A' }}>|</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#A1A1AA' }}>
            <strong style={{ color: '#FAFAFA' }}>{activeViralListingsCount}</strong>
            <span style={{ fontSize: '11px' }}>Viral</span>
          </div>
          <span style={{ color: '#27272A' }}>|</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#A1A1AA' }}>
            <strong style={{ color: activeAccountsCount > 0 ? '#10B981' : '#EF4444' }}>{activeAccountsCount}</strong>
            <span style={{ fontSize: '11px' }}>Akun</span>
          </div>
        </div>

        {/* Right: Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isAnyBotRunning ? (
            <button 
              className="btn btn-danger"
              style={{ padding: '6px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => {
                if (isRunningMp) stopAutomation('marketplace');
                if (isRunningViral) stopAutomation('viral');
                if (isRunningSundul) stopAutomation('sundul');
                if (isRunningComment) stopAutomation('comment');
              }}
            >
              <SquareIcon size={12} fill="currentColor" />
              <span>Hentikan Bot ({runningBotName})</span>
            </button>
          ) : (
            <>
              <button 
                className="btn btn-success"
                style={{ padding: '6px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}
                onClick={() => startAutomation('marketplace')}
                disabled={activeAccountsCount === 0 || activeMpListingsCount === 0}
              >
                <Play size={12} fill="currentColor" />
                <span>Jalankan Post</span>
              </button>

              <button 
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={handleSundulAuto}
                disabled={activeAccountsCount === 0 || activeMpListingsCount === 0}
                title="Perbarui / Sundul Postingan Lama"
              >
                <Zap size={12} color="#10B981" />
                <span>Sundul</span>
              </button>

              <button 
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={() => startAutomation('viral')}
                disabled={activeAccountsCount === 0 || activeViralListingsCount === 0}
                title="Share ke Grup Facebook"
              >
                <Flame size={12} color="#F59E0B" />
                <span>Viral</span>
              </button>

              <button 
                className="btn btn-secondary"
                style={{ padding: '6px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={() => setShowCommentModal(true)}
                disabled={activeAccountsCount === 0}
                title="Komentar Massal"
              >
                <MessageSquare size={12} color="#3B82F6" />
                <span>Komentar</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 4. LISTINGS GRID */}
      <div className={styles.listingsGrid}>
        {filteredListings.length === 0 ? (
          <div className={styles.emptyGroupCard}>
            <Package size={44} color="#52525B" strokeWidth={1.5} />
            <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#FAFAFA', margin: '16px 0 6px 0' }}>
              {activeGroup ? `Belum Ada Produk di Workspace "${activeGroup.name}"` : 'Belum Ada Produk'}
            </h3>
            <p style={{ fontSize: '14px', color: '#A1A1AA', maxWidth: '440px', margin: '0 0 24px 0', lineHeight: 1.5 }}>
              {activeGroup 
                ? 'Tambahkan produk baru ke workspace ini atau pilih produk dari katalog utama untuk dimasukkan.'
                : 'Mulai dengan menambahkan produk secara manual atau gunakan fitur Scrape FB.'}
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {activeGroup && (
                <button className="btn btn-primary" onClick={() => setShowCatalogModal(true)}>
                  <Package size={15} />
                  <span>Pilih dari Katalog ({listings.length})</span>
                </button>
              )}
              <button className="btn btn-success" onClick={() => {
                setEditingItem({ 
                  title: '', price: 0, photos: [], isActive: true, autoFeed: true,
                  targetGroup: 'berau', maxGroups: 20
                });
              }}>
                <Plus size={15} />
                <span>Tambah Manual</span>
              </button>
              <button className="btn btn-secondary" onClick={() => setShowScrapeModal(true)}>
                <ScanSearch size={15} />
                <span>Scrape FB</span>
              </button>
            </div>
          </div>
        ) : (
          filteredListings.map((item, index) => {
            let firstPhoto = item.photos && item.photos.length > 0 ? item.photos[0] : null;
            if (firstPhoto && !firstPhoto.startsWith("/")) firstPhoto = `/${firstPhoto}`;
            
            return (
              <div key={item.id || index} className={`item-card ${styles.itemCard}`}>
                <div className={styles.imageWrapper}>
                  {firstPhoto ? (
                    <img src={firstPhoto} className={styles.firstImage} alt="Product" />
                  ) : (
                    <div className={styles.noImageWrapper}>
                      <Image size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
                      <span className={styles.noImageText}>Tanpa Gambar</span>
                    </div>
                  )}
                  
                  <div 
                    onClick={(e) => { e.stopPropagation(); toggleSelect(item.id); }}
                    className={`${styles.customCheckbox} ${styles.itemCheckbox} ${selectedIds.includes(item.id) ? styles.customCheckboxChecked : ''}`}
                  >
                    {selectedIds.includes(item.id) && <Check size={14} color="#000" strokeWidth={3} />}
                  </div>
                </div>
                
                <h3 className={styles.itemTitle}>
                  {item.title || "Produk Tanpa Judul"}
                </h3>
                
                <div className={styles.itemToggles}>
                  <ListingToggle item={item} type="mp" />
                  <ListingToggle item={item} type="feed" />
                </div>
                
                <div className={styles.itemMeta}>
                  <div className={styles.metaRow}>
                    <span className={styles.metaLabel}>Kategori</span>
                    <span className={styles.metaVal}>{item.category || "-"}</span>
                  </div>
                  <div className={styles.metaRow}>
                    <span className={styles.metaLabel}>Kondisi</span>
                    <span className={styles.metaVal}>{item.condition || "-"}</span>
                  </div>
                  <div className={styles.metaDivider}>
                    <span className={styles.metaLabel}>Harga</span>
                    <strong className={styles.metaPrice}>{formatRupiah(item.price)}</strong>
                  </div>
                </div>
                
                <div className={styles.itemActions}>
                  <button className={`btn btn-primary ${styles.btnEdit}`} onClick={() => setEditingItem(item)}>
                    <Edit2 size={14} /> 
                    <span>Edit Data</span>
                  </button>
                  <button className={`btn btn-danger ${styles.btnDelete}`} onClick={() => deleteListing(index)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 5. FLOATING BULK ACTIONS BAR */}
      {selectedIds.length > 0 && (
        <div className={styles.floatingActionBar}>
          <style>{`
            @keyframes slideUp {
              from { transform: translate(-50%, 20px); opacity: 0; }
              to { transform: translate(-50%, 0); opacity: 1; }
            }
          `}</style>
          
          <div className={styles.floatingSelectedInfo}>
            <div className={styles.badgeCount}>
              {selectedIds.length}
            </div>
            <span className={styles.selectedCountText}>Produk Terpilih</span>
          </div>

          <div className={styles.verticalDivider}></div>

          <div className={styles.floatingControls}>
            <div className={styles.controlGroup}>
              <div className={styles.controlIndicator}>
                <span className={styles.controlCircle}></span>
                <span className={styles.controlLabel}>MARKETPLACE</span>
              </div>
              <div className={styles.toggleContainer}>
                <button 
                  className={styles.toggleBtnOn} 
                  onClick={() => bulkUpdateToggle('postMarketplace', true)}
                >ON</button>
                <button 
                  className={styles.toggleBtnOff} 
                  onClick={() => bulkUpdateToggle('postMarketplace', false)}
                >OFF</button>
              </div>
            </div>

            <div className={styles.verticalDivider}></div>

            <div className={styles.controlGroup}>
              <div className={styles.controlIndicator}>
                <span className={styles.controlCircle}></span>
                <span className={styles.controlLabel}>VIRAL SHARE</span>
              </div>
              <div className={styles.toggleContainer}>
                <button 
                  className={styles.toggleBtnOn} 
                  onClick={() => bulkUpdateToggle('autoFeed', true)}
                >ON</button>
                <button 
                  className={styles.toggleBtnOff} 
                  onClick={() => bulkUpdateToggle('autoFeed', false)}
                >OFF</button>
              </div>
            </div>

            <div className={styles.verticalDivider}></div>

            <div className={styles.controlGroup}>
              <div className={styles.controlIndicator}>
                <span className={styles.controlCircle}></span>
                <span className={styles.controlLabel}>LOKASI</span>
              </div>
              <div className={styles.toggleContainer}>
                <button 
                  className={styles.toggleBtnOn} 
                  style={{ width: 'auto', padding: '0 16px' }}
                  onClick={bulkUpdateLocation}
                >SET LOKASI</button>
              </div>
            </div>

            <div className={styles.verticalDivider}></div>
            
            <button className={`btn ${styles.btnBulkDelete}`} onClick={deleteAllSelected}>
              <Trash2 size={14} style={{ marginRight: '6px' }} /> Hapus
            </button>
            
            <button className={`btn ${styles.btnBulkClose}`} onClick={() => setSelectedIds([])}>
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* MODAL: SCRAPE FB */}
      <ScrapeModal
        show={showScrapeModal}
        onClose={() => setShowScrapeModal(false)}
        isScraping={isScraping}
        scrapeUrl={scrapeUrl}
        onScrapeUrlChange={setScrapeUrl}
        scrapeLogs={scrapeLogs}
        scrapeTermRef={scrapeTermRef}
        onScrape={handleScrape}
      />

      {/* MODAL: COMMENT ATTACK TARGET */}
      <CommentModal
        show={showCommentModal}
        onClose={() => setShowCommentModal(false)}
        accounts={accounts}
        selectedAccountId={commentAccountId}
        onSelectedAccountIdChange={setCommentAccountId}
        targetCommentUrl={targetCommentUrl}
        onTargetCommentUrlChange={setTargetCommentUrl}
        onSubmit={async () => {
          setShowCommentModal(false);
          startAutomation('comment', commentAccountId, targetCommentUrl);
        }}
      />

      {/* MODAL: BOT CONSOLE */}
      <ConsoleModal
        show={showConsoleModal}
        onClose={() => setShowConsoleModal(false)}
        logs={logs}
        onClearLogs={() => setLogs([])}
        isRunningMp={isRunningMp}
        isRunningViral={isRunningViral}
        isRunningComment={isRunningComment}
        isRunningSundul={isRunningSundul}
        isRunningChat={isRunningChat}
        isRunningAgent={isRunningAgent}
        isRunningScraper={isScraping}
        termRef={termRef}
      />

      {/* MODAL: PILIH DARI KATALOG */}
      {showCatalogModal && activeGroup && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '680px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '24px', borderRadius: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#FAFAFA', margin: 0 }}>
                  Pilih Produk untuk "{activeGroup.name}"
                </h3>
                <p style={{ fontSize: '13px', color: '#A1A1AA', margin: '4px 0 0 0' }}>
                  Centang produk dari katalog utama untuk dimasukkan atau dikeluarkan dari workspace ini.
                </p>
              </div>
              <button className="btn" style={{ padding: '6px', background: 'transparent' }} onClick={() => setShowCatalogModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px', marginBottom: '16px' }}>
              {listings.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: '#71717A' }}>
                  Katalog masih kosong. Tambah produk baru terlebih dahulu.
                </div>
              ) : (
                listings.map(l => {
                  const isAssigned = activeGroup.listings.includes(l.id);
                  let thumb = l.photos && l.photos.length > 0 ? l.photos[0] : null;
                  if (thumb && !thumb.startsWith("/")) thumb = `/${thumb}`;

                  return (
                    <div 
                      key={l.id}
                      onClick={async () => {
                        try {
                          if (isAssigned) {
                            await api.removeGroupListing(activeGroup.id, l.id);
                          } else {
                            await api.addGroupListing(activeGroup.id, l.id);
                          }
                          onRefresh();
                        } catch (err) {
                          toast.error("Gagal update relasi: " + err.message);
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        background: isAssigned ? 'rgba(16, 185, 129, 0.08)' : '#18181B',
                        border: `1px solid ${isAssigned ? 'rgba(16, 185, 129, 0.3)' : '#27272A'}`,
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '20px', height: '20px', borderRadius: '5px',
                          border: `2px solid ${isAssigned ? '#10B981' : '#52525B'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: isAssigned ? '#10B981' : 'transparent'
                        }}>
                          {isAssigned && <Check size={12} color="#000" strokeWidth={3} />}
                        </div>
                        {thumb ? (
                          <img src={thumb} style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover' }} alt="" />
                        ) : (
                          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#27272A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Image size={18} color="#71717A" />
                          </div>
                        )}
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 500, color: '#FAFAFA' }}>{l.title}</div>
                          <div style={{ fontSize: '12px', color: '#A1A1AA' }}>{formatRupiah(l.price)} &bull; {l.category || 'Lain-lain'}</div>
                        </div>
                      </div>
                      
                      <div style={{ fontSize: '12px', fontWeight: 600, color: isAssigned ? '#10B981' : '#71717A' }}>
                        {isAssigned ? 'Terpilih' : 'Klik untuk Pilih'}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ paddingTop: '16px', borderTop: '1px solid #27272A', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => setShowCatalogModal(false)}>
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ATUR AKUN WORKSPACE */}
      {showAccountsModal && activeGroup && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '580px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '24px', borderRadius: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#FAFAFA', margin: 0 }}>
                  Atur Akun Facebook untuk "{activeGroup.name}"
                </h3>
                <p style={{ fontSize: '13px', color: '#A1A1AA', margin: '4px 0 0 0' }}>
                  Pilih akun-akun Facebook yang bertugas menjalankan postingan workspace ini.
                </p>
              </div>
              <button className="btn" style={{ padding: '6px', background: 'transparent' }} onClick={() => setShowAccountsModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px', marginBottom: '16px' }}>
              {accounts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: '#71717A' }}>
                  Belum ada akun Facebook tersimpan. Tambah akun di menu Akun Facebook terlebih dahulu.
                </div>
              ) : (
                accounts.map(a => {
                  const isAssigned = activeGroup.accounts.includes(a.id);
                  const isReady = a.isActive && a.linked;

                  return (
                    <div 
                      key={a.id}
                      onClick={async () => {
                        try {
                          const updatedAccounts = isAssigned
                            ? activeGroup.accounts.filter(id => id !== a.id)
                            : [...activeGroup.accounts, a.id];
                          await api.updateGroup(activeGroup.id, {
                            ...activeGroup,
                            accounts: updatedAccounts
                          });
                          onRefresh();
                        } catch (err) {
                          toast.error("Gagal update akun grup: " + err.message);
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        background: isAssigned ? 'rgba(16, 185, 129, 0.08)' : '#18181B',
                        border: `1px solid ${isAssigned ? 'rgba(16, 185, 129, 0.3)' : '#27272A'}`,
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '20px', height: '20px', borderRadius: '5px',
                          border: `2px solid ${isAssigned ? '#10B981' : '#52525B'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: isAssigned ? '#10B981' : 'transparent'
                        }}>
                          {isAssigned && <Check size={12} color="#000" strokeWidth={3} />}
                        </div>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 500, color: '#FAFAFA', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>{a.fbName || a.name}</span>
                            <span style={{
                              padding: '2px 8px', borderRadius: '100px', fontSize: '10px', fontWeight: 600,
                              background: isReady ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              color: isReady ? '#10B981' : '#EF4444'
                            }}>
                              {isReady ? 'SIAP' : 'BELUM LOGIN'}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#71717A' }}>Profile: {a.profile}</div>
                        </div>
                      </div>
                      
                      <div style={{ fontSize: '12px', fontWeight: 600, color: isAssigned ? '#10B981' : '#71717A' }}>
                        {isAssigned ? 'Ditugaskan' : 'Klik untuk Pilih'}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ paddingTop: '16px', borderTop: '1px solid #27272A', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => setShowAccountsModal(false)}>
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BUAT / EDIT WORKSPACE */}
      {showWorkspaceModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '640px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '28px', borderRadius: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#FAFAFA', margin: 0 }}>
                  {editingWorkspace.id ? 'Edit Nama Workspace' : 'Buat Workspace Baru'}
                </h3>
                <p style={{ fontSize: '13px', color: '#A1A1AA', margin: '4px 0 0 0' }}>
                  Buat toko/proyek terpisah dengan daftar produk dan akun tersendiri.
                </p>
              </div>
              <button className="btn" style={{ padding: '6px', background: 'transparent' }} onClick={() => setShowWorkspaceModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#FAFAFA', marginBottom: '8px' }}>
                  Nama Workspace / Toko
                </label>
                <input 
                  type="text" 
                  style={{
                    background: '#18181B', border: '1px solid #3F3F46', borderRadius: '12px',
                    color: '#FAFAFA', padding: '14px 16px', fontSize: '14px', width: '100%', outline: 'none'
                  }}
                  placeholder="Misal: Jualan Hendy, Motor Bekas, Toko Baju..."
                  value={editingWorkspace.name}
                  onChange={e => setEditingWorkspace({ ...editingWorkspace, name: e.target.value })}
                  autoFocus
                />
              </div>
            </div>

            <div style={{ paddingTop: '16px', borderTop: '1px solid #27272A', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn btn-secondary" onClick={() => setShowWorkspaceModal(false)}>
                Batal
              </button>
              <button className="btn btn-primary" onClick={saveWorkspace}>
                {editingWorkspace.id ? 'Simpan Perubahan' : 'Buat Workspace'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ListingToggle({ item, type }) {
  const field = type === 'mp' ? 'postMarketplace' : 'autoFeed';
  const defaultValue = type === 'mp' ? item.postMarketplace !== false : !!item.autoFeed;
  const [active, setActive] = useState(defaultValue);
  
  useEffect(() => {
    setActive(defaultValue);
  }, [defaultValue]);

  const saveFn = useCallback(
    (val) => fetch(`/api/listings/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...item, [field]: val }),
    }),
    [item.id, field, item]
  );
  const { triggerSave, status } = useAutoSave(saveFn, 0);

  return (
    <div 
      className={active ? styles.premiumToggleActive : styles.premiumToggle}
      onClick={() => {
        const newState = !active;
        setActive(newState);
        triggerSave(newState);
      }}
    >
      <div className={active ? styles.toggleDotActive : styles.toggleDot}></div>
      <span className={active ? styles.toggleTextActive : styles.toggleText}>
        {type === 'mp' ? 'MARKETPLACE' : 'VIRAL SHARE'}
      </span>
      {status !== 'idle' && <SaveStatus status={status} />}
    </div>
  );
}
