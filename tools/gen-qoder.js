// Generator: converts RAG_STUDY_QODER part markdown files into assets/data-mine-qoder.js
// Usage: node tools/gen-qoder.js
const fs = require('fs');
const path = require('path');

const ATT_DIR = 'c:/Users/86137/.trae-cn/attachments/6a851c5e5e983fe5ec13d458';
const OUT = path.join(__dirname, '..', 'assets', 'data-mine-qoder.js');

// ordered part files
const files = [
  '_RAG_STUDY_QODER.md',
  '_RAG_STUDY_QODER_PART2.md',
  '_RAG_STUDY_QODER_PART3.md',
  '_RAG_STUDY_QODER_PART4.md',
  '_RAG_STUDY_QODER_PART5.md',
  '_RAG_STUDY_QODER_PART6.md',
  '_RAG_STUDY_QODER_PART7.md',
  '_RAG_STUDY_QODER_PART8.md',
  '_RAG_STUDY_QODER_PART9.md',
  '_RAG_STUDY_QODER_PART10.md',
];

// resolve actual filenames by suffix
function findFile(suffix) {
  const all = fs.readdirSync(ATT_DIR);
  const hit = all.find((n) => n.endsWith(suffix));
  if (!hit) throw new Error('missing: ' + suffix);
  return path.join(ATT_DIR, hit);
}

// ---------- inline markdown -> html ----------
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineToHtml(s) {
  // escape html first, then apply markdown inline
  let t = escapeHtml(s);
  // inline code
  t = t.replace(/`([^`]+)`/g, (m, c) => '<code>' + c + '</code>');
  // bold
  t = t.replace(/\*\*([^*]+)\*\*/g, (m, c) => '<strong>' + c + '</strong>');
  // italic
  t = t.replace(/\*([^*]+)\*/g, (m, c) => '<i>' + c + '</i>');
  return t;
}

// ---------- block-level parser ----------
function mdToHtml(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let i = 0;

  const flushParas = (buf) => {
    // buf: array of raw (non-code) lines forming contiguous text region
    if (!buf.length) return;
    const text = buf.join('\n');
    const blocks = text.split(/\n[ \t]*\n/).filter((b) => b.trim().length > 0);
    for (const b of blocks) {
      out.push(renderBlock(b.trim()));
    }
  };

  let buf = [];
  const isTableTriplet = (b) => {
    const ls = b.split(/\n/).filter((l) => l.trim().length > 0);
    if (ls.length < 2) return false;
    if (ls[0].trim().indexOf('|') === -1) return false;
    // second line is separator like |---|---|
    const sep = ls[1].trim();
    if (!/^\|?[\s:|-]+\|?$/.test(sep)) return false;
    return sep.indexOf('-') !== -1;
  };

  const renderBlock = (b) => {
    const lbs = b.split(/\n/).map((l) => l.trimEnd());
    // fenced? (shouldn't reach here, handled by state machine)
    if (/^```/.test(lbs[0])) return '';
    // ### heading -> bold paragraph
    if (/^###\s+/.test(lbs[0])) {
      return '<p><strong>' + inlineToHtml(lbs[0].replace(/^###\s+/, '')) + '</strong></p>';
    }
    // table
    if (isTableTriplet(b)) {
      const rows = lbs.filter((l) => l.trim().length > 0);
      let html = '<div class="table-wrap"><table>\n';
      for (let r = 0; r < rows.length; r++) {
        let line = rows[r].trim();
        line = line.replace(/^\|/, '').replace(/\|$/, '').trim();
        const cells = line.split('|').map((c) => c.trim());
        if (r === 0) {
          html += '<thead><tr>' + cells.map((c) => '<th>' + inlineToHtml(c) + '</th>').join('') + '</tr></thead>\n<tbody>\n';
        } else if (/^\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*$/.test(line)) {
          // separator row, skip
        } else {
          html += '<tr>' + cells.map((c) => '<td>' + inlineToHtml(c) + '</td>').join('') + '</tr>\n';
        }
      }
      html += '</tbody></table></div>';
      return html;
    }
    // hr
    if (/^-{3,}$/.test(lbs[0]) || /^\*{3,}$/.test(lbs[0])) return '<hr>';
    // blockquote
    if (lbs.every((l) => /^\s*>\s*/.test(l) || l.trim() === '>')) {
      const inner = lbs.map((l) => l.replace(/^\s*>\s?/, '')).join('\n');
      return '<blockquote class="doc-callout"><p>' + inlineToHtml(inner) + '</p></blockquote>';
    }
    // unordered list
    if (lbs[0].match(/^[-*]\s+/)) {
      return renderList(lbs, /^\s*[-*]\s+/);
    }
    // ordered list
    if (lbs[0].match(/^\s*\d+[.、]\s+/)) {
      return renderList(lbs, /^\s*\d+[.、]\s+/);
    }
    // paragraph
    return '<p>' + inlineToHtml(lbs.join('\n')) + '</p>';
  };

  const renderList = (lbs, re) => {
    const ordered = re.source.indexOf('\\d') !== -1;
    const tag = ordered ? 'ol' : 'ul';
    // simple nesting by leading spaces
    let html = '<' + tag + '>\n';
    let curOpen = false;
    for (let k = 0; k < lbs.length; k++) {
      const l = lbs[k];
      const m = l.match(re);
      if (m) {
        if (curOpen) { html += '</' + tag + '>'; curOpen = false; }
        html += '<li>' + inlineToHtml(l.replace(re, '').trim()) + '</li>';
      } else {
        // continuation line -> append to previous li
        if (!curOpen) { html += '<' + tag + '>'; curOpen = true; }
        html += '<li>' + inlineToHtml(l.trim()) + '</li>';
      }
    }
    if (curOpen) html += '</' + tag + '>';
    else if (html.endsWith('\n')) html = html.replace(/<\/(ul|ol)>\n$/, '');
    // ensure closure
    if (!/<\/(ul|ol)>$/.test(html)) html += '</' + tag + '>';
    return html;
  };

  // line state machine
  while (i < lines.length) {
    const line = lines[i];
    const trim = line.trim();

    // code fence
    if (/^```/.test(trim)) {
      flushParas(buf); buf = [];
      const lang = (trim.match(/^```(.*)$/) || [])[1].trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      out.push('<pre><code class="language-' + (lang || 'text') + '">'
        + escapeHtml(codeLines.join('\n')) + '</code></pre>');
      continue;
    }

    // hr
    if (/^---+\s*$/.test(trim) || /^\*\*\*+\s*$/.test(trim)) {
      flushParas(buf); buf = [];
      out.push('<hr>');
      i++;
      continue;
    }

    buf.push(line);
    i++;
  }
  flushParas(buf);
  return out.join('\n');
}

