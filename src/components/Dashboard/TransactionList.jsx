import React from 'react';
import { Activity } from 'lucide-react';

const TransactionList = ({ transactions }) => {
  return (
    <div className="glass-card">
      <h3 style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between' }}>
        交易日志
        <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>实时同步</span>
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {transactions.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>暂无交易记录。</p>}
        {transactions.map(tx => (
          <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Activity size={20} color="var(--accent-primary)" />
              </div>
              <div>
                <div style={{ fontWeight: '600' }}>{tx.category}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{tx.channel} • {new Date(tx.timestamp).toLocaleTimeString()}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: '700' }}>¥{tx.amount}</div>
              <div className="badge badge-success" style={{ fontSize: '0.65rem' }}>已上链</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TransactionList;
