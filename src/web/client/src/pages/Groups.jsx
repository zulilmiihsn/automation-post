import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Users, Package, Check, X, Layers, Edit2 } from 'lucide-react';
import { api } from '../services/api';
import ListingsEdit from './ListingsEdit';
import { useToast } from '../components/ToastContext';
import { useConfirm } from '../components/ConfirmContext';

const MODAL_OVERLAY = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(9, 9, 11, 0.85)', backdropFilter: 'blur(8px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  padding: '20px'
};

const MODAL_CONTENT = {
  background: '#121214', border: '1px solid #27272A', borderRadius: '24px',
  width: '100%', maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto',
  display: 'flex', flexDirection: 'column', boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
};

const INPUT_PREMIUM = {
  background: '#18181B', border: '1px solid #3F3F46', borderRadius: '12px',
  color: '#FAFAFA', padding: '16px 20px', fontSize: '15px', width: '100%', 
  outline: 'none', transition: 'border 0.2s',
  fontFamily: 'inherit'
};

const SELECTION_LIST = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px',
  maxHeight: '220px', overflowY: 'auto', paddingRight: '8px',
};

const SelectionItem = ({ selected, label, onClick, icon: Icon }) => (
  <div 
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px',
      background: selected ? 'rgba(16, 185, 129, 0.08)' : '#18181B',
      border: `1px solid ${selected ? 'rgba(16, 185, 129, 0.3)' : '#27272A'}`,
      borderRadius: '12px', cursor: 'pointer', transition: 'all 0.15s ease',
    }}
    onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
    onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
  >
    <div style={{
      width: '22px', height: '22px', borderRadius: '6px', 
      border: `2px solid ${selected ? '#10B981' : '#52525B'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: selected ? '#10B981' : 'transparent', transition: 'all 0.2s'
    }}>
      {selected && <Check size={14} color="#000" strokeWidth={3} />}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, overflow: 'hidden' }}>
      {Icon && <Icon size={18} color={selected ? '#10B981' : '#A1A1AA'} />}
      <span style={{ fontSize: '14px', fontWeight: 500, color: selected ? '#FFF' : '#D4D4D8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
    </div>
  </div>
);

export default function Groups({ 
  selectedGroupId = null, 
  onSelectGroup, 
  onOpenGroupListings, 
  onRefresh 
}) {
  const [groups, setGroups] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [listings, setListings] = useState([]);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: '', accounts: [], listings: [] });
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
      toast.success('Grup berhasil disimpan');
    } catch (err) {
      console.error('Save group error:', err);
      toast.error('Gagal menyimpan grup: ' + err.message);
    }
  };

  const deleteGroup = async (id) => {
    if (!(await confirm('Apakah Anda yakin ingin menghapus grup ini?'))) return;
    try {
      await api.deleteGroup(id);
      setGroups(prev => prev.filter(g => g.id !== id));
      if (selectedGroupId === id && onSelectGroup) {
        onSelectGroup(null);
      }
      if (onRefresh) onRefresh();
      toast.success('Grup dihapus');
    } catch (err) {
      console.error('Delete group error:', err);
      toast.error('Gagal menghapus grup');
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
            } catch (_) {}
          }
          setEditingListingForGroup(null);
          await fetchData();
          if (onRefresh) onRefresh();
        }}
      />
    );
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* Header Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 600, color: '#FAFAFA', margin: 0 }}>
            Manajemen Grup / Workspace
          </h2>
          <p style={{ color: '#A1A1AA', fontSize: '14px', margin: '6px 0 0 0' }}>
            Atur toko atau kampanye berbeda. Kelola akun FB dan daftar produk yang ditugaskan ke setiap grup.
          </p>
        </div>
        <button 
          onClick={() => {
            setNewGroup({ name: '', accounts: [], listings: [] });
            setShowAddGroup(true);
          }}
          style={{
            padding: '12px 24px', background: '#FAFAFA', color: '#09090B',
            border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.15s'
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          <Plus size={18} strokeWidth={2.5} /> Buat Grup Baru
        </button>
      </div>

      {/* Group List Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#71717A' }}>Memuat data grup...</div>
        ) : groups.length === 0 ? (
          <div style={{ 
            background: '#121214', border: '1px dashed #27272A', borderRadius: '24px', 
            padding: '64px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center'
          }}>
            <Layers size={48} color="#52525B" strokeWidth={1.5} style={{ marginBottom: '16px' }} />
            <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#FAFAFA', margin: '0 0 6px 0' }}>Belum ada grup kampanye</h3>
            <p style={{ color: '#A1A1AA', fontSize: '14px', maxWidth: '420px', margin: '0 0 24px 0', lineHeight: 1.5 }}>
              Buat grup untuk memisahkan akun dan produk per toko/proyek jualan Anda.
            </p>
            <button 
              onClick={() => setShowAddGroup(true)}
              style={{
                padding: '10px 20px', background: '#10B981', color: '#09090B',
                border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
              }}
            >
              <Plus size={16} /> Buat Grup Pertama
            </button>
          </div>
        ) : (
          groups.map(g => {
            const isCurrentActive = selectedGroupId === g.id;
            const groupAccounts = accounts.filter(a => g.accounts.includes(a.id));
            const groupListings = listings.filter(l => g.listings.includes(l.id));
            const mpReadyCount = groupListings.filter(l => l.postMarketplace !== false && l.isActive !== false).length;
            const viralReadyCount = groupListings.filter(l => l.autoFeed === true && l.isActive !== false).length;
            const activeAccsCount = groupAccounts.filter(a => a.isActive && a.linked).length;

            return (
              <div key={g.id} style={{
                background: '#121214', 
                border: isCurrentActive ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid #27272A', 
                borderRadius: '24px',
                padding: '32px', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '28px',
                position: 'relative',
                boxShadow: isCurrentActive ? '0 0 30px rgba(16, 185, 129, 0.08)' : 'none'
              }}>
                {/* Card Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ 
                      background: isCurrentActive ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)', 
                      padding: '12px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' 
                    }}>
                      <Layers size={26} color={isCurrentActive ? '#10B981' : '#FAFAFA'} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <h3 style={{ fontSize: '22px', fontWeight: 600, color: '#FAFAFA', margin: 0 }}>
                          {g.name}
                        </h3>
                        {isCurrentActive && (
                          <span style={{
                            padding: '4px 10px', background: 'rgba(16, 185, 129, 0.15)',
                            border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '100px',
                            color: '#10B981', fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em'
                          }}>
                            WORKSPACE AKTIF
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '13px', color: '#71717A', marginTop: '4px' }}>
                        {g.accounts.length} Akun Tertaut &bull; {g.listings.length} Produk Tertaut
                      </div>
                    </div>
                  </div>

                  {/* Actions Top Right */}
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {!isCurrentActive ? (
                      <button 
                        onClick={() => {
                          if (onSelectGroup) onSelectGroup(g.id);
                          toast.success(`Workspace aktif dialihkan ke "${g.name}"`);
                        }}
                        style={{
                          padding: '8px 16px', background: 'rgba(255,255,255,0.06)', color: '#FAFAFA', 
                          border: '1px solid #3F3F46', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                      >
                        <Check size={15} /> Jadikan Workspace Aktif
                      </button>
                    ) : (
                      <button 
                        onClick={() => {
                          if (onSelectGroup) onSelectGroup(null);
                        }}
                        style={{
                          padding: '8px 14px', background: 'transparent', color: '#A1A1AA', 
                          border: '1px solid #27272A', borderRadius: '10px', fontSize: '12px',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                      >
                        <X size={14} /> Keluar Fokus
                      </button>
                    )}

                    <button 
                      onClick={() => onOpenGroupListings && onOpenGroupListings(g.id)}
                      style={{
                        padding: '8px 18px', background: '#10B981', color: '#09090B', 
                        border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                      onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                      onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      <Package size={16} strokeWidth={2.5} /> Buka di Tab Listing ({g.listings.length})
                    </button>

                    <div style={{ width: '1px', height: '24px', background: '#27272A', margin: '0 4px' }} />

                    <button onClick={() => {
                      setNewGroup({ ...g });
                      setShowAddGroup(true);
                    }} style={{
                      padding: '8px', background: 'rgba(255,255,255,0.03)', color: '#A1A1AA', border: '1px solid #3F3F46', 
                      borderRadius: '10px', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#FAFAFA'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#A1A1AA'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                    title="Edit Nama / Anggota Grup"
                    >
                      <Edit2 size={16}/>
                    </button>
                    <button onClick={() => deleteGroup(g.id)} style={{
                      padding: '8px', background: 'rgba(255,255,255,0.03)', color: '#A1A1AA', border: '1px solid #3F3F46', 
                      borderRadius: '10px', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#A1A1AA'; e.currentTarget.style.borderColor = '#3F3F46'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                    title="Hapus Grup"
                    >
                      <Trash2 size={16}/>
                    </button>
                  </div>
                </div>
                
                {/* Card Body - 2 Columns Bento */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '32px', alignItems: 'start' }}>
                  
                  {/* Left: Accounts & Listings Member Pills */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {/* Accounts */}
                    <div style={{ background: '#0D0D0F', border: '1px solid #1E1E22', borderRadius: '16px', padding: '18px 20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Users size={14} color="#10B981" /> Akun Facebook ({g.accounts.length})
                        </div>
                        <button 
                          onClick={() => {
                            setNewGroup({ ...g });
                            setShowAddGroup(true);
                          }}
                          style={{ background: 'transparent', border: 'none', color: '#10B981', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                        >
                          + Atur Akun
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {g.accounts.length > 0 ? g.accounts.map(accId => {
                          const acc = accounts.find(a => a.id === accId);
                          const accName = acc?.fbName || acc?.name || accId;
                          const isReady = acc?.isActive && acc?.linked;
                          return (
                            <div key={accId} style={{ 
                              background: '#18181B', border: `1px solid ${isReady ? 'rgba(16, 185, 129, 0.25)' : '#27272A'}`, 
                              borderRadius: '100px', padding: '6px 14px', fontSize: '13px', fontWeight: 500,
                              color: '#FAFAFA', display: 'flex', alignItems: 'center', gap: '6px'
                            }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isReady ? '#10B981' : '#EF4444' }} />
                              {accName}
                            </div>
                          );
                        }) : <span style={{ color: '#52525B', fontSize: '13px', fontStyle: 'italic' }}>Belum ada akun ditugaskan</span>}
                      </div>
                    </div>

                    {/* Listings */}
                    <div style={{ background: '#0D0D0F', border: '1px solid #1E1E22', borderRadius: '16px', padding: '18px 20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Package size={14} color="#3B82F6" /> Produk / Listing ({g.listings.length})
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button 
                            onClick={() => setEditingListingForGroup(g.id)}
                            style={{ background: 'transparent', border: 'none', color: '#10B981', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                          >
                            + Tambah Manual
                          </button>
                          <button 
                            onClick={() => onOpenGroupListings && onOpenGroupListings(g.id)}
                            style={{ background: 'transparent', border: 'none', color: '#3B82F6', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                          >
                            Pilih dari Katalog &rarr;
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {g.listings.length > 0 ? (
                          <>
                            {g.listings.slice(0, 10).map(lId => {
                              const lTitle = listings.find(l => l.id === lId)?.title || lId;
                              return (
                                <div key={lId} style={{ 
                                  background: '#18181B', border: '1px solid #27272A', 
                                  borderRadius: '100px', padding: '6px 14px', fontSize: '13px', fontWeight: 500,
                                  color: '#E4E4E7'
                                }}>
                                  {lTitle}
                                </div>
                              );
                            })}
                            {g.listings.length > 10 && (
                              <div 
                                onClick={() => onOpenGroupListings && onOpenGroupListings(g.id)}
                                style={{ 
                                  background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', 
                                  borderRadius: '100px', padding: '6px 14px', fontSize: '13px', fontWeight: 600,
                                  color: '#10B981', cursor: 'pointer'
                                }}
                              >
                                +{g.listings.length - 10} lainnya &rarr;
                              </div>
                            )}
                          </>
                        ) : <span style={{ color: '#52525B', fontSize: '13px', fontStyle: 'italic' }}>Belum ada produk ditugaskan</span>}
                      </div>
                    </div>
                  </div>
                  
                  {/* Right: Quick Readiness Stats & Action Guide */}
                  <div style={{ 
                    background: '#09090B', border: '1px solid #27272A', borderRadius: '18px', 
                    padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' 
                  }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Kesiapan Otomasi Grup
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                      <div style={{ background: '#121214', border: '1px solid #27272A', borderRadius: '12px', padding: '12px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: '#FAFAFA' }}>{mpReadyCount}</div>
                        <div style={{ fontSize: '11px', color: '#71717A', marginTop: '2px' }}>MP Siap</div>
                      </div>
                      <div style={{ background: '#121214', border: '1px solid #27272A', borderRadius: '12px', padding: '12px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: '#FAFAFA' }}>{viralReadyCount}</div>
                        <div style={{ fontSize: '11px', color: '#71717A', marginTop: '2px' }}>Viral Siap</div>
                      </div>
                      <div style={{ background: '#121214', border: '1px solid #27272A', borderRadius: '12px', padding: '12px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: activeAccsCount > 0 ? '#10B981' : '#EF4444' }}>{activeAccsCount}</div>
                        <div style={{ fontSize: '11px', color: '#71717A', marginTop: '2px' }}>Akun Siap</div>
                      </div>
                    </div>

                    <p style={{ fontSize: '12px', color: '#71717A', margin: '4px 0 0 0', lineHeight: 1.5 }}>
                      Untuk menjalankan posting Marketplace, sundul otomatis, atau viral share khusus grup ini, buka tab Listings.
                    </p>

                    <button 
                      onClick={() => onOpenGroupListings && onOpenGroupListings(g.id)}
                      style={{
                        padding: '12px 16px', background: 'rgba(16, 185, 129, 0.1)', color: '#10B981', 
                        border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', fontSize: '13px', fontWeight: 600,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        transition: 'all 0.15s', marginTop: 'auto'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(16, 185, 129, 0.2)'; e.currentTarget.style.borderColor = '#10B981'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)'; e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.3)'; }}
                    >
                      <span>Buka Tab Listing & Jalankan Bot</span> &rarr;
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Add/Edit Group */}
      {showAddGroup && (
        <div style={MODAL_OVERLAY} onClick={() => setShowAddGroup(false)}>
          <div style={MODAL_CONTENT} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '24px 32px', borderBottom: '1px solid #27272A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#FAFAFA', margin: 0 }}>
                  {newGroup.id ? 'Edit Grup / Workspace' : 'Buat Grup / Workspace Baru'}
                </h3>
                <p style={{ color: '#A1A1AA', fontSize: '13px', margin: '4px 0 0 0' }}>
                  Tentukan nama grup dan pilih akun Facebook serta produk yang ditugaskan.
                </p>
              </div>
              <button onClick={() => setShowAddGroup(false)} style={{ background: 'transparent', border: 'none', color: '#A1A1AA', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#FAFAFA', marginBottom: '8px' }}>
                  Nama Grup / Toko
                </label>
                <input 
                  type="text" 
                  style={INPUT_PREMIUM} 
                  placeholder="Misal: Jualan Hendy, Motor Bekas Samarinda..."
                  value={newGroup.name}
                  onChange={e => setNewGroup({ ...newGroup, name: e.target.value })}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: '#FAFAFA' }}>
                    Pilih Akun Facebook ({newGroup.accounts?.length || 0} Terpilih)
                  </label>
                  <button 
                    onClick={() => {
                      const allIds = accounts.map(a => a.id);
                      const isAll = newGroup.accounts?.length === allIds.length;
                      setNewGroup({ ...newGroup, accounts: isAll ? [] : allIds });
                    }}
                    style={{ background: 'transparent', border: 'none', color: '#10B981', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    {newGroup.accounts?.length === accounts.length ? 'Batal Pilih Semua' : 'Pilih Semua'}
                  </button>
                </div>
                <div style={SELECTION_LIST}>
                  {accounts.map(acc => (
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

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: '#FAFAFA' }}>
                    Pilih Produk / Listing ({newGroup.listings?.length || 0} Terpilih)
                  </label>
                  <button 
                    onClick={() => {
                      const allIds = listings.map(l => l.id);
                      const isAll = newGroup.listings?.length === allIds.length;
                      setNewGroup({ ...newGroup, listings: isAll ? [] : allIds });
                    }}
                    style={{ background: 'transparent', border: 'none', color: '#10B981', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    {newGroup.listings?.length === listings.length ? 'Batal Pilih Semua' : 'Pilih Semua'}
                  </button>
                </div>
                <div style={SELECTION_LIST}>
                  {listings.map(l => (
                    <SelectionItem 
                      key={l.id}
                      selected={newGroup.listings?.includes(l.id)}
                      label={l.title || `Produk #${l.id}`}
                      icon={Package}
                      onClick={() => toggleListing(l.id)}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div style={{ padding: '24px 32px', borderTop: '1px solid #27272A', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                onClick={() => setShowAddGroup(false)}
                style={{
                  padding: '12px 20px', background: 'transparent', color: '#A1A1AA',
                  border: '1px solid #3F3F46', borderRadius: '12px', fontSize: '14px', fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Batal
              </button>
              <button 
                onClick={saveGroup}
                style={{
                  padding: '12px 24px', background: '#10B981', color: '#09090B',
                  border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 600,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
                }}
              >
                <Save size={16} /> Simpan Grup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
