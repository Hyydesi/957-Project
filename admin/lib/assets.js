// Image library: browse assets/, upload, replace and delete.

const fs = require('fs');
const path = require('path');
const { ROOT, resolveInside, backup } = require('./files');

const ASSETS = path.join(ROOT, 'assets');
const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.mp4', '.webm']);
const MAX_BYTES = 50 * 1024 * 1024;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (ALLOWED.has(path.extname(entry.name).toLowerCase())) {
      const stat = fs.statSync(abs);
      out.push({
        path: path.relative(ROOT, abs).split(path.sep).join('/'),
        dir: path.relative(ASSETS, dir).split(path.sep).join('/') || '/',
        name: entry.name,
        size: stat.size,
        mtime: stat.mtimeMs,
      });
    }
  }
  return out;
}

function list() {
  const files = walk(ASSETS).sort((a, b) => a.path.localeCompare(b.path));
  const dirs = [...new Set(files.map((f) => f.dir))].sort();
  return { files, dirs };
}

// "Ảnh Hero.PNG" → "anh-hero.png"; keeps names URL-safe and predictable.
function safeName(name) {
  const ext = path.extname(name).toLowerCase();
  const base = path.basename(name, path.extname(name))
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'file';
  return base + ext;
}

function decode(dataUrl) {
  const base64 = String(dataUrl).includes(',') ? String(dataUrl).split(',')[1] : String(dataUrl);
  const buf = Buffer.from(base64, 'base64');
  if (!buf.length) throw new Error('File rỗng.');
  if (buf.length > MAX_BYTES) throw new Error('File vượt quá 50MB.');
  return buf;
}

// dir: a folder under assets/ ("/" for the root, "logos", "img/core", …).
// replacePath: an existing asset to overwrite in place, keeping its filename.
function save({ dir = '/', filename, data, replacePath = null }) {
  const buf = decode(data);
  let relPath;
  if (replacePath) {
    const abs = resolveInside(ASSETS, path.relative('assets', replacePath));
    if (!fs.existsSync(abs)) throw new Error('Ảnh cần thay thế không tồn tại.');
    if (path.extname(abs).toLowerCase() !== path.extname(filename || abs).toLowerCase()) {
      throw new Error('Ảnh thay thế phải cùng định dạng (' + path.extname(abs) + ').');
    }
    backup(path.relative(ROOT, abs));
    fs.writeFileSync(abs, buf);
    relPath = path.relative(ROOT, abs).split(path.sep).join('/');
  } else {
    const name = safeName(filename || 'upload.png');
    if (!ALLOWED.has(path.extname(name))) throw new Error('Định dạng không được hỗ trợ: ' + path.extname(name));
    const targetDir = dir === '/' ? ASSETS : resolveInside(ASSETS, dir);
    fs.mkdirSync(targetDir, { recursive: true });
    let final = path.join(targetDir, name);
    // never clobber an existing file on a plain upload — suffix instead
    let n = 2;
    while (fs.existsSync(final)) {
      final = path.join(targetDir, `${path.basename(name, path.extname(name))}-${n++}${path.extname(name)}`);
    }
    fs.writeFileSync(final, buf);
    relPath = path.relative(ROOT, final).split(path.sep).join('/');
  }
  return relPath;
}

function remove(relPath) {
  const abs = resolveInside(ASSETS, path.relative('assets', relPath));
  if (!fs.existsSync(abs)) throw new Error('Không tìm thấy file.');
  backup(path.relative(ROOT, abs));
  fs.unlinkSync(abs);
  return true;
}

module.exports = { list, save, remove, ALLOWED, MAX_BYTES, safeName };
