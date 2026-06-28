// realsnap.js — 실 공공데이터 스냅샷 로더(있으면 실데이터, 없으면 합성 폴백)
// data/realsnapshot.json 은 buildSnapshot.mjs 가 공공데이터포털 API로 생성한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const SNAP_PATH = path.join(__dir, '..', 'data', 'realsnapshot.json');

let REAL = null;
try {
  if (fs.existsSync(SNAP_PATH)) {
    REAL = JSON.parse(fs.readFileSync(SNAP_PATH, 'utf-8'));
  }
} catch (e) {
  REAL = null;
}

export { REAL };
export const LIVE = Boolean(REAL && REAL.prices);
