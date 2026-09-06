// Who may use the panel.
//
// The site repo is public, so the team's email addresses cannot live there.
// Instead members.json sits in a small private repo the server clones for
// itself; adding or removing someone commits and pushes that file.
//
// The owner comes from OWNER_EMAIL rather than the list, so a mistake in the
// member list can never lock the account holder out of their own panel.

const fs = require('fs');
const path = require('path');
const env = require('./env');
const { run } = require('./git');

const FILE = 'members.json';
const ROLES = ['owner', 'editor'];
const gitBacked = () => !!env.CONFIG_REPO;
const filePath = () => path.join(env.CONFIG_DIR, FILE);

const normalize = (email) => String(email || '').trim().toLowerCase();

function authRemote() {
  if (!env.GIT_TOKEN) return env.CONFIG_REPO;
  return env.CONFIG_REPO.replace('https://', `https://x-access-token:${env.GIT_TOKEN}@`);
}


// Nothing changed locally and nothing waiting to be pushed.
async function settled() {
  try {
    const dirty = (await run(['status', '--porcelain'], { cwd: env.CONFIG_DIR })).trim();
    if (dirty) return false;
    const ahead = await run(['rev-list', '--count', `origin/${env.CONFIG_BRANCH}..HEAD`], { cwd: env.CONFIG_DIR });
    return Number(ahead.trim()) === 0;
  } catch { return true; }
}

// Clone (or refresh) the private config repo. Without CONFIG_REPO — the local
// default — members live in a plain gitignored file so the feature still works
// while developing.
async function ensure() {
  fs.mkdirSync(env.CONFIG_DIR, { recursive: true });
  if (gitBacked()) {
    if (fs.existsSync(path.join(env.CONFIG_DIR, '.git'))) {
      // only refresh when there is nothing of our own waiting to go out, so a
      // member change whose push failed is never thrown away by the reset
      if (await settled()) {
        await run(['fetch', authRemote(), env.CONFIG_BRANCH], { cwd: env.CONFIG_DIR });
        await run(['reset', '--hard', 'FETCH_HEAD'], { cwd: env.CONFIG_DIR });
      }
    } else {
      fs.rmSync(env.CONFIG_DIR, { recursive: true, force: true });
      await run(['clone', '--single-branch', '--branch', env.CONFIG_BRANCH, authRemote(), env.CONFIG_DIR],
        { cwd: path.dirname(env.CONFIG_DIR) });
      await run(['remote', 'set-url', 'origin', env.CONFIG_REPO], { cwd: env.CONFIG_DIR });
    }
    await run(['config', 'user.name', env.GIT_USER_NAME], { cwd: env.CONFIG_DIR });
    await run(['config', 'user.email', env.GIT_USER_EMAIL], { cwd: env.CONFIG_DIR });
  }
  if (!fs.existsSync(filePath())) writeFile({ members: [] });
  return true;
}

function readFile() {
  try {
    const data = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
    return { members: Array.isArray(data.members) ? data.members : [] };
  } catch { return { members: [] }; }
}

function writeFile(data) {
  fs.mkdirSync(env.CONFIG_DIR, { recursive: true });
  fs.writeFileSync(filePath(), JSON.stringify(data, null, 2) + '\n');
}

async function save(data, message) {
  writeFile(data);
  if (!gitBacked()) return;
  const dirty = (await run(['status', '--porcelain'], { cwd: env.CONFIG_DIR })).trim();
  if (!dirty) return;
  await run(['add', FILE], { cwd: env.CONFIG_DIR });
  await run(['commit', '-m', message], { cwd: env.CONFIG_DIR });
  await run(['push', authRemote(), `HEAD:${env.CONFIG_BRANCH}`], { cwd: env.CONFIG_DIR });
}

// The owner is always first and always present, whatever the file says.
function list() {
  const stored = readFile().members
    .map((m) => ({ ...m, email: normalize(m.email) }))
    .filter((m) => m.email && m.email !== env.OWNER_EMAIL);
  const owner = env.OWNER_EMAIL
    ? [{ email: env.OWNER_EMAIL, name: 'Owner', role: 'owner', locked: true }]
    : [];
  return [...owner, ...stored];
}

function roleFor(email) {
  const who = normalize(email);
  if (!who) return null;
  if (who === env.OWNER_EMAIL) return 'owner';
  const found = readFile().members.find((m) => normalize(m.email) === who);
  return found ? (ROLES.includes(found.role) ? found.role : 'editor') : null;
}

async function add({ email, name, role = 'editor' }, by) {
  const who = normalize(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(who)) throw new Error('Email không hợp lệ.');
  if (who === env.OWNER_EMAIL) throw new Error('Email này đã là owner.');
  if (!ROLES.includes(role)) throw new Error('Vai trò không hợp lệ.');
  const data = readFile();
  if (data.members.some((m) => normalize(m.email) === who)) throw new Error('Thành viên này đã có trong danh sách.');
  data.members.push({
    email: who,
    name: String(name || '').trim() || who.split('@')[0],
    role,
    addedAt: new Date().toISOString(),
    addedBy: normalize(by),
  });
  await save(data, `Add member ${who}`);
  return list();
}

async function remove(email, by) {
  const who = normalize(email);
  if (who === env.OWNER_EMAIL) throw new Error('Không thể xoá owner.');
  const data = readFile();
  const next = data.members.filter((m) => normalize(m.email) !== who);
  if (next.length === data.members.length) throw new Error('Không tìm thấy thành viên này.');
  await save({ members: next }, `Remove member ${who} (by ${normalize(by)})`);
  return list();
}

async function setRole(email, role, by) {
  const who = normalize(email);
  if (who === env.OWNER_EMAIL) throw new Error('Không thể đổi vai trò của owner.');
  if (!ROLES.includes(role)) throw new Error('Vai trò không hợp lệ.');
  const data = readFile();
  const found = data.members.find((m) => normalize(m.email) === who);
  if (!found) throw new Error('Không tìm thấy thành viên này.');
  found.role = role;
  found.updatedBy = normalize(by);
  await save(data, `Set ${who} to ${role}`);
  return list();
}

module.exports = { ensure, list, roleFor, add, remove, setRole, ROLES, gitBacked };
