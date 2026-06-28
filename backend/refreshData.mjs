// refreshData.mjs — 공공데이터포털 API → SQLite DB 주기 갱신 (가격·거래량·기상)
// 사용: DATA_GO_KR_KEY=... node refreshData.mjs
// 크론/작업스케줄러로 매일 1회(경매 마감 후, 예: 19:00) 실행 권장.
// 앱 런타임은 DB만 읽으므로 API 부하 없음. 매일 누적되면 기준선/백테스트가 실 과거가 됨.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKETS, ITEMS } from './src/data.js';
import { openDb, DATA_DIR, SNAP_PATH, BASELINE_DAYS } from './src/store.js';

const KEY = process.env.DATA_GO_KR_KEY;
if (!KEY) { console.error('DATA_GO_KR_KEY 환경변수 필요'); process.exit(1); }
const enc = encodeURIComponent(KEY);
const AUCT = 'https://apis.data.go.kr/B552845/katRealTime2/trades2';
const DP = encodeURIComponent('cond[trd_clcln_ymd::EQ]');
const ASOS = 'https://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList';

const norm = s => (s || '').replace(/\s+/g, '');
const mktByReal = {}; for (const m of MARKETS) mktByReal[norm(m.name)] = m.code;
function itemMatch(appName) {
  return r => {
    const m = r.gds_mclsf_nm || '', s = r.gds_sclsf_nm || '';
    if (appName === '애호박') return m === '호박';
    if (appName === '청양고추') return s.includes('청양');
    if (appName === '건고추') return m.includes('건고추') || s.includes('건고추');
    return m === appName;
  };
}
async function auctionPage(date, p) {
  const u = `${AUCT}?serviceKey=${enc}&returnType=JSON&numOfRows=1000&pageNo=${p}&${DP}=${date}`;
  const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
  return (await r.json()).response.body;
}
async function fetchDay(date) {
  const f = await auctionPage(date, 1); const total = f.totalCount || 0;
  if (total === 0) return { total: 0, rows: [] };
  const pages = Math.ceil(total / 1000); let rows = f.items?.item || [];
  for (let s = 2; s <= pages; s += 12) {
    const b = []; for (let p = s; p < Math.min(s + 12, pages + 1); p++) b.push(auctionPage(date, p));
    for (const x of await Promise.all(b)) if (x.items?.item) rows = rows.concat(x.items.item);
  }
  return { total, rows };
}
const MIN_COUNT = 8;   // 셀(시장×품목) 최소 거래 건수 — 소표본 노이즈 제거
function aggregate(rows) {
  const out = {}; // itemCode -> marketCode -> {price, volume}
  for (const it of ITEMS) {
    const sub = rows.filter(itemMatch(it.name)); const per = {};
    for (const r of sub) {
      const code = mktByReal[norm(r.whsl_mrkt_nm)]; if (!code) continue;
      const uq = +r.unit_qty, q = +r.qty, pr = +r.scsbd_prc;
      if (!uq || !q || !pr || pr <= 0) continue;
      const ppk = pr / uq, w = q * uq;
      (per[code] = per[code] || { v: 0, w: 0, n: 0 }); per[code].v += ppk * w; per[code].w += w; per[code].n++;
    }
    out[it.code] = {};
    for (const [c, a] of Object.entries(per)) {
      if (a.n < MIN_COUNT) continue; // 표본 부족 셀 제외(노이즈 방지)
      out[it.code][c] = { price: Math.round(a.v / a.w), volume: Math.round(a.w) };
    }
  }
  return out;
}
async function fetchAsos(date) {
  const d = date.replaceAll('-', '');
  const u = `${ASOS}?serviceKey=${enc}&dataType=JSON&dataCd=ASOS&dateCd=DAY&stnIds=108&startDt=${d}&endDt=${d}&numOfRows=5&pageNo=1`;
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(12000) });
    const it = (await r.json())?.response?.body?.items?.item?.[0];
    return it ? { stn: it.stnNm, avgTa: +it.avgTa, maxTa: +it.maxTa, sumRn: +(it.sumRn || 0) } : null;
  } catch { return null; }
}

