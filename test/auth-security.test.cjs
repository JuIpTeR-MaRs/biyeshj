const test = require('node:test');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');
const auth = require('../mock-server/auth');
const fs = require('node:fs');
const path = require('node:path');

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

test('wallet sessions require proof of the requested address', async () => {
  const wallet = ethers.Wallet.createRandom();
  const attacker = ethers.Wallet.createRandom();
  const challengeRes = response();
  auth.issueChallenge({ body: { address: wallet.address } }, challengeRes);

  const badRes = response();
  auth.createWalletSession({ body: { address: wallet.address, signature: await attacker.signMessage(challengeRes.body.message) } }, badRes);
  assert.equal(badRes.statusCode, 401);

  const retryChallenge = response();
  auth.issueChallenge({ body: { address: wallet.address } }, retryChallenge);
  const sessionRes = response();
  auth.createWalletSession({ body: { address: wallet.address, signature: await wallet.signMessage(retryChallenge.body.message) } }, sessionRes);
  assert.equal(sessionRes.statusCode, 200);
  assert.ok(sessionRes.body.token);

  const req = { get: () => `Bearer ${sessionRes.body.token}` };
  let continued = false;
  auth.requireAuth(req, response(), () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(req.auth.address, wallet.address);
});

test('requests without a bearer session are rejected', () => {
  const res = response();
  auth.requireAuth({ get: () => '' }, res, () => assert.fail('must not continue'));
  assert.equal(res.statusCode, 401);
});

test('sensitive routes require authentication and payment failures fail closed', () => {
  const source = fs.readFileSync(path.join(__dirname, '../mock-server/index.js'), 'utf8');
  for (const route of ['/api/bank/transfer', '/api/guardian/bind', '/api/guardian/threshold', '/api/alipay/pay', '/api/alipay/query', '/api/admin/all-data', '/api/analysis/consumption']) {
    const line = source.split(/\r?\n/).find(value => value.includes(`"${route}"`));
    assert.match(line || '', /auth\.requireAuth/);
  }
  assert.doesNotMatch(source, /支付宝沙箱宕机，自动切入 Mock Fallback/);
  assert.doesNotMatch(source, /支付宝查询接口宕机，将订单/);
  assert.match(source, /status: "UNKNOWN"/);
  assert.match(source, /txDetail\[7\] === false/);
  assert.match(source, /txs\.length === 0/);
  assert.match(source, /approvedOrderReservations\.has/);
  assert.match(source, /mayPersistWardReport/);
  assert.match(source, /app\.listen\(PORT, HOST/);
});

test('release Android policy rejects cleartext and user-added CAs', () => {
  const policy = fs.readFileSync(path.join(__dirname, '../android/app/src/main/res/xml/network_security_config.xml'), 'utf8');
  assert.match(policy, /cleartextTrafficPermitted="false"/);
  assert.doesNotMatch(policy, /certificates src="user"/);
});
