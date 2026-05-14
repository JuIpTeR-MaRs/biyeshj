import React from 'react';
import Header from '../components/layout/Header';
import OverviewCards from '../components/Dashboard/OverviewCards';
import SpendingChart from '../components/Dashboard/SpendingChart';
import TransactionList from '../components/Dashboard/TransactionList';
import GuardianNotifications from '../components/Dashboard/GuardianNotifications';
import BlockchainExplorer from '../components/Dashboard/BlockchainExplorer';
import { useBlockchainTransactions } from '../hooks/useBlockchainTransactions';

const Dashboard = () => {
  const {
    transactions,
    blockchain,
    threshold,
    setThreshold,
    notifications,
    isMining,
    totalSpent,
    overThreshold,
    addSimulatedTransaction
  } = useBlockchainTransactions();

  return (
    <div className="app-container">
      <Header onAddSimulated={addSimulatedTransaction} isMining={isMining} />

      <OverviewCards 
        totalSpent={totalSpent} 
        threshold={threshold} 
        setThreshold={setThreshold} 
        overThreshold={overThreshold}
        blockchainLength={blockchain.length}
      />

      <div className="dashboard-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <SpendingChart transactions={transactions} />
          <TransactionList transactions={transactions} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <GuardianNotifications notifications={notifications} />
          <BlockchainExplorer blockchain={blockchain} />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
