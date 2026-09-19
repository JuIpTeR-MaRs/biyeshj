import { afterEach, expect, it, vi } from 'vitest';
import { authenticatedFetch, clearApiSession } from '../utils/authenticatedFetch';

afterEach(() => {
  clearApiSession();
  vi.unstubAllGlobals();
});

it('shares one wallet challenge and signature session across concurrent requests', async () => {
  const account = {
    address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    privateKey: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6'
  };
  clearApiSession();
  const fetchMock = vi.fn(async (url) => {
    const body = url.endsWith('/api/auth/challenge') ? { message: 'single-use challenge' }
      : url.endsWith('/api/auth/session') ? { token: 'test-session' } : { success: true };
    return { ok: true, status: 200, json: async () => body };
  });
  vi.stubGlobal('fetch', fetchMock);

  await Promise.all([
    authenticatedFetch('/api/merchant/transactions/' + account.address, {}, account),
    authenticatedFetch('/api/merchant/transactions/' + account.address, {}, account)
  ]);

  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/api/auth/challenge'))).toHaveLength(1);
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/api/auth/session'))).toHaveLength(1);
  const requests = fetchMock.mock.calls.filter(([url]) => url.includes('/api/merchant/transactions/'));
  expect(requests).toHaveLength(2);
  requests.forEach(([, options]) => expect(options.headers.Authorization).toBe('Bearer test-session'));
});
