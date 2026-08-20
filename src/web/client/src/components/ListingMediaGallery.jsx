import React from 'react';
import { Plus, Image as ImageIcon } from 'lucide-react';

export default function ListingMediaGallery({ listing, isVehicle, uploading, onFileUpload }) {
  return (
    <div style={{ background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ImageIcon size={18} style={{ color: 'var(--text-muted)' }} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 500, margin: 0 }}>Galeri Media</h3>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg)', padding: '4px 10px', borderRadius: '100px', border: '1px solid var(--border)' }}>
          {listing.photos ? listing.photos.length : 0} / {isVehicle ? 20 : 10} Foto
        </span>
      </div>
      
      <div style={{ padding: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          {listing.photos && listing.photos.map((p, i) => (
            <div key={i} style={{ aspectRatio: '1/1', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)', position: 'relative', background: 'var(--bg)' }}>
              <img src={p.startsWith('/') ? p : `/${p}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Product" />
              {i === 0 && (
                <div style={{ position: 'absolute', top: '8px', left: '8px', background: 'var(--text)', color: 'var(--bg)', fontSize: '0.65rem', fontWeight: 600, padding: '4px 8px', borderRadius: '6px', letterSpacing: '0.05em' }}>
                  COVER
                </div>
              )}
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
              background: 'rgba(255,255,255,0.02)',
              transition: 'all 0.2s',
              color: 'var(--text-muted)',
              gap: '8px'
            }}
            onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--text-muted)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <Plus size={24} />
            <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>Unggah</span>
            <input type="file" hidden multiple accept="image/*" onChange={onFileUpload} disabled={uploading} />
          </label>
        </div>
        {uploading && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}><div className="spin" style={{ width: '12px', height: '12px', border: '2px solid var(--text-muted)', borderTopColor: 'transparent', borderRadius: '50%' }}></div> Mengunggah media...</div>}
      </div>
    </div>
  );
}
