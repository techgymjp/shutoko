// 日本語 / 英語の切り替え。端末の言語が日本語なら日本語、それ以外は英語。トップ画面で切り替えて保存する
import { NAMES_EN } from './i18n-names.js';

// 画面の文 (HTML の data-i18n の英語版。日本語は HTML に書いてあるものをそのまま使う)
const HTML_EN = {
  title: 'Shutoko GP',
  catch: 'Race Tokyo\'s real Shuto Expressway at 360 km/h. Start last and fight for the win in 3D.',
  play: 'PLAY',
  howto: 'HOW TO PLAY',
  privacy: 'Privacy Policy',
  adPrivacy: 'Ad settings',
  keysPc: '<kbd>↑</kbd>/<kbd>W</kbd>/<kbd>Space</kbd> Accelerate　<kbd>↓</kbd>/<kbd>S</kbd> Brake　<kbd>←</kbd><kbd>→</kbd> Steer　<kbd>Shift</kbd>/<kbd>E</kbd> ERS boost　<kbd>P</kbd> Pause　<kbd>M</kbd> Mute',
  keysTouch: 'Right thumb: <b>ACCEL</b> and <b>BRAKE</b>. Left thumb: <b>◀ ▶</b> to steer. Hold <b>ERS</b> to unleash your stored battery for a burst of speed. <b>❚❚</b> at the top right pauses.',
  help1: '<b>Strategy wins races.</b> You start last of 12 cars. The leader has no slipstream, so soon after taking the lead you suffer <b>"leader\'s pressure" and slow down for 12 seconds</b> — and the pack passes you (this never happens in the last 500 m). Draft right behind the car ahead to <b>charge your ERS</b>, then strike at the very end.',
  help2: '…But every machine seems to have its own <b>character</b>. Some love to lead from the front, some prefer to wait at the back and build up power. Listen to your team radio and your engineer after the race to find <b>the racing style that suits your machine</b>.',
  help3: 'Brake for the tight curves! Your car never breaks, however hard you crash.',
  help4: 'Finish a course to unlock <b>the next course</b>. You can also <b>watch an ad</b> to race a locked course.',
  backTop: 'Back to top',
  top: '← Top',
  selRoute: 'SELECT ROUTE',
  driver: 'Driver',
  nameNote: 'Records are saved per name',
  timeOfDay: 'Time',
  day: 'Day', dusk: 'Dusk', night: 'Night',
  start: 'START',
  credit: 'Roads: © OpenStreetMap contributors (ODbL)　Buildings: processed from Project PLATEAU 3D city models (MLIT, Tokyo 23 wards)',
  creditSmall: '© OpenStreetMap contributors / MLIT PLATEAU',
  paused: 'PAUSED',
  resume: 'Resume',
  retry: 'Restart',
  quit: 'Back to title',
  share: 'Share',
  copy: 'Copy result',
  again: 'Race again',
  behind: 'GAP', sec: 's', next: 'NEXT', toGoal: 'TO GOAL',
  boost: 'CATCH-UP BOOST',
  pen: 'LEADER\'S PRESSURE <b>SLOWING</b> <span id="pen-t">0</span>s',
  posUnit: '',
};
// aria-label の英語版
const ARIA_EN = { mute: 'Mute', pause: 'Pause', left: 'Left', right: 'Right', brake: 'Brake', accel: 'Accelerate' };

