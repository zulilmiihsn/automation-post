import { useEffect, useMemo, useState } from 'react';

// eslint-disable-next-line react-refresh/only-export-components
export function usePager(items, perPage = 24, storageKey = null) {
  const [page, setPage] = useState(() => {
    if (!storageKey) return 1;
    try {
      const v = Number(localStorage.getItem(`${storageKey}:page`));
      return v > 0 ? v : 1;
    } catch {
      return 1;
    }
  });
  const total = Array.isArray(items) ? items.length : 0;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(page, pages);

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(`${storageKey}:page`, String(currentPage));
    } catch { /* ignore */ }
  }, [storageKey, currentPage]);

  const slice = useMemo(() => {
    const arr = Array.isArray(items) ? items : [];
    return arr.slice((currentPage - 1) * perPage, currentPage * perPage);
  }, [items, currentPage, perPage]);

  return { page: currentPage, setPage, pages, total, slice };
}

export function Pager({ page, pages, total, onPage }) {
  if (pages <= 1) return null;
  const nums = [];
  const from = Math.max(1, Math.min(page - 2, pages - 4));
  const to = Math.min(pages, from + 4);
  for (let i = from; i <= to; i++) nums.push(i);
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }} role="navigation" aria-label="Halaman produk">
      <button className="btn btn-outline" disabled={page <= 1} onClick={() => onPage(page - 1)} style={{ fontSize: 12 }}>‹ Prev</button>
      {nums.map((n) => (
        <button
          key={n}
          onClick={() => onPage(n)}
          aria-current={n === page ? 'page' : undefined}
          style={{
            padding: '6px 12px', fontSize: 12, borderRadius: 8, cursor: 'pointer',
            border: '1px solid var(--border)', background: n === page ? 'var(--text)' : 'transparent',
            color: n === page ? 'var(--bg)' : 'var(--text)', fontWeight: n === page ? 700 : 500,
          }}
        >
          {n}
        </button>
      ))}
      <button className="btn btn-outline" disabled={page >= pages} onClick={() => onPage(page + 1)} style={{ fontSize: 12 }}>Next ›</button>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{total} produk • hal {page}/{pages}</span>
    </div>
  );
}
