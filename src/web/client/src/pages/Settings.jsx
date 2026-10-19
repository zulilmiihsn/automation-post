import { useState, useEffect, useRef } from 'react';
import { Settings as SettingsIcon, Brain, Clock, Save, Plus, Trash2, Play, Wrench, RefreshCw, Sun, Moon } from 'lucide-react';
import { api } from '../services/api';
import TrashModal from '../components/TrashModal';
import OrphanPanel from '../components/OrphanPanel';
import { useConfirm } from '../components/ConfirmContext';
import { useToast } from '../components/ToastContext';
import styles from './Settings.module.css';

const WEEKDAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function describeCron(expression = '') {
  const fields = expression.trim().split(/\s+/);
  if (fields.length === 6) fields.shift(); // node-cron optional seconds field
  if (fields.length !== 5) return 'Jadwal khusus';
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  if (!/^\d+$/.test(minute) || !/^\d+$/.test(hour)) return 'Jadwal khusus';
  const time = `${String(Number(hour)).padStart(2, '0')}.${String(Number(minute)).padStart(2, '0')} WIB`;

  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') return `Setiap hari · ${time}`;
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '1-5') return `Hari kerja · ${time}`;
  if (dayOfMonth === '*' && month === '*' && /^\d(,\d)*$/.test(dayOfWeek)) {
    const days = dayOfWeek.split(',').map(day => WEEKDAYS[Number(day)]).filter(Boolean);
    if (days.length) return `${days.join(', ')} · ${time}`;
  }
  if (/^\d+$/.test(dayOfMonth) && month === '*' && dayOfWeek === '*') {
    return `Tanggal ${Number(dayOfMonth)} tiap bulan · ${time}`;
  }
  return 'Jadwal khusus';
}

