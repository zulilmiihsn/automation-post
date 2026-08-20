import { useState, useEffect } from 'react';
import { MessageSquare, Play, Square, Activity } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ToastContext';
import { useConfirm } from '../components/ConfirmContext';

export default function ChatDashboard() {
  const [isRunningChat, setIsRunningChat] = useState(false);
  const [activeAccountsCount, setActiveAccountsCount] = useState(0);
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const accs = await api.getAccounts();
        setActiveAccountsCount(accs ? accs.filter(a => a.isActive).length : 0);
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
      if (es) {
        es.close();
      }

      es = new EventSource('/api/stream-logs?mode=all');

      es.onmessage = (event) => {
        const streamData = JSON.parse(event.data);

        if (streamData.type === 'status') {
          if (streamData.mode === 'chat') setIsRunningChat(streamData.isRunning);
        }

        if (streamData.done) {
          if (streamData.mode === 'chat') setIsRunningChat(false);
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

  return (
    <div style={{ padding: '0 4px' }}>
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '24px',
        maxWidth: '600px', margin: '0 auto', textAlign: 'center'
      }}>
        <div style={{
          width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#3b82f6'
        }}>
          <MessageSquare size={32} />
        </div>
        
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Chat Auto-Reply Engine</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px', lineHeight: 1.5 }}>
          Bot Chat otomatis membalas pesan masuk di Facebook Marketplace dan Inbox.
          Sistem akan menggunakan memori dan AI untuk memberikan respon natural ke pelanggan.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
          {isRunningChat ? (
            <button className="btn btn-danger" onClick={handleStopChat} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', fontSize: '14px' }}>
              <Square size={16} fill="currentColor" /> Hentikan Bot Chat
            </button>
          ) : (
            <button className="btn btn-success" onClick={handleStartChat} disabled={activeAccountsCount === 0} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', fontSize: '14px' }}>
              <Play size={16} fill="currentColor" /> Jalankan Bot Chat
            </button>
          )}
        </div>

        {isRunningChat && (
          <div style={{ marginTop: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--success)' }}>
            <Activity size={16} className="animate-pulse" />
            <span style={{ fontSize: '13px', fontWeight: 500 }}>Bot sedang memantau inbox...</span>
          </div>
        )}
      </div>
    </div>
  );
}
