// store.js — 가격/거래량/기상 영속 저장소
// 우선순위: SQLite DB(data/onuljang.db) → 없으면 번들 스냅샷(data/realsnapshot.json)
// DB는 refreshData.mjs 가 공공데이터포털 API로 주기 갱신한다(키 필요). 앱 런타임은 DB만 읽는다(API 미호출).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dir, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'onuljang.db');
const SNAP_PATH = path.join(DATA_DIR, 'realsnapshot.json');
const BASELINE_DAYS = 7; // 기준선: 최근 N영업일 평균

let DatabaseSync = null;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { DatabaseSync = null; }

let db = null;
export function openDb() {
  if (!DatabaseSync) return null;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const d = new DatabaseSync(DB_PATH);
    d.exec(`CREATE TABLE IF NOT EXISTS daily_price(
      date TEXT, item_code TEXT, market_code TEXT,
      price INTEGER, volume INTEGER,
      PRIMARY KEY(date,item_code,market_code));
    CREATE TABLE IF NOT EXISTS daily_weather(
      date TEXT PRIMARY KEY, stn TEXT, avgTa REAL, maxTa REAL, sumRn REAL);`);
    return d;
  } catch (e) {
    return null;
  }
}

function dbHasData() {
  try {
    if (!fs.existsSync(DB_PATH)) return false;
    db = db || openDb();
    if (!db) return false;
    const r = db.prepare('SELECT COUNT(*) c FROM daily_price').get();
    return r && r.c > 0;
  } catch { return false; }
}

// 통합 스냅샷 객체 { date, source, unit, prices{item}{market}, volume{item}{market}, baseline{item}, weather }
export function loadSnapshot() {
  if (dbHasData()) return fromDb();
  return fromJson();
}

function fromDb() {
  const latest = db.prepare('SELECT MAX(date) d FROM daily_price').get().d;
  const rows = db.prepare('SELECT item_code,market_code,price,volume FROM daily_price WHERE date=?').all(latest);
  const prices = {}, volume = {};
  for (const r of rows) {
    (prices[r.item_code] = prices[r.item_code] || {})[r.market_code] = r.price;
    (volume[r.item_code] = volume[r.item_code] || {})[r.market_code] = r.volume;
  }
  // 기준선: 최근 N영업일, 품목별 (시장평균의 일평균)
  const days = db.prepare('SELECT DISTINCT date FROM daily_price ORDER BY date DESC LIMIT ?').all(BASELINE_DAYS).map(x => x.date);
  const baseline = {};
  const bq = db.prepare('SELECT AVG(price) a FROM daily_price WHERE item_code=? AND date IN (' + days.map(() => '?').join(',') + ')');
  for (const item of Object.keys(prices)) {
    const a = bq.get(item, ...days)?.a;
    if (a) baseline[item] = Math.round(a);
  }
  const w = db.prepare('SELECT * FROM daily_weather WHERE date=?').get(latest);
  // 품목 전국 중앙값(누락 시장 보정용) + 과도 이탈 셀 클램프(소표본 이상치 방지)
  const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const priceAvg = {};
  for (const [item, mk] of Object.entries(prices)) {
    const m = median(Object.values(mk)); if (!m) continue; priceAvg[item] = m;
    const lo = m * 0.4, hi = m * 2.2;
    for (const c of Object.keys(mk)) mk[c] = Math.min(hi, Math.max(lo, mk[c]));
  }
  return {
    date: latest, source: '공공데이터포털 API(15141808 경매 + 15059093 ASOS) · SQLite 주기 갱신',
    unit: '원/kg', prices, volume, baseline, priceAvg,
    weather: w ? { stn: w.stn, tm: w.date, avgTa: w.avgTa, maxTa: w.maxTa, sumRn: w.sumRn } : null,
    backend: 'db', days: days.length,
  };
}

function fromJson() {
  try {
    const j = JSON.parse(fs.readFileSync(SNAP_PATH, 'utf-8'));
    j.backend = 'snapshot';
    return j;
  } catch { return null; }
}

export { DB_PATH, SNAP_PATH, DATA_DIR, BASELINE_DAYS };
