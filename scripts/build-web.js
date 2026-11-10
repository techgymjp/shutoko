// Web ファイルを www/ にコピーする
//   npm run build     … Web 版 (Vercel)
//   npm run build:app … Android / iOS アプリに同梱する版 (APP_BUILD=1)。Web 版だけの部分を取り除く
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const item of ['index.html', 'css', 'js', 'vendor', 'LICENSE']) {
  const src = path.join(root, item);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(out, item), { recursive: true });
}
// アプリ版: Web 版だけの部分 (Google Play へのリンク、テスト用の ?debug フック) を取り除く。
// HTML は <!-- web-only --> … <!-- /web-only -->、JS は // web-only:start … // web-only:end で囲む。
// アプリの中に「他のストアへのリンク」や「隠れた機能」があると、App Store の審査 (Guideline 5.6) で問題になるため
if (process.env.APP_BUILD) {
  const strip = (file, re) => {
    const s = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, s.replace(re, ''));
  };
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  strip(path.join(out, 'index.html'), /[ \t]*<!-- web-only -->[\s\S]*?<!-- \/web-only -->\n?/g);
  for (const f of walk(path.join(out, 'js'))) if (f.endsWith('.js')) strip(f, /[ \t]*\/\/ web-only:start[\s\S]*?\/\/ web-only:end\n?/g);
  // 取り残しがあればビルドを止める
  const bad = ['play.google.com', 'web-only', "includes('debug')", 'window.dbg ='];
  for (const f of walk(out)) {
    if (!/\.(html|js|css)$/.test(f)) continue;
    const s = fs.readFileSync(f, 'utf8');
    for (const w of bad) if (s.includes(w)) { console.error(`app build: "${w}" が ${path.relative(root, f)} に残っています`); process.exit(1); }
  }
}
// Google Play 用のビルドでは本番の広告を使う
const mode = process.env.ADMOB_MODE === 'production' ? 'production' : 'test';
fs.writeFileSync(path.join(out, 'js', 'ads-config.js'), `// ビルド時に生成\nwindow.AD_MODE = '${mode}';\n`);
// タイトル画面に出すバージョン（CI では VERSION_NAME / VERSION_CODE を使う）
const version = process.env.VERSION_CODE
  ? `v${process.env.VERSION_NAME || require('../package.json').version} (build ${process.env.VERSION_CODE})`
  : 'dev';
fs.writeFileSync(path.join(out, 'js', 'build-info.js'), `// ビルド時に生成\nwindow.APP_VERSION = '${version}';\n`);
console.log(`built web assets into www/ (${process.env.APP_BUILD ? 'app' : 'web'}, ads: ${mode}, version: ${version})`);
