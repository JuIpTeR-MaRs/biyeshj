import { ethers } from 'ethers';
import { getApiUrl } from './api';
import { getLocalBankUser } from './bankAccount';

const TOKEN_KEY = 'guardian_api_session';
const TYPE_KEY = 'guardian_api_session_type';
const ADDRESS_KEY = 'guardian_api_session_address';

const storeToken = (token, address = null) => {
  sessionStorage.setItem(TOKEN_KEY, token);
  if (address) sessionStorage.setItem(ADDRESS_KEY, address.toLowerCase());
  else sessionStorage.removeItem(ADDRESS_KEY);
};
export const clearApiSession = () => {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TYPE_KEY);
  sessionStorage.removeItem(ADDRESS_KEY);
};

export const loginAdminApi = async (password, phone, smsCode) => {
  const response = await fetch(getApiUrl('/api/auth/admin'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password, phone, smsCode })
  });
  const data = await response.json();
  if (!response.ok || !data.token) throw new Error(data.error || '管理员认证失败');
  storeToken(data.token);
  sessionStorage.setItem(TYPE_KEY, 'admin');
  return data.token;
};

const pendingWalletLogins = new Map();

const loginWalletApi = (accountOverride) => {
  const account = accountOverride || getLocalBankUser();
  const address = account?.address?.toLowerCase();
  if (pendingWalletLogins.has(address)) return pendingWalletLogins.get(address);
  const pending = createWalletSession(account).finally(() => pendingWalletLogins.delete(address));
  pendingWalletLogins.set(address, pending);
  return pending;
};

const createWalletSession = async (accountOverride) => {
  const account = accountOverride || getLocalBankUser();
  if (!account?.address || !account?.privateKey) throw new Error('请先解锁本地钱包');
  const challengeResponse = await fetch(getApiUrl('/api/auth/challenge'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: account.address })
  });
  const challenge = await challengeResponse.json();
  if (!challengeResponse.ok || !challenge.message) throw new Error(challenge.error || '获取认证挑战失败');
  const signature = await new ethers.Wallet(account.privateKey).signMessage(challenge.message);
  const sessionResponse = await fetch(getApiUrl('/api/auth/session'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: account.address, signature })
  });
  const session = await sessionResponse.json();
  if (!sessionResponse.ok || !session.token) throw new Error(session.error || '钱包认证失败');
  storeToken(session.token, account.address);
  sessionStorage.setItem(TYPE_KEY, 'wallet');
  return session.token;
};

export const authenticatedFetch = async (path, options = {}, accountOverride = null) => {
  const account = accountOverride || getLocalBankUser();
  const sessionType = sessionStorage.getItem(TYPE_KEY);
  const sessionAddress = sessionStorage.getItem(ADDRESS_KEY);
  if (sessionType === 'wallet' && (!account?.address || sessionAddress !== account.address.toLowerCase())) {
    clearApiSession();
  }
  let token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) token = await loginWalletApi(accountOverride);
  const request = () => fetch(getApiUrl(path), {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}), Authorization: `Bearer ${token}` }
  });
  let response = await request();
  if (response.status === 401) {
    if (sessionStorage.getItem(TYPE_KEY) === 'admin') {
      clearApiSession();
      throw new Error('管理员会话已过期，请重新登录');
    }
    clearApiSession();
    token = await loginWalletApi(accountOverride);
    response = await request();
  }
  return response;
};
