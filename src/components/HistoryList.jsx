import React from 'react';

export const HistoryList = ({ txs, role, onContinuePay }) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-bold text-slate-200 flex items-center space-x-2">
          <span>📋 消费历史记录</span>
          <span className="ml-3 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-3 py-0.5 rounded-full text-xs font-bold">
            {txs.length}
          </span>
        </h4>
      </div>

      {txs.length === 0 ? (
        <div className="py-16 text-center bg-slate-950/40 rounded-[32px] border border-dashed border-slate-850">
          <p className="text-slate-500 font-bold text-sm">暂无消费历史记录</p>
        </div>
      ) : (
        <div className="grid gap-4 max-h-[420px] overflow-y-auto pr-1.5 custom-scrollbar">
          {txs.map(tx => {
            let statusBadge = null;
            let borderGlow = "border-slate-850 hover:border-slate-800";
            if (tx.isPending) {
              borderGlow = "border-slate-850 hover:border-amber-500/30";
              statusBadge = (
                <span className="inline-flex items-center bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1 rounded-full text-xs font-black">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse mr-1.5"></span>
                  待审批
                </span>
              );
            } else if (tx.isApproved) {
              borderGlow = "border-slate-850 hover:border-emerald-500/30";
              statusBadge = (
                <div className="flex flex-col items-end space-y-2">
                  <span className="inline-flex items-center bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full text-xs font-black">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1.5"></span>
                    已批准
                  </span>
                  {role === 'ward' && onContinuePay && !tx.isPaid && (
                    <button 
                      onClick={() => onContinuePay(tx)}
                      className="text-xs bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white px-3 py-1.5 rounded-lg shadow-md shadow-emerald-500/20 transition-transform hover:scale-105 active:scale-95 flex items-center space-x-1"
                    >
                      <span>继续支付</span>
                      <span>➔</span>
                    </button>
                  )}
                </div>
              );
            } else {
              borderGlow = "border-slate-850 hover:border-rose-500/30";
              statusBadge = (
                <span className="inline-flex items-center bg-rose-500/10 text-rose-400 border border-rose-500/20 px-3 py-1 rounded-full text-xs font-black">
                  <span className="w-1.5 h-1.5 bg-rose-500 rounded-full mr-1.5"></span>
                  已拒绝
                </span>
              );
            }

            return (
              <div key={tx.id} className={`bg-slate-950/40 border p-5 rounded-[24px] shadow-lg hover:bg-slate-900/10 transition-all duration-300 hover:scale-[1.01] ${borderGlow}`}>
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-2xl font-black text-white">{tx.amount}</span>
                      <span className="text-slate-500 font-bold text-sm">Wei / 元</span>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center text-xs text-slate-400 font-bold mt-1">
                      <span className="bg-slate-900/60 border border-slate-805 px-2.5 py-1 rounded-lg text-slate-300">{tx.merchantType}</span>
                      <span className="text-slate-700">•</span>
                      <span className="text-slate-400">成员: {tx.wardName || `${tx.ward.slice(0, 6)}...${tx.ward.slice(-4)}`}</span>
                    </div>
                  </div>
                  <div>
                    {statusBadge}
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-900 text-[10px] text-slate-500 font-mono flex justify-between items-center">
                  <span>ID: {tx.id}</span>
                  <span>{new Date(tx.timestamp * 1000).toLocaleString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
