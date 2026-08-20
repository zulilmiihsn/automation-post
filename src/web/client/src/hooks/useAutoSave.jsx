import { useCallback, useRef, useState } from 'react';

/**
 * useAutoSave - runs saveFn after `delay` ms of no new calls.
 * Returns { triggerSave, status } where status is 'idle' | 'saving' | 'saved' | 'error'.
 */
export function useAutoSave(saveFn, delay = 800) {
  const timer = useRef(null);
  const [status, setStatus] = useState('idle');

  const triggerSave = useCallback(async (value) => {
    if (timer.current) clearTimeout(timer.current);
    setStatus('saving');
    timer.current = setTimeout(async () => {
      try {
        await saveFn(value);
        setStatus('saved');
        setTimeout(() => setStatus('idle'), 2000);
      } catch (err) {
        console.error('[AutoSave]', err);
        setStatus('error');
        setTimeout(() => setStatus('idle'), 3000);
      }
    }, delay);
  }, [saveFn, delay]);

  return { triggerSave, status };
}

/**
 * SaveStatus - tiny inline indicator component.
 * Usage: <SaveStatus status={status} />
 */
export function SaveStatus({ status }) {
  if (status === 'idle') return null;
  const map = {
    saving: { text: 'Menyimpan...', color: 'var(--text-muted)' },
    saved:  { text: 'Tersimpan',   color: 'var(--success)' },
    error:  { text: 'Gagal simpan', color: 'var(--danger)' },
  };
  const { text, color } = map[status] || {};
  return (
    <span style={{
      fontSize: '0.75rem',
      fontWeight: 500,
      color,
      transition: 'opacity 0.3s',
      opacity: status === 'idle' ? 0 : 1,
    }}>
      {text}
    </span>
  );
}