// 최신 거래일 자동 탐지(오늘부터 역순, 충분한 데이터가 있는 첫 날)
function ymd(d) { return d.toISOString().slice(0, 10); }
async function findLatestDate() {
  const now = new Date();
  for (let i = 0; i <= 6; i++) {
    const d = ymd(new Date(now.getTime() - i * 86400000));
    const f = await auctionPage(d, 1);
    if ((f.totalCount || 0) > 5000) return { date: d, total: f.totalCount };
  }
  return null;
}

const db = openDb();
if (!db) { console.error('SQLite 사용 불가(Node 22.5+ 필요)'); process.exit(1); }

const hit = await findLatestDate();
if (!hit) { console.error('최근 거래 데이터 없음'); process.exit(1); }
console.log('최신 거래일:', hit.date, '총', hit.total, '건 수집...');
const { rows } = await fetchDay(hit.date);
const agg = aggregate(rows);
const weather = await fetchAsos(hit.date);

const up = db.prepare('INSERT INTO daily_price(date,item_code,market_code,price,volume) VALUES(?,?,?,?,?) ON CONFLICT(date,item_code,market_code) DO UPDATE SET price=excluded.price, volume=excluded.volume');
let n = 0;
db.exec('BEGIN');
db.prepare('DELETE FROM daily_price WHERE date=?').run(hit.date); // 재실행 시 옛 셀(필터된) 제거
for (const [item, mkts] of Object.entries(agg))
  for (const [mkt, pv] of Object.entries(mkts)) { up.run(hit.date, item, mkt, pv.price, pv.volume); n++; }
if (weather) db.prepare('INSERT INTO daily_weather(date,stn,avgTa,maxTa,sumRn) VALUES(?,?,?,?,?) ON CONFLICT(date) DO UPDATE SET stn=excluded.stn,avgTa=excluded.avgTa,maxTa=excluded.maxTa,sumRn=excluded.sumRn').run(hit.date, weather.stn, weather.avgTa, weather.maxTa, weather.sumRn);
db.exec('COMMIT');
console.log('DB upsert:', n, '행 (', hit.date, '), 기상:', weather ? 'OK' : '없음');

// 폴백/공개용 realsnapshot.json export (최신일 + 기준선)
const latest = db.prepare('SELECT MAX(date) d FROM daily_price').get().d;
const prRows = db.prepare('SELECT item_code,market_code,price,volume FROM daily_price WHERE date=?').all(latest);
const prices = {}, volume = {};
for (const r of prRows) { (prices[r.item_code] ??= {})[r.market_code] = r.price; (volume[r.item_code] ??= {})[r.market_code] = r.volume; }
const days = db.prepare('SELECT DISTINCT date FROM daily_price ORDER BY date DESC LIMIT ?').all(BASELINE_DAYS).map(x => x.date);
const baseline = {};
const bq = db.prepare('SELECT AVG(price) a FROM daily_price WHERE item_code=? AND date IN (' + days.map(() => '?').join(',') + ')');
for (const item of Object.keys(prices)) { const a = bq.get(item, ...days)?.a; if (a) baseline[item] = Math.round(a); }
const w = db.prepare('SELECT * FROM daily_weather WHERE date=?').get(latest);
// 품목 전국 중앙값(누락 시장 보정용)
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const priceAvg = {};
for (const [item, mk] of Object.entries(prices)) {
  const m = median(Object.values(mk)); if (!m) continue; priceAvg[item] = m;
  const lo = m * 0.4, hi = m * 2.2;
  for (const c of Object.keys(mk)) mk[c] = Math.min(hi, Math.max(lo, mk[c]));
}
const snap = {
  source: '전국 공영도매시장 실시간 경매정보(aT 15141808) + 기상청 ASOS(15059093) · SQLite 주기 갱신',
  fetchedAt: new Date().toISOString(), date: latest, baselineDays: days, unit: '원/kg',
  prices, volume, baseline, priceAvg,
  weather: w ? { stn: w.stn, tm: w.date, avgTa: w.avgTa, maxTa: w.maxTa, sumRn: w.sumRn } : null,
};
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(SNAP_PATH, JSON.stringify(snap, null, 1));
const cov = Object.values(prices).filter(p => Object.keys(p).length).length;
console.log('스냅샷 export 완료. 실데이터 커버 품목:', cov, '/', ITEMS.length, '| DB 보유일수:', days.length);
