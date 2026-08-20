import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Shield, Brain, Clock, Save, Plus, Trash2, Play } from 'lucide-react';
import { api } from '../services/api';

const INPUT_STYLE = {
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
  color: 'var(--text)', padding: '8px 12px', fontSize: '13px', width: '100%', outline: 'none',
};

const SECTION_STYLE = {
  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
  padding: '20px', marginBottom: '16px',
};

export default function Settings() {
  const [config, setConfig] = useState({});
  const [schedules, setSchedules] = useState([]);
  const [tab, setTab] = useState('bot');
  const [saving, setSaving] = useState(false);
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [newSchedule, setNewSchedule] = useState({
    name: '', cron_expression: '0 8 * * *', mode: 'full', account_id: '', enabled: true,
  });

  const [accounts, setAccounts] = useState([]);

  const fetchData = async () => {
    try {
      const [cfg, sched, accs] = await Promise.all([
        api.getConfig(),
        api.getSchedules(),
        api.getAccounts(),
      ]);
      setConfig(cfg || {});
      setSchedules(sched || []);
      setAccounts(accs || []);
    } catch (err) {
      console.error('Settings fetch error:', err);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const saveConfig = async (key, value) => {
    setSaving(true);
    try {
      await api.setConfig(key, value);
      setConfig(prev => ({ ...prev, [key]: value }));
    } catch (err) {
      console.error('Config save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const addSchedule = async () => {
    try {
      await api.addSchedule(newSchedule);
      setNewSchedule({ name: '', cron_expression: '0 8 * * *', mode: 'full', account_id: '', enabled: true });
      setShowAddSchedule(false);
      const sched = await api.getSchedules();
      setSchedules(sched || []);
    } catch (err) {
      console.error('Add schedule error:', err);
    }
  };

  const deleteSchedule = async (id) => {
    try {
      await api.deleteSchedule(id);
      setSchedules(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error('Delete schedule error:', err);
    }
  };

  const toggleSchedule = async (id, enabled) => {
    try {
      await api.updateSchedule(id, { enabled: !enabled });
      setSchedules(prev => prev.map(s => s.id === id ? { ...s, enabled: !enabled } : s));
    } catch (err) {
      console.error('Toggle schedule error:', err);
    }
  };

  const renderConfigRow = (label, configKey, type = 'text', placeholder = '', options = null) => (
    <div key={configKey} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <label style={{ fontSize: '13px', color: 'var(--text)', flexShrink: 0, marginRight: '12px' }}>{label}</label>
      {type === 'toggle' ? (
        <button
          className={`btn ${config[configKey] === 'true' || config[configKey] === true ? 'btn-success' : 'btn-outline'}`}
          onClick={() => saveConfig(configKey, config[configKey] === 'true' || config[configKey] === true ? 'false' : 'true')}
          style={{ padding: '4px 12px', fontSize: '12px', minWidth: '60px' }}
        >
          {config[configKey] === 'true' || config[configKey] === true ? 'ON' : 'OFF'}
        </button>
      ) : type === 'select' ? (
        <select
          value={config[configKey] || ''}
          onChange={(e) => { setConfig(prev => ({ ...prev, [configKey]: e.target.value })); saveConfig(configKey, e.target.value); }}
          style={{ ...INPUT_STYLE, maxWidth: '200px', cursor: 'pointer' }}
        >
          <option value="">Pilih Akun</option>
          {options && options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      ) : (
        <input
          type={type}
          value={config[configKey] || ''}
          placeholder={placeholder}
          onChange={(e) => setConfig(prev => ({ ...prev, [configKey]: e.target.value }))}
          onBlur={(e) => saveConfig(configKey, e.target.value)}
          style={{ ...INPUT_STYLE, maxWidth: '200px' }}
        />
      )}
    </div>
  );

  return (
    <div style={{ padding: '0 4px' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { id: 'bot', label: 'Bot', icon: SettingsIcon },
          { id: 'ratelimit', label: 'Rate Limiter', icon: Clock },
          { id: 'ai', label: 'AI Settings', icon: Brain },
          { id: 'schedules', label: 'Jadwal', icon: Play },
        ].map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              className={`btn ${tab === t.id ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setTab(t.id)}
              style={{ fontSize: '12px' }}
            >
              <Icon size={14} style={{ marginRight: '4px' }} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Bot Settings */}
      {tab === 'bot' && (
        <div style={SECTION_STYLE}>
          <h3 style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 500 }}>Konfigurasi Bot</h3>
          {renderConfigRow("Akun Scraper", "scraper_account_id", "select", "", accounts.map(a => ({ value: a.id, label: a.name || a.id })))}
          {renderConfigRow("Akun Debug", "debug_account_id", "select", "", accounts.map(a => ({ value: a.id, label: a.name || a.id })))}
          {renderConfigRow("Mode Headless", "headless_mode", "toggle")}
        </div>
      )}

      {/* Rate Limiter */}
      {tab === 'ratelimit' && (
        <div style={SECTION_STYLE}>
          <h3 style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 500 }}>Konfigurasi Rate Limiter</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Atur batas harian per akun. Melebihi batas ini akan menjeda aksi hingga hari berikutnya.
          </p>
          {renderConfigRow("Maks Like/Hari", "rate_limit_likes_per_day", "number", "50")}
          {renderConfigRow("Maks Post/Hari", "rate_limit_posts_per_day", "number", "20")}
          {renderConfigRow("Maks Komentar/Hari", "rate_limit_comments_per_day", "number", "30")}
        </div>
      )}

      {/* AI Settings */}
      {tab === 'ai' && (
        <div style={SECTION_STYLE}>
          <h3 style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 500 }}>Konfigurasi AI</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <label style={{ fontSize: '13px', flexShrink: 0, marginRight: '12px' }}>AI Model</label>
            <select
              value={config.ai_model || 'llama-3.3-70b-versatile'}
              onChange={(e) => { setConfig(prev => ({ ...prev, ai_model: e.target.value })); saveConfig('ai_model', e.target.value); }}
              style={{ ...INPUT_STYLE, maxWidth: '220px', cursor: 'pointer' }}
            >
              <option value="llama-3.3-70b-versatile">Llama 3.3 70B (Versatile)</option>
              <option value="llama-3.1-8b-instant">Llama 3.1 8B (Fast)</option>
              <option value="mixtral-8x7b-32768">Mixtral 8x7B (Large Context)</option>
            </select>
          </div>
        </div>
      )}



      {/* Schedules */}
      {tab === 'schedules' && (
        <div style={SECTION_STYLE}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 500 }}>Jadwal Otomatisasi</h3>
            <button className="btn btn-primary" onClick={() => setShowAddSchedule(!showAddSchedule)} style={{ fontSize: '12px', padding: '6px 12px' }}>
              <Plus size={14} style={{ marginRight: '4px' }} /> Tambah Jadwal
            </button>
          </div>

          {showAddSchedule && (
            <div style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
            }}>
              <div style={{
                background: 'var(--card)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
                width: '100%', maxWidth: '400px'
              }}>
                <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 600 }}>Tambah Schedule</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                  <input style={INPUT_STYLE} placeholder="Nama Schedule" value={newSchedule.name} onChange={e => setNewSchedule(prev => ({ ...prev, name: e.target.value }))} />
                  <input style={INPUT_STYLE} placeholder="Cron (e.g. 0 8 * * *)" value={newSchedule.cron_expression} onChange={e => setNewSchedule(prev => ({ ...prev, cron_expression: e.target.value }))} />
                  <select style={{ ...INPUT_STYLE, cursor: 'pointer' }} value={newSchedule.mode} onChange={e => setNewSchedule(prev => ({ ...prev, mode: e.target.value }))}>
                    <option value="marketplace">Automate Post</option>
                    <option value="viral">Auto Viral</option>
                    <option value="sundul">Auto Sundul</option>
                  </select>
                  <select style={{ ...INPUT_STYLE, cursor: 'pointer' }} value={newSchedule.account_id} onChange={e => setNewSchedule(prev => ({ ...prev, account_id: e.target.value }))}>
                    <option value="">Pilih Akun (Semua)</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button className="btn btn-outline" onClick={() => setShowAddSchedule(false)} style={{ fontSize: '13px', padding: '8px 16px' }}>Batal</button>
                  <button className="btn btn-success" onClick={addSchedule} style={{ fontSize: '13px', padding: '8px 16px' }}>
                    <Save size={14} style={{ marginRight: '6px' }} /> Simpan
                  </button>
                </div>
              </div>
            </div>
          )}

          {schedules.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {schedules.map(sched => (
                <div key={sched.id} style={{
                  padding: '12px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px',
                }}>
                  <button
                    className={`btn ${sched.enabled ? 'btn-success' : 'btn-outline'}`}
                    onClick={() => toggleSchedule(sched.id, sched.enabled)}
                    style={{ padding: '4px 10px', fontSize: '11px', minWidth: '50px' }}
                  >
                    {sched.enabled ? 'ON' : 'OFF'}
                  </button>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{sched.name || `Schedule #${sched.id}`}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {sched.cron_expression} &middot; {sched.mode.charAt(0).toUpperCase() + sched.mode.slice(1)}
                      {sched.account_id ? ` \u00b7 Akun ${sched.account_id}` : ''}
                      {sched.last_run ? ` \u00b7 Terakhir: ${new Date(sched.last_run).toLocaleDateString()}` : ''}
                    </div>
                  </div>
                  <button className="btn btn-danger" onClick={() => deleteSchedule(sched.id)} style={{ padding: '4px 8px' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
              Belum ada jadwal. Tambahkan jadwal untuk menjalankan otomatisasi.
            </div>
          )}
        </div>
      )}

      {saving && (
        <div style={{ position: 'fixed', bottom: '20px', right: '20px', background: 'var(--card)', border: '1px solid var(--border)', padding: '8px 16px', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--text-muted)' }}>
          Menyimpan...
        </div>
      )}
    </div>
  );
}
