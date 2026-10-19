import { useState } from 'react';
import { Plus, Image as ImageIcon, Star, Trash2 } from 'lucide-react';

export default function ListingMediaGallery({ listing, isVehicle, uploading, onFileUpload, onSetCover, onDeletePhoto }) {
  const [confirmId, setConfirmId] = useState(null);
  const photos = Array.isArray(listing.photos) ? listing.photos : [];

  return (
    <div style={{ background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ImageIcon size={18} style={{ color: 'var(--text-muted)' }} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 500, margin: 0 }}>Galeri Media</h3>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg)', padding: '4px 10px', borderRadius: '100px', border: '1px solid var(--border)' }}>
          {photos.length} / {isVehicle ? 20 : 10} Foto
        </span>
      </div>
      
      <div style={{ padding: '24px' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Foto pertama = cover. Arahkan kursor ke foto untuk jadikan cover / hapus 1 foto.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          {photos.map((p, i) => (
            <div key={`${p}-${i}`} className="gallery-thumb" style={{ aspectRatio: '1/1', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)', position: 'relative', background: 'var(--bg)' }}>
              <img src={p.startsWith('/') ? p : `/${p}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={`Foto ${i + 1}`} />
              {i === 0 && (
                <div style={{ position: 'absolute', top: '8px', left: '8px', background: 'var(--text)', color: 'var(--bg)', fontSize: '0.65rem', fontWeight: 700, padding: '4px 8px', borderRadius: '6px', letterSpacing: '0.05em' }}>
                  COVER
                </div>
              )}
              <div className="gallery-actions" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '8px', padding: '8px', background: 'linear-gradient(to top, rgba(0,0,0,0.65), transparent 55%)', opacity: 0, transition: 'opacity 0.15s' }}>
                {i !== 0 && (
                  <button
                    type="button"
                    title="Jadikan cover"
                    onClick={() => onSetCover && onSetCover(i)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '5px 9px', borderRadius: 8, border: '1px solid var(--border-light)', background: 'var(--primary)', color: 'var(--primary-contrast)', cursor: 'pointer' }}
                  >
                    <Star size={12} /> Cover
                  </button>
                )}
                {confirmId === `${p}-${i}` ? (
                  <>
                    <button
                      type="button"
                      onClick={() => { setConfirmId(null); onDeletePhoto && onDeletePhoto(i, true); }}
                      style={{ fontSize: 11, fontWeight: 700, padding: '5px 9px', borderRadius: 8, border: 'none', background: '#EF4444', color: '#fff', cursor: 'pointer' }}
                    >
                      Ya
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      style={{ fontSize: 11, fontWeight: 700, padding: '5px 9px', borderRadius: 8, border: '1px solid var(--border-light)', background: 'var(--card)', color: 'var(--text)', cursor: 'pointer' }}
                    >
                      Batal
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    title="Hapus foto ini"
                    onClick={() => setConfirmId(`${p}-${i}`)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '5px 9px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.5)', background: 'rgba(127,29,29,0.85)', color: '#fff', cursor: 'pointer' }}
                  >
                    <Trash2 size={12} /> Hapus
                  </button>
                )}
              </div>
            </div>
          ))}
          
          <label 
            style={{ 
              aspectRatio: '1/1', 
              borderRadius: '12px', 
              border: '2px dashed var(--border-light)', 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center',
              cursor: 'pointer',
              background: 'var(--surface-tint)',
              transition: 'all 0.2s',
              color: 'var(--text-muted)',
              gap: '8px'
            }}
            onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--text-muted)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <Plus size={24} />
            <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>Tambah (gabung)</span>
            <input type="file" hidden multiple accept="image/*" onChange={onFileUpload} disabled={uploading} />
          </label>
        </div>
        <style>{`.gallery-thumb:hover .gallery-actions, .gallery-thumb:focus-within .gallery-actions { opacity: 1 !important; } @media (hover: none) { .gallery-thumb .gallery-actions { opacity: 1 !important; background: linear-gradient(to top, rgba(0,0,0,0.55), transparent 60%); } }`}</style>
        {uploading && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}><div className="spin" style={{ width: '12px', height: '12px', border: '2px solid var(--text-muted)', borderTopColor: 'transparent', borderRadius: '50%' }}></div> Mengunggah media...</div>}
      </div>
    </div>
  );
}