// プログラムの中の文。{x} は値に置き換える
const TXT = {
  soon: ['準備中', 'SOON'],
  adUnlock: ['広告で解放', 'Watch ad'],
  notReady: ['このルートは準備中です', 'This route is coming soon'],
  adStart: ['📺 広告を見てスタート', '📺 Watch an ad to start'],
  start: ['スタート', 'START'],
  lockNote: ['「{t}」を完走すると鍵が開きます。広告を最後まで見れば、今すぐこのコースを走れます。', 'Finish "{t}" to unlock this course — or watch an ad to the end and race it now.'],
  record: ['戦績 {r}戦 {w}勝', 'Record: {w} wins in {r} races'],
  bestRec: ['　ベスト {t}（{p}位）', '　Best {t} ({p})'],
  loading: ['読み込み中…', 'Loading…'],
  adSkipped: ['広告を最後まで見ると、このコースを走れます', 'Watch the ad to the end to race this course'],
  adFail: ['広告を読み込めませんでした。少しあとでお試しください', 'Couldn\'t load an ad. Please try again later'],
  copied: ['結果をコピーしました', 'Result copied'],
  copyFail: ['コピーできませんでした', 'Couldn\'t copy'],
  appName: ['首都高グランプリ', 'Shutoko GP'],
  gridMsg: ['スタート位置 <b>{n}</b>番グリッド', 'Starting from <b>P{n}</b>'],
  gridTelop: ['{n}番グリッドからスタート', 'Starting from P{n}'],
  hitWallBig: ['ガシャーン!!|壁にヒット!!', 'CRASH!!|WALL HIT!!'],
  hitWall: ['ガリガリッ!|壁に接触!', 'SCRAPE!|WALL!'],
  hitCarBig: ['ドカン!!|激突!!|ガツン!!', 'BANG!!|SMASH!!|WHAM!!'],
  hitCar: ['接触!|コツン!|バチッ!', 'CONTACT!|TAP!|BUMP!'],
  penAlert: ['先頭の重圧! ペースダウン', 'Leader\'s pressure! Slowing down'],
  otMode: ['⚡ {n} がオーバーテイクモード!', '⚡ {n} in overtake mode!'],
  otRadio: ['後ろの{n}がERSを全開にした! 来るぞ!', '{n} behind has gone full ERS! Here they come!'],
  close: ['スレスレ!', 'CLOSE!'],
  finish: ['{p}位でゴール！  {t}', 'Finished {p}!  {t}'],
  newBest: ['  ★ベスト更新', '  ★NEW BEST'],
  statGrid: ['スタート <b>{n}番グリッド</b>', 'Start <b>P{n}</b>'],
  statOt: ['オーバーテイク <b>{n}</b>', 'Overtakes <b>{n}</b>'],
  statHit: ['接触 <b>{n}</b>回', 'Contacts <b>{n}</b>'],
  statTop: ['最高速 <b>{n}</b>km/h', 'Top speed <b>{n}</b>km/h'],
  unlocked: ['🔓 次のコース「{t}」の鍵が開いた！', '🔓 Next course unlocked: "{t}"!'],
  nAhead: ['道中ずっと前に出すぎて、マシンが熱を持っていた。もっと後ろで脚を溜めたほうがいいかもしれない。', 'You ran up front too much and the car overheated. Maybe save more energy further back.'],
  nAhead2: ['前半、少し前に出すぎてバッテリーが苦しそうだった。', 'Early on you pushed to the front a bit too much — the battery struggled.'],
  nFit: ['マシンが気持ちよく走れる位置だった。この位置取りは合っている。', 'The car was happy where you ran. That positioning suits it.'],
  nBehind: ['後ろにいる時間が長かった。マシンはもう少し前を走りたがっていたかもしれない。', 'You spent a long time at the back. The car may have wanted to run further forward.'],
  nErsLeft: ['ゴールしてもERSがたっぷり残っていた。仕掛けが遅かったか、使い切れていない。', 'Lots of ERS left at the finish. You attacked too late, or didn\'t use it all.'],
  nErsEarly: ['ゴールまで{d}kmでERSを使い切った。仕掛けが早すぎた。', 'ERS ran out {d} km from the finish. You attacked too early.'],
  nPen: ['先頭に立つのが早すぎて、何度も「先頭の重圧」に捕まった。', 'You took the lead too early and got caught by "leader\'s pressure" again and again.'],
  nWin: ['優勝！ このマシンの脚質は「{m}」だった！', 'Victory! This machine is a "{m}"!'],
  nOk: ['悪くない走りだった。次は仕掛けどころを変えてみよう。', 'Not a bad drive. Next time, try attacking at a different point.'],
  engineer: ['📻 チーフエンジニア', '📻 Chief engineer'],
  machineIs: ['（このマシンは「{m}」）', ' (this machine is a "{m}")'],
  shareText: ['首都高グランプリ「{c}」で{p}位！ タイム {t}（12番グリッドから{o}台抜き） #首都高グランプリ', 'I finished {p} on "{c}" in Shutoko GP! Time {t} ({o} overtakes from P12) #ShutokoGP'],
  atk: ['⚡ {n} 接近中  {m}m', '⚡ {n} closing in  {m}m'],
  behindAlert: ['後続が迫る!', 'They\'re right behind you!'],
  rFull: ['ERS満タンだ。いつでも行けるぞ', 'ERS is full. Go whenever you\'re ready'],
  rAhead: ['前に出すぎだ! マシンが熱を持って回生できていない', 'Too far up front! The car is too hot to recharge'],
  rFit: ['いいペースだ。バッテリーがよく溜まっている', 'Good pace. The battery is charging nicely'],
  rBehind: ['このあたりはマシンが少し退屈そうだ。もう少し前でもいい', 'The car seems a bit bored back here. You can move up a little'],
  call3: ['残り3km 位置取りを決めろ!', '3 km to go — pick your spot!'],
  call15: ['残り1.5km そろそろ仕掛けどころ!', '1.5 km to go — time to make your move!'],
  call06: ['ゴール前 全開! ERSを使い切れ!', 'Final stretch — flat out! Use all your ERS!'],
  ahead: ['正面に {s}', 'Ahead: {s}'],
  left: ['左手に {s}', 'On your left: {s}'],
  right: ['右手に {s}', 'On your right: {s}'],
  mNige: ['逃げ', 'Front-runner'],
  mSenko: ['先行', 'Stalker'],
  mSashi: ['差し', 'Closer'],
  mOikomi: ['追込', 'Deep closer'],
};

