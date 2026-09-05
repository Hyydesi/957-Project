// Git plumbing for the admin panel.
//
// Locally this just drives the repo you are sitting in. When hosted, the server
// keeps its own clone of the site (SITE_DIR): edits are written there, and
// "Xuất bản" commits, rebases onto whatever is on GitHub, and pushes — which is
// what makes the change appear on the live site, since Vercel deploys on push.
//
// The access token is passed per-command and never written into .git/config,
// so a copy of the clone carries no credentials.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const env = require('./env');

const SITE_DIR = env.SITE_DIR;

function run(args, { cwd = SITE_DIR } = {}) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (!err) return resolve(stdout);
      // never let a token reach a log or an error shown in the browser
      const message = scrub((stderr || err.message || '').trim());
      reject(new Error(message));
    });
  });
}

const scrub = (text) => (env.GIT_TOKEN ? text.split(env.GIT_TOKEN).join('***') : text);

// Remote URL carrying the token — built on demand, never stored.
function authRemote() {
  if (!env.GIT_TOKEN) return env.GIT_REMOTE;
  return env.GIT_REMOTE.replace('https://', `https://x-access-token:${env.GIT_TOKEN}@`);
}


// Hosted mode is pinned to one branch and one remote URL. Locally we follow the
// branch you actually have checked out and the repo's own "origin", so pressing
// publish can never push your work onto a different branch.
async function target() {
  if (env.HOSTED) return { branch: env.GIT_BRANCH, remote: authRemote() };
  const branch = (await run(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  return { branch, remote: 'origin' };
}

const isRepo = () => fs.existsSync(path.join(SITE_DIR, '.git'));

// Hosted boot: make sure SITE_DIR holds a working clone of the branch we edit.
async function ensureClone() {
  if (!env.HOSTED) return { cloned: false, reason: 'local' };
  if (isRepo()) {
    await configure();
    try {
      await pull();
      return { cloned: false, pulled: true };
    } catch (e) {
      return { cloned: false, pulled: false, error: e.message };
    }
  }
  fs.mkdirSync(path.dirname(SITE_DIR), { recursive: true });
  // single branch only — the repo carries a few branches' worth of image history
  await run(['clone', '--single-branch', '--branch', env.GIT_BRANCH, authRemote(), SITE_DIR], { cwd: path.dirname(SITE_DIR) });
  // drop the token from the saved remote straight away
  await run(['remote', 'set-url', 'origin', env.GIT_REMOTE]);
  await configure();
  return { cloned: true };
}

async function configure() {
  await run(['config', 'user.name', env.GIT_USER_NAME]);
  await run(['config', 'user.email', env.GIT_USER_EMAIL]);
}

// Bring the clone up to date with GitHub. Refuses while there are unpublished
// edits, so nobody's work is silently thrown away.
async function pull() {
  const dirty = (await run(['status', '--porcelain'])).trim();
  if (dirty) throw new Error('Đang có thay đổi chưa xuất bản — hãy xuất bản hoặc huỷ trước khi đồng bộ.');
  // a commit waiting to be pushed would be wiped by the reset below
  const pending = await aheadCount();
  if (pending) {
    throw new Error(`Có ${pending} thay đổi đã lưu nhưng chưa lên GitHub — hãy bấm Xuất bản trước khi đồng bộ.`);
  }
  const { branch, remote } = await target();
  await run(['fetch', remote, branch]);
  await run(['reset', '--hard', 'FETCH_HEAD']);
  await run(['update-ref', `refs/remotes/origin/${branch}`, 'HEAD']).catch(() => {});
  return true;
}

// Commits made here that GitHub has not seen yet. Read from the tracking ref,
// so this stays a local, instant check.
async function aheadCount() {
  try {
    const { branch } = await target();
    const out = await run(['rev-list', '--count', `origin/${branch}..HEAD`]);
    return Number(out.trim()) || 0;
  } catch { return 0; }
}

async function status() {
  if (!isRepo()) return { repo: false, branch: env.GIT_BRANCH, files: [], ahead: 0 };
  const porcelain = await run(['status', '--porcelain']);
  const branch = (await run(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  const last = (await run(['log', '-1', '--pretty=%h %s (%cr)'])).trim();
  return {
    repo: true,
    branch,
    last,
    ahead: await aheadCount(),
    files: porcelain.split('\n').filter(Boolean).map((l) => ({ state: l.slice(0, 2).trim(), file: l.slice(3) })),
  };
}

// Commit everything, catch up with the remote, push. Returns what happened.
async function publish(message, { push = true } = {}) {
  if (!isRepo()) throw new Error('Thư mục website không phải một git repo.');
  const dirty = (await run(['status', '--porcelain'])).trim();
  // a commit from a previous attempt that never got pushed still counts as
  // work to publish — otherwise a failed push would strand it forever
  const pending = await aheadCount();
  if (!dirty && !pending) return { ok: true, note: 'Không có thay đổi nào để xuất bản.' };

  if (dirty) {
    await run(['add', '-A']);
    await run(['commit', '-m', String(message || 'Cập nhật nội dung từ admin')]);
  }
  if (!push) return { ok: true, committed: !!dirty, pushed: false };

  if (env.HOSTED && !env.GIT_TOKEN) throw new Error('Thiếu GITHUB_TOKEN nên không push được.');
  const { branch, remote } = await target();
  await run(['fetch', remote, branch]);
  try {
    await run(['rebase', 'FETCH_HEAD']);
  } catch {
    return rescue(remote, branch);
  }
  await run(['push', remote, `HEAD:${branch}`]);
  await run(['update-ref', `refs/remotes/origin/${branch}`, 'HEAD']).catch(() => {});
  return { ok: true, committed: true, pushed: true, branch };
}


// Someone changed the same lines on GitHub, so the edit cannot be replayed on
// top. Rather than leaving a commit stuck on the server — which would make
// every later publish fail the same way — park it on its own branch, push that,
// and put the working copy back in step with GitHub. Nothing is lost: the work
// is on a branch anyone can merge.
async function rescue(remote, branch) {
  await run(['rebase', '--abort']).catch(() => {});
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/(\d{8})(\d{4})/, '$1-$2');
  const rescueBranch = `admin-conflict-${stamp}`;
  await run(['branch', '-f', rescueBranch, 'HEAD']);
  await run(['push', remote, `${rescueBranch}:${rescueBranch}`]);
  await run(['reset', '--hard', 'FETCH_HEAD']);
  await run(['update-ref', `refs/remotes/origin/${branch}`, 'HEAD']).catch(() => {});
  return {
    ok: false,
    conflict: true,
    branch: rescueBranch,
    note: `Có người vừa sửa đúng chỗ bạn sửa trên GitHub nên không gộp tự động được. `
      + `Bản sửa của bạn đã được đẩy lên nhánh "${rescueBranch}" — nhờ người phụ trách code merge giúp. `
      + `Bản trên server đã lấy lại nội dung mới nhất từ GitHub, bạn có thể sửa lại từ đầu nếu muốn.`,
  };
}

module.exports = { ensureClone, pull, status, publish, isRepo, run, SITE_DIR };
