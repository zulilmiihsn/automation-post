import { useState, useCallback } from 'react';
import { User, ExternalLink, LogOut, Plus, X, Settings, Trash } from 'lucide-react';
import { api } from '../services/api';
import { useAutoSave, SaveStatus } from '../hooks/useAutoSave';
import { useToast } from '../components/ToastContext';
import { useConfirm } from '../components/ConfirmContext';

// Sub-component: one account card with auto-save toggle
function AccountCard({ acc, index, onLink, onLogout, onDelete }) {
  const [isActive, setIsActive] = useState(acc.isActive);

  const saveFn = useCallback(
    (val) => fetch(`/api/accounts/${acc.id}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: val }),
    }),
    [acc.id]
  );
  const { triggerSave, status } = useAutoSave(saveFn, 0); // instant for toggles

  const handleToggle = (e) => {
    const val = e.target.checked;
    setIsActive(val);
    triggerSave(val);
  };

  return (
    <div className="item-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <div className="account-avatar">
            {acc.fbPic ? <img src={acc.fbPic} alt="Profile" /> : <User size={24} />}
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>{acc.fbName || acc.name}</h3>
            <span className={`status-badge ${acc.linked ? 'badge-linked' : 'badge-pending'}`} style={{ marginTop: '5px' }}>
              {acc.linked ? 'LINKED' : 'NOT LINKED'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <SaveStatus status={status} />
          <input
            type="checkbox"
            className="switch"
            checked={isActive}
            onChange={handleToggle}
          />
          <span style={{ 
            fontSize: '0.8rem', 
            fontWeight: 600, 
            letterSpacing: '0.02em',
            color: isActive ? 'var(--success)' : 'var(--text-muted)' 
          }}>
            {isActive ? 'AKTIF' : 'OFF'}
          </span>
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <span className="label-text">Direktori Profil</span>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: '6px' }}>
          {acc.profile}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button className="btn btn-outline" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} onClick={() => onLink(acc.id)}>
          <ExternalLink size={16} />
          <span>{acc.linked ? 'Sync Login' : 'Link Akun'}</span>
        </button>
        {acc.linked && (
          <button className="btn btn-outline" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 15px' }} onClick={() => onLogout(acc.id)}>
            <LogOut size={16} />
          </button>
        )}
        <button className="btn btn-danger" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 15px' }} onClick={() => onDelete(acc.id)} title="Hapus Akun">
          <Trash size={16} />
        </button>
      </div>
    </div>
  );
}

// Sub-component: bot config dropdown with auto-save
function BotConfigSelect({ label, configKey, value, accounts }) {
  const [val, setVal] = useState(value || '');

  const saveFn = useCallback(
    (v) => api.setConfig(configKey, v),
    [configKey]
  );
  const { triggerSave, status } = useAutoSave(saveFn, 0);

  const handleChange = (e) => {
    setVal(e.target.value);
    triggerSave(e.target.value);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </label>
        <SaveStatus status={status} />
      </div>
      <select
        value={val}
        onChange={handleChange}
        style={{ width: '100%', padding: '10px 14px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: '10px', color: 'white', fontSize: '0.9rem' }}
      >
        <option value="">(Tidak ada - gunakan profil default)</option>
        {accounts.map(a => (
          <option key={a.id} value={a.id}>
            {a.fbName || a.name} {a.linked ? '(Linked)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function Accounts({ 
  accounts = [], 
  groups = [], 
  selectedGroupId = null, 
  onSelectGroup, 
  config, 
  onRefresh 
}) {
  const [showGroupOnly, setShowGroupOnly] = useState(true);
  const toast = useToast();
  const confirm = useConfirm();

  const activeGroup = selectedGroupId ? groups.find(g => g.id === Number(selectedGroupId)) : null;
  const displayedAccounts = (activeGroup && showGroupOnly)
    ? accounts.filter(a => activeGroup.accounts?.includes(a.id))
    : accounts;

  const linkAccount = async (id) => {
    try {
      await fetch(`/api/accounts/${id}/link`, { method: 'POST' });
      toast.success('Browser login terbuka. Silakan selesaikan login di window baru.');
      onRefresh();
    } catch (err) {
      console.error(err);
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
    if (!(await confirm('Hapus akun ini? Direktori profile juga akan ikut terhapus permanen!'))) return;
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
              <User size={20} color="#10B981" />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#FAFAFA' }}>
                Fokus Grup: {activeGroup.name}
              </div>
              <div style={{ fontSize: '13px', color: '#A1A1AA', marginTop: '2px' }}>
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
              ? `Belum ada akun di grup "${activeGroup.name}". Atur anggota grup di tab Manajemen Grup.`
              : 'Belum ada akun terdaftar. Tambahkan akun baru untuk memulai.'}
          </div>
        ) : (
          displayedAccounts.map((acc, index) => (
            <AccountCard
              key={acc.id || index}
              acc={acc}
              index={index}
              onLink={linkAccount}
              onLogout={logoutAccount}
              onDelete={deleteAccount}
            />
          ))
        )}
      </div>

      {/* Bot Settings */}
      <div style={{ marginTop: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <Settings size={20} style={{ color: 'var(--text-muted)' }} />
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 500, letterSpacing: '-0.02em' }}>Bot Settings</h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '4px' }}>— perubahan tersimpan otomatis</span>
        </div>
        <div className="item-card">
          <p style={{ margin: '0 0 20px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Pilih akun Facebook yang digunakan oleh bot scraper dan debug.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <BotConfigSelect
              label="Akun Scraper"
              configKey="scraper_account_id"
              value={config?.scraper_account_id}
              accounts={accounts}
            />
            <BotConfigSelect
              label="Akun Debug"
              configKey="debug_account_id"
              value={config?.debug_account_id}
              accounts={accounts}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
