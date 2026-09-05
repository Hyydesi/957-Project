// 957 admin panel — talks to the local admin server, which writes the real
// project files. Everything here is plain DOM; no build step.

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, ...kids) => {
  const node = Object.assign(document.createElement(tag), props);
  kids.flat().forEach((k) => k && node.append(k));
  return node;
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function api(path, body) {
  const res = await fetch('/api/' + path, body === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Request': '1' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`);
  return data;
}

let toastTimer;
function toast(message, kind = 'ok') {
  const t = $('#toast');
  t.textContent = message;
  t.className = 'toast is-' + kind;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, kind === 'error' ? 6000 : 3000);
}

const IMG_RE = /\.(jpe?g|png|gif|svg|webp|avif)$/i;
const state = { assets: { files: [], dirs: [] }, page: null, projects: [], session: {} };
const hosted = () => state.session.mode === 'hosted';

// ---------- gate ----------

function showGate(mode) {
  $('#app').hidden = true;
  $('#gate').hidden = false;
  const setup = mode === 'setup';
  $('#gateTitle').textContent = setup ? 'Tạo mật khẩu quản trị' : 'Đăng nhập';
  $('#gateHint').textContent = setup
    ? 'Lần đầu chạy admin: đặt mật khẩu (tối thiểu 8 ký tự). Mật khẩu được lưu dạng mã hoá trong admin/config.json và không được đưa lên git.'
    : 'Nhập mật khẩu quản trị để tiếp tục.';
  $('#gateLabel').textContent = setup ? 'Mật khẩu mới' : 'Mật khẩu';
  $('#gateConfirmWrap').hidden = !setup;
  $('#gateSubmit').textContent = setup ? 'Tạo mật khẩu & vào admin' : 'Vào trang quản trị';
  $('#gatePass').autocomplete = setup ? 'new-password' : 'current-password';
  $('#gateForm').dataset.mode = setup ? 'setup' : 'login';
  $('#gatePass').focus();
}

$('#gateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#gateError');
  err.hidden = true;
  const password = $('#gatePass').value;
  const setup = e.currentTarget.dataset.mode === 'setup';
  if (setup && password !== $('#gatePass2').value) {
    err.textContent = 'Hai ô mật khẩu chưa khớp.';
    err.hidden = false;
    return;
  }
  try {
    await api(setup ? 'setup' : 'login', { password });
    $('#gatePass').value = $('#gatePass2').value = '';
    startApp();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});

// ---------- shell ----------

$('#tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  [...$('#tabs').children].forEach((b) => b.classList.toggle('is-active', b === btn));
  for (const view of document.querySelectorAll('.view')) view.hidden = true;
  $('#view-' + btn.dataset.tab).hidden = false;
  ({ content: renderContent, projects: renderProjects, assets: renderAssets, publish: renderPublish }[btn.dataset.tab])();
});

$('#logout').addEventListener('click', async () => {
  await api('logout', {});
  location.reload();
});

$('#changePass').addEventListener('click', async () => {
  const current = prompt('Mật khẩu hiện tại:');
  if (!current) return;
  const next = prompt('Mật khẩu mới (tối thiểu 8 ký tự):');
  if (!next) return;
  try {
    await api('password', { current, next });
    alert('Đã đổi mật khẩu. Hãy đăng nhập lại.');
    location.reload();
  } catch (ex) { toast(ex.message, 'error'); }
});

async function startApp() {
  state.session = await api('session');
  $('#gate').hidden = true;
  $('#app').hidden = false;
  // hosted installs get their password from the server's environment
  $('#changePass').hidden = !state.session.canChangePassword;
  $('#modeBadge').hidden = !hosted();
  await loadAssets();
  renderContent();
}

async function loadAssets() {
  state.assets = await api('assets');
}

// ---------- image picker ----------

