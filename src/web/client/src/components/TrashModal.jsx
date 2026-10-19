import { useCallback, useEffect, useState } from 'react';
import { X, Trash2, Undo2, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmContext';
import styles from './TrashModal.module.css';

export default function TrashModal({ show, onClose, onChanged }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState([]);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listTrash(200);
      setItems(data.items || []);
      setSelected([]);
    } catch (e) {
      setError(e.message || 'Gagal memuat sampah.');
      toast.error(`Gagal muat sampah: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!show) return;
    const task = window.setTimeout(load, 0);
    return () => window.clearTimeout(task);
  }, [show, load]);

  useEffect(() => {
    if (!show) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show, onClose]);

  if (!show) return null;

  const toggle = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const restore = async (ids) => {
    if (!ids.length || actionBusy) return;
    setActionBusy(true);
    try {
      const r = await api.restoreTrash(ids);
      toast.success(`${r.count} dipulihkan`);
      if (onChanged) onChanged();
      await load();
    } catch (e) {
      toast.error(`Gagal pulihkan: ${e.message}`);
    } finally {
      setActionBusy(false);
    }
  };

  const destroy = async (ids) => {
    if (!ids.length || actionBusy) return;
    const ok = await confirm(`Hapus permanen ${ids.length} item dari sampah? File foto ikut hapus bila tak dipakai. Tidak bisa urung.`);
    if (!ok) return;
    setActionBusy(true);
    try {
      const r = await api.deleteTrashPermanent(ids);
      toast.success(`${r.count} dihapus permanen`);
      if (onChanged) onChanged();
      await load();
    } catch (e) {
      toast.error(`Gagal hapus permanen: ${e.message}`);
    } finally {
      setActionBusy(false);
    }
  };

  const formatDeletedAt = (value) => {
    if (!value) return 'Waktu tidak diketahui';
    const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={onClose}>
      <div
        className={`modal-content ${styles.dialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="trash-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <div className={styles.titleLine}>
              <h3 id="trash-dialog-title" className={styles.title}>Sampah Produk</h3>
              <span className={styles.count}>{items.length}</span>
            </div>
            <p className={styles.description}>Pulihkan produk terhapus. Foto aman sampai produk dihapus permanen atau dipurge setelah 30 hari.</p>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Tutup sampah" title="Tutup">
            <X size={18} />
          </button>
        </header>

        <div className={styles.toolbar}>
          {items.length > 0 && (
            <label className={styles.selection}>
              <input
                type="checkbox"
                checked={selected.length === items.length}
                onChange={() => setSelected(selected.length === items.length ? [] : items.map(item => item.trash_id))}
              />
              <span>{selected.length ? `${selected.length} dipilih` : 'Pilih semua'}</span>
            </label>
          )}
          {items.length > 0 && (
            <>
              <button className={`btn btn-primary ${styles.action}`} disabled={!selected.length || actionBusy} onClick={() => restore(selected)}>
                <Undo2 size={14} /> Pulihkan {selected.length || ''}
              </button>
              <button className={`btn btn-danger ${styles.action}`} disabled={!selected.length || actionBusy} onClick={() => destroy(selected)}>
                <Trash2 size={14} /> Hapus permanen {selected.length || ''}
              </button>
            </>
          )}
          <button className={`btn btn-outline ${styles.action}`} onClick={load} disabled={loading || actionBusy}>
            <RefreshCw size={14} /> {loading ? 'Memuat…' : 'Muat ulang'}
          </button>
        </div>

        {error && <div className={styles.error} role="alert">{error}</div>}

        <div className={styles.body} aria-busy={loading || actionBusy}>
          {loading ? (
            <div className={styles.loading} aria-label="Memuat sampah">
              <div className={`skeleton ${styles.skeleton}`} />
              <div className={`skeleton ${styles.skeleton}`} />
            </div>
          ) : items.length === 0 ? (
            <div className={styles.empty}>
              <Trash2 size={25} strokeWidth={1.6} />
              <h4 className={styles.emptyTitle}>Sampah kosong</h4>
              <div className={styles.emptyHint}>Produk terhapus akan muncul di sini. Foto tetap aman sampai dihapus permanen.</div>
            </div>
          ) : (
            <div className={styles.list}>
              {items.map(item => (
                <div key={item.trash_id} className={styles.row}>
                  <input
                    className={styles.checkbox}
                    type="checkbox"
                    aria-label={`Pilih ${item.title}`}
                    checked={selected.includes(item.trash_id)}
                    onChange={() => toggle(item.trash_id)}
                  />
                  <div className={styles.rowInfo}>
                    <div className={styles.rowTitle}>{item.title || '(tanpa judul)'}</div>
                    <div className={styles.rowMeta}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><ImageIcon size={12} /> {item.photoCount} foto</span>
                      <span>Dihapus {formatDeletedAt(item.deleted_at)}</span>
                    </div>
                  </div>
                  <div className={styles.rowActions}>
                    <button className={`btn btn-outline ${styles.action}`} disabled={actionBusy} onClick={() => restore([item.trash_id])}>
                      <Undo2 size={14} /> Pulihkan
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
