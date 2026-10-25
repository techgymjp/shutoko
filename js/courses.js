// コース定義
// 道路の線と高さ・トンネル区間・ビル群は js/course-data.js (OpenStreetMap と PLATEAU から生成)。
// 区間・出口は、OSM の出口・JCT の名前 (junction) か、緯度経度 (at) か、ゴールからの距離 (fromEnd) で指定する。
import { COURSE_DATA } from './course-data.js';

export const COURSES = [
  {
    id: 'takaido-yoga',
    playable: true,
    title: '高井戸 → 霞が関 → 用賀',
    sub: '4号新宿線 ・ C1都心環状線(内回り) ・ 3号渋谷線',
    en: 'TAKAIDO → KASUMIGASEKI → YOGA',
    km: null, // 実測して埋める
    data: COURSE_DATA,
    // 区間の切り替え (テロップ)
    sections: [
      { at: [35.67730, 139.61460], main: '首都高速4号新宿線', sub: '上り 都心方面', en: 'ROUTE 4  SHINJUKU LINE' },
      { junction: '西新宿JCT', main: '西新宿JCT', sub: 'C2 中央環状線と接続', en: 'NISHI-SHINJUKU JCT' },
      { junction: '三宅坂ジャンクション', main: '三宅坂JCT', sub: '都心環状線 内回りへ', en: 'MIYAKEZAKA JCT' },
      { junction: '霞が関出口', main: '霞が関', sub: 'C1 都心環状線', en: 'KASUMIGASEKI' },
      { junction: '谷町JCT', main: '谷町JCT', sub: '3号渋谷線 下りへ', en: 'TANIMACHI JCT' },
      { junction: '渋谷出口', main: '渋谷', sub: '首都高速3号渋谷線', en: 'SHIBUYA' },
    ],
    // 出入口・JCT (案内標識とミニマップの目印)。最初がスタート、最後がゴール
    marks: [
      { at: [35.67730, 139.61460], name: '高井戸', kind: 'ic' },
      { junction: '永福料金所', name: '永福', kind: 'ic' },
      { at: [35.67750, 139.67640], name: '幡ヶ谷', kind: 'ic' },
      { junction: '初台出口', name: '初台', kind: 'ic' },
      { junction: '西新宿JCT', name: '西新宿JCT', kind: 'jct', dest: 'C2 中央環状線' },
      { junction: '新宿出口', name: '新宿', kind: 'ic' },
      { junction: '代々木ＰＡ', name: '代々木', kind: 'ic' },
      { junction: '外苑出口', name: '外苑', kind: 'ic' },
      { junction: '三宅坂ジャンクション', name: '三宅坂JCT', kind: 'jct', dest: 'C1 都心環状線' },
      { junction: '霞が関出口', name: '霞が関', kind: 'ic' },
      { junction: '谷町JCT', name: '谷町JCT', kind: 'jct', dest: '3 渋谷線' },
      { at: [35.66250, 139.73100], name: '六本木', kind: 'ic' },
      { junction: '高樹町出口', name: '高樹町', kind: 'ic' },
      { junction: '渋谷出口', name: '渋谷', kind: 'ic' },
      { junction: '池尻', name: '池尻', kind: 'ic' },
      { junction: '三軒茶屋出入口', name: '三軒茶屋', kind: 'ic' },
      { fromEnd: 380, name: '用賀', kind: 'goal' },
    ],
    // 路線番号の切り替え (案内標識の路線マーク)
    routeNo: [
      { at: [35.67730, 139.61460], no: '4' },
      { junction: '三宅坂ジャンクション', no: 'C1' },
      { junction: '谷町JCT', no: '3' },
    ],
    parks: [
      { lat: 35.6852, lon: 139.7100, r: 520, kind: 'park', name: '新宿御苑' },
      { lat: 35.6775, lon: 139.7165, r: 330, kind: 'park', name: '明治神宮外苑' },
      { lat: 35.6772, lon: 139.7255, r: 560, kind: 'park', name: '赤坂御用地' },
      { lat: 35.6805, lon: 139.7290, r: 160, kind: 'park', name: '迎賓館' },
      { lat: 35.6855, lon: 139.7530, r: 820, kind: 'park', name: '皇居' },
      { lat: 35.6780, lon: 139.7495, r: 230, kind: 'park', name: '国会前庭' },
      { lat: 35.6750, lon: 139.7570, r: 260, kind: 'park', name: '日比谷公園' },
      { lat: 35.6660, lon: 139.7205, r: 300, kind: 'park', name: '青山霊園' },
      { lat: 35.6720, lon: 139.6955, r: 520, kind: 'park', name: '代々木公園' },
      { lat: 35.6760, lon: 139.6990, r: 420, kind: 'park', name: '明治神宮' },
      { lat: 35.6680, lon: 139.6260, r: 160, kind: 'park', name: '蘆花恒春園' },
      { lat: 35.6255, lon: 139.6615, r: 380, kind: 'park', name: '駒沢オリンピック公園' },
      { lat: 35.6802, lon: 139.7370, r: 90, kind: 'water', name: '弁慶濠' },
      { lat: 35.6815, lon: 139.7475, r: 110, kind: 'water', name: '桜田濠' },
    ],
    // ランドマーク。ビルは PLATEAU の実際の形と高さで並ぶので、ここは手作りのモデルで置き換えるものだけ
    // (この場所の PLATEAU の建物は tools/build_course.py の REPLACE で除いてある)。
    // spot: 近づくと出るお知らせ / crown: その場所でいちばん高いビルの屋上に飾りを付ける
    landmarks: [
      { model: 'techgym', lat: 35.68060, lon: 139.74000, name: 'テックジム', spot: '左手に テックジム（千代田区平河町2丁目）' },
      { model: 'chimney', lat: 35.68240, lon: 139.61420, name: '杉並清掃工場' },
      { model: 'stadium', lat: 35.67790, lon: 139.71460, name: '国立競技場' },
      { model: 'jingustadium', lat: 35.67450, lon: 139.71700, name: '明治神宮野球場' },
      { model: 'kaigakan', lat: 35.67870, lon: 139.71870, name: '聖徳記念絵画館' },
      { model: 'meijikinenkan', lat: 35.67740, lon: 139.72000, name: '明治記念館', spot: '右手に 明治記念館' },
      { model: 'geihinkan', lat: 35.68037, lon: 139.72879, name: '迎賓館赤坂離宮', spot: '右手に 迎賓館赤坂離宮' },
      { crown: 0x2a6fd6, lat: 35.68013, lon: 139.73469, r: 60, name: 'ホテルニューオータニ', spot: '左手に ホテルニューオータニ' },
      { model: 'diet', lat: 35.67590, lon: 139.74480, name: '国会議事堂' },
      { model: 'tokyotower', lat: 35.65860, lon: 139.74540, name: '東京タワー' },
      { spot: '右手に 東京ミッドタウン・左手奥に 六本木ヒルズ', lat: 35.66250, lon: 139.73100, name: '六本木' },
      { model: 'shibuya109', lat: 35.65950, lon: 139.69870, name: 'SHIBUYA109' },
      { crown: 0xff7a1a, lat: 35.64360, lon: 139.66960, r: 90, name: 'キャロットタワー' },
      { model: 'komazawa', lat: 35.62550, lon: 139.66200, name: '駒沢オリンピック公園 記念塔' },
      { model: 'skytree', lat: 35.71010, lon: 139.81070, name: '東京スカイツリー', far: true },
      { model: 'fuji', lat: 35.36060, lon: 138.72740, name: '富士山', far: true },
    ],
  },

  // ---- 提案ルート (準備中) ----
  {
    id: 'c1-loop', playable: false,
    title: 'C1 都心環状線 一周',
    sub: '江戸橋JCT・銀座の掘割・浜崎橋・竹橋のS字 (14.8km)',
    en: 'C1 INNER CIRCULAR',
    km: 14.8,
    note: '急カーブとトンネルが連続するテクニカルコース。東京タワーと皇居のお濠を眺めながら周回する。',
  },
  {
    id: 'rainbow', playable: false,
    title: 'レインボーブリッジ ＆ 湾岸線',
    sub: '芝浦JCT → レインボーブリッジ → 有明JCT → 東京港トンネル → 大井',
    en: 'RAINBOW BRIDGE & BAYSHORE',
    km: 13,
    note: '夜景のお台場とループ橋。湾岸線の長い直線で最高速アタック。',
  },
  {
    id: 'yamate-tunnel', playable: false,
    title: '山手トンネル 地下バトル',
    sub: 'C2 中央環状線 大井JCT → 大橋JCTのループ → 板橋JCT',
    en: 'YAMATE TUNNEL',
    km: 18.2,
    note: '日本一長い道路トンネルを全区間地下で走る。大橋JCTの二重ループが名物。',
  },
  {
    id: 'skytree', playable: false,
    title: '向島線 スカイツリー',
    sub: '江戸橋JCT → 箱崎JCT → 隅田川沿い → 堀切JCT',
    en: 'MUKOJIMA LINE / SKYTREE',
    km: 10.5,
    note: '箱崎ロータリーを抜けて隅田川の真上を北上。目の前にスカイツリーがそびえる。',
  },
  {
    id: 'haneda', playable: false,
    title: '1号羽田線 運河ストレート',
    sub: '羽田空港 → 平和島 → 勝島の運河沿い → 芝浦 → 浜崎橋JCT',
    en: 'ROUTE 1  HANEDA LINE',
    km: 13,
    note: '飛行機が頭上をかすめる羽田から、運河の真上を北上。東京タワーへ向かう直線の連続。',
  },
];