let pickerResolve = null;
function pickImage() {
  return new Promise((resolve) => {
    pickerResolve = resolve;
    $('#pickerSearch').value = '';
    renderPicker('');
    $('#picker').hidden = false;
    $('#pickerSearch').focus();
  });
}
function closePicker(value) {
  $('#picker').hidden = true;
  if (pickerResolve) pickerResolve(value ?? null);
  pickerResolve = null;
}
$('#pickerClose').addEventListener('click', () => closePicker(null));
$('#picker').addEventListener('click', (e) => { if (e.target === $('#picker')) closePicker(null); });
$('#pickerSearch').addEventListener('input', (e) => renderPicker(e.target.value));
$('#pickerGrid').addEventListener('click', (e) => {
  const item = e.target.closest('.picker__item');
  if (item) closePicker(item.dataset.path);
});

function renderPicker(query) {
  const q = query.trim().toLowerCase();
  const files = state.assets.files.filter((f) => !q || f.path.toLowerCase().includes(q));
  $('#pickerGrid').innerHTML = files.map((f) => `
    <button class="picker__item" data-path="${esc(f.path)}" type="button">
      <div class="acard__img">${IMG_RE.test(f.path) ? `<img src="/${esc(f.path)}" alt="" loading="lazy">` : '<span>VIDEO</span>'}</div>
      <p>${esc(f.path.replace(/^assets\//, ''))}</p>
    </button>`).join('') || '<p class="empty">Không có ảnh nào khớp.</p>';
}

// ---------- save bar ----------

function savebar(view, label, onSave) {
  let bar = $('.savebar', view);
  if (!bar) {
    bar = el('div', { className: 'savebar' });
    bar.innerHTML = `<p></p><button class="btn btn--primary" type="button">Lưu thay đổi</button>`;
    $('.btn', bar).addEventListener('click', async (e) => {
      // hold the node: a save may re-render the view out from under the event
      const btn = e.currentTarget;
      btn.disabled = true;
      try { await onSave(); } catch (ex) { toast(ex.message, 'error'); }
      if (btn.isConnected) btn.disabled = false;
    });
    view.append(bar);
  }
  $('p', bar).textContent = label;
  return bar;
}

// ---------- tab: content ----------

let currentPageFile = 'index.html';
const pending = {};

async function renderContent() {
  const view = $('#view-content');
  const { pages } = await api('content');
  const page = await api('content/' + encodeURIComponent(currentPageFile));
  state.page = page;
  Object.keys(pending).forEach((k) => delete pending[k]);

  view.innerHTML = `
    <div class="view__head">
      <div>
        <h1>Nội dung website</h1>
        <p class="hint">Mỗi ô dưới đây tương ứng với một đoạn chữ hoặc một ảnh thật trong file HTML. Sửa xong bấm <b>Lưu thay đổi</b> — file gốc được sao lưu tự động trước khi ghi đè.</p>
      </div>
    </div>
    <div class="pagebar">${pages.map((p) => `
      <button data-file="${esc(p.file)}" class="${p.file === currentPageFile ? 'is-active' : ''}">${esc(p.label)} <span>(${p.count})</span></button>`).join('')}
    </div>
    <div id="groups"></div>`;

  $('.pagebar', view).addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-file]');
    if (!btn) return;
    currentPageFile = btn.dataset.file;
    renderContent();
  });

  const wrap = $('#groups', view);
  if (!page.groups.length) {
    wrap.innerHTML = '<p class="empty">Trang này chưa có vùng nào được đánh dấu sửa được.</p>';
  }
  for (const group of page.groups) {
    const box = el('div', { className: 'group' });
    const head = el('button', { className: 'group__head', type: 'button' });
    head.innerHTML = `<b>[+]</b> ${esc(group.name)} <span class="group__count">${group.fields.length} mục</span>`;
    const body = el('div', { className: 'group__body', hidden: true });
    head.addEventListener('click', () => {
      body.hidden = !body.hidden;
      $('b', head).textContent = body.hidden ? '[+]' : '[–]';
    });
    for (const field of group.fields) body.append(fieldControl(field));
    box.append(head, body);
    wrap.append(box);
  }

  savebar(view, `${page.label} — ${page.count} mục có thể sửa`, async () => {
    if (!Object.keys(pending).length) return toast('Chưa có thay đổi nào.', 'ok');
    const res = await api('content/' + encodeURIComponent(currentPageFile), { updates: pending });
    toast(`Đã lưu ${res.saved} mục vào ${currentPageFile}.`);
    renderContent();
  });
}

