// Generator: converts paicoding 技术派 "面试篇" article HTML files into assets/data-mine-jishu.js
// - downloads images into assets/jimg/
// - splits each article into a chapter, each H3 question into a QA item
// Usage: node tools/gen-jishu.js
const fs = require('fs');
const path = require('path');

const SRC = 'C:/Users/86137/AppData/Local/Temp/paicoding_mianshi';
const PROJ = path.join(__dirname, '..');
const OUT = path.join(PROJ, 'assets', 'data-mine-jishu.js');
const IMG_DIR = path.join(PROJ, 'assets', 'jimg');

if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });

// ordered config: fileSlug -> { title, icon-suffix }
const articles = [
  { slug: 'paicli-agent-mianshi', title: '腾讯一面 · Agent面经', short: '腾讯一面' },
  { slug: 'agent-mianshi-paicli', title: '拼多多 · Agent面经', short: '拼多多' },
  { slug: 'agent-mianshi-tengxun', title: '腾讯面试官 · Agent面经', short: '腾讯面试官' },
  { slug: 'agent-mianshi-xiecheng', title: '携程 · Agent面经', short: '携程' },
  { slug: 'agent-mianshi-ali', title: '阿里 · Agent面经', short: '阿里' },
  { slug: 'haikang-agent-eval-mianshi', title: '海康威视 · Agent评测面经', short: '海康威视' },
  { slug: 'agent-mianshi-changxin', title: '长鑫存储 · Agent面经', short: '长鑫存储' },
];

// image url -> local filename mapping (per whole run)
const imgMap = {};
const imgDownloaded = {};

function imgToLocal(src) {
  if (imgMap[src]) return imgMap[src];
  // filename: based on last path segment
  let base = (src.split('/').pop() || 'img').split('?')[0];
  if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(base)) base += '.jpg';
  // prefix to avoid collision between articles (rare) — keep as-is since filenames already unique
  imgMap[src] = 'assets/jimg/' + base;
  return imgMap[src];
}

// rev map: local relative path -> original src url
const localToSrc = {};
async function downloadImg(localRel) {
  if (imgDownloaded[localRel]) return true;
  const src = localToSrc[localRel];
  if (!src) return false;
  const abs = path.join(PROJ, localRel.replace(/\//g, path.sep));
  if (fs.existsSync(abs)) { imgDownloaded[localRel] = true; return true; }
  try {
    const res = await fetch(src, {
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' }
    });
    if (!res.ok) { console.log('  ! HTTP', res.status, src); return false; }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(abs, buf);
    imgDownloaded[localRel] = true;
    return true;
  } catch (e) {
    console.log('  ! DOWNLOAD ERR', e.message, src);
    return false;
  }
}

function rewriteImgs(html) {
  return html.replace(/<img[^>]+src="([^"]+)"[^>]*>/g, (whole, src) => {
    if (!/^https?:\/\//.test(src)) return whole;
    const local = imgToLocal(src);
    localToSrc[local] = src;
    return whole.replace(src, local);
  });
}

// split article content by H3; header intro goes into a "导读" intro item
function splitByH3(html) {
  // tokenize into blocks: <h3>...</h3> opens a new question
  const parts = [];
  const re = /<h3[^>]*>([\s\S]*?)<\/h3>/g;
  let last = 0, m;
  while ((m = re.exec(html)) !== null) {
    const title = m[1].replace(/<[^>]+>/g, '').trim();
    const intro = html.substring(last, m.index).trim();
    if (intro) parts.push({ intro: true, html: intro });
    parts.push({ title: title, html: '' });
    last = m.index + m[0].length;
  }
  const tail = html.substring(last).trim();
  if (tail) {
    // append tail to last question
    if (parts.length) parts[parts.length - 1].html += '\n' + tail;
    else parts.push({ intro: true, html: tail });
  }
  return parts;
}

function countImgs(html) {
  const re = /src="([^"]*jimg[^"]*)"/g; let n = 0; while (re.exec(html)) n++;
  return n;
}

(async () => {
  const sections = [];
  let totalQ = 0, totalImgs = 0;
  let no = 0;

  for (const art of articles) {
    no++;
    const raw = fs.readFileSync(path.join(SRC, art.slug + '-content.html'), 'utf8');
    const parts = splitByH3(raw);

    // assemble questions
    const questions = [];
    // intro item (article引言) — merge consecutive intro blocks
    let introBuf = '';
    for (const p of parts) {
      if (p.intro) { introBuf = (introBuf + '\n' + p.html).trim(); continue; }
      // flush pending intro as its own "题" if non-empty
      if (introBuf) {
        questions.push({ t: art.short + ' · 文章导读与背景', tag: '技术派·' + art.short, p: 'core', html: introBuf });
        introBuf = '';
      }
      // strip leading "01、" numbering for display subtitle
      const qTitle = art.short + ' · ' + p.title;
      questions.push({ t: qTitle, tag: '技术派·' + art.short, p: 'core', html: p.html.trim() });
    }
    if (introBuf) {
      // trailing intro blocks merged into a final导读
      questions.push({ t: art.short + ' · 文章结语', tag: '技术派·' + art.short, p: 'core', html: introBuf });
    }
    if (!questions.length) continue;

    // rewrite images & download
    for (const q of questions) {
      q.html = rewriteImgs(q.html);
      const localImgs = [];
      const ri = /src="(assets\/jimg\/[^"]+)"/g;
      let m; while ((m = ri.exec(q.html)) !== null) localImgs.push(m[1]);
      for (const rel of localImgs) await downloadImg(rel);
    }

    totalQ += questions.length;
    totalImgs += countImgs(questions.map((q) => q.html).join('\n'));

    sections.push({ no: String(no), title: '技术派·' + art.title + '（' + questions.length + ' 题）', questions: questions });
    // remove <h2>content</h2> artifacts from intro text? handled by split
  }

  // ---- emit JS ----
  const blocks = [];
  for (const s of sections) {
    const qjson = s.questions.map((q) => {
      return '      { "t": ' + JSON.stringify(q.t) + ', "tag": ' + JSON.stringify(q.tag) + ', "p": "core", "html": `'
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

  fs.writeFileSync(OUT, header + blocks.join('\n\n') + footer, 'utf8');
  console.log('Wrote', OUT);
  console.log('chapters:', sections.length, '| questions:', totalQ, '| local imgs:', totalImgs);
  for (const s of sections) console.log(s.no, '|', s.title);
})();