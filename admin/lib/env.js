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

  // sign-in with Google (hosted). Left empty locally, where the password is used.
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  // Render publishes the service URL itself, so the redirect URI needs no setup
  PUBLIC_URL: (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, ''),

  // the owner is set here, not in the member list — so the list can never lock
  // the account holder out of their own panel
  OWNER_EMAIL: (process.env.OWNER_EMAIL || '').trim().toLowerCase(),

  // private repo holding members.json (the site repo is public, so the team's
  // email addresses cannot live there)
  CONFIG_REPO: process.env.CONFIG_REPO || '',
  CONFIG_DIR: path.resolve(process.env.CONFIG_DIR
    || (HOSTED ? path.join(os.tmpdir(), '957-admin-config') : path.join(__dirname, '..', '.config-repo'))),
  CONFIG_BRANCH: process.env.CONFIG_BRANCH || 'main',

  // git
  GIT_REMOTE: process.env.GIT_REMOTE || 'https://github.com/Hyydesi/957-Project.git',
  GIT_BRANCH: process.env.GIT_BRANCH || 'main',
  GIT_TOKEN: process.env.GITHUB_TOKEN || '',
  GIT_USER_NAME: process.env.GIT_USER_NAME || '957 Admin',
  GIT_USER_EMAIL: process.env.GIT_USER_EMAIL || 'admin@957.studio',
};

// True once Google sign-in is configured; hosted installs require it.
env.GOOGLE_READY = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.PUBLIC_URL);
env.REDIRECT_URI = env.PUBLIC_URL ? `${env.PUBLIC_URL}/api/auth/callback` : '';

// Fail loudly at boot rather than serving an unprotected panel to the internet.
function check() {
  if (!env.HOSTED) return [];
  const missing = [];
  if (env.SESSION_SECRET.length < 16) missing.push('SESSION_SECRET (tối thiểu 16 ký tự)');
  if (!env.GIT_TOKEN) missing.push('GITHUB_TOKEN');
  if (!env.OWNER_EMAIL) missing.push('OWNER_EMAIL (gmail của bạn)');
  if (!env.GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
  if (!env.GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
  if (!env.PUBLIC_URL) missing.push('PUBLIC_URL (địa chỉ công khai của admin)');
  if (!env.CONFIG_REPO) missing.push('CONFIG_REPO (repo private chứa members.json)');
  return missing;
}

module.exports = { ...env, check };
