import React from 'react';
import { X, CheckCircle, AlertTriangle, XCircle, Bell, Trash2, Shield, Info } from 'lucide-react';

export const MessageCenter = ({ isOpen, onClose, messages, onMarkAllRead, onClearMessages }) => {
  if (!isOpen) return null;

  const getMessageIcon = (type) => {
    switch (type) {
      case 'approved':
        return <CheckCircle className="w-5 h-5 text-emerald-400" />;
      case 'rejected':
        return <XCircle className="w-5 h-5 text-rose-400" />;
      case 'pending':
        return <AlertTriangle className="w-5 h-5 text-amber-400" />;
      case 'system':
      default:
        return <Info className="w-5 h-5 text-blue-400" />;
    }
  };

  const getMessageBg = (type) => {
    switch (type) {
      case 'approved':
        return 'bg-emerald-500/10 border-emerald-500/20';
      case 'rejected':
        return 'bg-rose-500/10 border-rose-500/20';
      case 'pending':
        return 'bg-amber-500/10 border-amber-500/20';
      case 'system':
      default:
        return 'bg-blue-500/10 border-blue-500/20';
    }
  };

  const formatTime = (isoString) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return '刚刚';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} 分钟前`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} 小时前`;
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  };

  return (
    <>
      {/* 遮罩层 */}
      <div 
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />

      {/* 右侧抽屉面板 */}
      <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-slate-900 border-l border-slate-700/50 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center space-x-2">
            <Bell className="w-5 h-5 text-slate-300" />
            <h2 className="text-lg font-bold text-white tracking-wide">消息中心</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800/50 bg-slate-900/30 text-xs">
          <button 
            onClick={onMarkAllRead}
            className="text-slate-400 hover:text-blue-400 transition-colors font-medium"
          >
            全部标为已读
          </button>
          <button 
            onClick={onClearMessages}
            className="flex items-center space-x-1 text-slate-500 hover:text-rose-400 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>清空</span>
          </button>
        </div>

        {/* 消息列表区域 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-500 space-y-3">
              <Bell className="w-10 h-10 opacity-20" />
              <p className="text-sm">暂无新消息</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`p-4 rounded-2xl border transition-all ${getMessageBg(msg.type)} ${!msg.read ? 'shadow-lg ring-1 ring-white/5' : 'opacity-70'}`}
              >
                <div className="flex items-start space-x-3">
                  <div className="mt-0.5">
                    {getMessageIcon(msg.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1">
                      <h4 className={`text-sm font-bold ${!msg.read ? 'text-white' : 'text-slate-300'}`}>
                        {msg.title}
                      </h4>
                      <span className="text-[10px] text-slate-500 whitespace-nowrap ml-2">
                        {formatTime(msg.time)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {msg.content}
                    </p>
                  </div>
                  {!msg.read && (
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
};
