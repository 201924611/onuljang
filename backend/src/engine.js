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

function roundStep(p) { const step = p > 6000 ? 100 : (p > 1500 ? 50 : 10); return Math.max(step, Math.round(p / step) * step); }

// 경락가: 기준일+실데이터면 등급별 실 가격대(상=p75·하=p25 등) 또는 실 경락가, 그 외엔 실 레벨 보정/합성
export function priceOf(itemCode, marketCode, gradeCode, dateStr) {
  if (LIVE && dateStr === REAL.date) {
    const mean = REAL.prices?.[itemCode]?.[marketCode];
    const band = REAL.gradeBand?.[itemCode]?.[marketCode];
    if (mean != null) {
      if (band?.p25 != null && band?.p75 != null) {
        // 실 가격 스프레드(IQR)를 등급 폭으로, 실 평균을 보통 기준으로 — 단조(하<보통<상<특) 보장
        const iqr = Math.max(band.p75 - band.p25, mean * 0.15);
        let t;
        if (gradeCode === 'S') t = mean + iqr * 1.0;       // 특
        else if (gradeCode === 'A') t = mean + iqr * 0.5;  // 상
        else if (gradeCode === 'C') t = mean - iqr * 0.5;  // 하
        else t = mean;                                     // 보통 = 실 평균
        return roundStep(Math.max(10, t));
      }
      if (gradeCode === 'B') return roundStep(mean);
    }
  }
  const base = synPrice(itemCode, marketCode, gradeCode, dateStr);
  if (base == null) return null;
  const f = realFactor(itemCode, marketCode);
  return roundStep(f != null ? base * f : base);
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
  if (f.direction !== 0) {
    const dir = f.direction > 0 ? '상승' : '하락';
    msgs.push({ type: 'ai', icon: 'ai', text: `단기 방향(모델 참고): 3일 ${dir} 가능성 — 참고만, 매매 권유 아님` });
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
      code: it.code, name: it.name, cat: it.cat, unit: LIVE ? 'kg' : it.unit,
      today, normal, devPct, status, label, icon,
      next3: f.direction, // 7일 방향(참고)
      real: !!(LIVE && REAL.prices?.[it.code] && Object.keys(REAL.prices[it.code]).length), // 실데이터 커버 여부
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
  // 실 과거 시계열(DB)이 있으면 그 날짜의 실 전국평균 사용
  if (LIVE && REAL.history?.[itemCode]?.[dateStr] != null) return REAL.history[itemCode][dateStr];
  const ps = MARKETS.map(m => priceOf(itemCode, m.code, 'B', dateStr));
  return Math.round(ps.reduce((a, b) => a + b, 0) / ps.length);
}

// 실 거래일 시계열 [{date,v}] (오름차순) — 전망·백테스트·이상탐지용. 실데이터 없으면 null.
function realSeries(itemCode) {
  if (!LIVE || !REAL.historyDates?.length) return null;
  const h = REAL.history?.[itemCode]; if (!h) return null;
  const s = REAL.historyDates.filter(d => h[d] != null).map(d => ({ date: d, v: h[d] }));
  return s.length >= 4 ? s : null;
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
  const it = ITEM_BY_CODE[itemCode];
  const rs = realSeries(itemCode);
  // 추세: 실 거래일 최근 7개 회귀(없으면 합성 45일 폴백)
  const trendPts = rs ? rs.slice(-7) : pastSeries(itemCode, dateStr, 45).slice(-7);
  const slope = linregSlope(trendPts);
  // 기상 보정: 향후 3일 강수/고온 충격(ASOS 곡선)
  let wAdj = 0;
  for (let h = 1; h <= 3; h++) {
    const d = new Date(new Date(dateStr + 'T00:00:00Z').getTime() + h * DAY);
    wAdj += weatherOf(fmtDate(d)).shock;
  }
  const pred3 = Math.round(today * (1 + (slope / today) * 3 + wAdj * it.weather * 0.5));
  const direction = pred3 > today * 1.01 ? +1 : pred3 < today * 0.99 ? -1 : 0;
  const path = [];
  for (let h = 1; h <= horizon; h++) {
    const d = new Date(new Date(dateStr + 'T00:00:00Z').getTime() + h * DAY);
    const ds = fmtDate(d);
    const w = weatherOf(ds).shock * it.weather * 0.5;
    path.push({ date: ds, pred: Math.round(today * (1 + (slope / today) * h + w)) });
  }
  return { itemCode, today, pred3, direction, path, real: !!rs, backtest: rs ? backtestReal(itemCode) : { real: false, insufficient: true } };
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

// 실 백테스트: 실 거래일 시계열에서 K거래일 후 실제 vs 예측 — 실측 방향 적중률·MAPE
const _btCache = {};
function backtestReal(itemCode) {
  if (_btCache[itemCode]) return _btCache[itemCode];
  const rs = realSeries(itemCode);
  const K = 3; // 3 거래일 후
  if (!rs || rs.length < 7 + K + 3) { // 검증 표본(최소 3) 부족 → 보류
    const res = { real: !!rs, samples: rs ? Math.max(0, rs.length - 7 - K) : 0, insufficient: true };
    _btCache[itemCode] = res; return res;
  }
  let absPctSum = 0, hit = 0, cnt = 0;
  for (let i = 6; i + K < rs.length; i++) {
    const slope = linregSlope(rs.slice(i - 6, i + 1));
    const cur = rs[i].v;
    const pred = cur * (1 + (slope / cur) * K);
    const actual = rs[i + K].v;
    absPctSum += Math.abs(pred - actual) / actual;
    if (Math.sign(pred - cur) === Math.sign(actual - cur)) hit++;
    cnt++;
  }
  const res = cnt < 3
    ? { real: true, samples: cnt, insufficient: true }
    : { real: true, samples: cnt, mape: Math.round((absPctSum / cnt) * 1000) / 10, hitRate: Math.round((hit / cnt) * 1000) / 10, naiveHit: 50.0, insufficient: false };
  _btCache[itemCode] = res;
  return res;
}

// ── 4) 가격 이상탐지: 오늘 전국 평균가의 z-score (30일 분포) ──────────────────
export function anomalies(dateStr = curDate()) {
  const out = [];
  for (const it of ITEMS) {
    const rs = realSeries(it.code);
    let series;
    if (rs && rs.length >= 10) series = rs.slice(0, -1).slice(-30).map(p => p.v); // 실 최근 분포(오늘 제외)
    else series = pastSeries(it.code, dateStr, 31).slice(0, 30).map(p => p.v);     // 합성 폴백
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

// ── 5) 출하 적기 예측: 향후 7일 중 실수령이 가장 높을 예상일 추천 ──────────────
// 일자별 가격승수 = 추세(forecast 회귀 기울기) × 요일패턴(실 27일 요일효과) 을 오늘 실수령에 적용,
// 기상(강수·고온) 등급하락 위험은 net 하향으로 별도 반영. 일요일=휴장 제외. 모델 기반(매매권유 아님).
const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

// 요일별 가격효과: 실 history(품목별 일별 전국평균)에서 요일평균/전체평균. 표본 부족 요일/품목은 중립(1).
const _dowCache = {};
function dowEffect(itemCode) {
  if (itemCode in _dowCache) return _dowCache[itemCode];
  let eff = null;
  const h = LIVE ? REAL.history?.[itemCode] : null;
  if (h && REAL.historyDates?.length) {
    const sums = {}, cnts = {};
    let tot = 0, totN = 0;
    for (const ds of REAL.historyDates) {
      const v = h[ds]; if (v == null) continue;
      const dow = new Date(ds + 'T00:00:00Z').getUTCDay();
      sums[dow] = (sums[dow] || 0) + v; cnts[dow] = (cnts[dow] || 0) + 1;
      tot += v; totN++;
    }
    if (totN >= 8) {
      const mean = tot / totN;
      eff = {};
      for (let d = 0; d < 7; d++) {
        // 표본 ≥2 요일만 반영, 소표본 과적합 방지 위해 ±10%로 클램프
        eff[d] = cnts[d] >= 2 ? Math.min(1.1, Math.max(0.9, (sums[d] / cnts[d]) / mean)) : 1;
      }
    }
  }
  _dowCache[itemCode] = eff;
  return eff;
}

// 기상 등급하락 위험 → 농가 실수령 하향 비율(음수). 시장가 추세(forecast)와 별개의 '내 물건 품질' 손실.
function weatherGradeRisk(w, it) {
  let p = 0;
  if (w.sumRn >= 25) p -= 0.05; else if (w.sumRn >= 15) p -= 0.025;
  if (w.tAnom >= 6) p -= 0.04; else if (w.tAnom >= 4) p -= 0.02;
  return Math.round(p * (it.weather || 1) * 1000) / 1000;
}
function weatherFlagOf(w) {
  if (w.sumRn >= 15) return { type: 'rain', icon: '🌧', text: `강수 ${w.sumRn}mm — 무름·등급하락 우려` };
  if (w.tAnom >= 4) return { type: 'heat', icon: '🌡', text: `평년比 +${w.tAnom}℃ 고온 — 신선도 저하 주의` };
  return null;
}

export function shipTiming({ itemCode, gradeCode = 'B', originName, qtyKg = 1000, dateStr = curDate() }) {
  const it = ITEM_BY_CODE[itemCode];
  if (!it) throw new Error('unknown item');
  // 오늘 기준 시장별 실수령(실데이터). 각 시장의 gross/수수료율/운송비 재사용.
  const base = routing({ itemCode, gradeCode, originName, qtyKg, dateStr });
  const baseRows = base.rows.map(r => ({
    market: r.market, marketCode: r.marketCode,
    gross: r.gross, feeRate: r.gross > 0 ? r.fee / r.gross : 0, transport: r.transport,
  }));
  const today = nationalAvg(itemCode, dateStr);
  // 추세: forecast와 동일하게 실 거래일 최근 7개(없으면 합성 45일) 회귀 기울기
  const rs = realSeries(itemCode);
  const trendPts = rs ? rs.slice(-7) : pastSeries(itemCode, dateStr, 45).slice(-7);
  const slope = linregSlope(trendPts);
  const dowEff = dowEffect(itemCode);
  const refDow = new Date(dateStr + 'T00:00:00Z').getUTCDay();
  const refDowFactor = dowEff ? (dowEff[refDow] || 1) : 1;

  const bestNetOnDay = (priceMult, gradeRisk) => {
    let best = null;
    for (const r of baseRows) {
      const grossD = r.gross * priceMult;
      const net = (grossD * (1 - r.feeRate) - r.transport) * (1 + gradeRisk);
      if (!best || net > best.net) best = { market: r.market, marketCode: r.marketCode, net };
    }
    return best;
  };

  const days = [];
  for (let off = 0; off <= 6; off++) {
    const d = new Date(new Date(dateStr + 'T00:00:00Z').getTime() + off * DAY);
    const ds = fmtDate(d);
    const dow = d.getUTCDay();
    if (dow === 0) { // 일요일 = 도매시장 휴장
      days.push({ date: ds, dow, dowName: DOW_KO[dow], closed: true, isToday: off === 0 });
      continue;
    }
    // 추세계수(선형, 7일 외삽 과대 방지 클램프) × 요일계수(오늘 요일 기준 상대) → 오늘 대비 가격승수
    const trendFactor = Math.min(1.15, Math.max(0.85, 1 + (slope / today) * off));
    const dowFactor = dowEff ? (dowEff[dow] || 1) / refDowFactor : 1;
    const priceMult = Math.min(1.25, Math.max(0.8, trendFactor * dowFactor));
    const w = weatherOf(ds);
    const gradeRisk = weatherGradeRisk(w, it);
    const best = bestNetOnDay(priceMult, gradeRisk);
    days.push({
      date: ds, dow, dowName: DOW_KO[dow], closed: false, isToday: off === 0,
      bestMarket: best.market, bestMarketCode: best.marketCode,
      net: Math.round(best.net), expectedNetPerKg: Math.round(best.net / qtyKg),
      priceForecast: Math.round(today * priceMult),
      priceMultPct: Math.round((priceMult - 1) * 1000) / 10,
      gradeRiskPct: Math.round(gradeRisk * 1000) / 10,
      weatherFlag: weatherFlagOf(w),
      weather: { avgTa: w.avgTa, tAnom: w.tAnom, sumRn: w.sumRn },
    });
  }
  const open = days.filter(d => !d.closed);
  const todayDay = open.find(d => d.isToday) || open[0];
  const rec = open.reduce((a, b) => (b.expectedNetPerKg > a.expectedNetPerKg ? b : a), open[0]);
  const gainVsToday = todayDay ? rec.net - todayDay.net : 0;
  const gainPct = todayDay && todayDay.net > 0 ? Math.round((gainVsToday / todayDay.net) * 1000) / 10 : 0;
  const recIsToday = rec.isToday;

  const note = recIsToday
    ? `추세·요일패턴상 향후 7일 내 오늘보다 나은 날이 없어 ‘오늘 출하’가 유리합니다. (모델 추정, 매매권유 아님)`
    : `${rec.dowName}요일(${rec.date})에 ‘${rec.bestMarket}’ 출하 시 오늘 대비 약 +${gainPct}%(${gainVsToday.toLocaleString()}원) 더 받을 것으로 추정됩니다. (모델 추정, 매매권유 아님)`;

  return {
    date: dateStr, item: it.name, itemCode, grade: GRADE_BY_CODE[gradeCode]?.name,
    origin: base.origin, qtyKg, today,
    days, recommendDate: rec.date, recommendDow: rec.dowName,
    recommendMarket: rec.bestMarket, recommendIsToday: recIsToday,
    gainVsTodayWon: gainVsToday, gainVsTodayPct: gainPct,
    real: !!rs, dowPattern: !!dowEff,
    backtest: shipTimingBacktest(itemCode),
    note,
    method: '추세(최근 실거래 회귀) × 요일패턴(실 거래일) × 기상 등급위험 → 시장별 실수령 재계산 후 최적일',
  };
}

// 출하적기 백테스트: 과거 윈도우마다 (당시 데이터만으로) 추천일을 정하고, 그날 실제가가 '당일 출하' 대비 이득이었는지.
// 정직성: 실 표본만, 부족하면 insufficient. 가격레벨 기준(운송비 상수 무관한 방향성).
const _stBtCache = {};
function shipTimingBacktest(itemCode) {
  if (itemCode in _stBtCache) return _stBtCache[itemCode];
  const rs = realSeries(itemCode);
  let res;
  if (!rs || rs.length < 12) {
    res = { real: !!rs, samples: 0, insufficient: true };
    _stBtCache[itemCode] = res; return res;
  }
  const dowEff = dowEffect(itemCode);
  const H = 5; // 향후 최대 5거래일 내 추천
  let hits = 0, cnt = 0, gainSum = 0, recWait = 0;
  for (let i = 6; i + 2 < rs.length; i++) {
    const slope = linregSlope(rs.slice(i - 6, i + 1));
    const today = rs[i].v;
    const refDow = new Date(rs[i].date + 'T00:00:00Z').getUTCDay();
    const refF = dowEff ? (dowEff[refDow] || 1) : 1;
    let bestPred = -Infinity, bestIdx = i;
    for (let j = i; j <= Math.min(i + H, rs.length - 1); j++) {
      const off = j - i;
      const dow = new Date(rs[j].date + 'T00:00:00Z').getUTCDay();
      const tf = Math.min(1.15, Math.max(0.85, 1 + (slope / today) * off));
      const df = dowEff ? (dowEff[dow] || 1) / refF : 1;
      const pred = today * Math.min(1.25, Math.max(0.8, tf * df));
      if (pred > bestPred) { bestPred = pred; bestIdx = j; }
    }
    const recActual = rs[bestIdx].v;
    if (bestIdx > i) recWait++;
    gainSum += (recActual - today) / today;
    if (recActual >= today) hits++;
    cnt++;
  }
  res = cnt < 5
    ? { real: true, samples: cnt, insufficient: true }
    : {
        real: true, samples: cnt, horizonDays: H, insufficient: false,
        hitRate: Math.round((hits / cnt) * 1000) / 10,        // 추천일 실제가 ≥ 당일가 비율
        avgGainPct: Math.round((gainSum / cnt) * 1000) / 10,  // 추천일 실현 평균 개선율(당일출하=0 대비)
        waitRate: Math.round((recWait / cnt) * 1000) / 10,    // '기다리라'고 한 비율
      };
  _stBtCache[itemCode] = res;
  return res;
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
