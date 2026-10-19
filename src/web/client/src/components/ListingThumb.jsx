import { useState } from 'react';
import { Image, Wrench } from 'lucide-react';

export default function ListingThumb({ photos = [], title = '', onFix, compact = false }) {
  const [broken, setBroken] = useState(false);
  const list = Array.isArray(photos) ? photos.filter(Boolean) : [];
  let first = list.length > 0 ? list[0] : null;
  if (first && !first.startsWith('/')) first = `/${first}`;

  if (!first || broken) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: compact ? 6 : 8,
          padding: 12,
          textAlign: 'center',
          background: 'rgba(239,68,68,0.06)',
          border: '1px dashed rgba(239,68,68,0.35)',
          borderRadius: 10,
        }}
      >
        <Image size={compact ? 20 : 24} style={{ opacity: 0.7 }} />
        <div style={{ fontSize: 12, fontWeight: 600, color: '#FCA5A5' }}>
          {!first ? 'Tanpa foto' : 'Foto hilang di disk'}
        </div>
        {!compact && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 220 }}>
            {!first
              ? 'Listing ini belum punya foto.'
              : 'DB masih simpan path, file tidak ada. Klik Perbaiki.'}
          </div>
        )}
        {onFix && (
          <button
            onClick={(e) => { e.stopPropagation(); onFix(); }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              border: '1px solid var(--border-light)',
              background: 'var(--primary)',
              color: 'var(--primary-contrast)',
              cursor: 'pointer',
            }}
          >
            <Wrench size={13} /> Perbaiki
          </button>
        )}
        {list.length > 1 && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{list.length} foto di DB</div>
        )}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <img
        src={first}
        alt={title || 'Product'}
        loading="lazy"
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        onError={() => setBroken(true)}
      />
      {list.length > 1 && (
        <div
          style={{
            position: 'absolute',
            right: 8,
            bottom: 8,
            fontSize: 11,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 100,
            background: 'var(--scrim)',
            color: 'var(--scrim-contrast)',
            border: '1px solid var(--border-tint)',
          }}
        >
          {list.length} foto
        </div>
      )}
    </div>
  );
}
