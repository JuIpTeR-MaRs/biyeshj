const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const serverDir = path.join(__dirname, '..', 'mock-server');
const serverRequire = createRequire(path.join(serverDir, 'index.js'));
const ward = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

function paymentServiceClass() {
  const filename = path.join(serverDir, 'payment-mock.js');
  const source = fs.readFileSync(filename, 'utf8').replace(
    'module.exports = new PaymentMockService();',
    'module.exports = PaymentMockService;'
  );
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, require: serverRequire, __dirname: serverDir, process,
    console, Buffer, setTimeout, clearTimeout
  }, { filename });
  return module.exports;
}

function routesFor(paymentService, fetchImpl = async () => ({ json: async () => ({ choices: [{ message: { content: '报告' } }] }) })) {
  const routes = new Map();
  const app = {
    use() {}, listen() {},
    post(route, ...handlers) { routes.set(`POST ${route}`, handlers.at(-1)); },
    get(route, ...handlers) { routes.set(`GET ${route}`, handlers.at(-1)); }
  };
  const express = () => app;
  express.json = () => () => {};
  const auth = { requireAuth() {}, sameAddress: (a, b) => Boolean(a && b && a.toLowerCase() === b.toLowerCase()) };
  const filename = path.join(serverDir, 'index.js');
  const module = { exports: {} };
  const quietConsole = { log() {}, warn() {}, error() {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, __dirname: serverDir, console: quietConsole, fetch: fetchImpl,
    process: { env: { CHAIN_BACKEND: 'fisco', DEEPSEEK_API_KEY: 'test' } },
    require(name) {
      if (name === 'express') return express;
      if (name === './payment-mock') return paymentService;
      if (name === './auth') return auth;
      if (name === 'dotenv') return { config() {} };
      if (name === 'alipay-sdk') return { AlipaySdk: class {} };
      return serverRequire(name);
    },
    Date, Buffer, setTimeout, clearTimeout
  }, { filename });
  return routes;
}

