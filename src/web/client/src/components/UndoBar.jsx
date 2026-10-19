export default function UndoBar({ trash, onUndo, onDismiss }) {
  if (!trash) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 88,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px 10px 16px',
        borderRadius: 12,
        background: 'var(--card)',
        border: '1px solid rgba(245,158,11,0.4)',
        boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
        color: 'var(--text)',
        fontSize: 13,
        maxWidth: '92vw',
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50vw' }}>
        {trash.count} dihapus: {trash.label} — 10 detik untuk urungkan
      </span>
      <button
        onClick={onUndo}
        style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#F59E0B', color: '#09090B', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
      >
        Urungkan
      </button>
      <button
        onClick={onDismiss}
        aria-label="Tutup"
        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}
      >
        ✕
      </button>
    </div>
  );
}
