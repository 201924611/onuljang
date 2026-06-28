// selftest.js — 엔진 무결성 자가검증(빌드 없이 로직 확인)
import { ITEMS, ORIGINS } from './data.js';
import { routing, consumerSignal, forecast, anomalies, boardSnapshot } from './engine.js';

let fail = 0;
const ok = (c, m) => { if (!c) { console.error('  ✗', m); fail++; } else console.log('  ✓', m); };

console.log('1) 라우팅(실수령 랭킹) — 배추, 강원 춘천, 1000kg');
const r = routing({ itemCode: '0901', gradeCode: 'A', originName: '강원 춘천', qtyKg: 1000 });
ok(r.rows.length === 12, `시장 12개 비교 (${r.rows.length})`);
ok(r.rows.every((x, i, a) => i === 0 || a[i - 1].net >= x.net), '실수령 내림차순 정렬');
ok(r.best.net > r.worst.net, `best>worst (${r.best.net} > ${r.worst.net})`);
ok(r.spreadPct > 0, `시장간 실수령 격차 ${r.spreadPct}%`);
ok(Array.isArray(r.advice) && r.advice.length >= 1, `처방 메시지 ${r.advice.length}개`);
console.log(`   → 추천 ${r.best.market}, 늘가던시장 대비 +${r.gainVsNaive.toLocaleString()}원 (${r.gainPct}%)`);

console.log('2) 소비자 신호등');
const s = consumerSignal();
ok(s.items.length === ITEMS.length, `품목 ${s.items.length}개`);
ok(s.items.every(i => ['cheap', 'normal', 'pricey'].includes(i.status)), '상태값 유효');
const cheap = s.items.filter(i => i.status === 'cheap').length;
const pricey = s.items.filter(i => i.status === 'pricey').length;
console.log(`   → 쌈 ${cheap} / 비쌈 ${pricey} / 보통 ${s.items.length - cheap - pricey}`);

console.log('3) AI 단기전망 + 백테스트');
let hitSum = 0, n = 0;
for (const it of ITEMS) {
  const f = forecast(it.code);
  ok(f.path.length === 7, `${it.name}: 7일 경로`);
  ok(f.backtest.samples > 30, `${it.name}: 백테스트 ${f.backtest.samples}샘플 적중률 ${f.backtest.hitRate}% MAPE ${f.backtest.mape}%`);
  hitSum += f.backtest.hitRate; n++;
}
console.log(`   → 평균 방향 적중률 ${(hitSum / n).toFixed(1)}% (naive 50%)`);

console.log('4) 이상탐지');
const a = anomalies();
ok(a.count >= 0, `이상신호 ${a.count}건`);

console.log('5) 시세 보드');
const b = boardSnapshot();
ok(b.rows.length === 8, `보드 ${b.rows.length}품목`);

console.log(fail === 0 ? '\n✅ ALL PASS' : `\n❌ ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
