// buildSnapshot.mjs — 실 공공데이터로 realsnapshot.json 생성
// 사용: DATA_GO_KR_KEY=... node buildSnapshot.mjs
// - 전국 공영도매시장 실시간 경매정보(15141808): 시장×품목 거래량가중 원/kg
// - 기상청 ASOS 일자료(15059093): 대표 지점 기온·강수
import fs from 'node:fs';
import { MARKETS, ITEMS } from './src/data.js';

const KEY = process.env.DATA_GO_KR_KEY;
if (!KEY) { console.error('DATA_GO_KR_KEY 없음'); process.exit(1); }
const enc = encodeURIComponent(KEY);
const AUCT = 'https://apis.data.go.kr/B552845/katRealTime2/trades2';
const DP = encodeURIComponent('cond[trd_clcln_ymd::EQ]');
const ASOS = 'https://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList';

const norm = s => (s || '').replace(/\s+/g, '');
// 앱 시장명(공백제거) -> 실 whsl_mrkt_nm(공백제거) 동일
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

async function fetchDay(date) {
  const page = async p => {
    const u = `${AUCT}?serviceKey=${enc}&returnType=JSON&numOfRows=1000&pageNo=${p}&${DP}=${date}`;
    const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
    return (await r.json()).response.body;
  };
  const f = await page(1); const total = f.totalCount; const pages = Math.ceil(total / 1000);
  let rows = (f.items?.item) || [];
  for (let s = 2; s <= pages; s += 12) {
    const b = []; for (let p = s; p < Math.min(s + 12, pages + 1); p++) b.push(page(p));
    for (const x of await Promise.all(b)) if (x.items?.item) rows = rows.concat(x.items.item);
  }
  return rows;
}

// 하루 rows -> { itemCode: { marketCode: 원/kg } }
function aggregate(rows) {
  const out = {};
  for (const it of ITEMS) {
    const match = itemMatch(it.name);
    const sub = rows.filter(match);
    const perMkt = {};
    for (const r of sub) {
      const code = mktByReal[norm(r.whsl_mrkt_nm)];
      if (!code) continue;
      const uq = +r.unit_qty, q = +r.qty, pr = +r.scsbd_prc;
      if (!uq || !q || !pr || pr <= 0) continue;
      const ppk = pr / uq, w = q * uq;
      (perMkt[code] = perMkt[code] || { v: 0, w: 0 });
      perMkt[code].v += ppk * w; perMkt[code].w += w;
    }
    const prices = {};
    for (const [c, a] of Object.entries(perMkt)) prices[c] = Math.round(a.v / a.w);
    out[it.code] = prices;
  }
  return out;
}

async function fetchAsos(date) {
  const d = date.replaceAll('-', '');
  // 대표 지점: 서울(108). 강수 외생변수용
  const u = `${ASOS}?serviceKey=${enc}&dataType=JSON&dataCd=ASOS&dateCd=DAY&stnIds=108&startDt=${d}&endDt=${d}&numOfRows=10&pageNo=1`;
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(12000) });
    const it = (await r.json())?.response?.body?.items?.item?.[0];
    if (!it) return null;
    return { stn: it.stnNm, tm: it.tm, avgTa: +it.avgTa, maxTa: +it.maxTa, sumRn: +(it.sumRn || 0) };
  } catch { return null; }
}

const CUR = '2026-06-27';
const BASE_DAYS = ['2026-06-25', '2026-06-26', '2026-06-27'];

console.log('현재일 경매 수집:', CUR);
const curRows = await fetchDay(CUR);
console.log('  rows:', curRows.length);
const curPrices = aggregate(curRows);

// 기준선: 최근 영업일 평균(시장평균의 전국평균)
const baseAgg = {}; // itemCode -> [nationalAvg per day]
for (const d of BASE_DAYS) {
  const rows = d === CUR ? curRows : await fetchDay(d);
  console.log('기준선일', d, 'rows', rows.length);
  const ag = aggregate(rows);
  for (const it of ITEMS) {
    const ps = Object.values(ag[it.code] || {});
    if (ps.length) { (baseAgg[it.code] = baseAgg[it.code] || []); baseAgg[it.code].push(ps.reduce((a, b) => a + b, 0) / ps.length); }
  }
}
const baseline = {};
for (const it of ITEMS) { const a = baseAgg[it.code]; if (a?.length) baseline[it.code] = Math.round(a.reduce((x, y) => x + y, 0) / a.length); }

const weather = await fetchAsos(CUR);

const snap = {
  source: '전국 공영도매시장 실시간 경매정보(aT, data.go.kr 15141808) + 기상청 ASOS(15059093)',
  fetchedAt: new Date().toISOString(),
  date: CUR, baselineDays: BASE_DAYS, unit: '원/kg',
  prices: curPrices, baseline, weather,
};
fs.mkdirSync('./data', { recursive: true });
fs.writeFileSync('./data/realsnapshot.json', JSON.stringify(snap, null, 1));

// 요약
let covered = 0; for (const it of ITEMS) if (Object.keys(curPrices[it.code] || {}).length) covered++;
console.log('\n=== 스냅샷 완료 ===');
console.log('실데이터 커버 품목:', covered, '/', ITEMS.length);
for (const it of ITEMS) {
  const p = curPrices[it.code] || {}; const n = Object.keys(p).length;
  const ga = p['110001'] ?? Object.values(p)[0];
  console.log(' ', it.name.padEnd(5), '시장수', String(n).padStart(2), '가락/대표', ga ?? '-', '기준선', baseline[it.code] ?? '-');
}
console.log('weather:', JSON.stringify(weather));
