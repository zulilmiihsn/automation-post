import { X } from 'lucide-react';

export default function CommentModal({
  show,
  onClose,
  accounts = [],
  selectedAccountId,
  onSelectedAccountIdChange,
  targetCommentUrl,
  onTargetCommentUrlChange,
  onSubmit
}) {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px', width: '90%', padding: '32px', borderRadius: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h3 style={{ fontSize: '1.4rem', margin: '0 0 4px 0', color: 'var(--text)' }}>Comment Attack</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>Masukkan link postingan FB yang ingin diserang komentar.</p>
          </div>
          <button className="btn btn-primary" style={{ padding: '8px', borderRadius: '50%' }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Pilih Akun Facebook</label>
          <select 
            value={selectedAccountId}
            onChange={(e) => onSelectedAccountIdChange(e.target.value)}
            style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
          >
            <option value="">-- Pilih Akun --</option>
            {accounts.filter(a => a.linked && a.isActive).map(a => (
              <option key={a.id} value={a.id}>{a.fbName || a.name}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Link Postingan Target</label>
          <input 
            type="text" 
            placeholder="https://web.facebook.com/.../posts/..." 
            value={targetCommentUrl}
            onChange={(e) => onTargetCommentUrlChange(e.target.value)}
            style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={onClose} style={{ padding: '12px 20px', borderRadius: '8px' }}>Batal</button>
          <button 
            className="btn btn-success" 
            disabled={!targetCommentUrl.trim() || !selectedAccountId}
            onClick={onSubmit} 
            style={{ padding: '12px 24px', borderRadius: '8px' }}
          >
            Mulai
          </button>
        </div>
      </div>
    </div>
  );
}
