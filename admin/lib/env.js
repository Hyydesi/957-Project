// Runtime configuration.
//
// Two modes:
//   local  — the default. Serves the repo you are sitting in; the password is
//            created on first visit and kept in admin/config.json.
//   hosted — running on a server (Render). The site lives in a git clone the
//            server makes for itself, the password comes from the environment,
//            and saved changes only reach the real website once they are pushed.

const path = require('path');
const os = require('os');

const MODE = process.env.ADMIN_MODE === 'hosted' ? 'hosted' : 'local';
const HOSTED = MODE === 'hosted';
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const DEFAULT_SITE_DIR = HOSTED
  ? (process.env.RENDER_DISK_PATH ? path.join(process.env.RENDER_DISK_PATH, 'site') : path.join(os.tmpdir(), '957-site'))
  : REPO_ROOT;

const env = {
  MODE,
  HOSTED,
  REPO_ROOT,
  SITE_DIR: path.resolve(process.env.SITE_DIR || DEFAULT_SITE_DIR),
  PORT: Number(process.env.PORT || process.env.ADMIN_PORT) || 4957,
  HOST: process.env.ADMIN_HOST || (HOSTED ? '0.0.0.0' : '127.0.0.1'),

  // hosted auth — nothing is written to disk, so both come from the environment
  PASSWORD: process.env.ADMIN_PASSWORD || '',
  SESSION_SECRET: process.env.SESSION_SECRET || '',

  // git
  GIT_REMOTE: process.env.GIT_REMOTE || 'https://github.com/Hyydesi/957-Project.git',
  GIT_BRANCH: process.env.GIT_BRANCH || 'main',
  GIT_TOKEN: process.env.GITHUB_TOKEN || '',
  GIT_USER_NAME: process.env.GIT_USER_NAME || '957 Admin',
  GIT_USER_EMAIL: process.env.GIT_USER_EMAIL || 'admin@957.studio',
};

// Fail loudly at boot rather than serving an unprotected panel to the internet.
function check() {
  if (!env.HOSTED) return [];
  const missing = [];
  if (env.PASSWORD.length < 8) missing.push('ADMIN_PASSWORD (tối thiểu 8 ký tự)');
  if (env.SESSION_SECRET.length < 16) missing.push('SESSION_SECRET (tối thiểu 16 ký tự)');
  if (!env.GIT_TOKEN) missing.push('GITHUB_TOKEN');
  return missing;
}

module.exports = { ...env, check };
