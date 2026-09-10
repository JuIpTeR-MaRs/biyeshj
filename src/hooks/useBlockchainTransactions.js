
import { useState, useEffect, useMemo } from 'react';
import { contractService } from '../services/contractService';
import { DEFAULT_THRESHOLD } from '../constants';
import { getAllLocalAccounts } from '../utils/bankAccount';

/**
 * 计算交易总支出 (纯函数)
 * @param {Array} transactions 交易列表
 * @returns {string} 保留两位小数的支出总额
 */
export const calculateTotalSpent = (transactions = []) => {
  return (transactions || []).reduce((sum, t) => sum + (t?.amount || 0), 0).toFixed(2);
};

/**
 * 判断当前支出是否超出消费预警阈值 (纯函数)
 * @param {string|number} totalSpent 当前总支出
 * @param {number} threshold 预警阈值
 * @returns {boolean} 是否超额
 */
export const checkOverThreshold = (totalSpent, threshold) => {
  return parseFloat(totalSpent) > threshold;
};

/**
 * 将底层区块链节点原始区块对象映射为前端展示结构 (纯函数)
 * @param {object} block 以太坊节点返回的原始区块
 * @returns {object|null} 格式化后的区块结构
 */
export const formatBlockchainBlock = (block) => {
  if (!block) return null;
  return {
    index: block.number,
    timestamp: block.timestamp * 1000,
    hash: block.hash,
    previousHash: block.parentHash
  };
};

/**
 * 将智能合约原始交易元组映射为前端消费交易对象 (纯函数)
 * @param {Array} tx 合约 transactions 返回的原始元组
 * @returns {object|null} 格式化后的交易结构
 */
export const formatContractTransaction = (tx) => {
  if (!tx || !tx[0]) return null;
  return {
    id: tx[0].toString(),
    ward: tx[1],
    amount: Number(tx[2]),
    timestamp: Number(tx[3]) * 1000,
    category: tx[4],
    isPending: tx[5],
    isApproved: tx[6],
    isPaid: tx[7]
  };
};

export const useBlockchainTransactions = () => {
  const [transactions, setTransactions] = useState([]);
  const [blockchain, setBlockchain] = useState([]);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [notifications, setNotifications] = useState([]);
  const [isMining, setIsMining] = useState(false);

  const totalSpent = useMemo(() => 
    calculateTotalSpent(transactions), 
  [transactions]);

  const overThreshold = useMemo(() => 
    checkOverThreshold(totalSpent, threshold), 
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
        .map(formatBlockchainBlock)
        .filter(b => b !== null);
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
          const allAccounts = getAllLocalAccounts();
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
        .map(formatContractTransaction)
        .filter(tx => tx !== null);
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
