import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

const ToastContext = createContext(null);

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = Date.now().toString() + Math.random().toString();
    setToasts(prev => [...prev, { id, message, type, duration }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = {
    success: (msg, duration) => addToast(msg, 'success', duration),
    error: (msg, duration) => addToast(msg, 'error', duration),
    info: (msg, duration) => addToast(msg, 'info', duration),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div style={{
        position: 'fixed', bottom: '24px', right: '24px', 
        display: 'flex', flexDirection: 'column', gap: '12px', zIndex: 9999, pointerEvents: 'none'
      }}>
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onRemove }) {
  useEffect(() => {
    if (toast.duration > 0) {
      const timer = setTimeout(() => onRemove(toast.id), toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast, onRemove]);

  const colors = {
    success: { bg: '#064E3B', border: '#10B981', icon: <CheckCircle color="#10B981" size={18} /> },
    error: { bg: '#7F1D1D', border: '#EF4444', icon: <AlertCircle color="#EF4444" size={18} /> },
    info: { bg: '#1E3A8A', border: '#3B82F6', icon: <Info color="#3B82F6" size={18} /> }
  };
  
  const theme = colors[toast.type] || colors.info;

  return (
    <div style={{
      background: '#18181B', border: `1px solid ${theme.border}`,
      boxShadow: '0 10px 25px rgba(0,0,0,0.5)', borderRadius: '12px',
      padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px',
      minWidth: '300px', maxWidth: '400px', pointerEvents: 'auto',
      animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      color: '#FAFAFA', fontSize: '14px', fontWeight: 500
    }}>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
      {theme.icon}
      <div style={{ flex: 1, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{toast.message}</div>
      <button 
        onClick={() => onRemove(toast.id)}
        style={{
          background: 'transparent', border: 'none', color: '#A1A1AA', 
          cursor: 'pointer', padding: '4px', display: 'flex'
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
