import React from 'react';
import { LogoMark, TractorIcon, CartIcon } from './icons.jsx';
import { refDate } from '../api.js';

export default function Sidebar({ mode, setMode, live }) {
  return (
    <aside className="sidebar" role="navigation" aria-label="메인 내비게이션">
      {/* 브랜드 로고 */}
      <div className="sidebar-logo">
        <LogoMark size={28} className="sidebar-logo-mark" />
        <div className="sidebar-wordmark">
          <span className="sidebar-wordmark-ko">오늘장</span>
          <span className="sidebar-wordmark-sub">도매시장 가격 코파일럿</span>
        </div>
      </div>

      {/* 모드 내비 */}
      <div className="sidebar-section-label">모드</div>
      <nav className="sidebar-nav">
        <button
          className={`sidebar-nav-btn${mode === 'farmer' ? ' active' : ''}`}
          onClick={() => setMode('farmer')}
          aria-current={mode === 'farmer' ? 'page' : undefined}
        >
          <TractorIcon size={20} />
          농가 출하 최적화
        </button>
        <button
          className={`sidebar-nav-btn${mode === 'consumer' ? ' active' : ''}`}
          onClick={() => setMode('consumer')}
          aria-current={mode === 'consumer' ? 'page' : undefined}
        >
          <CartIcon size={20} />
          소비자 구매 신호
        </button>
      </nav>

      {/* 기준일 + 라이브 상태 */}
      <div className="sidebar-meta">
        <div className="sidebar-meta-row">
          <i className={`sidebar-live-dot${live ? '' : ' offline'}`} />
          {live ? '실시간 연결' : '스냅샷 모드'}
        </div>
        <div className="sidebar-meta-row" style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-11)' }}>
          기준일&nbsp;{refDate}
        </div>
      </div>

      {/* 출처 푸터 */}
      <div className="sidebar-footer">
        <a
          className="sidebar-footer-link"
          href="https://www.data.go.kr/data/15141808/openapi.do"
          target="_blank" rel="noreferrer"
        >
          전국 공영도매시장 실시간 경매정보 (aT)
        </a>
        <a
          className="sidebar-footer-link"
          href="https://www.data.go.kr/data/15059093/openapi.do"
          target="_blank" rel="noreferrer"
        >
          기상청 ASOS 일자료
        </a>
        <span className="sidebar-footer-note">
          경락가는 전국 공영도매시장 실시간 경매정보(15141808), 기상은 기상청 ASOS(15059093) 실측. 제철 외 일부 품목은 모델 추정.
        </span>
        <span className="sidebar-footer-note">
          농림축산식품부·농촌진흥청 「제11회 농업·농촌 공공데이터+AI 창업경진대회」
        </span>
      </div>
    </aside>
  );
}
