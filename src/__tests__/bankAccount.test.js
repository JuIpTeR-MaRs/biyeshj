import { beforeEach, describe, expect, it } from 'vitest';
import { getActivePrivateKey, logoutLocalBank, registerToLocalBank, seedTestAccount, verifyLogin } from '../utils/bankAccount';

describe('bankAccount secure local storage', () => {
  beforeEach(() => {
    localStorage.clear();
    logoutLocalBank();
  });

  it('persists only an encrypted keystore and unlocks it with the password', () => {
    const account = {
      phone: '13911112222', password: 'correct horse battery staple', role: 'ward',
      address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
      privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'
    };
    const privateKey = account.privateKey;
    registerToLocalBank(account);

    const stored = localStorage.getItem('bank_all_accounts');
    expect(stored).toContain('keystore');
    expect(stored).not.toContain('privateKey');
    expect(stored).not.toContain('correct horse battery staple');
    expect(verifyLogin(account.phone, 'wrong password')).toBeNull();
    expect(verifyLogin(account.phone, 'correct horse battery staple').privateKey).toBe(privateKey);
    expect(getActivePrivateKey()).toBe(privateKey);
  });

  it('removes a legacy plaintext current session during migration', () => {
    localStorage.setItem('bank_current_user', JSON.stringify({
      phone: '15500000000', password: 'legacy', privateKey: '0xdeadbeef'
    }));
    seedTestAccount();
    expect(localStorage.getItem('bank_current_user')).toBeNull();
  });
});
