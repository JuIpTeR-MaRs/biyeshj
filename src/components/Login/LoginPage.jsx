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
import { getContract } from '../../utils/contract';

export const LoginPage = ({ onLogin }) => {
  const [accounts, setAccounts] = useState([]);
  const [loginMode, setLoginMode] = useState('phone'); // 'phone', 'register', 'quick'
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A] overflow-hidden font-sans">
      {/* Background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/20 blur-[120px] rounded-full animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/20 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>

      <div className="relative w-full max-w-md p-8 animate-in fade-in zoom-in duration-700">
        <div className="bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[40px] shadow-2xl p-8 md:p-10">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-tr from-indigo-600 to-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-4">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight text-center">智能监护银行</h1>
          </div>

          {/* Mode Tabs */}
          <div className="flex bg-white/5 p-1 rounded-2xl mb-8">
            {['phone', 'register', 'quick'].map((m) => (
              <button 
                key={m}
                onClick={() => setLoginMode(m)}
                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${loginMode === m ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                {m === 'phone' ? '登录' : m === 'register' ? '注册' : '快速切换'}
              </button>
            ))}
          </div>

          <div className="min-h-[320px]">
            {loginMode === 'phone' && (
              <form onSubmit={handlePhoneLogin} className="space-y-4 animate-in slide-in-from-left-4 duration-300">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">手机号</label>
                  <div className="relative group">
                    <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                    <input 
                      type="text" placeholder="手机号" value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 focus:border-indigo-500/50 rounded-2xl py-3.5 pl-11 pr-4 text-white text-sm outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">密码</label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                    <input 
                      type={showPassword ? "text" : "password"} placeholder="密码" value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 focus:border-indigo-500/50 rounded-2xl py-3.5 pl-11 pr-11 text-white text-sm outline-none transition-all"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button disabled={isLoading} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center space-x-2 mt-6">
                  {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <><span>进入系统</span><ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            )}

            {loginMode === 'register' && (
              <form onSubmit={handleRegister} className="space-y-4 animate-in fade-in duration-300">
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <button type="button" onClick={() => setRole('ward')} className={`flex items-center justify-center space-x-2 p-3 rounded-2xl border transition-all ${role === 'ward' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-white/5 border-white/10 text-slate-500'}`}>
                    <Users className="w-4 h-4" /> <span className="text-xs font-bold">被监护人</span>
                  </button>
                  <button type="button" onClick={() => setRole('guardian')} className={`flex items-center justify-center space-x-2 p-3 rounded-2xl border transition-all ${role === 'guardian' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-white/5 border-white/10 text-slate-500'}`}>
                    <UserCheck className="w-4 h-4" /> <span className="text-xs font-bold">监护人</span>
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="relative">
                    <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input type="text" placeholder="注册手机号" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-11 pr-4 text-white text-sm outline-none" />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input type="password" placeholder="设置密码" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-11 pr-4 text-white text-sm outline-none" />
                  </div>
                  {role === 'ward' && (
                    <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-300">
                      <label className="text-[10px] font-bold text-amber-500 uppercase tracking-widest px-1">需要监护人同意</label>
                      <div className="relative">
                        <UserCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500/50" />
                        <input type="text" placeholder="监护人手机号" value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} className="w-full bg-amber-500/5 border border-amber-500/20 rounded-2xl py-3.5 pl-11 pr-4 text-white text-sm outline-none" />
                      </div>
                    </div>
                  )}
                </div>

                <button disabled={isLoading} className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg transition-all mt-4">
                  {isLoading ? '处理中...' : '完成注册并登录'}
                </button>
              </form>
            )}

            {loginMode === 'quick' && (
              <div className="space-y-3 animate-in slide-in-from-right-4 duration-300">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2">本地已知账户</p>
                <div className="max-h-60 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                  {accounts.map((acc, idx) => (
                    <button key={idx} onClick={() => handleQuickLogin(acc)} className="w-full group flex items-center p-3.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all text-left">
                      <div className="w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center mr-3 group-hover:bg-indigo-600/20">
                        <User className="w-4 h-4 text-slate-400 group-hover:text-indigo-400" />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-white font-bold text-xs truncate">{acc.accountName}</p>
                        <p className="text-slate-500 text-[10px] font-mono">{maskCardNumber(acc.cardNumber)}</p>
                      </div>
                      <ArrowRight className="w-3 h-3 text-slate-600 group-hover:text-white" />
                    </button>
                  ))}
                </div>
              </div>
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
