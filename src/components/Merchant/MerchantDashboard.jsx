import React, { useState, useEffect, useCallback } from 'react';
import { LogOut, RefreshCw, CheckCircle2, QrCode, ShoppingBag, ArrowRight } from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Navbar } from '../layout/Navbar';
import { AiAnalysisCard } from '../AiAnalysis/AiAnalysisCard';

export const MerchantDashboard = ({ account, onLogout }) => {
  const [loading, setLoading] = useState(false);
  const [txs, setTxs] = useState([]);
  const [currentCategory, setCurrentCategory] = useState(() => {
    return localStorage.getItem(`merchant_category_${account.address}`) || '餐饮美食';
  });


  const categories = ['餐饮美食', '医疗健康', '娱乐购物', '交通出行'];

  const fetchMerchantData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/all-data');
      const data = await response.json();
      if (data.success) {
        // 过滤属于该商家的收款流水（通过 merchant_address 或者备注匹配）
        const filtered = data.transactions.filter(t => 
          (t.merchant_address && t.merchant_address.toLowerCase() === account.address.toLowerCase()) ||
          t.merchant_type.includes(account.accountName)
        );
        filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setTxs(filtered);
      } else {
        toast.error("获取数据失败：" + data.error);
      }
    } catch (err) {
      console.error(err);
      toast.error("网络请求失败，请确保后台已启动");
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    fetchMerchantData();
  }, [fetchMerchantData]);

  // 修改消费类别
  const handleCategoryChange = (e) => {
    const val = e.target.value;
    setCurrentCategory(val);
    localStorage.setItem(`merchant_category_${account.address}`, val);
    toast.success(`商户类目已更新为 [${val}]，收款码已同步更新！`);
  };


  // 组装静态收款码数据
  // 数据格式：JSON，包含商户地址、姓名、以及当前的消费类型
  const qrDataStr = JSON.stringify({
    merchantAddress: account.address,
    merchantName: account.accountName,
    merchantType: currentCategory
  });
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(qrDataStr)}`;

  // 销售额和笔数统计
  const totalSales = txs.reduce((acc, t) => acc + parseFloat(t.amount), 0);
  const avgSales = txs.length > 0 ? (totalSales / txs.length).toFixed(2) : "0.00";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-amber-500/30 font-sans relative overflow-hidden">
      {/* Background neon glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-amber-600/10 blur-[130px] rounded-full pointer-events-none duration-[6000ms] animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/10 blur-[130px] rounded-full pointer-events-none duration-[6000ms] animate-pulse" style={{ animationDelay: '2s' }}></div>

      <ToastContainer position="top-right" limit={3} autoClose={2000} theme="dark" newestOnTop />

      <div className="max-w-6xl mx-auto py-10 px-6 relative z-10 space-y-8 animate-in fade-in zoom-in-95 duration-500">
        {/* Navigation / Navbar Wrapper */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 rounded-[32px] shadow-2xl overflow-hidden">
          <Navbar currentUser={account} role="merchant" onLogout={onLogout} />
        </div>

        {/* Sub-header indicators */}
        <div className="flex items-center justify-between bg-slate-900/20 border border-slate-800/60 rounded-2xl px-5 py-3 shadow-inner">
          <div className="flex items-center space-x-3">
            <div className="px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-sm shadow-amber-500/5">
              🏢 特约商户视角
            </div>
          </div>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-sans">Merchant Sales & Settlement Console</p>
        </div>

        {/* Grid Container */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* 左侧：商户收款码与类目设置 */}
          <div className="lg:col-span-1 space-y-8">
            {/* 收款码卡片 */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 rounded-[32px] p-8 shadow-xl shadow-slate-950/50 text-center flex flex-col items-center">
              <span className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full mb-6">
                店内静态收款码
              </span>
              <div className="bg-slate-950/60 border border-slate-850/80 rounded-[28px] p-5 mb-6 shadow-inner relative group">
                <img 
                  src={qrCodeUrl} 
                  alt="收款二维码" 
                  className="w-52 h-52 mx-auto rounded-xl object-contain transition-all group-hover:scale-105 duration-300" 
                />
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-[28px] backdrop-blur-[2px] transition-all duration-300">
                  <QrCode className="w-10 h-10 text-amber-400 animate-bounce" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-slate-200 mb-1">{account.accountName}</h3>
              <p className="text-slate-500 text-xs font-mono mb-4">{account.address.slice(0, 10)}...{account.address.slice(-8)}</p>
              
              <div className="w-full bg-amber-500/5 border border-amber-500/10 rounded-2xl py-3 px-4 flex items-center justify-between text-left">
                <div>
                  <p className="text-[10px] text-amber-500 font-bold">扫码预设类目</p>
                  <p className="text-sm font-black text-amber-400">{currentCategory}</p>
                </div>
                <ShoppingBag className="w-5 h-5 text-amber-500 opacity-60" />
              </div>
            </div>

            {/* 控制台类目切换 */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 rounded-[32px] p-8 shadow-xl shadow-slate-950/50">
              <h4 className="text-sm font-bold text-slate-200 mb-4 uppercase tracking-wider">🏢 商户经营类目设置</h4>
              <p className="text-slate-400 text-xs leading-relaxed mb-6">
                您可以动态调整商户在区块链上登记的消费类型。顾客扫码支付时将直接以该类型计入财务风控检查中。
              </p>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">当前主营类目</label>
                <select
                  value={currentCategory}
                  onChange={handleCategoryChange}
                  className="w-full bg-slate-950/50 border border-slate-800 focus:border-amber-500/50 rounded-2xl py-3.5 px-4 text-slate-200 text-sm outline-none transition-all"
                >
                  {categories.map((cat, idx) => (
                    <option key={idx} value={cat} className="bg-slate-900 text-white">{cat}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 右侧：收款流水与 AI 分析 */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* 数据统计简报 */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-900/20 border border-slate-800/60 rounded-3xl p-6 shadow-sm">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">收款总额</p>
                <p className="text-2xl font-black text-slate-200">{totalSales} <span className="text-xs font-normal text-slate-500">元</span></p>
              </div>
              <div className="bg-slate-900/20 border border-slate-800/60 rounded-3xl p-6 shadow-sm">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">交易笔数</p>
                <p className="text-2xl font-black text-slate-200">{txs.length} <span className="text-xs font-normal text-slate-500">笔</span></p>
              </div>
              <div className="bg-slate-900/20 border border-slate-800/60 rounded-3xl p-6 shadow-sm">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">平均客单价</p>
                <p className="text-2xl font-black text-slate-200">{avgSales} <span className="text-xs font-normal text-slate-500">元</span></p>
              </div>
            </div>

            <AiAnalysisCard txs={txs} role="merchant" />

            {/* 收款记录列表 */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 rounded-[32px] p-8 shadow-xl shadow-slate-950/50">
              <h4 className="text-sm font-bold text-slate-200 mb-6 uppercase tracking-wider">📊 营业收款明细</h4>
              
              {txs.length > 0 ? (
                <div className="overflow-x-auto rounded-2xl border border-slate-800/50">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-950/80 border-b border-slate-800/60 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <th className="py-4 pl-4">交易流水 / 时间</th>
                        <th className="py-4 px-2">买家钱包地址 (Ward)</th>
                        <th className="py-4 px-2">消费类目</th>
                        <th className="py-4 px-2">交易金额</th>
                        <th className="py-4 text-right pr-4">状态</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 bg-slate-900/10">
                      {txs.map((t, idx) => (
                        <tr key={idx} className="group hover:bg-slate-900/30 transition-colors duration-200">
                          <td className="py-4 pl-4">
                            <p className="text-slate-200 font-bold text-xs">#{t.id}</p>
                            <p className="text-slate-500 text-[10px] mt-0.5">{new Date(t.created_at).toLocaleString()}</p>
                          </td>
                          <td className="py-4 px-2 font-mono text-[10px] text-slate-400">
                            {t.ward_address}
                          </td>
                          <td className="py-4 px-2">
                            <span className="bg-slate-950/60 text-slate-400 border border-slate-800 text-[10px] font-bold px-2 py-0.5 rounded">
                              {t.merchant_type.replace(/.*\(|\)/g, '') || '模拟消费'}
                            </span>
                          </td>
                          <td className="py-4 px-2 text-xs font-black text-amber-400">
                            +{t.amount} 元
                          </td>
                          <td className="py-4 text-right pr-4">
                            <div className="inline-flex items-center space-x-1.5 justify-end bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-1 rounded-lg">
                              <span className="text-[9px] font-black">已到账 (上链)</span>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="w-16 h-16 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-500">
                    <ShoppingBag className="w-7 h-7" />
                  </div>
                  <h5 className="text-slate-200 font-bold text-sm mb-1">暂无营业流水</h5>
                  <p className="text-slate-500 text-xs">当有顾客扫描您的收款二维码支付成功后，付款流水将在此呈现。</p>
                </div>
              )}
            </div>

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
