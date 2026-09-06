// Editable pages: every data-cms marker found in these files becomes a field.

const { readText, writeText } = require('./files');
const { scanFields, applyFields } = require('./html');

const PAGES = [
  { file: 'index.html', label: 'Trang chủ' },
  { file: 'works.html', label: 'Trang Works' },
  { file: 'klever.html', label: 'Case study — Klever' },
];

const pageOf = (file) => PAGES.find((p) => p.file === file);

function readPage(file) {
  const page = pageOf(file);
  if (!page) throw new Error('Trang không nằm trong danh sách được sửa: ' + file);
  const fields = scanFields(readText(file));
  const groups = [];
  for (const f of fields) {
    let group = groups.find((g) => g.name === f.group);
    if (!group) groups.push((group = { name: f.group, fields: [] }));
    group.fields.push(f);
  }
  return { ...page, groups, count: fields.length };
}

function savePage(file, updates) {
  if (!pageOf(file)) throw new Error('Trang không nằm trong danh sách được sửa: ' + file);
  const html = readText(file);
  const known = new Set(scanFields(html).map((f) => f.key));
  const clean = {};
  for (const [k, v] of Object.entries(updates || {})) {
    if (known.has(k)) clean[k] = String(v ?? '');
  }
  writeText(file, applyFields(html, clean));
  return Object.keys(clean).length;
}

function overview() {
  return PAGES.map((p) => {
    try { return { ...p, count: readPage(p.file).count }; }
    catch { return { ...p, count: 0 }; }
  });
}

module.exports = { PAGES, readPage, savePage, overview };
