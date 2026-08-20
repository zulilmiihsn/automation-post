import React from 'react';

export default function ListingDynamicAttrs({ dynamicAttrs, config, listing, handleAttributeChange }) {
  if (!dynamicAttrs || dynamicAttrs.length === 0) return null;

  return (
    <div style={{ background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)' }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 500, margin: 0 }}>Atribut Kategori</h3>
      </div>
      <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {dynamicAttrs.map((attr) => {
          const fieldConfig = config.FIELD_CONFIG[attr];
          const value = listing.attributes?.[attr] || "";
          
          if (fieldConfig?.type === 'select') {
            return (
              <div key={attr}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 500 }}>{attr}</label>
                <select 
                  value={value} 
                  onChange={(e) => handleAttributeChange(attr, e.target.value)} 
                  style={{ width: '100%', padding: '12px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', outline: 'none', fontSize: '0.9rem' }}
                >
                  <option value="">-</option>
                  {fieldConfig.options.map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
            );
          }
          
          return (
            <div key={attr}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 500 }}>{attr}</label>
              <input 
                type={fieldConfig?.type === 'number' ? 'number' : 'text'} 
                value={value} 
                onChange={(e) => handleAttributeChange(attr, e.target.value)} 
                style={{ width: '100%', padding: '12px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', outline: 'none', fontSize: '0.9rem' }} 
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
