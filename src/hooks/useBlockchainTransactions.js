
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
      
      // 1. 获取本地 Hardhat 节点最新区块数据
      const currentBlockNumber = await contractService.getBlockNumber();
      const blocks = [];
      const start = Math.max(0, currentBlockNumber - 4);
      for (let i = currentBlockNumber; i >= start; i--) {
        const block = await contractService.getBlock(i);
        if (block) {
          blocks.push({
            index: block.number,
            timestamp: block.timestamp * 1000,
            hash: block.hash,
            previousHash: block.parentHash
          });
        }
      }
      setBlockchain(blocks);

      // 2. 加载智能合约真实交易流水
      const contract = await contractService.getContractInstance();
      const count = Number(await contract.txCounter());
      const txs = [];
      for (let i = 1; i <= count; i++) {
        try {
          const tx = await contract.transactions(i);
          txs.push({
            id: tx[0].toString(),
            ward: tx[1],
            amount: Number(tx[2]),
            timestamp: Number(tx[3]) * 1000,
            category: tx[4],
            isPending: tx[5],
            isApproved: tx[6]
          });
        } catch (e) {
          console.error("Error reading tx index", i, e);
        }
      }
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
