// server.js — 오늘장 API 서버 (비민감 시장 분석 로직 전용)
// 포트는 CC_PORT(전용 env)로 분리 — agent-core(8848) 등과 충돌 방지
import express from 'express';
import cors from 'cors';
import { MARKETS, ITEMS, GRADES, ORIGINS } from './data.js';
import {
  REF_DATE, routing, consumerSignal, forecast, anomalies, boardSnapshot, weatherOf,
} from './engine.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.CC_PORT || process.env.ONULJANG_PORT || 8091;
const fmt = d => d.toISOString().slice(0, 10);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'onuljang-backend', refDate: fmt(REF_DATE), markets: MARKETS.length, items: ITEMS.length });
});

app.get('/api/meta', (req, res) => {
  res.json({
    markets: MARKETS.map(({ code, name, region, feeRate }) => ({ code, name, region, feeRate })),
    items: ITEMS.map(({ code, name, cat, unit }) => ({ code, name, cat, unit })),
    grades: GRADES,
    origins: ORIGINS.map(o => o.name),
    refDate: fmt(REF_DATE),
    dataSources: [
      { id: '15141808', name: '전국 공영도매시장 실시간 경매정보(aT)', url: 'https://www.data.go.kr/data/15141808/openapi.do' },
      { id: '15029181', name: '도매시장 경락가격 표준데이터', url: 'https://www.data.go.kr/data/15029181/standard.do' },
      { id: '15059093', name: '기상청 ASOS 일자료', url: 'https://www.data.go.kr/data/15059093/openapi.do' },
      { id: '15087352', name: '주요 채소류 일일가격', url: 'https://www.data.go.kr/data/15087352/fileData.do' },
    ],
    notice: '경락가는 데모 안정성을 위한 결정론적 합성 시계열(실제 API 스키마 호환). 운영 시 위 공공데이터 API로 무변경 대체.',
  });
});

// 농가 출하 라우팅(실수령 랭킹)
app.get('/api/routing', (req, res) => {
  try {
    const { item, grade = 'B', origin, qty } = req.query;
    const r = routing({
      itemCode: item || ITEMS[0].code,
      gradeCode: grade,
      originName: origin || ORIGINS[0].name,
      qtyKg: Math.max(1, parseInt(qty || '1000', 10)),
    });
    res.json(r);
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

// 소비자 신호등
app.get('/api/signal', (req, res) => {
  res.json(consumerSignal(req.query.date));
});

// AI 단기전망 + 백테스트
app.get('/api/forecast', (req, res) => {
  const item = req.query.item || ITEMS[0].code;
  res.json(forecast(item, req.query.date));
});

// 이상탐지
app.get('/api/anomaly', (req, res) => {
  res.json(anomalies(req.query.date));
});

// 시세 보드(라이브 틱)
app.get('/api/board', (req, res) => {
  res.json(boardSnapshot(req.query.date));
});

// 기상
app.get('/api/weather', (req, res) => {
  res.json(weatherOf(req.query.date || fmt(REF_DATE)));
});

app.listen(PORT, () => {
  console.log(`[오늘장] backend listening on http://127.0.0.1:${PORT}  (refDate ${fmt(REF_DATE)})`);
});
