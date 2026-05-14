import React from 'react';
import { CreditCard, ShieldCheck, Database, Lock } from 'lucide-react';
import { MAX_THRESHOLD } from '../../constants';

const OverviewCards = ({ totalSpent, threshold, setThreshold, overThreshold, blockchainLength }) => {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>总计消费</span>
          <CreditCard size={20} color="var(--accent-primary)" />
        </div>
        <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>¥{totalSpent}</div>
        <div style={{ marginTop: '0.5rem' }}>
          <span className={overThreshold ? 'badge badge-danger' : 'badge badge-success'}>
            {overThreshold ? '超过阈值' : '预算内'}
          </span>
        </div>
      </div>

      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>监护人阈值</span>
          <ShieldCheck size={20} color="var(--success)" />
        </div>
        <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>¥{threshold}</div>
        <input 
          type="range" 
          min="0" 
          max={MAX_THRESHOLD}
          step="100"
          value={threshold} 
          onChange={(e) => setThreshold(parseInt(e.target.value))}
          style={{ width: '100%', marginTop: '1rem', accentColor: 'var(--accent-primary)' }}
        />
      </div>

      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>链上完整性</span>
          <Database size={20} color="var(--accent-secondary)" />
        </div>
        <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{blockchainLength} 个区块</div>
        <div style={{ color: 'var(--success)', fontSize: '0.875rem', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Lock size={14} /> 不可篡改账本已验证
        </div>
      </div>
    </div>
  );
};

export default OverviewCards;
