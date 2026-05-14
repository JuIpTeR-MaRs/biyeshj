import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { WalletConnect } from './components/WalletConnect';
import { PendingList } from './components/PendingList';
import { getContract, CONTRACT_ADDRESS } from './utils/contract';

function App() {
  const [account, setAccount] = useState(null);
  const [role, setRole] = useState(null);
  const [pendingTxs, setPendingTxs] = useState([]);
  const [loading, setLoading] = useState(false);

  const connectWallet = async (bankAccount) => {
    try {
      // 接收来自 WalletConnect 的银行账户对象
      setAccount(bankAccount.address);
      toast.success(`欢迎登录，卡号: ${bankAccount.cardNumber.slice(-4)}`);
    } catch (err) {
      toast.error("登录失败");
    }
  };

  const fetchData = useCallback(async () => {
    if (!account) return;
    try {
      const contract = await getContract();
      
      // 获取分配给当前地址作为监护人的所有待处理交易
      const ids = await contract.getPendingTransactions(account);
      const txDetails = await Promise.all(
        ids.map(id => contract.transactions(id))
      );
      
      setPendingTxs(txDetails.map(d => ({
        id: d[0], ward: d[1], amount: d[2].toString(), 
        timestamp: d[3], merchantType: d[4], isPending: d[5]
      })));
      
      // 简单逻辑判断角色：如果能获取到分配给自己的待处理交易，则是监护人
      // 在实际应用中应查询 wardToGuardian 映射
      setRole(ids.length > 0 || txDetails.length > 0 ? 'guardian' : 'ward');
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

  useEffect(() => {
    if (account) {
      fetchData();
      
      // 实时监听预警事件 - 使用本地 JSON-RPC
      const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ["event PaymentPendingApproval(uint256 indexed txId, address indexed ward, uint256 amount)"], provider);
      
      const onPending = (id, ward, amount) => {
        toast.warn(`⚠️ 收到大额消费预警: ${amount.toString()} Wei`, {
          position: "top-right",
          autoClose: 5000,
          theme: "colored"
        });
        fetchData();
      };

      contract.on("PaymentPendingApproval", onPending);
      return () => contract.off("PaymentPendingApproval", onPending);
    }
  }, [account, fetchData]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 selection:bg-blue-100">
      <div className="max-w-3xl mx-auto py-12 px-6">
        <div className="bg-white rounded-[40px] shadow-2xl shadow-blue-100 overflow-hidden border border-white">
          <WalletConnect account={account} onConnect={connectWallet} />
          
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
                  <PendingList txs={pendingTxs} onAction={handleAction} loading={loading} />
                ) : (
                  <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[32px] p-10 text-white shadow-xl shadow-blue-200">
                    <h3 className="text-2xl font-bold mb-4">您的钱包已受保护</h3>
                    <p className="text-blue-100 leading-relaxed mb-8 opacity-90">
                      系统正在实时监控您的支出。任何超过预设阈值的消费都将由您的监护人进行二次确认。
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
      <ToastContainer hideProgressBar />
    </div>
  );
}

export default App;
