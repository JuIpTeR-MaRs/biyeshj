import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Shield, User, UserPlus, Users, Clock, AlertTriangle, QrCode, ShoppingBag } from 'lucide-react';
import { Navbar } from './components/layout/Navbar';
import { PendingList } from './components/PendingList';
import { LoginPage } from './components/Login/LoginPage';
import { RequestList } from './components/RequestList';
import { HistoryList } from './components/HistoryList';
import { AdminDashboard } from './components/Admin/AdminDashboard';
import { AiAnalysisCard } from './components/AiAnalysis/AiAnalysisCard';
import { MerchantDashboard } from './components/Merchant/MerchantDashboard';
import { MessageCenter } from './components/MessageCenter';
import { getContract, CONTRACT_ADDRESS, fundAccount } from './utils/contract';
import { getLocalBankUser } from './utils/bankAccount';

// Global tracking to prevent duplicate notifications for the same order across component lifecycles or polling/postMessage races
const notifiedTrades = new Set();

function App() {
  const [account, setAccount] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState(null);
  const [pendingTxs, setPendingTxs] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(false);

  // 消息中心状态
  const [messages, setMessages] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('bank_messages') || '[]');
    } catch {
      return [];
    }
  });
  const [showMessageCenter, setShowMessageCenter] = useState(false);
  
  const addMessage = useCallback((title, content, type) => {
    const newMsg = {
      id: Date.now() + Math.random().toString(36).substr(2, 5),
      title, content, type, time: new Date().toISOString(), read: false
    };
    setMessages(prev => {
      const updated = [newMsg, ...prev].slice(0, 50);
      localStorage.setItem('bank_messages', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const handleMarkAllRead = () => {
    setMessages(prev => {
      const updated = prev.map(m => ({ ...m, read: true }));
      localStorage.setItem('bank_messages', JSON.stringify(updated));
      return updated;
    });
  };

  const handleClearMessages = () => {
    setMessages([]);
    localStorage.removeItem('bank_messages');
  };

  // 监护人/被监护人状态
  const [guardianInfo, setGuardianInfo] = useState(null);
  const [guardianInfos, setGuardianInfos] = useState([]);
  const [pendingGuardianInfo, setPendingGuardianInfo] = useState(null);
  const [activeWards, setActiveWards] = useState([]);
  const [myThreshold, setMyThreshold] = useState("0");
  const [editingThreshold, setEditingThreshold] = useState(null);
  const [isUpdatingThreshold, setIsUpdatingThreshold] = useState(false);

  // 仿真扫码状态
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [scannedMerchant, setScannedMerchant] = useState(null);
  const [scanAmount, setScanAmount] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isScanPaying, setIsScanPaying] = useState(false);

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
  const qrOutTradeNoRef = useRef(qrOutTradeNo);
  useEffect(() => {
    qrOutTradeNoRef.current = qrOutTradeNo;
  }, [qrOutTradeNo]);
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
    setGuardianInfos([]);
    setPendingGuardianInfo(null);
    setActiveWards([]);
  };

  const fetchData = useCallback(async () => {
    if (!account) return;
    if (account === 'admin') {
      setRole('admin');
      return;
    }
    const currentUser = getLocalBankUser() || {};
    if (currentUser.role === 'merchant') {
      setRole('merchant');
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
          const isG = await contract.isWardGuardian(accInfo.address, account);
          if (isG) {
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
      let activeGuardians = [];
      let reqGuardian = "0x0000000000000000000000000000000000000000";
      try {
        activeGuardians = await contract.getWardGuardians(account);
        reqGuardian = await contract.pendingWardToGuardian(account);
      } catch (e) {
        console.error("Query ward status error:", e);
      }

      const zeroAddr = "0x0000000000000000000000000000000000000000";
      
      const guardianInfosList = [];
      if (activeGuardians && activeGuardians.length > 0) {
        for (const gAddr of activeGuardians) {
          if (gAddr && gAddr !== zeroAddr) {
            const info = allAccounts.find(a => a.address.toLowerCase() === gAddr.toLowerCase());
            guardianInfosList.push(info || { address: gAddr, accountName: "已绑定监护人" });
          }
        }
      }
      setGuardianInfos(guardianInfosList);
      setGuardianInfo(guardianInfosList[0] || null);

      if (reqGuardian && reqGuardian !== zeroAddr) {
        const info = allAccounts.find(a => a.address.toLowerCase() === reqGuardian.toLowerCase());
        setPendingGuardianInfo(info || { address: reqGuardian, accountName: "等待确认的监护人" });
      } else {
        setPendingGuardianInfo(null);
      }

      // 5. 角色判定
      let resolvedRole = 'ward';
      if (currentUser.role === 'merchant') {
        resolvedRole = 'merchant';
      } else {
        const hasWards = wardsList.length > 0;
        const isGuardianOnChain = ids.length > 0 || txDetails.length > 0 || requests.length > 0 || hasWards;
        const isGuardian = isGuardianOnChain || currentUser.role === 'guardian';
        resolvedRole = isGuardian ? 'guardian' : 'ward';
      }
      setRole(resolvedRole);

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

      const currentRole = resolvedRole === 'guardian' ? 'guardian' : 'ward';
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
      toast.error(err.reason || "绑定申请失败，请重支");
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

  // 仿真扫码付款方法
  const handleOpenScan = () => {
    setShowScanModal(true);
    setScanInput('');
    setScannedMerchant(null);
    setScanAmount('');
  };

  const handleSimulateScan = (merchantData) => {
    setIsScanning(true);
    setTimeout(() => {
      try {
        const info = typeof merchantData === 'string' ? JSON.parse(merchantData) : merchantData;
        if (info.merchantAddress && info.merchantName) {
          setScannedMerchant(info);
          toast.success(`扫码成功！已连接到 [${info.merchantName}] 收款端`);
        } else {
          toast.error("无效的收款码数据，格式不正确");
        }
      } catch (e) {
        toast.error("无法解析收款码数据，请确认格式");
      } finally {
        setIsScanning(false);
      }
    }, 800);
  };

  const handleScanPay = async (e) => {
    e.preventDefault();
    if (!scanAmount || isNaN(scanAmount) || parseFloat(scanAmount) <= 0) {
      toast.error("请输入有效的付款金额");
      return;
    }
    setIsScanPaying(true);
    try {
      const response = await fetch("/api/alipay/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(scanAmount),
          subject: scannedMerchant.merchantType || "娱乐购物",
          wardAddress: account,
          merchantAddress: scannedMerchant.merchantAddress
        })
      });
      const data = await response.json();
      if (data.success && data.qrCode) {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(data.qrCode)}`;
        setQrCodeUrl(qrUrl);
        setQrOutTradeNo(data.outTradeNo);
        setQrCountdown(60);
        setShowScanModal(false);
        setShowQrModal(true);
        startPolling(data.outTradeNo);
      } else if (data.riskIntercepted) {
        toast.warn(data.message || "交易触发消费限制，已提交至监护人进行审批！");
        setShowScanModal(false);
        fetchData();
      } else {
        toast.error(data.error || "交易失败");
      }
    } catch (err) {
      console.error(err);
      toast.error("付款请求失败，请检查网络");
    } finally {
      setIsScanPaying(false);
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
            handlePaymentSuccessRef.current(outTradeNo);
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

  // 正在支付的已审批交易ID
  const [payingTxId, setPayingTxId] = useState(null);
  const payingTxIdRef = useRef(null);
  const lastNotifiedRef = useRef(null);
  const lastToastTimeRef = useRef(0);

  const handlePaymentSuccess = useCallback((optOutTradeNo) => {
    const tradeNo = optOutTradeNo || qrOutTradeNoRef.current;
    const now = Date.now();

    if (tradeNo) {
      if (notifiedTrades.has(tradeNo) || lastNotifiedRef.current === tradeNo) {
        return;
      }
      notifiedTrades.add(tradeNo);
      lastNotifiedRef.current = tradeNo;
    }

    if (now - lastToastTimeRef.current < 4000) {
      return;
    }
    lastToastTimeRef.current = now;

    toast.success("🏆 支付宝支付成功，已安全记录并同步上链！");
    const currentTxId = payingTxIdRef.current;
    if (currentTxId) {
      localStorage.setItem(`paid_tx_${currentTxId}`, 'true');
      payingTxIdRef.current = null;
      setPayingTxId(null);
    }
    fetchData();
  }, [fetchData]);

  const handlePaymentSuccessRef = useRef(handlePaymentSuccess);
  useEffect(() => {
    handlePaymentSuccessRef.current = handlePaymentSuccess;
  }, [handlePaymentSuccess]);

  const handleContinuePay = useCallback(async (tx) => {
    setLoading(true);
    payingTxIdRef.current = tx.id;
    setPayingTxId(tx.id);
    try {
      const response = await fetch("/api/alipay/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(tx.amount),
          subject: tx.merchantType,
          wardAddress: account,
          approvedTxId: tx.id
        })
      });
      const data = await response.json();
      if (data.success && data.qrCode) {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(data.qrCode)}`;
        setQrCodeUrl(qrUrl);
        setQrOutTradeNo(data.outTradeNo);
        setQrCountdown(60);
        setShowQrModal(true);
        startPolling(data.outTradeNo);
      } else {
        toast.error(data.error || "生成支付二维码失败");
        payingTxIdRef.current = null;
        setPayingTxId(null);
      }
    } catch (err) {
      console.error(err);
      toast.error("预生成支付订单失败，请检查网络");
      payingTxIdRef.current = null;
      setPayingTxId(null);
    } finally {
      setLoading(false);
    }
  }, [account, startPolling]);

  const handleContinuePayRef = useRef(handleContinuePay);
  useEffect(() => {
    handleContinuePayRef.current = handleContinuePay;
  }, [handleContinuePay]);

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
        addMessage(
          "触发消费预警",
          `系统拦截了一笔金额为 ${amount.toString()} Wei 的可疑消费，已提交给监护人进行审批。`,
          "pending"
        );
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
        addMessage(
          "消费自动通过",
          `您有一笔金额为 ${amount.toString()} Wei 的安全消费已自动通过风控。`,
          "approved"
        );
      } else if (curRole === 'guardian' && curActiveWards.some(w => w.address.toLowerCase() === ward.toLowerCase())) {
        toast.info(`ℹ️ 被监护成员完成一笔自动允许 of 消费: ${amount.toString()} 元`, {
          position: "top-right",
          autoClose: 5000
        });
        fetchData();
      }
    };

    const onConfirmed = async (txId, guardian) => {
      if (Date.now() - subscriptionTime < 2000) return;
      await fetchData();
      addMessage(
        "消费审批通过",
        `您的交易订单 ID:${txId} 已被监护人批准，系统已自动弹出支付界面，请尽快完成支付。`,
        "approved"
      );
      
      // Auto popup pay interface if the current user is the ward of this transaction
      if (roleRef.current === 'ward') {
        try {
          const contract = await getContract();
          const tx = await contract.transactions(txId);
          if (tx[1].toLowerCase() === accountRef.current.toLowerCase() && tx[6] === true) {
            toast.success(`🎉 交易 ID:${txId} 审批已通过，正在为您调起支付界面...`);
            const txObj = {
              id: tx[0].toString(),
              ward: tx[1],
              amount: tx[2].toString(),
              timestamp: Number(tx[3]),
              merchantType: tx[4],
              isPending: tx[5],
              isApproved: tx[6]
            };
            handleContinuePayRef.current(txObj);
          }
        } catch (e) {
          console.error("Auto popup pay error:", e);
        }
      }
    };

    const onRejected = async (txId, guardian) => {
      if (Date.now() - subscriptionTime < 2000) return;
      await fetchData();
      addMessage(
        "消费审批拒绝",
        `您的交易订单 ID:${txId} 已被监护人拒绝，无法继续支付。`,
        "rejected"
      );
    };

    const setupListeners = async () => {
      if (account && isLoggedIn) {
        fetchData();
        contractInstance = await getContract();
        if (contractInstance) {
          contractInstance.on("PaymentPendingApproval", onPending);
          contractInstance.on("PaymentAutoApproved", onAutoApproved);
          contractInstance.on("TransactionConfirmed", onConfirmed);
          contractInstance.on("TransactionRejected", onRejected);
        }
      }
    };

    const setupListenersRef = setupListeners;
    setupListenersRef();

    return () => {
      if (contractInstance) {
        contractInstance.off("PaymentPendingApproval", onPending);
        contractInstance.off("PaymentAutoApproved", onAutoApproved);
        contractInstance.off("TransactionConfirmed", onConfirmed);
        contractInstance.off("TransactionRejected", onRejected);
      }
    };
  }, [account, isLoggedIn, fetchData]);

  useEffect(() => {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        const handleAlipaySuccess = () => {
          handlePaymentSuccessRef.current();
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
  }, []);

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data === 'alipay-success') {
        handlePaymentSuccessRef.current();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (!isLoggedIn) {
    return <LoginPage onLogin={connectWallet} />;
  }

  if (role === 'admin') {
    return <AdminDashboard onLogout={handleLogout} />;
  }

  if (role === 'merchant') {
    const currentUser = getLocalBankUser();
    return <MerchantDashboard account={currentUser} onLogout={handleLogout} />;
  }

  return (
    <div className={`min-h-screen bg-slate-955 text-slate-100 ${role === 'guardian' ? 'selection:bg-blue-500/30' : 'selection:bg-emerald-500/30'} font-sans relative overflow-hidden`}>
      {/* Background glowing widgets */}
      <div className={`absolute top-[-10%] left-[-10%] w-[50%] h-[50%] blur-[130px] rounded-full pointer-events-none duration-[6000ms] animate-pulse ${
        role === 'guardian' ? 'bg-blue-600/10' : 'bg-emerald-600/10'
      }`}></div>
      <div className={`absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] blur-[130px] rounded-full pointer-events-none duration-[6000ms] animate-pulse ${
        role === 'guardian' ? 'bg-indigo-600/10' : 'bg-teal-600/10'
      }`} style={{ animationDelay: '2s' }}></div>

      <div className="max-w-6xl mx-auto py-10 px-6 relative z-10 space-y-8 animate-in fade-in zoom-in-95 duration-500">
        {/* Navigation / Navbar Wrapper */}
        <div className="bg-slate-900/70 backdrop-blur-xl border border-slate-700/50 rounded-[32px] shadow-2xl overflow-hidden">
          <Navbar 
            currentUser={getLocalBankUser()} 
            role={role} 
            onLogout={handleLogout} 
            unreadCount={messages.filter(m => !m.read).length}
            onOpenMessages={() => setShowMessageCenter(true)}
          />
        </div>

        <MessageCenter 
          isOpen={showMessageCenter} 
          onClose={() => setShowMessageCenter(false)} 
          messages={messages}
          onMarkAllRead={handleMarkAllRead}
          onClearMessages={handleClearMessages}
        />

        <div className="space-y-8">
          <div className="flex items-center justify-between bg-slate-900/20 border border-slate-700/50 rounded-2xl px-5 py-3 shadow-inner">
            <div className="flex items-center space-x-3">
              <div className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest ${
                role === 'guardian' 
                  ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400 shadow-sm shadow-blue-500/5' 
                  : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-sm shadow-emerald-500/5'
              }`}>
                {role === 'guardian' ? '🛡️ 监护人视角' : '👤 被监护人视角'}
              </div>
            </div>
            <p className="text-sm text-slate-400 font-bold uppercase tracking-wider font-sans">Blockchain Safety Dashboard</p>
          </div>

          {role === 'guardian' ? (
            <div className="space-y-8">
              {/* 被监护人列表 */}
              <div className="bg-slate-900/70 backdrop-blur-xl border border-slate-700/50 rounded-[32px] p-8 shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                  <h4 className="text-lg font-bold text-white flex items-center space-x-2">
                    <Users className="w-5 h-5 text-blue-400" />
                    <span>👥 我管理的被监护成员</span>
                  </h4>
                  {!showAddWardForm && (
                    <button
                      onClick={() => setShowAddWardForm(true)}
                      className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md shadow-blue-600/10 transition-all duration-300 flex items-center space-x-1.5 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>添加成员</span>
                    </button>
                  )}
                </div>

                {showAddWardForm && (
                  <form onSubmit={handleAddWard} className="mb-6 bg-slate-950/60 border border-slate-850 rounded-2xl p-5 shadow-2xl space-y-4 animate-in slide-in-from-top-2 duration-300">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-400 uppercase tracking-widest px-1">被监护人手机号</label>
                      <div className="relative group">
                        <input
                          type="text"
                          placeholder="请输入已注册的被监护人手机号"
                          value={wardPhoneInput}
                          onChange={(e) => setWardPhoneInput(e.target.value)}
                          className="w-full bg-slate-900/50 border border-slate-800 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 rounded-xl py-3 px-4 text-white text-sm outline-none transition-all duration-300"
                        />
                      </div>
                      <p className="text-sm text-slate-400">系统将代表被监护人发送绑定请求，并由您立即自动确认，实现一键绑定。</p>
                    </div>
                    <div className="flex justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => setShowAddWardForm(false)}
                        className="px-4 py-2 border border-slate-850 bg-slate-900/20 hover:bg-slate-900/50 text-slate-400 hover:text-white rounded-xl text-xs font-bold transition-all duration-300"
                      >
                        取消
                      </button>
                      <button
                        type="submit"
                        disabled={isAddingWard}
                        className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-blue-800 disabled:to-indigo-800 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md shadow-blue-600/10 transition-all duration-300 flex items-center space-x-2"
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
                      <div key={idx} className="bg-slate-950/40 border border-slate-850 rounded-2xl p-4 flex items-center space-x-3 shadow-sm hover:border-blue-500/20 hover:bg-slate-900/20 transition-all duration-300">
                        <div className="w-10 h-10 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center text-blue-400 flex-shrink-0">
                          <User className="w-5 h-5" />
                        </div>
                        <div className="overflow-hidden flex-1">
                          <p className="text-white font-bold text-sm truncate">{ward.accountName}</p>
                          <p className="text-slate-400 text-sm font-mono leading-none mb-1">{ward.phone}</p>
                          <p className="text-slate-400 text-xs tracking-wide font-mono truncate">{ward.address}</p>
                          <p className="text-blue-400 text-[11px] font-bold mt-1">当前消费阈值: {ward.threshold} 元</p>
                        </div>
                        <div className="flex flex-col space-y-2 flex-shrink-0">
                          {editingThreshold?.address === ward.address ? (
                            <div className="flex items-center space-x-2">
                              <input 
                                type="number" 
                                className="w-20 bg-slate-950/40 border border-slate-850 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500/50" 
                                value={editingThreshold.amount}
                                onChange={e => setEditingThreshold({...editingThreshold, amount: e.target.value})}
                              />
                              <button 
                                onClick={() => handleUpdateThreshold(ward.address, editingThreshold.amount)}
                                disabled={isUpdatingThreshold}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-xs transition-colors duration-300"
                              >保存</button>
                              <button 
                                onClick={() => setEditingThreshold(null)}
                                className="bg-slate-855 hover:bg-slate-800 text-slate-400 px-2 py-1 rounded text-xs transition-colors duration-300"
                              >取消</button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => setEditingThreshold({ address: ward.address, amount: ward.threshold })}
                              className="px-3 py-1.5 border border-blue-500/20 hover:bg-blue-500/10 text-blue-400 rounded-xl text-xs font-bold transition-all duration-300"
                            >
                              修改阈值
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-slate-950/40 border border-slate-850 rounded-2xl p-8 text-center">
                    <div className="w-12 h-12 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-400">
                      <Users className="w-6 h-6" />
                    </div>
                    <p className="text-white font-bold text-sm mb-1">您尚未绑定被监护成员</p>
                    <p className="text-slate-400 text-xs">点击右上角“添加成员”按钮，快速绑定家人账户进行监护。</p>
                  </div>
                )}
              </div>

              <RequestList requests={pendingRequests} onAction={handleRequestAction} loading={loading} />
              <PendingList txs={pendingTxs} onAction={handleAction} loading={loading} />

              {/* 模拟支付宝交易测试 */}
              <div className="bg-slate-900/70 backdrop-blur-xl border border-slate-700/50 rounded-[32px] p-8 shadow-2xl">
                <h4 className="text-lg font-bold text-white mb-4 flex items-center space-x-2">
                  <span className="text-xl">🛒</span>
                  <span>模拟支付宝交易测试</span>
                </h4>
                <p className="text-slate-400 text-xs mb-6">
                  输入商品类型和金额，点击立即支付将唤起支付宝沙箱收银台进行支付体验。支付成功后，预言机将自动把交易数据记录上链。
                </p>

                <form onSubmit={handleAlipayPay} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-400 uppercase tracking-widest px-1">商品类型 (上链类别)</label>
                      <select
                        value={alipaySubject}
                        onChange={(e) => setAlipaySubject(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500/50 rounded-xl py-3 px-4 text-white text-sm outline-none transition-all duration-300"
                      >
                        <option value="餐饮美食" className="bg-slate-900 text-white">餐饮美食 (FOOD)</option>
                        <option value="医疗健康" className="bg-slate-900 text-white">医疗健康 (HLTH)</option>
                        <option value="娱乐购物" className="bg-slate-900 text-white">娱乐购物 (SHOP)</option>
                        <option value="交通出行" className="bg-slate-900 text-white">交通出行 (TRAV)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-400 uppercase tracking-widest px-1">支付金额 (元 / Wei 1:1)</label>
                      <input
                        type="number"
                        min="1"
                        placeholder="请输入支付金额 (例如 50)"
                        value={alipayAmount}
                        onChange={(e) => setAlipayAmount(e.target.value)}
                        className="w-full bg-slate-955 border border-slate-800 focus:border-blue-500/50 rounded-xl py-3 px-4 text-white text-sm outline-none transition-all duration-300"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isAlipayLoading}
                    className="w-full mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-blue-800 disabled:to-indigo-800 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 transition-all duration-300 transform active:scale-[0.98] flex items-center justify-center space-x-2"
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

              <div className="bg-slate-900/70 backdrop-blur-xl border border-slate-700/50 rounded-[32px] p-8 shadow-2xl">
                <HistoryList txs={historyTxs} role={role} onContinuePay={handleContinuePay} />
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="bg-gradient-to-br from-slate-900 via-emerald-955/20 to-slate-900 border border-emerald-500/20 rounded-[32px] p-10 text-white shadow-xl shadow-emerald-500/5 relative overflow-hidden">
                <div className="absolute top-[-30%] right-[-10%] w-[50%] h-[50%] bg-emerald-500/10 blur-[80px] rounded-full pointer-events-none"></div>
                <h3 className="text-2xl font-bold mb-4">您的钱包已受保护</h3>
                <p className="text-slate-400 leading-relaxed mb-8 opacity-90 text-sm max-w-2xl font-sans">
                  {guardianInfos.length > 0 
                    ? "系统正在实时监控您的支出。任何超过预设阈值的消费都将由您的监护人进行二次确认。" 
                    : "系统区块链网络已连接。请尽快绑定监护人以开启智能消费预警和审批功能。"}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-slate-950/60 backdrop-blur-md rounded-2xl p-4 border border-slate-850/60">
                    <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">当前状态</p>
                    <p className="text-lg font-bold text-slate-100">运行中</p>
                  </div>
                  <div className="bg-slate-950/60 backdrop-blur-md rounded-2xl p-4 border border-slate-850/60">
                    <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">智能合约</p>
                    <p className="text-lg font-bold text-slate-100">已验证</p>
                  </div>
                  {guardianInfos.length > 0 && (
                    <div className="bg-slate-950/60 backdrop-blur-md rounded-2xl p-4 border border-slate-850/60 col-span-2 md:col-span-1">
                      <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">当前消费阈值 (超出需审批)</p>
                      <p className="text-lg font-bold text-emerald-400">{myThreshold} 元</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 监护人绑定状态与管理 */}
              <div className="bg-slate-900/70 backdrop-blur-xl border border-slate-700/50 rounded-[32px] p-8 shadow-2xl">
                <h4 className="text-lg font-bold text-white mb-4 flex items-center space-x-2">
                  <Shield className="w-5 h-5 text-emerald-400" />
                  <span>🛡️ 监护关系绑定管理</span>
                </h4>

                {guardianInfos.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center px-1">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">已绑定监护人 ({guardianInfos.length})</span>
                      <button
                        onClick={() => setShowBindForm(!showBindForm)}
                        className="px-4 py-2 border border-slate-850 hover:border-emerald-500/30 hover:text-emerald-400 text-slate-400 rounded-xl text-xs font-bold transition-all duration-300"
                      >
                        {showBindForm ? '取消' : '添加监护人'}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {guardianInfos.map((g, idx) => (
                        <div key={idx} className="bg-slate-950/40 border border-slate-850 rounded-2xl p-4 flex items-center justify-between shadow-sm hover:border-emerald-500/20 hover:bg-slate-900/20 transition-all duration-300">
                          <div className="flex items-center space-x-3 overflow-hidden">
                            <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400 flex-shrink-0">
                              <User className="w-5 h-5" />
                            </div>
                            <div className="overflow-hidden">
                              <p className="text-white font-bold text-sm truncate">{g.accountName}</p>
                              <p className="text-slate-400 text-sm font-mono leading-none mb-1">{g.phone}</p>
                              <p className="text-slate-400 text-xs tracking-wide font-mono truncate">{g.address}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : pendingGuardianInfo ? (
                  <div className="bg-amber-500/5 border border-amber-500/15 rounded-2xl p-5 flex items-center justify-between shadow-sm animate-pulse">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center text-amber-400 flex-shrink-0">
                        <Clock className="w-6 h-6 animate-spin" style={{ animationDuration: '4s' }} />
                      </div>
                      <div>
                        <p className="text-amber-400 text-xs font-bold flex items-center space-x-1">
                          <span className="inline-block w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping mr-1"></span>
                          等待对方确认
                        </p>
                        <p className="text-white font-bold text-base mt-0.5">{pendingGuardianInfo.accountName}</p>
                        <p className="text-slate-400 text-xs font-mono">{pendingGuardianInfo.phone}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowBindForm(!showBindForm)}
                      className="px-4 py-2 border border-slate-855 hover:border-emerald-500/30 hover:text-emerald-400 text-slate-400 rounded-xl text-xs font-bold transition-all duration-300"
                    >
                      {showBindForm ? '取消' : '重新发起'}
                    </button>
                  </div>
                ) : (
                  <div className="bg-rose-500/5 border border-dashed border-rose-500/20 rounded-2xl p-6 text-center">
                    <div className="w-12 h-12 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-3 text-rose-500">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <p className="text-white font-bold text-sm mb-1">您尚未绑定监护人</p>
                    <p className="text-slate-400 text-xs mb-4">为了保护您的钱包安全，请尽快添加并绑定一名监护人。</p>
                    {!showBindForm && (
                      <button
                        onClick={() => setShowBindForm(true)}
                        className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-6 py-2.5 rounded-xl text-xs font-bold shadow-md shadow-emerald-500/10 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] flex items-center space-x-2 mx-auto"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>立即添加监护人</span>
                      </button>
                    )}
                  </div>
                )}

                {showBindForm && (
                  <form onSubmit={handleBindGuardian} className="mt-4 bg-slate-950/60 border border-slate-850 rounded-2xl p-5 shadow-2xl space-y-4 animate-in slide-in-from-top-2 duration-300">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-400 uppercase tracking-widest px-1">监护人手机号</label>
                      <div className="relative group">
                        <input
                          type="text"
                          placeholder="请输入已注册的监护人手机号"
                          value={bindPhone}
                          onChange={(e) => setBindPhone(e.target.value)}
                          className="w-full bg-slate-900/50 border border-slate-800 focus:border-emerald-500/50 rounded-xl py-3 px-4 text-white text-sm outline-none transition-all duration-300"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => setShowBindForm(false)}
                        className="px-4 py-2 border border-slate-850 bg-slate-900/20 hover:bg-slate-900/50 text-slate-400 hover:text-white rounded-xl text-xs font-bold transition-all duration-300"
                      >
                        取消
                      </button>
                      <button
                        type="submit"
                        disabled={isBinding}
                        className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md shadow-emerald-500/10 transition-all duration-300 flex items-center space-x-2"
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

              {/* 扫码付款 */}
              <div className="bg-gradient-to-br from-slate-900 via-emerald-950/10 to-slate-900 border border-emerald-500/10 rounded-[32px] p-8 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-[-30%] right-[-10%] w-[50%] h-[50%] bg-emerald-500/5 blur-[80px] rounded-full pointer-events-none"></div>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                  <div className="space-y-1.5">
                    <h4 className="text-lg font-bold flex items-center space-x-2">
                      <span className="text-xl">📷</span>
                      <span>扫描商家收款码付款</span>
                    </h4>
                    <p className="text-slate-400 text-xs max-w-xl leading-relaxed font-sans">
                      模拟扫描店内的静态收款二维码，支持动态配置消费类型的特约商户，系统会自动核对监护人设定的风控规则。
                    </p>
                  </div>
                  <button
                    onClick={handleOpenScan}
                    className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black px-6 py-3.5 rounded-2xl text-xs transition-all duration-300 shadow-md shadow-emerald-500/10 active:scale-95 shrink-0 hover:scale-[1.02]"
                  >
                    立即扫码付款
                  </button>
                </div>
              </div>

              {/* 模拟支付宝交易测试 */}
              <div className="bg-slate-900/70 backdrop-blur-xl border border-slate-700/50 rounded-[32px] p-8 shadow-2xl">
                <h4 className="text-lg font-bold text-white mb-4 flex items-center space-x-2">
                  <span className="text-xl">🛒</span>
                  <span>模拟支付宝交易测试</span>
                </h4>
                <p className="text-slate-400 text-xs mb-6">
                  输入商品类型和金额，点击立即支付将唤起支付宝沙箱收银台进行支付体验。支付成功后，预言机将自动把交易数据记录上链。
                </p>

                <form onSubmit={handleAlipayPay} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-400 uppercase tracking-widest px-1">商品类型 (上链类别)</label>
                      <select
                        value={alipaySubject}
                        onChange={(e) => setAlipaySubject(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500/50 rounded-xl py-3 px-4 text-white text-sm outline-none transition-all duration-300"
                      >
                        <option value="餐饮美食" className="bg-slate-900 text-white">餐饮美食 (FOOD)</option>
                        <option value="医疗健康" className="bg-slate-900 text-white">医疗健康 (HLTH)</option>
                        <option value="娱乐购物" className="bg-slate-900 text-white">娱乐购物 (SHOP)</option>
                        <option value="交通出行" className="bg-slate-900 text-white">交通出行 (TRAV)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-400 uppercase tracking-widest px-1">支付金额 (元 / Wei 1:1)</label>
                      <input
                        type="number"
                        min="1"
                        placeholder="请输入支付金额 (例如 50)"
                        value={alipayAmount}
                        onChange={(e) => setAlipayAmount(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500/50 rounded-xl py-3 px-4 text-white text-sm outline-none transition-all duration-300"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isAlipayLoading}
                    className="w-full mt-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-emerald-800 disabled:to-emerald-800 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 transition-all duration-300 transform active:scale-[0.98] flex items-center justify-center space-x-2"
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

              <div className="bg-slate-900/70 backdrop-blur-xl border border-slate-700/50 rounded-[32px] p-8 shadow-2xl">
                <HistoryList txs={historyTxs} role={role} onContinuePay={handleContinuePay} />
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 text-center border-t border-slate-900 pt-6">
          <p className="text-slate-600 text-xs font-bold uppercase tracking-wider">
            Blockchain Empowerment • Guardianship Safety Protocol v1.0
          </p>
        </div>
      </div>

      {/* 支付宝扫码支付弹窗 */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"></div>
          
          <div className="relative bg-slate-900 border border-slate-800/80 rounded-[32px] max-w-sm w-full p-8 text-center shadow-2xl shadow-slate-950/50 animate-in zoom-in-95 duration-200 text-white">
            <div className="flex items-center justify-center space-x-2.5 mb-6">
              <div className="w-10 h-10 bg-blue-500 rounded-2xl flex items-center justify-center shadow-md shadow-blue-500/20">
                <span className="text-slate-950 text-xl font-black">支</span>
              </div>
              <div className="text-left">
                <h3 className="font-extrabold text-white text-lg">支付宝扫码支付</h3>
                <p className="text-sm text-slate-400 font-bold uppercase tracking-wider">Alipay Sandbox QR Pay</p>
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-850 rounded-[24px] p-5 mb-6 inline-block shadow-inner">
              {qrCodeUrl ? (
                <img 
                  src={qrCodeUrl} 
                  alt="支付二维码" 
                  className="w-48 h-48 mx-auto rounded-lg select-none object-contain"
                  style={{ imageRendering: 'pixelated' }}
                />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center">
                  <div className="w-8 h-8 border-4 border-slate-800 border-t-blue-500 rounded-full animate-spin"></div>
                </div>
              )}
            </div>

            <div className="flex flex-col items-center justify-center space-y-2 mb-6">
              <div className="flex items-center justify-center space-x-2">
                <div className={`w-2 h-2 rounded-full animate-ping ${role === 'ward' ? 'bg-emerald-500' : 'bg-blue-500'}`}></div>
                <p className="text-sm font-bold text-slate-300 animate-pulse">正在等待支付，请扫码...</p>
              </div>
              <div className="flex items-center space-x-1.5 bg-slate-950/60 border border-slate-850 px-3 py-1.5 rounded-full text-sm font-bold text-slate-400">
                <Clock className="w-3.5 h-3.5 text-blue-400 animate-spin" style={{ animationDuration: '3s' }} />
                <span>二维码将在 <span className="text-blue-400 font-mono font-extrabold">{qrCountdown}</span> 秒后自动刷新</span>
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              请打开手机上的支付宝沙箱版 App，扫描上方二维码完成支付。支付成功后，系统将自动记录并归档上链。
            </p>

            <button
              onClick={handleCloseQrModal}
              className="w-full bg-slate-950 border border-slate-850 hover:bg-slate-900/70 active:scale-[0.98] text-slate-400 hover:text-white font-bold py-3.5 px-6 rounded-xl transition-all duration-300 text-sm shadow-sm"
            >
              取消支付
            </button>
          </div>
        </div>
      )}

      {/* 仿真扫码付款弹窗 */}
      {showScanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setShowScanModal(false)}></div>
          <div className="relative bg-slate-900 border border-slate-800/80 rounded-[32px] max-w-md w-full p-8 shadow-2xl shadow-slate-955/50 animate-in zoom-in-95 duration-200 text-white">
            <h3 className="font-extrabold text-white text-lg mb-2 flex items-center space-x-2">
              <span>📷 扫描静态商户收款码</span>
            </h3>
            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              在此粘贴或输入商家的收款二维码内容（JSON 字符），或者直接点击下方“扫描”检测到的附近静态码。
            </p>

            {!scannedMerchant ? (
              <div className="space-y-6">
                <div className="relative bg-slate-950 aspect-video rounded-2xl overflow-hidden border border-slate-850 flex flex-col items-center justify-center shadow-inner group">
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-bounce" style={{ animationDuration: '3s' }}></div>
                  <div className="absolute inset-0 border-[3px] border-dashed border-emerald-500/20 rounded-2xl m-4 pointer-events-none"></div>
                  
                  {isScanning ? (
                    <div className="text-center space-y-2">
                      <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto"></div>
                      <p className="text-sm text-emerald-500 font-bold uppercase tracking-wider">正在识别收款码...</p>
                    </div>
                  ) : (
                    <div className="text-center space-y-1 z-10 px-4">
                      <QrCode className="w-8 h-8 text-emerald-500/60 mx-auto mb-2 animate-pulse" />
                      <p className="text-xs font-bold text-slate-400">对准商家的收款二维码</p>
                      <p className="text-xs tracking-wide text-slate-600">或在下方直接选择附近模拟检测到的商户</p>
                    </div>
                  )}
                </div>

                <div className="space-y-2 text-left">
                  <label className="text-sm font-black text-slate-400 uppercase tracking-widest px-1">手动输入收款码文本</label>
                  <div className="flex space-x-2">
                    <input 
                      type="text" 
                      placeholder='例如: {"merchantAddress": "0x...", "merchantName": "王五", "merchantType": "FOOD"}'
                      value={scanInput}
                      onChange={(e) => setScanInput(e.target.value)}
                      className="flex-1 bg-slate-950/40 border border-slate-850 rounded-xl px-3 py-2 text-xs outline-none focus:border-emerald-500/50 text-white transition-colors duration-300"
                    />
                    <button 
                      type="button"
                      onClick={() => handleSimulateScan(scanInput)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0"
                    >
                      解码
                    </button>
                  </div>
                </div>

                <div className="space-y-2 text-left">
                  <label className="text-sm font-black text-slate-400 uppercase tracking-widest px-1">检测到附近的特约商户 (模拟)</label>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    <button
                      type="button"
                      onClick={() => handleSimulateScan({
                        merchantAddress: "0x90F79bf6eb2c4f870365E785982E1f101E93b906",
                        merchantName: "特约商户 (王五)",
                        merchantType: localStorage.getItem("merchant_category_0x90F79bf6eb2c4f870365E785982E1f101E93b906") || "餐饮美食"
                      })}
                      className="w-full bg-slate-950/40 hover:bg-emerald-500/5 border border-slate-850 hover:border-emerald-500/20 rounded-xl p-3 flex items-center justify-between text-left transition-all duration-300 group"
                    >
                      <div className="flex items-center space-x-3 overflow-hidden">
                        <div className="w-8 h-8 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-center text-emerald-400 flex-shrink-0 group-hover:bg-emerald-500/20 transition-colors">
                          <ShoppingBag className="w-4 h-4" />
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-white font-bold text-xs truncate group-hover:text-white transition-colors">特约商户 (王五)</p>
                          <p className="text-xs tracking-wide text-slate-400 font-mono">0x90F7...b906</p>
                        </div>
                      </div>
                      <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs tracking-wide font-black px-2 py-0.5 rounded shrink-0">
                        {localStorage.getItem("merchant_category_0x90F79bf6eb2c4f870365E785982E1f101E93b906") || "餐饮美食"}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleScanPay} className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                <div className="bg-slate-950/60 border border-slate-850/80 rounded-2xl p-4 text-left">
                  <p className="text-sm text-slate-400 font-bold uppercase tracking-wider">收款商户</p>
                  <h4 className="text-base font-extrabold text-white mt-0.5">{scannedMerchant.merchantName}</h4>
                  <p className="text-sm text-slate-400 font-mono mt-0.5">{scannedMerchant.merchantAddress}</p>
                  <div className="mt-3 flex items-center space-x-2">
                    <span className="text-sm text-slate-400 font-bold">主营类目:</span>
                    <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-bold px-2 py-0.5 rounded">
                      {scannedMerchant.merchantType}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 text-left">
                  <label className="text-sm font-black text-slate-400 uppercase tracking-widest px-1">付款金额 (元 / Wei 1:1)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="请输入付款金额"
                    value={scanAmount}
                    onChange={(e) => setScanAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500/50 rounded-xl py-3 px-4 text-white text-sm outline-none transition-all duration-300"
                    required
                    autoFocus
                  />
                </div>

                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setScannedMerchant(null)}
                    className="flex-1 py-3 border border-slate-850 bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-900/70 rounded-xl text-xs font-bold transition-all duration-300"
                  >
                    重扫
                  </button>
                  <button
                    type="submit"
                    disabled={isScanPaying}
                    className="flex-[2] bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-3 rounded-xl text-xs shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 transition-all duration-300 flex items-center justify-center space-x-2"
                  >
                    {isScanPaying ? (
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : (
                      <span>确认付款</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      <ToastContainer hideProgressBar limit={3} autoClose={2000} theme="dark" newestOnTop />
    </div>
  );
}

export default App;
