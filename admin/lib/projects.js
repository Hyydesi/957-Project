// Project list: read/write projects.js and keep the home-grid cards in step.
//
// projects.js is the single source of truth (works.html renders from it).
// index.html carries hand-built cards with their own hover-annotation overlays,
// so those are updated field by field — never regenerated — and matched by
// data-code. Cards for new projects are appended in the plain layout.

const { readText, writeText } = require('./files');
const { tagBounds, closeTagIndex, escapeHtml, escapeAttr } = require('./html');

const FILE = 'projects.js';
const HOME = 'index.html';
const FIELDS = ['code', 'name', 'year', 'category', 'image', 'cover', 'logo', 'video', 'title', 'desc', 'tags', 'listTitle', 'href'];
const HEADER = `// Shared project data — single source of truth for the home grid (index.html)
// and the works page (works.html). Both pages render from this array.
//   code      → uppercase label shown in the home grid header
//   name      → display name (works hero badge / thumbs)
//   category  → space-separated tokens for the home grid category filter
//   year      → used by both the home year filter and the works listing`;

function read() {
  const src = readText(FILE);
  // our own generated file — evaluated in an empty scope to get the array back
  const list = new Function(`${src}\nreturn PROJECTS;`)();
  return list.map((p) => ({ ...p, tags: p.tags || [] }));
}

// Prefer single quotes, but switch to double when the text has an apostrophe —
// matches how the file was hand-written.
const q = (s) => {
  const str = String(s);
  if (str.includes("'") && !str.includes('"')) return '"' + str.replace(/\\/g, '\\\\') + '"';
  return "'" + str.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
};

function serialize(list) {
  const body = list.map((p) => {
    const lines = FIELDS
      .filter((k) => p[k] !== undefined && p[k] !== null && p[k] !== '' && !(Array.isArray(p[k]) && !p[k].length))
      .map((k) => (k === 'tags'
        ? `    tags: [${p.tags.map(q).join(', ')}],`
        : `    ${k}: ${q(p[k])},`));
    return `  {\n${lines.join('\n')}\n  },`;
  }).join('\n');
  return `${HEADER}\nconst PROJECTS = [\n${body}\n];\n`;
}

function normalize(p) {
  const code = String(p.code || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (!code) throw new Error('Project cần có mã (code).');
  const tags = Array.isArray(p.tags)
    ? p.tags.map((t) => String(t).trim()).filter(Boolean)
    : String(p.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
  const out = { ...p, code, tags };
  for (const k of Object.keys(out)) if (typeof out[k] === 'string') out[k] = out[k].trim();
  if (!out.name) out.name = code;
  if (!out.year) out.year = String(new Date().getFullYear());
  if (!out.category) out.category = 'app';
  return out;
}

function write(list) {
  const projects = list.map(normalize);
  const seen = new Set();
  for (const p of projects) {
    if (seen.has(p.code)) throw new Error('Mã project bị trùng: ' + p.code);
    seen.add(p.code);
  }
  writeText(FILE, serialize(projects));
  syncHomeCards(projects);
  return projects;
}

// ---------- home grid ----------

function cardBounds(html, code) {
  const marker = html.indexOf(`data-code="${code}"`);
  if (marker < 0) return null;
  const open = tagBounds(html, marker);
  if (!open || open.name !== 'article') return null;
  const close = closeTagIndex(html, 'article', open.openEnd);
  if (close < 0) return null;
  const end = html.indexOf('>', close) + 1;
  return { ...open, close, end, html: html.slice(open.start, end) };
}

function setAttr(openTag, attr, value) {
  const re = new RegExp(`(\\s${attr}\\s*=\\s*)"[^"]*"`, 'i');
  return re.test(openTag)
    ? openTag.replace(re, `$1"${escapeAttr(value)}"`)
    : openTag.replace(/(<article)/i, `$1 ${attr}="${escapeAttr(value)}"`);
}

function tagsMarkup(tags, indent = '            ') {
  const cls = ['a', 'b', 'c'];
  return tags.map((t, i) => `${indent}<span class="project__tag project__tag--${cls[i % 3]}">${escapeHtml(t)}</span>`).join('\n');
}

function plainCard(p, pos) {
  const inner = `        <header class="project__head"><span>${escapeHtml(p.code)}</span></header>
        <div class="project__img"><img src="${escapeAttr(p.image || '')}" alt="${escapeAttr(p.code)} project">
            <div class="project__tags">
${tagsMarkup(p.tags)}
            </div>
          </div>`;
  const body = p.href
    ? `        <a href="${escapeAttr(p.href)}" class="project__link">\n${inner}\n        </a>`
    : inner;
  return `      <article class="project pos-${pos}" data-category="${escapeAttr(p.category)}" data-year="${escapeAttr(p.year)}" data-code="${escapeAttr(p.code)}">\n${body}\n      </article>`;
}

// Rewrite one card's editable pieces, leaving its fx-card overlay untouched.
function updateCard(cardHtml, p) {
  let out = cardHtml;
  const openEnd = out.indexOf('>') + 1;
  let openTag = out.slice(0, openEnd);
  openTag = setAttr(openTag, 'data-category', p.category);
  openTag = setAttr(openTag, 'data-year', p.year);
  out = openTag + out.slice(openEnd);

  out = out.replace(/(<header class="project__head"><span>)[\s\S]*?(<\/span>)/,
    (_, a, b) => a + escapeHtml(p.code) + b);

  out = out.replace(/(<div class="project__img">\s*<img\s[^>]*?)src="[^"]*"/,
    (_, head) => `${head}src="${escapeAttr(p.image || '')}"`);
  out = out.replace(/(<div class="project__img">\s*<img\s[^>]*?)alt="[^"]*"/,
    (_, head) => `${head}alt="${escapeAttr(p.code)} project"`);

  out = out.replace(/(<div class="project__tags">\n)[\s\S]*?(\n\s*<\/div>)/,
    (_, a, b) => a + tagsMarkup(p.tags) + b);

  const hasAnchor = /<a\s[^>]*class="project__link"/.test(out);
  if (p.href && hasAnchor) {
    out = out.replace(/(<a\s[^>]*class="project__link"[^>]*?)href="[^"]*"/, (_, head) => `${head}href="${escapeAttr(p.href)}"`);
    if (!/<a\s[^>]*href=/.test(out)) out = out.replace(/<a\s/, `<a href="${escapeAttr(p.href)}" `);
  } else if (p.href && !hasAnchor) {
    out = wrapInLink(out, p.href);
  } else if (!p.href && hasAnchor) {
    out = unwrapLink(out);
  }
  return out;
}

