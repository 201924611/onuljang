// realsnap.js — 런타임 실데이터 접근(앱은 API 직접호출 없이 이 스냅샷만 읽음)
// store.loadSnapshot(): SQLite DB(주기 갱신) 우선, 없으면 번들 realsnapshot.json
import { loadSnapshot } from './store.js';

export let REAL = loadSnapshot();
export let LIVE = Boolean(REAL && REAL.prices && Object.keys(REAL.prices).length);

// 주기 갱신(refreshData) 후 메모리 재적재용
export function reloadReal() {
  REAL = loadSnapshot();
  LIVE = Boolean(REAL && REAL.prices && Object.keys(REAL.prices).length);
  return { live: LIVE, date: REAL?.date, backend: REAL?.backend };
}
