#!/usr/bin/env node
/**
 * Verifikasi statis aplikasi LitNum (jalankan: npm run verify):
 * 1. Semua href/src/redirect internal menunjuk berkas yang ada.
 * 2. Sintaks semua <script> inline valid.
 * 3. Semua handler onclick/onsubmit/onchange/oninput terdefinisi.
 * 4. Bottom nav konsisten (ikon emoji + label) di semua halaman aplikasi.
 * 5. Salinan public/ dan docs/ identik.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const DOCS = path.join(ROOT, 'docs');

const PAGES = [
  'index.html',
  'login.html',
  'teacher/dashboard.html',
  'teacher/students.html',
  'teacher/exercises.html',
  'teacher/reports.html',
  'teacher/student-detail.html',
  'student/dashboard.html',
  'student/exercise.html',
  'student/progress.html'
];

const APP_PAGES = PAGES.filter((p) => p.includes('/'));
const BROWSER_GLOBALS = new Set([
  'document', 'window', 'location', 'history', 'console', 'alert', 'confirm', 'prompt'
]);

let errors = 0;
const fail = (msg) => { errors++; console.error('  \u2717 ' + msg); };
const ok = (msg) => console.log('  \u2713 ' + msg);
const matches = (text, re) => { const out = []; let m; while ((m = re.exec(text))) out.push(m); return out; };

for (const page of PAGES) {
  console.log('\n[halaman] ' + page);
  const file = path.join(PUB, page);
  if (!fs.existsSync(file)) { fail('berkas tidak ditemukan'); continue; }
  const html = fs.readFileSync(file, 'utf8');

  // 1. Semua referensi internal harus menunjuk berkas yang ada
  const refs = [
    ...matches(html, /(?:href|src)="([^"]+)"/g).map((m) => m[1]),
    ...matches(html, /location\.href\s*=\s*['"]([^'"]+)['"]/g).map((m) => m[1]),
    ...matches(html, /url=(['"]?)([^'">\s]+)\1/g).map((m) => m[2])
  ];
  let refErrors = 0;
  for (const ref of refs) {
    if (/^(https?:)?\/\//.test(ref) || ref.startsWith('#') || ref.startsWith('data:')) continue;
    const clean = ref.split('#')[0].split('?')[0];
    if (!clean) continue;
    const resolved = path.normalize(path.join(path.dirname(page), clean));
    if (!fs.existsSync(path.join(PUB, resolved))) { fail('target tidak ada: ' + ref + ' -> ' + resolved); refErrors++; }
  }
  if (refErrors === 0) ok('semua tautan internal valid');

  // 2. Sintaks script inline
  const inline = matches(html, /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g).map((m) => m[1]);
  let scriptErrors = 0;
  inline.forEach((code, i) => {
    try { new vm.Script(code, { filename: page + '#inline-' + (i + 1) }); }
    catch (e) { fail('sintaks script inline #' + (i + 1) + ': ' + e.message); scriptErrors++; }
  });
  if (scriptErrors === 0 && inline.length) ok(inline.length + ' script inline valid');

  // 3. Handler event terdefinisi (di halaman atau di js/auth.js, js/db.js)
  const defined = new Set();
  for (const m of matches(html, /\bfunction\s+([A-Za-z_$][\w$]*)/g)) defined.add(m[1]);
  for (const js of ['js/auth.js', 'js/db.js', 'js/firebase-config.js']) {
    const code = fs.readFileSync(path.join(PUB, js), 'utf8');
    for (const m of matches(code, /\b(?:function|const|var|let)\s+([A-Za-z_$][\w$]*)/g)) defined.add(m[1]);
  }
  const used = new Set();
  for (const m of matches(html, /\bon(?:click|submit|change|input)="([A-Za-z_$][\w$]*)\s*\(/g)) used.add(m[1]);
  let handlerErrors = 0;
  for (const h of used) {
    if (BROWSER_GLOBALS.has(h) || defined.has(h)) continue;
    fail('handler ' + h + '() tidak ditemukan'); handlerErrors++;
  }
  if (handlerErrors === 0 && used.size) ok(used.size + ' handler event terdefinisi');

  // 4. Bottom nav konsisten: setiap item punya ikon emoji + label
  if (APP_PAGES.includes(page)) {
    const nav = (html.match(/<nav class="sidebar-nav">[\s\S]*?<\/nav>/) || [])[0];
    if (!nav) { fail('nav sidebar-nav tidak ditemukan'); continue; }
    const items = matches(nav, /<a [^>]*>[\s\S]*?<\/a>/g);
    let navErrors = 0;
    for (const itemMatch of items) {
      const item = itemMatch[0];
      const icon = (item.match(/<span class="icon">([\s\S]*?)<\/span>/) || [])[1] || '';
      const label = (item.match(/<span class="label">([\s\S]*?)<\/span>/) || [])[1];
      if (!/[^\x00-\x7F]/.test(icon)) { fail('item nav tanpa ikon emoji: ' + item.slice(0, 60)); navErrors++; }
      if (!label || !label.trim()) { fail('item nav tanpa label: ' + item.slice(0, 60)); navErrors++; }
    }
    if (items.length < 4) { fail('bottom nav hanya ' + items.length + ' item'); navErrors++; }
    if (navErrors === 0) ok('bottom nav konsisten (' + items.length + ' item, ikon + label)');
  }
}

// 5. public/ harus identik dengan docs/ (sumber GitHub Pages)
console.log('\n[sinkronisasi] public/ vs docs/');
let syncErrors = 0;
for (const rel of [...PAGES, 'css/style.css', 'js/auth.js', 'js/db.js', 'js/firebase-config.js']) {
  const a = path.join(PUB, rel);
  const b = path.join(DOCS, rel);
  if (!fs.existsSync(a) || !fs.existsSync(b)) { fail('berkas hilang: ' + rel); syncErrors++; continue; }
  if (!fs.readFileSync(a).equals(fs.readFileSync(b))) { fail('berbeda: ' + rel); syncErrors++; }
}
if (syncErrors === 0) ok('public/ dan docs/ identik');

console.log('\n' + (errors === 0 ? '\u2705 SEMUA CEK LOLOS' : '\u274C ' + errors + ' masalah ditemukan'));
process.exit(errors === 0 ? 0 : 1);
