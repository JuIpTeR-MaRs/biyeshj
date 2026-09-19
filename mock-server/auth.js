const crypto = require("crypto");
const { ethers } = require("ethers");

const challenges = new Map();
const sessions = new Map();
const smsChallenges = new Map();
const SESSION_TTL_MS = 15 * 60 * 1000;
const CHALLENGE_TTL_MS = 2 * 60 * 1000;
const SMS_TTL_MS = 5 * 60 * 1000;
const SMS_RESEND_MS = 60 * 1000;
const SMS_MAX_ATTEMPTS = 5;

const pruneExpired = () => {
  const now = Date.now();
  for (const [address, challenge] of challenges) if (challenge.expiresAt < now) challenges.delete(address);
  for (const [token, session] of sessions) if (session.expiresAt < now) sessions.delete(token);
  for (const [phone, challenge] of smsChallenges) if (challenge.expiresAt < now) smsChallenges.delete(phone);
};

const normalizePhone = (value) => {
  const phone = String(value || "").trim();
  return /^1[3-9]\d{9}$/.test(phone) ? phone : null;
};

const issueAdminSmsCode = (req, res) => {
  pruneExpired();
  const phone = normalizePhone(req.body?.phone);
  const adminPhone = process.env.ADMIN_PHONE || "13800138000";
  if (!phone || phone !== adminPhone) {
    return res.status(400).json({ success: false, error: "管理员手机号不匹配" });
  }
  const existing = smsChallenges.get(phone);
  if (existing && Date.now() - existing.sentAt < SMS_RESEND_MS) {
    return res.status(429).json({ success: false, error: "验证码已发送，请稍后再试" });
  }
  const code = crypto.randomInt(100000, 1000000).toString();
  smsChallenges.set(phone, { code, sentAt: Date.now(), expiresAt: Date.now() + SMS_TTL_MS, attempts: 0 });
  console.log(`[Mock SMS] 管理员手机号 ${phone.slice(0, 3)}****${phone.slice(-4)} 的验证码：${code}（5 分钟有效）`);
  res.json({
    success: true,
    expiresIn: SMS_TTL_MS / 1000,
    ...(process.env.NODE_ENV !== "production" ? { mockCode: code } : {})
  });
};

const consumeAdminSmsCode = (phoneValue, codeValue) => {
  pruneExpired();
  const phone = normalizePhone(phoneValue);
  const challenge = phone && smsChallenges.get(phone);
  if (!challenge) return false;
  challenge.attempts += 1;
  if (challenge.attempts > SMS_MAX_ATTEMPTS) {
    smsChallenges.delete(phone);
    return false;
  }
  const supplied = Buffer.from(String(codeValue || ""));
  const expected = Buffer.from(challenge.code);
  const valid = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  if (valid) smsChallenges.delete(phone);
  return valid;
};

const normalizeAddress = (value) => {
  try { return ethers.getAddress(value); } catch { return null; }
};

const createToken = (principal) => {
  pruneExpired();
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, { ...principal, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
};

const authMessage = (address, nonce) =>
  `GuardianDApp authentication\nAddress: ${address}\nNonce: ${nonce}`;

const issueChallenge = (req, res) => {
  pruneExpired();
  const address = normalizeAddress(req.body?.address);
  if (!address) return res.status(400).json({ success: false, error: "Invalid address" });
  const nonce = crypto.randomBytes(24).toString("base64url");
  challenges.set(address, { nonce, expiresAt: Date.now() + CHALLENGE_TTL_MS });
  res.json({ success: true, address, nonce, message: authMessage(address, nonce) });
};

const createWalletSession = (req, res) => {
  const address = normalizeAddress(req.body?.address);
  const signature = req.body?.signature;
  const challenge = address && challenges.get(address);
  if (!address || !signature || !challenge || challenge.expiresAt < Date.now()) {
    return res.status(401).json({ success: false, error: "Invalid or expired challenge" });
  }
  let recovered;
  try { recovered = ethers.verifyMessage(authMessage(address, challenge.nonce), signature); } catch { recovered = null; }
  challenges.delete(address);
  if (!recovered || normalizeAddress(recovered) !== address) {
    return res.status(401).json({ success: false, error: "Signature verification failed" });
  }
  res.json({ success: true, token: createToken({ type: "wallet", address }), expiresIn: SESSION_TTL_MS / 1000 });
};

const createAdminSession = (req, res) => {
  const configured = process.env.ADMIN_PASSWORD;
  if (!configured) return res.status(503).json({ success: false, error: "ADMIN_PASSWORD is not configured" });
  const supplied = Buffer.from(String(req.body?.password || ""));
  const expected = Buffer.from(configured);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return res.status(401).json({ success: false, error: "Invalid credentials" });
  }
  if (!consumeAdminSmsCode(req.body?.phone, req.body?.smsCode)) {
    return res.status(401).json({ success: false, error: "验证码无效、已过期或已使用" });
  }
  res.json({ success: true, token: createToken({ type: "admin", address: "admin" }), expiresIn: SESSION_TTL_MS / 1000 });
};

const requireAuth = (req, res, next) => {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return res.status(401).json({ success: false, error: "Authentication required" });
  }
  req.auth = session;
  next();
};

const requireAdmin = (req, res, next) => {
  if (req.auth?.type !== "admin") return res.status(403).json({ success: false, error: "Admin access required" });
  next();
};

const sameAddress = (left, right) => {
  const a = normalizeAddress(left);
  const b = normalizeAddress(right);
  return Boolean(a && b && a === b);
};

module.exports = { issueChallenge, issueAdminSmsCode, createWalletSession, createAdminSession, requireAuth, requireAdmin, sameAddress };
