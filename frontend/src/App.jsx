import React, { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import FarmerView from './views/FarmerView.jsx';
import ConsumerView from './views/ConsumerView.jsx';
import { isLive } from './api.js';

export default function App() {
  const [mode, setMode] = useState('farmer');
  const [live, setLive] = useState(false);

  useEffect(() => { isLive().then(setLive); }, []);

  return (
    <div className="app-shell">
      <Sidebar mode={mode} setMode={setMode} live={live} />
      <div className="main-area">
        <div className="main-content">
          {mode === 'farmer' ? <FarmerView /> : <ConsumerView />}
        </div>
      </div>
    </div>
  );
}
