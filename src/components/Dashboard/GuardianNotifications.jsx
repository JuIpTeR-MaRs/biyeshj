import React from 'react';
import { Bell } from 'lucide-react';

const GuardianNotifications = ({ notifications }) => {
  return (
    <div className="glass-card">
      <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Bell size={18} /> 监护人通知
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {notifications.length === 0 && <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>暂无异常提醒。</p>}
        {notifications.map(n => (
          <div key={n.id} style={{ padding: '0.75rem', borderRadius: '12px', borderLeft: '4px solid var(--danger)', background: 'rgba(244,63,94,0.05)' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.25rem' }}>{n.message}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{n.time}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GuardianNotifications;
