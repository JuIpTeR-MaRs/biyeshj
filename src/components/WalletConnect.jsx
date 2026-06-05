import { LogOut, User as UserIcon } from 'lucide-react';
import { maskCardNumber, logoutLocalBank, getLocalBankUser } from '../utils/bankAccount';

export const WalletConnect = ({ account, onLogout }) => {
  const handleLogoutAction = () => {
    logoutLocalBank();
    onLogout();
  };

  const currentUser = getLocalBankUser() || {};

  return (
    <div className="flex justify-between items-center p-6 bg-white border-b border-gray-100 rounded-t-[40px]">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-gradient-to-tr from-indigo-600 to-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
          <span className="font-black text-lg">B</span>
        </div>
        <h1 className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-blue-600">
          消费监测系统
        </h1>
      </div>
      
      {account && (
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-3 bg-slate-50 px-4 py-2 rounded-2xl border border-slate-100">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
              <UserIcon className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider leading-none mb-1">
                {currentUser.accountName || "已连接账户"}
              </span>
              <span className="text-sm font-bold text-slate-700 leading-none">
                {maskCardNumber(currentUser.cardNumber || "")}
              </span>
            </div>
          </div>
          <button 
            onClick={handleLogoutAction}
            title="退出登录"
            className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all duration-300"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};