// ---------- chapter builder ----------
const sections = [];
let partNo = 0;
for (const suffix of files) {
  partNo++;
  const raw = fs.readFileSync(findFile(suffix), 'utf8');
  const linesEx = raw.split(/\r?\n/);
  // H1 title
  const h1 = linesEx.find((l) => /^#\s+/.test(l)) || ('Part ' + partNo);
  const title = h1.replace(/^#\s+/, '').trim();

  // sections start at "## " (module/techpoint). Keep heading line offset to slice body.
  const tpNums = [];
  const ques = [];
  const parts = [];
  let curTitle = null;
  let curLines = [];
  for (let j = 0; j < linesEx.length; j++) {
    const l = linesEx[j];
    if (/^##\s+/.test(l)) {
      if (curTitle !== null) parts.push({ title: curTitle, body: curLines });
      curTitle = l.replace(/^##\s+/, '').trim();
      curLines = [];
      const m = curTitle.match(/技术点\s*(\d+)/);
      if (m) tpNums.push(parseInt(m[1], 10));
    } else {
      curLines.push(l);
    }
  }
  if (curTitle !== null) parts.push({ title: curTitle, body: curLines });

  for (const p of parts) {
    const html = mdToHtml(p.body.join('\n')).trim();
    ques.push({ t: p.title, tag: '我的整理', p: 'core', html: html });
  }

  // chapter title with techpoint range
  let rangeTxt = '';
  if (tpNums.length) {
    const lo = Math.min.apply(null, tpNums);
    const hi = Math.max.apply(null, tpNums);
    rangeTxt = '（技术点 ' + lo + '–' + hi + ' · ' + ques.length + ' 节）';
  }
  sections.push({ no: String(partNo), title: title + rangeTxt, questions: ques });
}

// ---------- emit JS ----------
const blocks = [];
for (const s of sections) {
  const qjson = s.questions.map((q) => {
    return '      { "t": ' + JSON.stringify(q.t) + ', "tag": "我的整理", "p": "core", "html": `'
      + q.html.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
      + '` }';
  }).join(',\n');
  blocks.push('  mine.chapters.push({\n    "no": ' + JSON.stringify(s.no)
    + ',\n    "title": ' + JSON.stringify(s.title)
    + ',\n    "questions": [\n' + qjson + '\n    ]\n  });');
}

const header =
`window.TAB_DATA = window.TAB_DATA || {};
(function () {
  var mine = window.TAB_DATA["mine"] || (window.TAB_DATA["mine"] = { key: "mine", title: "我的整理（本地笔记）", url: "", chapters: [] });
`;
const footer = '\n})();\n';
const totalQ = sections.reduce((a, s) => a + s.questions.length, 0);

fs.writeFileSync(OUT, header + blocks.join('\n\n') + footer, 'utf8');
console.log('Wrote', OUT);
console.log('parts:', sections.length, 'questions:', totalQ);
for (const s of sections) {
  console.log(s.no, '|', s.title, '| questions:', s.questions.length);
}