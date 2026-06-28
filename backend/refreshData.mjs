// refreshData.mjs — 공공데이터포털 API → SQLite DB 갱신 (가격·거래량·등급분위수·기상)
// 사용:
//   node refreshData.mjs            최신 거래일 1일 갱신(매일 크론용)
//   node refreshData.mjs --backfill 최근 30일 거래일 전부 백필(최초 1회·history 구축)
// 앱 런타임은 DB만 읽음(요청마다 API 미호출). 매일 누적되면 전망·이상감지·백테스트가 실 과거 기반이 됨.
import fs from 'node:fs';
import { MARKETS, ITEMS } from './src/data.js';
import { openDb, DATA_DIR, SNAP_PATH, BASELINE_DAYS } from './src/store.js';

const KEY = process.env.DATA_GO_KR_KEY;
if (!KEY) { console.error('DATA_GO_KR_KEY 환경변수 필요'); process.exit(1); }
const enc = encodeURIComponent(KEY);
const AUCT = 'https://apis.data.go.kr/B552845/katRealTime2/trades2';
const DP = encodeURIComponent('cond[trd_clcln_ymd::EQ]');
const ASOS = 'https://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList';
const MIN_COUNT = 8;

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
async function page(date, p) {
  const u = `${AUCT}?serviceKey=${enc}&returnType=JSON&numOfRows=1000&pageNo=${p}&${DP}=${date}`;
  const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
  return (await r.json()).response.body;
}
async function totalOf(date) { return (await page(date, 1)).totalCount || 0; }
async function fetchDay(date, total) {
  const pages = Math.ceil(total / 1000); let rows = [];
  const f = await page(date, 1); rows = f.items?.item || [];
  for (let s = 2; s <= pages; s += 12) {
    const b = []; for (let p = s; p < Math.min(s + 12, pages + 1); p++) b.push(page(date, p));
    for (const x of await Promise.all(b)) if (x.items?.item) rows = rows.concat(x.items.item);
  }
  return rows;
}
function wpct(samples, p) { // 거래량 가중 분위수
  const tot = samples.reduce((s, x) => s + x.w, 0); if (!tot) return null;
  let acc = 0; const t = tot * p;
  for (const x of samples) { acc += x.w; if (acc >= t) return x.ppk; }
  return samples.at(-1)?.ppk;
}
function aggregate(rows) {
  const out = {};
  for (const it of ITEMS) {
    const sub = rows.filter(itemMatch(it.name)); const per = {};
    for (const r of sub) {
      const code = mktByReal[norm(r.whsl_mrkt_nm)]; if (!code) continue;
      const uq = +r.unit_qty, q = +r.qty, pr = +r.scsbd_prc;
      if (!uq || !q || !pr || pr <= 0) continue;
      const ppk = pr / uq, w = q * uq;
      (per[code] = per[code] || { v: 0, w: 0, n: 0, s: [] });
      per[code].v += ppk * w; per[code].w += w; per[code].n++; per[code].s.push({ ppk, w });
    }
    out[it.code] = {};
    for (const [c, a] of Object.entries(per)) {
      if (a.n < MIN_COUNT) continue;
      a.s.sort((x, y) => x.ppk - y.ppk);
      out[it.code][c] = {
        price: Math.round(a.v / a.w), volume: Math.round(a.w),
        p25: Math.round(wpct(a.s, 0.25)), p75: Math.round(wpct(a.s, 0.75)),
      };
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

const db = openDb();
if (!db) { console.error('SQLite 사용 불가(Node 22.5+ 필요)'); process.exit(1); }
const upPrice = db.prepare('INSERT INTO daily_price(date,item_code,market_code,price,volume,p25,p75) VALUES(?,?,?,?,?,?,?) ON CONFLICT(date,item_code,market_code) DO UPDATE SET price=excluded.price,volume=excluded.volume,p25=excluded.p25,p75=excluded.p75');
const upWx = db.prepare('INSERT INTO daily_weather(date,stn,avgTa,maxTa,sumRn) VALUES(?,?,?,?,?) ON CONFLICT(date) DO UPDATE SET stn=excluded.stn,avgTa=excluded.avgTa,maxTa=excluded.maxTa,sumRn=excluded.sumRn');

async function processDay(date) {
  const total = await totalOf(date);
  if (total < 5000) return { date, total, n: 0 };
  const rows = await fetchDay(date, total);
  const agg = aggregate(rows);
  const wx = await fetchAsos(date);
  db.exec('BEGIN');
  db.prepare('DELETE FROM daily_price WHERE date=?').run(date);
  let n = 0;
  for (const [item, mkts] of Object.entries(agg))
    for (const [mkt, pv] of Object.entries(mkts)) { upPrice.run(date, item, mkt, pv.price, pv.volume, pv.p25, pv.p75); n++; }
  if (wx) upWx.run(date, wx.stn, wx.avgTa, wx.maxTa, wx.sumRn);
  db.exec('COMMIT');
  return { date, total, n, wx: !!wx };
}

const backfill = process.argv.includes('--backfill');
const now = new Date('2026-06-28T00:00:00Z'); // 기준(실행일)
function ymd(t) { return new Date(t).toISOString().slice(0, 10); }

if (backfill) {
  console.log('백필: 최근 35일 거래일 수집...');
  let done = 0;
  for (let i = 0; i <= 35; i++) {
    const d = ymd(now.getTime() - i * 86400000);
    const r = await processDay(d);
    if (r.n > 0) { console.log(`  ${d}: ${r.n}셀 (총 ${r.total})`); done++; }
  }
  console.log('백필 완료, 거래일 수:', done);
} else {
  // 최신 거래일 1일
  let target = null;
  for (let i = 0; i <= 6; i++) { const d = ymd(now.getTime() - i * 86400000); if (await totalOf(d) > 5000) { target = d; break; } }
  if (!target) { console.error('최근 거래 데이터 없음'); process.exit(1); }
  const r = await processDay(target);
  console.log(`갱신: ${r.date} → ${r.n}셀, 기상 ${r.wx ? 'OK' : '없음'}`);
}

// 폴백/공개용 realsnapshot.json export (최신일 + 기준선)
const latest = db.prepare('SELECT MAX(date) d FROM daily_price').get().d;
const prRows = db.prepare('SELECT item_code,market_code,price,volume,p25,p75 FROM daily_price WHERE date=?').all(latest);
const prices = {}, volume = {}, gradeBand = {};
for (const r of prRows) {
  (prices[r.item_code] ??= {})[r.market_code] = r.price;
  (volume[r.item_code] ??= {})[r.market_code] = r.volume;
  (gradeBand[r.item_code] ??= {})[r.market_code] = { p25: r.p25, p75: r.p75 };
}
const days = db.prepare('SELECT DISTINCT date FROM daily_price ORDER BY date DESC LIMIT ?').all(BASELINE_DAYS).map(x => x.date);
const baseline = {};
const bq = db.prepare('SELECT AVG(price) a FROM daily_price WHERE item_code=? AND date IN (' + days.map(() => '?').join(',') + ')');
for (const item of Object.keys(prices)) { const a = bq.get(item, ...days)?.a; if (a) baseline[item] = Math.round(a); }
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const priceAvg = {};
for (const [item, mk] of Object.entries(prices)) { const m = median(Object.values(mk)); if (m) priceAvg[item] = m; }
const w = db.prepare('SELECT * FROM daily_weather WHERE date=?').get(latest);
const totalDays = db.prepare('SELECT COUNT(DISTINCT date) c FROM daily_price').get().c;
const snap = {
  source: '전국 공영도매시장 실시간 경매정보(aT 15141808) + 기상청 ASOS(15059093) · SQLite 주기 갱신',
  fetchedAt: new Date().toISOString(), date: latest, baselineDays: days, historyDays: totalDays, unit: '원/kg',
  prices, volume, gradeBand, baseline, priceAvg,
  weather: w ? { stn: w.stn, tm: w.date, avgTa: w.avgTa, maxTa: w.maxTa, sumRn: w.sumRn } : null,
};
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(SNAP_PATH, JSON.stringify(snap, null, 1));
const cov = Object.values(prices).filter(p => Object.keys(p).length).length;
console.log('스냅샷 export. 실데이터 품목:', cov, '/', ITEMS.length, '| DB 거래일수:', totalDays);
