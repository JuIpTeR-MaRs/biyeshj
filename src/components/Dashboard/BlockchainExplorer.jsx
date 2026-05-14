import React from 'react';
import { Database } from 'lucide-react';

const BlockchainExplorer = ({ blockchain }) => {
  return (
    <div className="glass-card">
      <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Database size={18} /> 区块链浏览器
      </h3>
      <div style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {[...blockchain].reverse().map(block => (
          <div key={block.hash} style={{ padding: '0.75rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', fontSize: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--accent-secondary)', fontWeight: 'bold' }}>区块 #{block.index}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{new Date(block.timestamp).toLocaleTimeString()}</span>
            </div>
            <div style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              哈希值: {block.hash}
            </div>
            <div style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.2)' }}>
              上一块: {block.previousHash}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BlockchainExplorer;
