import { Image, Edit2, Trash2, Plus, ScanSearch, Play, Square as SquareIcon, Terminal as TerminalIcon, X, Check, Bot, Layers, Package } from 'lucide-react';
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

export default function Listings({ 
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
  const [showConsoleModal, setShowConsoleModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeLogs, setScrapeLogs] = useState([]);

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

  useEffect(() => {
    let es = null;
    let retryTimeout = null;

    const connectStream = () => {
      if (es) {
        es.close();
      }

      es = new EventSource('/api/stream-logs?mode=all');
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        const streamData = JSON.parse(event.data);

        if (streamData.msg) {
          let type = 'info';
          if (streamData.msg.includes("[ERROR]") || streamData.msg.includes("ERROR:")) type = 'error';
          else if (streamData.msg.includes("[WARN]") || streamData.msg.includes("WARN:")) type = 'warn';
          else if (streamData.msg.includes("[SUCCESS]") || streamData.msg.includes("Berhasil")) type = 'success';
          else if (streamData.msg.includes(">>>") || streamData.msg.includes("<<<") || streamData.msg.includes("SYSTEM:") || streamData.msg.includes("[SYSTEM]")) type = 'system';

          setLogs(prev => {
            // Avoid adding identical message within a short window to prevent duplicates
            const alreadyExists = prev.some(l => l.msg === streamData.msg && Math.abs(new Date().getTime() - new Date().getTime()) < 100);
            if (alreadyExists) return prev;
            return [...prev, { type, msg: streamData.msg, time: new Date().toLocaleTimeString() }];
          });

          // Parallel UI refresh triggers
          if (streamData.msg.includes("[REFRESH_UI]")) {
            onRefresh();
          }
        }

        if (streamData.type === 'status') {
          const { mode: qMode, isRunning } = streamData;
          if (qMode === 'marketplace') setIsRunningMp(isRunning);
          if (qMode === 'viral') setIsRunningViral(isRunning);
          if (qMode === 'comment') setIsRunningComment(isRunning);
          if (qMode === 'chat') setIsRunningChat(isRunning);
          if (qMode === 'agent') setIsRunningAgent(isRunning);
          if (qMode === 'sundul') setIsRunningSundul(isRunning);
        }

        if (streamData.done) {
          const { mode: qMode } = streamData;
          if (qMode === 'marketplace') setIsRunningMp(false);
          if (qMode === 'viral') setIsRunningViral(false);
          if (qMode === 'comment') setIsRunningComment(false);
          if (qMode === 'chat') setIsRunningChat(false);
          if (qMode === 'agent') setIsRunningAgent(false);
          if (qMode === 'sundul') setIsRunningSundul(false);
          onRefresh();
        }
      };

      es.onerror = () => {
        es.close();
        retryTimeout = setTimeout(connectStream, 3000);
      };
    };

    connectStream();

    return () => {
      if (es) {
        es.close();
      }
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, [onRefresh]);

  const startAutomation = async (mode, accountId = null, commentTargetUrl = null) => {
    let modeLabel = 'Viral Share';
    if (mode === 'marketplace') modeLabel = 'Marketplace Posting';
    if (mode === 'comment') modeLabel = 'Comment Attack';
    if (mode === 'chat') modeLabel = 'Chat Auto-Reply';

    if (!(await confirm(`Jalankan otomatisasi ${modeLabel} sekarang?`))) return;

    setShowConsoleModal(true); // Auto-open console
    setLogs(prev => [...prev, { type: 'system', msg: `>>> Menghubungkan ke Bot Engine (${mode})... <<<`, time: new Date().toLocaleTimeString() }]);

    try {
      const res = await fetch("/api/run-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, accountId, commentTargetUrl }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "Gagal memulai otomatisasi");

      setLogs(prev => [...prev, { type: 'success', msg: `Bot Engine: ${data.message}`, time: new Date().toLocaleTimeString() }]);
    } catch (err) {
      setLogs(prev => [...prev, { type: 'error', msg: `Gagal: ${err.message}`, time: new Date().toLocaleTimeString() }]);
    }
  };

  const stopAutomation = async (mode) => {
    if (!(await confirm("Hentikan bot yang sedang berjalan?"))) return;
    try {
      await fetch("/api/stop-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      setLogs(prev => [...prev, { type: 'system', msg: "<<< Mengirim sinyal berhenti ke Bot Engine... >>>", time: new Date().toLocaleTimeString() }]);
    } catch (err) {
      console.error(err);
    }
  };

  const formatRupiah = (val) => {
    if (!val && val !== 0) return "";
    const number = typeof val === "string" ? val.replace(/[^0-9]/g, "") : val;
    if (number === "") return "";
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(number).replace(/,00$/, "");
  };

  const deleteListing = async (index) => {
    if (!(await confirm("Hapus produk ini?"))) return;
    const item = listings[index];
    try {
      await fetch(`/api/listings/${item.id}`, { method: "DELETE" });
      onRefresh();
    } catch (err) {
      console.error(err);
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

  const deleteAllSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!(await confirm(`Hapus ${selectedIds.length} produk terpilih?`))) return;
    
    try {
      await api.bulkDeleteListings(selectedIds);
      setSelectedIds([]);
      toast.success(`${selectedIds.length} produk berhasil dihapus`);
      onRefresh();
    } catch (err) {
      console.error(err);
      toast.error("Gagal hapus massal: " + err.message);
    }
  };

  const bulkUpdateToggle = async (field, value) => {
    if (selectedIds.length === 0) return;
    const label = field === 'postMarketplace' ? 'Marketplace Posting' : 'Viral Share';
    const actionLabel = value ? 'AKTIFKAN' : 'MATIKAN';
    if (!(await confirm(`${actionLabel} ${label} untuk ${selectedIds.length} produk terpilih?`))) return;

    try {
      await api.bulkUpdateListings(selectedIds, { [field]: value });
      toast.success(`Berhasil update ${selectedIds.length} produk`);
      onRefresh();
    } catch (err) {
      console.error(err);
      toast.error("Gagal melakukan update massal: " + err.message);
    }
  };

  const bulkUpdateLocation = async () => {
    if (selectedIds.length === 0) return;
    const newLocation = prompt(`Masukkan lokasi baru untuk ${selectedIds.length} produk terpilih:`);
    if (newLocation === null || newLocation.trim() === '') return;

    try {
      await Promise.all(selectedIds.map(id => {
        const item = listings.find(l => l.id === id);
        if (item) {
          return fetch(`/api/listings/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...item, location: newLocation.trim() }),
          });
        }
        return Promise.resolve();
      }));
      onRefresh();
    } catch (err) {
      console.error(err);
      toast.error("Gagal mengubah lokasi massal: " + err.message);
    }
  };

  const clearAllPostUrls = async () => {
    if (!(await confirm("Apakah Anda yakin ingin menghapus semua link URL postingan dari semua listingan?"))) return;
    try {
      const res = await fetch("/api/listings/clear-urls", {
        method: "POST"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menghapus link");
      toast.success(data.message || "Semua link URL postingan berhasil dihapus");
      onRefresh();
    } catch (err) {
      console.error(err);
      toast.error("Error: " + err.message);
    }
  };

  const handleSundulAuto = async () => {
    const activeIds = listings.filter(l => l.postMarketplace !== false && l.isActive !== false).map(l => l.id);
    if (activeIds.length === 0) {
      toast.error("Tidak ada listing dengan Marketplace aktif.");
      return;
    }
    
    if (!(await confirm(`Pindai Facebook dan sundul hanya listing yang eligible? ${activeIds.length} listing lokal aktif dipakai sebagai indikator kesiapan.`))) return;

    setShowConsoleModal(true);
    setLogs(prev => [...prev, { type: 'system', msg: `>>> Memulai Bot Sundul... <<<`, time: new Date().toLocaleTimeString() }]);

    try {
      const res = await api.runSundul({ autoMode: true });
      setLogs(prev => [...prev, { type: 'success', msg: `Bot Sundul: ${res.message}`, time: new Date().toLocaleTimeString() }]);
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

      // Subscribe to real SSE log stream from server
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

          // Scraper done signal
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
      
      {/* GROUP SWITCHER BAR */}
      <div className={styles.groupSwitcherBar}>
        <button
          className={!selectedGroupId ? styles.groupPillActive : styles.groupPill}
          onClick={() => onSelectGroup && onSelectGroup(null)}
        >
          <Layers size={14} />
          <span>Semua Produk</span>
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
      </div>

      {/* ACTIVE GROUP BANNER */}
      {activeGroup && (
        <div className={styles.activeGroupBanner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div className={styles.groupBadgeIcon}>
              <Layers size={20} color="#10B981" />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#FAFAFA' }}>
                Fokus Grup: {activeGroup.name}
              </div>
              <div style={{ fontSize: '13px', color: '#A1A1AA', marginTop: '2px' }}>
                {activeGroup.accounts.length} Akun Tertaut &bull; {filteredListings.length} Produk di Grup Ini
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              className={`btn btn-secondary ${styles.btnPadding}`}
              onClick={() => setShowCatalogModal(true)}
            >
              <Package size={14} />
              <span>Pilih dari Katalog</span>
            </button>
            <button 
              className={`btn btn-primary ${styles.btnPadding}`}
              onClick={() => onSelectGroup && onSelectGroup(null)}
            >
              <X size={14} />
              <span>Tampilkan Semua</span>
            </button>
          </div>
        </div>
      )}

      {/* HEADER ACTIONS */}
      <div className={styles.headerActions}>
        <h2 className={styles.headerTitle}>
          {activeGroup ? `Daftar Produk (${activeGroup.name})` : 'Daftar Produk'}
        </h2>
        
        <div className={styles.btnGroup}>
          <button 
            className={`btn btn-danger ${styles.btnPadding}`} 
            onClick={clearAllPostUrls}
          >
            <Trash2 size={16} />
            <span>Reset Link Pos</span>
          </button>
          <button 
            className={`btn btn-primary ${styles.btnPadding}`} 
            onClick={() => setShowScrapeModal(true)} 
          >
            <ScanSearch size={16} /> 
            <span>Scrape FB</span>
          </button>
          <button className={`btn btn-success ${styles.btnPadding}`} onClick={() => {
            setEditingItem({ 
              title: '', 
              price: 0, 
              photos: [], 
              isActive: true,
              autoFeed: true,
              targetGroup: 'berau',
              maxGroups: 20
            });
          }}>
            <Plus size={16} /> 
            <span>Tambah Manual</span>
          </button>
        </div>
      </div>

      {/* AUTOMATION ENGINE BENTO */}
      <div className={styles.bentoEngine}>
        <div className={styles.bentoSection}>
          <div className={styles.bentoLabel}>AUTOMATION ENGINE</div>
          <div className={styles.bentoStatus}>
            <span className={styles.statusIndicator} style={{ background: (isRunningMp || isRunningViral || isRunningAgent) ? 'var(--success)' : 'var(--text-muted)' }} />
            <span className={styles.statusText} style={{ color: (isRunningMp || isRunningViral || isRunningAgent) ? 'var(--success)' : 'var(--text)' }}>
              {(isRunningMp || isRunningViral || isRunningAgent) ? 'Berjalan Aktif' : 'Sistem Idle'}
            </span>
          </div>
        </div>

        <div className={styles.bentoStatsGroup}>
          <div className={styles.bentoStatItem}>
            <div className={styles.bentoStatsVal}>{activeMpListingsCount}</div>
            <div className={styles.bentoStatsLabel}>MP Siap</div>
          </div>
          <div className={styles.bentoStatItem}>
            <div className={styles.bentoStatsVal}>{activeViralListingsCount}</div>
            <div className={styles.bentoStatsLabel}>Viral Siap</div>
          </div>
          <div className={styles.bentoStatItem}>
            <div className={styles.bentoStatsVal}>{activeAccountsCount}</div>
            <div className={styles.bentoStatsLabel}>Akun Aktif</div>
          </div>
        </div>

        <div className={styles.bentoActions}>
          <button 
            className="btn btn-primary"
            onClick={() => setShowConsoleModal(true)}
          >
            <TerminalIcon size={14} /> Konsol
          </button>
          
          {isRunningMp ? (
            <button className="btn btn-danger" onClick={() => stopAutomation('marketplace')}>
              <SquareIcon size={14} fill="currentColor" /> Hentikan Post
            </button>
          ) : (
            <button className="btn btn-success" onClick={() => startAutomation('marketplace')} disabled={activeAccountsCount === 0 || activeMpListingsCount === 0 || isRunningViral || isRunningChat}>
              <Play size={14} fill="currentColor" /> Jalankan Post
            </button>
          )}

          {isRunningSundul ? (
            <button className="btn btn-danger" onClick={() => stopAutomation('sundul')}>
              <SquareIcon size={14} fill="currentColor" /> Hentikan Sundul
            </button>
          ) : (
            <button className="btn btn-success" onClick={handleSundulAuto} disabled={activeAccountsCount === 0 || activeMpListingsCount === 0 || isRunningMp || isRunningViral || isRunningChat}>
              <Play size={14} fill="currentColor" /> Jalankan Sundul
            </button>
          )}

          {isRunningViral ? (
            <button className="btn btn-danger" onClick={() => stopAutomation('viral')}>
              <SquareIcon size={14} fill="currentColor" /> Hentikan Viral
            </button>
          ) : (
            <button className="btn btn-success" onClick={() => startAutomation('viral')} disabled={activeAccountsCount === 0 || activeViralListingsCount === 0 || isRunningMp || isRunningComment || isRunningChat}>
              <Play size={14} fill="currentColor" /> Jalankan Viral
            </button>
          )}

          {isRunningComment ? (
            <button className="btn btn-danger" onClick={() => stopAutomation('comment')}>
              <SquareIcon size={14} fill="currentColor" /> Hentikan Komentar
            </button>
          ) : (
            <button className="btn btn-success" onClick={() => setShowCommentModal(true)} disabled={activeAccountsCount === 0 || activeViralListingsCount === 0 || isRunningMp || isRunningViral || isRunningChat}>
              <Play size={14} fill="currentColor" /> Jalankan Komentar
            </button>
          )}
        </div>
      </div>

      {/* LISTINGS GRID HEADER */}
      <div className={styles.gridHeader}>
        <div 
          onClick={selectAll}
          className={styles.selectAllWrapper}
        >
          <div className={`${styles.customCheckbox} ${(filteredListings.length > 0 && selectedIds.length === filteredListings.length) ? styles.customCheckboxChecked : ''}`}>
            {(filteredListings.length > 0 && selectedIds.length === filteredListings.length) && <Check size={14} color="#000" strokeWidth={3} />}
          </div>
          <span className={styles.selectAllText}>
            Pilih Semua Produk ({filteredListings.length})
          </span>
        </div>
      </div>

      {/* LISTINGS GRID */}
      <div className={styles.listingsGrid}>
        {filteredListings.length === 0 ? (
          <div className={styles.emptyGroupCard}>
            <Package size={44} color="#52525B" strokeWidth={1.5} />
            <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#FAFAFA', margin: '16px 0 6px 0' }}>
              {activeGroup ? `Belum Ada Produk di Grup "${activeGroup.name}"` : 'Belum Ada Produk'}
            </h3>
            <p style={{ fontSize: '14px', color: '#A1A1AA', maxWidth: '440px', margin: '0 0 24px 0', lineHeight: 1.5 }}>
              {activeGroup 
                ? 'Tambahkan produk baru ke grup ini atau pilih produk dari katalog utama untuk dimasukkan ke grup.'
                : 'Mulai dengan menambahkan produk secara manual atau gunakan fitur Scrape FB.'}
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {activeGroup && (
                <button className={`btn btn-primary ${styles.btnPadding}`} onClick={() => setShowCatalogModal(true)}>
                  <Package size={15} />
                  <span>Pilih dari Katalog ({listings.length})</span>
                </button>
              )}
              <button className={`btn btn-success ${styles.btnPadding}`} onClick={() => {
                setEditingItem({ 
                  title: '', 
                  price: 0, 
                  photos: [], 
                  isActive: true,
                  autoFeed: true,
                  targetGroup: 'berau',
                  maxGroups: 20
                });
              }}>
                <Plus size={15} />
                <span>Tambah Manual {activeGroup ? 'ke Grup' : ''}</span>
              </button>
              <button className={`btn btn-secondary ${styles.btnPadding}`} onClick={() => setShowScrapeModal(true)}>
                <ScanSearch size={15} />
                <span>Scrape FB {activeGroup ? 'ke Grup' : ''}</span>
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

      {/* FLOATING BULK ACTIONS BAR */}
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
            <span className={styles.badgeLabel}>Terpilih</span>
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
                  Centang produk dari katalog untuk dimasukkan atau dikeluarkan dari grup ini.
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
