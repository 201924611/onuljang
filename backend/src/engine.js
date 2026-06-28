// engine.js — 비민감 분석 로직: 가격 생성·출하 라우팅·소비자 신호·AI 단기전망·이상탐지
import {
  MARKETS, ITEMS, GRADES, ORIGINS,
  ITEM_BY_CODE, MARKET_BY_CODE, GRADE_BY_CODE,
  rand, randn, distanceKm,
} from './data.js';
import { REAL, LIVE } from './realsnap.js';

const DAY = 86400000;
// 기준일: 실데이터(DB)가 있으면 최신 거래정산일, 없으면 고정 데모일. 동적이라 주기 갱신 즉시 반영.
export function curDate() { return LIVE ? REAL.date : '2026-06-19'; }
export function REF_DATE() { return new Date(curDate() + 'T00:00:00Z'); }

export function doy(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((date.getTime() - start) / DAY);
}
function fmtDate(date) {
  return date.toISOString().slice(0, 10);
}

// ── 기상 외생변수(결정론적): 일별 기온편차/강수 — ASOS 일자료(15059093) 대체 ──
export function weatherOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const k = doy(d);
  // 연중 평균기온 곡선(한국 중부) + 시드 변동
  const baseT = 12.5 - 12 * Math.cos((2 * Math.PI * (k - 20)) / 365);
  // 실 ASOS: 기준일과 일치하면 실측 기온·강수 사용(15059093)
  if (LIVE && REAL.weather && dateStr === REAL.date) {
    const wr = REAL.weather;
    const tA = Math.round((wr.avgTa - baseT) * 10) / 10;
    const rn = Math.round(wr.sumRn || 0);
    return {
      date: dateStr, avgTa: wr.avgTa, tAnom: tA, sumRn: rn,
      shock: Math.round((Math.max(0, rn - 15) * 0.006 + Math.max(0, Math.abs(tA) - 3) * 0.03) * 1000) / 1000,
    };
  }
  const tAnom = randn('wT:' + dateStr) * 2.6;           // 기온 이상(℃)
  const rainHit = rand('wR:' + dateStr) < 0.24;          // 강수일 여부
  const rain = rainHit ? Math.round(rand('wRmm:' + dateStr) * 48 + 2) : 0;
  return {
    date: dateStr,
    avgTa: Math.round((baseT + tAnom) * 10) / 10,
    tAnom: Math.round(tAnom * 10) / 10,
    sumRn: rain,
    shock: Math.round((Math.max(0, rain - 15) * 0.006 + Math.max(0, Math.abs(tAnom) - 3) * 0.03) * 1000) / 1000,
  };
}

// ── 경락가(원/단위) : 합성 시계열(품목×시장×등급×날짜 결정론적) ───────────────
function synPrice(itemCode, marketCode, gradeCode, dateStr) {
  const it = ITEM_BY_CODE[itemCode];
  const mk = MARKET_BY_CODE[marketCode];
  const gr = GRADE_BY_CODE[gradeCode] || GRADE_BY_CODE['B'];
  if (!it || !mk) return null;
  const d = new Date(dateStr + 'T00:00:00Z');
  const k = doy(d);
  const seasonal = 1 + it.volat * 0.6 * Math.cos((2 * Math.PI * (k - it.peakDoY)) / 365);
  const yearSupply = 1 + seasonAnom(itemCode, d) * it.volat;
  const mkBias = 1 + mk.biasPct / 100 + (rand(`mk:${itemCode}:${marketCode}`) - 0.5) * 0.06;
  const w = weatherOf(dateStr);
  const wEffect = 1 + w.shock * it.weather;
  const noise = 1 + randn(`px:${itemCode}:${marketCode}:${gradeCode}:${dateStr}`) * it.volat * 0.16;
  return it.basePrice * gr.mult * seasonal * yearSupply * mkBias * wEffect * noise;
}

// (품목,시장) 실가격 레벨 보정 계수: 합성 시계열을 실 경락가(원/kg)에 맞춤.
// 해당 시장 실데이터가 있으면 그 값, 없지만 품목 실데이터가 있으면 전국 중앙값×시장편향으로 보정(단위 일관 유지).
const _factor = {};
function realFactor(itemCode, marketCode) {
  if (!LIVE) return null;
  const direct = REAL.prices?.[itemCode]?.[marketCode];
  const itemAvg = REAL.priceAvg?.[itemCode];
  if (direct == null && itemAvg == null) return null; // 품목 자체가 실데이터 없음(예: 제철 외) → 합성
  const key = itemCode + '|' + marketCode;
  if (_factor[key] == null) {
    const synB = synPrice(itemCode, marketCode, 'B', REAL.date);
    let target = direct;
    if (target == null) { // 시장 누락 → 품목 전국 중앙값에 시장 편향만 반영
      const mk = MARKET_BY_CODE[marketCode];
      target = Math.round(itemAvg * (1 + (mk?.biasPct || 0) / 100));
    }
    _factor[key] = (synB && synB > 0) ? target / synB : 1;
  }
  return _factor[key];
}

