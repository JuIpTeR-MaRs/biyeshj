
import { useState, useEffect, useMemo } from 'react';
import { blockchainService } from '../services/blockchain';
import { generateTransaction } from '../services/transaction';
import { DEFAULT_THRESHOLD } from '../constants';

export const useBlockchainTransactions = () => {
  const [transactions, setTransactions] = useState([]);
  const [blockchain, setBlockchain] = useState([]);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [notifications, setNotifications] = useState([]);
  const [isMining, setIsMining] = useState(false);

  const totalSpent = useMemo(() => 
    transactions.reduce((sum, t) => sum + t.amount, 0).toFixed(2), 
  [transactions]);

  const overThreshold = useMemo(() => 
    parseFloat(totalSpent) > threshold, 
  [totalSpent, threshold]);

  // Synchronize with blockchain state
  useEffect(() => {
    setBlockchain([...blockchainService.chain]);
  }, [isMining]);

  // Initialize with some data
  useEffect(() => {
    if (transactions.length === 0) {
      addSimulatedTransaction();
      setTimeout(addSimulatedTransaction, 500);
    }
  }, []);

  const addSimulatedTransaction = async () => {
    setIsMining(true);
    const newTx = generateTransaction();
    
    // Add to local state
    setTransactions(prev => [newTx, ...prev]);

    // Check threshold for guardian notification
    if (parseFloat(totalSpent) + newTx.amount > threshold) {
      const notification = {
        id: Date.now(),
        message: `警告：消费超出预算！交易：¥${newTx.amount} (${newTx.category})`,
        time: new Date().toLocaleTimeString(),
        type: 'danger'
      };
      setNotifications(prev => [notification, ...prev]);
    }

    // Commit to blockchain
    await blockchainService.addTransaction(newTx);
    
    setIsMining(false);
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
