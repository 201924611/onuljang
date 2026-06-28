// liveAdapter.js — 운영 전환용 라이브 데이터 어댑터 (스텁)
// ─────────────────────────────────────────────────────────────────────────────
// 사용법: 환경변수 DATA_GO_KR_KEY(공공데이터포털 발급키)를 설정하면
//   engine.js 의 priceOf/nationalAvg 가 합성 시계열 대신 아래 fetchLiveAuction() 를
//   호출하도록 라우팅하면 된다(코드 변경점은 engine의 데이터 소스 1곳뿐).
// 발급: data.go.kr 로그인 → '전국 공영도매시장 실시간 경매정보(15141808)' 활용신청(자동승인).

const KEY = process.env.DATA_GO_KR_KEY || '';
export const LIVE_ENABLED = Boolean(KEY);

// 전국 공영도매시장 실시간 경매정보 (15141808)
// 엔드포인트 예: http://apis.data.go.kr/B190001/...  (실제 오퍼레이션명은 신청 후 명세 참조)
export async function fetchLiveAuction({ itemCode, marketCode, date }) {
  if (!LIVE_ENABLED) throw new Error('DATA_GO_KR_KEY not set — using synthetic series');
  const url = new URL('http://apis.data.go.kr/B190001/whsalAuctionPriceService/getWhsalAuctionPrice');
  url.searchParams.set('serviceKey', KEY);
  url.searchParams.set('whsalCode', marketCode);
  url.searchParams.set('prdlstCode', itemCode);
  url.searchParams.set('saleDate', date.replaceAll('-', ''));
  url.searchParams.set('type', 'json');
  const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error('live api ' + r.status);
  const j = await r.json();
  // TODO: 신청 후 받은 실제 응답 스키마에 맞춰 매핑 (price/volume/grade)
  return normalize(j);
}

// 기상청 ASOS 일자료 (15059093)
export async function fetchAsosDaily({ stnId = '101', date }) {
  if (!LIVE_ENABLED) throw new Error('DATA_GO_KR_KEY not set');
  const url = new URL('http://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList');
  url.searchParams.set('serviceKey', KEY);
  url.searchParams.set('dataCd', 'ASOS');
  url.searchParams.set('dateCd', 'DAY');
  url.searchParams.set('stnIds', stnId);
  url.searchParams.set('startDt', date.replaceAll('-', ''));
  url.searchParams.set('endDt', date.replaceAll('-', ''));
  url.searchParams.set('dataType', 'JSON');
  const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error('asos ' + r.status);
  return await r.json();
}

function normalize(json) {
  // 자리표시자 — 실제 명세 확정 후 구현
  return json;
}
