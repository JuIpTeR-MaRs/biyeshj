import React from 'react';
import { Plus } from 'lucide-react';

const Header = ({ onAddSimulated, isMining }) => {
  return (
    <header style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <h1 className="gradient-text" style={{ fontSize: '2.5rem' }}>守护链 (GuardianChain)</h1>
        <p style={{ color: 'var(--text-secondary)' }}>安全财务监护 & 区块链审计系统</p>
      </div>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <button onClick={onAddSimulated} disabled={isMining} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={18} />
          {isMining ? '正在上链...' : '模拟微信/支付宝消费'}
        </button>
      </div>
    </header>
  );
};

export default Header;
