import { ethers } from 'ethers';

let activeAccount = null;

const toStoredAccount = (account) => {
  const { privateKey, password, ...profile } = account;
  if (privateKey && password && !profile.keystore) profile.keystore = new ethers.Wallet(privateKey).encryptSync(password);
  return profile;
};

/**
 * 模拟银行账户生成器
 */
export const createLocalBankAccount = (phone = "", password = "", accountName = "") => {
  const wallet = ethers.Wallet.createRandom();
  const cardPrefix = "622202";
  const randomSuffix = Math.floor(Math.random() * 10000000000).toString().padStart(10, '0');
  const cardNumber = cardPrefix + randomSuffix;

  return {
    cardNumber: cardNumber,
    address: wallet.address,
    privateKey: wallet.privateKey,
    accountName: accountName.trim() || (phone ? `用户_${phone.slice(-4)}` : `模拟用户_${cardNumber.slice(-4)}`),
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
  const stored = toStoredAccount(account);
  const index = accounts.findIndex(a => a.address === account.address || (a.phone && a.phone === account.phone));
  if (index >= 0) accounts[index] = { ...accounts[index], ...stored };
  else accounts.push(stored);
  localStorage.setItem('bank_all_accounts', JSON.stringify(accounts));
  localStorage.setItem('bank_current_user', JSON.stringify(stored));
  activeAccount = { ...stored, ...(account.privateKey ? { privateKey: account.privateKey } : {}) };
};

export const verifyLogin = (phone, password) => {
  const accounts = JSON.parse(localStorage.getItem('bank_all_accounts') || '[]');
  const stored = accounts.find(a => a.phone === phone);
  if (!stored?.keystore) return null;
  try {
    const wallet = ethers.Wallet.fromEncryptedJsonSync(stored.keystore, password);
    return wallet.address.toLowerCase() === stored.address.toLowerCase() ? { ...stored, privateKey: wallet.privateKey } : null;
  } catch { return null; }
};

// 预置测试账户
export const seedTestAccount = () => {
  const accounts = JSON.parse(localStorage.getItem('bank_all_accounts') || '[]').map(account =>
    account.privateKey && account.password ? toStoredAccount(account) : account
  );
  
  // Hardhat default test accounts to match seed data
  const wardWallet = new ethers.Wallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  const guardianWallet = new ethers.Wallet("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");

  // 账户 A: 被监护人
  const wardPhone = "15876581014";
  let wardAccount = accounts.find(a => a.phone === wardPhone);
  if (!wardAccount) {
    wardAccount = {};
  }
  // Force fixed address for demo matching
  wardAccount.address = wardWallet.address;
  wardAccount.phone = wardPhone;
  wardAccount.cardNumber ||= "6222020000000001";
  wardAccount.isBankUser = true;
  wardAccount.keystore ||= wardWallet.encryptSync("123");
  wardAccount.accountName = "被监护人 (张三)";
  wardAccount.role = "ward";

  // 账户 B: 监护人
  const guardianPhone = "13826193664";
  let guardianAccount = accounts.find(a => a.phone === guardianPhone);
  if (!guardianAccount) {
    guardianAccount = {};
  }
  // Force fixed address for demo matching
  guardianAccount.address = guardianWallet.address;
  guardianAccount.phone = guardianPhone;
  guardianAccount.cardNumber ||= "6222020000000002";
  guardianAccount.isBankUser = true;
  guardianAccount.keystore ||= guardianWallet.encryptSync("123");
  guardianAccount.accountName = "监护人 (李四)";
  guardianAccount.role = "guardian";

  // 账户 C: 特约商户
  const merchantPhone = "13900000000";
  let merchantAccount = accounts.find(a => a.phone === merchantPhone);
  if (!merchantAccount) {
    merchantAccount = {};
  }
  // Force fixed address for Account #3
  const merchantWallet = new ethers.Wallet("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6");
  merchantAccount.address = merchantWallet.address;
  merchantAccount.phone = merchantPhone;
  merchantAccount.cardNumber ||= "6222020000000003";
  merchantAccount.isBankUser = true;
  // 旧版演示数据可能已错误地标为“迁移完成”。实际解锁并核对地址，
  // 只有钱包与预置商户地址一致时才保留缓存。
  let merchantKeystoreMatches = false;
  try {
    const cachedWallet = ethers.Wallet.fromEncryptedJsonSync(merchantAccount.keystore || '', "123");
    merchantKeystoreMatches = cachedWallet.address === merchantWallet.address;
  } catch {
    merchantKeystoreMatches = false;
  }
  if (!merchantKeystoreMatches) {
    merchantAccount.keystore = merchantWallet.encryptSync("123");
  }
  merchantAccount.demoCredentialVersion = 2;
  merchantAccount.accountName = "特约商户 (王五)";
  merchantAccount.role = "merchant";

  const safeAccounts = accounts.filter(a => ![wardAccount.address, guardianAccount.address, merchantAccount.address].includes(a.address));
  safeAccounts.push(wardAccount, guardianAccount, merchantAccount);
  localStorage.setItem('bank_all_accounts', JSON.stringify(safeAccounts));

  // Sync current user if they are logged in with a test account
  const currentUser = JSON.parse(localStorage.getItem('bank_current_user') || 'null');
  if (currentUser) {
    if (currentUser.privateKey || currentUser.password) {
      activeAccount = null;
      localStorage.removeItem('bank_current_user');
    } else if (currentUser.phone === wardPhone) {
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
  if (activeAccount) return activeAccount;
  const data = localStorage.getItem('bank_current_user');
  return data ? JSON.parse(data) : null;
};

export const getActivePrivateKey = () => activeAccount?.privateKey || null;

export const logoutLocalBank = () => {
  activeAccount = null;
  localStorage.removeItem('bank_current_user');
};
