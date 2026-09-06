import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2, RefreshCw, AlertCircle, FileText, Copy, Check, Lightbulb, TrendingUp, AlertTriangle, ShieldCheck, BarChart3 } from 'lucide-react';
import { getApiUrl } from '../../utils/api';
import { toast } from 'react-toastify';

export const AiAnalysisCard = ({ txs = [], role = 'ward' }) => {
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState('');
  const [reportHash, setReportHash] = useState('');
  const [txHash, setTxHash] = useState('');
  const [verificationResult, setVerificationResult] = useState(null); // 'valid', 'invalid', 'not_found', 'loading', null
  const [copied, setCopied] = useState(false);

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

  const handleCopyReport = () => {
    if (!analysis) return;
    navigator.clipboard.writeText(analysis);
    setCopied(true);
    toast.success("AI 诊断报告已复制到剪贴板");
    setTimeout(() => setCopied(false), 2000);
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
      const response = await fetch(getApiUrl('/api/analysis/consumption'), {
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

  // 处理行内加粗、行内代码与智能高亮
  const parseInline = (text) => {
    if (!text) return null;
    
    // 拆分 **bold** 与 `code`
    const regex = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
    const tokens = [];
    let lastIdx = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIdx) {
        tokens.push({ type: 'text', content: text.substring(lastIdx, match.index) });
      }
      if (match[1].startsWith('**')) {
        tokens.push({ type: 'bold', content: match[2] });
      } else if (match[1].startsWith('`')) {
        tokens.push({ type: 'code', content: match[3] });
      }
      lastIdx = regex.lastIndex;
    }
    if (lastIdx < text.length) {
      tokens.push({ type: 'text', content: text.substring(lastIdx) });
    }

    return tokens.map((tok, idx) => {
      if (tok.type === 'bold') {
        const isRisk = /风险|异常|超支|违规|高危|警惕|黑名单|拦截/.test(tok.content);
        const isSuccess = /建议|健康|安全|达标|合理|储蓄|优秀|鼓励|改善/.test(tok.content);
        const isStat = /[\d.%元/]+/.test(tok.content) && tok.content.length <= 15;

        if (isRisk) {
          return (
            <span key={idx} className="inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-black bg-rose-500/15 text-rose-300 border border-rose-500/30 mx-0.5">
              {tok.content}
            </span>
          );
        }
        if (isSuccess) {
          return (
            <span key={idx} className="inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-black bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 mx-0.5">
              {tok.content}
            </span>
          );
        }
        if (isStat) {
          return (
            <span key={idx} className={`font-mono font-bold ${accentTextLight} px-1 py-0.2 bg-slate-950/60 rounded border border-slate-800 mx-0.5`}>
              {tok.content}
            </span>
          );
        }
        return (
          <strong key={idx} className={`font-black ${accentText} mx-0.5`}>
            {tok.content}
          </strong>
        );
      }
      if (tok.type === 'code') {
        return (
          <code key={idx} className="font-mono text-xs px-1.5 py-0.5 bg-slate-950 border border-slate-800 rounded text-amber-300 mx-0.5">
            {tok.content}
          </code>
        );
      }
      return <span key={idx}>{tok.content}</span>;
    });
  };

  // 将纯 Markdown 文本解析为结构化的板块卡片数据
  const parseMarkdownSections = (rawText) => {
    if (!rawText) return [];
    const lines = rawText.split('\n');
    const sections = [];
    let currentSection = { title: null, items: [] };

    const finalizeSection = () => {
      if (currentSection.title || currentSection.items.length > 0) {
        sections.push(currentSection);
      }
    };

    let i = 0;
    while (i < lines.length) {
      let line = lines[i];
      let trimmed = line.trim();

      if (!trimmed) {
        i++;
        continue;
      }

      // 二级标题作为独立卡片划分
      if (trimmed.startsWith('## ') || trimmed.startsWith('##')) {
        finalizeSection();
        currentSection = {
          title: trimmed.replace(/^##\s*/, ''),
          items: []
        };
        i++;
        continue;
      }

      // 探测 Markdown 表格
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const tableLines = [];
        while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
          tableLines.push(lines[i].trim());
          i++;
        }
        if (tableLines.length >= 2) {
          const headers = tableLines[0].split('|').map(s => s.trim()).filter(Boolean);
          const bodyLines = tableLines.slice(1).filter(l => !/^\|(\s*:?-+:?\s*\|)+$/.test(l));
          const rows = bodyLines.map(rowLine => 
            rowLine.split('|').map(s => s.trim()).filter(Boolean)
          );
          currentSection.items.push({ type: 'table', headers, rows });
          continue;
        } else {
          currentSection.items.push({ type: 'p', text: trimmed });
          continue;
        }
      }

      // 引用块 >
      if (trimmed.startsWith('>')) {
        const quoteLines = [];
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          quoteLines.push(lines[i].trim().replace(/^>\s*/, ''));
          i++;
        }
        currentSection.items.push({ type: 'quote', text: quoteLines.join(' ') });
        continue;
      }

      // 三级标题
      if (trimmed.startsWith('### ') || trimmed.startsWith('###')) {
        currentSection.items.push({ type: 'h3', text: trimmed.replace(/^###\s*/, '') });
        i++;
        continue;
      }

      // 列表项 (- 或 * 或 1.)
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s+/.test(trimmed)) {
        const isNumbered = /^\d+\.\s+/.test(trimmed);
        const numberMatch = trimmed.match(/^(\d+)\.\s+/);
        const cleanContent = isNumbered 
          ? trimmed.replace(/^\d+\.\s+/, '') 
          : trimmed.replace(/^[-*]\s*/, '');

        currentSection.items.push({
          type: 'list_item',
          isNumbered,
          number: numberMatch ? numberMatch[1] : null,
          content: cleanContent
        });
        i++;
        continue;
      }

      // 普通段落
      currentSection.items.push({ type: 'p', text: trimmed });
      i++;
    }

    finalizeSection();
    return sections;
  };

  // 高颜值渲染整个 Markdown 卡片群
  const renderRichMarkdown = (text) => {
    const sections = parseMarkdownSections(text);
    if (sections.length === 0) return null;

    return (
      <div className="space-y-4 text-left">
        {sections.map((section, sIdx) => {
          // 根据标题智能匹配专属图标
          let SectionIcon = BarChart3;
          const tLower = (section.title || '').toLowerCase();
          if (tLower.includes('支出') || tLower.includes('概况') || tLower.includes('规模')) SectionIcon = TrendingUp;
          else if (tLower.includes('风险') || tLower.includes('异常') || tLower.includes('预警')) SectionIcon = AlertTriangle;
          else if (tLower.includes('建议') || tLower.includes('规划') || tLower.includes('措施')) SectionIcon = Lightbulb;
          else if (tLower.includes('评级') || tLower.includes('审计') || tLower.includes('安全')) SectionIcon = ShieldCheck;

          return (
            <div 
              key={sIdx}
              className="bg-slate-950/50 backdrop-blur-md border border-slate-800/80 rounded-2xl p-4.5 sm:p-5 shadow-xl transition-all duration-300 hover:border-slate-700/80"
            >
              {/* 板块头部标题 */}
              {section.title && (
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800/80">
                  <div className="flex items-center space-x-2.5">
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black ${accentBgLight} ${accentText} border ${accentBorder}`}>
                      {String(sIdx + 1).padStart(2, '0')}
                    </span>
                    <h3 className="text-sm sm:text-base font-black tracking-tight text-white flex items-center gap-1.5">
                      <SectionIcon className={`w-4 h-4 ${accentText}`} />
                      <span>{section.title}</span>
                    </h3>
                  </div>
                </div>
              )}

              {/* 板块内部元素 */}
              <div className="space-y-2.5">
                {section.items.map((item, iIdx) => {
                  if (item.type === 'h3') {
                    return (
                      <h4 key={iIdx} className={`text-xs sm:text-sm font-extrabold mt-3.5 mb-1.5 flex items-center gap-1.5 ${accentTextLight}`}>
                        <span className={`w-1 h-3 rounded-full ${accentBg}`}></span>
                        <span>{item.text}</span>
                      </h4>
                    );
                  }

                  if (item.type === 'table') {
                    return (
                      <div key={iIdx} className="overflow-x-auto my-3 rounded-xl border border-slate-800 bg-slate-900/50">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-900/90 text-slate-300 font-bold border-b border-slate-800">
                            <tr>
                              {item.headers.map((h, hIdx) => (
                                <th key={hIdx} className="px-3.5 py-2.5 font-black tracking-wider whitespace-nowrap">
                                  {parseInline(h)}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {item.rows.map((row, rIdx) => (
                              <tr key={rIdx} className="hover:bg-slate-850/40 transition-colors">
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx} className="px-3.5 py-2 text-slate-300 whitespace-nowrap">
                                    {parseInline(cell)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  }

                  if (item.type === 'quote') {
                    return (
                      <div 
                        key={iIdx}
                        className={`p-3.5 rounded-xl my-2.5 border-l-4 bg-slate-900/70 border-l-${accentText} border-y border-r border-slate-800/60 flex items-start space-x-2.5 shadow-inner`}
                      >
                        <Lightbulb className={`w-4 h-4 flex-shrink-0 mt-0.5 ${accentText}`} />
                        <div className="text-xs leading-relaxed text-slate-300">
                          {parseInline(item.text)}
                        </div>
                      </div>
                    );
                  }

                  if (item.type === 'list_item') {
                    return (
                      <div key={iIdx} className="flex items-start space-x-2.5 py-0.5 text-xs leading-relaxed text-slate-300">
                        {item.isNumbered ? (
                          <span className={`flex-shrink-0 w-4 h-4 rounded-full text-[10px] font-black flex items-center justify-center ${accentBgLight} ${accentText} border ${accentBorder} mt-0.5`}>
                            {item.number}
                          </span>
                        ) : (
                          <span className={`w-1.5 h-1.5 rounded-full ${accentBg} flex-shrink-0 mt-2`}></span>
                        )}
                        <div className="flex-1">
                          {parseInline(item.content)}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <p key={iIdx} className="text-xs sm:text-[13px] leading-relaxed text-slate-300/90 my-1">
                      {parseInline(item.text)}
                    </p>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
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
          <div className="flex items-center space-x-2">
            <button 
              onClick={handleCopyReport}
              className={`px-3 py-1.5 rounded-xl border border-slate-800 flex items-center space-x-1.5 transition-all text-xs font-bold bg-slate-950/40 hover:bg-slate-900/60 ${accentText} active:scale-95`}
              title="复制报告全文"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? '已复制' : '复制全文'}</span>
            </button>
            <button 
              onClick={handleTriggerAnalysis}
              className={`px-3 py-1.5 rounded-xl border border-slate-800 flex items-center space-x-1.5 transition-all text-xs font-bold bg-slate-950/40 hover:bg-slate-900/60 ${accentText} active:scale-95`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>重新诊断</span>
            </button>
          </div>
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
          /* 分析结果展示 - 高颜值卡片流 */
          <div className="max-h-[500px] overflow-y-auto pr-1.5 custom-scrollbar text-left animate-in slide-in-from-bottom-2 duration-500 text-slate-300">
            {renderRichMarkdown(analysis)}
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
