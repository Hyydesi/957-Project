#!/usr/bin/env node
// Admin server for the 957 site.
//
//   npm start                     → local:  http://127.0.0.1:4957/admin
//   ADMIN_MODE=hosted node ...    → hosted: serves its own git clone of the site
//
// Local mode edits the repo you are sitting in. Hosted mode (Render) keeps a
// clone in SITE_DIR: saves land there, and "Xuất bản" pushes to GitHub, which
// is what makes Vercel redeploy the live site.

const http = require('http');
const fs = require('fs');
const path = require('path');

const env = require('./lib/env');
const auth = require('./lib/auth');
const assets = require('./lib/assets');
const content = require('./lib/content');
const projects = require('./lib/projects');
const git = require('./lib/git');
const { ROOT, resolveInside } = require('./lib/files');

const PUBLIC = path.join(__dirname, 'public');
const MAX_BODY = 60 * 1024 * 1024;
const COOKIE = 'admin_session';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

// ---------- helpers ----------

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
};
const json = (res, status, data, headers = {}) =>
  send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8', ...headers });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('Dữ liệu gửi lên quá lớn (tối đa 60MB).')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('Body không phải JSON hợp lệ.')); }
    });
    req.on('error', reject);
  });
}

const cookies = (req) => Object.fromEntries(
  (req.headers.cookie || '').split(';').map((c) => {
    const i = c.indexOf('=');
    return i < 0 ? [c.trim(), ''] : [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
  }).filter(([k]) => k),
);

const authed = (req) => auth.verifyToken(cookies(req)[COOKIE]);

// Render terminates TLS in front of us, so the scheme arrives in a header.
const isSecure = (req) => (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';

function sessionCookie(token, req) {
  const parts = [`${COOKIE}=${token || ''}`, 'Path=/', 'HttpOnly', 'SameSite=Strict'];
  parts.push(`Max-Age=${token ? Math.floor(auth.SESSION_MS / 1000) : 0}`);
  if (isSecure(req)) parts.push('Secure');
  return parts.join('; ');
}

// ---------- api ----------

async function api(req, res, url) {
  const route = url.pathname.replace(/^\/api\//, '');
  const isPost = req.method === 'POST';

  // same-origin guard on top of the SameSite cookie
  if (isPost && req.headers['x-admin-request'] !== '1') {
    return json(res, 400, { error: 'Thiếu header xác thực yêu cầu.' });
  }

  if (route === 'session' && !isPost) {
    return json(res, 200, {
      hasPassword: auth.hasPassword(),
      authed: authed(req),
      canSetup: auth.canSetPassword() && !auth.hasPassword(),
      canChangePassword: auth.canSetPassword(),
      mode: env.MODE,
    });
  }

  if (route === 'setup' && isPost) {
    if (!auth.canSetPassword()) return json(res, 403, { error: 'Chế độ hosted: mật khẩu đặt bằng biến môi trường.' });
    if (auth.hasPassword()) return json(res, 409, { error: 'Mật khẩu đã được thiết lập.' });
    const { password } = await readBody(req);
    auth.setPassword(password);
    const token = auth.login(password);
    return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(token, req) });
  }

  if (route === 'login' && isPost) {
    const { password } = await readBody(req);
    let token;
    try { token = auth.login(password); }
    catch (e) {
      if (e.message === 'LOCKED') {
        const mins = Math.ceil(auth.lockRemainingMs() / 60000);
        return json(res, 429, { error: `Sai quá nhiều lần. Thử lại sau ${mins} phút.` });
      }
      throw e;
    }
    if (!token) return json(res, 401, { error: 'Mật khẩu không đúng.' });
    return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(token, req) });
  }

  if (route === 'logout' && isPost) {
    return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(null, req) });
  }

  // everything below needs a session
  if (!authed(req)) return json(res, 401, { error: 'Chưa đăng nhập.' });

  if (route === 'password' && isPost) {
    if (!auth.canSetPassword()) {
      return json(res, 403, { error: 'Chế độ hosted: đổi mật khẩu bằng biến môi trường ADMIN_PASSWORD trên Render.' });
    }
    const { current, next } = await readBody(req);
    try { auth.changePassword(current, next); }
    catch (e) {
      if (e.message === 'WRONG_PASSWORD') return json(res, 401, { error: 'Mật khẩu hiện tại không đúng.' });
      throw e;
    }
    return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(null, req) });
  }

  if (route === 'content' && !isPost) return json(res, 200, { pages: content.overview() });

  if (route.startsWith('content/')) {
    const file = decodeURIComponent(route.slice('content/'.length));
    if (!isPost) return json(res, 200, content.readPage(file));
    const { updates } = await readBody(req);
    const saved = content.savePage(file, updates);
    return json(res, 200, { ok: true, saved, page: content.readPage(file) });
  }

  if (route === 'projects') {
    if (!isPost) return json(res, 200, { projects: projects.read() });
    const body = await readBody(req);
    const saved = projects.write(body.projects || []);
    return json(res, 200, { ok: true, projects: saved });
  }

  if (route === 'assets' && !isPost) return json(res, 200, assets.list());

  if (route === 'assets/upload' && isPost) {
    const body = await readBody(req);
    const saved = assets.save(body);
    return json(res, 200, { ok: true, path: saved });
  }

  if (route === 'assets/delete' && isPost) {
    const { path: rel } = await readBody(req);
    assets.remove(rel);
    return json(res, 200, { ok: true });
  }

  if (route === 'git' && !isPost) {
    const st = await git.status();
    return json(res, 200, { ...st, mode: env.MODE, remote: env.GIT_REMOTE, target: env.HOSTED ? env.GIT_BRANCH : st.branch });
  }

  if (route === 'git' && isPost) {
    const { message, push } = await readBody(req);
    // hosted saves live on an ephemeral disk, so publishing always pushes
    return json(res, 200, await git.publish(message, { push: env.HOSTED ? true : !!push }));
  }

  if (route === 'git/pull' && isPost) {
    await git.pull();
    return json(res, 200, { ok: true, ...(await git.status()) });
  }

  return json(res, 404, { error: 'Không tìm thấy endpoint.' });
}

