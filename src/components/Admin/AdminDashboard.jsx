import React, { useState, useEffect } from 'react';
import { Shield, Users, Activity, Link as LinkIcon, Sliders, Database, ArrowRight, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { toast } from 'react-toastify';
import { AiAnalysisCard } from '../AiAnalysis/AiAnalysisCard';
import { Navbar } from '../layout/Navbar';
import { getContract } from '../../utils/contract';

export const AdminDashboard = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [dbData, setDbData] = useState({ transactions: [], bindings: [], thresholds: [] });
  const [loading, setLoading] = useState(true);
  const [freezingUser, setFreezingUser] = useState(null);

  const [txFilter, setTxFilter] = useState('');
  const [txPage, setTxPage] = useState(1);
  const txsPerPage = 10;

  useEffect(() => {
    setTxPage(1);
  }, [txFilter]);

  const filteredTxs = dbData.transactions
    .filter(t => {
      const term = txFilter.toLowerCase().trim();
      if (!term) return true;
      return (
        t.id.toString().includes(term) ||
        (t.ward_address && t.ward_address.toLowerCase().includes(term)) ||
        (t.merchant_type && t.merchant_type.toLowerCase().includes(term)) ||
        (t.amount && t.amount.toString().includes(term))
      );
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const totalPages = Math.ceil(filteredTxs.length / txsPerPage);
  const displayedTxs = filteredTxs.slice((txPage - 1) * txsPerPage, txPage * txsPerPage);

  useEffect(() => {
    // Fetch local users (excluding passwords)
    const localAccounts = JSON.parse(localStorage.getItem('bank_all_accounts') || '[]');
    const safeUsers = localAccounts.map(({ password, ...rest }) => rest);
    setUsers(safeUsers);

    const fetchUsersFrozenStatus = async () => {
      try {
        const contract = await getContract();
        const usersWithFrozen = await Promise.all(safeUsers.map(async u => {
          let frozen = false;
          try {
            frozen = await contract.isFrozen(u.address);
          } catch (e) {
            console.error("Error reading frozen state for", u.address, e);
          }
          return { ...u, isFrozen: frozen };
        }));
        setUsers(usersWithFrozen);
      } catch (err) {
        console.error(err);
      }
    };
    fetchUsersFrozenStatus();

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

  const handleToggleFreeze = async (userAddress, currentFrozen) => {
    setFreezingUser(userAddress);
    try {
      const contract = await getContract();
      const tx = await contract.setFreezeAccount(userAddress, !currentFrozen);
      toast.info(`正在提交${!currentFrozen ? '冻结' : '解冻'}该账户的交易...`);
      await tx.wait();
      toast.success(`${!currentFrozen ? '已成功冻结' : '已成功解冻'}该账户`);
      
      // Update local state
      setUsers(prev => prev.map(u => u.address === userAddress ? { ...u, isFrozen: !currentFrozen } : u));
    } catch (err) {
      console.error(err);
      toast.error(err.reason || `${!currentFrozen ? '冻结' : '解冻'}账户失败`);
    } finally {
      setFreezingUser(null);
    }
  };

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
                          <th className="px-6 py-4 whitespace-nowrap">姓名</th>
                          <th className="px-6 py-4 whitespace-nowrap">手机号</th>
                          <th className="px-6 py-4 whitespace-nowrap">角色</th>
                          <th className="px-6 py-4 whitespace-nowrap">钱包地址</th>
                          <th className="px-6 py-4 whitespace-nowrap">账户状态</th>
                          <th className="px-6 py-4 whitespace-nowrap">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40 bg-slate-900/10">
                        {users.map((u, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/30 transition-colors duration-200">
                            <td className="px-6 py-4 font-bold text-white whitespace-nowrap">{u.accountName}</td>
                            <td className="px-6 py-4 font-mono whitespace-nowrap">{u.phone}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-block whitespace-nowrap px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                                u.role === 'guardian' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                              }`}>
                                {u.role === 'guardian' ? '监护人' : '被监护人'}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-mono text-xs text-slate-500 whitespace-nowrap">{u.address}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded text-[10px] font-bold border ${
                                u.isFrozen 
                                  ? 'bg-red-500/10 border-red-500/20 text-red-400 shadow-sm shadow-red-500/5' 
                                  : 'bg-green-500/10 border-green-500/20 text-green-400 shadow-sm shadow-green-500/5'
                              }`}>
                                {u.isFrozen ? '已冻结' : '正常'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <button
                                disabled={freezingUser === u.address}
                                onClick={() => handleToggleFreeze(u.address, u.isFrozen)}
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${
                                  u.isFrozen
                                    ? 'bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500/20 hover:scale-[1.02] active:scale-[0.98]'
                                    : 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20 hover:scale-[1.02] active:scale-[0.98]'
                                }`}
                              >
                                {freezingUser === u.address ? (
                                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                  u.isFrozen ? '解冻' : '冻结'
                                )}
                              </button>
                            </td>
                          </tr>
                        ))}
                        {users.length === 0 && (
                          <tr><td colSpan="6" className="text-center py-8 text-slate-500">暂无用户数据</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Transactions Tab */}
              {activeTab === 'transactions' && (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
                    <h2 className="text-xl font-bold text-white">全网交易流水</h2>
                    <div className="relative w-full sm:w-72">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                      <input
                        type="text"
                        placeholder="搜索ID、地址、类别、金额..."
                        value={txFilter}
                        onChange={(e) => setTxFilter(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-slate-950/60 border border-slate-800/80 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-colors"
                      />
                    </div>
                  </div>
                  
                  <AiAnalysisCard txs={dbData.transactions} role="admin" />

                  <div className="overflow-x-auto rounded-2xl border border-slate-800/50 mt-6">
                    <table className="w-full text-left text-sm text-slate-300">
                      <thead className="bg-slate-950/80 border-b border-slate-800/60 text-xs uppercase font-black text-slate-400">
                        <tr>
                          <th className="px-6 py-4 whitespace-nowrap">ID</th>
                          <th className="px-6 py-4 whitespace-nowrap">被监护人地址</th>
                          <th className="px-6 py-4 whitespace-nowrap">金额</th>
                          <th className="px-6 py-4 whitespace-nowrap">类别</th>
                          <th className="px-6 py-4 whitespace-nowrap">时间</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40 bg-slate-900/10">
                        {displayedTxs.map((t, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/30 transition-colors duration-200">
                            <td className="px-6 py-4 font-mono text-xs text-slate-500 whitespace-nowrap">#{t.id}</td>
                            <td className="px-6 py-4 font-mono text-xs whitespace-nowrap">{t.ward_address}</td>
                            <td className="px-6 py-4 font-bold text-amber-400 whitespace-nowrap">{t.amount} 元</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="inline-block whitespace-nowrap px-2.5 py-1 bg-slate-800/50 border border-slate-700 rounded text-[10px] text-slate-300">
                                {t.merchant_type}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">
                              {new Date(t.created_at).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                        {filteredTxs.length === 0 && (
                          <tr><td colSpan="5" className="text-center py-8 text-slate-500">暂无交易记录</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 px-2">
                      <div className="text-xs text-slate-400">
                        显示第 <span className="text-slate-200 font-bold">{(txPage - 1) * txsPerPage + 1}</span> 至 <span className="text-slate-200 font-bold">{Math.min(txPage * txsPerPage, filteredTxs.length)}</span> 条记录，共 <span className="text-slate-200 font-bold">{filteredTxs.length}</span> 条
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <button
                          disabled={txPage === 1}
                          onClick={() => setTxPage(prev => Math.max(prev - 1, 1))}
                          className="p-1.5 rounded-lg border border-slate-800/80 bg-slate-900/40 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        
                        {/* Page Numbers with sliding window */}
                        {(() => {
                          const pages = [];
                          const startPage = Math.max(1, txPage - 2);
                          const endPage = Math.min(totalPages, startPage + 4);
                          const adjustedStartPage = Math.max(1, endPage - 4);
                          
                          for (let p = adjustedStartPage; p <= endPage; p++) {
                            const isCurrent = p === txPage;
                            pages.push(
                              <button
                                key={p}
                                onClick={() => setTxPage(p)}
                                className={`px-3 py-1 text-xs font-bold rounded-lg border transition-all ${
                                  isCurrent
                                    ? 'bg-purple-500/10 border-purple-500/30 text-purple-400 shadow-md shadow-purple-500/5'
                                    : 'border-slate-800/80 bg-slate-900/40 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                                }`}
                              >
                                {p}
                              </button>
                            );
                          }
                          return pages;
                        })()}

                        <button
                          disabled={txPage === totalPages}
                          onClick={() => setTxPage(prev => Math.min(prev + 1, totalPages))}
                          className="p-1.5 rounded-lg border border-slate-800/80 bg-slate-900/40 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
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
                          <th className="px-6 py-4 whitespace-nowrap">ID</th>
                          <th className="px-6 py-4 whitespace-nowrap">被监护人地址</th>
                          <th className="px-6 py-4 whitespace-nowrap">监护人地址</th>
                          <th className="px-6 py-4 whitespace-nowrap">绑定时间</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40 bg-slate-900/10">
                        {dbData.bindings.map((b, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/30 transition-colors duration-200">
                            <td className="px-6 py-4 font-mono text-xs text-slate-500 whitespace-nowrap">#{b.id}</td>
                            <td className="px-6 py-4 font-mono text-xs text-emerald-400 whitespace-nowrap">{b.ward_address}</td>
                            <td className="px-6 py-4 font-mono text-xs text-blue-400 whitespace-nowrap">{b.guardian_address}</td>
                            <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">
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
                          <th className="px-6 py-4 whitespace-nowrap">被监护人地址</th>
                          <th className="px-6 py-4 whitespace-nowrap">当前阈值 (元)</th>
                          <th className="px-6 py-4 whitespace-nowrap">最后更新时间</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40 bg-slate-900/10">
                        {dbData.thresholds.map((t, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/30 transition-colors duration-200">
                            <td className="px-6 py-4 font-mono text-xs text-emerald-400 whitespace-nowrap">{t.ward_address}</td>
                            <td className="px-6 py-4 font-bold text-purple-400 whitespace-nowrap">{t.threshold_amount}</td>
                            <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">
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
