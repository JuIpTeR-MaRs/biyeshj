import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2, RefreshCw, AlertCircle, FileText } from 'lucide-react';

export const AiAnalysisCard = ({ txs = [], role = 'ward' }) => {
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState('');
  const [reportHash, setReportHash] = useState('');
  const [txHash, setTxHash] = useState('');
  const [verificationResult, setVerificationResult] = useState(null); // 'valid', 'invalid', 'not_found', 'loading', null

  // Define color mapping classes based on role
  let accentText = "text-indigo-400";
  let accentTextLight = "text-indigo-300";
  let accentBg = "bg-indigo-500";
  let accentBgLight = "bg-indigo-500/10";
  let accentBorder = "border-indigo-500/20";
  let accentGradient = "from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500";
  let accentPulse = "bg-indigo-500";

  if (role === 'admin') {
    accentText = "text-purple-400";
    accentTextLight = "text-purple-300";
    accentBg = "bg-purple-500";
    accentBgLight = "bg-purple-500/10";
    accentBorder = "border-purple-500/20";
    accentGradient = "from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-600";
    accentPulse = "bg-purple-500";
  } else if (role === 'merchant') {
    accentText = "text-amber-400";
    accentTextLight = "text-amber-300";
    accentBg = "bg-amber-500";
    accentBgLight = "bg-amber-500/10";
    accentBorder = "border-amber-500/20";
    accentGradient = "from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500";
    accentPulse = "bg-amber-500";
  } else if (role === 'guardian') {
    accentText = "text-blue-400";
    accentTextLight = "text-blue-300";
    accentBg = "bg-blue-500";
    accentBgLight = "bg-blue-500/10";
    accentBorder = "border-blue-500/20";
    accentGradient = "from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-600";
    accentPulse = "bg-blue-500";
  } else if (role === 'ward') {
    accentText = "text-emerald-400";
    accentTextLight = "text-emerald-300";
    accentBg = "bg-emerald-500";
    accentBgLight = "bg-emerald-500/10";
    accentBorder = "border-emerald-500/20";
    accentGradient = "from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500";
    accentPulse = "bg-emerald-500";
  }

  const steps = [
    "正在梳理平台账目数据...",
    "正在对比阈值规则安全度...",
    "正在通过大模型进行多维分析...",
    "正在整理专业财务与风控意见..."
  ];

  useEffect(() => {
    let interval;
    if (loading) {
      interval = setInterval(() => {
        setLoadingStep(prev => (prev + 1) % steps.length);
      }, 2500);
    } else {
      setLoadingStep(0);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const calculateSHA256 = async (text) => {
    const msgUint8 = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const handleVerifyIntegrity = async () => {
    if (!analysis) return;
    setVerificationResult('loading');
    
    try {
      // 1. 寻找被监护人钱包地址
      let wardAddress = "";
      for (const t of txs) {
        const addr = t.ward || t.ward_address;
        if (addr && addr !== "未知") {
          wardAddress = addr;
          break;
        }
      }

      if (!wardAddress) {
        throw new Error("未找到关联的被监护人钱包地址");
      }

      // 2. 计算本地报告内容哈希值
      const localHash = await calculateSHA256(analysis);
      
      // 3. 从智能合约中读取链上哈希存证
      const { getContract } = await import('../../utils/contract');
      const contract = await getContract();
      const month = new Date().toISOString().slice(0, 7);
      const onChainHash = await contract.aiReportHashes(wardAddress, month);

      console.log("Local SHA-256 Hash:", localHash);
      console.log("On-chain SHA-256 Hash:", onChainHash);

      if (onChainHash === '0x0000000000000000000000000000000000000000000000000000000000000000' || !onChainHash) {
        setVerificationResult('not_found');
      } else if (onChainHash.toLowerCase() === localHash.toLowerCase()) {
        setVerificationResult('valid');
      } else {
        setVerificationResult('invalid');
      }
    } catch (err) {
      console.error(err);
      setVerificationResult('error');
    }
  };

  const handleTriggerAnalysis = async () => {
    if (txs.length === 0) return;
    setLoading(true);
    setError('');
    setAnalysis('');
    setVerificationResult(null);

    try {
      const response = await fetch('/api/analysis/consumption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txs, role })
      });
      const data = await response.json();
      if (data.success) {
        setAnalysis(data.analysis);
        setReportHash(data.reportHash || '');
        setTxHash(data.txHash || '');
      } else {
        setError(data.error || "获取AI分析报告失败");
      }
    } catch (err) {
      setError("网络错误，无法连接至AI分析服务");
    } finally {
      setLoading(false);
    }
  };

  // 极简的 Markdown 渲染解析器
  const renderMarkdown = (text) => {
    if (!text) return null;

    return text.split('\n').map((line, idx) => {
      let trimmed = line.trim();
      
      // 标题 3 (###)
      if (trimmed.startsWith('###')) {
        return (
          <h4 key={idx} className={`text-base font-extrabold mt-4 mb-2 flex items-center space-x-1.5 ${accentTextLight}`}>
            <span className={`w-1.5 h-4 ${accentBg} rounded-full`}></span>
            <span>{trimmed.replace(/^###\s*/, '')}</span>
          </h4>
        );
      }

      // 标题 2 (##)
      if (trimmed.startsWith('##')) {
        return (
          <h3 key={idx} className={`text-lg font-black mt-5 mb-3 border-b pb-1 ${accentTextLight} border-slate-800/80`}>
            {trimmed.replace(/^##\s*/, '')}
          </h3>
        );
      }

      // 无序列表项目 (- or *)
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        const content = trimmed.replace(/^[-*]\s*/, '');
        return (
          <li key={idx} className="ml-4 list-disc pl-1 py-0.5 leading-relaxed text-sm text-slate-300">
            {parseBold(content)}
          </li>
        );
      }

      // 有序列表项目 (e.g. 1.)
      if (/^\d+\.\s+/.test(trimmed)) {
        const content = trimmed.replace(/^\d+\.\s+/, '');
        const match = trimmed.match(/^(\d+)\.\s+/);
        return (
          <div key={idx} className="flex items-start space-x-2 my-1 leading-relaxed text-sm text-slate-300">
            <span className={`font-black text-xs px-1.5 py-0.5 rounded ${accentBgLight} ${accentTextLight} border ${accentBorder}`}>{match[1]}</span>
            <span className="flex-1">{parseBold(content)}</span>
          </div>
        );
      }

      // 空白行
      if (trimmed === '') {
        return <div key={idx} className="h-2"></div>;
      }

      // 普通段落
      return (
        <p key={idx} className="leading-relaxed text-sm my-1.5 text-slate-300">
          {parseBold(trimmed)}
        </p>
      );
    });
  };

  // 处理加粗的辅助函数 **text**
  const parseBold = (text) => {
    const parts = text.split(/\*\*([^*]+)\*\*/g);
    return parts.map((part, index) => {
      // 奇数索引是加粗内容
      if (index % 2 === 1) {
        return <strong key={index} className={`font-extrabold ${accentText} mx-0.5`}>{part}</strong>;
      }
      return part;
    });
  };

  return (
    <div className="relative overflow-hidden rounded-[32px] border transition-all duration-300 p-6 bg-slate-900/40 border-slate-800/60 shadow-2xl text-slate-300 hover:border-slate-800">
      {/* 霓虹流光背景挂件 */}
      <div className={`absolute top-[-50%] right-[-30%] w-72 h-72 rounded-full blur-[100px] pointer-events-none opacity-10 transition-all ${
        loading ? 'animate-pulse scale-110' : ''
      } ${accentPulse}`}></div>

      {/* 标题头部 */}
      <div className="flex items-center justify-between mb-4 border-b pb-3 border-dashed border-slate-800/80">
        <div className="flex items-center space-x-2.5">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-inner ${accentBgLight} ${accentText}`}>
            <Sparkles className="w-5 h-5 animate-spin" style={{ animationDuration: '6s' }} />
          </div>
          <div>
            <h4 className="text-base font-extrabold flex items-center space-x-1.5 text-white">
              <span>AI 消费习惯智能诊断</span>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${accentBgLight} ${accentTextLight} border-${accentText}/20`}>DeepSeek Powered</span>
            </h4>
            <p className="text-[10px] text-slate-500 mt-0.5">利用区块链全量账单，深度画像资金风险特征</p>
          </div>
        </div>

        {analysis && !loading && (
          <button 
            onClick={handleTriggerAnalysis}
            className={`p-2 rounded-xl border border-slate-800 flex items-center space-x-1.5 transition-all text-xs font-bold bg-slate-950/40 hover:bg-slate-900/60 ${accentText} active:scale-95`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>重新诊断</span>
          </button>
        )}
      </div>

      {/* 主面板内容区 */}
      <div className="min-h-[120px] flex flex-col justify-center relative">
        {loading ? (
          /* 加载中状态 */
          <div className="py-8 text-center flex flex-col items-center justify-center animate-in fade-in duration-300">
            <div className="relative mb-5 flex items-center justify-center">
              {/* 流光渐变圈 */}
              <div className={`absolute w-16 h-16 rounded-full border-4 border-t-transparent animate-spin border-slate-850 ${accentBorder} border-t-${accentText}`}></div>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg bg-slate-950 border border-slate-850 ${accentText}`}>
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            </div>
            <p className={`text-sm font-extrabold animate-pulse ${accentTextLight}`}>
              {steps[loadingStep]}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">大约需要数秒时间，请稍候...</p>
          </div>
        ) : error ? (
          /* 出错状态 */
          <div className="py-6 text-center flex flex-col items-center justify-center animate-in zoom-in-95 duration-300">
            <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-red-500">{error}</p>
            <button 
              onClick={handleTriggerAnalysis}
              className="mt-4 px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-colors shadow-lg shadow-rose-600/10 active:scale-95"
            >
              点击重试
            </button>
          </div>
        ) : analysis ? (
          /* 分析结果展示 */
          <div className="max-h-[380px] overflow-y-auto pr-1.5 custom-scrollbar text-left animate-in slide-in-from-bottom-2 duration-500 text-slate-300">
            <div className="space-y-1">
              {renderMarkdown(analysis)}
            </div>
          </div>
        ) : (
          /* 初始状态 */
          <div className="py-8 text-center flex flex-col items-center justify-center animate-in fade-in duration-300">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${accentBgLight} ${accentText}`}>
              <FileText className="w-7 h-7" />
            </div>
            <p className="text-sm font-bold mb-1 text-white">
              {txs.length === 0 
                ? "暂无消费记录可供诊断" 
                : role === 'admin' 
                  ? "全网交易账目就绪，可启动 AI 平台级财务审计" 
                  : "个人历史消费流水已同步，可进行 AI 深度诊断"
              }
            </p>
            <p className="text-xs text-slate-500 max-w-xs mx-auto mb-6">
              {txs.length === 0 
                ? "一旦被监护人发生真实消费，预言机将自动上链，此时即可使用 AI 分析。" 
                : "大模型将从消费频次、金额阈值分布、风控审批等多个维度自动为您生成综合报告与建议。"
              }
            </p>
            <button
              onClick={handleTriggerAnalysis}
              disabled={txs.length === 0}
              className={`px-8 py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-300 transform active:scale-95 shadow-md flex items-center space-x-2 ${
                txs.length === 0
                  ? 'bg-slate-900/20 text-slate-600 border border-slate-850 cursor-not-allowed'
                  : `bg-gradient-to-r ${accentGradient} text-white shadow-lg`
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>{role === 'admin' ? "开始 AI 审计全网数据" : "✨ 立即生成 AI 诊断报告"}</span>
            </button>
          </div>
        )}

        {analysis && !loading && (
          <div className={`mt-5 p-4 rounded-2xl border border-slate-800/80 transition-all bg-slate-950/40 text-slate-300 hover:border-slate-800`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-left">
              <div>
                <p className="text-xs font-black flex items-center gap-1.5 text-white">
                  <span>🛡️ AI 诊断报告链上存证校验 (SHA-256)</span>
                </p>
                {reportHash && (
                  <p className="text-[10px] font-mono text-slate-500 mt-1 truncate max-w-[280px] sm:max-w-[360px]">
                    本地计算哈希: {reportHash}
                  </p>
                )}
                {txHash && (
                  <p className="text-[10px] font-mono text-slate-500 truncate max-w-[280px] sm:max-w-[360px]">
                    存证交易哈希: {txHash}
                  </p>
                )}
              </div>
              <div className="flex-shrink-0">
                {verificationResult === 'loading' ? (
                  <button disabled className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 border border-slate-800 text-slate-500 flex items-center space-x-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>正在比对...</span>
                  </button>
                ) : verificationResult === 'valid' ? (
                  <div className="flex items-center space-x-1 text-emerald-400 font-extrabold text-xs bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
                    <span>✅ 数据未被篡改 (完全一致)</span>
                  </div>
                ) : verificationResult === 'invalid' ? (
                  <div className="flex items-center space-x-1 text-rose-400 font-extrabold text-xs bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-xl">
                    <span>❌ 报告数据已被篡改！</span>
                  </div>
                ) : verificationResult === 'not_found' ? (
                  <div className="flex items-center space-x-1 text-amber-400 font-extrabold text-xs bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl">
                    <span>⚠️ 未在链上找到报告存证</span>
                  </div>
                ) : (
                  <button 
                    onClick={handleVerifyIntegrity}
                    className={`px-4 py-2 bg-slate-950 border border-slate-800 hover:bg-slate-900/60 ${accentText} rounded-xl text-xs font-bold transition-all shadow-md active:scale-95`}
                  >
                    验证防篡改
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
      `}} />
    </div>
  );
};
