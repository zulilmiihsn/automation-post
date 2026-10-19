import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Users, Check, X, Layers } from 'lucide-react';
import { api } from '../services/api';
import ListingsEdit from './ListingsEdit';
import { useToast } from '../components/ToastContext';
import { useConfirm } from '../components/ConfirmContext';
import ListingThumb from '../components/ListingThumb';

const formatRupiah = (val) => {
  if (!val && val !== 0) return '';
  const number = typeof val === 'string' ? val.replace(/[^0-9]/g, '') : val;
  if (number === '') return '';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(number));
};

const MODAL_OVERLAY = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'var(--scrim)', backdropFilter: 'blur(8px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  padding: '20px'
};

const MODAL_CONTENT = {
  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '24px',
  width: '100%', maxWidth: '1440px', height: '92vh', overflow: 'hidden',
  display: 'flex', flexDirection: 'column', boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
};

const INPUT_PREMIUM = {
  background: 'var(--card-hover)', border: '1px solid var(--border-light)', borderRadius: '10px',
  color: 'var(--text)', padding: '10px 14px', fontSize: '14px', width: '100%',
  outline: 'none', transition: 'border 0.2s',
  fontFamily: 'inherit', lineHeight: 1.4
};

const SELECTION_LIST = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px',
  gridAutoRows: 'min-content', alignContent: 'start',
  flex: '1 1 0', minHeight: 0, overflowY: 'auto', paddingRight: '8px',
};

const PRODUCT_GRID = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: '12px',
  gridAutoRows: 'min-content', alignContent: 'start',
  flex: '1 1 0', minHeight: 0, overflowY: 'auto', paddingRight: '8px',
};

