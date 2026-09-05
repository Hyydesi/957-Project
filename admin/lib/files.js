// Paths, safe writes and backups shared by the admin modules.

const fs = require('fs');
const path = require('path');
const env = require('./env');

// The site files being edited: the repo you are in when running locally, the
// server's own git clone when hosted.
const ROOT = env.SITE_DIR;
// Backups live next to the admin code, never inside the site — so they are
// not picked up by git when the hosted panel commits.
const BACKUP_DIR = path.join(__dirname, '..', '.backups');
const KEEP_BACKUPS = 30;

// Reject anything that would escape the repo (or a subfolder of it).
function resolveInside(base, relative) {
  const target = path.resolve(base, relative);
  const root = path.resolve(base);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error('Đường dẫn không hợp lệ: ' + relative);
  }
  return target;
}

// Snapshot a file before it is rewritten, so a bad edit is always recoverable.
function backup(relPath) {
  const abs = resolveInside(ROOT, relPath);
  if (!fs.existsSync(abs)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(BACKUP_DIR, stamp, relPath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(abs, dest);
  pruneBackups();
  return dest;
}

function pruneBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return;
  const snaps = fs.readdirSync(BACKUP_DIR).sort();
  for (const old of snaps.slice(0, Math.max(0, snaps.length - KEEP_BACKUPS))) {
    fs.rmSync(path.join(BACKUP_DIR, old), { recursive: true, force: true });
  }
}

function readText(relPath) {
  return fs.readFileSync(resolveInside(ROOT, relPath), 'utf8');
}

// Every content write goes through here: backup first, then replace.
function writeText(relPath, contents) {
  const abs = resolveInside(ROOT, relPath);
  backup(relPath);
  fs.writeFileSync(abs, contents);
}

module.exports = { ROOT, BACKUP_DIR, resolveInside, backup, readText, writeText };