function response() {
  return {
    code: 200, body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('payment success updates only the row identified by the chain payment hash', async () => {
  const PaymentService = paymentServiceClass();
  const service = Object.create(PaymentService.prototype);
  const statements = [];
  service.contract = { markPaymentSuccess: async () => ({ wait: async () => {} }) };
  service.getPendingPaymentHash = async () => '0xpayment';
  service.dbPool = { execute: async (sql, params) => {
    statements.push({ sql, params });
    return sql.startsWith('SELECT') ? [[{ id: 19 }]] : [{ affectedRows: 1 }];
  } };

  assert.equal((await service.markPaymentSuccess(2)).success, true);
  assert.match(statements[1].sql, /WHERE tx_hash = \?/);
  assert.deepEqual(Array.from(statements[1].params), ['0xpayment']);
  assert.doesNotMatch(statements[1].sql, /WHERE id = \?/);
});

test('payment success does not touch chain or another row when its database record is missing', async () => {
  const PaymentService = paymentServiceClass();
  const service = Object.create(PaymentService.prototype);
  let chainWrites = 0;
  service.contract = { markPaymentSuccess: async () => { chainWrites++; return { wait: async () => {} }; } };
  service.getPendingPaymentHash = async () => '0xmissing';
  service.dbPool = { execute: async () => [[]] };

  assert.equal((await service.markPaymentSuccess(2)).success, false);
  assert.equal(chainWrites, 0);
});

test('threshold mirror rejects a value that differs from the chain and accepts the confirmed value', async () => {
  const saved = [];
  const paymentService = {
    contract: { isWardGuardian: async () => true, threshold: async () => 800n },
    saveThreshold: async (...args) => { saved.push(args); return { success: true }; },
    generateSeedData() {}
  };
  const handler = routesFor(paymentService).get('POST /api/guardian/threshold');
  const req = amount => ({ body: { wardAddress: ward, amount }, auth: { type: 'wallet', address: ward } });

  const rejected = response();
  await handler(req('1'), rejected);
  assert.equal(rejected.code, 409);
  assert.equal(saved.length, 0);

  const accepted = response();
  await handler(req('800'), accepted);
  assert.equal(accepted.code, 200);
  assert.deepEqual(Array.from(saved[0]), [ward, '800']);
});

test('guardian status reports the chain threshold even when the database mirror is stale', async () => {
  const paymentService = {
    contract: { threshold: async () => 800n },
    dbPool: { execute: async () => [[{ threshold_amount: '1' }]] },
    generateSeedData() {}
  };
  const handler = routesFor(paymentService).get('GET /api/guardian/status/:address');
  const res = response();
  await handler({ params: { address: ward } }, res);

  assert.equal(res.body.success, true);
  assert.equal(res.body.threshold, '800');
});

test('guardian status does not present an unverified database threshold when the chain is unavailable', async () => {
  const paymentService = {
    contract: { threshold: async () => { throw new Error('RPC unavailable'); } },
    dbPool: { execute: async () => [[{ threshold_amount: '1' }]] },
    generateSeedData() {}
  };
  const handler = routesFor(paymentService).get('GET /api/guardian/status/:address');
  const res = response();
  await handler({ params: { address: ward } }, res);

  assert.equal(res.body.success, true);
  assert.equal(res.body.threshold, null);
});

test('guardian status finds an on-chain ward missing from the database mirror', async () => {
  const guardian = '0x1111111111111111111111111111111111111111';
  const paymentService = {
    contract: {
      getWardGuardians: async () => [],
      filters: { GuardianBound: (_ward, address) => ({ guardian: address }) },
      queryFilter: async () => [{ args: { ward } }],
      isWardGuardian: async (candidate, address) =>
        candidate.toLowerCase() === ward.toLowerCase() && address === guardian,
      threshold: async () => 0n
    },
    dbPool: { execute: async () => [[]] },
    generateSeedData() {}
  };
  const handler = routesFor(paymentService).get('GET /api/guardian/status/:address');
  const res = response();
  await handler({ params: { address: guardian } }, res);

  assert.equal(res.body.success, true);
  assert.deepEqual(Array.from(res.body.wards), [ward.toLowerCase()]);
});

test('a selected transaction subset gets analysis but cannot overwrite the monthly report', async () => {
  const writes = [];
  const rows = [
    { id: 1, ward_address: ward, amount: '100', merchant_type: 'FOOD', created_at: new Date(), is_pending: 0, is_approved: 1 },
    { id: 2, ward_address: ward, amount: '200', merchant_type: 'FOOD', created_at: new Date(), is_pending: 0, is_approved: 1 }
  ];
  const paymentService = {
    dbPool: { execute: async (sql) => {
      if (sql.includes('WHERE id IN')) return [rows.slice(0, 1)];
      if (sql.includes('DATE_FORMAT')) return [rows.map(({ id }) => ({ id }))];
      writes.push(sql);
      return [{}];
    } },
    contract: { storeAiReportHash: async () => { writes.push('chain'); return { wait: async () => ({ hash: '0xhash' }) }; } },
    generateSeedData() {}
  };
  const handler = routesFor(paymentService).get('POST /api/analysis/consumption');
  const res = response();
  await handler({ body: { txs: [{ id: 1 }], role: 'ward' }, auth: { type: 'wallet', address: ward } }, res);

  assert.equal(res.body.success, true);
  assert.equal(writes.length, 0);
});

test('a complete current-month ward report still writes its database and chain proof', async () => {
  const writes = [];
  const rows = [
    { id: 1, ward_address: ward, amount: '100', merchant_type: 'FOOD', created_at: new Date(), is_pending: 0, is_approved: 1 },
    { id: 2, ward_address: ward, amount: '200', merchant_type: 'FOOD', created_at: new Date(), is_pending: 0, is_approved: 1 }
  ];
  const paymentService = {
    dbPool: { execute: async (sql) => {
      if (sql.includes('WHERE id IN')) return [rows];
      if (sql.includes('DATE_FORMAT')) return [rows.map(({ id }) => ({ id }))];
      writes.push(sql);
      return [{}];
    } },
    contract: { storeAiReportHash: async () => { writes.push('chain'); return { wait: async () => ({ hash: '0xhash' }) }; } },
    generateSeedData() {}
  };
  const handler = routesFor(paymentService).get('POST /api/analysis/consumption');
  const res = response();
  await handler({ body: { txs: [{ id: 2 }, { id: 1 }], role: 'ward' }, auth: { type: 'wallet', address: ward } }, res);

  assert.equal(res.body.success, true);
  assert.equal(writes.filter(value => value === 'chain').length, 1);
  assert.equal(writes.filter(value => value.includes('INSERT INTO ai_reports')).length, 1);
});

test('AI prompt uses the account name for a verified transaction', async () => {
  let prompt;
  const paymentService = {
    dbPool: { execute: async () => [[{
      id: 1, ward_address: ward, amount: '100', merchant_type: 'FOOD',
      created_at: new Date(), is_pending: 0, is_approved: 1
    }]] },
    contract: {},
    generateSeedData() {}
  };
  const handler = routesFor(paymentService, async (_url, options) => {
    prompt = JSON.parse(options.body).messages[1].content;
    return { json: async () => ({ choices: [{ message: { content: '报告' } }] }) };
  }).get('POST /api/analysis/consumption');
  const res = response();
  await handler({
    body: { txs: [{ id: 1 }], role: 'ward', wardNames: { [ward.toLowerCase()]: '张三' } },
    auth: { type: 'wallet', address: ward }
  }, res);

  assert.equal(res.body.success, true);
  assert.match(prompt, /张三/);
  assert.doesNotMatch(prompt, new RegExp(ward, 'i'));
});

test('admin analysis reads the admin ledger fallback without client transaction IDs', async () => {
  let reads = 0;
  const paymentService = {
    getAllAdminData: async () => {
      reads++;
      return { success: true, storage: 'local', transactions: [
        { id: 1, ward_address: ward, amount: '100', merchant_type: 'FOOD', created_at: new Date() }
      ] };
    },
    contract: {}, generateSeedData() {}
  };
  const handler = routesFor(paymentService).get('POST /api/analysis/consumption');
  const res = response();
  await handler({ body: { role: 'admin' }, auth: { type: 'admin', address: 'admin' } }, res);
  assert.equal(res.body.success, true);
  assert.equal(reads, 1);
});

test('wallet sessions cannot request admin analysis', async () => {
  let queried = false;
  const paymentService = {
    dbPool: { execute: async () => { queried = true; return [[]]; } },
    contract: {}, generateSeedData() {}
  };
  const handler = routesFor(paymentService).get('POST /api/analysis/consumption');
  const res = response();
  await handler({ body: { role: 'admin' }, auth: { type: 'wallet', address: ward } }, res);
  assert.equal(res.code, 403);
  assert.equal(queried, false);
});

test('date range includes both boundary days and summarizes more than 200 admin transactions', async () => {
  let prompt;
  const rows = Array.from({ length: 205 }, (_, index) => ({
    id: index + 1, ward_address: ward, amount: '10', merchant_type: 'FOOD',
    created_at: '2026-10-12T12:00:00.000Z'
  }));
  rows.push({ ...rows[0], id: 300, created_at: '2026-10-13T00:00:00.000Z' });
  const service = { getAllAdminData: async () => ({ success: true, transactions: rows }), contract: {}, generateSeedData() {} };
  const handler = routesFor(service, async (_url, options) => {
    prompt = JSON.parse(options.body).messages[1].content;
    return { json: async () => ({ choices: [{ message: { content: '报告' } }] }) };
  }).get('POST /api/analysis/consumption');
  const res = response();
  await handler({ body: { role: 'admin', startDate: '2026-10-12', endDate: '2026-10-12' }, auth: { type: 'admin', address: 'admin' } }, res);
  assert.equal(res.body.success, true);
  assert.match(prompt, /全量交易笔数：205/);
  assert.match(prompt, /仅为样本/);
  assert.doesNotMatch(prompt, /"id":300/);
});

test('date range only analyzes transactions authorized for the wallet role', async () => {
  let prompt;
  const otherWard = '0x1111111111111111111111111111111111111111';
  const service = {
    getAllAdminData: async () => ({ success: true, transactions: [
      { id: 1, ward_address: ward, amount: '10', created_at: '2026-10-12T12:00:00Z' },
      { id: 2, ward_address: otherWard, amount: '999', created_at: '2026-10-12T12:00:00Z' }
    ] }), contract: {}, generateSeedData() {}
  };
  const handler = routesFor(service, async (_url, options) => {
    prompt = JSON.parse(options.body).messages[1].content;
    return { json: async () => ({ choices: [{ message: { content: '报告' } }] }) };
  }).get('POST /api/analysis/consumption');
  const res = response();
  await handler({ body: { role: 'ward', startDate: '2026-10-12', endDate: '2026-10-12' }, auth: { type: 'wallet', address: ward } }, res);
  assert.equal(res.body.success, true);
  assert.match(prompt, /全量交易笔数：1/);
  assert.doesNotMatch(prompt, /999/);
});

test('date range respects merchant and guardian access and the selected ward', async () => {
  const merchant = '0x2222222222222222222222222222222222222222';
  const guardian = '0x3333333333333333333333333333333333333333';
  const otherWard = '0x1111111111111111111111111111111111111111';
  const transactions = [
    { id: 1, ward_address: ward, merchant_address: merchant, amount: '10', created_at: '2026-10-12T12:00:00Z' },
    { id: 2, ward_address: otherWard, merchant_address: merchant, amount: '20', created_at: '2026-10-12T12:00:00Z' },
    { id: 3, ward_address: otherWard, merchant_address: guardian, amount: '30', created_at: '2026-10-12T12:00:00Z' }
  ];
  const service = {
    getAllAdminData: async () => ({ success: true, transactions }),
    contract: { isWardGuardian: async candidate => candidate.toLowerCase() === ward.toLowerCase() },
    generateSeedData() {}
  };
  let prompt;
  const handler = routesFor(service, async (_url, options) => {
    prompt = JSON.parse(options.body).messages[1].content;
    return { json: async () => ({ choices: [{ message: { content: '报告' } }] }) };
  }).get('POST /api/analysis/consumption');
  const merchantRes = response();
  await handler({ body: { role: 'merchant', startDate: '2026-10-12', endDate: '2026-10-12' }, auth: { type: 'wallet', address: merchant } }, merchantRes);
  assert.equal(merchantRes.body.success, true);
  assert.match(prompt, /全量交易笔数：2/);
  const guardianRes = response();
  await handler({ body: { role: 'guardian', scopeWard: ward, startDate: '2026-10-12', endDate: '2026-10-12' }, auth: { type: 'wallet', address: guardian } }, guardianRes);
  assert.equal(guardianRes.body.success, true);
  assert.match(prompt, /全量交易笔数：1/);
});

test('admin freeze waits for a successful chain receipt and returns the confirmed state', async () => {
  const owner = '0x1111111111111111111111111111111111111111';
  const calls = [];
  const paymentService = {
    contract: {
      owner: async () => owner,
      runner: { getAddress: async () => owner },
      setFreezeAccount: async (address, freeze) => {
        calls.push([address, freeze]);
        return { wait: async () => ({ status: 1, hash: '0xfreeze' }) };
      },
      isFrozen: async () => true
    },
    generateSeedData() {}
  };
  const handler = routesFor(paymentService).get('POST /api/admin/freeze');
  const res = response();
  await handler({ body: { address: ward, freeze: true }, auth: { type: 'admin' } }, res);

  assert.equal(res.body.success, true);
  assert.equal(res.body.isFrozen, true);
  assert.deepEqual(calls, [[ward, true]]);
});

test('admin freeze refuses a service signer that is not the contract owner', async () => {
  let wrote = false;
  const paymentService = {
    contract: {
      owner: async () => '0x1111111111111111111111111111111111111111',
      runner: { getAddress: async () => '0x2222222222222222222222222222222222222222' },
      setFreezeAccount: async () => { wrote = true; }
    },
    generateSeedData() {}
  };
  const handler = routesFor(paymentService).get('POST /api/admin/freeze');
  const res = response();
  await handler({ body: { address: ward, freeze: true }, auth: { type: 'admin' } }, res);

  assert.equal(res.code, 503);
  assert.equal(wrote, false);
});