function fieldControl(field) {
  const label = el('label', { className: 'field' });
  const title = el('span', { textContent: field.label });
  const track = (value) => { pending[field.key] = value; };

  if (field.type === 'image') {
    label.className = 'field';
    const row = el('div', { className: 'imgfield' });
    const thumb = el('div', { className: 'imgfield__thumb' });
    const img = el('img', { src: '/' + field.value, alt: '' });
    thumb.append(img);
    const input = el('input', { type: 'text', value: field.value });
    const pick = el('button', { className: 'btn btn--ghost', type: 'button', textContent: 'Chọn' });
    pick.addEventListener('click', async () => {
      const chosen = await pickImage();
      if (!chosen) return;
      input.value = chosen;
      img.src = '/' + chosen;
      track(chosen);
    });
    input.addEventListener('input', () => { img.src = '/' + input.value; track(input.value); });
    const body = el('div', { className: 'imgfield__body' }, title, el('div', { className: 'imgfield__row' }, input, pick));
    row.append(thumb, body);
    label.append(row);
    return label;
  }

  let input;
  if (field.type === 'html' || (field.value || '').length > 90) {
    input = el('textarea', { value: field.value });
    if (field.type === 'html') label.append(title, input, el('p', { className: 'hint', textContent: 'Ô này chứa HTML — giữ nguyên các thẻ bên trong.' }));
    else label.append(title, input);
  } else {
    input = el('input', { type: field.type === 'url' ? 'text' : 'text', value: field.value });
    label.append(title, input);
  }
  input.addEventListener('input', () => track(input.value));
  return label;
}

// ---------- tab: projects ----------

const P_FIELDS = [
  ['code', 'Mã (viết hoa, dùng cho card trang chủ)', 'text'],
  ['name', 'Tên hiển thị', 'text'],
  ['year', 'Năm', 'text'],
  ['category', 'Category (web / app / visual — cách nhau bằng dấu cách)', 'text'],
  ['title', 'Tiêu đề ở trang Works', 'text'],
  ['listTitle', 'Dòng tiêu đề trong danh sách', 'text'],
  ['desc', 'Mô tả', 'textarea'],
  ['tags', 'Tags (cách nhau bằng dấu phẩy)', 'text'],
  ['image', 'Ảnh thumbnail (card trang chủ)', 'image'],
  ['cover', 'Ảnh cover (hero trang Works)', 'image'],
  ['logo', 'Logo project', 'image'],
  ['video', 'Link video nền (Vimeo/YouTube embed)', 'text'],
  ['href', 'Link trang case study (để trống = Coming soon)', 'text'],
];

async function renderProjects() {
  const view = $('#view-projects');
  const { projects } = await api('projects');
  state.projects = projects;
  view.innerHTML = `
    <div class="view__head">
      <div>
        <h1>Projects</h1>
        <p class="hint">Sửa ở đây sẽ cập nhật <b>projects.js</b> (trang Works) và đồng bộ card tương ứng trên trang chủ. Project thêm mới sẽ có card dạng cơ bản, không kèm lớp hiệu ứng vẽ tay như 4 card gốc.</p>
      </div>
      <div class="view__actions"><button class="btn" id="addProject" type="button">+ Thêm project</button></div>
    </div>
    <div class="plist" id="plist"></div>`;

  const list = $('#plist', view);
  const draw = () => {
    list.innerHTML = '';
    state.projects.forEach((p, i) => list.append(projectCard(p, i, draw)));
  };
  draw();

  $('#addProject', view).addEventListener('click', () => {
    state.projects.push({ code: 'PROJECT_MOI', name: 'Project mới', year: String(new Date().getFullYear()), category: 'app', tags: [], image: 'assets/project-1.jpg' });
    draw();
    list.lastElementChild.querySelector('.pcard__body').hidden = false;
  });

  savebar(view, `${state.projects.length} project`, async () => {
    const res = await api('projects', { projects: state.projects });
    state.projects = res.projects;
    toast('Đã lưu projects.js và đồng bộ card trang chủ.');
    draw();
  });
}

