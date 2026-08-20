import { useState, useEffect } from 'react';
import { Bot, MessageCircle, Users, Brain, Search, Activity, Play, Square } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ToastContext';
import { useConfirm } from '../components/ConfirmContext';

export default function AgentDashboard() {
  const [stats, setStats] = useState(null);
  const [interactions, setInteractions] = useState([]);
  const [memories, setMemories] = useState([]);
  const [memorySearch, setMemorySearch] = useState('');
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [isRunningAgent, setIsRunningAgent] = useState(false);
  const [isRunningChat, setIsRunningChat] = useState(false);
  const [activeAccountsCount, setActiveAccountsCount] = useState(0);
  const toast = useToast();
  const confirm = useConfirm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [s, inter, mem, accs] = await Promise.all([
        api.getAgentStats(),
        api.getAgentInteractions({ limit: 50 }),
        api.getAgentMemories({ limit: 50 }),
        api.getAccounts(),
      ]);
      setStats(s);
      setInteractions(inter || []);
      setMemories(mem || []);
      setActiveAccountsCount(accs ? accs.filter(a => a.isActive).length : 0);
    } catch (err) {
      console.error('Agent dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    let es = null;
    let retryTimeout = null;

    const connectStream = () => {
      if (es) {
        es.close();
      }

      es = new EventSource('/api/stream-logs?mode=all');

      es.onmessage = (event) => {
        const streamData = JSON.parse(event.data);

        if (streamData.type === 'status') {
          const { mode: qMode, isRunning } = streamData;
          if (qMode === 'chat') setIsRunningChat(isRunning);
          if (qMode === 'agent') setIsRunningAgent(isRunning);
        }

        if (streamData.done) {
          const { mode: qMode } = streamData;
          if (qMode === 'chat') setIsRunningChat(false);
          if (qMode === 'agent') setIsRunningAgent(false);
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
  }, []);

  const handleStartChat = async () => {
    if (!(await confirm("Jalankan otomatisasi Chat Auto-Reply sekarang?"))) return;
    try {
      const res = await fetch("/api/run-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: 'chat' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Gagal memulai chat");
      toast.success("Chat Auto-Reply dijalankan");
    } catch (err) {
      toast.error("Error: " + err.message);
    }
  };

  const handleStopChat = async () => {
    if (!(await confirm("Hentikan bot Chat yang sedang berjalan?"))) return;
    try {
      await fetch("/api/stop-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: 'chat' }),
      });
      toast.success("Chat Auto-Reply dihentikan");
    } catch (err) {
      console.error(err);
      toast.error("Gagal menghentikan bot chat: " + err.message);
    }
  };

  const handleStartAgent = async () => {
    if (!(await confirm("Jalankan AI Agent (like & comment feed otomatis)?"))) return;
    try {
      const res = await api.runAgent({});
      if (res.error) throw new Error(res.error);
      toast.success("AI Agent berhasil dijalankan");
    } catch (err) {
      toast.error("Error: " + err.message);
    }
  };

  const handleStopAgent = async () => {
    if (!(await confirm("Hentikan AI Agent?"))) return;
    try {
      await api.stopAgent();
      toast.success("AI Agent dihentikan");
    } catch (err) {
      console.error(err);
      toast.error("Gagal menghentikan AI Agent: " + err.message);
    }
  };

  const searchMemories = async () => {
    if (!memorySearch.trim()) {
      const mem = await api.getAgentMemories({ limit: 50 });
      setMemories(mem || []);
      return;
    }
    const mem = await api.getAgentMemories({ search: memorySearch, limit: 50 });
    setMemories(mem || []);
  };

  useEffect(() => {
    const timer = setTimeout(searchMemories, 300);
    return () => clearTimeout(timer);
  }, [memorySearch]);

  const statCards = stats ? [
    { label: 'Total Interaksi', value: stats.total_interactions || 0, icon: Activity, color: '#818cf8' },
    { label: 'Post Dipindai', value: stats.posts_scanned || 0, icon: Search, color: '#60a5fa' },
    { label: 'Komentar Dibuat', value: stats.comments_made || 0, icon: MessageCircle, color: '#34d399' },
    { label: 'Pengguna Unik', value: stats.unique_users || 0, icon: Users, color: '#fbbf24' },
    { label: 'Memori Tersimpan', value: stats.memories_count || 0, icon: Brain, color: '#f472b6' },
    { label: 'Balasan Terkirim', value: stats.replies_sent || 0, icon: Bot, color: '#a78bfa' },
  ] : [];

  return (
    <div style={{ padding: '0 4px' }}>
      {/* Tabs and Controls */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[
            { id: 'overview', label: 'Ringkasan' },
            { id: 'interactions', label: 'Interaksi' },
            { id: 'memories', label: 'Memori' },
          ].map(t => (
            <button
              key={t.id}
              className={`btn ${tab === t.id ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {isRunningAgent ? (
            <button className="btn btn-danger" onClick={handleStopAgent} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Square size={12} fill="currentColor" /> Hentikan Agent
            </button>
          ) : (
            <button className="btn btn-success" onClick={handleStartAgent} disabled={activeAccountsCount === 0 || isRunningChat} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Play size={12} fill="currentColor" /> Jalankan Agent
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Memuat data agent...</div>
      ) : tab === 'overview' ? (
        <>
          {/* Stats Grid */}
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

          {/* Recent Interactions Preview */}
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '20px',
          }}>
            <h3 style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 500 }}>Interaksi Terakhir</h3>
            {interactions.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {interactions.slice(0, 5).map((inter, i) => (
                  <div key={i} style={{
                    padding: '10px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500 }}>{inter.author || 'Tidak Diketahui'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {(inter.should_like && inter.should_comment ? 'like & comment' : inter.should_like ? 'like' : 'comment')} &middot; {inter.post_text ? inter.post_text.substring(0, 50) + '...' : ''}
                      </div>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {inter.timestamp ? new Date(inter.timestamp).toLocaleDateString() : ''}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Belum ada interaksi</div>
            )}
          </div>
        </>
      ) : tab === 'interactions' ? (
        /* Full Interactions Table */
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '20px',
        }}>
          <h3 style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 500 }}>Riwayat Interaksi</h3>
          {interactions.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Pembuat', 'Aksi', 'Post', 'Komentar', 'Tanggal'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '12px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {interactions.map((inter, i) => {
                    const actionType = inter.should_like && inter.should_comment ? 'like & comment' : inter.should_like ? 'like' : 'comment';
                    return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px' }}>{inter.author || '-'}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 500,
                          background: actionType.includes('like') ? 'rgba(244,114,182,0.1)' : 'rgba(52,211,153,0.1)',
                          color: actionType.includes('like') ? '#f472b6' : '#34d399',
                        }}>
                          {actionType}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inter.post_text ? inter.post_text.substring(0, 60) + '...' : '-'}
                      </td>
                      <td style={{ padding: '8px 12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inter.comment_text ? inter.comment_text.substring(0, 60) + '...' : '-'}
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {inter.timestamp ? new Date(inter.timestamp).toLocaleString() : '-'}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px' }}>Belum ada riwayat interaksi</div>
          )}
        </div>
      ) : (
        /* Memories Tab */
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 500 }}>Memori Pengguna</h3>
            <div style={{ marginLeft: 'auto', position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Cari memori..."
                value={memorySearch}
                onChange={(e) => setMemorySearch(e.target.value)}
                style={{
                  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                  color: 'var(--text)', padding: '6px 10px 6px 28px', fontSize: '12px', width: '220px', outline: 'none',
                }}
              />
            </div>
          </div>
          {memories.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {memories.map((mem, i) => (
                <div key={i} style={{
                  padding: '12px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 500, fontSize: '13px' }}>{mem.username || 'Pengguna Tidak Dikenal'}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {mem.last_interaction ? new Date(mem.last_interaction).toLocaleDateString() : ''}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {mem.notes || '-'}
                  </div>
                  {mem.interaction_count > 0 && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {mem.interaction_count} interaksi
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
              {memorySearch ? 'Tidak ada memori yang cocok' : 'Belum ada memori tersimpan'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
