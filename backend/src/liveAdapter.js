// liveAdapter.js — 도매 API 직접 호출용 선택적 어댑터 (스텁)
// ─────────────────────────────────────────────────────────────────────────────
// 참고: 앱의 실데이터는 이미 refreshData.mjs 가 공공데이터포털 API를 호출해 SQLite에 적재하고
//   store.js/realsnap.js 로 런타임에 공급한다(주 경로, 가동 중 · 27거래일). 이 어댑터는 DB 적재 없이
//   요청 시 도매 API를 직접 호출하고 싶을 때 쓰는 대안 스텁이다(응답 스키마 매핑 TODO).
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
