import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip, LabelList,
} from 'recharts';
import { Card, Stat, DataLabel, won } from '../components/ui.jsx';
import { RouteIcon, RobotIcon, InfoIcon } from '../components/icons.jsx';
import { meta, getRouting } from '../api.js';

const ICON_MAP = {
  route: <RouteIcon size={18} />,
  ai:    <RobotIcon size={18} />,
  info:  <InfoIcon size={18} />,
};

export default function FarmerView() {
  const [item, setItem]     = useState('0901');   // 배추
  const [grade, setGrade]   = useState('A');
  const [origin, setOrigin] = useState(meta.origins[0]);
  const [qty, setQty]       = useState(1000);
  const [data, setData]     = useState(null);

  useEffect(() => {
    let live = true;
    getRouting({ item, grade, origin, qty }).then(d => live && setData(d));
    return () => { live = false; };
  }, [item, grade, origin, qty]);

  const itemName = meta.items.find(i => i.code === item)?.name;
  const rows     = data?.rows || [];
  const chartData = rows.slice(0, 7).map((r, i) => ({
    ...r,
    label: r.market,
    fill: i === 0 ? 'var(--brand)' : 'var(--g-300)',
  }));

  return (
    <div>
      {/* 뷰 헤더 */}
      <div className="view-header">
        <h2 className="view-title">농가 출하 최적화</h2>
        <div className="view-header-badges">
          <DataLabel variant="cited">공공데이터 실측</DataLabel>
        </div>
      </div>

      {/* 입력 폼 */}
      <Card title="출하 조건" style={{ marginBottom: 'var(--sp-5)' }}>
        <div className="controls-row">
          <div className="field">
            <label>작목</label>
            <select value={item} onChange={e => setItem(e.target.value)}>
              {meta.items.map(i => <option key={i.code} value={i.code}>{i.cat} · {i.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>등급</label>
            <select value={grade} onChange={e => setGrade(e.target.value)}>
              {meta.grades.map(g => <option key={g.code} value={g.code}>{g.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>출하지</label>
            <select value={origin} onChange={e => setOrigin(e.target.value)}>
              {meta.origins.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="field">
            <label>출하량 (kg)</label>
            <input
              type="number" min="1" step="100" value={qty}
              onChange={e => setQty(Math.max(1, parseInt(e.target.value || '1', 10)))}
            />
          </div>
        </div>

        {/* 오프라인 배너 */}
        {data?._offline && (
          <div className="offline-banner" style={{ marginTop: 'var(--sp-3)', marginBottom: 0 }}>
            <InfoIcon size={16} />
            백엔드 미연결 — 번들 스냅샷(상/춘천/1000kg 기준)으로 표시 중. 서버 연결 시 입력값으로 실시간 계산됩니다.
          </div>
        )}
      </Card>

      {/* 비대칭 60/40 그리드 */}
      {data && (
        <div className="farmer-grid">
          {/* 좌측 60% — 라우팅 테이블 + 차트 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
            {/* 순수익 바차트 */}
            <Card title={`시장별 실수령 랭킹 (상위 7개)`} hint="운송비·수수료 차감 후 손에 쥐는 금액">
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 60, left: 4, bottom: 4 }}>
                    <XAxis
                      type="number"
                      tickFormatter={v => `${(v / 10000).toFixed(0)}만`}
                      tick={{ fontSize: 10, fill: 'var(--g-500)' }}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tick={{ fontSize: 11, fill: 'var(--g-600)' }}
                      width={70}
                    />
                    <Tooltip
                      formatter={v => [`${won(v)}원`, '실수령']}
                      labelStyle={{ fontWeight: 700 }}
                      contentStyle={{ borderRadius: 10, border: '1px solid var(--border)', fontSize: 12 }}
                    />
                    <Bar dataKey="net" radius={[0, 5, 5, 0]}>
                      {chartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                      <LabelList
                        dataKey="net"
                        position="right"
                        formatter={v => `${(v / 10000).toFixed(0)}만`}
                        style={{ fontSize: 10, fill: 'var(--g-500)' }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* 전체 시장 테이블 */}
            <Card title="전체 시장 비교표" hint="12개 시장 실수령 전체">
              <div style={{ overflowX: 'auto' }}>
                <table className="rt">
                  <thead>
                    <tr>
                      <th>도매시장</th>
                      <th>경락가</th>
                      <th>거리</th>
                      <th>운송·취급</th>
                      <th>수수료</th>
                      <th>실수령</th>
                      <th>kg당</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.marketCode} className={i === 0 ? 'best' : ''}>
                        <td>
                          <span className={`rank${i === 0 ? ' r1' : ''}`}>{i + 1}</span>
                          {r.market}
                          <span style={{ color: 'var(--g-500)', fontSize: 'var(--fs-11)' }}> · {r.region}</span>
                          {i === 0 && <span className="tag-best">추천</span>}
                        </td>
                        <td className="num">{won(r.price)}<span style={{ color: 'var(--g-500)' }}>/{r.unit}</span></td>
                        <td className="num">{r.distanceKm}km</td>
                        <td className="num">−{won(r.transport)}</td>
                        <td className="num">−{won(r.fee)}</td>
                        <td className="num net-pos">{won(r.net)}</td>
                        <td className="num">{won(r.netPerKg)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="spread-note">
                실수령 = 경락가×물량 − 도매수수료(시장별 5~7%) − 운송·취급비(거리×{data.rate}원/kg·100km + {data.handling}원/kg).
                최고-최하 스프레드: <b className="num">{data.spreadPct}%</b>.
                경락가·거래량: aT 공영도매시장 경매정보(15141808).
              </p>
            </Card>
          </div>

          {/* 우측 40% — KPI + 어드바이스 */}
          <div className="farmer-side">
            {/* KPI 3개 */}
            <Stat
              k="오늘의 추천 시장"
              v={data.best.market}
              d={`실수령 1위 · ${itemName} ${data.grade} ${won(qty)}kg`}
              tone="var(--brand)"
            />
            <Stat
              k="최적-최악 시장 격차"
              v={`${data.spreadPct}`}
              unit="%"
              d={`${won(data.best.net)}원 vs ${won(data.worst.net)}원`}
              tone="var(--pricey)"
            />
            <Stat
              k="관성 출하(가락) 대비 이득"
              v={`+${won(data.gainVsNaive)}`}
              unit="원"
              d={`${itemName} ${won(qty)}kg 1회 출하 기준`}
              tone={data.gainVsNaive > 0 ? 'var(--brand)' : 'var(--g-600)'}
            />

            {/* 어드바이스 */}
            {data.advice && data.advice.length > 0 && (
              <Card title="오늘의 출하 처방" hint="데이터 기반 행동 제안">
                <div className="advice-list">
                  {data.advice.map((a, i) => (
                    <div key={i} className={`advice-row ${a.type}`}>
                      {ICON_MAP[a.type] || ICON_MAP.info}
                      <span>{a.text}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
