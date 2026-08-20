import { RefreshCw, Layers, X } from 'lucide-react';
import Sidebar from './Sidebar';

export default function Layout({ 
  activeTab, 
  setActiveTab, 
  title, 
  subtitle, 
  groups = [], 
  selectedGroupId = null, 
  onSelectGroup, 
  onRefresh, 
  children 
}) {
  const activeGroup = selectedGroupId ? groups.find(g => g.id === Number(selectedGroupId)) : null;

  return (
    <div className="app-container">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        groups={groups}
        selectedGroupId={selectedGroupId}
        onSelectGroup={onSelectGroup}
      />
      
      <main className="main-content">
        <div className="top-bar">
          <div className="welcome-msg">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="top-bar-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {activeGroup && activeTab !== 'workspace' && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '8px',
                fontSize: '13px',
                color: '#10B981',
                fontWeight: 500
              }}>
                <Layers size={14} />
                <span>Workspace: <strong>{activeGroup.name}</strong></span>
                <button
                  onClick={() => onSelectGroup && onSelectGroup(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#A1A1AA',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '2px',
                    marginLeft: '4px'
                  }}
                  title="Tampilkan Semua Data"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <button className="btn btn-outline" onClick={onRefresh}>
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
        </div>
        
        {children}
      </main>
    </div>
  );
}

