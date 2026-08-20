import { Terminal as TerminalIcon, Trash, X, Search, Filter, Download, Pause, Play, AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../services/api';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmContext';

const LEVEL_OPTIONS = [
  { value: 'all', label: 'Semua Level' },
  { value: 'error', label: 'Error' },
  { value: 'warn', label: 'Peringatan' },
  { value: 'success', label: 'Sukses' },
  { value: 'info', label: 'Info' },
];

const MODE_OPTIONS = [
  { value: 'all', label: 'Semua Mode' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'viral', label: 'Viral Share' },
  { value: 'comment', label: 'Komentar' },
  { value: 'chat', label: 'Chat' },
  { value: 'agent', label: 'AI Agent' },
  { value: 'scraper', label: 'Scraper' },
];

const LEVEL_COLORS = {
  error: '#ef4444',
  warn: '#f59e0b',
  success: '#10b981',
  info: '#a1a1aa',
  system: '#3b82f6',
};

/** Parse a raw live log string into { level, context, message } */
function parseLiveLog(msg) {
  if (!msg || typeof msg !== 'string') {
    return { 
      level: 'info', 
      context: '', 
      message: typeof msg === 'object' ? JSON.stringify(msg) : String(msg || '') 
    };
  }
  let level = 'info';
  let context = '';
  let message = msg;

  // Detect level from tag
  if (msg.includes('[ERROR]') || msg.includes('ERROR:')) level = 'error';
  else if (msg.includes('[WARN]')) level = 'warn';
  else if (msg.includes('[SUCCESS]') || msg.includes('Berhasil')) level = 'success';
  else if (msg.includes('>>>') || msg.includes('<<<') || msg.includes('SYSTEM:') || msg.includes('[SYSTEM]')) level = 'system';

  // Extract context from [ContextName] pattern after level tag
  const ctxMatch = msg.match(/\[\w+\]\s+\[([^\]]+)\]/);
  if (ctxMatch) {
    context = ctxMatch[1];
    // Remove level tag and context from message for cleaner display
    message = msg.replace(/^.*?\]\s+\[[^\]]+\]\s*/, '').trim();
    if (!message) message = msg; // fallback if regex ate everything
  }

  return { level, context, message };
}

function getLogType(msg) {
  return parseLiveLog(msg).level;
}

