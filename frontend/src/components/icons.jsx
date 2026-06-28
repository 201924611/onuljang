// icons.jsx — 의존성 0 인라인 SVG 아이콘 세트
// 모두 24×24 viewBox, stroke="currentColor" strokeWidth="1.5"
// fill="none" strokeLinecap="round" strokeLinejoin="round"
import React from 'react';

const props = {
  width: 24, height: 24, viewBox: '0 0 24 24',
  fill: 'none', stroke: 'currentColor', strokeWidth: '1.5',
  strokeLinecap: 'round', strokeLinejoin: 'round',
  'aria-hidden': 'true',
};

export function TractorIcon({ size = 24, style, className }) {
  const p = { ...props, width: size, height: size, style, className };
  return (
    <svg {...p}>
      {/* 캐빈 */}
      <rect x="6" y="6" width="8" height="6" rx="1" />
      {/* 차체 */}
      <path d="M3 12h15l1 3H3z" />
      {/* 뒷바퀴 큰 것 */}
      <circle cx="7" cy="17" r="3" />
      {/* 앞바퀴 작은 것 */}
      <circle cx="17" cy="17.5" r="2" />
      {/* 배기관 */}
      <line x1="14" y1="6" x2="14" y2="4" />
    </svg>
  );
}

export function CartIcon({ size = 24, style, className }) {
  const p = { ...props, width: size, height: size, style, className };
  return (
    <svg {...p}>
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 01-8 0" />
    </svg>
  );
}

export function GovernmentIcon({ size = 24, style, className }) {
  const p = { ...props, width: size, height: size, style, className };
  return (
    <svg {...p}>
      <line x1="3" y1="22" x2="21" y2="22" />
      <line x1="3" y1="11" x2="21" y2="11" />
      <polyline points="3 7 12 2 21 7" />
      <line x1="5" y1="11" x2="5" y2="22" />
      <line x1="9" y1="11" x2="9" y2="22" />
      <line x1="15" y1="11" x2="15" y2="22" />
      <line x1="19" y1="11" x2="19" y2="22" />
    </svg>
  );
}

export function RobotIcon({ size = 24, style, className }) {
  const p = { ...props, width: size, height: size, style, className };
  return (
    <svg {...p}>
      {/* 안테나 */}
      <line x1="12" y1="2" x2="12" y2="5" />
      <circle cx="12" cy="2" r="1" fill="currentColor" stroke="none" />
      {/* 머리 */}
      <rect x="4" y="5" width="16" height="12" rx="2" />
      {/* 눈 */}
      <circle cx="9" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="1.5" fill="currentColor" stroke="none" />
      {/* 입 */}
      <path d="M9 14h6" />
      {/* 몸통 연결 */}
      <path d="M8 17v2a1 1 0 001 1h6a1 1 0 001-1v-2" />
    </svg>
  );
}

export function AlertIcon({ size = 24, style, className }) {
  const p = { ...props, width: size, height: size, style, className };
  return (
    <svg {...p}>
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function InfoIcon({ size = 24, style, className }) {
  const p = { ...props, width: size, height: size, style, className };
  return (
    <svg {...p}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="8.01" />
      <line x1="12" y1="12" x2="12" y2="16" />
    </svg>
  );
}

export function ArrowUpIcon({ size = 20, style, className }) {
  const p = { ...props, width: size, height: size, style, className };
  return (
    <svg {...p}>
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

export function ArrowDownIcon({ size = 20, style, className }) {
  const p = { ...props, width: size, height: size, style, className };
  return (
    <svg {...p}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  );
}

export function EqualIcon({ size = 20, style, className }) {
  const p = { ...props, width: size, height: size, style, className };
  return (
    <svg {...p}>
      <line x1="5" y1="9" x2="19" y2="9" />
      <line x1="5" y1="15" x2="19" y2="15" />
    </svg>
  );
}

export function RouteIcon({ size = 24, style, className }) {
  const p = { ...props, width: size, height: size, style, className };
  return (
    <svg {...p}>
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="5" r="2" />
      <path d="M12 19h4.5a3.5 3.5 0 000-7h-8a3.5 3.5 0 010-7H12" />
    </svg>
  );
}

export function SparkIcon({ size = 24, style, className }) {
  const p = { ...props, width: size, height: size, style, className };
  return (
    <svg {...p}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

export function LogoMark({ size = 28, style, className }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 28 28"
      fill="none" xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true" style={style} className={className}
    >
      {/* 외곽 원 */}
      <circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="1.8" />
      {/* 내부 잎사귀 두 개 — 농업 심볼 */}
      <path
        d="M14 20 C10 20 7 17 7 13 C7 9 10 7 14 7"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
      />
      <path
        d="M14 8 C18 8 21 11 21 15 C21 19 18 21 14 21"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
      />
      {/* 중심 세로선 */}
      <line x1="14" y1="7" x2="14" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 16, style, className }) {
  const p = { ...props, width: size, height: size, style, className };
  return (
    <svg {...p}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