function projectCard(p, index, redraw) {
  const card = el('div', { className: 'pcard' });
  const head = el('button', { className: 'pcard__head', type: 'button' });
  head.innerHTML = `<span class="pcard__code">${esc(p.code)}</span><span class="pcard__name">${esc(p.name || '')}</span><span class="pcard__year">${esc(p.year || '')}</span>`;
  const body = el('div', { className: 'pcard__body', hidden: true });
  head.addEventListener('click', () => { body.hidden = !body.hidden; foot.hidden = body.hidden; });

  for (const [key, label, type] of P_FIELDS) {
    const wrap = el('label', { className: 'field' + (type === 'textarea' ? ' span-2' : '') });
    const value = key === 'tags' ? (p.tags || []).join(', ') : (p[key] || '');
    wrap.append(el('span', { textContent: label }));
    if (type === 'image') {
      const row = el('div', { className: 'imgfield__row' });
      const input = el('input', { type: 'text', value });
      const pick = el('button', { className: 'btn btn--ghost', type: 'button', textContent: 'Chọn' });
      pick.addEventListener('click', async () => {
        const chosen = await pickImage();
        if (!chosen) return;
        input.value = chosen;
        p[key] = chosen;
      });
      input.addEventListener('input', () => { p[key] = input.value.trim(); });
      row.append(input, pick);
      wrap.append(row);
    } else {
      const input = type === 'textarea' ? el('textarea', { value }) : el('input', { type: 'text', value });
      input.addEventListener('input', () => {
        p[key] = key === 'tags' ? input.value.split(',').map((t) => t.trim()).filter(Boolean) : input.value;
        if (key === 'code' || key === 'name' || key === 'year') {
          $('.pcard__code', head).textContent = p.code || '';
          $('.pcard__name', head).textContent = p.name || '';
          $('.pcard__year', head).textContent = p.year || '';
        }
      });
      wrap.append(input);
    }
    body.append(wrap);
  }

  const foot = el('div', { className: 'pcard__foot', hidden: true });
  const up = el('button', { className: 'btn', type: 'button', textContent: '↑ Lên' });
  const down = el('button', { className: 'btn', type: 'button', textContent: '↓ Xuống' });
  const del = el('button', { className: 'btn btn--danger', type: 'button', textContent: 'Xoá project' });
  up.addEventListener('click', () => { if (index > 0) { const l = state.projects; [l[index - 1], l[index]] = [l[index], l[index - 1]]; redraw(); } });
  down.addEventListener('click', () => { const l = state.projects; if (index < l.length - 1) { [l[index + 1], l[index]] = [l[index], l[index + 1]]; redraw(); } });
  del.addEventListener('click', () => {
    if (!confirm(`Xoá "${p.code}" khỏi danh sách? Card trên trang chủ cũng sẽ bị gỡ khi bạn bấm Lưu.`)) return;
    state.projects.splice(index, 1);
    redraw();
  });
  foot.append(up, down, del);

  card.append(head, body, foot);
  return card;
}

// ---------- tab: assets ----------

let assetFilter = { dir: 'all', q: '' };

