// dump.js — 프론트 오프라인 폴백용 스냅샷 생성 (frontend/src/sample.json)
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { MARKETS, ITEMS, GRADES, ORIGINS } from './data.js';
import { REF_DATE, routing, consumerSignal, forecast, anomalies, boardSnapshot, weatherOf } from './engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fmt = d => d.toISOString().slice(0, 10);
const refDate = fmt(REF_DATE);

const meta = {
  markets: MARKETS.map(({ code, name, region, feeRate }) => ({ code, name, region, feeRate })),
  items: ITEMS.map(({ code, name, cat, unit }) => ({ code, name, cat, unit })),
  grades: GRADES, origins: ORIGINS.map(o => o.name), refDate,
};

// 기본 라우팅 + 품목별 라우팅(기본 출하지/등급/물량) 프리컴퓨트
const defaultOrigin = '강원 춘천';
const routingByItem = {};
for (const it of ITEMS) {
  routingByItem[it.code] = routing({ itemCode: it.code, gradeCode: 'A', originName: defaultOrigin, qtyKg: 1000 });
}
const forecasts = {};
for (const it of ITEMS) forecasts[it.code] = forecast(it.code);

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
  generatedFor: 'offline-fallback',
};

const out = resolve(__dirname, '../../frontend/src/sample.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(snapshot));
console.log('snapshot written:', out, '(', (JSON.stringify(snapshot).length / 1024).toFixed(0), 'KB )');
