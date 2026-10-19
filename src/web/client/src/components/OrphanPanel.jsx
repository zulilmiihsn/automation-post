import { useState } from 'react';
import { api } from '../services/api';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmContext';

export default function OrphanPanel({ onChanged }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const scan = async () => {
    setLoading(true);
    try {
      const data = await api.listOrphans();
      setInfo(data);
    } catch (e) {
      toast.error(`Gagal pindai: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const clean = async () => {
    if (!info || info.count === 0) return;
    const ok = await confirm(`Hapus ${info.count} file orphan tak terpakai? Hanya file tanpa referensi DB. Tidak bisa urung.`);
    if (!ok) return;
    try {
      const r = await api.cleanOrphans(500);
      toast.success(`${r.deleted} orphan terhapus`);
      setInfo(null);
      if (onChanged) onChanged();
    } catch (e) {
      toast.error(`Gagal bersih: ${e.message}`);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button className="btn btn-outline" onClick={scan} disabled={loading} style={{ fontSize: 12 }}>
        {loading ? 'Memindai...' : info ? `Orphan: ${info.count} — Pindai Lagi` : 'Pindai Orphan'}
      </button>
      {info && info.count > 0 && (
        <button className="btn btn-danger" onClick={clean} style={{ fontSize: 12 }}>
          Bersihkan ({info.count})
        </button>
      )}
      {info && info.files && info.files.length > 0 && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          cth: {info.files.slice(0, 2).join(', ')}
        </span>
      )}
    </div>
  );
}
