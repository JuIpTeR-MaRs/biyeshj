import React, { useState, useEffect } from 'react';
import { Shield, Plus, User, ArrowRight, Banknote, Smartphone, Lock, Eye, EyeOff, Settings, Globe } from 'lucide-react';
import { 
  createLocalBankAccount, 
  getAllLocalAccounts, 
  registerToLocalBank, 
  maskCardNumber,
  verifyLogin,
} from '../../utils/bankAccount';
import { toast } from 'react-toastify';
import { getApiUrl, getHostIp, isNative } from '../../utils/api';
import { clearApiSession, loginAdminApi } from '../../utils/authenticatedFetch';

export const LoginPage = ({ onLogin }) => {
  const [accounts, setAccounts] = useState([]);
  const [loginMode, setLoginMode] = useState('phone'); // 'phone', 'register', 'quick', 'admin'
  const [phone, setPhone] = useState('');
  const [accountName, setAccountName] = useState('');
  const [password, setPassword] = useState('');
  const [adminPhone, setAdminPhone] = useState('13800138000');
  const [smsCode, setSmsCode] = useState('');
  const [mockSmsCode, setMockSmsCode] = useState('');
  const [role, setRole] = useState('user'); // 新注册账户先是普通用户，关系建立后动态判定
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showIpModal, setShowIpModal] = useState(false);
  const [customHostIp, setCustomHostIp] = useState(() => getHostIp());

  const handleSaveIp = (ipToSave) => {
    const target = ipToSave || customHostIp;
    if (!target) return;
    localStorage.setItem('SERVER_HOST_IP', target);
    toast.success(`已切换服务通信 IP: ${target}，正在刷新...`);
    setTimeout(() => {
      window.location.reload();
    }, 600);
  };

  useEffect(() => {
    setAccounts(getAllLocalAccounts());
  }, []);

  const handlePhoneLogin = async (e) => {
    e.preventDefault();
    if (!phone || !password) {
      toast.error("请输入账号和密码");
      return;
    }

    setIsLoading(true);
    setTimeout(async () => {
      if (phone === 'admin') {
        try {
          await loginAdminApi(password, adminPhone, smsCode);
        } catch (error) {
          toast.error(error.message);
          setIsLoading(false);
          return;
        }
        toast.success("管理员认证成功");
        onLogin({ role: 'admin', accountName: '超级管理员', address: 'admin' });
      } else {
        const user = verifyLogin(phone, password);
        if (user) {
          clearApiSession();
          registerToLocalBank(user);
          toast.success("安全认证成功");
          onLogin(user);
        } else {
          toast.error("验证失败：手机号或密码错误");
        }
      }
      setIsLoading(false);
    }, 1000);
  };

  const handleSendAdminSms = async () => {
    try {
      const response = await fetch(getApiUrl('/api/auth/admin/sms'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: adminPhone })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '验证码发送失败');
      setMockSmsCode(data.mockCode || '');
      toast.success('模拟短信验证码已发送；请查看下方演示码或后端控制台');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!phone || !password || !accountName.trim()) {
      toast.error("请填写完整注册信息");
      return;
    }
    
    setIsLoading(true);
    try {
      // 1. 创建本地账户
      const newAccount = createLocalBankAccount(phone, password, accountName);

      newAccount.role = role;
      clearApiSession();
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
    const unlocked = verifyLogin(account.phone, "123");
    if (!unlocked) {
      toast.error("快捷账户解锁失败");
      return;
    }
    clearApiSession();
    registerToLocalBank(unlocked);
    onLogin(unlocked);
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

          {/* Server Communication IP Settings Button & Modal */}
          <div className="flex justify-between items-center bg-slate-950/40 border border-slate-800/60 rounded-xl px-3 py-1.5 mb-5">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[10px] text-slate-400 font-mono">通信节点: {getHostIp()}</span>
            </div>
            <button 
              type="button"
              onClick={() => setShowIpModal(!showIpModal)} 
              className="text-slate-400 hover:text-indigo-400 text-[10px] font-bold flex items-center space-x-1 transition-colors px-2 py-0.5 rounded hover:bg-slate-800/60"
            >
              <Settings className="w-3 h-3" />
              <span>切换IP</span>
            </button>
          </div>

          {showIpModal && (
            <div className="bg-slate-950/90 border border-indigo-500/30 rounded-2xl p-4 mb-6 space-y-3 animate-in fade-in zoom-in-95 duration-200 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">配置后台通信 IP</span>
                <span className="text-[10px] text-slate-400">真机请填局域网 IP</span>
              </div>
              <input 
                type="text" 
                placeholder="例如: 10.0.2.2 或 192.168.x.x" 
                value={customHostIp} 
                onChange={(e) => setCustomHostIp(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none focus:border-indigo-500 font-mono"
              />
              <div className="flex space-x-2">
                <button 
                  type="button" 
                  onClick={() => handleSaveIp("10.0.2.2")}
                  className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-lg transition"
                >
                  模拟器 (10.0.2.2)
                </button>
                <button 
                  type="button" 
                  onClick={() => handleSaveIp("127.0.0.1")}
                  className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-lg transition"
                >
                  本机 (127.0.0.1)
                </button>
                <button 
                  type="button" 
                  onClick={() => handleSaveIp()}
                  className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded-lg transition"
                >
                  保存
                </button>
              </div>
            </div>
          )}

          {/* Mode Tabs */}
          <div className="flex bg-slate-950/60 border border-slate-800/50 p-1 rounded-2xl mb-8">
            {['phone', 'register', 'quick'].map((m) => (
              <button 
                key={m}
                onClick={() => setLoginMode(m)}
                className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${
                  loginMode === m 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {m === 'phone' ? '登录' : m === 'register' ? '注册' : '快速切换'}
              </button>
            ))}
          </div>

          <div className="min-h-[320px]">
            {loginMode === 'phone' && (
              <form onSubmit={handlePhoneLogin} className="space-y-4 animate-in slide-in-from-left-4 duration-300">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">账号 / 手机号</label>
                  <div className="relative group">
                    <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors duration-300" />
                    <input 
                      type="text" placeholder="账号 / 手机号" value={phone}
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
                {phone === 'admin' && (
                  <div className="space-y-3 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-3">
                    <p className="text-xs font-bold text-indigo-300">管理员二次验证（模拟短信）</p>
                    <input type="tel" placeholder="管理员手机号" value={adminPhone} onChange={(e) => setAdminPhone(e.target.value)} className="w-full bg-slate-950/40 border border-slate-800/80 rounded-xl py-2.5 px-3 text-slate-200 text-sm outline-none" />
                    <div className="flex gap-2">
                      <input type="text" inputMode="numeric" maxLength={6} placeholder="6 位验证码" value={smsCode} onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, ''))} className="min-w-0 flex-1 bg-slate-950/40 border border-slate-800/80 rounded-xl py-2.5 px-3 text-slate-200 text-sm outline-none" />
                      <button type="button" onClick={handleSendAdminSms} className="shrink-0 rounded-xl border border-indigo-500/40 px-3 text-xs font-bold text-indigo-300 hover:bg-indigo-500/10">获取验证码</button>
                    </div>
                    {mockSmsCode && <p className="text-xs text-amber-300">演示验证码：{mockSmsCode}（开发环境可见）</p>}
                  </div>
                )}
                <button disabled={isLoading} className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:from-indigo-700 disabled:to-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-500/10 hover:shadow-indigo-500/20 transition-all duration-300 transform active:scale-[0.98] flex items-center justify-center space-x-2 mt-6">
                  {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <><span>进入系统</span><ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            )}

            {loginMode === 'register' && (
              <form onSubmit={handleRegister} className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                <div className="flex justify-end mb-2">
                  <button 
                    type="button" 
                    onClick={() => setRole('merchant')} 
                    className={`flex items-center space-x-2 px-3 py-2 rounded-xl border transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] ${
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
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      placeholder="姓名 / 用户昵称"
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      maxLength={30}
                      className="w-full bg-slate-950/40 border border-slate-800/80 focus:border-indigo-500/50 rounded-2xl py-3.5 pl-11 pr-4 text-slate-200 text-sm outline-none transition-all duration-300"
                    />
                  </div>
                  <div className="relative">
                    <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input type="text" placeholder="注册手机号" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-slate-950/40 border border-slate-800/80 focus:border-indigo-500/50 rounded-2xl py-3.5 pl-11 pr-4 text-slate-200 text-sm outline-none transition-all duration-300" />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input type="password" placeholder="设置密码" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-slate-950/40 border border-slate-800/80 focus:border-indigo-500/50 rounded-2xl py-3.5 pl-11 pr-4 text-slate-200 text-sm outline-none transition-all duration-300" />
                  </div>
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
