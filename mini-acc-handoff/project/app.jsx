/* HJ Account AI — App shell */
(function() {
const { useState, useEffect } = React;
const Icon = window.Icon;

function App() {
  const [page, setPage] = useState('dashboard');
  const [theme, setTheme] = useState(() => localStorage.getItem('hj-theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('hj-theme', theme);
  }, [theme]);

  const PageCmp = (window.PAGES[page] || window.PAGES.dashboard).cmp;
  const pageTitle = (window.PAGES[page] || window.PAGES.dashboard).title;

  return (
    <div className="app">
      <div className="ambient"/>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">SN</div>
          <div>
            <div className="brand-name">HJ Account AI</div>
            <div className="brand-sub">หจก. โซลูชั่น เนกซ์เจน</div>
          </div>
        </div>
        {window.HJ.NAV.map((g, gi) => (
          <div key={gi} className="nav-group">
            <div className="nav-label">{g.group}</div>
            {g.items.map(item => (
              <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => setPage(item.id)}>
                <Icon name={item.ico} size={16}/>
                <span>{item.label}</span>
                {item.pill && <span className="pill">{item.pill}</span>}
              </button>
            ))}
          </div>
        ))}
        <div className="side-foot">
          <div className="avatar">วพ</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>วุฒิพร สอนนวล</div>
            <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>OWNER · หุ้นส่วนผู้จัดการ</div>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="crumbs">หน้าแรก · <b>{pageTitle}</b></div>
          <div className="search">
            <Icon name="search" size={14}/>
            <input placeholder="ค้นหาเอกสาร ลูกค้า รายการ..."/>
          </div>
          <button className="theme-toggle" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label="Toggle theme">
            <span className="lbl l"><Icon name="sun" size={14}/></span>
            <span className="lbl r"><Icon name="moon" size={14}/></span>
            <div className="knob">
              <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={12}/>
            </div>
          </button>
          <button className="icon-btn" style={{ position: 'relative' }}>
            <Icon name="bell" size={16}/>
            <span style={{ position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: '50%', background: 'linear-gradient(135deg, var(--grad-from), var(--grad-to))' }}/>
          </button>
        </div>
        <div className="content">
          <PageCmp/>
        </div>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
})();