async function renderAssets() {
  const view = $('#view-assets');
  await loadAssets();
  view.innerHTML = `
    <div class="view__head">
      <div>
        <h1>Ảnh &amp; video</h1>
        <p class="hint">Ảnh được lưu thẳng vào thư mục <b>assets/</b> của website. “Thay thế” giữ nguyên tên file nên mọi chỗ đang dùng ảnh đó sẽ đổi theo ngay.</p>
      </div>
    </div>
    <div class="uploader" id="drop">
      <div class="uploader__text">
        <b>Kéo thả ảnh vào đây</b>
        <span class="hint">hoặc bấm nút bên cạnh. Hỗ trợ jpg, png, gif, svg, webp, avif, mp4, webm — tối đa 50MB mỗi file.</span>
      </div>
      <label class="field" style="min-width:200px">
        <span>Lưu vào thư mục</span>
        <select id="uploadDir">${['/', ...state.assets.dirs.filter((d) => d !== '/')].map((d) => `<option value="${esc(d)}">assets/${d === '/' ? '' : esc(d)}</option>`).join('')}</select>
      </label>
      <button class="btn btn--primary" id="pickFile" type="button">Chọn file để tải lên</button>
      <input type="file" id="fileInput" multiple hidden accept="image/*,video/mp4,video/webm">
    </div>
    <div class="assetbar">
      <select id="dirFilter">
        <option value="all">Tất cả thư mục (${state.assets.files.length})</option>
        ${state.assets.dirs.map((d) => `<option value="${esc(d)}">assets/${d === '/' ? '' : esc(d)}</option>`).join('')}
      </select>
      <input type="search" id="assetSearch" placeholder="Tìm theo tên file…">
    </div>
    <div class="agrid" id="agrid"></div>`;

  $('#dirFilter', view).value = assetFilter.dir;
  $('#assetSearch', view).value = assetFilter.q;
  $('#dirFilter', view).addEventListener('change', (e) => { assetFilter.dir = e.target.value; drawAssets(); });
  $('#assetSearch', view).addEventListener('input', (e) => { assetFilter.q = e.target.value; drawAssets(); });
  $('#pickFile', view).addEventListener('click', () => $('#fileInput', view).click());
  $('#fileInput', view).addEventListener('change', (e) => uploadFiles([...e.target.files], $('#uploadDir', view).value));

  const drop = $('#drop', view);
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('is-over');
    uploadFiles([...e.dataTransfer.files], $('#uploadDir', view).value);
  });

  drawAssets();
}

function drawAssets() {
  const grid = $('#agrid');
  if (!grid) return;
  const q = assetFilter.q.trim().toLowerCase();
  const files = state.assets.files.filter((f) =>
    (assetFilter.dir === 'all' || f.dir === assetFilter.dir) && (!q || f.name.toLowerCase().includes(q)));
  grid.innerHTML = files.map((f) => `
    <div class="acard" data-path="${esc(f.path)}">
      <div class="acard__img">${IMG_RE.test(f.name) ? `<img src="/${esc(f.path)}?t=${f.mtime}" alt="" loading="lazy">` : '<span>VIDEO</span>'}</div>
      <p class="acard__meta">${esc(f.name)}<em>${esc(f.path)} · ${(f.size / 1024).toFixed(0)} KB</em></p>
      <div class="acard__acts">
        <button class="btn" data-act="copy" type="button">Copy path</button>
        <button class="btn" data-act="replace" type="button">Thay thế</button>
        <button class="btn btn--danger" data-act="delete" type="button">Xoá</button>
      </div>
    </div>`).join('') || '<p class="empty">Không có file nào khớp.</p>';
}

$('#view-assets').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const path = btn.closest('.acard').dataset.path;
  if (btn.dataset.act === 'copy') {
    await navigator.clipboard.writeText(path);
    return toast('Đã copy: ' + path);
  }
  if (btn.dataset.act === 'delete') {
    if (!confirm(`Xoá ${path}? File được sao lưu trong admin/.backups/ trước khi xoá.`)) return;
    try { await api('assets/delete', { path }); toast('Đã xoá ' + path); renderAssets(); }
    catch (ex) { toast(ex.message, 'error'); }
    return;
  }
  if (btn.dataset.act === 'replace') {
    const input = el('input', { type: 'file', accept: 'image/*,video/mp4,video/webm' });
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        await api('assets/upload', { data: await toDataUrl(file), filename: file.name, replacePath: path });
        toast('Đã thay thế ' + path);
        renderAssets();
      } catch (ex) { toast(ex.message, 'error'); }
    });
    input.click();
  }
});

const toDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Không đọc được file.'));
  reader.readAsDataURL(file);
});

async function uploadFiles(files, dir) {
  if (!files.length) return;
  let done = 0;
  for (const file of files) {
    try {
      const res = await api('assets/upload', { dir, filename: file.name, data: await toDataUrl(file) });
      done++;
      toast(`Đã tải lên ${res.path}`);
    } catch (ex) { toast(`${file.name}: ${ex.message}`, 'error'); }
  }
  if (done) renderAssets();
}

// ---------- tab: publish ----------

