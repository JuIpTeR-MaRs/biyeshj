import React from 'react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

const SpendingChart = ({ transactions }) => {
  return (
    <div className="glass-card" style={{ height: '300px' }}>
      <h3 style={{ marginBottom: '1rem' }}>消费速率</h3>
      <ResponsiveContainer width="100%" height="80%">
        <AreaChart data={[...transactions].reverse()}>
          <defs>
            <linearGradient id="colorSpent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="timestamp" hide />
          <YAxis stroke="var(--text-secondary)" fontSize={12} />
          <Tooltip 
            contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px' }}
            itemStyle={{ color: 'var(--text-primary)' }}
          />
          <Area type="monotone" dataKey="amount" stroke="var(--accent-primary)" fillOpacity={1} fill="url(#colorSpent)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SpendingChart;
