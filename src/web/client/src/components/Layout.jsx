import { RefreshCw } from 'lucide-react';
import Sidebar from './Sidebar';
import GlobalConsole from './GlobalConsole';

export default function Layout({ 
  activeTab, 
  setActiveTab, 
  title, 
  subtitle, 
  onRefresh, 
  children 
}) {
  return (
    <div className="app-container">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
      
      <main className="main-content">
        <div className="top-bar">
          <div className="welcome-msg">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="top-bar-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button className="btn btn-outline" onClick={onRefresh}>
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
        </div>
        
        {children}
      </main>
      <GlobalConsole />
    </div>
  );
}
