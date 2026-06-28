// api.js — 백엔드(라이브) 우선, 실패 시 번들 스냅샷(sample.json) 폴백
import sample from './sample.json';

const BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8091';

let LIVE = null; // null=미확인, true/false
async function ping() {
  if (LIVE !== null) return LIVE;
  try {
    const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1200) });
    LIVE = r.ok;
  } catch { LIVE = false; }
  return LIVE;
}

async function get(path) {
  try {
    const r = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) throw new Error('bad');
    return await r.json();
  } catch { throw new Error('offline'); }
}

export async function isLive() { return ping(); }
export const refDate = sample.refDate;
export const meta = sample.meta;

export async function getSignal() {
  if (await ping()) { try { return await get('/api/signal'); } catch {} }
  return sample.signal;
}
export async function getAnomaly() {
  if (await ping()) { try { return await get('/api/anomaly'); } catch {} }
  return sample.anomaly;
}
export async function getBoard() {
  if (await ping()) { try { return await get('/api/board'); } catch {} }
  return sample.board;
}
export async function getForecast(item) {
  if (await ping()) { try { return await get(`/api/forecast?item=${item}`); } catch {} }
  return sample.forecasts[item];
}
export async function getRouting({ item, grade = 'A', origin, qty = 1000 }) {
  if (await ping()) {
    try { return await get(`/api/routing?item=${item}&grade=${grade}&origin=${encodeURIComponent(origin)}&qty=${qty}`); } catch {}
  }
  // 오프라인 폴백: 기본(상/춘천/1000kg) 라우팅 사용 + 안내
  const base = sample.routingByItem[item];
  return { ...base, _offline: true };
}