export default function ConsoleModal({
  show,
  onClose,
  logs = [],
  onClearLogs,
  isRunningMp,
  isRunningViral,
  isRunningComment,
  isRunningSundul,
  isRunningChat,
  isRunningAgent,
  isRunningScraper,
  termRef
}) {
  const [showFilters, setShowFilters] = useState(false);
  const [filterLevel, setFilterLevel] = useState('all');
  const [filterMode, setFilterMode] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [historyLogs, setHistoryLogs] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef(null);
  const toast = useToast();
  const confirm = useConfirm();

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current && !showHistory) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll, showHistory]);

  // Load persisted logs when modal opens
  useEffect(() => {
    if (show && !showHistory) {
      loadHistoryLogs();
    }
  }, [show, showHistory]);

  const loadHistoryLogs = async () => {
    setLoadingHistory(true);
    try {
      const params = { limit: 300 };
      if (filterMode !== 'all') params.mode = filterMode;
      if (filterLevel !== 'all') params.level = filterLevel;
      if (searchText) params.search = searchText;
      const data = await api.getLogs(params);
      setHistoryLogs(data || []);
    } catch (err) {
      console.error("Failed to load log history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleClearHistory = async () => {
    if (!(await confirm("Hapus semua log yang tersimpan (lebih dari 7 hari)?"))) return;
    try {
      const result = await api.clearLogs(7);
      toast.success(`${result.deleted || 0} log lama berhasil dihapus`);
      loadHistoryLogs();
    } catch (err) {
      console.error(err);
      toast.error(`Gagal menghapus log: ${err.message}`);
    }
  };

  const handleExportLogs = () => {
    const allLogs = showHistory ? historyLogs : (logs || []);
    const text = (showHistory 
      ? allLogs.map(l => `[${l?.timestamp || ''}] [${l?.level || 'info'}] [${l?.context || ''}] ${l?.message || ''}`) 
      : allLogs.map(l => (typeof l === 'string' ? l : (l?.msg || l?.message || JSON.stringify(l))))
    ).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bot-logs-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Compute summary counts from live logs
  const liveCounts = (logs || []).reduce((acc, l) => {
    if (!l) return acc;
    const msgStr = typeof l === 'string' ? l : (l.msg || l.message || '');
    const type = l.type || parseLiveLog(msgStr).level;
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  // Filter live logs
  const filteredLiveLogs = (logs || []).filter(l => {
    if (!l) return false;
    const msgStr = typeof l === 'string' ? l : (l.msg || l.message || '');
    if (!msgStr && l.type === 'status') return false; // ignore raw status events
    const type = l.type || parseLiveLog(msgStr).level;
    if (filterLevel !== 'all' && type !== filterLevel) return false;
    if (searchText && !msgStr.toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  // Filter history logs (already filtered by API, but search again client-side for extra filtering)
  const filteredHistoryLogs = (historyLogs || []).filter(l => {
    if (!l) return false;
    if (searchText && !String(l.message || '').toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  if (!show) return null;

  const displayLogs = showHistory ? filteredHistoryLogs : filteredLiveLogs;
  const isAnyRunning = isRunningMp || isRunningViral || isRunningComment || isRunningSundul || isRunningChat || isRunningAgent || isRunningScraper;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', width: '95%', padding: 0, borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '700px' }}>
        
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--card)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)', letterSpacing: '0.05em' }}>
            <TerminalIcon size={16} /> AUTOMATION TERMINAL
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Tab Toggle: Live / History */}
            <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
              <button 
                onClick={() => setShowHistory(false)}
                style={{ padding: '5px 12px', fontSize: '0.7rem', fontWeight: 600, border: 'none', cursor: 'pointer', background: !showHistory ? 'var(--primary, #3b82f6)' : 'transparent', color: !showHistory ? '#fff' : 'var(--text-muted)' }}
              >
                LANGSUNG
              </button>
              <button 
                onClick={() => { setShowHistory(true); loadHistoryLogs(); }}
                style={{ padding: '5px 12px', fontSize: '0.7rem', fontWeight: 600, border: 'none', cursor: 'pointer', background: showHistory ? 'var(--primary, #3b82f6)' : 'transparent', color: showHistory ? '#fff' : 'var(--text-muted)' }}
              >
                RIWAYAT
              </button>
            </div>
            <button className="btn btn-outline" style={{ padding: '5px 8px', fontSize: '0.7rem' }} onClick={() => setShowFilters(!showFilters)} title="Filters">
              <Filter size={12} />
            </button>
            <button className="btn btn-outline" style={{ padding: '5px 8px', fontSize: '0.7rem' }} onClick={handleExportLogs} title="Export">
              <Download size={12} />
            </button>
            <button className="btn btn-primary" style={{ padding: '5px 8px', fontSize: '0.7rem' }} onClick={() => { onClearLogs(); if (showHistory) handleClearHistory(); }}>
              <Trash size={12} />
            </button>
            <button className="btn btn-primary" style={{ padding: '5px', borderRadius: '50%' }} onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        {showFilters && (
          <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '10px', alignItems: 'center', background: 'var(--card)', flexWrap: 'wrap' }}>
            {/* Search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '180px', background: 'var(--bg, #111)', borderRadius: '8px', padding: '6px 10px' }}>
              <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Cari log..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && showHistory) loadHistoryLogs(); }}
                style={{ border: 'none', background: 'transparent', color: 'var(--text)', fontSize: '0.8rem', outline: 'none', width: '100%' }}
              />
            </div>

            {/* Level Filter */}
            <select
              value={filterLevel}
              onChange={e => { setFilterLevel(e.target.value); if (showHistory) setTimeout(loadHistoryLogs, 100); }}
              style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg, #111)', color: 'var(--text)', fontSize: '0.75rem', cursor: 'pointer' }}
            >
              {LEVEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            {/* Mode Filter */}
            <select
              value={filterMode}
              onChange={e => { setFilterMode(e.target.value); if (showHistory) setTimeout(loadHistoryLogs, 100); }}
              style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg, #111)', color: 'var(--text)', fontSize: '0.75rem', cursor: 'pointer' }}
            >
              {MODE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            {showHistory && (
              <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '0.75rem' }} onClick={loadHistoryLogs} disabled={loadingHistory}>
                {loadingHistory ? 'Memuat...' : 'Terapkan'}
              </button>
            )}
          </div>
        )}

        {/* Summary Bar */}
        {!showHistory && logs.length > 0 && (
          <div style={{ padding: '6px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '14px', alignItems: 'center', background: 'var(--card)', fontSize: '0.7rem' }}>
            {liveCounts.error > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#ef4444' }}>
                <AlertCircle size={11} /> {liveCounts.error} Error{liveCounts.error > 1 ? 's' : ''}
              </span>
            )}
            {liveCounts.warn > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f59e0b' }}>
                <AlertTriangle size={11} /> {liveCounts.warn} Warn{liveCounts.warn > 1 ? 's' : ''}
              </span>
            )}
            {liveCounts.success > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#10b981' }}>
                <CheckCircle2 size={11} /> {liveCounts.success} Success
              </span>
            )}
            {liveCounts.info > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#a1a1aa' }}>
                <Info size={11} /> {liveCounts.info} Info
              </span>
            )}
            <div style={{ marginLeft: 'auto' }}>
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className="btn btn-outline"
                style={{ padding: '3px 8px', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                {autoScroll ? <Pause size={10} /> : <Play size={10} />}
                {autoScroll ? 'Auto-scroll NYALA' : 'Auto-scroll MATI'}
              </button>
            </div>
          </div>
        )}

        {/* Terminal Body */}
        <div 
          ref={(el) => { scrollRef.current = el; if (termRef) { if (typeof termRef === 'function') termRef(el); else termRef.current = el; } }}
          className="terminal" 
          style={{ flex: 1, padding: '16px 20px', overflowY: 'auto', background: '#07070b', fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: '0.8rem', lineHeight: 1.6 }}
        >
          {/* Live mode: no logs */}
          {!showHistory && filteredLiveLogs.length === 0 && (
            <div style={{ color: 'var(--text-muted)' }}>
              Konsol siap. {isAnyRunning ? 'Menerima siaran langsung...' : 'Sistem sedang idle.'}
            </div>
          )}

          {/* History mode: loading */}
          {showHistory && loadingHistory && (
            <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="spin" style={{ width: '12px', height: '12px', border: '2px solid var(--text-muted)', borderTopColor: 'transparent', borderRadius: '50%' }} />
              Memuat log dari database...
            </div>
          )}

          {/* History mode: empty */}
          {showHistory && !loadingHistory && filteredHistoryLogs.length === 0 && (
            <div style={{ color: 'var(--text-muted)' }}>Tidak ada log yang ditemukan di database untuk filter yang dipilih.</div>
          )}

          {/* Live Logs - Structured */}
          {!showHistory && filteredLiveLogs.map((log, idx) => {
            const parsed = parseLiveLog(log.msg);
            const color = LEVEL_COLORS[parsed.level] || '#a1a1aa';
            const time = log.time || '';
            return (
              <div key={idx} style={{ color, marginBottom: '3px', display: 'flex', gap: '8px', lineHeight: 1.5 }}>
                <span style={{ color: '#52525b', flexShrink: 0, fontSize: '0.7rem' }}>{time}</span>
                {parsed.context && (
                  <span style={{ color: '#71717a', flexShrink: 0, fontSize: '0.7rem', minWidth: '70px' }}>[{parsed.context}]</span>
                )}
                <span style={{ wordBreak: 'break-all' }}>{parsed.message}</span>
              </div>
            );
          })}

          {/* History Logs */}
          {showHistory && !loadingHistory && filteredHistoryLogs.map((log, idx) => {
            const color = LEVEL_COLORS[log.level] || '#a1a1aa';
            const time = log.timestamp ? log.timestamp.split('T').pop().split('.')[0] : '';
            return (
              <div key={idx} style={{ color, marginBottom: '3px', wordBreak: 'break-all', display: 'flex', gap: '8px' }}>
                <span style={{ color: '#52525b', flexShrink: 0, fontSize: '0.7rem' }}>{time}</span>
                <span style={{ color: '#71717a', flexShrink: 0, fontSize: '0.7rem', minWidth: '70px' }}>[{log.context}]</span>
                <span>{log.message}</span>
              </div>
            );
          })}

          {/* Running indicator */}
          {!showHistory && isAnyRunning && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', marginTop: '12px' }}>
              <div className="spin" style={{ width: '12px', height: '12px', border: '2px solid var(--text-muted)', borderTopColor: 'transparent', borderRadius: '50%' }} />
              Bot sedang berjalan...
            </div>
          )}
        </div>

        {/* Footer Status Bar */}
        <div style={{ padding: '8px 20px', borderTop: '1px solid var(--border)', background: 'var(--card)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          <span>{showHistory ? `${filteredHistoryLogs.length} entri log dari database` : `${filteredLiveLogs.length} entri`}</span>
          <span>{showHistory ? 'Riwayat Tersimpan' : (isAnyRunning ? 'Sedang Berjalan...' : 'Siap')}</span>
        </div>
      </div>
    </div>
  );
}