// ---------- static ----------

function serveFile(res, abs, req) {
  fs.stat(abs, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
    const type = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
    // the site is served for live preview — never let the browser cache it
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Cache-Control': 'no-store' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(abs).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);

    // admin panel
    if (url.pathname === '/admin') return send(res, 302, '', { Location: '/admin/' });
    if (url.pathname.startsWith('/admin/')) {
      const rel = url.pathname.slice('/admin/'.length) || 'index.html';
      return serveFile(res, resolveInside(PUBLIC, rel), req);
    }

    // the site itself, for preview
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    if (/^(admin|\.git)(\/|$)/.test(rel)) return send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain' });
    return serveFile(res, resolveInside(ROOT, rel), req);
  } catch (e) {
    if (url.pathname.startsWith('/api/')) return json(res, 400, { error: e.message });
    send(res, 400, e.message, { 'Content-Type': 'text/plain; charset=utf-8' });
  }
});

// ---------- boot ----------

(async () => {
  const missing = env.check();
  if (missing.length) {
    console.error('\n  Thiếu biến môi trường bắt buộc cho chế độ hosted:');
    for (const m of missing) console.error('   - ' + m);
    console.error('  Đặt chúng trong phần Environment của Render rồi deploy lại.\n');
    process.exit(1);
  }

  if (env.HOSTED) {
    console.log(`  Đang chuẩn bị bản làm việc tại ${env.SITE_DIR} …`);
    try {
      const result = await git.ensureClone();
      console.log(result.cloned ? '  Đã clone repo.' : `  Đã có sẵn bản clone${result.pulled ? ', đã đồng bộ với GitHub.' : '.'}`);
      if (result.error) console.warn('  Không đồng bộ được lúc khởi động: ' + result.error);
    } catch (e) {
      console.error('  Không chuẩn bị được bản làm việc: ' + e.message);
      process.exit(1);
    }
  }

  server.listen(env.PORT, env.HOST, () => {
    console.log(`\n  957 admin — chế độ ${env.MODE}`);
    if (env.HOSTED) {
      console.log(`  Đang phục vụ ${env.SITE_DIR}, xuất bản lên nhánh ${env.GIT_BRANCH}`);
      console.log(`  Lắng nghe cổng ${env.PORT}\n`);
    } else {
      const state = auth.hasPassword() ? 'đã có mật khẩu' : 'chưa đặt mật khẩu — mở trang admin để tạo';
      console.log(`  Trang quản trị : http://${env.HOST}:${env.PORT}/admin/   (${state})`);
      console.log(`  Xem thử website: http://${env.HOST}:${env.PORT}/\n`);
    }
  });
})();
