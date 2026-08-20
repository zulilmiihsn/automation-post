import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Heart, MessageCircle, Share2, Package, AlertTriangle, CheckCircle, FileText } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../services/api';

export default function Analytics() {
  const [activity, setActivity] = useState([]);
  const [listingStats, setListingStats] = useState([]);
  const [reports, setReports] = useState([]);
  const [health, setHealth] = useState(null);
  const [days, setDays] = useState(7);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
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
  };

  useEffect(() => { fetchData(); }, [days]);

  const totals = activity.reduce((acc, d) => ({
    posts: acc.posts + (d.posts || 0),
    likes: acc.likes + (d.likes || 0),
    comments: acc.comments + (d.comments || 0),
    shares: acc.shares + (d.shares || 0),
    chats: acc.chats + (d.chats || 0),
    errors: acc.errors + (d.errors || 0),
  }), { posts: 0, likes: 0, comments: 0, shares: 0, chats: 0, errors: 0 });

  const successRate = totals.posts > 0
    ? Math.round(((totals.posts - totals.errors) / totals.posts) * 100)
    : 0;

  const statCards = [
    { label: 'Total Post', value: totals.posts, icon: Package, color: '#818cf8' },
    { label: 'Like Diberikan', value: totals.likes, icon: Heart, color: '#f472b6' },
    { label: 'Komentar', value: totals.comments, icon: MessageCircle, color: '#34d399' },
    { label: 'Share', value: totals.shares, icon: Share2, color: '#60a5fa' },
    { label: 'Balasan Chat', value: totals.chats, icon: TrendingUp, color: '#fbbf24' },
    { label: 'Tingkat Keberhasilan', value: `${successRate}%`, icon: CheckCircle, color: '#4ade80' },
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
              try {
                await api.generateReport();
                fetchData();
              } catch (err) { console.error(err); }
            }}
            style={{ fontSize: '12px', padding: '6px 12px' }}
          >
            <FileText size={14} style={{ marginRight: '4px' }} /> Buat Laporan
          </button>
          {[7, 14, 30].map(d => (
            <button
              key={d}
              className={`btn ${days === d ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setDays(d)}
              style={{ padding: '4px 10px', fontSize: '12px' }}
            >
              {d}h
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Memuat analitik...</div>
      ) : tab === 'overview' ? (
        <>
          {/* Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
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

          {/* Activity Chart */}
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
            padding: '20px', marginBottom: '24px',
          }}>
            <h3 style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 500 }}>
              <BarChart3 size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
              Aktivitas Harian
            </h3>
            {activity.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={activity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '4px' }}
                    labelStyle={{ color: 'var(--text)' }}
                  />
                  <Line type="monotone" dataKey="posts" stroke="#818cf8" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="likes" stroke="#f472b6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="comments" stroke="#34d399" strokeWidth={2} dot={false} />
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
          <h3 style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 500 }}>Laporan Harian</h3>
          {reports.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {reports.map((r, i) => (
                <div key={i} style={{
                  padding: '12px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 500, fontSize: '13px' }}>{r.report_date}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {r.total_actions || 0} aksi
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {r.posts_created != null && <span>Post: {r.posts_created}</span>}
                    {r.likes_given != null && <span>Like: {r.likes_given}</span>}
                    {r.comments_made != null && <span>Komentar: {r.comments_made}</span>}
                    {r.shares_made != null && <span>Share: {r.shares_made}</span>}
                    {r.chats_replied != null && <span>Chat: {r.chats_replied}</span>}
                    {r.errors_count != null && <span style={{ color: r.errors_count > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>Error: {r.errors_count}</span>}
                  </div>
                </div>
              ))}
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
