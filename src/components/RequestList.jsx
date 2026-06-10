import React from 'react';
import { UserCheck, Check, X } from 'lucide-react';

export const RequestList = ({ requests, onAction, loading }) => {
  if (requests.length === 0) return null;

  return (
    <div className="mb-10 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="flex items-center space-x-2 mb-4 text-blue-400 px-1">
        <UserCheck className="w-5 h-5" />
        <h3 className="text-lg font-black tracking-tight text-white">收到新的监护申请</h3>
      </div>
      
      <div className="space-y-3">
        {requests.map((req, idx) => (
          <div key={idx} className="bg-slate-950/40 border border-slate-850 rounded-[24px] p-5 flex items-center justify-between shadow-lg hover:border-blue-500/20 transition-all duration-300">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center text-blue-400 shadow-inner">
                <UserCheck className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <p className="font-bold text-slate-200 text-sm">{req.accountName} 申请您作为监护人</p>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">手机: {req.phone}</p>
              </div>
            </div>
            
            <div className="flex space-x-2">
              <button
                disabled={loading}
                onClick={() => onAction(req.address, true)}
                className="p-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl transition-all duration-300 shadow-lg shadow-blue-600/10 disabled:opacity-50 active:scale-95 hover:scale-[1.02]"
                title="同意申请"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                disabled={loading}
                onClick={() => onAction(req.address, false)}
                className="p-3 bg-slate-950 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-slate-850 hover:border-rose-500/20 rounded-xl transition-all duration-300 disabled:opacity-50 active:scale-95"
                title="拒绝申请"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
