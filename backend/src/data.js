// data.js — 도매시장·작목 마스터 데이터 + 합성 폴백 가격 생성기
// ───────────────────────────────────────────────────────────────────────────
// ⚠ 데이터 출처/성격 안내(정직성):
//  - 시장 코드/명칭/위치, 품목 분류는 aT 공영도매시장·KAMIS 분류 체계와 호환되도록 구성한 마스터다.
//  - 앱의 주(主) 데이터는 실 공공데이터다: refreshData.mjs 가 전국 공영도매시장 실시간 경매정보
//    (data.go.kr/data/15141808)와 기상청 ASOS(15059093)를 SQLite(backend/data/onuljang.db)에 적재하고,
//    런타임은 store.js→realsnap.js 로 그 실데이터를 읽는다(현재 27거래일 적재).
//  - 이 파일의 가격 생성기(synPrice 등)는 키·DB가 없거나 제철 외(실데이터 미보유) 품목을 위한
//    "결정론적 합성 폴백"이다. 화면에서 모델 부분은 "AI 추정(모델)"로 표기한다.
//  - 실연동: 경매(15141808)·ASOS(15059093). 확장 예정(현 미연동): 경락가격 표준데이터(15029181, 장기 백필)·
//    주요 채소류 일일가격(15087352, 소매가 비교). src/liveAdapter.js 는 도매 API 직접호출용 선택적 스텁.

// 전국 공영도매시장(주요 12개 — 실제 명칭/소재지/좌표) ───────────────────────
export const MARKETS = [
  { code: '110001', name: '서울 가락',   region: '서울 송파', lat: 37.4952, lon: 127.1213, feeRate: 0.07, biasPct: +6 },
  { code: '110008', name: '서울 강서',   region: '서울 강서', lat: 37.5610, lon: 126.8130, feeRate: 0.07, biasPct: +2 },
  { code: '210001', name: '구리',        region: '경기 구리', lat: 37.5944, lon: 127.1400, feeRate: 0.06, biasPct: -3 },
  { code: '210005', name: '안양',        region: '경기 안양', lat: 37.4017, lon: 126.9220, feeRate: 0.06, biasPct: -1 },
  { code: '210008', name: '수원',        region: '경기 수원', lat: 37.2750, lon: 127.0100, feeRate: 0.06, biasPct: -2 },
  { code: '230001', name: '인천 남촌',   region: '인천 남동', lat: 37.4290, lon: 126.7340, feeRate: 0.06, biasPct: -1 },
  { code: '310101', name: '대전 오정',   region: '대전 대덕', lat: 36.3650, lon: 127.4340, feeRate: 0.06, biasPct: -4 },
  { code: '320101', name: '청주',        region: '충북 청주', lat: 36.6280, lon: 127.4700, feeRate: 0.05, biasPct: -5 },
  { code: '410101', name: '대구 북부',   region: '대구 북구', lat: 35.9060, lon: 128.5450, feeRate: 0.06, biasPct: -3 },
  { code: '420101', name: '부산 엄궁',   region: '부산 사상', lat: 35.1550, lon: 128.9650, feeRate: 0.06, biasPct: -2 },
  { code: '430101', name: '광주 각화',   region: '광주 북구', lat: 35.1840, lon: 126.9270, feeRate: 0.05, biasPct: -6 },
  { code: '510101', name: '춘천',        region: '강원 춘천', lat: 37.8810, lon: 127.7300, feeRate: 0.05, biasPct: -4 },
];

