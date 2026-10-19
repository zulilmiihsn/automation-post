import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

const ConfirmContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }) {
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    message: '',
    resolve: null,
  });

  const confirm = useCallback((message) => {
    return new Promise((resolve) => {
      setConfirmState({
        isOpen: true,
        message,
        resolve,
      });
    });
  }, []);

  const handleClose = (result) => {
    if (confirmState.resolve) {
      confirmState.resolve(result);
    }
    setConfirmState({ isOpen: false, message: '', resolve: null });
  };

  const okRef = useRef(null);

  useEffect(() => {
    if (!confirmState.isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') handleClose(false); };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => { if (okRef.current) okRef.current.focus(); }, 50);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmState.isOpen]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {confirmState.isOpen && (
        <div role="dialog" aria-modal="true" aria-label="Konfirmasi" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'var(--scrim)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
          padding: '20px', animation: 'fadeIn 0.2s ease-out'
        }}>
          <style>{`
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
          `}</style>
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '24px',
            width: '100%', maxWidth: '440px', display: 'flex', flexDirection: 'column',
            boxShadow: '0 32px 64px rgba(0,0,0,0.5)', overflow: 'hidden',
            animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <div style={{ padding: '24px 32px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
              <div style={{ 
                width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(245, 158, 11, 0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <AlertTriangle color="#F59E0B" size={24} />
              </div>
              <div style={{ paddingTop: '4px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)', margin: '0 0 8px 0' }}>Konfirmasi</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.5, margin: 0 }}>
                  {confirmState.message}
                </p>
              </div>
            </div>
            <div style={{ 
              padding: '20px 32px', background: 'var(--card-hover)', borderTop: '1px solid var(--border)',
              display: 'flex', justifyContent: 'flex-end', gap: '12px'
            }}>
              <button 
                onClick={() => handleClose(false)}
                style={{
                  padding: '10px 20px', background: 'transparent', color: 'var(--text)', border: '1px solid var(--border-light)',
                  borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--card)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                Batal
              </button>
              <button 
                ref={okRef}
                onClick={() => handleClose(true)}
                style={{
                  padding: '10px 20px', background: 'var(--primary)', color: 'var(--primary-contrast)', border: 'none',
                  borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s'
                }}
                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                Ya, Lanjutkan
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