const ORD = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

let lang = 'ja';
try { lang = localStorage.getItem('shutoko.lang') || ''; } catch { /* 保存できない端末 */ }
if (lang !== 'ja' && lang !== 'en') lang = /^ja\b/i.test(navigator.language || '') ? 'ja' : 'en';

const listeners = [];
const jaHtml = new Map(); // 要素 → 最初に HTML に書いてある日本語
const jaAria = new Map();

export const I18N = {
  get lang() { return lang; },
  get en() { return lang === 'en'; },
  set(l) {
    if (l === lang) return;
    lang = l;
    try { localStorage.setItem('shutoko.lang', l); } catch { /* 保存できなくても切り替えはできる */ }
    I18N.apply();
    for (const f of listeners) f(l);
  },
  onChange(f) { listeners.push(f); },
  // t('record', { r: 3, w: 1 })
  t(key, vars = {}) {
    const e = TXT[key];
    let s = e ? e[lang === 'en' ? 1 : 0] : key;
    for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  },
  // 順位: 日本語「3位」/ 英語「3rd」
  pos(n) { return lang === 'en' ? ORD(n) : n + '位'; },
  // コースのデータの日本語 → 英語 (ないものは日本語のまま)
  name(s) { return lang === 'en' && s && NAMES_EN[s] || s; },
  apply() {
    document.documentElement.lang = lang;
    for (const el of document.querySelectorAll('[data-i18n]')) {
      if (!jaHtml.has(el)) jaHtml.set(el, el.innerHTML);
      const en = HTML_EN[el.dataset.i18n];
      el.innerHTML = lang === 'en' && en != null ? en : jaHtml.get(el);
    }
    for (const el of document.querySelectorAll('[data-i18n-aria]')) {
      if (!jaAria.has(el)) jaAria.set(el, el.getAttribute('aria-label'));
      el.setAttribute('aria-label', lang === 'en' ? ARIA_EN[el.dataset.i18nAria] : jaAria.get(el));
    }
    for (const b of document.querySelectorAll('[data-lang]')) b.classList.toggle('sel', b.dataset.lang === lang);
    document.title = lang === 'en' ? 'Shutoko GP' : '首都高グランプリ';
  },
};
