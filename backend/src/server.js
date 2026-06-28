// server.js — 오늘장 API 서버 (비민감 시장 분석 로직 전용)
// 데이터: SQLite DB(공공데이터포털 API로 주기 갱신) → 앱은 DB만 읽음(요청마다 API 미호출).
// 포트는 CC_PORT(전용 env)로 분리 — agent-core(8848) 등과 충돌 방지.
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MARKETS, ITEMS, GRADES, ORIGINS } from './data.js';
import {
  curDate, routing, shipTiming, consumerSignal, forecast, anomalies, boardSnapshot, weatherOf,
} from './engine.js';
import { REAL, LIVE, reloadReal } from './realsnap.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.CC_PORT || process.env.ONULJANG_PORT || 8091;

app.get('/api/health', (req, res) => {
  res.json({
    ok: true, service: 'onuljang-backend', refDate: curDate(),
    markets: MARKETS.length, items: ITEMS.length,
    data: LIVE ? '실데이터' : '합성', backend: REAL?.backend || 'none',
  });
});

app.get('/api/meta', (req, res) => {
  res.json({
    markets: MARKETS.map(({ code, name, region, feeRate }) => ({ code, name, region, feeRate })),
    // 실데이터는 경락가가 원/kg 통일
    items: ITEMS.map(({ code, name, cat, unit }) => ({ code, name, cat, unit: LIVE ? 'kg' : unit })),
    grades: GRADES,
    origins: ORIGINS.map(o => o.name),
    refDate: curDate(),
    live: LIVE, dataBackend: REAL?.backend || 'none', dbDays: REAL?.days || 0,
    // 정직성: 현재 프로토타입이 실연동(런타임 DB로 적재)한 소스만 integrated=true.
    dataSources: [
      { id: '15141808', name: '전국 공영도매시장 실시간 경매정보(aT)', url: 'https://www.data.go.kr/data/15141808/openapi.do', integrated: true },
      { id: '15059093', name: '기상청 ASOS 일자료', url: 'https://www.data.go.kr/data/15059093/openapi.do', integrated: true },
      { id: '15029181', name: '도매시장 경락가격 표준데이터(시계열 백필 확장 예정)', url: 'https://www.data.go.kr/data/15029181/standard.do', integrated: false },
      { id: '15087352', name: '주요 채소류 일일가격(소매가 비교 확장 예정)', url: 'https://www.data.go.kr/data/15087352/fileData.do', integrated: false },
    ],
    notice: LIVE
      ? '경락가·거래량은 전국 공영도매시장 실시간 경매정보(15141808), 기상은 ASOS(15059093) 실측. SQLite로 주기 갱신, 제철 외 일부 품목만 모델 보완.'
      : '경락가는 데모용 결정론적 합성(실 API 스키마 호환). 발급키로 refreshData 실행 시 실데이터로 전환.',
  });
});

app.get('/api/routing', (req, res) => {
  try {
    const { item, grade = 'B', origin, qty } = req.query;
    res.json(routing({
      itemCode: item || ITEMS[0].code, gradeCode: grade,
      originName: origin || ORIGINS[0].name,
      qtyKg: Math.max(1, parseInt(qty || '1000', 10)),
    }));
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});
app.get('/api/shiptiming', (req, res) => {
  try {
    const { item, grade = 'B', origin, qty } = req.query;
    res.json(shipTiming({
      itemCode: item || ITEMS[0].code, gradeCode: grade,
      originName: origin || ORIGINS[0].name,
      qtyKg: Math.max(1, parseInt(qty || '1000', 10)),
    }));
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});
app.get('/api/signal', (req, res) => res.json(consumerSignal(req.query.date)));
app.get('/api/forecast', (req, res) => res.json(forecast(req.query.item || ITEMS[0].code, req.query.date)));
app.get('/api/anomaly', (req, res) => res.json(anomalies(req.query.date)));
app.get('/api/board', (req, res) => res.json(boardSnapshot(req.query.date)));
app.get('/api/weather', (req, res) => res.json(weatherOf(req.query.date || curDate())));

// ── 주기 갱신 스케줄러 ───────────────────────────────────────────────
// DATA_GO_KR_KEY 가 있을 때만 동작. refreshData.mjs(공공데이터 API→DB)를 실행 후 메모리 재적재.
// 매일 1회(경매 마감 후): 매시 정각 점검 → 19시 이후이고 오늘 DB에 없으면 갱신.
function runRefresh(reason) {
  if (!process.env.DATA_GO_KR_KEY) return;
  const script = path.join(__dir, '..', 'refreshData.mjs');
  console.log(`[오늘장] refreshData 실행 (${reason})`);
  const ch = spawn(process.execPath, [script], { cwd: path.join(__dir, '..'), env: process.env });
  ch.stdout.on('data', d => process.stdout.write('[refresh] ' + d));
  ch.stderr.on('data', d => process.stderr.write('[refresh] ' + d));
  ch.on('close', code => { if (code === 0) { const s = reloadReal(); console.log('[오늘장] 데이터 재적재:', JSON.stringify(s)); } });
}
function scheduler() {
  if (!process.env.DATA_GO_KR_KEY) { console.log('[오늘장] DATA_GO_KR_KEY 없음 → 주기 갱신 비활성(DB/스냅샷만 읽음)'); return; }
  const tick = () => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    if (now.getHours() >= 19 && REAL?.date !== today) runRefresh('일일 갱신');
  };
  setInterval(tick, 60 * 60 * 1000); // 매시 점검
  tick();
}

app.listen(PORT, () => {
  console.log(`[오늘장] backend on http://127.0.0.1:${PORT}  refDate ${curDate()}  data=${LIVE ? '실데이터/' + (REAL?.backend) : '합성'}`);
  scheduler();
});
