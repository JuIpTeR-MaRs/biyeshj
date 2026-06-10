import { ethers } from 'ethers';

/**
 * 模拟银行账户生成器
 */
export const createLocalBankAccount = (phone = "", password = "") => {
  const wallet = ethers.Wallet.createRandom();
  const cardPrefix = "622202";
  const randomSuffix = Math.floor(Math.random() * 10000000000).toString().padStart(10, '0');
  const cardNumber = cardPrefix + randomSuffix;

  return {
    cardNumber: cardNumber,
    address: wallet.address,
    privateKey: wallet.privateKey,
    accountName: phone ? `用户_${phone.slice(-4)}` : `模拟用户_${cardNumber.slice(-4)}`,
    phone: phone,
    password: password,
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
 * 模拟本地银行数据库 (localStorage)
 */
export const registerToLocalBank = (account) => {
  const accounts = JSON.parse(localStorage.getItem('bank_all_accounts') || '[]');
  const exists = accounts.find(a => a.address === account.address || (a.phone && a.phone === account.phone));
  if (!exists) {
    accounts.push(account);
    localStorage.setItem('bank_all_accounts', JSON.stringify(accounts));
  }
  localStorage.setItem('bank_current_user', JSON.stringify(account));
};

export const verifyLogin = (phone, password) => {
  const accounts = JSON.parse(localStorage.getItem('bank_all_accounts') || '[]');
  // 查找匹配的手机号和密码
  const user = accounts.find(a => a.phone === phone && a.password === password);
  return user || null;
};

// 预置测试账户
export const seedTestAccount = () => {
  const accounts = JSON.parse(localStorage.getItem('bank_all_accounts') || '[]');
  
  // Hardhat default test accounts to match seed data
  const wardWallet = new ethers.Wallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  const guardianWallet = new ethers.Wallet("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");

  // 账户 A: 被监护人
  const wardPhone = "15876581014";
  let wardAccount = accounts.find(a => a.phone === wardPhone);
  if (!wardAccount) {
    wardAccount = createLocalBankAccount(wardPhone, "123");
    accounts.push(wardAccount);
  }
  // Force fixed address for demo matching
  wardAccount.address = wardWallet.address;
  wardAccount.privateKey = wardWallet.privateKey;
  wardAccount.accountName = "被监护人 (张三)";
  wardAccount.role = "ward";

  // 账户 B: 监护人
  const guardianPhone = "13826193664";
  let guardianAccount = accounts.find(a => a.phone === guardianPhone);
  if (!guardianAccount) {
    guardianAccount = createLocalBankAccount(guardianPhone, "123");
    accounts.push(guardianAccount);
  }
  // Force fixed address for demo matching
  guardianAccount.address = guardianWallet.address;
  guardianAccount.privateKey = guardianWallet.privateKey;
  guardianAccount.accountName = "监护人 (李四)";
  guardianAccount.role = "guardian";

  // 账户 C: 特约商户
  const merchantPhone = "13900000000";
  let merchantAccount = accounts.find(a => a.phone === merchantPhone);
  if (!merchantAccount) {
    merchantAccount = createLocalBankAccount(merchantPhone, "123");
    accounts.push(merchantAccount);
  }
  // Force fixed address for Account #3
  merchantAccount.address = "0x90F79bf6eb2c4f870365E785982E1f101E93b906";
  merchantAccount.privateKey = "0x7c9f28a054e5a8722797e85c84d78627b03b223e74c83e0544b6c2057393437e";
  merchantAccount.accountName = "特约商户 (王五)";
  merchantAccount.role = "merchant";

  localStorage.setItem('bank_all_accounts', JSON.stringify(accounts));

  // Sync current user if they are logged in with a test account
  const currentUser = JSON.parse(localStorage.getItem('bank_current_user') || 'null');
  if (currentUser) {
    if (currentUser.phone === wardPhone) {
      localStorage.setItem('bank_current_user', JSON.stringify(wardAccount));
    } else if (currentUser.phone === guardianPhone) {
      localStorage.setItem('bank_current_user', JSON.stringify(guardianAccount));
    } else if (currentUser.phone === merchantPhone) {
      localStorage.setItem('bank_current_user', JSON.stringify(merchantAccount));
    }
  }
};

export const getAllLocalAccounts = () => {
  seedTestAccount(); // 确保测试账户存在
  return JSON.parse(localStorage.getItem('bank_all_accounts') || '[]');
};

export const findAccountByPhone = (phone) => {
  const accounts = getAllLocalAccounts();
  return accounts.find(a => a.phone === phone) || null;
};

export const getLocalBankUser = () => {
  const data = localStorage.getItem('bank_current_user');
  return data ? JSON.parse(data) : null;
};

export const logoutLocalBank = () => {
  localStorage.removeItem('bank_current_user');
};
