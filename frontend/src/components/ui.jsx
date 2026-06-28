import React from 'react';
import { InfoIcon } from './icons.jsx';

/* ── 포맷터 ─────────────────────────────────────── */
export const won = n => (n == null ? '–' : Math.round(n).toLocaleString('ko-KR'));
export const wonU = (n, u) => `${won(n)}원/${u}`;
export const pct = n => `${n > 0 ? '+' : ''}${n}%`;

/* ── Card ───────────────────────────────────────── */
export function Card({ title, hint, children, style, headerRight }) {
  return (
    <section className="card" style={style}>
      {title && (
        <div className="card-h">
          <h3>{title}</h3>
          {headerRight && <div style={{ marginLeft: 'auto' }}>{headerRight}</div>}
          {hint && !headerRight && <span className="hint">{hint}</span>}
        </div>
      )}
      <div className="card-b">{children}</div>
    </section>
  );
}

/* ── Stat ───────────────────────────────────────── */
export function Stat({ k, v, unit, d, tone, style }) {
  return (
    <div className="card stat" style={style}>
      <div className="k">{k}</div>
      <div className="v" style={tone ? { color: tone } : null}>
        {v}{unit && <small>{unit}</small>}
      </div>
      {d && <div className="d">{d}</div>}
    </div>
  );
}

/* ── Badge ──────────────────────────────────────── */
// variant: 'cheap' | 'pricey' | 'normal' | 'warn'
export function Badge({ variant = 'normal', icon, children }) {
  return (
    <span className={`badge badge-${variant}`}>
      {icon && <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>}
      {children}
    </span>
  );
}

/* ── DataLabel ──────────────────────────────────── */
// variant: 'cited' | 'assumed' | 'demo'
const DATA_LABEL_TEXT = {
  cited:   '출처 인용',
  assumed: '추정치',
  demo:    '합성 데이터',
};

export function DataLabel({ variant = 'demo', children }) {
  const label = children || DATA_LABEL_TEXT[variant] || variant;
  return (
    <span className={`data-label data-label-${variant}`}>
      <InfoIcon size={12} />
      {label}
    </span>
  );
}
