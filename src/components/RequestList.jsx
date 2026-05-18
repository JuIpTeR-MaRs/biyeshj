import React from 'react';
import { UserCheck, Check, X } from 'lucide-react';

export const RequestList = ({ requests, onAction, loading }) => {
  if (requests.length === 0) return null;

  return (
    <div className="mb-10 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="flex items-center space-x-2 mb-4 text-indigo-600 px-1">
        <UserCheck className="w-5 h-5" />
        <h3 className="text-lg font-black tracking-tight">收到新的监护申请</h3>
      </div>
      
      <div className="space-y-3">
        {requests.map((req, idx) => (
          <div key={idx} className="bg-gradient-to-r from-indigo-50/50 to-white border border-indigo-100 rounded-[24px] p-5 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-50">
                <UserCheck className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">{req.accountName} 申请您作为监护人</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">手机: {req.phone}</p>
              </div>
            </div>
            
            <div className="flex space-x-2">
              <button
                disabled={loading}
                onClick={() => onAction(req.address, true)}
                className="p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
                title="同意申请"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                disabled={loading}
                onClick={() => onAction(req.address, false)}
                className="p-3 bg-white hover:bg-red-50 text-slate-400 hover:text-red-500 border border-slate-200 rounded-xl transition-all disabled:opacity-50"
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
