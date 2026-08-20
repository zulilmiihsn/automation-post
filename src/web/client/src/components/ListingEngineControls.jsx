import React from 'react';
import { Bot } from 'lucide-react';

export default function ListingEngineControls({ listing, handleChange }) {
  return (
    <div style={{ background: 'var(--bg)', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ padding: '20px 24px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Bot size={18} style={{ color: 'var(--text)' }} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 500, margin: 0 }}>Konfigurasi Otomatisasi</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: listing.isActive !== false ? 'var(--success)' : 'var(--text-muted)', letterSpacing: '0.05em' }}>
            {listing.isActive !== false ? 'AKTIF' : 'NONAKTIF'}
          </span>
          <input 
            type="checkbox" 
            className="switch-sm"
            checked={listing.isActive !== false} 
            onChange={(e) => handleChange('isActive', e.target.checked)} 
          />
        </div>
      </div>
      
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', opacity: listing.isActive !== false ? 1 : 0.4, transition: 'opacity 0.2s', pointerEvents: listing.isActive !== false ? 'auto' : 'none' }}>
        
        {/* MP ENGINE */}
        <div style={{ display: 'flex', gap: '16px' }}>
          <input 
            type="checkbox" 
            className="switch-sm"
            checked={listing.postMarketplace !== false} 
            onChange={(e) => handleChange('postMarketplace', e.target.checked)} 
            style={{ marginTop: '2px' }}
          />
          <div>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '0.95rem', fontWeight: 500, color: listing.postMarketplace !== false ? 'var(--text)' : 'var(--text-muted)' }}>Mesin Posting Marketplace</h4>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Secara otomatis mengunggah media dan memposting produk ini ke Facebook Marketplace menggunakan akun yang dikonfigurasi.
            </p>
          </div>
        </div>

        <div style={{ height: '1px', background: 'var(--border)' }}></div>

        {/* VIRAL ENGINE */}
        <div style={{ display: 'flex', gap: '16px' }}>
          <input 
            type="checkbox" 
            className="switch-sm"
            checked={listing.autoFeed !== false} 
            onChange={(e) => handleChange('autoFeed', e.target.checked)} 
            style={{ marginTop: '2px' }}
          />
          <div style={{ flex: 1 }}>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '0.95rem', fontWeight: 500, color: listing.autoFeed !== false ? 'var(--text)' : 'var(--text-muted)' }}>Mesin Viral Share</h4>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Membuat postingan di Feed FB Anda dan secara otomatis membagikannya ke grup yang cocok dengan kata kunci target.
            </p>
            
            {listing.autoFeed !== false && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--card)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>Kata Kunci Grup Target</label>
                    <input 
                      type="text" 
                      value={listing.targetGroup ?? 'berau'} 
                      onChange={(e) => handleChange('targetGroup', e.target.value)} 
                      placeholder="e.g. Jual Beli Mobil" 
                      style={{ width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', outline: 'none', fontSize: '0.85rem' }} 
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>Maks Share</label>
                    <input 
                      type="number" 
                      value={listing.maxGroups ?? 20} 
                      onChange={(e) => handleChange('maxGroups', parseInt(e.target.value) || 0)} 
                      style={{ width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', outline: 'none', fontSize: '0.85rem' }} 
                    />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>URL Postingan yang Ada (Opsional)</label>
                  <input 
                    type="text" 
                    value={listing.existingPostUrl || ''} 
                    onChange={(e) => handleChange('existingPostUrl', e.target.value)} 
                    placeholder="Biarkan kosong untuk membuat postingan baru" 
                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', outline: 'none', fontSize: '0.85rem' }} 
                  />
                </div>

              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