function formatLastRun(value) {
  if (!value) return 'Belum pernah berjalan';
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return 'Waktu tidak diketahui';
  return date.toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function Settings({ theme = 'dark', onThemeChange = () => {} }) {
  const [config, setConfig] = useState({});
  const [schedules, setSchedules] = useState([]);
  const [tab, setTab] = useState('bot');
  const [saving, setSaving] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const savedConfigRef = useRef({});
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [newSchedule, setNewSchedule] = useState({
    name: '', cronExpr: '0 8 * * *', mode: 'marketplace', accountId: '',
  });

  const [accounts, setAccounts] = useState([]);
  const [showTrash, setShowTrash] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();
  const runtimeAI = config.runtime_ai_models;

  const resetPostUrls = async () => {
    const ok = await confirm('Reset semua riwayat link postingan? Bot akan posting ulang dari awal.');
    if (!ok) return;
    try {
      const response = await fetch('/api/listings/clear-urls', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gagal reset riwayat posting');
      toast.success('Riwayat posting direset');
    } catch (err) {
      toast.error(`Gagal reset: ${err.message}`);
    }
  };

  const fetchData = async () => {
    setLoadError('');
    try {
      const [cfg, sched, accs] = await Promise.all([
        api.getConfig(),
        api.getSchedules(),
        api.getAccounts(),
      ]);
      const nextConfig = cfg || {};
      savedConfigRef.current = nextConfig;
      setConfig(nextConfig);
      setSchedules(sched || []);
      setAccounts(accs || []);
    } catch (err) {
      setLoadError(`Gagal memuat pengaturan: ${err.message}`);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, []);

  useEffect(() => {
    if (!showAddSchedule) return;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setShowAddSchedule(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [showAddSchedule]);

  const saveConfig = async (key, value) => {
    setSaving(true);
    try {
      await api.setConfig(key, value);
      savedConfigRef.current = { ...savedConfigRef.current, [key]: value };
      setConfig(prev => ({ ...prev, [key]: value }));
    } catch (err) {
      toast.error(`Gagal menyimpan pengaturan: ${err.message}`);
      try {
        const latest = await api.getConfig();
        savedConfigRef.current = latest || {};
        setConfig(latest || {});
      } catch { /* Keep current values when reload also fails. */ }
    } finally {
      setSaving(false);
    }
  };

  const addSchedule = async () => {
    if (savingSchedule) return;
    const name = newSchedule.name.trim();
    const cronExpr = newSchedule.cronExpr.trim();
    if (!name || name.length > 80 || !cronExpr || cronExpr.length > 100) {
      toast.error('Nama wajib (maksimal 80 karakter); cron maksimal 100 karakter.');
      return;
    }
    setSavingSchedule(true);
    try {
      await api.addSchedule({
        name,
        cronExpr,
        mode: newSchedule.mode,
        accountId: newSchedule.accountId || null,
      });
      setNewSchedule({ name: '', cronExpr: '0 8 * * *', mode: 'marketplace', accountId: '' });
      setShowAddSchedule(false);
      const sched = await api.getSchedules();
      setSchedules(sched || []);
      toast.success('Jadwal disimpan dan diaktifkan');
    } catch (err) {
      toast.error(`Gagal menambah jadwal: ${err.message}`);
    } finally {
      setSavingSchedule(false);
    }
  };

  const deleteSchedule = async (id) => {
    const schedule = schedules.find(item => item.id === id);
    if (!(await confirm(`Hapus jadwal “${schedule?.name || `#${id}`}”?`))) return;
    try {
      await api.deleteSchedule(id);
      setSchedules(prev => prev.filter(s => s.id !== id));
      toast.success('Jadwal dihapus');
    } catch (err) {
      toast.error(`Gagal menghapus jadwal: ${err.message}`);
    }
  };

  const toggleSchedule = async (id, enabled) => {
    try {
      await api.updateSchedule(id, { enabled: !enabled });
      setSchedules(prev => prev.map(s => s.id === id ? { ...s, enabled: !enabled } : s));
      toast.success(enabled ? 'Jadwal dijeda' : 'Jadwal diaktifkan');
    } catch (err) {
      toast.error(`Gagal mengubah jadwal: ${err.message}`);
    }
  };

  const renderConfigRow = (label, configKey, { type = 'text', placeholder = '', help = '', min, max } = {}) => {
    const rawValue = config[configKey] ?? '';
    const enabled = ['true', '1', 1, true, 'on'].includes(rawValue);
    return (
    <div key={configKey} className={styles.settingRow}>
      <div>
        <label className={styles.settingLabel} htmlFor={`setting-${configKey}`}>{label}</label>
        {help && <p className={styles.settingHelp}>{help}</p>}
      </div>
      {type === 'toggle' ? (
        <button
          id={`setting-${configKey}`}
          type="button"
          aria-pressed={enabled}
          disabled={saving}
          className={`${styles.toggle} ${enabled ? styles.toggleOn : ''}`}
          onClick={() => saveConfig(configKey, enabled ? '0' : '1')}
        >
          {enabled ? 'Aktif' : 'Nonaktif'}
        </button>
      ) : (
        <input
          id={`setting-${configKey}`}
          type={type}
          min={min}
          max={max}
          step={type === 'number' ? 1 : undefined}
          value={rawValue}
          placeholder={placeholder}
          onChange={(e) => setConfig(prev => ({ ...prev, [configKey]: e.target.value }))}
          onBlur={(e) => {
            const value = e.target.value;
            const number = Number(value);
            if (type === 'number' && value !== '' && (
              !Number.isSafeInteger(number) || number < (min ?? 0) || (max != null && number > max)
            )) {
              toast.error(`${label} harus berupa bilangan bulat antara ${min ?? 0} dan ${max ?? 'batas maksimum'}.`);
              setConfig(prev => ({ ...prev, [configKey]: savedConfigRef.current[configKey] ?? '' }));
              return;
            }
            saveConfig(configKey, value);
          }}
          disabled={saving}
          className={styles.control}
        />
      )}
    </div>
    );
  };

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <div>
          <div className={styles.eyebrow}>Kontrol aplikasi</div>
          <h2 className={styles.title}>Pengaturan</h2>
          <p className={styles.description}>Atur perilaku bot, batas aktivitas, jadwal, dan perawatan data.</p>
        </div>
        {saving && <span className={styles.saving}><Save size={14} /> Menyimpan perubahan</span>}
      </header>

      {loadError ? (
        <div className={styles.error} role="alert">
          {loadError}
          <button className="btn btn-outline" onClick={() => { setLoadingData(true); fetchData(); }} style={{ marginLeft: 12, padding: '4px 10px', fontSize: 11 }}>Coba lagi</button>
        </div>
      ) : loadingData ? (
        <div className={styles.panel} aria-busy="true" style={{ padding: 20 }}>
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-card" style={{ height: 180 }} />
        </div>
      ) : (
        <>
      {/* Tabs */}
      <nav className={styles.tabs} aria-label="Bagian pengaturan">
        {[
          { id: 'bot', label: 'Bot', icon: SettingsIcon },
          { id: 'ratelimit', label: 'Rate Limiter', icon: Clock },
          { id: 'ai', label: 'AI Settings', icon: Brain },
          { id: 'display', label: 'Tampilan', icon: Sun },
          { id: 'schedules', label: 'Jadwal', icon: Play },
          { id: 'care', label: 'Perawatan', icon: Wrench },
        ].map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </nav>

      {/* Bot Settings */}
      {tab === 'bot' && (
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Perilaku bot</h3>
            <p className={styles.panelDescription}>Akun scraper dan debug mengikuti akun berbintang di tab Akun.</p>
          </header>
          <div className={styles.settingsRows}>
            {renderConfigRow("Mode browser", "headless_mode", { type: 'toggle', help: 'Headless menjalankan browser di latar. Matikan untuk melihat proses browser.' })}
            {renderConfigRow("Maksimal sundul per run", "sundul_max_actions", { type: 'number', min: 1, max: 100, placeholder: '20', help: 'Batas jumlah listing yang disundul per akun dalam satu proses. Sisa target dicoba pada run berikutnya.' })}
          </div>
        </section>
      )}

      {/* Rate Limiter */}
      {tab === 'ratelimit' && (
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Batas aktivitas harian</h3>
            <p className={styles.panelDescription}>Batas berlaku per akun. Aksi dijeda sampai hari berikutnya saat kuota habis.</p>
          </header>
          <div className={styles.settingsRows}>
            {renderConfigRow("Like", "rate_limit_likes_per_day", { type: 'number', min: 0, max: 1000, placeholder: '50', help: 'Maksimum 1.000 per akun/hari. 0 menonaktifkan; kosongkan untuk default.' })}
            {renderConfigRow("Post", "rate_limit_posts_per_day", { type: 'number', min: 0, max: 1000, placeholder: '20', help: 'Maksimum 1.000 per akun/hari. 0 menonaktifkan; kosongkan untuk default.' })}
            {renderConfigRow("Komentar", "rate_limit_comments_per_day", { type: 'number', min: 0, max: 1000, placeholder: '30', help: 'Maksimum 1.000 per akun/hari. 0 menonaktifkan; kosongkan untuk default.' })}
          </div>
        </section>
      )}

      {/* AI Settings */}
      {tab === 'ai' && (
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Model AI aktif</h3>
            <p className={styles.panelDescription}>
              {runtimeAI?.provider
                ? `Model runtime yang sedang dipakai aplikasi melalui ${runtimeAI.provider}.`
                : 'Backend belum mengirim status model. Restart backend agar konfigurasi terbaru terbaca.'}
            </p>
          </header>
          <div className={styles.settingsRows}>
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>Listing AI</div>
                <p className={styles.settingHelp}>Generate tag, deskripsi, dan atribut produk.</p>
              </div>
              <code className={styles.modelCode}>{runtimeAI?.heavy || 'Belum tersedia'}</code>
            </div>
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>Chat & AI Agent</div>
                <p className={styles.settingHelp}>Balasan pembeli dan analisis feed.</p>
              </div>
              <code className={styles.modelCode}>{runtimeAI?.light || 'Belum tersedia'}</code>
            </div>
          </div>
          <div className={`${styles.aiStatus} ${runtimeAI?.credentials_configured === true ? styles.aiStatusOk : styles.aiStatusMissing}`} role="status">
            <span className={styles.aiStatusDot} />
            {runtimeAI?.credentials_configured === true
              ? `API key ${runtimeAI.provider || 'AI'} terpasang di backend.`
              : runtimeAI?.credentials_configured === false
                ? `API key ${runtimeAI.provider || 'AI'} belum terdeteksi di backend.`
                : 'Status API key belum tersedia dari backend. Restart backend.'}
          </div>
          <div className={styles.infoNote} style={{ marginTop: 14 }}>
            Provider dan API key dibaca dari <code>.env</code>, bukan disimpan di browser. Atur provider/model di <code>.env</code>, lalu restart backend. NVIDIA Build perlu <code>NVIDIA_API_KEY</code>.
          </div>
        </section>
      )}

      {tab === 'display' && (
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Tampilan aplikasi</h3>
            <p className={styles.panelDescription}>Pilih tema yang nyaman. Pilihan tersimpan di browser ini.</p>
          </header>
          <div className={styles.settingsRows}>
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>Mode warna</div>
                <p className={styles.settingHelp}>Perubahan diterapkan langsung ke seluruh halaman.</p>
              </div>
              <div className={styles.themeChoices} role="group" aria-label="Mode warna">
                <button
                  type="button"
                  aria-pressed={theme === 'dark'}
                  className={`${styles.themeChoice} ${theme === 'dark' ? styles.themeChoiceActive : ''}`}
                  onClick={() => onThemeChange('dark')}
                >
                  <Moon size={15} /> Gelap
                </button>
                <button
                  type="button"
                  aria-pressed={theme === 'light'}
                  className={`${styles.themeChoice} ${theme === 'light' ? styles.themeChoiceActive : ''}`}
                  onClick={() => onThemeChange('light')}
                >
                  <Sun size={15} /> Terang
                </button>
              </div>
            </div>
          </div>
        </section>
      )}



      {/* Schedules */}
      {tab === 'schedules' && (
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div className={styles.sectionToolbar} style={{ marginBottom: 0 }}>
              <div>
                <h3 className={styles.panelTitle}>Jadwal otomatis</h3>
                <p className={styles.panelDescription}>Jalankan bot berkala mengikuti waktu lokal Jakarta.</p>
              </div>
              <button className="btn btn-primary" onClick={() => setShowAddSchedule(true)} style={{ fontSize: 12, padding: '7px 12px', flexShrink: 0 }}>
                <Plus size={14} /> Tambah Jadwal
              </button>
            </div>
          </header>
          <div className={styles.sectionContent}>
            {showAddSchedule && (
              <div className={styles.modalOverlay} onClick={() => setShowAddSchedule(false)}>
                <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="schedule-modal-title" onClick={event => event.stopPropagation()}>
                  <h3 id="schedule-modal-title" className={styles.panelTitle} style={{ fontSize: 16 }}>Jadwal baru</h3>
                  <p className={styles.panelDescription} style={{ marginBottom: 16 }}>Atur aksi, waktu, dan akun target.</p>
                  <div className={styles.scheduleForm}>
                    <label className={styles.formField}>
                      <span className={styles.formLabel}>Nama jadwal</span>
                      <input className={styles.control} placeholder="Contoh: Post motor pagi" value={newSchedule.name} onChange={event => setNewSchedule(prev => ({ ...prev, name: event.target.value }))} />
                    </label>
                    <label className={styles.formField}>
                      <span className={styles.formLabel}>Waktu (format cron)</span>
                      <input className={styles.control} placeholder="0 8 * * *" value={newSchedule.cronExpr} onChange={event => setNewSchedule(prev => ({ ...prev, cronExpr: event.target.value }))} />
                      <span className={styles.settingHelp}>Urutan: menit · jam · tanggal · bulan · hari. Contoh `0 8 * * *` = setiap hari pukul 08.00 (WIB).</span>
                    </label>
                    <div className={styles.formGrid}>
                      <label className={styles.formField}>
                        <span className={styles.formLabel}>Aksi</span>
                        <select className={styles.select} value={newSchedule.mode} onChange={event => setNewSchedule(prev => ({ ...prev, mode: event.target.value }))}>
                          <option value="marketplace">Post Marketplace</option>
                          <option value="viral">Bagikan ke Grup</option>
                          <option value="sundul">Sundul</option>
                        </select>
                      </label>
                      <label className={styles.formField}>
                        <span className={styles.formLabel}>Akun</span>
                        <select className={styles.select} value={newSchedule.accountId} onChange={event => setNewSchedule(prev => ({ ...prev, accountId: event.target.value }))}>
                          <option value="">Semua akun aktif</option>
                          {accounts.map(account => <option key={account.id} value={account.id}>{account.fbName || account.name || account.id}</option>)}
                        </select>
                      </label>
                    </div>
                  </div>
                  <div className={styles.formActions}>
                    <button className="btn btn-outline" onClick={() => setShowAddSchedule(false)} style={{ fontSize: 12 }}>Batal</button>
                    <button className="btn btn-success" onClick={addSchedule} disabled={savingSchedule} style={{ fontSize: 12 }}><Save size={14} /> {savingSchedule ? 'Menyimpan...' : 'Simpan Jadwal'}</button>
                  </div>
                </div>
              </div>
            )}

            {schedules.length ? (
              <div className={styles.scheduleList}>
                {schedules.map(schedule => {
                  const account = accounts.find(item => item.id === schedule.account_id);
                  const modeLabel = { marketplace: 'Post Marketplace', viral: 'Bagikan ke Grup', sundul: 'Sundul', full: 'Semua Aksi' }[schedule.mode] || schedule.mode;
                  return (
                    <div key={schedule.id} className={styles.scheduleRow}>
                      <button
                        type="button"
                        className={`btn ${schedule.enabled ? 'btn-success' : 'btn-outline'}`}
                        onClick={() => toggleSchedule(schedule.id, schedule.enabled)}
                        aria-label={`${schedule.enabled ? 'Jeda' : 'Aktifkan'} jadwal ${schedule.name}`}
                        aria-pressed={Boolean(schedule.enabled)}
                        style={{ minWidth: 86, padding: '6px 9px', fontSize: 11 }}
                      >
                        {schedule.enabled ? 'Aktif' : 'Dijeda'}
                      </button>
                      <div style={{ minWidth: 0 }}>
                        <div className={styles.scheduleName}>{schedule.name || `Jadwal #${schedule.id}`}</div>
                        <div className={styles.scheduleMeta} title={`Cron: ${schedule.cron_expr}`}>
                          <span>{describeCron(schedule.cron_expr)}</span>
                          <span>{modeLabel}</span>
                          <span>{account ? (account.fbName || account.name) : 'Semua akun'}</span>
                        </div>
                        <div className={styles.scheduleMeta}>
                          <span>Terakhir: {formatLastRun(schedule.last_run)}</span>
                          {schedule.last_status === 'success' && <span className={styles.scheduleStatusSuccess}>Sukses</span>}
                          {schedule.last_status === 'failed' && <span className={styles.scheduleStatusFailed}>Gagal</span>}
                        </div>
                      </div>
                      <div className={styles.scheduleActions}>
                        <button className="btn btn-danger" onClick={() => deleteSchedule(schedule.id)} aria-label={`Hapus jadwal ${schedule.name}`} title="Hapus jadwal" style={{ minHeight: 36, padding: '6px 9px' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyState}>Belum ada jadwal aktif. Tambahkan jadwal untuk otomatisasi tanpa menjalankan manual.</div>
            )}
          </div>
        </section>
      )}

      {/* Perawatan Data */}
      {tab === 'care' && (
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Perawatan data</h3>
            <p className={styles.panelDescription}>Pulihkan produk terhapus dan periksa file foto tak terpakai.</p>
          </header>
          <div className={styles.sectionContent} style={{ display: 'grid', gap: 12 }}>
            <div className={`${styles.scheduleRow} ${styles.careRow}`}>
              <div style={{ minWidth: 0 }}>
                <div className={styles.scheduleName}>Sampah produk</div>
                <div className={styles.scheduleMeta}>Pulihkan produk yang terhapus sebelum dihapus permanen.</div>
              </div>
              <button className="btn btn-outline" onClick={() => setShowTrash(true)} style={{ fontSize: 12, whiteSpace: 'nowrap' }}><Trash2 size={14} /> Lihat Sampah</button>
            </div>
            <div className={`${styles.scheduleRow} ${styles.careRow}`}>
              <div style={{ minWidth: 0 }}>
                <div className={styles.scheduleName}>Foto tanpa pemilik</div>
                <div className={styles.scheduleMeta}>Pindai file foto yang tak lagi dipakai listing.</div>
              </div>
              <OrphanPanel onChanged={fetchData} />
            </div>
            <div className={styles.error} style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <strong>Reset riwayat posting</strong>
                <div style={{ marginTop: 3 }}>Menghapus URL posting tersimpan. Bot dapat memposting ulang produk.</div>
              </div>
              <button className="btn btn-danger" onClick={resetPostUrls} style={{ fontSize: 12, whiteSpace: 'nowrap' }}><RefreshCw size={14} /> Reset URL</button>
            </div>
          </div>
        </section>
      )}
      </>
      )}
      <TrashModal show={showTrash} onClose={() => setShowTrash(false)} onChanged={fetchData} />
    </div>
  );
}
