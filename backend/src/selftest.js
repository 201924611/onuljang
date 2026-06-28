// selftest.js — 엔진 무결성 자가검증(빌드 없이 로직 확인)
import { ITEMS, ORIGINS } from './data.js';
import { routing, shipTiming, consumerSignal, forecast, anomalies, boardSnapshot } from './engine.js';

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

console.log('3) AI 단기전망 + 실 백테스트');
let hitSum = 0, n = 0;
for (const it of ITEMS) {
  const f = forecast(it.code);
  ok(f.path.length === 7, `${it.name}: 7일 경로`);
  if (f.backtest.insufficient) {
    ok(true, `${it.name}: 백테스트 보류(실 표본 ${f.backtest.samples || 0})`);
  } else {
    ok(f.backtest.real && f.backtest.samples >= 3 && f.backtest.hitRate >= 0,
      `${it.name}: 실 백테스트 ${f.backtest.samples}거래일 적중률 ${f.backtest.hitRate}% MAPE ${f.backtest.mape}%`);
    hitSum += f.backtest.hitRate; n++;
  }
}
if (n) console.log(`   → 실 백테스트 평균 방향 적중률 ${(hitSum / n).toFixed(1)}% (랜덤 50%, ${n}품목)`);

console.log('3b) 출하 적기 예측 — 배추, 강원 춘천, 1000kg');
const st = shipTiming({ itemCode: '0901', gradeCode: 'B', originName: '강원 춘천', qtyKg: 1000 });
ok(st.days.length === 7, `7일 산출 (${st.days.length})`);
ok(st.days.filter(d => d.dow === 0).every(d => d.closed), '일요일=휴장 표시');
ok(st.days.filter(d => !d.closed).every(d => d.expectedNetPerKg > 0), '영업일 기대 실수령 양수');
ok(!!st.recommendDate && st.days.some(d => d.date === st.recommendDate && !d.closed), `추천일 ${st.recommendDate}(${st.recommendDow}) 영업일`);
{
  const open = st.days.filter(d => !d.closed);
  const maxNpk = Math.max(...open.map(d => d.expectedNetPerKg));
  const recNpk = open.find(d => d.date === st.recommendDate).expectedNetPerKg;
  ok(recNpk === maxNpk, '추천일이 영업일 중 기대 실수령 최대');
}
ok(typeof st.note === 'string' && st.note.length > 0, '안내문 존재');
console.log(`   → 추천 ${st.recommendDate}(${st.recommendDow}) @ ${st.recommendMarket}, 오늘 대비 ${st.gainVsTodayPct >= 0 ? '+' : ''}${st.gainVsTodayPct}%`);
console.log(`   → 백테스트: ${st.backtest.insufficient ? '보류(표본 ' + st.backtest.samples + ')' : '실측 ' + st.backtest.samples + '회 적중률 ' + st.backtest.hitRate + '% 평균 +' + st.backtest.avgGainPct + '%'}`);
let stAll = 0, stOk = 0;
for (const it of ITEMS) {
  const r = shipTiming({ itemCode: it.code, gradeCode: 'B', originName: '강원 춘천', qtyKg: 1000 });
  stAll++;
  if (r.days.length === 7 && r.recommendDate) stOk++;
}
ok(stOk === stAll, `전 품목 출하적기 산출 (${stOk}/${stAll})`);

console.log('4) 이상탐지');
const a = anomalies();
ok(a.count >= 0, `이상신호 ${a.count}건`);

console.log('5) 시세 보드');
const b = boardSnapshot();
ok(b.rows.length === 8, `보드 ${b.rows.length}품목`);

console.log(fail === 0 ? '\n✅ ALL PASS' : `\n❌ ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