// 경락가: 실데이터 있으면 실 레벨로 보정(오늘=실가격, 시간 동학은 모델 유지), 없으면 합성
export function priceOf(itemCode, marketCode, gradeCode, dateStr) {
  const base = synPrice(itemCode, marketCode, gradeCode, dateStr);
  if (base == null) return null;
  const f = realFactor(itemCode, marketCode);
  let p = f != null ? base * f : base;
  const step = p > 6000 ? 100 : (p > 1500 ? 50 : 10);
  return Math.max(step, Math.round(p / step) * step);
}

// 금년 작황 이상(공급상태): 14일 간격 knot를 부드럽게 보간 → 평년대비 편차+추세 자기상관 생성
function seasonAnom(itemCode, date) {
  const ms = date.getTime();
  const KNOT = 14 * DAY;
  const idx = Math.floor(ms / KNOT);
  const frac = (ms % KNOT) / KNOT;
  const knot = i => randn(`sa:${itemCode}:${i}`); // 표준정규 knot
  const a = knot(idx), b = knot(idx + 1);
  const sm = frac * frac * (3 - 2 * frac); // smoothstep
  return (a * (1 - sm) + b * sm) * 0.45;
}

// 거래량(반입량 kg) — 실데이터 있으면 실 거래량, 없으면 시장규모·계절 모델
export function volumeOf(itemCode, marketCode, dateStr) {
  if (LIVE && dateStr === REAL.date) {
    const rv = REAL.volume?.[itemCode]?.[marketCode];
    if (rv != null) return Math.round(rv);
  }
  const mk = MARKET_BY_CODE[marketCode];
  const scale = mk.biasPct >= 4 ? 4.5 : (mk.biasPct >= 0 ? 2.4 : 1.4); // 큰 시장일수록 반입↑
  const base = 1200 * scale;
  const v = base * (0.7 + rand(`vol:${itemCode}:${marketCode}:${dateStr}`) * 0.9);
  return Math.round(v / 10) * 10;
}

// ── 1) 출하 라우팅 + 운송비 차감 실수령 (결정론적 핵심 기능) ──────────────────
export function routing({ itemCode, gradeCode = 'B', originName, qtyKg = 1000, dateStr = curDate() }) {
  const it = ITEM_BY_CODE[itemCode];
  if (!it) throw new Error('unknown item');
  const origin = ORIGINS.find(o => o.name === originName) || ORIGINS[0];
  const RATE = 95;     // 운송 단가(원/kg/100km) — 화물 일반운임 근사
  const HANDLING = 30; // 상하차·포장 취급비(원/kg)

  const rows = MARKETS.map(mk => {
    const price = priceOf(itemCode, mk.code, gradeCode, dateStr);   // 원/단위
    const vol = volumeOf(itemCode, mk.code, dateStr);
    const dist = distanceKm(origin, mk);
    const grossPerKg = unitToKg(it, price);                          // 원/kg 환산
    const gross = grossPerKg * qtyKg;
    const fee = gross * mk.feeRate;                                  // 도매수수료
    const transport = (RATE * dist / 100 + HANDLING) * qtyKg;        // 운송+취급
    const net = gross - fee - transport;
    return {
      marketCode: mk.code, market: mk.name, region: mk.region,
      price, unit: it.unit, volume: vol, distanceKm: dist,
      grossPerKg: Math.round(grossPerKg),
      gross: Math.round(gross), fee: Math.round(fee), transport: Math.round(transport),
      net: Math.round(net), netPerKg: Math.round(net / qtyKg),
    };
  });
  rows.sort((a, b) => b.net - a.net);
  const best = rows[0], worst = rows[rows.length - 1];
  const naive = rows.find(r => r.market.startsWith('서울 가락')) || rows[0]; // '늘 가던 큰 시장' 가정
  const gain = best.net - naive.net;
  const w = weatherOf(dateStr);
  return {
    date: dateStr, item: it.name, itemCode, grade: GRADE_BY_CODE[gradeCode]?.name, qtyKg,
    origin: origin.name, rate: RATE, handling: HANDLING,
    rows,
    best, worst,
    naiveMarket: naive.market, gainVsNaive: Math.round(gain),
    gainPct: naive.net > 0 ? Math.round((gain / naive.net) * 1000) / 10 : 0,
    spreadPct: best.net > 0 ? Math.round(((best.net - worst.net) / best.net) * 1000) / 10 : 0,
    weather: w,
    advice: buildAdvice({ it, dateStr, best, w }),
  };
}