async function renderPublish() {
  const view = $('#view-publish');
  const status = await api('git');
  const onServer = hosted();
  const changed = status.files.length;
  const pending = changed || status.ahead > 0;

  view.innerHTML = `
    <div class="view__head">
      <div>
        <h1>Xuất bản</h1>
        <p class="hint">${onServer
          ? `Thay đổi bạn lưu đang nằm trên server admin. Bấm <b>Xuất bản</b> để đẩy lên GitHub (nhánh <b>${esc(status.target)}</b>) — Vercel sẽ tự deploy lại website thật.`
          : `Thay đổi đã ghi vào file trên máy. Để website thật cập nhật, commit rồi push lên GitHub (nhánh <b>${esc(status.branch)}</b>).`}</p>
      </div>
    </div>
    ${onServer ? `<div class="notice"><b>Lưu ý:</b> server admin dùng ổ đĩa tạm. Thay đổi chưa xuất bản có thể mất khi Render khởi động lại — nên xuất bản ngay khi sửa xong.</div>` : ''}
    <div class="difflist">
      <p class="hint" style="margin-bottom:10px">${changed ? `${changed} file đã thay đổi:` : 'Không có file nào đang sửa dở.'}</p>
      <ul>${status.files.map((f) => `<li><span>${esc(f.state)}</span>${esc(f.file)}</li>`).join('')}</ul>
      ${status.ahead ? `<p class="publish__last">${status.ahead} thay đổi đã lưu nhưng chưa lên GitHub.</p>` : ''}
      ${status.last ? `<p class="publish__last">Bản mới nhất: ${esc(status.last)}</p>` : ''}
    </div>
    <form class="publish__form" id="publishForm">
      <label class="field"><span>Ghi chú thay đổi</span>
        <input type="text" id="commitMsg" value="Cập nhật nội dung từ admin" required></label>
      ${onServer ? '' : `<label class="hint" style="display:flex;gap:8px;align-items:center">
        <input type="checkbox" id="doPush" style="width:auto"> Push luôn lên GitHub sau khi commit</label>`}
      <div class="publish__row">
        <button class="btn btn--primary" type="submit" ${pending ? '' : 'disabled'}>
          ${onServer ? 'Xuất bản lên website' : 'Commit thay đổi'}</button>
        ${onServer ? '<button class="btn" type="button" id="pullBtn">Đồng bộ từ GitHub</button>' : ''}
      </div>
    </form>`;

  $('#publishForm', view).addEventListener('submit', async (e) => {
    e.preventDefault();
    const push = onServer || $('#doPush', view).checked;
    if (push && !confirm(onServer
      ? 'Xuất bản lên website thật? Thay đổi sẽ hiển thị công khai sau khi Vercel deploy xong.'
      : 'Push lên GitHub ngay? Thay đổi sẽ công khai trên repo.')) return;
    const btn = $('button[type=submit]', e.currentTarget);
    btn.disabled = true;
    try {
      const res = await api('git', { message: $('#commitMsg', view).value, push });
      if (res.conflict) alert(res.note);
      toast(res.conflict ? `Xung đột — bản sửa đã chuyển sang nhánh ${res.branch}` : (res.note || (res.pushed
        ? 'Đã xuất bản. Vercel sẽ deploy trong khoảng một phút.'
        : 'Đã commit. Nhớ push khi sẵn sàng.')), res.conflict ? 'error' : 'ok');
      renderPublish();
    } catch (ex) { toast(ex.message, 'error'); btn.disabled = false; }
  });

  const pull = $('#pullBtn', view);
  if (pull) pull.addEventListener('click', async () => {
    if (!confirm('Lấy bản mới nhất từ GitHub về server admin?')) return;
    pull.disabled = true;
    try {
      await api('git/pull', {});
      toast('Đã đồng bộ với GitHub.');
      renderPublish();
    } catch (ex) { toast(ex.message, 'error'); pull.disabled = false; }
  });
}

// ---------- boot ----------

(async () => {
  try {
    const session = await api('session');
    state.session = session;
    if (session.authed) startApp();
    else showGate(session.canSetup ? 'setup' : 'login');
  } catch (ex) {
    document.body.innerHTML = `<p class="empty">Không kết nối được admin server: ${esc(ex.message)}</p>`;
  }
})();
