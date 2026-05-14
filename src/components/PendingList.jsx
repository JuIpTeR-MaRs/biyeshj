import React from 'react';

export const PendingList = ({ txs, onAction, loading }) => (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-bold text-gray-800 flex items-center">
        待处理预警
        <span className="ml-3 bg-orange-100 text-orange-600 px-3 py-0.5 rounded-full text-sm">
          {txs.length}
        </span>
      </h2>
    </div>
    
    {txs.length === 0 ? (
      <div className="py-16 text-center bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
        <p className="text-gray-400 font-medium">暂无待处理交易，一切安全</p>
      </div>
    ) : (
      <div className="grid gap-4">
        {txs.map(tx => (
          <div key={tx.id} className="bg-white border border-gray-100 p-5 rounded-3xl shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="text-2xl font-black text-gray-900">{tx.amount}</span>
                  <span className="text-gray-400 font-bold text-sm">Wei</span>
                </div>
                <div className="flex items-center space-x-2 text-sm text-gray-500 font-medium">
                  <span className="bg-gray-100 px-2 py-0.5 rounded-md">{tx.merchantType}</span>
                  <span>•</span>
                  <span>被监护人: {tx.ward.slice(0, 8)}...</span>
                </div>
              </div>
              <div className="flex space-x-2">
                <button 
                  disabled={loading}
                  onClick={() => onAction(tx.id, true)}
                  className="bg-green-500 hover:bg-green-600 text-white w-12 h-12 rounded-2xl flex items-center justify-center transition-colors disabled:opacity-50 shadow-lg shadow-green-100"
                  title="批准"
                >
                  ✓
                </button>
                <button 
                  disabled={loading}
                  onClick={() => onAction(tx.id, false)}
                  className="bg-red-500 hover:bg-red-600 text-white w-12 h-12 rounded-2xl flex items-center justify-center transition-colors disabled:opacity-50 shadow-lg shadow-red-100"
                  title="拒绝"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-50 text-[10px] text-gray-300 uppercase tracking-widest font-bold">
              Transaction ID: {tx.id.toString()} • {new Date(Number(tx.timestamp)*1000).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);
