import React from 'react';

export const PendingList = ({ txs, onAction, loading }) => (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-bold text-white flex items-center">
        待处理预警
        <span className="ml-3 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-0.5 rounded-full text-xs font-bold animate-pulse">
          {txs.length}
        </span>
      </h2>
    </div>
    
    {txs.length === 0 ? (
      <div className="py-16 text-center bg-slate-950/40 rounded-[24px] border border-dashed border-slate-850">
        <p className="text-slate-500 font-bold text-sm">暂无待处理交易，一切安全</p>
      </div>
    ) : (
      <div className="grid gap-4">
        {txs.map(tx => (
          <div key={tx.id} className="bg-slate-950/40 border border-slate-850/80 p-5 rounded-3xl shadow-lg hover:border-blue-500/20 hover:bg-slate-900/10 transition-all duration-300">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="text-2xl font-black text-white">{tx.amount}</span>
                  <span className="text-slate-500 font-bold text-sm">Wei / 元</span>
                </div>
                <div className="flex items-center space-x-2 text-xs text-slate-400 font-bold mt-1.5">
                  <span className="bg-slate-900/60 border border-slate-800 px-2 py-0.5 rounded text-slate-300">{tx.merchantType}</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-slate-400">成员: {tx.ward.slice(0, 8)}...</span>
                </div>
              </div>
              <div className="flex space-x-2">
                <button 
                  disabled={loading}
                  onClick={() => onAction(tx.id, true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 disabled:opacity-50 shadow-lg shadow-emerald-600/10 active:scale-95 text-lg font-black"
                  title="批准"
                >
                  ✓
                </button>
                <button 
                  disabled={loading}
                  onClick={() => onAction(tx.id, false)}
                  className="bg-rose-600 hover:bg-rose-500 text-white w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 disabled:opacity-50 shadow-lg shadow-rose-600/10 active:scale-95 text-lg font-black"
                  title="拒绝"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-900 text-[10px] text-slate-500 uppercase tracking-widest font-bold">
              Transaction ID: {tx.id.toString()} • {new Date(Number(tx.timestamp)*1000).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);
