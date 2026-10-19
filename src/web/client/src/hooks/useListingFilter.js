import { useEffect, useMemo, useState } from 'react';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? raw : fallback;
  } catch {
    return fallback;
  }
}

export function useListingFilter(listings, storageKey = null) {
  const [query, setQuery] = useState(() => (storageKey ? read(`${storageKey}:q`, '') : ''));
  const [sort, setSort] = useState(() => (storageKey ? read(`${storageKey}:sort`, 'newest') : 'newest'));
  const [photoFilter, setPhotoFilter] = useState(() => (storageKey ? read(`${storageKey}:photo`, 'all') : 'all'));

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(`${storageKey}:q`, query);
      localStorage.setItem(`${storageKey}:sort`, sort);
      localStorage.setItem(`${storageKey}:photo`, photoFilter);
    } catch { /* ignore */ }
  }, [storageKey, query, sort, photoFilter]);

  const result = useMemo(() => {
    const q = query.trim().toLowerCase();
    let arr = Array.isArray(listings) ? [...listings] : [];
    if (q) {
      arr = arr.filter((l) =>
        `${l.title || ''} ${l.description || ''} ${l.category || ''}`.toLowerCase().includes(q),
      );
    }
    if (photoFilter === 'has') arr = arr.filter((l) => Array.isArray(l.photos) && l.photos.length > 0);
    if (photoFilter === 'missing') arr = arr.filter((l) => !l.photos || l.photos.length === 0);
    const price = (v) => Number(String(v ?? 0).replace(/[^0-9]/g, '')) || 0;
    switch (sort) {
      case 'priceAsc': arr.sort((a, b) => price(a.price) - price(b.price)); break;
      case 'priceDesc': arr.sort((a, b) => price(b.price) - price(a.price)); break;
      case 'title': arr.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''))); break;
      case 'newest':
      default: arr.sort((a, b) => Number(b.id) - Number(a.id)); break;
    }
    return arr;
  }, [listings, query, sort, photoFilter]);

  return { query, setQuery, sort, setSort, photoFilter, setPhotoFilter, result };
}
