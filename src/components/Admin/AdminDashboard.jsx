import React, { useState, useEffect } from 'react';
import { Shield, Users, Activity, Link as LinkIcon, Sliders, Database, ArrowRight } from 'lucide-react';
import { toast } from 'react-toastify';
import { AiAnalysisCard } from '../AiAnalysis/AiAnalysisCard';
import { Navbar } from '../layout/Navbar';

export const AdminDashboard = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [dbData, setDbData] = useState({ transactions: [], bindings: [], thresholds: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch local users (excluding passwords)
    const localAccounts = JSON.parse(localStorage.getItem('bank_all_accounts') || '[]');
    const safeUsers = localAccounts.map(({ password, ...rest }) => rest);
    setUsers(safeUsers);

    // Fetch DB data
    const fetchDbData = async () => {
      try {
        const res = await fetch('/api/admin/all-data');
        const data = await res.json();
        if (data.success) {
          setDbData({
            transactions: data.transactions || [],
            bindings: data.bindings || [],
            thresholds: data.thresholds || []
          });
        } else {
          toast.error("拉取后台数据库失败");
        }
      } catch (err) {
        console.error(err);
        toast.error("网络错误，无法连接到后台服务器");
      } finally {
        setLoading(false);
      }
    };
    fetchDbData();
  }, []);

  const tabs = [
    { id: 'users', label: '注册用户 (安全视图)', icon: Users },
    { id: 'transactions', label: '交易流水 (区块链)', icon: Activity },
    { id: 'bindings', label: '监护关系 (全网)', icon: LinkIcon },
    { id: 'thresholds', label: '消费阈值配置', icon: Sliders }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-purple-500/30 font-sans relative overflow-hidden">
      {/* Background glowing widgets */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] blur-[130px] rounded-full pointer-events-none duration-[6000ms] animate-pulse bg-purple-600/10"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] blur-[130px] rounded-full pointer-events-none duration-[6000ms] animate-pulse bg-indigo-600/10" style={{ animationDelay: '2s' }}></div>

      <div className="max-w-6xl mx-auto py-10 px-6 relative z-10 space-y-8 animate-in fade-in zoom-in-95 duration-500">
        {/* Navigation / Navbar Wrapper */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 rounded-[32px] shadow-2xl overflow-hidden">
          <Navbar currentUser={{ role: 'admin', accountName: '超级管理员', address: 'admin' }} role="admin" onLogout={onLogout} />
        </div>

        {/* Sub-header indicators */}
        <div className="flex items-center justify-between bg-slate-900/20 border border-slate-800/60 rounded-2xl px-5 py-3 shadow-inner">
          <div className="flex items-center space-x-3">
            <div className="px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest bg-purple-500/10 border border-purple-500/20 text-purple-400 shadow-sm shadow-purple-500/5">
              🛡️ 超级管理员视角
            </div>
          </div>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-sans">Blockchain Management Console</p>
        </div>

        {/* Dashboard Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-2">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center space-x-3 px-5 py-4 rounded-2xl transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] ${
                    isActive 
                      ? 'bg-purple-500/10 border border-purple-500/20 text-purple-400 shadow-lg shadow-purple-500/5' 
                      : 'bg-transparent border border-transparent text-slate-400 hover:bg-slate-900/30 hover:text-slate-200'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-purple-400' : 'text-slate-500'}`} />
                  <span className="font-bold text-sm">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Main Panel */}
          <div className="lg:col-span-3">
            <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 rounded-[32px] p-6 min-h-[600px] shadow-2xl overflow-hidden relative">
              {loading && (
                <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm z-10 flex items-center justify-center">
                  <div className="w-10 h-10 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
                </div>
              )}

              {/* Users Tab */}
              {activeTab === 'users' && (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-white">本地注册用户</h2>
                    <span className="px-3 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full text-xs font-bold">
                      安全视图: 密码已过滤
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-slate-800/50">
                    <table className="w-full text-left text-sm text-slate-300">
                      <thead className="bg-slate-950/80 border-b border-slate-800/60 text-xs uppercase font-black text-slate-400">
                        <tr>
                          <th className="px-6 py-4">姓名</th>
                          <th className="px-6 py-4">手机号</th>
                          <th className="px-6 py-4">角色</th>
                          <th className="px-6 py-4">钱包地址</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40 bg-slate-900/10">
                        {users.map((u, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/30 transition-colors duration-200">
                            <td className="px-6 py-4 font-bold text-white">{u.accountName}</td>
                            <td className="px-6 py-4 font-mono">{u.phone}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                                u.role === 'guardian' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                              }`}>
                                {u.role === 'guardian' ? '监护人' : '被监护人'}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-mono text-xs text-slate-500">{u.address}</td>
                          </tr>
                        ))}
                        {users.length === 0 && (
                          <tr><td colSpan="4" className="text-center py-8 text-slate-500">暂无用户数据</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Transactions Tab */}
              {activeTab === 'transactions' && (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                  <h2 className="text-xl font-bold text-white mb-6">全网交易流水</h2>
                  
                  <AiAnalysisCard txs={dbData.transactions} role="admin" />

                  <div className="overflow-x-auto rounded-2xl border border-slate-800/50 mt-6">
                    <table className="w-full text-left text-sm text-slate-300">
                      <thead className="bg-slate-950/80 border-b border-slate-800/60 text-xs uppercase font-black text-slate-400">
                        <tr>
                          <th className="px-6 py-4">ID</th>
                          <th className="px-6 py-4">被监护人地址</th>
                          <th className="px-6 py-4">金额</th>
                          <th className="px-6 py-4">类别</th>
                          <th className="px-6 py-4">时间</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40 bg-slate-900/10">
                        {dbData.transactions.map((t, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/30 transition-colors duration-200">
                            <td className="px-6 py-4 font-mono text-xs text-slate-500">#{t.id}</td>
                            <td className="px-6 py-4 font-mono text-xs">{t.ward_address}</td>
                            <td className="px-6 py-4 font-bold text-amber-400">{t.amount} 元</td>
                            <td className="px-6 py-4">
                              <span className="px-2.5 py-1 bg-slate-800/50 border border-slate-700 rounded text-[10px] text-slate-300">
                                {t.merchant_type}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-400">
                              {new Date(t.created_at).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                        {dbData.transactions.length === 0 && (
                          <tr><td colSpan="5" className="text-center py-8 text-slate-500">暂无交易记录</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Bindings Tab */}
              {activeTab === 'bindings' && (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                  <h2 className="text-xl font-bold text-white mb-6">监护关系绑定情况</h2>
                  <div className="overflow-x-auto rounded-2xl border border-slate-800/50">
                    <table className="w-full text-left text-sm text-slate-300">
                      <thead className="bg-slate-950/80 border-b border-slate-800/60 text-xs uppercase font-black text-slate-400">
                        <tr>
                          <th className="px-6 py-4">ID</th>
                          <th className="px-6 py-4">被监护人地址</th>
                          <th className="px-6 py-4">监护人地址</th>
                          <th className="px-6 py-4">绑定时间</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40 bg-slate-900/10">
                        {dbData.bindings.map((b, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/30 transition-colors duration-200">
                            <td className="px-6 py-4 font-mono text-xs text-slate-500">#{b.id}</td>
                            <td className="px-6 py-4 font-mono text-xs text-emerald-400">{b.ward_address}</td>
                            <td className="px-6 py-4 font-mono text-xs text-blue-400">{b.guardian_address}</td>
                            <td className="px-6 py-4 text-xs text-slate-400">
                              {new Date(b.created_at).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                        {dbData.bindings.length === 0 && (
                          <tr><td colSpan="4" className="text-center py-8 text-slate-500">暂无绑定关系</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Thresholds Tab */}
              {activeTab === 'thresholds' && (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                  <h2 className="text-xl font-bold text-white mb-6">用户消费阈值配置</h2>
                  <div className="overflow-x-auto rounded-2xl border border-slate-800/50">
                    <table className="w-full text-left text-sm text-slate-300">
                      <thead className="bg-slate-950/80 border-b border-slate-800/60 text-xs uppercase font-black text-slate-400">
                        <tr>
                          <th className="px-6 py-4">被监护人地址</th>
                          <th className="px-6 py-4">当前阈值 (元)</th>
                          <th className="px-6 py-4">最后更新时间</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40 bg-slate-900/10">
                        {dbData.thresholds.map((t, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/30 transition-colors duration-200">
                            <td className="px-6 py-4 font-mono text-xs text-emerald-400">{t.ward_address}</td>
                            <td className="px-6 py-4 font-bold text-purple-400">{t.threshold_amount}</td>
                            <td className="px-6 py-4 text-xs text-slate-400">
                              {new Date(t.updated_at).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                        {dbData.thresholds.length === 0 && (
                          <tr><td colSpan="3" className="text-center py-8 text-slate-500">暂无阈值配置</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
