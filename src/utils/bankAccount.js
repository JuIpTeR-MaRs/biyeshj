import { ethers } from 'ethers';

/**
 * 模拟银行账户生成器
 * 用于生成测试网环境下的银行卡号与钱包地址映射
 */
export const createLocalBankAccount = () => {
  const wallet = ethers.Wallet.createRandom();
  // 生成 16 位模拟银行卡号 (工商银行前缀示例 622202)
  const cardPrefix = "622202";
  const randomSuffix = Math.floor(Math.random() * 10000000000).toString().padStart(10, '0');
  const cardNumber = cardPrefix + randomSuffix;

  return {
    cardNumber: cardNumber,
    address: wallet.address,
    privateKey: wallet.privateKey,
    accountName: `模拟用户_${cardNumber.slice(-4)}`,
    isBankUser: true
  };
};

/**
 * 格式化卡号展示
 */
export const maskCardNumber = (cardNumber) => {
  if (!cardNumber) return "";
  return cardNumber.replace(/(\d{4})\d{8}(\d{4})/, "$1 **** **** $2");
};

/**
 * 模拟本地银行数据库 (内存存储)
 */
const bankStore = new Map();

export const registerToLocalBank = (account) => {
  bankStore.set(account.cardNumber, account);
  bankStore.set(account.address.toLowerCase(), account);
  // 持久化到 localStorage 模拟本地软件存储
  localStorage.setItem('bank_current_user', JSON.stringify(account));
};

export const getLocalBankUser = () => {
  const data = localStorage.getItem('bank_current_user');
  return data ? JSON.parse(data) : null;
};
