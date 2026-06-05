import React from 'react';

export const HistoryList = ({ txs }) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-bold text-slate-800 flex items-center space-x-2">
          <span>📋 消费历史记录</span>
          <span className="ml-3 bg-blue-100 text-blue-600 px-3 py-0.5 rounded-full text-xs font-bold">
            {txs.length}
          </span>
        </h4>
      </div>

      {txs.length === 0 ? (
        <div className="py-16 text-center bg-slate-50 rounded-[32px] border border-dashed border-slate-200">
          <p className="text-slate-400 font-bold text-sm">暂无消费历史记录</p>
        </div>
      ) : (
        <div className="grid gap-4 max-h-[420px] overflow-y-auto pr-1.5 custom-scrollbar">
          {txs.map(tx => {
            let statusBadge = null;
            if (tx.isPending) {
              statusBadge = (
                <span className="inline-flex items-center bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-black">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse mr-1.5"></span>
                  待审批
                </span>
              );
            } else if (tx.isApproved) {
              statusBadge = (
                <span className="inline-flex items-center bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-black">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5"></span>
                  已批准
                </span>
              );
            } else {
              statusBadge = (
                <span className="inline-flex items-center bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-black">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full mr-1.5"></span>
                  已拒绝
                </span>
              );
            }

            return (
              <div key={tx.id} className="bg-white border border-slate-100 p-5 rounded-[24px] shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-2xl font-black text-slate-900">{tx.amount}</span>
                      <span className="text-slate-400 font-bold text-sm">Wei / 元</span>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center text-xs text-slate-500 font-semibold">
                      <span className="bg-slate-100 px-2.5 py-1 rounded-lg text-slate-600">{tx.merchantType}</span>
                      <span>•</span>
                      <span className="text-slate-600">成员: {tx.wardName || `${tx.ward.slice(0, 6)}...${tx.ward.slice(-4)}`}</span>
                    </div>
                  </div>
                  <div>
                    {statusBadge}
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-50 text-[10px] text-slate-400 font-mono flex justify-between items-center">
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