function unitToKg(it, price) {
  // 실데이터(LIVE)는 경락가가 원/kg 통일 → 환산 불필요(항등)
  if (LIVE) return price;
  // 합성(원/단위) → kg 환산(개·포기 평균중량 가정)
  const wkg = { '포기': 2.5, '개': 0.25, 'kg': 1 }[it.unit] || 1;
  return price / wkg;
}

function buildAdvice({ it, dateStr, best, w }) {
  const msgs = [];
  msgs.push({ type: 'route', icon: '📦', text: `오늘은 ‘${best.market}’ 출하 시 실수령 1위 (운송비 차감 후 ${best.net.toLocaleString()}원)` });
  if (w.sumRn >= 20) msgs.push({ type: 'weather', icon: '🌧', text: `강수 ${w.sumRn}mm 예보 — 무름·등급하락 우려, 조기 출하 권장` });
  else if (w.tAnom >= 4) msgs.push({ type: 'weather', icon: '🌡', text: `평년比 +${w.tAnom}℃ 고온 — 신선도 저하 주의, 당일 출하 권장` });
  const f = forecast(it.code);
  if (f.backtest.hitRate >= 55) {
    const dir = f.direction > 0 ? '상승' : f.direction < 0 ? '하락' : '보합';
    msgs.push({ type: 'ai', icon: '🤖', text: `AI 단기전망(베타): 3일 ${dir} 가능성 (백테스트 적중률 ${f.backtest.hitRate}%) — 참고만` });
  }
  return msgs;
}

// ── 2) 소비자 신호등: 전국 평균가의 평년대비 편차 ────────────────────────────
export function consumerSignal(dateStr = curDate()) {
  const items = ITEMS.map(it => {
    const today = nationalAvg(it.code, dateStr);
    const normal = normalPrice(it.code, dateStr);  // 평년 동기간 평균
    const devPct = Math.round(((today - normal) / normal) * 1000) / 10;
    let status, label, icon;
    if (devPct <= -8) { status = 'cheap'; label = '쌈'; icon = '▼'; }
    else if (devPct >= 8) { status = 'pricey'; label = '비쌈'; icon = '▲'; }
    else { status = 'normal'; label = '보통'; icon = '＝'; }
    const f = forecast(it.code, dateStr);
    return {
      code: it.code, name: it.name, cat: it.cat, unit: it.unit,
      today, normal, devPct, status, label, icon,
      next3: f.direction, // 7일 방향(참고)
    };
  });
  // 대체재 추천: 같은 부류에서 가장 싼 품목
  const byCat = {};
  for (const it of items) (byCat[it.cat] ||= []).push(it);
  for (const cat of Object.keys(byCat)) {
    const cheapest = [...byCat[cat]].sort((a, b) => a.devPct - b.devPct)[0];
    byCat[cat].forEach(it => { it.altInCat = cheapest.code !== it.code ? cheapest.name : null; });
  }
  return { date: dateStr, items };
}

export function nationalAvg(itemCode, dateStr) {
  const ps = MARKETS.map(m => priceOf(itemCode, m.code, 'B', dateStr));
  return Math.round(ps.reduce((a, b) => a + b, 0) / ps.length);
}
// 기준선: 실데이터 있으면 최근 영업일 평균(실측), 없으면 합성 평년(직전 5년 ±7일)
function normalPrice(itemCode, dateStr) {
  if (LIVE && dateStr === REAL.date && REAL.baseline?.[itemCode] != null) {
    return REAL.baseline[itemCode];
  }
  const d0 = new Date(dateStr + 'T00:00:00Z');
  let sum = 0, n = 0;
  for (let y = 1; y <= 5; y++) {
    for (let off = -7; off <= 7; off += 7) {
      const d = new Date(d0.getTime() - y * 365 * DAY + off * DAY);
      sum += nationalAvg(itemCode, fmtDate(d)); n++;
    }
  }
  return Math.round(sum / n);
}

// ── 3) AI 단기전망 + 백테스트(정직성: 적중률·오차 함께 공개) ──────────────────
// 모델: 계절성 추세 + 기상 보정의 경량 회귀(seasonal+weather). 무거운 학습 없음.
export function forecast(itemCode, dateStr = curDate(), horizon = 7) {
  const today = nationalAvg(itemCode, dateStr);
  const series = pastSeries(itemCode, dateStr, 45);
  // 추세: 최근 7일 회귀 기울기
  const slope = linregSlope(series.slice(-7));
  // 기상 보정: 향후 강수/고온 충격
  let wAdj = 0;
  for (let h = 1; h <= 3; h++) {
    const d = new Date(new Date(dateStr + 'T00:00:00Z').getTime() + h * DAY);
    wAdj += weatherOf(fmtDate(d)).shock;
  }
  const it = ITEM_BY_CODE[itemCode];
  const pred3 = Math.round(today * (1 + (slope / today) * 3 + wAdj * it.weather * 0.5));
  const direction = pred3 > today * 1.01 ? +1 : pred3 < today * 0.99 ? -1 : 0;
  const path = [];
  for (let h = 1; h <= horizon; h++) {
    const d = new Date(new Date(dateStr + 'T00:00:00Z').getTime() + h * DAY);
    const ds = fmtDate(d);
    const w = weatherOf(ds).shock * it.weather * 0.5;
    path.push({ date: ds, pred: Math.round(today * (1 + (slope / today) * h + w)) });
  }
  return { itemCode, today, pred3, direction, path, backtest: backtestCache(itemCode, dateStr) };
}

