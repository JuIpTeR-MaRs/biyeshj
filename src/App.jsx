import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Shield, User, UserPlus, Users, Clock, AlertTriangle } from 'lucide-react';
import { WalletConnect } from './components/WalletConnect';
import { PendingList } from './components/PendingList';
import { LoginPage } from './components/Login/LoginPage';
import { RequestList } from './components/RequestList';
import { HistoryList } from './components/HistoryList';
import { AdminDashboard } from './components/Admin/AdminDashboard';
import { AiAnalysisCard } from './components/AiAnalysis/AiAnalysisCard';
import { getContract, CONTRACT_ADDRESS, fundAccount } from './utils/contract';
import { getLocalBankUser } from './utils/bankAccount';

function App() {
  const [account, setAccount] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState(null);
  const [pendingTxs, setPendingTxs] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(false);

  // 监护人/被监护人状态
  const [guardianInfo, setGuardianInfo] = useState(null);
  const [pendingGuardianInfo, setPendingGuardianInfo] = useState(null);
  const [activeWards, setActiveWards] = useState([]);
  const [myThreshold, setMyThreshold] = useState("0");
  const [editingThreshold, setEditingThreshold] = useState(null);
  const [isUpdatingThreshold, setIsUpdatingThreshold] = useState(false);

  // 被监护人端表单状态
  const [bindPhone, setBindPhone] = useState('');
  const [isBinding, setIsBinding] = useState(false);
  const [showBindForm, setShowBindForm] = useState(false);

  // 监护人端表单状态
  const [wardPhoneInput, setWardPhoneInput] = useState('');
  const [isAddingWard, setIsAddingWard] = useState(false);
  const [showAddWardForm, setShowAddWardForm] = useState(false);

  // 支付宝支付表单状态
  const [alipayAmount, setAlipayAmount] = useState('');
  const [alipaySubject, setAlipaySubject] = useState('餐饮美食');
  const [isAlipayLoading, setIsAlipayLoading] = useState(false);
  const [historyTxs, setHistoryTxs] = useState([]);

  // 支付宝扫码支付弹窗状态
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [qrOutTradeNo, setQrOutTradeNo] = useState('');
  const [qrCountdown, setQrCountdown] = useState(60);
  const pollIntervalRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  const connectWallet = (bankAccount) => {
    setAccount(bankAccount.address);
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setAccount(null);
    setGuardianInfo(null);
    setPendingGuardianInfo(null);
    setActiveWards([]);
  };

  const fetchData = useCallback(async () => {
    if (!account) return;
    if (account === 'admin') {
      setRole('admin');
      return;
    }
    try {
      // 自动充值 Gas 费
      await fundAccount(account);
      
      const contract = await getContract();
      
      // 1. 获取作为监护人的待处理审批交易
      const ids = await contract.getPendingTransactions(account);
      const txDetails = await Promise.all(ids.map(id => contract.transactions(id)));
      setPendingTxs(txDetails.map(d => ({
        id: d[0], ward: d[1], amount: d[2].toString(), 
        timestamp: d[3], merchantType: d[4], isPending: d[5]
      })));

      // 2. 获取作为监护人收到的绑定请求列表
      const allAccounts = JSON.parse(localStorage.getItem('bank_all_accounts') || '[]');
      const requests = [];
      for (const accInfo of allAccounts) {
        try {
          const pending = await contract.pendingWardToGuardian(accInfo.address);
          if (pending.toLowerCase() === account.toLowerCase()) {
            requests.push(accInfo);
          }
        } catch (e) {}
      }
      setPendingRequests(requests);

      // 3. 获取我名下的被监护人列表 (作为监护人角色)
      const wardsList = [];
      for (const accInfo of allAccounts) {
        try {
          const activeG = await contract.wardToGuardian(accInfo.address);
          if (activeG.toLowerCase() === account.toLowerCase()) {
            const thres = await contract.threshold(accInfo.address);
            wardsList.push({...accInfo, threshold: thres.toString()});
          }
        } catch (e) {}
      }
      setActiveWards(wardsList);

      // 获取当前用户的阈值
      try {
        const myThres = await contract.threshold(account);
        setMyThreshold(myThres.toString());
      } catch (e) {}


      // 4. 被监护人信息：查询当前用户的监护人和申请中的监护人
      let activeGuardian = "0x0000000000000000000000000000000000000000";
      let reqGuardian = "0x0000000000000000000000000000000000000000";
      try {
        activeGuardian = await contract.wardToGuardian(account);
        reqGuardian = await contract.pendingWardToGuardian(account);
      } catch (e) {
        console.error("Query ward status error:", e);
      }

      const zeroAddr = "0x0000000000000000000000000000000000000000";
      
      if (activeGuardian && activeGuardian !== zeroAddr) {
        const info = allAccounts.find(a => a.address.toLowerCase() === activeGuardian.toLowerCase());
        setGuardianInfo(info || { address: activeGuardian, accountName: "已绑定监护人" });
      } else {
        setGuardianInfo(null);
      }

      if (reqGuardian && reqGuardian !== zeroAddr) {
        const info = allAccounts.find(a => a.address.toLowerCase() === reqGuardian.toLowerCase());
        setPendingGuardianInfo(info || { address: reqGuardian, accountName: "等待确认的监护人" });
      } else {
        setPendingGuardianInfo(null);
      }

      // 5. 角色判定
      const hasWards = wardsList.length > 0;
      const isGuardianOnChain = ids.length > 0 || txDetails.length > 0 || requests.length > 0 || hasWards;
      const currentUser = getLocalBankUser() || {};
      const isGuardian = isGuardianOnChain || currentUser.role === 'guardian';
      setRole(isGuardian ? 'guardian' : 'ward');

      // 6. 获取历史消费记录
      const txCount = await contract.txCounter();
      const count = Number(txCount);
      const allTxs = [];
      for (let i = 1; i <= count; i++) {
        try {
          const tx = await contract.transactions(i);
          allTxs.push({
            id: tx[0].toString(),
            ward: tx[1],
            amount: tx[2].toString(),
            timestamp: Number(tx[3]),
            merchantType: tx[4],
            isPending: tx[5],
            isApproved: tx[6]
          });
        } catch (e) {
          console.error("Error fetching transaction history:", i, e);
        }
      }

      const currentRole = isGuardian ? 'guardian' : 'ward';
      let filteredTxs = [];
      if (currentRole === 'ward') {
        filteredTxs = allTxs.filter(tx => tx.ward.toLowerCase() === account.toLowerCase());
      } else {
        const wardAddresses = wardsList.map(w => w.address.toLowerCase());
        filteredTxs = allTxs.filter(tx => wardAddresses.includes(tx.ward.toLowerCase()));
      }

      // 关联被监护人姓名
      const mappedTxs = filteredTxs.map(tx => {
        const info = allAccounts.find(a => a.address.toLowerCase() === tx.ward.toLowerCase());
        return {
          ...tx,
          wardName: info ? info.accountName : tx.ward
        };
      });

      mappedTxs.sort((a, b) => b.timestamp - a.timestamp);
      setHistoryTxs(mappedTxs);
    } catch (err) {
      console.error("Fetch Data Error:", err);
    }
  }, [account]);

  const handleAction = async (txId, approve) => {
    setLoading(true);
    try {
      const contract = await getContract();
      const tx = await contract.confirmTransaction(txId, approve);
      toast.info("交易已提交，等待上链确认...");
      await tx.wait();
      toast.success(approve ? "已批准消费请求" : "已拒绝消费请求");
      fetchData();
    } catch (err) {
      toast.error(err.reason || "交易执行失败");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestAction = async (wardAddress, approve) => {
    setLoading(true);
    try {
      const contract = await getContract();
      const tx = approve 
        ? await contract.acceptGuardianship(wardAddress)
        : await contract.rejectGuardianship(wardAddress);
      
      toast.info("正在上链同步绑定关系...");
      await tx.wait();

      if (approve) {
        try {
          await fetch('/api/guardian/bind', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wardAddress, guardianAddress: account })
          });
        } catch (err) {
          console.error("写入数据库失败:", err);
        }
      }

      toast.success(approve ? "已成功绑定监护关系" : "已拒绝绑定请求");
      fetchData();
    } catch (err) {
      toast.error("操作失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  // 被监护人向监护人发起绑定申请
  const handleBindGuardian = async (e) => {
    e.preventDefault();
    if (!bindPhone) {
      toast.error("请输入监护人手机号");
      return;
    }
    setIsBinding(true);
    try {
      const allAccounts = JSON.parse(localStorage.getItem('bank_all_accounts') || '[]');
      const guardianAcc = allAccounts.find(a => a.phone === bindPhone);
      if (!guardianAcc) {
        toast.error("未找到该手机号对应的账户，请确保监护人已注册");
        setIsBinding(false);
        return;
      }
      if (guardianAcc.address.toLowerCase() === account.toLowerCase()) {
        toast.error("不能绑定自己为监护人");
        setIsBinding(false);
        return;
      }

      const contract = await getContract();
      const tx = await contract.requestGuardian(guardianAcc.address);
      toast.info("正在提交区块链绑定申请...");
      await tx.wait();
      toast.success(`已向监护人 ${guardianAcc.accountName} 发送绑定申请，请等待对方同意`);
      setBindPhone('');
      setShowBindForm(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(err.reason || "绑定申请失败，请重试");
    } finally {
      setIsBinding(false);
    }
  };

  // 监护人一键添加被监护人
  const handleAddWard = async (e) => {
    e.preventDefault();
    if (!wardPhoneInput) {
      toast.error("请输入被监护人手机号");
      return;
    }
    setIsAddingWard(true);
    try {
      const allAccounts = JSON.parse(localStorage.getItem('bank_all_accounts') || '[]');
      const wardAcc = allAccounts.find(a => a.phone === wardPhoneInput);
      if (!wardAcc) {
        toast.error("未找到该手机号对应的账户，请确保被监护人已注册");
        setIsAddingWard(false);
        return;
      }
      if (wardAcc.address.toLowerCase() === account.toLowerCase()) {
        toast.error("不能添加自己为被监护人");
        setIsAddingWard(false);
        return;
      }

      const contract = await getContract();
      const currentG = await contract.wardToGuardian(wardAcc.address);
      if (currentG.toLowerCase() === account.toLowerCase()) {
        toast.error("该用户已经绑定您为监护人，无需重复添加");
        setIsAddingWard(false);
        return;
      }

      toast.info("第一步：代表被监护人向您发送绑定请求...");
      await fundAccount(wardAcc.address);
      const wardContract = await getContract(wardAcc.privateKey);
      const tx1 = await wardContract.requestGuardian(account);
      await tx1.wait();

      toast.info("第二步：您同意并确认绑定该成员...");
      const guardianContract = await getContract();
      const tx2 = await guardianContract.acceptGuardianship(wardAcc.address);
      await tx2.wait();

      try {
        await fetch('/api/guardian/bind', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wardAddress: wardAcc.address, guardianAddress: account })
        });
      } catch (err) {
        console.error("写入数据库失败:", err);
      }

      toast.success(`已成功添加并绑定被监护人 ${wardAcc.accountName}！`);
      setWardPhoneInput('');
      setShowAddWardForm(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(err.reason || "绑定失败，请确认该被监护人是否有足够的以太币");
    } finally {
      setIsAddingWard(false);
    }
  };

  // 监护人修改被监护人的消费阈值
  const handleUpdateThreshold = async (wardAddress, newThreshold) => {
    if (!newThreshold || isNaN(newThreshold) || parseFloat(newThreshold) < 0) {
      toast.error("请输入有效的阈值金额");
      return;
    }
    setIsUpdatingThreshold(true);
    try {
      const contract = await getContract();
      const tx = await contract.setGuardianThreshold(wardAddress, newThreshold);
      toast.info("正在提交修改阈值请求...");
      await tx.wait();

      try {
        await fetch('/api/guardian/threshold', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wardAddress, amount: newThreshold })
        });
      } catch (err) {
        console.error("写入数据库失败:", err);
      }

      toast.success("已成功修改被监护人的消费阈值");
      setEditingThreshold(null);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(err.reason || "修改阈值失败");
    } finally {
      setIsUpdatingThreshold(false);
    }
  };

  const handleCloseQrModal = useCallback(async () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setShowQrModal(false);

    // 发送取消订单请求到后台，防止后台或兜底模式自动录入成功
    if (qrOutTradeNo) {
      try {
        await fetch("/api/alipay/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outTradeNo: qrOutTradeNo })
        });
      } catch (err) {
        console.error("Cancel trade failed:", err);
      }
    }
  }, [qrOutTradeNo]);

  const startPolling = useCallback((outTradeNo) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/alipay/query?outTradeNo=${outTradeNo}`);
        const data = await response.json();
        if (data.success) {
          if (data.status === 'TRADE_SUCCESS') {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
            }
            setShowQrModal(false);
            fetchData();
          } else if (data.status === 'FAILED') {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
            }
            setShowQrModal(false);
            toast.error("❌ 支付已关闭或失败。");
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 2000);
  }, [fetchData]);

  const generatePayQr = useCallback(async () => {
    if (!alipayAmount || isNaN(alipayAmount) || parseFloat(alipayAmount) <= 0) {
      toast.error("请输入有效的支付金额");
      return false;
    }
    try {
      const response = await fetch("/api/alipay/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(alipayAmount),
          subject: alipaySubject,
          wardAddress: account
        })
      });
      const data = await response.json();
      if (data.success && data.qrCode) {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(data.qrCode)}`;
        setQrCodeUrl(qrUrl);
        setQrOutTradeNo(data.outTradeNo);
        setQrCountdown(60); // 重置倒计时为 60s
        startPolling(data.outTradeNo);
        return true;
      } else {
        toast.error(data.error || "预生成支付订单失败");
        return false;
      }
    } catch (err) {
      console.error(err);
      toast.error("网络请求失败，请确认后端服务器已启动");
      return false;
    }
  }, [alipayAmount, alipaySubject, account, startPolling]);

  const handleAlipayPay = async (e) => {
    if (e) e.preventDefault();
    setIsAlipayLoading(true);
    const success = await generatePayQr();
    if (success) {
      setShowQrModal(true);
    }
    setIsAlipayLoading(false);
  };

  const generatePayQrRef = useRef(generatePayQr);
  useEffect(() => {
    generatePayQrRef.current = generatePayQr;
  }, [generatePayQr]);

  useEffect(() => {
    if (showQrModal) {
      setQrCountdown(60);
      countdownIntervalRef.current = setInterval(() => {
        setQrCountdown(prev => {
          if (prev <= 1) {
            generatePayQrRef.current();
            return 60;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    }
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [showQrModal]);

  const activeWardsRef = useRef(activeWards);
  const roleRef = useRef(role);
  const accountRef = useRef(account);

  useEffect(() => {
    activeWardsRef.current = activeWards;
  }, [activeWards]);

  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  useEffect(() => {
    accountRef.current = account;
  }, [account]);

  useEffect(() => {
    let subscriptionTime = Date.now();
    let contractInstance = null;

    const onPending = (id, ward, amount) => {
      if (Date.now() - subscriptionTime < 2000) return; // Ignore events triggered on initial subscribe
      const curAccount = accountRef.current;
      const curRole = roleRef.current;
      const curActiveWards = activeWardsRef.current;

      if (curAccount && ward.toLowerCase() === curAccount.toLowerCase()) {
        toast.info("⏳ 支付已提交，由于金额超过预设阈值，正在等待监护人审批。", {
          position: "top-right",
          autoClose: 5000,
          theme: "colored"
        });
        fetchData();
      } else if (curRole === 'guardian' && curActiveWards.some(w => w.address.toLowerCase() === ward.toLowerCase())) {
        toast.warn(`⚠️ 收到被监护成员大额消费预警: ${amount.toString()} 元`, {
          position: "top-right",
          autoClose: 5000,
          theme: "colored"
        });
        fetchData();
      }
    };

    const onAutoApproved = (id, ward, amount) => {
      if (Date.now() - subscriptionTime < 2000) return; // Ignore events triggered on initial subscribe
      const curAccount = accountRef.current;
      const curRole = roleRef.current;
      const curActiveWards = activeWardsRef.current;

      if (curAccount && ward.toLowerCase() === curAccount.toLowerCase()) {
        // 只通过事件触发数据刷新，不弹窗，因为 postMessage 已经处理了弹窗
        fetchData();
      } else if (curRole === 'guardian' && curActiveWards.some(w => w.address.toLowerCase() === ward.toLowerCase())) {
        toast.info(`ℹ️ 被监护成员完成一笔自动允许的消费: ${amount.toString()} 元`, {
          position: "top-right",
          autoClose: 5000
        });
        fetchData();
      }
    };

    const setupListeners = async () => {
      if (account && isLoggedIn) {
        fetchData();
        contractInstance = await getContract();
        if (contractInstance) {
          contractInstance.on("PaymentPendingApproval", onPending);
          contractInstance.on("PaymentAutoApproved", onAutoApproved);
        }
      }
    };

    setupListeners();

    return () => {
      if (contractInstance) {
        contractInstance.off("PaymentPendingApproval", onPending);
        contractInstance.off("PaymentAutoApproved", onAutoApproved);
      }
    };
  }, [account, isLoggedIn, fetchData]);

  useEffect(() => {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        const handleAlipaySuccess = () => {
          toast.success("🏆 支付宝支付成功，已安全记录并同步上链！");
          fetchData();
        };
        const handleAlipayFailure = () => {
          toast.error("❌ 支付宝支付校验失败。");
        };

        ipcRenderer.on('alipay-success', handleAlipaySuccess);
        ipcRenderer.on('alipay-failure', handleAlipayFailure);
        
        return () => {
          ipcRenderer.off('alipay-success', handleAlipaySuccess);
          ipcRenderer.off('alipay-failure', handleAlipayFailure);
        };
      }
    } catch (e) {
      console.warn("Not in Electron environment or IPC failed to initialize:", e);
    }
  }, [fetchData]);

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data === 'alipay-success') {
        toast.success("🏆 支付宝支付成功，已安全记录并同步上链！");
        fetchData();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [fetchData]);

  if (!isLoggedIn) {
    return <LoginPage onLogin={connectWallet} />;
  }

  if (role === 'admin') {
    return <AdminDashboard onLogout={handleLogout} />;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 selection:bg-blue-100">
      <div className="max-w-3xl mx-auto py-12 px-6">
        <div className="bg-white rounded-[40px] shadow-2xl shadow-blue-100 overflow-hidden border border-white">
          <WalletConnect account={account} onConnect={connectWallet} onLogout={handleLogout} />
          
          <div className="p-8 lg:p-12">
            {!account ? (
              <div className="text-center py-20">
                <div className="w-24 h-24 bg-blue-50 rounded-[32px] flex items-center justify-center mx-auto mb-6">
                  <span className="text-4xl text-blue-500">🛡️</span>
                </div>
                <h2 className="text-3xl font-black text-gray-900 mb-4">欢迎访问监护系统</h2>
                <p className="text-gray-500 max-w-xs mx-auto leading-relaxed">
                  通过区块链技术为您的家人提供最安全的消费保障与监护。
                </p>
              </div>
            ) : (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="flex items-center space-x-3 mb-10">
                  <div className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest ${
                    role === 'guardian' ? 'bg-indigo-100 text-indigo-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {role === 'guardian' ? '🛡️ 监护人视角' : '👤 被监护人视角'}
                  </div>
                </div>

                {role === 'guardian' ? (
                  <div className="space-y-8">
                    {/* 被监护人列表 */}
                    <div className="bg-slate-50 border border-slate-200/60 rounded-[32px] p-8 shadow-sm">
                      <div className="flex justify-between items-center mb-6">
                        <h4 className="text-lg font-bold text-slate-800 flex items-center space-x-2">
                          <Users className="w-5 h-5 text-indigo-500" />
                          <span>👥 我管理的被监护成员</span>
                        </h4>
                        {!showAddWardForm && (
                          <button
                            onClick={() => setShowAddWardForm(true)}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md shadow-indigo-600/10 transition-all flex items-center space-x-1.5"
                          >
                            <UserPlus className="w-4 h-4" />
                            <span>添加成员</span>
                          </button>
                        )}
                      </div>

                      {showAddWardForm && (
                        <form onSubmit={handleAddWard} className="mb-6 bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4 animate-in slide-in-from-top-2 duration-300">
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">被监护人手机号</label>
                            <div className="relative group">
                              <input
                                type="text"
                                placeholder="请输入已注册的被监护人手机号"
                                value={wardPhoneInput}
                                onChange={(e) => setWardPhoneInput(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200/60 focus:border-indigo-500/50 rounded-xl py-3 px-4 text-slate-700 text-sm outline-none transition-all"
                              />
                            </div>
                            <p className="text-[10px] text-slate-400">系统将代表被监护人发送绑定请求，并由您立即自动确认，实现一键绑定。</p>
                          </div>
                          <div className="flex justify-end space-x-2">
                            <button
                              type="button"
                              onClick={() => setShowAddWardForm(false)}
                              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold transition-all"
                            >
                              取消
                            </button>
                            <button
                              type="submit"
                              disabled={isAddingWard}
                              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md shadow-indigo-600/10 transition-all flex items-center space-x-2"
                            >
                              {isAddingWard ? (
                                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                              ) : (
                                <span>确认添加</span>
                              )}
                            </button>
                          </div>
                        </form>
                      )}

                      {activeWards.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {activeWards.map((ward, idx) => (
                            <div key={idx} className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center space-x-3 shadow-sm hover:shadow-md transition-shadow">
                              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 flex-shrink-0">
                                <User className="w-5 h-5" />
                              </div>
                              <div className="overflow-hidden flex-1">
                                <p className="text-slate-800 font-bold text-sm truncate">{ward.accountName}</p>
                                <p className="text-slate-500 text-[10px] font-mono leading-none mb-1">{ward.phone}</p>
                                <p className="text-slate-400 text-[9px] font-mono truncate">{ward.address}</p>
                                <p className="text-indigo-600 text-[11px] font-bold mt-1">当前消费阈值: {ward.threshold} 元</p>
                              </div>
                              <div className="flex flex-col space-y-2 flex-shrink-0">
                                {editingThreshold?.address === ward.address ? (
                                  <div className="flex items-center space-x-2">
                                    <input 
                                      type="number" 
                                      className="w-20 border border-slate-200 rounded px-2 py-1 text-xs" 
                                      value={editingThreshold.amount}
                                      onChange={e => setEditingThreshold({...editingThreshold, amount: e.target.value})}
                                    />
                                    <button 
                                      onClick={() => handleUpdateThreshold(ward.address, editingThreshold.amount)}
                                      disabled={isUpdatingThreshold}
                                      className="bg-indigo-500 hover:bg-indigo-600 text-white px-2 py-1 rounded text-xs transition-colors"
                                    >保存</button>
                                    <button 
                                      onClick={() => setEditingThreshold(null)}
                                      className="bg-slate-200 hover:bg-slate-300 text-slate-600 px-2 py-1 rounded text-xs transition-colors"
                                    >取消</button>
                                  </div>
                                ) : (
                                  <button 
                                    onClick={() => setEditingThreshold({ address: ward.address, amount: ward.threshold })}
                                    className="px-3 py-1.5 border border-indigo-200 hover:bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold transition-all"
                                  >
                                    修改阈值
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center">
                          <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-400">
                            <Users className="w-6 h-6" />
                          </div>
                          <p className="text-slate-800 font-bold text-sm mb-1">您尚未绑定被监护成员</p>
                          <p className="text-slate-500 text-xs">点击右上角“添加成员”按钮，快速绑定家人账户进行监护。</p>
                        </div>
                      )}
                    </div>

                    <RequestList requests={pendingRequests} onAction={handleRequestAction} loading={loading} />
                    <PendingList txs={pendingTxs} onAction={handleAction} loading={loading} />

                    {/* 模拟支付宝交易测试 */}
                    <div className="bg-slate-50 border border-slate-200/60 rounded-[32px] p-8 shadow-sm">
                      <h4 className="text-lg font-bold text-slate-800 mb-4 flex items-center space-x-2">
                        <span className="text-xl">🛒</span>
                        <span>模拟支付宝交易测试</span>
                      </h4>
                      <p className="text-slate-500 text-xs mb-6">
                        输入商品类型和金额，点击立即支付将唤起支付宝沙箱收银台进行支付体验。支付成功后，预言机将自动把交易数据记录上链。
                      </p>

                      <form onSubmit={handleAlipayPay} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">商品类型 (上链类别)</label>
                            <select
                              value={alipaySubject}
                              onChange={(e) => setAlipaySubject(e.target.value)}
                              className="w-full bg-white border border-slate-200 focus:border-blue-500/50 rounded-xl py-3 px-4 text-slate-700 text-sm outline-none transition-all duration-300"
                            >
                              <option value="餐饮美食">餐饮美食 (FOOD)</option>
                              <option value="医疗健康">医疗健康 (HLTH)</option>
                              <option value="娱乐购物">娱乐购物 (SHOP)</option>
                              <option value="交通出行">交通出行 (TRAV)</option>
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">支付金额 (元 / Wei 1:1)</label>
                            <input
                              type="number"
                              min="1"
                              placeholder="请输入支付金额 (例如 50)"
                              value={alipayAmount}
                              onChange={(e) => setAlipayAmount(e.target.value)}
                              className="w-full bg-white border border-slate-200 focus:border-blue-500/50 rounded-xl py-3 px-4 text-slate-700 text-sm outline-none transition-all duration-300"
                              required
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={isAlipayLoading}
                          className="w-full mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-blue-400 disabled:to-indigo-400 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 transition-all duration-300 transform active:scale-[0.98] flex items-center justify-center space-x-2"
                        >
                          {isAlipayLoading ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                              <span>正在生成支付链接...</span>
                            </>
                          ) : (
                            <>
                              <span>💳 立即使用支付宝付款</span>
                            </>
                          )}
                        </button>
                      </form>
                    </div>

                    <AiAnalysisCard txs={historyTxs} role={role} />

                    <div className="bg-slate-50 border border-slate-200/60 rounded-[32px] p-8 shadow-sm">
                      <HistoryList txs={historyTxs} />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[32px] p-10 text-white shadow-xl shadow-blue-200">
                      <h3 className="text-2xl font-bold mb-4">您的钱包已受保护</h3>
                      <p className="text-blue-100 leading-relaxed mb-8 opacity-90">
                        {guardianInfo 
                          ? "系统正在实时监控您的支出。任何超过预设阈值的消费都将由您的监护人进行二次确认。" 
                          : "系统区块链网络已连接。请尽快绑定监护人以开启智能消费预警和审批功能。"}
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                          <p className="text-xs font-bold text-blue-200 uppercase tracking-wider mb-1">当前状态</p>
                          <p className="text-lg font-bold">运行中</p>
                        </div>
                        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                          <p className="text-xs font-bold text-blue-200 uppercase tracking-wider mb-1">智能合约</p>
                          <p className="text-lg font-bold">已验证</p>
                        </div>
                        {guardianInfo && (
                          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 col-span-2">
                            <p className="text-xs font-bold text-blue-200 uppercase tracking-wider mb-1">当前消费阈值 (超出需审批)</p>
                            <p className="text-lg font-bold">{myThreshold} 元</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 监护人绑定状态与管理 */}
                    <div className="bg-slate-50 border border-slate-200/60 rounded-[32px] p-8 shadow-sm">
                      <h4 className="text-lg font-bold text-slate-800 mb-4 flex items-center space-x-2">
                        <Shield className="w-5 h-5 text-indigo-500" />
                        <span>🛡️ 监护关系绑定管理</span>
                      </h4>

                      {guardianInfo ? (
                        <div className="bg-white border border-slate-100 rounded-2xl p-5 flex items-center justify-between shadow-sm">
                          <div className="flex items-center space-x-4">
                            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 flex-shrink-0">
                              <User className="w-6 h-6" />
                            </div>
                            <div>
                              <p className="text-slate-500 text-xs font-medium">当前监护人</p>
                              <p className="text-slate-800 font-bold text-base">{guardianInfo.accountName}</p>
                              <p className="text-slate-400 text-xs font-mono">{guardianInfo.phone}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setShowBindForm(!showBindForm)}
                            className="px-4 py-2 border border-slate-200 hover:border-indigo-500 hover:text-indigo-600 text-slate-600 rounded-xl text-xs font-bold transition-all"
                          >
                            {showBindForm ? '取消' : '更换监护人'}
                          </button>
                        </div>
                      ) : pendingGuardianInfo ? (
                        <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-5 flex items-center justify-between shadow-sm animate-pulse">
                          <div className="flex items-center space-x-4">
                            <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 flex-shrink-0">
                              <Clock className="w-6 h-6" />
                            </div>
                            <div>
                              <p className="text-amber-600 text-xs font-medium flex items-center space-x-1">
                                <span className="inline-block w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping mr-1"></span>
                                等待对方确认
                              </p>
                              <p className="text-slate-800 font-bold text-base">{pendingGuardianInfo.accountName}</p>
                              <p className="text-slate-400 text-xs font-mono">{pendingGuardianInfo.phone}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setShowBindForm(!showBindForm)}
                            className="px-4 py-2 border border-slate-200 hover:border-indigo-500 hover:text-indigo-600 text-slate-600 rounded-xl text-xs font-bold transition-all"
                          >
                            {showBindForm ? '取消' : '重新发起'}
                          </button>
                        </div>
                      ) : (
                        <div className="bg-red-50/30 border border-dashed border-red-200 rounded-2xl p-6 text-center">
                          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3 text-red-500">
                            <AlertTriangle className="w-6 h-6" />
                          </div>
                          <p className="text-slate-800 font-bold text-sm mb-1">您尚未绑定监护人</p>
                          <p className="text-slate-500 text-xs mb-4">为了保护您的钱包安全，请尽快添加并绑定一名监护人。</p>
                          {!showBindForm && (
                            <button
                              onClick={() => setShowBindForm(true)}
                              className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl text-xs font-bold shadow-md shadow-indigo-600/10 transition-all flex items-center space-x-2 mx-auto"
                            >
                              <UserPlus className="w-4 h-4" />
                              <span>立即添加监护人</span>
                            </button>
                          )}
                        </div>
                      )}

                      {showBindForm && (
                        <form onSubmit={handleBindGuardian} className="mt-4 bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4 animate-in slide-in-from-top-2 duration-300">
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">监护人手机号</label>
                            <div className="relative group">
                              <input
                                type="text"
                                placeholder="请输入已注册的监护人手机号"
                                value={bindPhone}
                                onChange={(e) => setBindPhone(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200/60 focus:border-indigo-500/50 rounded-xl py-3 px-4 text-slate-700 text-sm outline-none transition-all"
                              />
                            </div>
                          </div>
                          <div className="flex justify-end space-x-2">
                            <button
                              type="button"
                              onClick={() => setShowBindForm(false)}
                              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold transition-all"
                            >
                              取消
                            </button>
                            <button
                              type="submit"
                              disabled={isBinding}
                              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md shadow-indigo-600/10 transition-all flex items-center space-x-2"
                            >
                              {isBinding ? (
                                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                              ) : (
                                <span>提交申请</span>
                              )}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>

                    {/* 模拟支付宝交易测试 */}
                    <div className="bg-slate-50 border border-slate-200/60 rounded-[32px] p-8 shadow-sm">
                      <h4 className="text-lg font-bold text-slate-800 mb-4 flex items-center space-x-2">
                        <span className="text-xl">🛒</span>
                        <span>模拟支付宝交易测试</span>
                      </h4>
                      <p className="text-slate-500 text-xs mb-6">
                        输入商品类型和金额，点击立即支付将唤起支付宝沙箱收银台进行支付体验。支付成功后，预言机将自动把交易数据记录上链。
                      </p>

                      <form onSubmit={handleAlipayPay} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">商品类型 (上链类别)</label>
                            <select
                              value={alipaySubject}
                              onChange={(e) => setAlipaySubject(e.target.value)}
                              className="w-full bg-white border border-slate-200 focus:border-blue-500/50 rounded-xl py-3 px-4 text-slate-700 text-sm outline-none transition-all duration-300"
                            >
                              <option value="餐饮美食">餐饮美食 (FOOD)</option>
                              <option value="医疗健康">医疗健康 (HLTH)</option>
                              <option value="娱乐购物">娱乐购物 (SHOP)</option>
                              <option value="交通出行">交通出行 (TRAV)</option>
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">支付金额 (元 / Wei 1:1)</label>
                            <input
                              type="number"
                              min="1"
                              placeholder="请输入支付金额 (例如 50)"
                              value={alipayAmount}
                              onChange={(e) => setAlipayAmount(e.target.value)}
                              className="w-full bg-white border border-slate-200 focus:border-blue-500/50 rounded-xl py-3 px-4 text-slate-700 text-sm outline-none transition-all duration-300"
                              required
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={isAlipayLoading}
                          className="w-full mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-blue-400 disabled:to-indigo-400 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 transition-all duration-300 transform active:scale-[0.98] flex items-center justify-center space-x-2"
                        >
                          {isAlipayLoading ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                              <span>正在生成支付链接...</span>
                            </>
                          ) : (
                            <>
                              <span>💳 立即使用支付宝付款</span>
                            </>
                          )}
                        </button>
                      </form>
                    </div>
                    
                    <AiAnalysisCard txs={historyTxs} role={role} />

                    <div className="bg-slate-50 border border-slate-200/60 rounded-[32px] p-8 shadow-sm">
                      <HistoryList txs={historyTxs} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
        <div className="mt-8 text-center">
          <p className="text-gray-400 text-sm font-medium">
            Blockchain Empowerment • Guardianship Safety Protocol v1.0
          </p>
        </div>
      </div>
      {/* 支付宝扫码支付弹窗 */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          {/* 背景遮罩 */}
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
          ></div>
          
          {/* 模态框卡片 */}
          <div className="relative bg-white/90 backdrop-blur-lg border border-white rounded-[32px] max-w-sm w-full p-8 text-center shadow-2xl shadow-slate-900/30 animate-in zoom-in-95 duration-200">
            {/* 头部 */}
            <div className="flex items-center justify-center space-x-2.5 mb-6">
              <div className="w-10 h-10 bg-blue-500 rounded-2xl flex items-center justify-center shadow-md shadow-blue-500/20">
                <span className="text-white text-xl font-bold">支</span>
              </div>
              <div className="text-left">
                <h3 className="font-extrabold text-slate-800 text-lg">支付宝扫码支付</h3>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Alipay Sandbox QR Pay</p>
              </div>
            </div>

            {/* 二维码容器 */}
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 mb-6 inline-block shadow-inner">
              {qrCodeUrl ? (
                <img 
                  src={qrCodeUrl} 
                  alt="支付二维码" 
                  className="w-48 h-48 mx-auto rounded-lg select-none"
                  style={{ imageRendering: 'pixelated' }}
                />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center">
                  <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div>
                </div>
              )}
            </div>

            {/* 状态文字和加载动画 */}
            <div className="flex flex-col items-center justify-center space-y-2 mb-6">
              <div className="flex items-center justify-center space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping"></div>
                <p className="text-sm font-bold text-slate-600 animate-pulse">正在等待支付，请扫码...</p>
              </div>
              <div className="flex items-center space-x-1.5 bg-slate-100/80 px-3 py-1 rounded-full text-[11px] font-bold text-slate-500">
                <Clock className="w-3.5 h-3.5 text-blue-500 animate-spin" style={{ animationDuration: '3s' }} />
                <span>二维码将在 <span className="text-blue-600 font-mono font-extrabold">{qrCountdown}</span> 秒后自动刷新</span>
              </div>
            </div>

            {/* 提示 */}
            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              请打开手机上的支付宝沙箱版 App，扫描上方二维码完成支付。支付成功后，系统将自动记录并归档上链。
            </p>

            {/* 按钮 */}
            <button
              onClick={handleCloseQrModal}
              className="w-full bg-slate-100 hover:bg-slate-200/80 active:scale-[0.98] text-slate-600 hover:text-slate-800 font-bold py-3.5 px-6 rounded-xl transition-all duration-200 text-sm shadow-sm"
            >
              取消支付
            </button>
          </div>
        </div>
      )}
      <ToastContainer hideProgressBar />
    </div>
  );
}

export default App;
