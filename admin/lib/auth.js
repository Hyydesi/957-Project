// Password + session handling for the admin panel.
//
// Local mode: the password is created on first visit and kept as a scrypt hash
// in admin/config.json (gitignored). Hosted mode: nothing is written to disk —
// the password and the session secret come from the environment, and the
// first-visit setup screen is disabled so a stranger who finds the URL cannot
// claim the panel.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const env = require('./env');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const SESSION_MS = 8 * 60 * 60 * 1000;   // stay signed in for a working day
const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60 * 1000;

const attempts = { count: 0, lockedUntil: 0 };

// Hosted credentials are derived once at boot from the environment.
const hosted = env.HOSTED ? (() => {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: hash(env.PASSWORD, salt), secret: env.SESSION_SECRET };
})() : null;

function hash(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function readConfig() {
  if (hosted) return hosted;
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { return null; }
}

function hasPassword() {
  const c = readConfig();
  return !!(c && c.hash && c.salt);
}

// Only meaningful locally; hosted installs get their password from the env.
const canSetPassword = () => !env.HOSTED;

function setPassword(password) {
  if (env.HOSTED) throw new Error('Chế độ hosted: đổi mật khẩu bằng biến môi trường ADMIN_PASSWORD.');
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Mật khẩu phải có ít nhất 8 ký tự.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const config = {
    salt,
    hash: hash(password, salt),
    secret: crypto.randomBytes(32).toString('hex'),
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  fs.chmodSync(CONFIG_PATH, 0o600);
}

function lockRemainingMs() {
  return Math.max(0, attempts.lockedUntil - Date.now());
}

// Returns a session token on success, null on a wrong password.
function login(password) {
  if (lockRemainingMs() > 0) throw new Error('LOCKED');
  const config = readConfig();
  if (!config) throw new Error('NO_PASSWORD');
  const given = Buffer.from(hash(String(password ?? ''), config.salt), 'hex');
  const known = Buffer.from(config.hash, 'hex');
  const ok = given.length === known.length && crypto.timingSafeEqual(given, known);
  if (!ok) {
    attempts.count++;
    if (attempts.count >= MAX_ATTEMPTS) {
      attempts.lockedUntil = Date.now() + LOCK_MS;
      attempts.count = 0;
    }
    return null;
  }
  attempts.count = 0;
  return issueToken(config.secret);
}

function issueToken(secret) {
  const expires = Date.now() + SESSION_MS;
  const sig = crypto.createHmac('sha256', secret).update(String(expires)).digest('hex');
  return `${expires}.${sig}`;
}

function verifyToken(token) {
  const config = readConfig();
  if (!config || !token) return false;
  const [expires, sig] = String(token).split('.');
  if (!expires || !sig) return false;
  if (Number(expires) < Date.now()) return false;
  const expected = crypto.createHmac('sha256', config.secret).update(expires).digest('hex');
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function changePassword(current, next) {
  if (env.HOSTED) throw new Error('HOSTED');
  if (login(current) === null) throw new Error('WRONG_PASSWORD');
  setPassword(next);
}

module.exports = {
  CONFIG_PATH, SESSION_MS, hasPassword, canSetPassword, setPassword,
  login, verifyToken, changePassword, lockRemainingMs,
};
