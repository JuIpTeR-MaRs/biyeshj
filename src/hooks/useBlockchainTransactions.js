
import { useState, useEffect, useMemo } from 'react';
import { contractService } from '../services/contractService';
import { DEFAULT_THRESHOLD } from '../constants';

export const useBlockchainTransactions = () => {
  const [transactions, setTransactions] = useState([]);
  const [blockchain, setBlockchain] = useState([]);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [notifications, setNotifications] = useState([]);
  const [isMining, setIsMining] = useState(false);

  const totalSpent = useMemo(() => 
    transactions.reduce((sum, t) => sum + (t.amount || 0), 0).toFixed(2), 
  [transactions]);

  const overThreshold = useMemo(() => 
    parseFloat(totalSpent) > threshold, 
  [totalSpent, threshold]);

  const fetchBlockchainData = async () => {
    try {
      setIsMining(true);
      
      // 1. 获取本地 Hardhat 节点最新区块数据 (并行读取优化)
      const currentBlockNumber = await contractService.getBlockNumber();
      const start = Math.max(0, currentBlockNumber - 4);
      
      const blockPromises = [];
      for (let i = currentBlockNumber; i >= start; i--) {
        blockPromises.push(contractService.getBlock(i).catch(() => null));
      }
      
      const blockResults = await Promise.all(blockPromises);
      const blocks = blockResults
        .filter(b => b !== null)
        .map(block => ({
          index: block.number,
          timestamp: block.timestamp * 1000,
          hash: block.hash,
          previousHash: block.parentHash
        }));
      setBlockchain(blocks);

      // 2. 加载智能合约真实交易流水（按钱包地址并行索引优化）
      const contract = await contractService.getContractInstance();
      const currentUserData = localStorage.getItem('bank_current_user');
      const currentUser = currentUserData ? JSON.parse(currentUserData) : null;

      let txIds = [];
      if (currentUser) {
        if (currentUser.role === 'ward') {
          txIds = await contract.getWardTransactionIds(currentUser.address).catch(() => []);
        } else if (currentUser.role === 'guardian') {
          const allAccounts = JSON.parse(localStorage.getItem('bank_all_accounts') || '[]');
          const wardCheckPromises = allAccounts.map(async (accInfo) => {
            try {
              const isG = await contract.isWardGuardian(accInfo.address, currentUser.address);
              if (isG) return accInfo.address;
            } catch (e) {}
            return null;
          });
          const wardAddresses = (await Promise.all(wardCheckPromises)).filter(a => a !== null);
          const wardIdsPromises = wardAddresses.map(addr => contract.getWardTransactionIds(addr).catch(() => []));
          const wardIdsResults = await Promise.all(wardIdsPromises);
          txIds = wardIdsResults.flat();
        } else {
          const count = Number(await contract.txCounter().catch(() => 0));
          for (let i = 1; i <= count; i++) {
            txIds.push(i);
          }
        }
      } else {
        setTransactions([]);
        return;
      }
      
      const promises = txIds.map(id =>
        contract.transactions(id).catch(e => {
          console.error("Error reading tx index", id.toString(), e);
          return null;
        })
      );
      
      const txResults = await Promise.all(promises);
      const txs = txResults
        .filter(tx => tx !== null)
        .map(tx => ({
          id: tx[0].toString(),
          ward: tx[1],
          amount: Number(tx[2]),
          timestamp: Number(tx[3]) * 1000,
          category: tx[4],
          isPending: tx[5],
          isApproved: tx[6],
          isPaid: tx[7]
        }));
      setTransactions(txs.reverse());
    } catch (err) {
      console.warn("Failed to fetch real Hardhat node data:", err.message);
    } finally {
      setIsMining(false);
    }
  };

  useEffect(() => {
    fetchBlockchainData();
    const interval = setInterval(fetchBlockchainData, 8000);
    return () => clearInterval(interval);
  }, []);

  const addSimulatedTransaction = async () => {
    console.log("Mock mining is disabled. Real transactions are recorded by the backend oracle.");
  };

  return {
    transactions,
    blockchain,
    threshold,
    setThreshold,
    notifications,
    isMining,
    totalSpent,
    overThreshold,
    addSimulatedTransaction
  };
};
