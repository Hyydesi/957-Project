// Marker-based HTML editing.
//
// Any element in the site's HTML carrying a data-cms marker becomes an editable
// field in the admin panel — no separate schema to keep in sync:
//
//   <p data-cms="hero.line1">BASED IN VIETNAM</p>      → inner text
//   <img data-cms-src="about.shot1" src="a.png">        → the src attribute
//   <a data-cms-href="footer.ig" href="#">Instagram</a> → the href attribute
//
// Optional companions on the same tag:
//   data-cms-label="Dòng 1"   → label shown in the admin UI
//   data-cms-type="html"      → edit inner markup raw instead of plain text
//   data-cms-group="Hero"     → group heading in the admin UI

const MARKERS = { 'data-cms': 'text', 'data-cms-src': 'src', 'data-cms-href': 'href' };

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const unescapeHtml = (s) => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// Walk back from a marker to the '<' that opens its tag, then forward to the
// '>' that closes the opening tag — quotes are skipped so attribute values
// containing '>' (inline SVG paths, for instance) can't end the tag early.
function tagBounds(html, markerIndex) {
  const start = html.lastIndexOf('<', markerIndex);
  if (start < 0) return null;
  const name = (html.slice(start + 1).match(/^[a-zA-Z][\w:-]*/) || [null])[0];
  if (!name) return null;
  let i = start + 1;
  let quote = null;
  while (i < html.length) {
    const c = html[i];
    if (quote) { if (c === quote) quote = null; }
    else if (c === '"' || c === "'") quote = c;
    else if (c === '>') break;
    i++;
  }
  if (i >= html.length) return null;
  const selfClosing = html[i - 1] === '/';
  return { name, start, openEnd: i, selfClosing };
}

// Find the matching close tag, counting nested elements of the same name.
function closeTagIndex(html, name, from) {
  const re = new RegExp(`<(/?)${name}(?=[\\s/>])`, 'gi');
  re.lastIndex = from;
  let depth = 1;
  let m;
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return m.index;
  }
  return -1;
}

// Decorative tags sitting in front of the copy (<span class="mark"></span>)
// are preserved verbatim when a field is edited as plain text.
const leadingMarkup = (raw) => (raw.match(/^\s*(?:<[^>]+>\s*)*/) || [''])[0];

function readAttr(openTag, attr) {
  const m = openTag.match(new RegExp(`\\s${attr}\\s*=\\s*"([^"]*)"`, 'i'))
    || openTag.match(new RegExp(`\\s${attr}\\s*=\\s*'([^']*)'`, 'i'));
  return m ? m[1] : null;
}

// Every editable field in a document, in source order.
function scanFields(html) {
  const fields = [];
  const re = /\sdata-cms(-src|-href)?\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const kind = MARKERS['data-cms' + (m[1] || '')];
    const key = m[2];
    const bounds = tagBounds(html, m.index);
    if (!bounds) continue;
    const openTag = html.slice(bounds.start, bounds.openEnd + 1);
    const field = {
      key,
      kind,
      tag: bounds.name,
      label: readAttr(openTag, 'data-cms-label') || key.split('.').pop().replace(/[-_]/g, ' '),
      group: readAttr(openTag, 'data-cms-group') || key.split('.')[0],
      type: readAttr(openTag, 'data-cms-type') || 'text',
    };
    if (kind === 'text') {
      if (bounds.selfClosing) continue;
      const end = closeTagIndex(html, bounds.name, bounds.openEnd);
      if (end < 0) continue;
      const raw = html.slice(bounds.openEnd + 1, end);
      const forcedText = readAttr(openTag, 'data-cms-type') === 'text';
      // markup inside means the field has to be edited as markup — unless the
      // tag asks for plain text, in which case leading markup (a decorative
      // mark, say) is left alone and only the trailing copy is editable
      if (/<[a-zA-Z/]/.test(raw) && !forcedText) field.type = 'html';
      field.value = field.type === 'html'
        ? raw.trim()
        : unescapeHtml(raw.slice(leadingMarkup(raw).length)).trim();
    } else {
      field.value = readAttr(openTag, kind) || '';
      if (field.type === 'text') field.type = kind === 'src' ? 'image' : 'url';
    }
    fields.push(field);
  }
  return fields;
}

// Apply { key: newValue } to a document. Rewrites happen back-to-front so
// earlier offsets stay valid while later ones are replaced.
function applyFields(html, updates) {
  const edits = [];
  const re = /\sdata-cms(-src|-href)?\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const kind = MARKERS['data-cms' + (m[1] || '')];
    const key = m[2];
    if (!(key in updates)) continue;
    const value = updates[key];
    const bounds = tagBounds(html, m.index);
    if (!bounds) continue;
    const openTag = html.slice(bounds.start, bounds.openEnd + 1);

    if (kind === 'text') {
      if (bounds.selfClosing) continue;
      const end = closeTagIndex(html, bounds.name, bounds.openEnd);
      if (end < 0) continue;
      const current = html.slice(bounds.openEnd + 1, end);
      const declared = readAttr(openTag, 'data-cms-type');
      const asHtml = declared === 'html' || (declared !== 'text' && /<[a-zA-Z/]/.test(current));
      const prefix = asHtml ? '' : leadingMarkup(current);
      edits.push({ from: bounds.openEnd + 1, to: end, text: asHtml ? value : prefix + escapeHtml(value) });
    } else {
      const attrRe = new RegExp(`(\\s${kind}\\s*=\\s*)("[^"]*"|'[^']*')`, 'i');
      const found = openTag.match(attrRe);
      const nextTag = found
        ? openTag.replace(attrRe, `$1"${escapeAttr(value)}"`)
        : openTag.replace(/(<[a-zA-Z][\w:-]*)/, `$1 ${kind}="${escapeAttr(value)}"`);
      edits.push({ from: bounds.start, to: bounds.openEnd + 1, text: nextTag });
    }
  }
  let out = html;
  for (const e of edits.sort((a, b) => b.from - a.from)) {
    out = out.slice(0, e.from) + e.text + out.slice(e.to);
  }
  return out;
}

module.exports = { scanFields, applyFields, tagBounds, closeTagIndex, readAttr, escapeHtml, escapeAttr };
