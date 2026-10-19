import { useState, useEffect, useCallback } from 'react';
import { BarChart3, TrendingUp, Heart, MessageCircle, Share2, Package, AlertTriangle, CheckCircle, FileText, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../services/api';
import { useToast } from '../components/ToastContext';
import { useConfirm } from '../components/ConfirmContext';

export default function Analytics({ onOpenProducts }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [activity, setActivity] = useState([]);
  const [listingStats, setListingStats] = useState([]);
  const [reports, setReports] = useState([]);
  const [health, setHealth] = useState(null);
  const [days, setDays] = useState(7);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [expandedReport, setExpandedReport] = useState(null);
  const [reportDetails, setReportDetails] = useState({});
  const [reportLoading, setReportLoading] = useState(null);
  const [reportError, setReportError] = useState('');
  const [failedResetError, setFailedResetError] = useState('');

  const dayTotal = (r) => r.actual_actions ?? 0;
  const dayErrors = (r) => r.actual_errors ?? r.errors_count ?? 0;
  const formatDuration = (value) => {
    const seconds = Math.max(0, Math.round((Number(value) || 0) / 1000));
    if (seconds < 60) return `${seconds} dtk`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes} mnt ${seconds % 60} dtk`;
  };
  const fmtDate = (iso) => {
    try {
      return new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return iso; }
  };
  const dayNarrative = (r) => {
    const posts = r.actual_posts || 0;
    const feedPosts = r.actual_feed_posts || 0;
    const shares = r.actual_shares || 0;
    const errors = dayErrors(r);
    const runs = r.actual_runs || 0;
    const failedRuns = r.failed_runs || 0;
    if (posts === 0 && feedPosts === 0 && shares === 0 && errors === 0) {
      return runs > 0
        ? `${runs} sesi automasi tercatat${failedRuns ? `, ${failedRuns} gagal` : ''}; belum ada aksi terkonfirmasi.`
        : 'Belum ada sesi atau aksi automasi pada tanggal ini.';
    }
    const parts = [];
    if (posts > 0) parts.push(`${posts} listing berhasil diposting ke Marketplace`);
    if (feedPosts > 0) parts.push(`${feedPosts} post Feed berhasil dibuat`);
    if (shares > 0) parts.push(`${shares} share grup berhasil`);
    if (errors > 0) parts.push(`${errors} aksi gagal perlu ditinjau`);
    if (failedRuns > 0) parts.push(`${failedRuns} sesi automasi gagal`);
    return `${parts.join('. ')}.`;
  };
  const reportText = (r) => {
    const lines = [
      `Laporan Harian Autopost — ${fmtDate(r.report_date)}`,
      `Post Marketplace: ${r.actual_posts || 0}`,
      `Post Feed: ${r.actual_feed_posts || 0}`,
      `Share grup: ${r.actual_shares || 0}`,
      `Aksi gagal: ${dayErrors(r)}`,
      `Sesi automasi: ${r.actual_runs || 0} | Durasi: ${formatDuration(r.duration_ms)}`,
      `Sesi gagal: ${r.failed_runs || 0}`,
      dayNarrative(r),
    ];
    return lines.join('\n');
  };
  const [copied, setCopied] = useState(null);
  const toggleReportDetails = async (date) => {
    if (expandedReport === date) {
      setExpandedReport(null);
      return;
    }
    setExpandedReport(date);
    setReportError('');
    if (reportDetails[date]) return;
    setReportLoading(date);
    try {
      const detail = await api.getDailyReportDetails(date);
      setReportDetails(prev => ({ ...prev, [date]: detail }));
    } catch (err) {
      setReportError(err.message || 'Gagal memuat rincian laporan.');
    } finally {
      setReportLoading(null);
    }
  };
  const copyReport = async (r, i) => {
    const detail = reportDetails[r.report_date];
    const detailLines = detail ? [
      '',
      `Akun beraktivitas: ${detail.summary.accounts}`,
      `Marketplace: ${detail.summary.posts} | Feed: ${detail.summary.feedPosts} | Share grup: ${detail.summary.shares}`,
      `Aksi berhasil: ${detail.summary.actions} | Aksi gagal: ${detail.summary.errorCount} | Log terminal: ${detail.summary.logs}`,
      `Sesi: ${detail.summary.runs} | Sesi gagal: ${detail.summary.failedRuns} | Durasi total: ${formatDuration(detail.summary.durationMs)}`,
      ...(detail.runs || []).map(run => `Run ${run.mode}: ${run.status}, ${formatDuration(run.duration_ms)}, ${run.accounts_count} akun, ${run.listings_count} produk, ${run.success_count} sukses, ${run.failed_count} gagal`),
      ...(detail.accounts || []).map(a => `Akun ${a.name}: ${a.success} berhasil, ${a.warn} peringatan, ${a.error} error`),
      ...(detail.errors || []).map(e => `Error ${e.timestamp}: ${e.account ? `[${e.account}] ` : ''}${e.message}`),
    ] : [];
    try {
      await navigator.clipboard.writeText([...reportText(r).split('\n'), ...detailLines].join('\n'));
    } catch {
      const ta = document.createElement('textarea');
      ta.value = [...reportText(r).split('\n'), ...detailLines].join('\n');
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(i);
    setTimeout(() => setCopied(null), 2000);
  };

  const fetchData = useCallback(async () => {
    try {
      const [act, ls, rep, h] = await Promise.all([
        api.getAnalyticsActivity(days),
        api.getListingStats(),
        api.getDailyReports(14),
        api.getHealth(),
      ]);
      setActivity(act || []);
      setListingStats(ls || []);
      setReports(rep || []);
      setHealth(h);
    } catch (err) {
      console.error('Analytics fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [days]);

  const resetFailedProducts = async () => {
    if (!(await confirm(`Tandai ${failedProducts} produk berstatus gagal menjadi siap? Produk tidak dihapus.`))) return;
    setFailedResetError('');
    setLoading(true);
    try {
      const result = await api.resetFailedListings();
      await fetchData();
      toast.success(`${result.count || 0} produk ditandai siap`);
    } catch (err) {
      setFailedResetError(err.message || 'Gagal mereset status produk.');
      setLoading(false);
    }
  };

  useEffect(() => {
    const task = window.setTimeout(fetchData, 0);
    return () => window.clearTimeout(task);
  }, [fetchData]);

  const totals = activity.reduce((acc, d) => ({
    posts: acc.posts + (d.posts || 0),
    likes: acc.likes + (d.likes || 0),
    comments: acc.comments + (d.comments || 0),
    shares: acc.shares + (d.shares || 0),
    chats: acc.chats + (d.chats || 0),
    errors: acc.errors + (d.errors || 0),
    successes: acc.successes + (d.successes || 0),
    attempts: acc.attempts + (d.attempts || 0),
  }), { posts: 0, likes: 0, comments: 0, shares: 0, chats: 0, errors: 0, successes: 0, attempts: 0 });

  const rawRate = totals.attempts > 0
    ? (totals.successes / totals.attempts) * 100
    : null;
  const successRate = rawRate == null ? null : Math.max(0, Math.min(100, Math.round(rawRate)));
  const rateTone = successRate == null
    ? { color: '#a1a1aa', Icon: BarChart3 }
    : successRate >= 80
    ? { color: '#4ade80', Icon: CheckCircle }
    : successRate >= 50
      ? { color: '#fbbf24', Icon: AlertTriangle }
      : { color: '#ef4444', Icon: XCircle };

  const failedProducts = listingStats
    .filter(ls => ls.status === 'failed')
    .reduce((acc, ls) => acc + (ls.count || 0), 0);
  const hasOperationalFailure = totals.errors > 0 || (health && !health.healthy);
  const hasFailure = hasOperationalFailure || failedProducts > 0;
  const bannerTone = hasOperationalFailure
    ? { color: '#ef4444', background: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.25)' }
    : failedProducts > 0
      ? { color: '#fbbf24', background: 'rgba(251,191,36,0.06)', border: 'rgba(251,191,36,0.25)' }
      : { color: '#4ade80', background: 'rgba(74,222,128,0.06)', border: 'rgba(74,222,128,0.25)' };

  const seriesMeta = [
    { key: 'posts', label: 'Post', color: '#818cf8', active: totals.posts > 0 },
    { key: 'likes', label: 'Like', color: '#f472b6', active: totals.likes > 0 },
    { key: 'comments', label: 'Komentar', color: '#34d399', active: totals.comments > 0 },
  ];
  const activeSeries = seriesMeta.filter(s => s.active);

  const statCards = [
    { label: 'Total Post', value: totals.posts, icon: Package, color: '#818cf8' },
    { label: 'Like Diberikan', value: totals.likes, icon: Heart, color: '#f472b6' },
    { label: 'Komentar', value: totals.comments, icon: MessageCircle, color: '#34d399' },
    { label: 'Share', value: totals.shares, icon: Share2, color: '#60a5fa' },
    { label: 'Balasan Chat', value: totals.chats, icon: TrendingUp, color: '#fbbf24' },
    { label: 'Tingkat Keberhasilan', value: successRate == null ? '—' : `${successRate}%`, icon: rateTone.Icon, color: rateTone.color },
  ];

  return (
    <div style={{ padding: '0 4px' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {[{id: 'overview', label: 'Ringkasan'}, {id: 'reports', label: 'Laporan'}].map(t => (
          <button
            key={t.id}
            className={`btn ${tab === t.id ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setTab(t.id)}
            style={{ textTransform: 'capitalize' }}
          >
            {t.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button
            className="btn btn-outline"
            onClick={async () => {
              setLoading(true);
              try {
                await api.generateReport();
                fetchData();
              } catch (err) { console.error(err); setLoading(false); }
            }}
            style={{ fontSize: '12px', padding: '6px 12px' }}
          >
            <FileText size={14} style={{ marginRight: '4px' }} /> Buat Laporan
          </button>
          {[7, 14, 30].map(d => (
            <button
              key={d}
              className={`btn ${days === d ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => { setLoading(true); setDays(d); }}
              style={{ padding: '4px 10px', fontSize: '12px' }}
            >
              {d} hari
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Memuat analitik...</div>
      ) : tab === 'overview' ? (
        <>
          {/* Stat Cards — 6 kartu seimbang */}
          <div className="analytics-stats">
            {statCards.map(card => {
              const Icon = card.icon;
              return (
                <div key={card.label} style={{
                  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                  padding: '16px', display: 'flex', alignItems: 'center', gap: '12px',
                }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: 'var(--radius-sm)',
                    background: `${card.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={20} color={card.color} />
                  </div>
                  <div>
                    <div style={{ fontSize: '20px', fontWeight: 600 }}>{card.value}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{card.label}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Gagal sekilas — jawab subjudul: apa yang gagal */}
          {hasFailure && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
            background: bannerTone.background,
            border: `1px solid ${bannerTone.border}`,
            borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: '16px',
          }}>
            {hasOperationalFailure
              ? <XCircle size={18} color={bannerTone.color} style={{ flexShrink: 0 }} />
              : failedProducts > 0
                ? <AlertTriangle size={18} color={bannerTone.color} style={{ flexShrink: 0 }} />
                : <CheckCircle size={18} color={bannerTone.color} style={{ flexShrink: 0 }} />}
            <div style={{ fontSize: '13px', color: 'var(--text)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {hasFailure ? (
                <>
                  {totals.errors > 0 && <span><strong>{totals.errors}</strong> aksi gagal</span>}
                  {failedProducts > 0 && <span><strong>{failedProducts}</strong> produk masih berstatus gagal</span>}
                  {health && !health.healthy && <span>Sistem: <strong style={{ color: '#ef4444' }}>peringatan</strong></span>}
                </>
              ) : (
                <span>Semua aman — tidak ada kegagalan di periode ini.</span>
              )}
            </div>
            {failedProducts > 0 && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', flexBasis: '100%' }}>
                Status katalog tersimpan dari percobaan sebelumnya; bukan kegagalan sesi terbaru.
              </span>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              {failedProducts > 0 && (
                <>
                  <button
                    className="btn btn-outline"
                    style={{ fontSize: '12px', padding: '6px 14px' }}
                    onClick={onOpenProducts}
                  >
                    Periksa Produk
                  </button>
                  <button
                    className="btn btn-outline"
                    style={{ fontSize: '12px', padding: '6px 14px', color: '#fbbf24', borderColor: 'rgba(251,191,36,0.35)' }}
                    onClick={resetFailedProducts}
                  >
                    Tandai Siap
                  </button>
                </>
              )}
              {totals.errors > 0 && (
                <button
                  className="btn btn-outline"
                  style={{ fontSize: '12px', padding: '6px 14px' }}
                  onClick={() => setTab('reports')}
                >
                  Lihat Laporan
                </button>
              )}
            </div>
            {failedResetError && <span role="alert" style={{ flexBasis: '100%', color: 'var(--danger)', fontSize: '12px' }}>{failedResetError}</span>}
          </div>
          )}

          {/* Activity Chart */}
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
            padding: '20px', marginBottom: '24px',
          }}>
            <h3 style={{ marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>
              <BarChart3 size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
              Aktivitas Harian
            </h3>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
              {activeSeries.map(s => (
                <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: s.color, display: 'inline-block' }} />
                  {s.label}
                </span>
              ))}
              {activeSeries.length === 0 && <span>Belum ada aktivitas di periode ini.</span>}
            </div>
            {activity.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={activity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '4px' }}
                    labelStyle={{ color: 'var(--text)' }}
                    formatter={(value, name) => [value, seriesMeta.find(s => s.key === name)?.label || name]}
                  />
                  {activeSeries.map(s => (
                    <Line key={s.key} type="monotone" dataKey={s.key} name={s.key} stroke={s.color} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                Belum ada data aktivitas
              </div>
            )}
          </div>

          {/* Listing Stats + Health Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Status Produk */}
            <div style={{
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '20px',
            }}>
              <h3 style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 500 }}>Status Produk</h3>
              {listingStats.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {listingStats.slice(0, 8).map((ls, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)',
                    }}>
                      <span style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px', textTransform: 'capitalize' }}>
                        {ls.status === 'pending' ? 'Pending' : ls.status === 'ready' ? 'Siap' : ls.status === 'posted' ? 'Terposting' : ls.status === 'failed' ? 'Gagal' : ls.status}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                        {ls.count || 0} produk
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Belum ada data listing</div>
              )}
            </div>

            {/* Account Health */}
            <div style={{
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '20px',
            }}>
              <h3 style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 500 }}>Kesehatan Sistem</h3>
              {health ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ fontSize: '13px' }}>Status</span>
                    <span style={{ color: health.healthy ? 'var(--success)' : 'var(--danger)', fontSize: '13px', fontWeight: 500 }}>
                      {health.healthy ? 'Sehat' : 'Peringatan'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ fontSize: '13px' }}>Memori (RSS)</span>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      {health.memory ? `${health.memory.rssMB || 0}MB` : 'N/A'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ fontSize: '13px' }}>Uptime</span>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      {health.uptime ? `${Math.round(health.uptime / 60)}mnt` : 'N/A'}
                    </span>
                  </div>
                  {health.circuitBreakers && Object.entries(health.circuitBreakers).map(([name, cb]) => (
                    <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)' }}>
                      <span style={{ fontSize: '13px' }}>CB: {name}</span>
                      <span style={{
                        fontSize: '12px', fontWeight: 500, padding: '2px 8px', borderRadius: '4px',
                        background: cb.state === 'CLOSED' ? 'rgba(74,222,128,0.1)' : cb.state === 'OPEN' ? 'rgba(239,68,68,0.1)' : 'rgba(251,191,36,0.1)',
                        color: cb.state === 'CLOSED' ? '#4ade80' : cb.state === 'OPEN' ? '#ef4444' : '#fbbf24',
                      }}>
                        {cb.state}
                      </span>
                    </div>
                  ))}
                  {health.recentEvents && health.recentEvents.length > 0 && (
                    <div style={{ marginTop: '4px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Event Terakhir</div>
                      {health.recentEvents.slice(0, 3).map((ev, i) => (
                        <div key={i} style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '2px 0' }}>
                          <AlertTriangle size={10} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                          {ev.event_type}: {ev.details || ''}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Data kesehatan tidak tersedia</div>
              )}
            </div>
          </div>
        </>
      ) : (
        /* Reports Tab */
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '20px',
        }}>
          <h3 style={{ marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>Laporan Harian</h3>
          {(() => {
            const grand = reports.reduce((a, r) => a + dayTotal(r), 0);
            const errAll = reports.reduce((a, r) => a + dayErrors(r), 0);
            const avg = reports.length > 0 ? Math.round(grand / reports.length) : 0;
            const busy = reports.length > 0 ? reports.reduce((m, r) => (dayTotal(r) > dayTotal(m) ? r : m), reports[0]) : null;
            return (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <span><strong style={{ color: 'var(--text)' }}>{reports.length}</strong> hari</span>
                <span><strong style={{ color: 'var(--text)' }}>{grand}</strong> total aksi</span>
                <span>Rata-rata <strong style={{ color: 'var(--text)' }}>{avg}</strong>/hari</span>
                {busy && <span>Tersibuk: <strong style={{ color: 'var(--text)' }}>{fmtDate(busy.report_date)}</strong> ({dayTotal(busy)})</span>}
                <span>Error: <strong style={{ color: errAll > 0 ? 'var(--danger)' : 'var(--text)' }}>{errAll}</strong></span>
              </div>
            );
          })()}
          {reports.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {reports.map((r, i) => {
                const total = dayTotal(r);
                const prev = reports[i + 1];
                const dPost = prev ? dayTotal(r) - dayTotal(prev) : null;
                const verdict = dayErrors(r) > 0 || (r.failed_runs || 0) > 0
                  ? { label: 'Ada gagal', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' }
                  : total > 0 || (r.actual_runs || 0) > 0
                    ? { label: 'Beres', color: '#4ade80', bg: 'rgba(74,222,128,0.1)' }
                    : { label: 'Sepi', color: '#a1a1aa', bg: 'rgba(161,161,170,0.1)' };
                return (
                  <div key={i} style={{
                    padding: '12px 14px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px' }}>{fmtDate(r.report_date)}</span>
                        {dPost != null && (
                          <span style={{
                            fontSize: '11px', fontWeight: 600,
                            color: dPost > 0 ? '#4ade80' : dPost < 0 ? '#ef4444' : '#a1a1aa',
                          }}>
                            {dPost > 0 ? `▲ +${dPost}` : dPost < 0 ? `▼ ${dPost}` : '– sama'} post vs kemarin
                          </span>
                        )}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 10px', borderRadius: '100px', color: verdict.color, background: verdict.bg }}>
                          {verdict.label}
                        </span>
                        <button
                          className="btn btn-outline"
                          style={{ fontSize: '11px', padding: '4px 10px' }}
                          onClick={() => toggleReportDetails(r.report_date)}
                          aria-expanded={expandedReport === r.report_date}
                        >
                          {expandedReport === r.report_date ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          {expandedReport === r.report_date ? 'Tutup rincian' : 'Rincian'}
                        </button>
                        <button
                          className="btn btn-outline"
                          style={{ fontSize: '11px', padding: '4px 12px' }}
                          onClick={() => copyReport(r, i)}
                        >
                          {copied === i ? 'Tersalin ✓' : 'Salin'}
                        </button>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {total} aksi
                        </span>
                      </span>
                    </div>
                    <p style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--text)', margin: '0 0 8px 0' }}>
                      {dayNarrative(r)}
                    </p>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-muted)' }}>
                      <span>Marketplace: <strong style={{ color: 'var(--text)' }}>{r.actual_posts || 0}</strong></span>
                      <span>Post Feed: <strong style={{ color: 'var(--text)' }}>{r.actual_feed_posts || 0}</strong></span>
                      <span>Share grup: <strong style={{ color: 'var(--text)' }}>{r.actual_shares || 0}</strong></span>
                      <span>Aksi terverifikasi: <strong style={{ color: 'var(--text)' }}>{total}</strong></span>
                      <span>Sesi: <strong style={{ color: 'var(--text)' }}>{r.actual_runs || 0}</strong></span>
                      <span>Durasi: <strong style={{ color: 'var(--text)' }}>{formatDuration(r.duration_ms)}</strong></span>
                      {(r.failed_runs || 0) > 0 && <span style={{ color: 'var(--danger)' }}>Sesi gagal: <strong>{r.failed_runs}</strong></span>}
                      <span style={{ color: dayErrors(r) > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>Error: <strong>{dayErrors(r)}</strong></span>
                    </div>
                    {expandedReport === r.report_date && (
                      <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
                        {reportLoading === r.report_date ? (
                          <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Memuat aktivitas akun, listing, dan error…</div>
                        ) : reportError ? (
                          <div role="alert" style={{ color: 'var(--danger)', fontSize: '13px' }}>{reportError}</div>
                        ) : reportDetails[r.report_date] ? (() => {
                          const detail = reportDetails[r.report_date];
                          const levelCards = [
                            ['Log aktivitas', detail.summary.logs, '#a1a1aa'],
                            ['Aksi berhasil', detail.summary.actions, '#4ade80'],
                            ['Log peringatan', detail.summary.levels.warn, '#fbbf24'],
                            ['Aksi gagal', detail.summary.errorCount, '#ef4444'],
                          ];
                          return (
                            <div style={{ display: 'grid', gap: '16px' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
                                {levelCards.map(([label, value, color]) => (
                                  <div key={label} style={{ padding: '10px 12px', borderRadius: '10px', background: 'var(--card)', border: '1px solid var(--border)' }}>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{label}</div>
                                    <strong style={{ display: 'block', marginTop: '3px', fontSize: '18px', color }}>{value}</strong>
                                  </div>
                                ))}
                              </div>
                              <section>
                                <h4 style={{ marginBottom: '8px', fontSize: '13px' }}>Sesi automasi ({detail.runs.length})</h4>
                                {detail.runs.length ? (
                                  <div style={{ display: 'grid', gap: '6px' }}>
                                    {detail.runs.map(run => (
                                      <div key={run.run_id} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) auto', gap: '8px 14px', padding: '10px 12px', borderRadius: '8px', background: 'var(--card)', fontSize: '12px' }}>
                                        <strong>{run.mode.toUpperCase()} · {run.status}</strong>
                                        <span style={{ color: 'var(--text-muted)' }}>{formatDuration(run.duration_ms)}</span>
                                        <span style={{ color: 'var(--text-muted)' }}>{run.accounts_count} akun · {run.listings_count} produk · {run.success_count} sukses · {run.failed_count} gagal</span>
                                        <span style={{ color: 'var(--text-muted)' }}>{run.started_at?.slice(11, 16)}{run.ended_at ? `–${run.ended_at.slice(11, 16)}` : ' · masih berjalan'}</span>
                                        {run.error_message && <span style={{ gridColumn: '1 / -1', color: 'var(--danger)' }}>{run.error_message}</span>}
                                      </div>
                                    ))}
                                  </div>
                                ) : <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Belum ada sesi automasi tercatat.</p>}
                              </section>
                              <section>
                                <h4 style={{ marginBottom: '8px', fontSize: '13px' }}>Performa akun</h4>
                                {detail.accounts.length ? (
                                  <div style={{ display: 'grid', gap: '6px' }}>
                                    {detail.accounts.map(account => (
                                      <div key={account.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', padding: '9px 12px', borderRadius: '8px', background: 'var(--card)', fontSize: '12px' }}>
                                        <strong>{account.name}</strong>
                                        <span style={{ color: 'var(--text-muted)' }}>{account.events} aktivitas · <b style={{ color: '#4ade80' }}>{account.success} berhasil</b> · <b style={{ color: '#fbbf24' }}>{account.warn} peringatan</b> · <b style={{ color: '#ef4444' }}>{account.error} error</b></span>
                                      </div>
                                    ))}
                                  </div>
                                ) : <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Tidak ada aktivitas akun tercatat.</p>}
                              </section>
                              <section>
                                <h4 style={{ marginBottom: '8px', fontSize: '13px' }}>Listing Marketplace berhasil ({detail.listings.length})</h4>
                                {detail.listings.length ? (
                                  <div style={{ display: 'grid', gap: '6px' }}>
                                    {detail.listings.map(listing => (
                                      <div key={listing.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '9px 12px', borderRadius: '8px', background: 'var(--card)', fontSize: '12px' }}>
                                        <span>{listing.title}</span>
                                        <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(listing.price || 0)} · {listing.status}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Tidak ada listing dengan waktu posting di tanggal ini.</p>}
                              </section>
                              <section>
                                <h4 style={{ marginBottom: '8px', fontSize: '13px' }}>Masalah & kejadian terbaru</h4>
                                {detail.timeline.length ? (
                                  <div style={{ display: 'grid', gap: '5px', maxHeight: '300px', overflowY: 'auto' }}>
                                    {detail.timeline.map((event, index) => (
                                      <div key={`${event.timestamp}-${index}`} style={{ display: 'grid', gridTemplateColumns: '70px 76px minmax(0, 1fr)', gap: '8px', alignItems: 'start', padding: '7px 10px', borderRadius: '7px', background: 'var(--card)', fontSize: '11px' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>{event.timestamp?.slice(11, 16)}</span>
                                        <strong style={{ color: event.level === 'error' ? '#ef4444' : event.level === 'warn' ? '#fbbf24' : '#4ade80', textTransform: 'uppercase' }}>{event.level}</strong>
                                        <span style={{ overflowWrap: 'anywhere' }}>{event.account ? `[${event.account}] ` : ''}{event.message}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Tidak ada error atau kejadian penting pada hari ini.</p>}
                              </section>
                              <p style={{ color: 'var(--text-muted)', fontSize: '11px', margin: 0 }}>Hasil posting dan share dihitung dari event automasi terstruktur. Like, komentar, dan chat belum dicatat terstruktur.</p>
                            </div>
                          );
                        })() : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
              Belum ada laporan yang dibuat. Laporan dibuat di akhir setiap hari otomatisasi.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
