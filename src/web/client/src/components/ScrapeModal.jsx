import { X, Activity } from 'lucide-react';

export default function ScrapeModal({
  show,
  onClose,
  isScraping,
  scrapeUrl,
  onScrapeUrlChange,
  scrapeLogs,
  scrapeTermRef,
  onScrape
}) {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={() => !isScraping && onClose()}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%', padding: '32px', borderRadius: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h3 style={{ fontSize: '1.4rem', margin: '0 0 4px 0', color: 'var(--text)' }}>Scrape Postingan FB</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>Ekstrak data dan gambar otomatis dari link.</p>
          </div>
          {!isScraping && (
            <button className="btn btn-primary" style={{ padding: '8px', borderRadius: '50%' }} onClick={onClose}>
              <X size={16} />
            </button>
          )}
        </div>
        
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>URL Postingan</label>
          <input 
            type="text" 
            placeholder="https://www.facebook.com/..." 
            value={scrapeUrl}
            onChange={(e) => onScrapeUrlChange(e.target.value)}
            disabled={isScraping}
            style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
          />
        </div>
        
        {/* Embedded Mini Console for Scrape */}
        {(isScraping || scrapeLogs.length > 0) && (
          <div style={{ marginBottom: '24px', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border)' }}>
            <div style={{ padding: '8px 16px', background: 'rgba(0,0,0,0.2)', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Activity size={12} /> SCRAPE TERMINAL
            </div>
            <div 
              ref={scrapeTermRef}
              style={{ height: '140px', background: '#07070b', padding: '12px 16px', overflowY: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', lineHeight: 1.5 }}
            >
              {scrapeLogs.map((log, idx) => {
                let color = '#a1a1aa';
                if (log.type === 'error') color = '#ef4444';
                else if (log.type === 'success') color = '#10b981';
                else if (log.type === 'system') color = '#3b82f6';
                return <div key={idx} style={{ color, marginBottom: '4px' }}>{log.msg}</div>
              })}
              {isScraping && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', marginTop: '8px' }}>
                  <div className="spin" style={{ width: '12px', height: '12px', border: '2px solid var(--text-muted)', borderTopColor: 'transparent', borderRadius: '50%' }}></div>
                  Memuat...
                </div>
              )}
            </div>
          </div>
        )}
        
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={onClose} disabled={isScraping} style={{ padding: '12px 20px', borderRadius: '8px' }}>Batal</button>
          <button className="btn btn-success" onClick={onScrape} disabled={isScraping || !scrapeUrl} style={{ padding: '12px 24px', borderRadius: '8px' }}>
            {isScraping ? 'Memproses...' : 'Mulai Ekstrak'}
          </button>
        </div>
      </div>
    </div>
  );
}
