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
  
  // 账户 A: 被监护人
  const wardPhone = "15876581014";
  if (!accounts.find(a => a.phone === wardPhone)) {
    const wardAccount = createLocalBankAccount(wardPhone, "123");
    wardAccount.accountName = "被监护人 (张三)";
    accounts.push(wardAccount);
  }

  // 账户 B: 监护人
  const guardianPhone = "13826193664";
  if (!accounts.find(a => a.phone === guardianPhone)) {
    const guardianAccount = createLocalBankAccount(guardianPhone, "123");
    guardianAccount.accountName = "监护人 (李四)";
    accounts.push(guardianAccount);
  }

  localStorage.setItem('bank_all_accounts', JSON.stringify(accounts));
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