// The clickable area is the header + image block; the overlay stays outside it.
function wrapInLink(cardHtml, href) {
  const headStart = cardHtml.indexOf('<header class="project__head">');
  const imgStart = cardHtml.indexOf('<div class="project__img">');
  if (headStart < 0 || imgStart < 0) return cardHtml;
  const imgClose = closeTagIndex(cardHtml, 'div', imgStart + 5);
  if (imgClose < 0) return cardHtml;
  const imgEnd = cardHtml.indexOf('>', imgClose) + 1;
  const block = cardHtml.slice(headStart, imgEnd);
  return cardHtml.slice(0, headStart)
    + `<a href="${escapeAttr(href)}" class="project__link">\n        ${block}\n        </a>`
    + cardHtml.slice(imgEnd);
}

function unwrapLink(cardHtml) {
  const aStart = cardHtml.search(/<a\s[^>]*class="project__link"/);
  if (aStart < 0) return cardHtml;
  const openEnd = cardHtml.indexOf('>', aStart) + 1;
  const close = closeTagIndex(cardHtml, 'a', openEnd);
  if (close < 0) return cardHtml;
  const end = cardHtml.indexOf('>', close) + 1;
  return cardHtml.slice(0, aStart) + cardHtml.slice(openEnd, close).trim() + cardHtml.slice(end);
}

function syncHomeCards(projects) {
  let html = readText(HOME);
  const codes = new Set(projects.map((p) => p.code));

  // drop cards for projects that are gone
  const existing = [...html.matchAll(/data-code="([^"]+)"/g)].map((m) => m[1]);
  for (const code of existing) {
    if (codes.has(code)) continue;
    const b = cardBounds(html, code);
    if (!b) continue;
    // take the card's whole line, plus the blank lines trailing it — the blank
    // line that preceded the card stays and separates its neighbours
    const lineStart = html.lastIndexOf('\n', b.start) + 1;
    const trail = (html.slice(b.end).match(/^[ \t]*\n(?:[ \t]*\n)*/) || [''])[0];
    html = html.slice(0, lineStart) + html.slice(b.end + trail.length);
  }

  // update the ones that stayed
  for (const p of projects) {
    const b = cardBounds(html, p.code);
    if (!b) continue;
    html = html.slice(0, b.start) + updateCard(b.html, p) + html.slice(b.end);
  }

  // append cards for new projects, after the last card already in the grid
  const newcomers = projects.filter((p) => !cardBounds(html, p.code));
  if (newcomers.length) {
    const gridOpen = html.indexOf('<div class="works__grid" id="worksGrid">');
    const gridClose = closeTagIndex(html, 'div', html.indexOf('>', gridOpen));
    let pos = (html.match(/class="project pos-/g) || []).length;
    const cards = newcomers.map((p) => plainCard(p, pos++ % 4)).join('\n\n');
    const lastCard = html.lastIndexOf('</article>', gridClose);
    const at = lastCard < 0 ? gridClose : lastCard + '</article>'.length;
    html = html.slice(0, at) + '\n\n' + cards + html.slice(at);
  }

  writeText(HOME, html);
}

module.exports = { read, write, serialize, normalize, syncHomeCards };