// 과거 시계열(전국 평균가)
function pastSeries(itemCode, dateStr, n) {
  const d0 = new Date(dateStr + 'T00:00:00Z');
  const arr = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(d0.getTime() - i * DAY);
    arr.push({ date: fmtDate(d), v: nationalAvg(itemCode, fmtDate(d)) });
  }
  return arr;
}
function linregSlope(pts) {
  const n = pts.length; if (n < 2) return 0;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  pts.forEach((p, i) => { sx += i; sy += p.v; sxy += i * p.v; sxx += i * i; });
  const den = n * sxx - sx * sx;
  return den === 0 ? 0 : (n * sxy - sx * sy) / den;
}

// 백테스트: 과거 60개 시점에서 3일 후 실제 vs 예측 — MAPE·방향 적중률
const _btCache = {};
function backtestCache(itemCode, dateStr) {
  const key = itemCode + '|' + dateStr;
  if (_btCache[key]) return _btCache[key];
  const d0 = new Date(dateStr + 'T00:00:00Z');
  let absPctSum = 0, hit = 0, cnt = 0;
  for (let i = 60; i >= 4; i--) {
    const base = new Date(d0.getTime() - i * DAY);
    const bs = fmtDate(base);
    const series = pastSeries(itemCode, bs, 45);
    const slope = linregSlope(series.slice(-7));
    const cur = nationalAvg(itemCode, bs);
    let wAdj = 0;
    for (let h = 1; h <= 3; h++) wAdj += weatherOf(fmtDate(new Date(base.getTime() + h * DAY))).shock;
    const pred = cur * (1 + (slope / cur) * 3 + wAdj * (ITEM_BY_CODE[itemCode].weather) * 0.5);
    const actual = nationalAvg(itemCode, fmtDate(new Date(base.getTime() + 3 * DAY)));
    absPctSum += Math.abs(pred - actual) / actual;
    const pdir = Math.sign(pred - cur), adir = Math.sign(actual - cur);
    if (pdir === adir) hit++;
    cnt++;
  }
  const res = {
    samples: cnt,
    mape: Math.round((absPctSum / cnt) * 1000) / 10,        // 평균절대오차율 %
    hitRate: Math.round((hit / cnt) * 1000) / 10,            // 방향 적중률 %
    naiveHit: 50.0,
  };
  _btCache[key] = res;
  return res;
}

// ── 4) 가격 이상탐지: 오늘 전국 평균가의 z-score (30일 분포) ──────────────────
export function anomalies(dateStr = curDate()) {
  const out = [];
  for (const it of ITEMS) {
    const series = pastSeries(it.code, dateStr, 31).slice(0, 30).map(p => p.v);
    const mean = series.reduce((a, b) => a + b, 0) / series.length;
    const sd = Math.sqrt(series.reduce((a, b) => a + (b - mean) ** 2, 0) / series.length) || 1;
    const today = nationalAvg(it.code, dateStr);
    const z = (today - mean) / sd;
    if (Math.abs(z) >= 2.2) {
      out.push({
        code: it.code, name: it.name, cat: it.cat,
        z: Math.round(z * 100) / 100, today, mean: Math.round(mean),
        dir: z > 0 ? 'surge' : 'plunge',
        text: `${it.name} ${z > 0 ? '급등' : '급락'} 신호 — 평소比 ${z > 0 ? '+' : ''}${(Math.round(z * 10) / 10)}σ`,
      });
    }
  }
  out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  return { date: dateStr, count: out.length, items: out };
}

// 시장별 시세 미니 차트용(라이브 틱 느낌): 오늘 품목 전 시장 경락가
export function boardSnapshot(dateStr = curDate()) {
  const rows = [];
  for (const it of ITEMS.slice(0, 8)) {
    rows.push({
      code: it.code, name: it.name, unit: it.unit,
      markets: MARKETS.slice(0, 6).map(m => ({ market: m.name, price: priceOf(it.code, m.code, 'B', dateStr) })),
    });
  }
  return { date: dateStr, rows };
}