const ProductCard = ({ selected, item, onClick }) => (
  <div
    onClick={onClick}
    title={item.title}
    style={{
      background: selected ? 'rgba(16, 185, 129, 0.08)' : 'var(--card-hover)',
      border: `1px solid ${selected ? 'rgba(16, 185, 129, 0.35)' : 'var(--border)'}`,
      borderRadius: '12px', cursor: 'pointer', overflow: 'hidden',
      transition: 'all 0.15s ease', display: 'flex', flexDirection: 'column',
    }}
    onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
    onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
  >
    <div style={{ position: 'relative', height: 120, background: 'var(--bg)' }}>
      <ListingThumb photos={item.photos} title={item.title} compact />
      <div style={{
        position: 'absolute', top: 8, left: 8, width: 22, height: 22, borderRadius: 6,
        border: `2px solid ${selected ? 'var(--success)' : 'var(--border-light)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: selected ? 'var(--success)' : 'var(--scrim)', transition: 'all 0.2s',
      }}>
        {selected && <Check size={14} color="var(--success-contrast)" strokeWidth={3} />}
      </div>
    </div>
    <div style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{
        fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        overflow: 'hidden', minHeight: 31,
      }}>
        {item.title || `Produk #${item.id}`}
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>
        {formatRupiah(item.price) || '—'}
      </span>
    </div>
  </div>
);

const SelectionItem = ({ selected, label, onClick, icon: Icon }) => (
  <div 
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px',
      background: selected ? 'rgba(16, 185, 129, 0.08)' : 'var(--card-hover)',
      border: `1px solid ${selected ? 'rgba(16, 185, 129, 0.3)' : 'var(--border)'}`,
      borderRadius: '12px', cursor: 'pointer', transition: 'all 0.15s ease',
    }}
    onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
    onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
  >
    <div style={{
      width: '22px', height: '22px', borderRadius: '6px', 
      border: `2px solid ${selected ? 'var(--success)' : 'var(--border-light)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: selected ? 'var(--success)' : 'transparent', transition: 'all 0.2s'
    }}>
      {selected && <Check size={14} color="var(--success-contrast)" strokeWidth={3} />}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, overflow: 'hidden' }}>
      {Icon && <Icon size={18} color={selected ? 'var(--success)' : 'var(--text-muted)'} />}
      <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
    </div>
  </div>
);

export default function Groups({
  selectedGroupId = null,
  onSelectGroup,
  onOpenWorkspace,
  onRefresh
}) {
  const [groups, setGroups] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [listings, setListings] = useState([]);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: '', accounts: [], listings: [] });
  const [qAcc, setQAcc] = useState('');
  const [qProd, setQProd] = useState('');
  const [openId, setOpenId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingListingForGroup, setEditingListingForGroup] = useState(null);
  const toast = useToast();
  const confirm = useConfirm();

  const fetchData = async () => {
    try {
      const [grps, accs, lists] = await Promise.all([
        api.getGroups(),
        api.getAccounts(),
        api.getListings()
      ]);
      setGroups(grps || []);
      setAccounts(accs || []);
      setListings(lists || []);
    } catch (err) {
      console.error('Fetch groups error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, []);

  const saveGroup = async () => {
    if (!newGroup.name.trim()) return toast.error('Nama harus diisi');
    try {
      if (newGroup.id) {
        await api.updateGroup(newGroup.id, newGroup);
      } else {
        await api.addGroup(newGroup);
      }
      setNewGroup({ name: '', accounts: [], listings: [] });
      setShowAddGroup(false);
      await fetchData();
      if (onRefresh) onRefresh();
      toast.success('Workspace tersimpan');
    } catch (err) {
      console.error('Save group error:', err);
      toast.error('Gagal simpan workspace: ' + err.message);
    }
  };

  const deleteGroup = async (id) => {
    if (!(await confirm('Hapus workspace ini? Produk dan akun tidak ikut terhapus.'))) return;
    try {
      await api.deleteGroup(id);
      setGroups(prev => prev.filter(g => g.id !== id));
      if (selectedGroupId === id && onSelectGroup) {
        onSelectGroup(null);
      }
      if (onRefresh) onRefresh();
      toast.success('Workspace dihapus');
    } catch (err) {
      console.error('Delete group error:', err);
      toast.error('Gagal hapus workspace');
    }
  };

  const toggleAccount = (accId) => {
    setNewGroup(prev => {
      const exists = prev.accounts.includes(accId);
      return {
        ...prev,
        accounts: exists ? prev.accounts.filter(a => a !== accId) : [...prev.accounts, accId]
      };
    });
  };

  const toggleListing = (lId) => {
    setNewGroup(prev => {
      const exists = prev.listings.includes(lId);
      return {
        ...prev,
        listings: exists ? prev.listings.filter(l => l !== lId) : [...prev.listings, lId]
      };
    });
  };

  if (editingListingForGroup) {
    return (
      <ListingsEdit
        listing={{
          title: '', price: 0, photos: [], isActive: true, autoFeed: true,
          targetGroup: 'berau', maxGroups: 20
        }}
        onBack={() => setEditingListingForGroup(null)}
        onSave={async (saved) => {
          if (saved && saved.id) {
            try {
              await api.addGroupListing(editingListingForGroup, saved.id);
            } catch { /* ignore */ }
          }
          setEditingListingForGroup(null);
          await fetchData();
          if (onRefresh) onRefresh();
        }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header Info */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <button 
          onClick={() => {
            setNewGroup({ name: '', accounts: [], listings: [] });
            setShowAddGroup(true);
          }}
          style={{
            padding: '12px 24px', background: 'var(--primary)', color: 'var(--primary-contrast)',
            border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.15s'
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          <Plus size={18} strokeWidth={2.5} /> Workspace Baru
        </button>
      </div>

      {/* Group List Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Memuat...</div>
        ) : groups.length === 0 ? (
          <div style={{ 
            background: 'var(--card)', border: '1px dashed var(--border)', borderRadius: '24px',
            padding: '64px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center'
          }}>
            <Layers size={48} color="var(--text-muted)" strokeWidth={1.5} style={{ marginBottom: '16px' }} />
            <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)', margin: '0 0 6px 0' }}>Belum ada workspace</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', maxWidth: '420px', margin: '0 0 24px 0', lineHeight: 1.5 }}>
              Buat workspace untuk memisahkan akun dan produk per toko.
            </p>
            <button 
              onClick={() => setShowAddGroup(true)}
              style={{
                padding: '10px 20px', background: 'var(--success)', color: 'var(--success-contrast)',
                border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
              }}
            >
              <Plus size={16} /> Buat Workspace
            </button>
          </div>
        ) : (
          groups.map(g => {
            const isCurrentActive = selectedGroupId === g.id;
            const groupAccounts = accounts.filter(a => g.accounts.includes(a.id));
            const groupListings = listings.filter(l => g.listings.includes(l.id));
            const activeAccsCount = groupAccounts.filter(a => a.isActive && a.linked).length;

            return (
              <div key={g.id} style={{
                background: 'var(--card)',
                border: isCurrentActive ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--border)',
                borderRadius: '16px',
                padding: '12px 16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setOpenId(openId === g.id ? null : g.id)}
                    aria-expanded={openId === g.id}
                    aria-label={openId === g.id ? `Tutup isi ${g.name}` : `Lihat isi ${g.name}`}
                    title="Lihat isi"
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 6, display: 'inline-flex' }}
                  >
                    <span style={{ display: 'inline-block', transform: openId === g.id ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', fontSize: 14 }}>▶</span>
                  </button>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {g.name}
                    </h3>
                    {isCurrentActive && (
                      <span style={{ padding: '2px 8px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '100px', color: 'var(--success)', fontSize: '10px', fontWeight: 700 }}>
                        DIPAKAI
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {g.accounts.length} akun &bull; {g.listings.length} produk &bull;{' '}
                    {activeAccsCount > 0 && groupListings.length > 0 ? (
                      <span style={{ color: 'var(--success)', fontWeight: 600 }}>Siap jalan ✓</span>
                    ) : (
                      <span>Belum siap: tambah {activeAccsCount === 0 ? 'akun' : ''}{activeAccsCount === 0 && groupListings.length === 0 ? ' + ' : ''}{groupListings.length === 0 ? 'produk' : ''}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => onOpenWorkspace && onOpenWorkspace(g.id)}
                    style={{ padding: '7px 14px', minHeight: '38px', background: 'var(--success)', color: 'var(--success-contrast)', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Buka
                  </button>
                  <button
                    onClick={() => { setNewGroup({ ...g }); setShowAddGroup(true); }}
                    style={{ padding: '7px 14px', minHeight: '38px', background: 'transparent', color: 'var(--text)', border: '1px solid var(--border-light)', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Ubah
                  </button>
                  <button
                    onClick={() => deleteGroup(g.id)}
                    aria-label={'Hapus workspace ' + g.name}
                    title="Hapus workspace"
                    style={{ padding: '7px 11px', minHeight: '38px', background: 'transparent', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Trash2 size={14} /> Hapus
                  </button>
                </div>
                </div>
                {openId === g.id && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(0, 2.5fr)', gap: '24px', marginTop: '14px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: '8px' }}>
                        AKUN ({groupAccounts.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: 240, overflowY: 'auto', paddingRight: 4 }}>
                        {groupAccounts.length === 0 && (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Belum ada akun.</span>
                        )}
                        {groupAccounts.map((a) => (
                          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', flexShrink: 0 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: a.isActive && a.linked ? 'var(--success)' : 'var(--text-muted)', flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.fbName || a.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: '8px' }}>
                        PRODUK ({groupListings.length})
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '4px 24px', maxHeight: 240, overflowY: 'auto', paddingRight: 4 }}>
                        {groupListings.length === 0 && (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Belum ada produk.</span>
                        )}
                        {groupListings.map((l) => (
                          <div key={l.id} style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                            {l.title}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal Add/Edit Group */}
      {showAddGroup && (
        <div style={MODAL_OVERLAY} onClick={() => setShowAddGroup(false)}>
          <div style={MODAL_CONTENT} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                  {newGroup.id ? 'Edit Workspace' : 'Workspace Baru'}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>
                  Beri nama, lalu centang akun + produk.
                </p>
              </div>
              <button onClick={() => setShowAddGroup(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '24px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
                  Nama workspace
                </label>
                <input 
                  type="text" 
                  style={INPUT_PREMIUM} 
                  placeholder="Misal: Jualan Hendy, Motor Bekas Samarinda..."
                  value={newGroup.name}
                  onChange={e => setNewGroup({ ...newGroup, name: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '28px', alignItems: 'stretch', flex: 1, minHeight: 0 }}>
              <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                    Langkah 1 — Pilih akun ({newGroup.accounts?.length || 0})
                  </label>
                  <button
                    onClick={() => {
                      const allIds = accounts.map(a => a.id);
                      const isAll = newGroup.accounts?.length === allIds.length;
                      setNewGroup({ ...newGroup, accounts: isAll ? [] : allIds });
                    }}
                    style={{ background: 'transparent', border: 'none', color: 'var(--success)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
                  >
                    {newGroup.accounts?.length === accounts.length ? 'Kosongkan' : 'Pilih semua'}
                  </button>
                </div>
                <input
                  type="search"
                  value={qAcc}
                  onChange={(e) => setQAcc(e.target.value)}
                  placeholder="Cari nama akun..."
                  aria-label="Cari akun"
                  style={{ ...INPUT_PREMIUM, padding: '10px 14px', fontSize: '13px', marginBottom: '10px' }}
                />
                <div style={SELECTION_LIST}>
                  {accounts
                    .filter((acc) => `${acc.fbName || ''} ${acc.name || ''} ${acc.id}`.toLowerCase().includes(qAcc.trim().toLowerCase()))
                    .map(acc => (
                    <SelectionItem
                      key={acc.id}
                      selected={newGroup.accounts?.includes(acc.id)}
                      label={acc.fbName || acc.name || acc.id}
                      icon={Users}
                      onClick={() => toggleAccount(acc.id)}
                    />
                  ))}
                </div>
              </div>

              <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                    Langkah 2 — Pilih produk ({newGroup.listings?.length || 0})
                  </label>
                  <button
                    onClick={() => {
                      const allIds = listings.map(l => l.id);
                      const isAll = newGroup.listings?.length === allIds.length;
                      setNewGroup({ ...newGroup, listings: isAll ? [] : allIds });
                    }}
                    style={{ background: 'transparent', border: 'none', color: 'var(--success)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
                  >
                    {newGroup.listings?.length === listings.length ? 'Kosongkan' : 'Pilih semua'}
                  </button>
                </div>
                <input
                  type="search"
                  value={qProd}
                  onChange={(e) => setQProd(e.target.value)}
                  placeholder="Cari judul produk..."
                  aria-label="Cari produk"
                  style={{ ...INPUT_PREMIUM, padding: '10px 14px', fontSize: '13px', marginBottom: '10px' }}
                />
                <div style={PRODUCT_GRID}>
                  {listings
                    .filter((l) => `${l.title || ''}`.toLowerCase().includes(qProd.trim().toLowerCase()))
                    .map(l => (
                    <ProductCard
                      key={l.id}
                      selected={newGroup.listings?.includes(l.id)}
                      item={l}
                      onClick={() => toggleListing(l.id)}
                    />
                  ))}
                </div>
              </div>
              </div>
            </div>

            <div style={{ padding: '24px 32px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                onClick={() => setShowAddGroup(false)}
                style={{
                  padding: '12px 20px', background: 'transparent', color: 'var(--text-muted)',
                  border: '1px solid var(--border-light)', borderRadius: '12px', fontSize: '14px', fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Batal
              </button>
              <button 
                onClick={saveGroup}
                style={{
                  padding: '12px 24px', background: 'var(--success)', color: 'var(--success-contrast)',
                  border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 600,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
                }}
              >
                  <Save size={16} /> Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
