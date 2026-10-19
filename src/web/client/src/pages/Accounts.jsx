import { useState, useCallback } from 'react';
import { User, ExternalLink, LogOut, Plus, X, Star, Trash } from 'lucide-react';
import { api } from '../services/api';
import { useAutoSave } from '../hooks/useAutoSave';
import { useToast } from '../components/ToastContext';
import { useConfirm } from '../components/ConfirmContext';

// Sub-component: one account card with auto-save toggle
function AccountCard({ acc, isAndalan, onSetAndalan, onLink, onLogout, onDelete, linking }) {
  const [isActive, setIsActive] = useState(acc.isActive);

  const saveFn = useCallback(
    (val) => fetch(`/api/accounts/${acc.id}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: val }),
    }),
    [acc.id]
  );
  const { triggerSave } = useAutoSave(saveFn, 0); // instant for toggles

  const handleToggle = (e) => {
    const val = e.target.checked;
    setIsActive(val);
    triggerSave(val);
  };

  return (
    <div className="item-card" style={{ padding: '14px 16px', borderColor: isAndalan ? 'rgba(245,158,11,0.5)' : undefined }}>
      <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', marginBottom: 6, minHeight: 14, color: isAndalan ? '#F59E0B' : 'transparent', userSelect: 'none' }} aria-hidden={!isAndalan}>
        ★ ANDALAN
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <div className="account-avatar">
          {acc.fbPic ? <img src={acc.fbPic} alt="" /> : <User size={24} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.fbName || acc.name}</h3>
          <div style={{ fontSize: '0.78rem', marginTop: '4px', color: acc.linked ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600 }}>
            {acc.linked ? '● Terhubung' : '○ Belum login'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button
            onClick={() => onSetAndalan(acc.id)}
            title={isAndalan ? 'Akun andalan — klik untuk lepas' : 'Jadikan akun andalan'}
            aria-label={isAndalan ? `Lepas andalan ${acc.fbName || acc.name}` : `Jadikan andalan ${acc.fbName || acc.name}`}
            aria-pressed={!!isAndalan}
            style={{
              background: isAndalan ? 'rgba(245,158,11,0.12)' : 'none',
              border: isAndalan ? '1px solid rgba(245,158,11,0.5)' : '1px solid transparent',
              borderRadius: 8, cursor: 'pointer', padding: 0, flexShrink: 0,
              width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: isAndalan ? '#F59E0B' : 'var(--text-muted)',
            }}
          >
            <Star size={16} fill={isAndalan ? 'currentColor' : 'none'} style={{ display: 'block' }} />
          </button>
          <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', height: 32 }} title="OFF = bot lewati akun ini">
            <input
              type="checkbox"
              className="switch"
              checked={isActive}
              onChange={handleToggle}
              aria-label={`Ikut jualan ${acc.fbName || acc.name}`}
            />
          </label>
        </div>
      </div>

      {!acc.linked ? (
        <button className="btn btn-primary" style={{ width: '100%', minHeight: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} onClick={() => onLink(acc.id)} disabled={!!linking}>
          <ExternalLink size={16} />
          <span>{linking ? 'Membuka browser…' : 'Hubungkan Facebook'}</span>
        </button>
      ) : (
        <>
          <button className="btn btn-outline" style={{ width: '100%', minHeight: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '6px' }} onClick={() => onLink(acc.id)} disabled={!!linking}>
            <ExternalLink size={16} />
            <span>{linking ? 'Membuka browser…' : 'Cek Login'}</span>
          </button>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', fontSize: '0.8rem' }}>
            <button onClick={() => onLogout(acc.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <LogOut size={14} /> Keluar
            </button>
            <button onClick={() => onDelete(acc.id)} aria-label={`Hapus akun ${acc.fbName || acc.name}`} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '6px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <Trash size={14} /> Hapus
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Sub-component: satu pilihan andalan untuk kedua peran khusus.

export default function Accounts({ 
  accounts = [], 
  groups = [], 
  selectedGroupId = null, 
  onSelectGroup, 
  config, 
  onRefresh 
}) {
  const [showGroupOnly, setShowGroupOnly] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const andalanId = config?.scraper_account_id || config?.debug_account_id || '';
  const [linkingId, setLinkingId] = useState(null);

  const activeGroup = selectedGroupId ? groups.find(g => g.id === Number(selectedGroupId)) : null;

  const setAndalan = async (id) => {
    const next = andalanId === id ? '' : id;
    try {
      await api.setConfig('scraper_account_id', next);
      await api.setConfig('debug_account_id', next);
      toast.success(next ? 'Akun andalan disimpan' : 'Andalan dilepas');
      onRefresh();
    } catch (err) {
      toast.error(`Gagal simpan andalan: ${err.message}`);
    }
  };
  const displayedAccounts = (activeGroup && showGroupOnly)
    ? accounts.filter(a => activeGroup.accounts?.includes(a.id))
    : accounts;

  const linkAccount = async (id) => {
    if (linkingId) return;
    setLinkingId(id);
    try {
      const res = await fetch(`/api/accounts/${id}/link`, { method: 'POST' });
      if (res.status === 409) {
        toast.error('Login akun ini sedang berjalan. Tunggu browser yang sudah terbuka.');
        return;
      }
      toast.success('Browser login terbuka. Silakan selesaikan login di window baru.');
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setLinkingId(null);
    }
  };

  const logoutAccount = async (id) => {
    if (!(await confirm('Hapus sesi Facebook untuk akun ini?'))) return;
    try {
      await fetch(`/api/accounts/${id}/logout`, { method: 'POST' });
      toast.success('Akun berhasil logout');
      onRefresh();
    } catch (err) {
      console.error(err);
      toast.error(`Gagal logout: ${err.message}`);
    }
  };

  const deleteAccount = async (id) => {
    if (!(await confirm('Hapus akun ini permanen? Login dan data browser ikut hilang. Tidak bisa urung.'))) return;
    try {
      await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
      toast.success('Akun berhasil dihapus');
      onRefresh();
    } catch (err) {
      console.error(err);
      toast.error(`Gagal menghapus akun: ${err.message}`);
    }
  };

  const handleCreateAccount = async () => {
    try {
      await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <section id="section-accounts">
      {/* Active Workspace Banner */}
      {activeGroup && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(135deg, rgba(18, 18, 20, 0.95), rgba(24, 24, 27, 0.95))',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: '16px',
          padding: '16px 20px',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '10px',
              background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <User size={20} color="var(--success)" />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
                Fokus Grup: {activeGroup.name}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Menampilkan {displayedAccounts.length} akun yang terhubung ke grup ini.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              className="btn btn-secondary"
              style={{ padding: '8px 16px', fontSize: '13px' }}
              onClick={() => setShowGroupOnly(!showGroupOnly)}
            >
              {showGroupOnly ? `Lihat Semua Akun (${accounts.length})` : `Hanya Akun Grup (${activeGroup.accounts?.length || 0})`}
            </button>
            <button
              className="btn btn-primary"
              style={{ padding: '8px 16px', fontSize: '13px' }}
              onClick={() => onSelectGroup && onSelectGroup(null)}
            >
              <X size={14} /> Tampilkan Semua
            </button>
          </div>
        </div>
      )}

      <div className="section-header">
        <h2>{activeGroup && showGroupOnly ? `Akun Grup (${activeGroup.name})` : 'Profil Tersimpan'}</h2>
        <button
          className="btn btn-primary"
          onClick={handleCreateAccount}
        >
          <Plus size={18} />
          Tambah Akun
        </button>
      </div>

      {/* Account cards */}
      <div className="grid">
        {displayedAccounts.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', gridColumn: '1 / -1', padding: '40px', textAlign: 'center', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border)' }}>
            {activeGroup && showGroupOnly 
              ? `Belum ada akun di grup "${activeGroup.name}". Atur anggota grup di Workspace.`
              : 'Belum ada akun terdaftar. Tambahkan akun baru untuk memulai.'}
          </div>
        ) : (
          displayedAccounts.map((acc, index) => (
            <AccountCard
              key={acc.id || index}
              acc={acc}
              isAndalan={andalanId === acc.id}
              onSetAndalan={setAndalan}
              onLink={linkAccount}
              onLogout={logoutAccount}
              onDelete={deleteAccount}
              linking={linkingId === acc.id}
            />
          ))
        )}
      </div>

      <p style={{ margin: '20px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center' }}>
        ★ adalah akun andalan untuk pengambilan data dan pengujian. Klik bintang pada kartu untuk memilih.
      </p>
    </section>
  );
}
