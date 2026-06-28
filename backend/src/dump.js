// dump.js — 프론트 오프라인 폴백용 스냅샷 생성 (frontend/src/sample.json)
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { MARKETS, ITEMS, GRADES, ORIGINS } from './data.js';
import { curDate, routing, shipTiming, consumerSignal, forecast, anomalies, boardSnapshot, weatherOf } from './engine.js';
import { LIVE } from './realsnap.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fmt = d => d.toISOString().slice(0, 10);
const refDate = curDate();

const meta = {
  markets: MARKETS.map(({ code, name, region, feeRate }) => ({ code, name, region, feeRate })),
  items: ITEMS.map(({ code, name, cat, unit }) => ({ code, name, cat, unit: LIVE ? 'kg' : unit })),
  grades: GRADES, origins: ORIGINS.map(o => o.name), refDate,
};

// 기본 라우팅 + 품목별 라우팅(기본 출하지/등급/물량) 프리컴퓨트
const defaultOrigin = '강원 춘천';
const routingByItem = {};
for (const it of ITEMS) {
  routingByItem[it.code] = routing({ itemCode: it.code, gradeCode: 'B', originName: defaultOrigin, qtyKg: 1000 }); // B=실 평균
}
const forecasts = {};
for (const it of ITEMS) forecasts[it.code] = forecast(it.code);
// 출하 적기(기본 출하지/등급/물량) 프리컴퓨트 — 오프라인 폴백용
const shipTimingByItem = {};
for (const it of ITEMS) shipTimingByItem[it.code] = shipTiming({ itemCode: it.code, gradeCode: 'B', originName: defaultOrigin, qtyKg: 1000 });

const snapshot = {
  meta,
  refDate,
  defaultOrigin,
  signal: consumerSignal(),
  anomaly: anomalies(),
  board: boardSnapshot(),
  weather: weatherOf(refDate),
  routingByItem,
  forecasts,
  shipTimingByItem,
  generatedFor: 'offline-fallback',
};

const out = resolve(__dirname, '../../frontend/src/sample.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(snapshot));
console.log('snapshot written:', out, '(', (JSON.stringify(snapshot).length / 1024).toFixed(0), 'KB )');
