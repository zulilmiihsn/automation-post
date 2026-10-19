import { useState, useEffect, useRef } from 'react';
import { Play, Square, Activity, RefreshCw, Send } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ToastContext';
import { useConfirm } from '../components/ConfirmContext';

export default function ChatDashboard() {
  const [isRunningChat, setIsRunningChat] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState('');
  const [enabledMap, setEnabledMap] = useState(null);
  const [threads, setThreads] = useState([]);
  const [counts, setCounts] = useState({});
  const [activeKey, setActiveKey] = useState('');
  const [messages, setMessages] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [query, setQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [reading, setReading] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState('');
  const [lastSync, setLastSync] = useState('');
  const msgBoxRef = useRef(null);
  const toast = useToast();
  const confirm = useConfirm();

  const loadThreads = async (acc = accountId) => {
    try {
      const rows = await api.getChatThreads({ accountId: acc || undefined, limit: 50 });
      setThreads(rows || []);
      if (rows && rows.length > 0) {
        openThread(rows[0].key);
      }
    } catch (err) {
      console.error('Chat threads error:', err);
    }
    try {
      const all = await api.getChatThreads({ limit: 200 });
      const c = {};
      for (const t of all || []) c[t.account_id] = (c[t.account_id] || 0) + 1;
      setCounts(c);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const accs = await api.getAccounts();
        const act = accs ? accs.filter(a => a.isActive) : [];
        setAccounts(act);
        const cfg = await api.getConfig().catch(() => ({}));
        let enabled = null;
        try {
          const arr = JSON.parse(cfg.chat_enabled_accounts || 'null');
          if (Array.isArray(arr)) enabled = new Set(arr.map(String));
        } catch { enabled = null; }
        setEnabledMap(enabled);
        if (act.length > 0) {
          setAccountId(act[0].id);
          loadThreads(act[0].id);
        }
      } catch (err) {
        console.error('Chat dashboard error:', err);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    let es = null;
    let retryTimeout = null;
    const connectStream = () => {
      if (es) es.close();
      es = new EventSource('/api/stream-logs?mode=all');
      es.onmessage = (event) => {
        const streamData = JSON.parse(event.data);
        if (streamData.type === 'status' && streamData.mode === 'chat') setIsRunningChat(streamData.isRunning);
        if (streamData.done && streamData.mode === 'chat') setIsRunningChat(false);
      };
      es.onerror = () => {
        es.close();
        retryTimeout = setTimeout(connectStream, 3000);
      };
    };
    connectStream();
    return () => {
      if (es) es.close();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, []);

  const isChatOn = (id) => !enabledMap || enabledMap.has(String(id));

  const toggleChatAccount = async (id) => {
    const next = new Set(enabledMap || accounts.map(a => String(a.id)));
    if (next.has(String(id))) next.delete(String(id));
    else next.add(String(id));
    setEnabledMap(next);
    try {
      await api.setConfig('chat_enabled_accounts', JSON.stringify([...next]));
      toast.success(next.has(String(id)) ? 'Akun ikut ronda chat' : 'Akun stop, tanpa browser');
    } catch (err) {
      toast.error('Gagal simpan toggle: ' + err.message);
    }
  };

  useEffect(() => {
    const el = msgBoxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, drafts, activeKey]);

  const openThread = async (key, auto = false) => {
    setActiveKey(key);
    try {
      const data = await api.getChatMessages(key);
      setMessages(data.messages || []);
      setDrafts(data.drafts || []);
      if ((data.messages || []).length === 0 && !auto) {
        // Otomatis muat dari FB saat dibuka pertama
        setReading(true);
        try {
          await api.readChatThread(key);
          const fresh = await api.getChatMessages(key);
          setMessages(fresh.messages || []);
          setDrafts(fresh.drafts || []);
        } catch (e) {
          toast.error('Gagal muat riwayat: ' + e.message);
        } finally {
          setReading(false);
        }
      }
    } catch (err) {
      toast.error('Gagal buka thread: ' + err.message);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setProgress('Mulai...');
    try {
      const targets = accounts.filter(a => isChatOn(a.id));
      let total = 0;
      for (let i = 0; i < targets.length; i++) {
        const a = targets[i];
        setProgress(`${i + 1}/${targets.length} ${a.fbName || a.name}...`);
        try {
          const r = await api.syncChatInbox(a.id);
          total += r.threads || 0;
        } catch (e) {
          toast.error(`Gagal sinkron ${a.fbName || a.name}: ` + e.message);
        }
      }
      setLastSync(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
      toast.success(`Sinkron ${targets.length} akun, ${total} thread`);
      loadThreads(accountId);
    } catch (err) {
      toast.error('Gagal sinkron: ' + err.message);
    } finally {
      setSyncing(false);
      setProgress('');
    }
  };

  const handleReadAll = async () => {
    const targets = accounts.filter(a => isChatOn(a.id));
    if (targets.length === 0) return;
    if (!(await confirm(`Borong isi maks 10 thread per akun, ${targets.length} akun. Semua ditandai dibaca, makan menit.`))) return;
    setReading(true);
    try {
      for (let i = 0; i < targets.length; i++) {
        const a = targets[i];
        setProgress(`Isi ${i + 1}/${targets.length} ${a.fbName || a.name}...`);
        let rows = [];
        try {
          rows = await api.getChatThreads({ accountId: a.id, limit: 50 });
        } catch (e) {
          toast.error(`Gagal daftar ${a.fbName || a.name}: ` + e.message);
          continue;
        }
        for (const t of (rows || []).slice(0, 10)) {
          try {
            await api.readChatThread(t.key);
          } catch (e) {
            toast.error(`Gagal ${t.buyer}: ` + e.message);
          }
        }
      }
      toast.success('Borong selesai');
      loadThreads(accountId);
      if (activeKey) openThread(activeKey);
    } finally {
      setReading(false);
      setProgress('');
    }
  };

  const handleFollowup = async () => {
    if (!(await confirm("Follow-up thread sunyi 2 hari (maks 2 per thread)?"))) return;
    setSyncing(true);
    try {
      const r = await api.runChatFollowup(accountId || undefined);
      const n = (r.results || []).filter(x => x.status === 'replied').length;
      toast.success(`Follow-up terkirim ${n}`);
      loadThreads(accountId);
    } catch (err) {
      toast.error('Gagal follow-up: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleSend = async () => {
    const text = replyText.trim();
    if (!text || !activeKey) return;
    if (!(await confirm(`Kirim pesan ke thread ini?`))) return;
    setSending(true);
    try {
      const th = threads.find(t => t.key === activeKey);
      await api.sendChatMessage(th.account_id, activeKey, text);
      setReplyText('');
      openThread(activeKey);
      toast.success('Pesan terkirim');
    } catch (err) {
      toast.error('Gagal kirim: ' + err.message);
    } finally {
      setSending(false);
    }
  };

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
      toast.error("Gagal menghentikan bot chat: " + err.message);
    }
  };

  const activeThread = threads.find(t => t.key === activeKey);
  const visibleThreads = threads.filter(t => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${t.buyer} ${t.topic} ${t.last_message || ''}`.toLowerCase().includes(q);
  });

  return (
    <div style={{ padding: '0 4px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap'
      }}>
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isRunningChat ? 'var(--success)' : 'var(--border)', flexShrink: 0 }} />
        <span style={{ fontSize: '13px', fontWeight: 600 }}>{isRunningChat ? 'Ronda jalan' : 'Berhenti'}</span>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {accounts.filter(a => isChatOn(a.id)).length}/{accounts.length} akun aktif
        </span>
        <span style={{ flex: 1 }} />
        {(syncing || reading) && progress && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{progress}</span>
        )}
        {lastSync && !syncing && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Sinkron {lastSync}</span>
        )}
        <button className="btn" onClick={handleSync} disabled={syncing} title="Segarkan daftar semua akun aktif (isi pesan saat thread dibuka)" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', fontSize: '12px' }}>
          <RefreshCw size={13} /> {syncing ? 'Jalan...' : 'Segarkan semua'}
        </button>
        <button className="btn" onClick={handleFollowup} disabled={syncing} title="Sapa thread sunyi 2 hari, maks 2 per thread" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', fontSize: '12px' }}>
          <Send size={13} /> Follow-up
        </button>
        {isRunningChat ? (
          <button className="btn btn-danger" onClick={handleStopChat} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', fontSize: '12px' }}>
            <Square size={13} fill="currentColor" /> Stop
          </button>
        ) : (
          <button className="btn btn-success" onClick={handleStartChat} disabled={accounts.length === 0} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', fontSize: '12px' }}>
            <Play size={13} fill="currentColor" /> Jalan
          </button>
        )}
      </div>

      <div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', flex: '1 1 100%' }}>
          {accounts.map(a => {
            const on = isChatOn(a.id);
            const active = accountId === a.id;
            return (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 8px 7px 14px', borderRadius: '999px',
                border: active ? '1.5px solid var(--success)' : '1px solid var(--border-light)',
                background: active ? 'var(--card-hover)' : 'var(--card)', opacity: on ? 1 : 0.6
              }}>
                <button onClick={() => { setAccountId(a.id); setActiveKey(''); setQuery(''); loadThreads(a.id); }}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                  {a.fbName || a.name} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({counts[a.id] || 0})</span>
                </button>
                <button onClick={() => toggleChatAccount(a.id)} title={on ? 'Nonaktifkan ronda akun ini' : 'Aktifkan ronda akun ini'}
                  style={{
                    width: '36px', height: '20px', borderRadius: '999px', border: 'none', cursor: 'pointer',
                    background: on ? 'var(--success)' : 'var(--border)', position: 'relative', padding: 0, flexShrink: 0
                  }}>
                  <span style={{
                    display: 'block', width: '14px', height: '14px', borderRadius: '50%', background: 'var(--success-contrast)',
                    position: 'absolute', top: '3px', left: on ? '19px' : '3px', transition: 'left 0.15s'
                  }} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) minmax(0, 1fr)', gap: '16px', minHeight: '480px' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '12px', height: '560px', overflowY: 'auto' }}>
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari pembeli / produk..."
            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none', fontSize: '12px', marginBottom: '8px' }} />
          {visibleThreads.length === 0 && <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '8px' }}>Belum ada. Klik Segarkan.</div>}
          {visibleThreads.map(t => (
            <div key={t.key} onClick={() => openThread(t.key)}
              style={{
                padding: '10px 12px', borderRadius: '10px', cursor: 'pointer', marginBottom: '6px',
                background: activeKey === t.key ? 'var(--card-hover)' : 'transparent',
                border: activeKey === t.key ? '1px solid var(--border-light)' : '1px solid transparent'
              }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{t.buyer} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>· {t.topic}</span></div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.last_message}</div>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '16px', display: 'flex', flexDirection: 'column', height: '560px', minWidth: 0 }}>
          {!activeThread ? (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', margin: 'auto' }}>Pilih thread untuk lihat riwayat + balas manual.</div>
          ) : (
            <>
              <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>{activeThread.buyer} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>· {activeThread.topic}</span></div>
              <div ref={msgBoxRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', minHeight: 0 }}>
                {messages.length === 0 && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>Belum ada riwayat tersimpan. Balasan bot tercatat di sini.</div>
                    <button className="btn" onClick={() => openThread(activeKey)} disabled={reading} style={{ padding: '8px 14px', fontSize: '12px' }}>
                      {reading ? 'Membuka thread...' : 'Muat riwayat dari FB'}
                    </button>
                    <button className="btn" onClick={handleReadAll} disabled={reading} style={{ padding: '8px 14px', fontSize: '12px', marginTop: '8px' }}>
                      {reading ? 'Borong jalan...' : 'Borong semua isi (maks 10)'}
                    </button>
                  </div>
                )}
                {messages.map(m => (
                  m.sender === 'system' ? (
                    <div key={m.id} style={{ alignSelf: 'center', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', maxWidth: '90%' }}>{m.text}</div>
                  ) : (
                  <div key={m.id} style={{
                    alignSelf: m.sender === 'buyer' ? 'flex-start' : 'flex-end',
                    background: m.sender === 'buyer' ? 'var(--card-hover)' : 'rgba(59,130,246,.15)',
                    padding: '8px 12px', borderRadius: '12px', fontSize: '13px', maxWidth: '85%'
                  }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>{m.sender === 'buyer' ? 'Pembeli' : m.sender === 'bot' ? 'Bot' : 'Kamu'}</div>
                    {m.text}
                    {m.sent_at && <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'right' }}>{m.sent_at}</div>}
                  </div>
                  )
                ))}
                {drafts.map(d => (
                  <div key={'d' + d.id} style={{ alignSelf: 'flex-end', border: '1px dashed var(--border-light)', padding: '8px 12px', borderRadius: '12px', fontSize: '13px', maxWidth: '85%' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>Draf bot (pending)</div>
                    {d.draft}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
                  placeholder="Tulis balasan manual..."
                  style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }} />
                <button className="btn btn-success" onClick={handleSend} disabled={sending || !replyText.trim()} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px' }}>
                  <Send size={14} /> Kirim
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {isRunningChat && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)', fontSize: '13px' }}>
          <Activity size={16} className="animate-pulse" /> Bot sedang memantau inbox...
        </div>
      )}
    </div>
  );
}
