import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine,
} from 'recharts';
import { Card, DataLabel, won } from '../components/ui.jsx';
import {
  ArrowDownIcon, ArrowUpIcon, EqualIcon,
  AlertIcon, RobotIcon, CartIcon, InfoIcon,
} from '../components/icons.jsx';
import { meta, getSignal, getAnomaly, getForecast } from '../api.js';

const STATUS = {
  cheap:  { label: '쌈',  Icon: ArrowDownIcon, tone: 'var(--cheap)' },
  pricey: { label: '비쌈', Icon: ArrowUpIcon,  tone: 'var(--pricey)' },
  normal: { label: '보통', Icon: EqualIcon,    tone: 'var(--normal)' },
};

export default function ConsumerView() {
  const [sig, setSig]   = useState(null);
  const [anom, setAnom] = useState(null);
  const [pick, setPick] = useState('0901');
  const [fc, setFc]     = useState(null);

  useEffect(() => { getSignal().then(setSig); getAnomaly().then(setAnom); }, []);
  useEffect(() => { getForecast(pick).then(setFc); }, [pick]);

  const items    = sig?.items || [];
  const basket   = [...items].sort((a, b) => a.devPct - b.devPct).slice(0, 5);
  const pickName = meta.items.find(i => i.code === pick)?.name;

  return (
    <div>
      {/* 뷰 헤더 */}
      <div className="view-header">
        <h2 className="view-title">소비자 구매 신호</h2>
        <div className="view-header-badges">
          <DataLabel variant="cited">공공데이터 실측</DataLabel>
          <DataLabel variant="assumed">AI 추정</DataLabel>
        </div>
      </div>

      {/* 신호 그리드 4열 */}
      <Card
        title="오늘의 장보기 신호등"
        hint="최근 기준 대비 가격 — 색만으로 판단 금지, 라벨·아이콘 병기"
        style={{ marginBottom: 'var(--sp-5)' }}
      >
        <div className="legend">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span className="legend-dot" style={{ background: 'var(--cheap)' }} />
            <ArrowDownIcon size={14} style={{ color: 'var(--cheap)' }} />
            쌈 (최근比 -8%↓) — 지금 사기 좋음
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span className="legend-dot" style={{ background: 'var(--normal)' }} />
            <EqualIcon size={14} style={{ color: 'var(--normal)' }} />
            보통
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span className="legend-dot" style={{ background: 'var(--pricey)' }} />
            <ArrowUpIcon size={14} style={{ color: 'var(--pricey)' }} />
            비쌈 (최근比 +8%↑) — 대체재 고려
          </span>
        </div>

        <div className="signal-grid">
          {items.map(it => {
            const s = STATUS[it.status] || STATUS.normal;
            const { Icon } = s;
            return (
              <button
                key={it.code}
                className={`signal-tile ${it.status}`}
                onClick={() => setPick(it.code)}
                aria-label={`${it.name} ${s.label} — 클릭하면 AI 전망 보기`}
              >
                <div className="tile-name">{it.name}</div>
                <div className="tile-price num">
                  {won(it.today)}<small> 원/{it.unit}</small>
                </div>
                <div className="tile-dev num">
                  <Icon size={14} />
                  {it.devPct > 0 ? '+' : ''}{it.devPct}%
                  <span style={{ color: 'var(--g-500)', fontWeight: 400, fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-11)' }}>&nbsp;vs 최근</span>
                </div>
                {it.status === 'pricey' && it.altInCat && (
                  <div className="tile-alt">대신 <b>{it.altInCat}</b> 추천</div>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* 하단 2열 */}
      <div className="consumer-bottom">
        {/* AI 단기 전망 */}
        <Card
          title={`AI 단기 전망 · ${pickName || '—'}`}
          hint="베타 — 백테스트 정확도 동반 공개"
          headerRight={<DataLabel variant="assumed">AI 추정</DataLabel>}
        >
          {fc ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap', marginBottom: 'var(--sp-3)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--fs-12)', color: 'var(--g-600)' }}>
                  <RobotIcon size={16} style={{ color: 'var(--info)' }} />
                  seasonal + 기상 경량모델
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--fs-12)', color: 'var(--g-600)' }}>
                  {fc.direction > 0
                    ? <ArrowUpIcon size={14} style={{ color: 'var(--pricey)' }} />
                    : fc.direction < 0
                      ? <ArrowDownIcon size={14} style={{ color: 'var(--cheap)' }} />
                      : <EqualIcon size={14} style={{ color: 'var(--normal)' }} />
                  }
                  3일 {fc.direction > 0 ? '상승' : fc.direction < 0 ? '하락' : '보합'}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--fs-12)', color: 'var(--g-700)' }}>
                  예측 {won(fc.pred3)}원
                </span>
              </div>

              <div style={{ width: '100%', height: 180 }}>
                <ResponsiveContainer>
                  <LineChart data={fc.path} margin={{ top: 8, right: 14, left: 4, bottom: 4 }}>
                    <XAxis
                      dataKey="date"
                      tickFormatter={d => d.slice(5)}
                      tick={{ fontSize: 10, fill: 'var(--g-500)' }}
                    />
                    <YAxis
                      tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                      tick={{ fontSize: 10, fill: 'var(--g-500)' }}
                      width={34}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      formatter={v => [`${won(v)}원`, '예측가']}
                      contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid var(--border)' }}
                    />
                    <ReferenceLine
                      y={fc.today}
                      stroke="var(--g-300)"
                      strokeDasharray="4 4"
                      label={{ value: '오늘', fontSize: 10, fill: 'var(--g-500)', position: 'left' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="pred"
                      stroke="var(--brand)"
                      strokeWidth={2.4}
                      dot={{ r: 2.5, fill: 'var(--brand)' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="bt-row">
                <span className="bt-item">방향 적중률 <b className="num">{fc.backtest.hitRate}%</b> <span style={{ color: 'var(--g-500)' }}>(naive 50%)</span></span>
                <span className="bt-item">MAPE <b className="num">{fc.backtest.mape}%</b></span>
                <span className="bt-item">검증표본 <b className="num">{fc.backtest.samples}</b></span>
              </div>
              <p style={{ color: 'var(--g-500)', fontSize: 'var(--fs-12)', marginTop: 'var(--sp-2)' }}>
                ※ 과거 {fc.backtest.samples}개 시점 백테스트 정확도를 함께 공개합니다. 투자·매매 권유 아님(참고용).
              </p>
            </>
          ) : (
            <p style={{ color: 'var(--g-500)', fontSize: 'var(--fs-13)' }}>
              신호등에서 품목을 선택하면 AI 단기 전망을 표시합니다.
            </p>
          )}
        </Card>

        {/* 오른쪽 — 이상탐지 + 알뜰 장바구니 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
          {/* 이상탐지 */}
          {anom && anom.items.length > 0 && (
            <Card
              title="AI 가격 이상 감지"
              hint={`평소(30일) 분포 대비 ±2.2σ 이탈 · ${anom.count}건`}
              headerRight={<DataLabel variant="cited">공공데이터 실측</DataLabel>}
            >
              <div className="anomaly-list">
                {anom.items.map(a => (
                  <div key={a.code} className={`anomaly-item ${a.dir}`}>
                    <AlertIcon size={16} />
                    <span>{a.name} {a.dir === 'surge' ? '급등' : '급락'}</span>
                    <span className="num" style={{ marginLeft: 'auto' }}>
                      ({a.z > 0 ? '+' : ''}{a.z}σ)
                    </span>
                  </div>
                ))}
              </div>
              <p style={{ color: 'var(--g-500)', fontSize: 'var(--fs-12)', marginTop: 'var(--sp-3)' }}>
                z점수 기반 이상탐지. 급락은 매수 기회, 급등은 대체재 검토 신호.
              </p>
            </Card>
          )}

          {/* 알뜰 장바구니 */}
          <Card
            title="오늘의 알뜰 장바구니"
            hint="최근比 가장 저렴한 5품목"
            headerRight={
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--brand)', fontSize: 'var(--fs-13)' }}>
                <CartIcon size={16} />
              </span>
            }
          >
            <div className="basket-list">
              {basket.map((b, i) => (
                <div key={b.code} className="basket-item">
                  <span className="basket-rank">{i + 1}</span>
                  <span style={{ flex: 1, fontWeight: 600, fontSize: 'var(--fs-13)' }}>
                    {b.name}
                    <span style={{ color: 'var(--g-500)', fontWeight: 400, fontSize: 'var(--fs-11)', marginLeft: 4 }}>{b.cat}</span>
                  </span>
                  <span className="basket-price num">{won(b.today)}원/{b.unit}</span>
                  <span className="basket-dev num">{b.devPct}%</span>
                </div>
              ))}
            </div>
            <p style={{ color: 'var(--g-500)', fontSize: 'var(--fs-12)', marginTop: 'var(--sp-3)' }}>
              기준선 = 최근 영업일 전국 평균(실 경매). 데이터: 전국 공영도매시장 실시간 경매정보(15141808).
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
