import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';

export function useTrashUndo(onRefresh, toast) {
  const [trash, setTrash] = useState(null);
  const timer = useRef(null);

  const clearTimer = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  };

  useEffect(() => clearTimer, []);

  const doTrash = async (ids, label) => {
    const res = await api.trashListings(ids);
    setTrash({ trashIds: res.trashIds || [], count: res.count || ids.length, label: label || `${ids.length} produk` });
    clearTimer();
    timer.current = setTimeout(() => setTrash(null), 10000);
    if (onRefresh) onRefresh();
    return res;
  };

  const undo = async () => {
    if (!trash) return;
    try {
      await api.restoreTrash(trash.trashIds);
      if (toast) toast.success(`${trash.count} produk dipulihkan`);
    } catch (e) {
      if (toast) toast.error(`Gagal pulihkan: ${e.message}`);
    } finally {
      clearTimer();
      setTrash(null);
      if (onRefresh) onRefresh();
    }
  };

  const dismiss = () => { clearTimer(); setTrash(null); };

  return { trash, doTrash, undo, dismiss };
}
