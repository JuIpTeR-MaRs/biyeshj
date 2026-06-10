import React from 'react';
import { LogOut, Shield, ShoppingBag, User, UserCheck } from 'lucide-react';
import { maskCardNumber, logoutLocalBank } from '../../utils/bankAccount';

export const Navbar = ({ currentUser, role, onLogout }) => {
  const handleLogoutAction = () => {
    logoutLocalBank();
    onLogout();
  };

  if (!currentUser) return null;

  // 根据角色设置图标、文字和主题色
  let roleLabel = "";
  let badgeClass = "";
  let logoGradient = "";
  let Icon = User;

  switch (role) {
    case 'admin':
      roleLabel = "超级管理员";
      badgeClass = "bg-purple-500/10 border border-purple-500/20 text-purple-400";
      logoGradient = "from-purple-600 to-indigo-600 shadow-purple-500/20";
      Icon = Shield;
      break;
    case 'merchant':
      roleLabel = "特约商户";
      badgeClass = "bg-amber-500/10 border border-amber-500/20 text-amber-400";
      logoGradient = "from-amber-500 to-orange-500 shadow-amber-500/20";
      Icon = ShoppingBag;
      break;
    case 'guardian':
      roleLabel = "🛡️ 监护人";
      badgeClass = "bg-blue-500/10 border border-blue-500/20 text-blue-400";
      logoGradient = "from-blue-600 to-indigo-600 shadow-blue-500/20";
      Icon = Shield;
      break;
    case 'ward':
    default:
      roleLabel = "👤 被监护人";
      badgeClass = "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400";
      logoGradient = "from-emerald-600 to-teal-600 shadow-emerald-500/20";
      Icon = User;
      break;
  }

  return (
    <div className="flex justify-between items-center p-6 bg-transparent">
      {/* 左侧：Logo 与标题 */}
      <div className="flex items-center space-x-3">
        <div className={`w-11 h-11 bg-gradient-to-tr ${logoGradient} rounded-xl flex items-center justify-center text-white shadow-lg hover:scale-[1.03] transition-transform duration-300`}>
          <Icon className="w-5.5 h-5.5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-slate-100 via-slate-200 to-slate-400 tracking-tight leading-none mb-0.5">
            智能监护银行
          </h1>
          <p className="text-[9px] text-slate-500 uppercase tracking-widest font-extrabold font-mono">
            Smart Guardianship Banking
          </p>
        </div>
      </div>
      
      {/* 右侧：用户卡片、角色标签与退出 */}
      <div className="flex items-center space-x-3">
        {/* 角色 Badge */}
        <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${badgeClass}`}>
          {roleLabel}
        </span>

        {/* 用户信息卡 */}
        <div className="hidden sm:flex items-center space-x-3 bg-slate-950/40 px-4 py-2 rounded-2xl border border-slate-800/80 animate-in fade-in slide-in-from-right-2 duration-300">
          <div className="w-8 h-8 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center shadow-sm">
            <User className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider leading-none mb-1">
              {currentUser.accountName || "已登录"}
            </span>
            <span className="text-xs font-mono text-slate-300 font-bold leading-none">
              {currentUser.cardNumber ? maskCardNumber(currentUser.cardNumber) : (currentUser.phone || currentUser.address || "")}
            </span>
          </div>
        </div>

        {/* 退出按钮 */}
        <button 
          onClick={handleLogoutAction}
          title="退出登录"
          className="p-3 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-2xl transition-all duration-300 active:scale-95 border border-transparent hover:border-red-500/20"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
