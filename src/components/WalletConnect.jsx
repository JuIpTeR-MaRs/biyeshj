import React from 'react';
import { createLocalBankAccount, registerToLocalBank, maskCardNumber } from '../utils/bankAccount';

export const WalletConnect = ({ account, onConnect }) => {
  const handleBankLogin = () => {
    const newAccount = createLocalBankAccount();
    registerToLocalBank(newAccount);
    onConnect(newAccount);
  };

  const handleLogout = () => {
    localStorage.removeItem('bank_current_user');
    window.location.reload(); // 刷新页面清除内存状态
  };

  const currentUser = JSON.parse(localStorage.getItem('bank_current_user') || '{}');

  return (
    <div className="flex justify-between items-center p-6 bg-white border-b border-gray-100 rounded-t-3xl">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-xl">B</div>
        <h1 className="text-xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-blue-600">
          智能银行后台
        </h1>
      </div>
      {account ? (
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-indigo-50 px-4 py-2 rounded-2xl border border-indigo-100">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-bold text-indigo-900">
              {maskCardNumber(currentUser.cardNumber || "")}
            </span>
          </div>
          <button 
            onClick={handleLogout}
            title="切换账户"
            className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
          >
            <span className="text-xl">🔄</span>
          </button>
        </div>
      ) : (
        <button 
          onClick={handleBankLogin}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-200"
        >
          登录本地仿真银行
        </button>
      )}
    </div>
  );
};
