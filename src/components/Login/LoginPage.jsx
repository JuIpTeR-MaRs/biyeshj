import React, { useState, useEffect } from 'react';
import { Shield, Plus, User, ArrowRight, Banknote, Smartphone, Lock, Eye, EyeOff, Users, UserCheck } from 'lucide-react';
import { 
  createLocalBankAccount, 
  getAllLocalAccounts, 
  registerToLocalBank, 
  maskCardNumber,
  verifyLogin,
  findAccountByPhone
} from '../../utils/bankAccount';
import { toast } from 'react-toastify';
import { getContract, fundAccount } from '../../utils/contract';

export const LoginPage = ({ onLogin }) => {
  const [accounts, setAccounts] = useState([]);
  const [loginMode, setLoginMode] = useState('phone'); // 'phone', 'register', 'quick', 'admin'
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('ward'); // 'ward' or 'guardian'
  const [guardianPhone, setGuardianPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setAccounts(getAllLocalAccounts());
  }, []);

  const handlePhoneLogin = (e) => {
    e.preventDefault();
    if (!phone || !password) {
      toast.error("请输入手机号和密码");
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      const user = verifyLogin(phone, password);
      if (user) {
        registerToLocalBank(user);
        toast.success("安全认证成功");
        onLogin(user);
      } else {
        toast.error("验证失败：手机号或密码错误");
      }
      setIsLoading(false);
    }, 1000);
  };

  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (phone === 'admin' && password === 'admin123') {
      setIsLoading(true);
      setTimeout(() => {
        toast.success("管理员认证成功");
        onLogin({ role: 'admin', accountName: '超级管理员', address: 'admin' });
        setIsLoading(false);
      }, 800);
    } else {
      toast.error("验证失败：管理员账号或密码错误");
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!phone || !password) {
      toast.error("请填写完整注册信息");
      return;
    }
    
    if (role === 'ward' && !guardianPhone) {
      toast.error("被监护人必须指定一名监护人手机号");
      return;
    }

    setIsLoading(true);
    try {
      // 1. 创建本地账户
      const newAccount = createLocalBankAccount(phone, password);
      
      // 2. 如果是被监护人，尝试在链上发起请求
      if (role === 'ward') {
        const guardianAcc = findAccountByPhone(guardianPhone);
        if (!guardianAcc) {
          toast.error("未找到指定的监护人手机号，请确保监护人已注册");
          setIsLoading(false);
          return;
        }
        
        // 实际链上操作：发送绑定请求
        try {
          await fundAccount(newAccount.address);
          const contract = await getContract(newAccount.privateKey);
          const tx = await contract.requestGuardian(guardianAcc.address);
          toast.info("正在提交区块链绑定请求...");
          await tx.wait();
          toast.success(`已向监护人 ${guardianPhone} 发送绑定请求，请等待对方同意`);
        } catch (chainErr) {
          console.error("Chain Error:", chainErr);
          toast.error("区块链绑定请求失败，请检查网络");
        }
      }

      newAccount.role = role;
      registerToLocalBank(newAccount);
      toast.success("注册成功！");
      onLogin(newAccount);
    } catch (err) {
      toast.error("注册失败");
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = (account) => {
    registerToLocalBank(account);
    onLogin(account);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 overflow-hidden font-sans">
      {/* Background elements with smooth pulse animation */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/10 blur-[130px] rounded-full animate-pulse duration-[6000ms]"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 blur-[130px] rounded-full animate-pulse duration-[6000ms]" style={{ animationDelay: '2s' }}></div>

      <div className="relative w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 rounded-[40px] shadow-2xl p-8 md:p-10">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-tr from-indigo-600 to-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-4 hover:rotate-6 transition-transform duration-300">
              <Shield className="w-8 h-8 text-white animate-pulse" />
            </div>
            <h1 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-slate-100 to-slate-300 tracking-tight text-center">智能监护银行</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-1">Smart Guardianship Banking</p>
          </div>

          {/* Mode Tabs */}
          <div className="flex bg-slate-950/60 border border-slate-800/50 p-1 rounded-2xl mb-8">
            {['phone', 'register', 'quick', 'admin'].map((m) => (
              <button 
                key={m}
                onClick={() => setLoginMode(m)}
                className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${
                  loginMode === m 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {m === 'phone' ? '登录' : m === 'register' ? '注册' : m === 'quick' ? '快速切换' : '管理后台'}
              </button>
            ))}
          </div>

          <div className="min-h-[320px]">
            {loginMode === 'phone' && (
              <form onSubmit={handlePhoneLogin} className="space-y-4 animate-in slide-in-from-left-4 duration-300">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">手机号</label>
                  <div className="relative group">
                    <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors duration-300" />
                    <input 
                      type="text" placeholder="手机号" value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-slate-950/40 border border-slate-800/80 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 rounded-2xl py-3.5 pl-11 pr-4 text-slate-200 text-sm outline-none transition-all duration-300"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">密码</label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors duration-300" />
                    <input 
                      type={showPassword ? "text" : "password"} placeholder="密码" value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-slate-950/40 border border-slate-800/80 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 rounded-2xl py-3.5 pl-11 pr-11 text-slate-200 text-sm outline-none transition-all duration-300"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors duration-300">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button disabled={isLoading} className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:from-indigo-700 disabled:to-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-500/10 hover:shadow-indigo-500/20 transition-all duration-300 transform active:scale-[0.98] flex items-center justify-center space-x-2 mt-6">
                  {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <><span>进入系统</span><ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            )}

            {loginMode === 'register' && (
              <form onSubmit={handleRegister} className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <button 
                    type="button" 
                    onClick={() => setRole('ward')} 
                    className={`flex flex-col items-center justify-center p-2 rounded-2xl border transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] ${
                      role === 'ward' 
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-md shadow-emerald-500/5' 
                        : 'bg-slate-950/40 border-slate-800 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Users className="w-4 h-4 mb-1" /> <span className="text-[10px] font-black">被监护人</span>
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setRole('guardian')} 
                    className={`flex flex-col items-center justify-center p-2 rounded-2xl border transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] ${
                      role === 'guardian' 
                        ? 'bg-blue-500/10 border-blue-500 text-blue-400 shadow-md shadow-blue-500/5' 
                        : 'bg-slate-950/40 border-slate-800 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <UserCheck className="w-4 h-4 mb-1" /> <span className="text-[10px] font-black">监护人</span>
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setRole('merchant')} 
                    className={`flex flex-col items-center justify-center p-2 rounded-2xl border transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] ${
                      role === 'merchant' 
                        ? 'bg-amber-500/10 border-amber-500 text-amber-400 shadow-md shadow-amber-500/5' 
                        : 'bg-slate-950/40 border-slate-800 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Banknote className="w-4 h-4 mb-1" /> <span className="text-[10px] font-black">特约商户</span>
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="relative">
                    <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input type="text" placeholder="注册手机号" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-slate-950/40 border border-slate-800/80 focus:border-indigo-500/50 rounded-2xl py-3.5 pl-11 pr-4 text-slate-200 text-sm outline-none transition-all duration-300" />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input type="password" placeholder="设置密码" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-slate-950/40 border border-slate-800/80 focus:border-indigo-500/50 rounded-2xl py-3.5 pl-11 pr-4 text-slate-200 text-sm outline-none transition-all duration-300" />
                  </div>
                  {role === 'ward' && (
                    <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-300">
                      <label className="text-[10px] font-bold text-amber-500 uppercase tracking-widest px-1">需要监护人同意</label>
                      <div className="relative">
                        <UserCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500/50" />
                        <input type="text" placeholder="监护人手机号" value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} className="w-full bg-amber-500/5 border border-amber-500/20 rounded-2xl py-3.5 pl-11 pr-4 text-slate-200 text-sm outline-none focus:border-amber-500/50 transition-all duration-300" />
                      </div>
                    </div>
                  )}
                </div>

                <button disabled={isLoading} className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 transition-all duration-300 transform active:scale-[0.98] mt-4">
                  {isLoading ? '处理中...' : '完成注册并登录'}
                </button>
              </form>
            )}

            {loginMode === 'quick' && (
              <div className="space-y-3 animate-in slide-in-from-right-4 duration-300">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2">本地已知账户</p>
                <div className="max-h-60 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                  {accounts.map((acc, idx) => {
                    let glowColor = "hover:border-indigo-500/30 hover:shadow-indigo-500/5";
                    let badgeColor = "bg-slate-800 text-slate-300";
                    let badgeLabel = "成员";
                    
                    if (acc.role === 'guardian') {
                      glowColor = "hover:border-blue-500/30 hover:shadow-blue-500/5";
                      badgeColor = "bg-blue-500/10 border border-blue-500/20 text-blue-400";
                      badgeLabel = "监护人";
                    } else if (acc.role === 'merchant') {
                      glowColor = "hover:border-amber-500/30 hover:shadow-amber-500/5";
                      badgeColor = "bg-amber-500/10 border border-amber-500/20 text-amber-400";
                      badgeLabel = "商户";
                    } else if (acc.role === 'ward') {
                      glowColor = "hover:border-emerald-500/30 hover:shadow-emerald-500/5";
                      badgeColor = "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400";
                      badgeLabel = "被监护";
                    }
                    
                    return (
                      <button 
                        key={idx} 
                        onClick={() => handleQuickLogin(acc)} 
                        className={`w-full group flex items-center p-3.5 bg-slate-950/40 border border-slate-900 rounded-2xl transition-all duration-300 text-left hover:scale-[1.01] hover:bg-slate-900/30 ${glowColor}`}
                      >
                        <div className="w-9 h-9 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center mr-3 group-hover:bg-indigo-600/10 transition-colors duration-300">
                          <User className="w-4 h-4 text-slate-400 group-hover:text-indigo-400 transition-colors duration-300" />
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <div className="flex items-center space-x-1.5">
                            <p className="text-slate-200 font-bold text-xs truncate group-hover:text-white transition-colors">{acc.accountName}</p>
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${badgeColor}`}>
                              {badgeLabel}
                            </span>
                          </div>
                          <p className="text-slate-500 text-[10px] font-mono mt-0.5">{maskCardNumber(acc.cardNumber)}</p>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-white transition-all transform group-hover:translate-x-1" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {loginMode === 'admin' && (
              <form onSubmit={handleAdminLogin} className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                <div className="text-center mb-6">
                  <Shield className="w-12 h-12 text-purple-400 mx-auto mb-2 opacity-50 animate-pulse" />
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">系统管理中心入口</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">管理员账号</label>
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-purple-400 transition-colors duration-300" />
                    <input 
                      type="text" placeholder="请输入管理员账号" value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-slate-950/40 border border-slate-800/80 focus:border-purple-500/50 rounded-2xl py-3.5 pl-11 pr-4 text-slate-200 text-sm outline-none transition-all duration-300"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">管理员密码</label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-purple-400 transition-colors duration-300" />
                    <input 
                      type={showPassword ? "text" : "password"} placeholder="请输入管理员密码" value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-slate-950/40 border border-slate-800/80 focus:border-purple-500/50 rounded-2xl py-3.5 pl-11 pr-11 text-slate-200 text-sm outline-none transition-all duration-300"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button disabled={isLoading} className="w-full bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-700 hover:from-indigo-600 hover:via-purple-600 hover:to-indigo-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-purple-600/10 hover:shadow-purple-600/20 transition-all duration-300 transform active:scale-[0.98] flex items-center justify-center space-x-2 mt-6">
                  {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <><span>进入后台</span><Shield className="w-4 h-4" /></>}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
      `}} />
    </div>
  );
};