// 작목 마스터 (부류·품목·등급·단위·기준가·계절성) ───────────────────────────
// basePrice: 원/단위(중품 평년 기준). peakDoY: 가격이 비싼(공급↓) 연중 일수(계절성 위상)
export const ITEMS = [
  // 엽근채소
  { code: '0901', cat: '엽근채소', name: '배추',   unit: '포기', basePrice: 1800,  peakDoY: 60,  volat: 0.42, weather: 1.0 },
  { code: '0902', cat: '엽근채소', name: '무',     unit: '개',   basePrice: 1500,  peakDoY: 75,  volat: 0.40, weather: 1.0 },
  { code: '0903', cat: '엽근채소', name: '양배추', unit: '포기', basePrice: 2400,  peakDoY: 70,  volat: 0.34, weather: 0.9 },
  { code: '0904', cat: '엽근채소', name: '당근',   unit: 'kg',   basePrice: 2600,  peakDoY: 120, volat: 0.30, weather: 0.8 },
  { code: '0905', cat: '엽근채소', name: '감자',   unit: 'kg',   basePrice: 2900,  peakDoY: 150, volat: 0.26, weather: 0.7 },
  // 조미채소
  { code: '1101', cat: '조미채소', name: '양파',   unit: 'kg',   basePrice: 1600,  peakDoY: 200, volat: 0.38, weather: 0.8 },
  { code: '1102', cat: '조미채소', name: '대파',   unit: 'kg',   basePrice: 3200,  peakDoY: 50,  volat: 0.48, weather: 1.1 },
  { code: '1103', cat: '조미채소', name: '마늘',   unit: 'kg',   basePrice: 8500,  peakDoY: 250, volat: 0.24, weather: 0.6 },
  { code: '1104', cat: '조미채소', name: '건고추', unit: 'kg',   basePrice: 15000, peakDoY: 300, volat: 0.30, weather: 0.7 },
  // 과채
  { code: '1201', cat: '과채',     name: '토마토', unit: 'kg',   basePrice: 3800,  peakDoY: 20,  volat: 0.36, weather: 1.0 },
  { code: '1202', cat: '과채',     name: '오이',   unit: '개',   basePrice: 700,   peakDoY: 15,  volat: 0.44, weather: 1.1 },
  { code: '1203', cat: '과채',     name: '애호박', unit: '개',   basePrice: 1300,  peakDoY: 25,  volat: 0.46, weather: 1.1 },
  { code: '1204', cat: '과채',     name: '청양고추', unit: 'kg', basePrice: 9000,  peakDoY: 30,  volat: 0.50, weather: 1.2 },
  { code: '1205', cat: '과채',     name: '딸기',   unit: 'kg',   basePrice: 12000, peakDoY: 220, volat: 0.40, weather: 0.9 },
  // 과일
  { code: '1301', cat: '과일',     name: '사과',   unit: 'kg',   basePrice: 4200,  peakDoY: 240, volat: 0.34, weather: 0.8 },
  { code: '1302', cat: '과일',     name: '배',     unit: 'kg',   basePrice: 3800,  peakDoY: 230, volat: 0.32, weather: 0.8 },
  { code: '1303', cat: '과일',     name: '감귤',   unit: 'kg',   basePrice: 3300,  peakDoY: 170, volat: 0.30, weather: 0.7 },
  { code: '1304', cat: '과일',     name: '포도',   unit: 'kg',   basePrice: 6500,  peakDoY: 60,  volat: 0.30, weather: 0.7 },
];

// 등급(특/상/보통/하) 가격 배수 ─────────────────────────────────────────────
export const GRADES = [
  { code: 'S', name: '특', mult: 1.28 },
  { code: 'A', name: '상', mult: 1.10 },
  { code: 'B', name: '보통', mult: 1.0 },
  { code: 'C', name: '하', mult: 0.82 },
];

// 출하지(시·도) 좌표 — 농가 운송비 계산용 ──────────────────────────────────
export const ORIGINS = [
  { name: '강원 춘천', lat: 37.8810, lon: 127.7300 },
  { name: '강원 평창', lat: 37.3705, lon: 128.3900 },
  { name: '경기 이천', lat: 37.2720, lon: 127.4350 },
  { name: '충북 괴산', lat: 36.8150, lon: 127.7870 },
  { name: '충남 부여', lat: 36.2750, lon: 126.9100 },
  { name: '전북 김제', lat: 35.8030, lon: 126.8810 },
  { name: '전남 해남', lat: 34.5730, lon: 126.5990 },
  { name: '전남 나주', lat: 35.0160, lon: 126.7110 },
  { name: '경북 영주', lat: 36.8060, lon: 128.6240 },
  { name: '경북 안동', lat: 36.5680, lon: 128.7290 },
  { name: '경남 진주', lat: 35.1800, lon: 128.1080 },
  { name: '제주 서귀포', lat: 33.2540, lon: 126.5600 },
];

// ── 결정론적 의사난수 (seed 문자열 → [0,1)) : 데모 재현성 보장 ──────────────
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
export function rand(seedStr) {
  // mulberry32
  let a = hashSeed(seedStr);
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
// 표준정규 근사(Box-Muller, 시드 2개)
export function randn(seedStr) {
  const u1 = Math.max(1e-9, rand(seedStr + ':u1'));
  const u2 = rand(seedStr + ':u2');
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// haversine 거리(km)
export function distanceKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export const ITEM_BY_CODE = Object.fromEntries(ITEMS.map(i => [i.code, i]));
export const MARKET_BY_CODE = Object.fromEntries(MARKETS.map(m => [m.code, m]));
export const GRADE_BY_CODE = Object.fromEntries(GRADES.map(g => [g.code, g]));
