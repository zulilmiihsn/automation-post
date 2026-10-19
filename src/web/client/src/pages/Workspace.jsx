import {
  Edit2, Trash2, Plus, ScanSearch, Play, Square as SquareIcon,
  X, Check, Layers, Package, Settings as SettingsIcon,
  Zap, Flame, MessageSquare, ShieldCheck
} from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import ListingsEdit from './ListingsEdit';
import { useAutoSave, SaveStatus } from '../hooks/useAutoSave';
import ScrapeModal from '../components/ScrapeModal';
import CommentModal from '../components/CommentModal';
import ListingThumb from '../components/ListingThumb';
import ListingTitle from '../components/ListingTitle';
import UndoBar from '../components/UndoBar';
import { useListingFilter } from '../hooks/useListingFilter';
import { useTrashUndo } from '../hooks/useTrashUndo';
import { usePager, Pager } from '../hooks/usePager';
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
  onManageWorkspaces,
  onRefresh
}) {
  const [editingItem, setEditingItem] = useState(null);
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [showScrapeModal, setShowScrapeModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeLogs, setScrapeLogs] = useState([]);
  
  // Dropdown UI states
  const [showFabMenu, setShowFabMenu] = useState(false);
  const [showRunMenu, setShowRunMenu] = useState(false);

  // Bot Engine States
  const [isRunningMp, setIsRunningMp] = useState(false);
  const [isRunningViral, setIsRunningViral] = useState(false);
  const [isRunningComment, setIsRunningComment] = useState(false);
  const [isRunningChat, setIsRunningChat] = useState(false);
  const [isRunningAgent, setIsRunningAgent] = useState(false);
  const [isRunningSundul, setIsRunningSundul] = useState(false);
  
  const toast = useToast();
  const confirm = useConfirm();
  const [photoHealth, setPhotoHealth] = useState(null);
  const { trash, doTrash, undo, dismiss } = useTrashUndo(onRefresh, toast);

  useEffect(() => {
    let alive = true;
    api.getPhotoHealth().then((d) => { if (alive) setPhotoHealth(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [targetCommentUrl, setTargetCommentUrl] = useState("");
  const [commentAccountId, setCommentAccountId] = useState("");
  const scrapeTermRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = () => {
      setShowFabMenu(false);
      setShowRunMenu(false);
    };
    window.addEventListener('click', handleClickOutside);
    return () => {
      window.removeEventListener('click', handleClickOutside);
    };
  }, []);

  const activeGroup = selectedGroupId ? groups.find(g => g.id === Number(selectedGroupId)) : null;
  const groupBase = activeGroup
    ? listings.filter(l => activeGroup.listings.includes(l.id))
    : listings;
  const { query, setQuery, sort, setSort, result: filteredListings } = useListingFilter(groupBase, 'workspace');
  const { page, setPage, pages, total, slice: pageSlice } = usePager(filteredListings, 24, 'workspace');

  useEffect(() => { setPage(1); }, [query, sort, setPage]);
  const groupAccounts = activeGroup
    ? accounts.filter(a => activeGroup.accounts.includes(a.id))
    : accounts;

  const activeAccountsCount = groupAccounts ? groupAccounts.filter(a => a.isActive && a.linked).length : 0;
  const activeMpListingsCount = groupBase.filter(l => l.postMarketplace !== false && l.isActive !== false).length;
  const activeViralListingsCount = groupBase.filter(l => l.autoFeed === true && l.isActive !== false).length;

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

  const deleteListing = async (item) => {
    if (!item || !item.id) return;
    const photoCount = Array.isArray(item.photos) ? item.photos.length : 0;
    const ok = await confirm(`Pindah "${item.title || 'produk ini'}" (ID ${item.id}, ${photoCount} foto) ke sampah? Bisa diurungkan 10 detik. File foto tetap aman.`);
    if (!ok) return;
    try {
      await doTrash([item.id], item.title || `ID ${item.id}`);
      setSelectedIds((prev) => prev.filter((x) => x !== item.id));
    } catch (err) {
      toast.error("Gagal menghapus produk: " + err.message);
    }
  };

  const deleteAllSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!(await confirm(`Pindah ${selectedIds.length} produk terpilih ke sampah? Bisa diurungkan 10 detik.`))) return;
    try {
      const ids = [...selectedIds];
      await doTrash(ids, `${ids.length} produk`);
      setSelectedIds([]);
    } catch (err) {
      toast.error("Gagal hapus massal: " + err.message);
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
      window.dispatchEvent(new Event('autopost:open-console'));
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
    const ok = await confirm(
      `Duplikat ${targetCount} produk ke "Peralatan Rumah Tangga"? Foto ikut disalin, aman dihapus terpisah.`,
    );
    if (!ok) return;

    try {
      const res = await api.cloneToAppliance({
        ids: targetIds || filteredListings.map(l => l.id),
        targetGroupId: activeGroup ? activeGroup.id : null,
        prefix: "[READY BERAU] ",
        stripBrands: true
      });
      toast.success(res.message || `Berhasil duplikat ${res.count} produk`);
      onRefresh();
    } catch (err) {
      toast.error(`Gagal duplikat: ${err.message}`);
    }
  };

  const handleSundulAuto = async () => {    try {
      if (activeGroup) {
        await api.activateGroupExclusive(activeGroup.id);
        await new Promise(r => setTimeout(r, 200));
      }
      await api.runSundul({ autoMode: true });
      window.dispatchEvent(new Event('autopost:open-console'));
    } catch (err) {
      toast.error(`Gagal Sundul Auto: ${err.message}`);
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



  const isAnyBotRunning = isRunningMp || isRunningViral || isRunningSundul || isRunningComment || isRunningChat || isRunningAgent;
  const runningModes = [
    isRunningMp && 'Post',
    isRunningViral && 'Viral',
    isRunningSundul && 'Sundul',
    isRunningComment && 'Komentar',
    isRunningChat && 'Chat',
    isRunningAgent && 'Agent',
  ].filter(Boolean);

  if (editingItem) {
    return (
      <ListingsEdit
        listing={editingItem}
        onBack={() => setEditingItem(null)}
        onSave={async (saved) => {
          if (saved && selectedGroupId && saved.id) {
            try {
              await api.addGroupListing(selectedGroupId, saved.id);
             } catch (error) {
               console.error('Gagal menautkan listing ke grup:', error);
             }
          }
          setEditingItem(null);
          onRefresh();
        }}
      />
    );
  }

  return (
    <section id="section-listings" className={styles.container}>

      {/* STICKY: WORKSPACE SWITCHER + COMMAND BAR */}
      <div className="workspace-sticky">
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
            style={{ borderStyle: 'dashed', color: 'var(--success)', borderColor: 'rgba(16, 185, 129, 0.3)' }}
            onClick={() => onManageWorkspaces && onManageWorkspaces()}
          >
            <SettingsIcon size={14} />
            <span>Kelola</span>
          </button>
        </div>
      </div>

      {/* 3. UNIFIED BOT & SELECTION COMMAND BAR */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '14px',
        padding: '10px 18px',
        marginBottom: 0,
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
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)' }}>
              Pilih Semua ({filteredListings.length})
            </span>
          </div>
        </div>

        {/* Center: Readiness Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div title="Produk siap posting ke Marketplace" style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text)' }}>{activeMpListingsCount}</strong>
            <span style={{ fontSize: '11px' }}>Marketplace</span>
          </div>
          <span style={{ color: 'var(--border-light)' }}>|</span>
          <div title="Produk siap bagikan ke grup" style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text)' }}>{activeViralListingsCount}</strong>
            <span style={{ fontSize: '11px' }}>ke Grup</span>
          </div>
          <span style={{ color: 'var(--border-light)' }}>|</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-muted)' }}>
            <strong style={{ color: activeAccountsCount > 0 ? 'var(--success)' : 'var(--danger)' }}>{activeAccountsCount}</strong>
            <span style={{ fontSize: '11px' }}>Akun</span>
          </div>
        </div>

        {/* Right: Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isAnyBotRunning ? (
            <button 
              className="btn btn-danger"
              style={{ padding: '9px 18px', fontSize: '13px', minHeight: '38px', display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 600 }}
              onClick={() => stopAutomation('all')}
              title={`Hentikan: ${runningModes.join(', ')}`}
            >
              <SquareIcon size={13} fill="currentColor" />
              <span>Stop Semua ({runningModes.length})</span>
            </button>
          ) : (
            <>
              <button
                className="btn btn-success"
                style={{ padding: '9px 18px', fontSize: '13px', minHeight: '38px', display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 600 }}
                onClick={() => startAutomation('marketplace')}
                disabled={activeAccountsCount === 0 || activeMpListingsCount === 0}
                title="Posting semua produk aktif ke Toko (Marketplace)"
              >
                <Play size={13} fill="currentColor" />
                <span>Posting Jualan</span>
              </button>

              <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '9px 16px', fontSize: '13px', minHeight: '38px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}
                  onClick={() => setShowRunMenu(!showRunMenu)}
                  disabled={activeAccountsCount === 0 || isAnyBotRunning}
                  title="Tugas lain: Sundul, Viral, Komentar"
                >
                  <span>Lainnya ▾</span>
                </button>
                {showRunMenu && (
                  <div style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: '6px',
                    background: 'var(--card-hover)', border: '1px solid var(--border-light)', borderRadius: '14px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)', zIndex: 100, minWidth: '250px',
                    overflow: 'hidden', padding: '6px'
                  }}>
                    <div
                      onClick={() => { setShowRunMenu(false); handleSundulAuto(); }}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--card)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <Zap size={14} color="var(--success)" />
                      <div>
                        <div style={{ fontWeight: 500 }}>Sundul</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Naikkan postingan lama ke atas</div>
                      </div>
                    </div>
                    <div
                      onClick={() => { setShowRunMenu(false); startAutomation('viral'); }}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--card)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <Flame size={14} color="#F59E0B" />
                      <div>
                        <div style={{ fontWeight: 500 }}>Bagikan ke Grup</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sebar postingan ke banyak grup</div>
                      </div>
                    </div>
                    <div
                      onClick={() => { setShowRunMenu(false); setShowCommentModal(true); }}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--card)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <MessageSquare size={14} color="#3B82F6" />
                      <div>
                        <div style={{ fontWeight: 500 }}>Komentar</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Komentar massal ke postingan</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      </div>

      {/* 4. LISTINGS GRID */}
      {photoHealth && photoHealth.missingCount > 0 ? (
        <div className={styles.healthBanner}>
          <span>{photoHealth.missingCount} foto hilang di disk dari {photoHealth.totalRefs} referensi. Klik Perbaiki di kartu.</span>
          <button className="btn btn-danger" onClick={() => api.getPhotoHealth().then(setPhotoHealth).catch(() => {})}>Cek Ulang</button>
        </div>
      ) : photoHealth ? (
        <div className={styles.healthBannerOk}>
          <span>Foto aman: {photoHealth.totalRefs} referensi, {photoHealth.diskAssets} file di assets.</span>
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari produk..."
          aria-label="Cari produk"
          style={{ flex: '1 1 220px', minWidth: 180 }}
        />
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Urutkan produk" style={{ flex: '0 1 170px' }}>
          <option value="newest">Terbaru</option>
          <option value="priceAsc">Harga terendah</option>
          <option value="priceDesc">Harga tertinggi</option>
          <option value="title">Judul A-Z</option>
        </select>
      </div>
      <div className={styles.listingsGrid}>
        {filteredListings.length === 0 ? (
          <div className={styles.emptyGroupCard}>
            <Package size={44} color="#52525B" strokeWidth={1.5} />
            <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)', margin: '16px 0 6px 0' }}>
              {activeGroup ? `Belum Ada Produk di Workspace "${activeGroup.name}"` : 'Belum Ada Produk'}
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', maxWidth: '440px', margin: '0 0 24px 0', lineHeight: 1.5 }}>
              {activeGroup
                ? 'Tambahkan produk baru ke workspace ini atau atur dari halaman Atur Workspace.'
                : 'Mulai dengan menambahkan produk secara manual atau gunakan fitur Scrape FB.'}
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {activeGroup && (
                <button className="btn btn-primary" onClick={() => onManageWorkspaces && onManageWorkspaces()}>
                  <Package size={15} />
                  <span>Atur Produk ({listings.length})</span>
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
          pageSlice.map((item, index) => {
            const noPhoto = !item.photos || item.photos.length === 0;
            
            return (
              <div key={item.id || index} className={`item-card ${styles.itemCard}`}>
                <div className={styles.imageWrapper}>
                  <ListingThumb photos={item.photos} title={item.title} onFix={() => setEditingItem(item)} />
                  
                  <div 
                    onClick={(e) => { e.stopPropagation(); toggleSelect(item.id); }}
                    className={`${styles.customCheckbox} ${styles.itemCheckbox} ${selectedIds.includes(item.id) ? styles.customCheckboxChecked : ''}`}
                  >
                    {selectedIds.includes(item.id) && <Check size={14} color="#000" strokeWidth={3} />}
                  </div>
                </div>
                
                <ListingTitle text={item.title} />
                {noPhoto && (
                  <div className={styles.flagRow}>
                    <span className={styles.flagPhoto}>TANPA FOTO</span>
                  </div>
                )}
                
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
                  <button className={`btn btn-danger ${styles.btnDelete}`} onClick={() => deleteListing(item)} aria-label={`Hapus ${item.title || 'produk'}`} title="Hapus produk">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      <Pager page={page} pages={pages} total={total} onPage={setPage} />

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
            <span className={styles.badgeLabel}>Produk Terpilih</span>
          </div>

          <div className={styles.verticalDivider}></div>

          <div className={styles.floatingControls}>
            <div className={styles.controlGroup}>
              <div className={styles.controlIndicator}>
                <span className={styles.controlCircle}></span>
                <span className={styles.controlLabel}>KE MARKETPLACE</span>
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
                <span className={styles.controlLabel}>KE GRUP</span>
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
      <UndoBar trash={trash} onUndo={undo} onDismiss={dismiss} />

      {/* TOMBOL + MELAYANG: tambah produk */}
      <div style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 90 }} onClick={(e) => e.stopPropagation()}>
        {showFabMenu && (
          <div style={{
            position: 'absolute', bottom: 64, right: 0,
            background: 'var(--card-hover)', border: '1px solid var(--border-light)', borderRadius: 14,
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)', minWidth: 250, overflow: 'hidden', padding: 6,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', padding: '8px 14px 4px 14px' }}>
              MAU TAMBAH APA?
            </div>
            {[
              { n: 1, title: 'Tulis sendiri', desc: 'Ketik judul, harga, foto', icon: <Plus size={16} color="var(--success)" />, run: () => setEditingItem({ title: '', price: 0, photos: [], isActive: true, autoFeed: true, targetGroup: 'berau', maxGroups: 20 }) },
              { n: 2, title: 'Ambil dari Facebook', desc: 'Tempel link, isi otomatis', icon: <ScanSearch size={16} color="#3B82F6" />, run: () => setShowScrapeModal(true) },
              { n: 3, title: 'Clone produk', desc: 'Salin + foto ikut', icon: <ShieldCheck size={16} color="var(--success)" />, run: () => handleCloneToAppliance() },
            ].map((opt) => (
              <div
                key={opt.n}
                onClick={() => { setShowFabMenu(false); opt.run(); }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-hover-tint)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--surface-hover-tint)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  {opt.n}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{opt.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{opt.desc}</div>
                </div>
                {opt.icon}
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => setShowFabMenu(!showFabMenu)}
          aria-label="Tambah produk"
          title="Tambah produk"
          style={{
            width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: 'var(--success)', color: 'var(--success-contrast)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 12px 28px rgba(16,185,129,0.4)',
          }}
        >
          <Plus size={26} strokeWidth={2.5} style={{ transform: showFabMenu ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
      </div>

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

    </section>
  );
}


function ListingToggle({ item, type }) {
  const field = type === 'mp' ? 'postMarketplace' : 'autoFeed';
  const defaultValue = type === 'mp' ? item.postMarketplace !== false : !!item.autoFeed;
  const [override, setOverride] = useState(null);
  const active = override?.source === defaultValue ? override.value : defaultValue;

  const saveFn = useCallback(
    (val) => fetch(`/api/listings/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...item, [field]: val }),
    }),
    [field, item]
  );
  const { triggerSave, status } = useAutoSave(saveFn, 0);

  return (
    <div
      className={active ? styles.premiumToggleActive : styles.premiumToggle}
      onClick={() => {
        const newState = !active;
        setOverride({ source: defaultValue, value: newState });
        triggerSave(newState);
      }}
    >
      <div className={active ? styles.toggleDotActive : styles.toggleDot}></div>
      <span className={active ? styles.toggleTextActive : styles.toggleText} title={type === 'mp' ? 'Tampil di Marketplace Facebook' : 'Bagikan otomatis ke grup'}>
        {type === 'mp' ? 'MARKETPLACE' : 'KE GRUP'}
      </span>
      {status !== 'idle' && <SaveStatus status={status} />}
    </div>
  );
}
