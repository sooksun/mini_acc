/* HJ Account AI — Pages */
(function() {
const { useState, useMemo } = React;
const { fmtTHB, formatThaiDate, formatThaiDateShort, STATS, RECENT_DOCS, INBOX, RISKS, PROJECTS } = window.HJ;
const Icon = window.Icon;

const StatusBadge = ({ s }) => {
  const map = {
    draft:     { c: 'draft',     l: 'ฉบับร่าง' },
    review:    { c: 'review',    l: 'รอตรวจ' },
    confirmed: { c: 'confirmed', l: 'ยืนยันแล้ว' },
    accounted: { c: 'accounted', l: 'ลงบัญชี' },
    locked:    { c: 'locked',    l: 'ล็อก' },
    voided:    { c: 'voided',    l: 'ยกเลิก' },
    matched:   { c: 'accounted', l: 'จับคู่แล้ว' },
    'low-conf':{ c: 'review',    l: 'ความมั่นใจต่ำ' },
  };
  const v = map[s] || map.draft;
  return <span className={`badge ${v.c} dot`}>{v.l}</span>;
};

const RiskBadge = ({ lvl }) => (
  <span className={`badge risk-${lvl} dot`}>
    {lvl === 'critical' ? 'วิกฤต' : lvl === 'high' ? 'สูง' : lvl === 'medium' ? 'กลาง' : 'ต่ำ'}
  </span>
);

const Conf = ({ p }) => (
  <span className="conf"><span className="ring" style={{ '--p': p }}></span>{p}%</span>
);

/* ---------------- Dashboard ---------------- */
function Dashboard() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">สวัสดีครับ คุณวุฒิพร 👋</h1>
          <div className="page-sub">{formatThaiDate(new Date())} · งวดเดือน พฤษภาคม 2569 · เหลือ 22 วันก่อนปิดงวด</div>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="export"/>ส่งสำนักงานบัญชี</button>
          <button className="btn primary"><Icon name="plus"/>สร้างเอกสาร</button>
        </div>
      </div>

      <div className="stat-row" style={{ marginBottom: 20 }}>
        {STATS.map((s, i) => (
          <div key={i} className="stat">
            <div className="glow"/>
            <div className="lbl"><span className="swatch"/>{s.lbl}</div>
            <div className="val">{s.val}</div>
            <div className="sub">
              <span className={`delta ${s.dir}`}>
                <Icon name={s.dir === 'up' ? 'up' : 'down'} size={12}/> {s.delta}
              </span>
              · {s.sub}
            </div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card glass">
          <div className="sec-head">
            <h3>กระแสเงินสด 30 วัน</h3>
            <div className="more"><div className="tabs"><div className="tab active">รายเดือน</div><div className="tab">ไตรมาส</div><div className="tab">ปี</div></div></div>
          </div>
          <div className="chart-area">
            <svg viewBox="0 0 600 220" preserveAspectRatio="none">
              <defs>
                <linearGradient id="grad1" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--grad-from)" stopOpacity="0.55"/>
                  <stop offset="100%" stopColor="var(--grad-to)" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <path d="M0,170 C40,150 70,100 110,110 C150,120 180,60 220,80 C260,100 290,40 330,60 C380,80 420,30 460,55 C500,75 540,45 600,40 L600,220 L0,220Z" fill="url(#grad1)"/>
              <path d="M0,170 C40,150 70,100 110,110 C150,120 180,60 220,80 C260,100 290,40 330,60 C380,80 420,30 460,55 C500,75 540,45 600,40" fill="none" stroke="var(--brand)" strokeWidth="2.5"/>
              {[110,80,60,55,40].map((y,i)=>(<circle key={i} cx={110+i*100} cy={y} r="3.5" fill="var(--brand)"/>))}
            </svg>
          </div>
          <div style={{ display: 'flex', gap: 24, marginTop: 14 }}>
            <div className="mini-kpi"><span className="v">฿ 1.28M</span><span className="l">รายรับ</span></div>
            <div className="mini-kpi"><span className="v">฿ 642K</span><span className="l">รายจ่าย</span></div>
            <div className="mini-kpi"><span className="v">฿ 642K</span><span className="l">กำไรเบื้องต้น</span></div>
          </div>
        </div>

        <div className="card">
          <div className="sec-head"><h3>การปิดงวด พฤษภาคม 2569</h3></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div className="donut" style={{ '--val': 68 }}><span className="v">68%</span><span className="l">ความพร้อม</span></div>
            <div style={{ flex: 1, fontSize: 13 }}>
              <div style={{ display:'flex', justifyContent:'space-between', padding: '6px 0' }}><span>เอกสารครบ</span><span style={{ color: 'var(--ok)' }}>92%</span></div>
              <div style={{ display:'flex', justifyContent:'space-between', padding: '6px 0' }}><span>VAT/WHT พร้อม</span><span style={{ color: 'var(--warn)' }}>74%</span></div>
              <div style={{ display:'flex', justifyContent:'space-between', padding: '6px 0' }}><span>จับคู่ธนาคาร</span><span style={{ color: 'var(--warn)' }}>61%</span></div>
              <div style={{ display:'flex', justifyContent:'space-between', padding: '6px 0' }}><span>Risk แก้แล้ว</span><span style={{ color: 'var(--bad)' }}>2 / 6 วิกฤต</span></div>
            </div>
          </div>
          <button className="btn primary" style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}>
            ไปหน้าปิดงวด <Icon name="arrow"/>
          </button>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="sec-head">
            <h3>เอกสารล่าสุด</h3>
            <div className="more"><button className="btn ghost" style={{ fontSize: 12 }}>ดูทั้งหมด <Icon name="arrow" size={12}/></button></div>
          </div>
          <table className="table">
            <thead><tr><th>เลขที่</th><th>ประเภท</th><th>ลูกค้า</th><th className="num">จำนวน</th><th>วันที่</th><th>สถานะ</th></tr></thead>
            <tbody>
              {RECENT_DOCS.map(d => (
                <tr key={d.no}>
                  <td className="doc-no">{d.no}</td>
                  <td>{d.type}</td>
                  <td style={{ maxWidth: 200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.cust}</td>
                  <td className="num">฿ {fmtTHB(d.amt)}</td>
                  <td style={{ color:'var(--text-mute)' }}>{formatThaiDateShort(d.date)}</td>
                  <td><StatusBadge s={d.status}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="sec-head">
            <h3><Icon name="sparkle"/> AI ช่วยคุณวันนี้</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { t: 'อ่านเอกสารใหม่ 7 ฉบับ', d: 'จาก AI Inbox · ความมั่นใจเฉลี่ย 87%', ico: 'inbox' },
              { t: 'แนะนำหมวดบัญชีให้ 4 รายการ', d: '“ค่า AWS Hosting” → ค่าบริการเทคโนโลยี', ico: 'magic' },
              { t: 'พบความเสี่ยง 6 รายการ', d: '2 วิกฤต, 2 สูง — ดูที่ Risk Center', ico: 'alert' },
              { t: 'จับคู่ธนาคารอัตโนมัติ 11 รายการ', d: 'เหลือ 4 รายการรอผู้ใช้ยืนยัน', ico: 'check' },
            ].map((x, i) => (
              <div key={i} style={{ display:'flex', gap:10, padding:'10px 12px', borderRadius:10, background:'var(--surface-2)', border:'1px solid var(--border)' }}>
                <div style={{ width:32, height:32, borderRadius:9, background:'linear-gradient(135deg,var(--grad-from),var(--grad-to))', display:'grid', placeItems:'center', color:'white', flexShrink:0 }}>
                  <Icon name={x.ico} size={15}/>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{x.t}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-mute)', marginTop: 2 }}>{x.d}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'linear-gradient(135deg, color-mix(in oklab, var(--grad-from) 12%, var(--surface)), color-mix(in oklab, var(--grad-to) 10%, var(--surface)))', border: '1px solid var(--border-2)', fontSize: 12, color: 'var(--text-soft)', display:'flex', gap: 8 }}>
            <Icon name="sparkle" size={14}/>
            <span><b>หมายเหตุ:</b> AI ช่วยอ่าน แนะนำ และตรวจ — แต่ผู้ใช้ยืนยันทุกครั้งก่อนลงบัญชี</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- AI Inbox ---------------- */
function AIInbox() {
  const [sel, setSel] = useState(INBOX[0]);
  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">AI Inbox</h1>
          <div className="page-sub">เอกสารที่ AI อ่านแล้ว รอตรวจและยืนยัน · 7 ฉบับใหม่</div>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="filter"/>ตัวกรอง</button>
          <button className="btn primary"><Icon name="upload"/>อัปโหลดเอกสาร</button>
        </div>
      </div>

      <div className="filters">
        <div className="chip active">ทั้งหมด · 7</div>
        <div className="chip">ใบกำกับภาษี · 2</div>
        <div className="chip">ใบเสร็จ · 1</div>
        <div className="chip">สลิปโอน · 1</div>
        <div className="chip">WHT · 1</div>
        <div className="chip">ความมั่นใจต่ำ · 1</div>
      </div>

      <div className="inbox-grid">
        <div className="inbox-list">
          {INBOX.map(d => (
            <button key={d.id} onClick={() => setSel(d)} className={`inbox-item ${sel.id === d.id ? 'active' : ''}`}>
              <div className="inbox-thumb">PDF</div>
              <div className="meta">
                <div className="title">{d.name}</div>
                <div className="from">{d.from} · {formatThaiDateShort(d.date)}</div>
                <div className="row">
                  <span className="badge ai dot">{d.type}</span>
                  <Conf p={d.conf}/>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="doc-preview">
          <div className="doc-paper">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 11, color: '#666' }}>ใบกำกับภาษี / Tax Invoice</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>บจก. คลาวด์โซน เซอร์วิส</div>
                <div style={{ fontSize: 10, color: '#666', marginTop: 4, lineHeight: 1.5 }}>
                  88/12 ถ.พระราม 9 ห้วยขวาง กทม. 10310<br/>เลขประจำตัวผู้เสียภาษี: 0105563999999
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#666' }}>เลขที่</div>
                <div style={{ fontFamily: 'IBM Plex Mono', fontWeight: 600 }}>TAX-INV-202605-0089</div>
                <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>วันที่</div>
                <div style={{ fontWeight: 500 }}>9 พฤษภาคม 2569</div>
              </div>
            </div>
            <div style={{ height: 1, background: '#e5e1ff', margin: '14px 0' }}/>
            <div style={{ fontSize: 11, color: '#666' }}>ลูกค้า</div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{COMPANY.short}</div>
            <table style={{ width: '100%', marginTop: 14, fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f4f1ff', color: '#1a1640' }}>
                  <th style={{ padding: 8, textAlign:'left', border: '1px solid #d6cfff' }}>รายการ</th>
                  <th style={{ padding: 8, textAlign:'right', border: '1px solid #d6cfff', width: 80 }}>จำนวน</th>
                  <th style={{ padding: 8, textAlign:'right', border: '1px solid #d6cfff', width: 100 }}>ราคา/หน่วย</th>
                  <th style={{ padding: 8, textAlign:'right', border: '1px solid #d6cfff', width: 100 }}>รวม</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style={{ padding: 8, border: '1px solid #e5e1ff' }}>Cloud Server — Plan Standard 8 vCPU 32GB</td><td style={{ padding: 8, border:'1px solid #e5e1ff', textAlign:'right' }}>1</td><td style={{ padding: 8, border:'1px solid #e5e1ff', textAlign:'right' }}>22,000.00</td><td style={{ padding: 8, border:'1px solid #e5e1ff', textAlign:'right' }}>22,000.00</td></tr>
                <tr><td style={{ padding: 8, border: '1px solid #e5e1ff' }}>Backup Storage 500GB</td><td style={{ padding: 8, border:'1px solid #e5e1ff', textAlign:'right' }}>1</td><td style={{ padding: 8, border:'1px solid #e5e1ff', textAlign:'right' }}>5,000.00</td><td style={{ padding: 8, border:'1px solid #e5e1ff', textAlign:'right' }}>5,000.00</td></tr>
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <table style={{ fontSize: 11, minWidth: 240 }}>
                <tbody>
                  <tr><td style={{ padding: '3px 8px', color:'#666' }}>รวมเงิน</td><td style={{ padding: '3px 8px', textAlign: 'right' }}>27,000.00</td></tr>
                  <tr><td style={{ padding: '3px 8px', color:'#666' }}>VAT 7%</td><td style={{ padding: '3px 8px', textAlign: 'right' }}>1,890.00</td></tr>
                  <tr><td style={{ padding: '6px 8px', borderTop: '2px solid #1a1640', fontWeight: 700, color: '#1F5F8B' }}>รวมทั้งสิ้น</td><td style={{ padding: '6px 8px', textAlign: 'right', borderTop: '2px solid #1a1640', fontWeight: 700, color: '#1F5F8B' }}>28,890.00</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="card" style={{ overflow: 'auto' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: 12 }}>
            <Icon name="sparkle"/><h3 style={{ margin: 0, fontSize: 14 }}>AI ดึงข้อมูล</h3>
            <Conf p={sel.conf}/>
          </div>
          <div className="field">
            <label>ประเภทเอกสาร</label>
            <div className="control ai">
              <Icon name="sparkle" size={14}/>
              <input defaultValue="ใบกำกับภาษี (TAX_INVOICE)"/>
            </div>
          </div>
          <div className="field">
            <label>ผู้ขาย / Vendor</label>
            <div className="control ai">
              <Icon name="sparkle" size={14}/>
              <input defaultValue="บจก. คลาวด์โซน เซอร์วิส"/>
            </div>
          </div>
          <div className="field">
            <label>เลขประจำตัวผู้เสียภาษี</label>
            <div className="control ai">
              <Icon name="sparkle" size={14}/>
              <input defaultValue="0105563999999"/>
            </div>
          </div>
          <div className="field">
            <label>วันที่เอกสาร</label>
            <div className="control ai">
              <Icon name="sparkle" size={14}/>
              <input defaultValue="9 พฤษภาคม 2569"/>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 10 }}>
            <div className="field">
              <label>ยอดก่อน VAT</label>
              <div className="control ai"><input defaultValue="27,000.00" style={{ textAlign:'right' }}/></div>
            </div>
            <div className="field">
              <label>VAT 7%</label>
              <div className="control ai"><input defaultValue="1,890.00" style={{ textAlign:'right' }}/></div>
            </div>
          </div>
          <div className="field">
            <label>หมวดบัญชี (AI แนะนำ)</label>
            <div className="control ai">
              <Icon name="sparkle" size={14}/>
              <select defaultValue="hosting">
                <option value="hosting">ค่า Software / Hosting</option>
                <option>ค่าโทรศัพท์ / อินเทอร์เน็ต</option>
                <option>ต้นทุนโครงการ</option>
                <option>ทรัพย์สินถาวร</option>
              </select>
              <Icon name="down" size={14}/>
            </div>
          </div>
          <div className="field">
            <label>โครงการที่เกี่ยวข้อง</label>
            <div className="control">
              <select>
                <option>— ไม่ระบุ —</option>
                <option>PRJ-2569-007 ระบบ POS — Cafe Naan</option>
                <option>PRJ-2569-004 พัฒนาเว็บแอป CRM</option>
              </select>
              <Icon name="down" size={14}/>
            </div>
          </div>
          <div style={{ padding: 10, borderRadius: 10, background: 'color-mix(in oklab, var(--warn) 10%, var(--surface))', border: '1px solid color-mix(in oklab, var(--warn) 30%, transparent)', fontSize: 12, color: 'var(--text-soft)', marginBottom: 12 }}>
            <b style={{ color: 'var(--warn)' }}>⚠ Risk:</b> รายการนี้อาจเข้าข่าย WHT 3% ถ้าเข้าเงื่อนไขค่าจ้างทำของ
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" style={{ flex: 1, justifyContent: 'center' }}><Icon name="x" size={14}/>ปฏิเสธ</button>
            <button className="btn primary" style={{ flex: 2, justifyContent: 'center' }}><Icon name="check" size={14}/>ยืนยันและบันทึก</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Sales ---------------- */
function Sales() {
  const [tab, setTab] = useState('quotation');
  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">เอกสารขาย</h1>
          <div className="page-sub">ใบเสนอราคา · ใบส่งของ · ใบแจ้งหนี้ · ใบเสร็จ · ใบกำกับภาษี</div>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="export"/>Export</button>
          <button className="btn primary"><Icon name="plus"/>สร้างเอกสาร</button>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        {[['quotation','ใบเสนอราคา · 28'],['invoice','ใบแจ้งหนี้ · 41'],['delivery','ใบส่งของ · 33'],['receipt','ใบเสร็จ · 22'],['tax','ใบกำกับภาษี · 18'],['rt','รวม / RT · 14']].map(([k, l]) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 14, display: 'flex', gap: 10, alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
          <div className="search" style={{ width: 'auto', flex: 1, maxWidth: 360 }}>
            <Icon name="search" size={14}/>
            <input placeholder="ค้นหาเลขเอกสาร / ลูกค้า / ยอด..."/>
          </div>
          <div className="chip active">ทั้งหมด</div>
          <div className="chip">ฉบับร่าง</div>
          <div className="chip">รอตรวจ</div>
          <div className="chip">ยืนยันแล้ว</div>
          <div className="chip">ลงบัญชี</div>
        </div>
        <table className="table">
          <thead><tr><th>เลขที่</th><th>ลูกค้า</th><th>วันที่</th><th>ครบกำหนด</th><th className="num">ยอดก่อน VAT</th><th className="num">VAT</th><th className="num">รวม</th><th>สถานะ</th><th></th></tr></thead>
          <tbody>
            {RECENT_DOCS.concat(RECENT_DOCS).slice(0, 10).map((d, i) => (
              <tr key={i}>
                <td className="doc-no">{d.no.replace('INV', tab === 'quotation' ? 'QT' : 'INV')}-{i}</td>
                <td>{d.cust}</td>
                <td style={{ color: 'var(--text-mute)' }}>{formatThaiDateShort(d.date)}</td>
                <td style={{ color: 'var(--text-mute)' }}>{formatThaiDateShort('2026-06-' + (5 + i))}</td>
                <td className="num">฿ {fmtTHB(d.amt * 0.93)}</td>
                <td className="num" style={{ color: 'var(--text-mute)' }}>฿ {fmtTHB(d.amt * 0.07)}</td>
                <td className="num" style={{ fontWeight: 600 }}>฿ {fmtTHB(d.amt)}</td>
                <td><StatusBadge s={d.status}/></td>
                <td><button className="icon-btn" style={{ width: 30, height: 30 }}><Icon name="eye" size={14}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- PDF Preview ---------------- */
function PDFPreview() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">ตัวอย่าง PDF — ใบเสนอราคา</h1>
          <div className="page-sub">QT-2569-0233 · มหาวิทยาลัยราชภัฏเชียงราย · ตามเทมเพลต Invoice-PP-003-2569</div>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="eye"/>โหมด Preview</button>
          <button className="btn"><Icon name="export"/>ดาวน์โหลด</button>
          <button className="btn primary"><Icon name="check"/>สร้าง PDF จริง</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
        <div className="card" style={{ width: 240, flexShrink: 0, position: 'sticky', top: 80 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>ตั้งค่าเอกสาร</h3>
          <div className="field"><label>ประเภท</label><div className="control"><select defaultValue="qt"><option value="qt">ใบเสนอราคา</option><option>ใบส่งของ</option><option>ใบแจ้งหนี้</option><option>ใบเสร็จ/ใบกำกับภาษี</option></select><Icon name="down" size={14}/></div></div>
          <div className="field"><label>โทนสีหัวเอกสาร</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {['#1F5F8B','#7c5cff','#2F7F89','#8B2E2E','#D96B00','#4B5563'].map(c => (
                <div key={c} style={{ width: 26, height: 26, borderRadius: 6, background: c, border: c === '#1F5F8B' ? '2px solid var(--text)' : '1px solid var(--border-2)', cursor: 'pointer' }}/>
              ))}
            </div>
          </div>
          <div className="field"><label>Watermark DRAFT</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className="switch on"/><span style={{ fontSize: 12, color: 'var(--text-mute)' }}>เปิดในโหมด Preview</span></div>
          </div>
          <div className="field"><label>เลขเอกสาร</label><div className="control"><input defaultValue="QT-2569-0233"/></div></div>
          <div style={{ marginTop: 14, padding: 10, borderRadius: 10, background: 'var(--surface-2)', fontSize: 11.5, color: 'var(--text-mute)', lineHeight: 1.6 }}>
            DRAFT ใช้เลข Preview ชั่วคราวได้<br/>
            CONFIRM แล้วจึง Lock เลขจริง
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          <div className="a4">
            <div className="qheader">
              <div className="qlogo">{COMPANY.brand}</div>
              <div className="qcompany">
                <div className="th">{COMPANY.nameTh}</div>
                <div className="en">{COMPANY.nameEn}</div>
                <div className="addr">
                  {COMPANY.address}<br/>
                  โทร. {COMPANY.phone} · เลขประจำตัวผู้เสียภาษี {COMPANY.taxId}
                </div>
              </div>
              <div className="qfor">สำหรับลูกค้า</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
              <div className="qtitle">ใบเสนอราคา · QUOTATION</div>
              <div style={{ textAlign: 'right', fontSize: 11 }}>
                <div style={{ color: '#666' }}>เลขที่ / No.</div>
                <div style={{ fontFamily: 'IBM Plex Mono', fontWeight: 600 }}>QT-2569-0233</div>
                <div style={{ color: '#666', marginTop: 6 }}>วันที่ / Date</div>
                <div style={{ fontWeight: 500 }}>10 พฤษภาคม 2569</div>
              </div>
            </div>
            <hr/>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 10.5, color: '#666' }}>ลูกค้า / Customer</div>
                <div style={{ fontWeight: 700, marginTop: 3, fontSize: 12 }}>มหาวิทยาลัยราชภัฏเชียงราย</div>
                <div style={{ fontSize: 10.5, color: '#555', marginTop: 4, lineHeight: 1.55 }}>
                  80 หมู่ 9 ถ. พหลโยธิน ต.บ้านดู่ อ.เมืองเชียงราย จ.เชียงราย 57100<br/>
                  เลขประจำตัวผู้เสียภาษี 0994000160195 · สนญ.
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: '#666' }}>เครดิต / Credit Term</div>
                <div style={{ fontWeight: 600, marginTop: 3 }}>30 วัน</div>
                <div style={{ fontSize: 10.5, color: '#666', marginTop: 6 }}>ครบกำหนด / Due Date</div>
                <div style={{ fontWeight: 500 }}>9 มิถุนายน 2569</div>
              </div>
            </div>

            <table className="items">
              <thead><tr>
                <th style={{ width: 28 }}>#</th>
                <th>รายการ / Description</th>
                <th style={{ width: 56 }} className="num">จำนวน</th>
                <th style={{ width: 90 }} className="num">หน่วย</th>
                <th style={{ width: 90 }} className="num">ราคา/หน่วย</th>
                <th style={{ width: 100 }} className="num">รวม</th>
              </tr></thead>
              <tbody>
                <tr><td>1</td><td>พัฒนาแพลตฟอร์ม e-Learning — Phase 1<br/><span style={{ color: '#666', fontSize: 10 }}>วิเคราะห์ความต้องการ + UI/UX + Backend API สำหรับรายวิชาวิทยาศาสตร์</span></td><td className="num">1</td><td className="num">งาน</td><td className="num">85,000.00</td><td className="num">85,000.00</td></tr>
                <tr><td>2</td><td>ติดตั้ง Cloud Server และ LMS</td><td className="num">1</td><td className="num">ระบบ</td><td className="num">42,000.00</td><td className="num">42,000.00</td></tr>
                <tr><td>3</td><td>อบรมอาจารย์และเจ้าหน้าที่สถาบัน 2 รุ่น</td><td className="num">2</td><td className="num">รุ่น</td><td className="num">15,000.00</td><td className="num">30,000.00</td></tr>
                <tr><td>4</td><td>บริการดูแลระบบ 12 เดือน</td><td className="num">12</td><td className="num">เดือน</td><td className="num">8,500.00</td><td className="num">102,000.00</td></tr>
              </tbody>
            </table>

            <div className="summary">
              <div className="words">
                <div style={{ fontSize: 10, color: '#666' }}>จำนวนเงินตัวอักษร</div>
                <div style={{ fontWeight: 600, marginTop: 4, fontSize: 11.5 }}>(สองแสนเก้าหมื่นห้าพันสองร้อยสามสิบบาทถ้วน)</div>
              </div>
              <table>
                <tbody>
                  <tr><td style={{ color: '#666' }}>รวมเงิน / Total</td><td className="num">259,000.00</td></tr>
                  <tr><td style={{ color: '#666' }}>VAT 7%</td><td className="num">18,130.00</td></tr>
                  <tr><td style={{ color: '#666' }}>รวมหลัง VAT</td><td className="num">277,130.00</td></tr>
                  <tr><td style={{ color: '#666' }}>หัก ณ ที่จ่าย 3%</td><td className="num">7,770.00</td></tr>
                  <tr className="total"><td>ยอดเงินสุทธิ / NET</td><td className="num">269,360.00</td></tr>
                </tbody>
              </table>
            </div>

            <div className="signatures">
              <div className="sig"><div className="line">ผู้สั่งสินค้า / วันที่</div></div>
              <div className="sig"><div className="line">ผู้เสนอราคา / วันที่</div></div>
              <div className="sig"><div className="line">ในนาม {COMPANY.short}<br/>ผู้มีอำนาจลงนาม (นางสาววุฒิพร สอนนวล)</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Risk Center ---------------- */
function RiskCenter() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Risk Center</h1>
          <div className="page-sub">AI ตรวจพบความเสี่ยง 6 รายการในงวดนี้ · 2 วิกฤต · แก้ก่อนปิดงวด</div>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="filter"/>กรองตามระดับ</button>
          <button className="btn primary"><Icon name="check"/>ยอมรับทั้งหมดที่ปลอดภัย</button>
        </div>
      </div>

      <div className="stat-row" style={{ marginBottom: 20 }}>
        {[
          { lbl: 'วิกฤต', val: '2', cls: 'risk-critical' },
          { lbl: 'สูง', val: '2', cls: 'risk-high' },
          { lbl: 'กลาง', val: '2', cls: 'risk-medium' },
          { lbl: 'ต่ำ', val: '1', cls: 'risk-low' },
        ].map(s => (
          <div key={s.lbl} className="stat">
            <div className="lbl">ระดับ {s.lbl}</div>
            <div className="val" style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              {s.val} <span className={`badge ${s.cls}`} style={{ fontSize: 10 }}>{s.lbl}</span>
            </div>
            <div className="sub">รายการที่ต้องตรวจ</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {RISKS.map((r, i) => (
          <div key={i} className={`risk-card ${r.lvl}`}>
            <div className="icon"><Icon name="alert" size={18}/></div>
            <div className="body">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <RiskBadge lvl={r.lvl}/>
                <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--text-mute)' }}>{r.code}</span>
              </div>
              <h4>{r.title}</h4>
              <p>{r.desc}</p>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <button className="btn ghost" style={{ fontSize: 12 }}>ยอมรับ</button>
              <button className="btn" style={{ fontSize: 12 }}>มอบหมาย</button>
              <button className="btn primary" style={{ fontSize: 12 }}>แก้ไข <Icon name="arrow" size={12}/></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Closing ---------------- */
function Closing() {
  const checklist = [
    { l: 'เอกสารขายครบทุกฉบับ', m: '41 ใบแจ้งหนี้ · 22 ใบเสร็จ · 18 ใบกำกับภาษี', s: 'done', stat: 'ผ่าน' },
    { l: 'รายจ่ายแนบเอกสารครบ', m: '32/35 รายการ — 3 รายการขาดเอกสาร', s: 'blocked', stat: 'ยังไม่ผ่าน' },
    { l: 'VAT ขาย/ซื้อ ตรวจแล้ว', m: 'VAT ขาย ฿89,920 · VAT ซื้อ ฿42,310', s: 'done', stat: 'ผ่าน' },
    { l: 'หัก ณ ที่จ่าย ออกหนังสือรับรอง', m: '8/10 รายการ — 2 รอออก', s: 'pending', stat: 'รอ' },
    { l: 'จับคู่ Statement ธนาคาร', m: '52/64 รายการ — 12 รอจับคู่', s: 'pending', stat: 'รอ' },
    { l: 'Journal Dr = Cr', m: 'ผลรวมสมดุล ทั้ง 134 รายการ', s: 'done', stat: 'ผ่าน' },
    { l: 'Risk วิกฤตแก้แล้ว', m: '0/2 — ยังเหลือ 2 รายการวิกฤต', s: 'blocked', stat: 'ยังไม่ผ่าน' },
    { l: 'Stock ไม่ติดลบ', m: 'ตรวจสินค้า 24 SKU', s: 'done', stat: 'ผ่าน' },
    { l: 'Accountant ตรวจ', m: 'รอนักบัญชี: คุณสุภาพร', s: 'pending', stat: 'รอ' },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">ปิดงวด · พฤษภาคม 2569</h1>
          <div className="page-sub">1 พฤษภาคม 2569 — 31 พฤษภาคม 2569 · เป้าหมายปิดงวดภายใน 5 มิถุนายน 2569</div>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="export"/>Accountant Pack</button>
          <button className="btn primary" disabled style={{ opacity: 0.6, cursor: 'not-allowed' }}><Icon name="lock"/>ล็อกงวด (ยังไม่พร้อม)</button>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card glass">
          <div className="sec-head"><h3>ความพร้อมการปิดงวด</h3></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div className="donut" style={{ '--val': 68, width: 160, height: 160 }}>
              <span className="v" style={{ fontSize: 28 }}>68%</span>
              <span className="l">5 จาก 9 ผ่าน</span>
            </div>
            <div style={{ flex: 1 }}>
              <div className="progress" style={{ marginBottom: 6 }}><div style={{ width: '68%' }}/></div>
              <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>ปิดงวดไม่ได้จนกว่ารายการ <b style={{ color: 'var(--bad)' }}>วิกฤต 2 รายการ</b> และเอกสารขาด <b>3 ฉบับ</b> จะถูกแก้</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
                <div className="mini-kpi"><span className="v" style={{ color: 'var(--ok)' }}>5</span><span className="l">ผ่าน</span></div>
                <div className="mini-kpi"><span className="v" style={{ color: 'var(--warn)' }}>3</span><span className="l">รอดำเนินการ</span></div>
                <div className="mini-kpi"><span className="v" style={{ color: 'var(--bad)' }}>2</span><span className="l">ยังไม่ผ่าน</span></div>
                <div className="mini-kpi"><span className="v">9</span><span className="l">รวม</span></div>
              </div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="sec-head"><h3><Icon name="sparkle"/> AI Monthly Summary</h3></div>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-soft)' }}>
            เดือน <b>พฤษภาคม 2569</b> รายรับรวม <b style={{ color: 'var(--text)' }}>฿ 1,284,520</b> รายจ่าย <b style={{ color: 'var(--text)' }}>฿ 642,180</b> กำไรเบื้องต้น <b style={{ color: 'var(--ok)' }}>฿ 642,340</b> (อัตรากำไร 50%)
            <br/><br/>
            มีรายการรอนักบัญชีตรวจ <b>4 รายการ</b> · เอกสารขาด <b>3 ฉบับ</b> · ต้องออกหนังสือรับรอง WHT อีก <b>2 ฉบับ</b>
            <br/><br/>
            <span style={{ color: 'var(--text-mute)', fontSize: 12 }}>* AI สรุปข้อมูล แต่นักบัญชีต้องตรวจก่อนปิดงวด</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="sec-head"><h3>Checklist การปิดงวด</h3></div>
        <div className="checklist">
          {checklist.map((c, i) => (
            <div key={i} className={`check ${c.s === 'done' ? 'done' : c.s === 'blocked' ? 'blocked' : ''}`}>
              <div className="box">{c.s === 'done' && <Icon name="check" size={14}/>}{c.s === 'blocked' && <Icon name="x" size={14}/>}</div>
              <div className="lbl">{c.l}<div className="meta">{c.m}</div></div>
              <div className="stat-pill">{c.stat}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Expenses ---------------- */
function Expenses() {
  const rows = [
    { no: 'EXP-2569-0142', vendor: 'บจก. คลาวด์โซน เซอร์วิส', cat: 'ค่า Hosting', amt: 28890, vat: 1890, wht: 0, date: '2026-05-09', proj: 'PRJ-2569-007', status: 'review' },
    { no: 'EXP-2569-0141', vendor: 'PTT Station', cat: 'ค่าน้ำมัน', amt: 1240, vat: 81, wht: 0, date: '2026-05-09', proj: '—', status: 'confirmed' },
    { no: 'EXP-2569-0140', vendor: 'Amazon Web Services', cat: 'ค่า Hosting', amt: 18420, vat: 1206, wht: 0, date: '2026-05-08', proj: 'PRJ-2569-004', status: 'accounted' },
    { no: 'EXP-2569-0139', vendor: 'นาย ก. ฟรีแลนซ์ออกแบบ', cat: 'ค่าจ้างทำของ', amt: 56000, vat: 0, wht: 1680, date: '2026-05-06', proj: 'PRJ-2569-007', status: 'review' },
    { no: 'EXP-2569-0138', vendor: 'บจก. ออฟฟิศซัพพลาย', cat: 'ค่าวัสดุสำนักงาน', amt: 4200, vat: 275, wht: 0, date: '2026-05-05', proj: '—', status: 'accounted' },
    { no: 'EXP-2569-0137', vendor: 'การไฟฟ้านครหลวง', cat: 'ค่าไฟฟ้า', amt: 8920, vat: 0, wht: 0, date: '2026-05-04', proj: '—', status: 'locked' },
  ];
  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">รายจ่าย</h1>
          <div className="page-sub">รายจ่ายเดือนนี้ ฿ 642,180 · 32 รายการ · 3 ขาดเอกสาร</div>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="upload"/>อัปโหลดหลายไฟล์</button>
          <button className="btn primary"><Icon name="plus"/>บันทึกรายจ่าย</button>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 18 }}>
        <div className="upload-zone">
          <div className="ico-big"><Icon name="upload" size={22}/></div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>ลากใบเสร็จ ใบกำกับภาษี หรือสลิปมาวางที่นี่</div>
          <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 6 }}>AI จะอ่านและกรอกข้อมูลให้ — รองรับ PDF, JPG, PNG, HEIC ขนาดไม่เกิน 20MB ต่อไฟล์</div>
          <button className="btn primary" style={{ marginTop: 12 }}><Icon name="plus"/>เลือกไฟล์</button>
        </div>
        <div className="card">
          <div className="sec-head"><h3>หมวดรายจ่ายเดือนนี้</h3></div>
          {[
            { l: 'ค่า Software / Hosting', v: 184200, p: 28 },
            { l: 'ต้นทุนโครงการ', v: 162000, p: 25 },
            { l: 'ค่าจ้างทำของ', v: 138000, p: 21 },
            { l: 'ค่าวัสดุสำนักงาน', v: 64000, p: 10 },
            { l: 'อื่นๆ', v: 93980, p: 16 },
          ].map((c, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                <span>{c.l}</span><span style={{ color: 'var(--text-mute)' }}>฿ {fmtTHB(c.v)} · {c.p}%</span>
              </div>
              <div className="progress"><div style={{ width: c.p + '%' }}/></div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead><tr><th>เลขที่</th><th>ผู้ขาย</th><th>หมวด</th><th>โครงการ</th><th>วันที่</th><th className="num">VAT</th><th className="num">WHT</th><th className="num">รวม</th><th>สถานะ</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.no}>
                <td className="doc-no">{r.no}</td>
                <td>{r.vendor}</td>
                <td><span className="badge" style={{ fontSize: 11 }}>{r.cat}</span></td>
                <td className="doc-no" style={{ color: 'var(--text-mute)' }}>{r.proj}</td>
                <td style={{ color: 'var(--text-mute)' }}>{formatThaiDateShort(r.date)}</td>
                <td className="num" style={{ color: 'var(--text-mute)' }}>{r.vat ? '฿ ' + fmtTHB(r.vat) : '—'}</td>
                <td className="num" style={{ color: 'var(--text-mute)' }}>{r.wht ? '฿ ' + fmtTHB(r.wht) : '—'}</td>
                <td className="num" style={{ fontWeight: 600 }}>฿ {fmtTHB(r.amt)}</td>
                <td><StatusBadge s={r.status}/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Projects ---------------- */
function Projects() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">โครงการและต้นทุนงาน</h1>
          <div className="page-sub">4 โครงการกำลังดำเนินการ · กำไรรวม ฿ 196,800</div>
        </div>
        <div className="page-actions">
          <button className="btn primary"><Icon name="plus"/>สร้างโครงการ</button>
        </div>
      </div>
      <div className="grid-3">
        {PROJECTS.map(p => {
          const profit = p.revenue - p.cost;
          const margin = ((profit / p.revenue) * 100).toFixed(0);
          const loss = profit < 0;
          return (
            <div key={p.code} className="card">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, var(--grad-from), var(--grad-to))', display: 'grid', placeItems: 'center', color: 'white' }}><Icon name="layers"/></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-mute)', fontFamily: 'IBM Plex Mono', marginTop: 2 }}>{p.code} · {p.status}</div>
                </div>
              </div>
              <div className="progress" style={{ marginTop: 14 }}><div style={{ width: p.progress + '%' }}/></div>
              <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 4 }}>ความคืบหน้า {p.progress}%</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
                <div><div style={{ fontSize: 11, color: 'var(--text-mute)' }}>รายรับ</div><div style={{ fontSize: 15, fontWeight: 600 }}>฿ {fmtTHB(p.revenue)}</div></div>
                <div><div style={{ fontSize: 11, color: 'var(--text-mute)' }}>ต้นทุน</div><div style={{ fontSize: 15, fontWeight: 600 }}>฿ {fmtTHB(p.cost)}</div></div>
                <div><div style={{ fontSize: 11, color: 'var(--text-mute)' }}>กำไร</div><div style={{ fontSize: 15, fontWeight: 700, color: loss ? 'var(--bad)' : 'var(--ok)' }}>฿ {fmtTHB(profit)}</div></div>
                <div><div style={{ fontSize: 11, color: 'var(--text-mute)' }}>อัตรากำไร</div><div style={{ fontSize: 15, fontWeight: 700, color: loss ? 'var(--bad)' : 'var(--ok)' }}>{margin}%</div></div>
              </div>
              {loss && <div style={{ marginTop: 12, padding: 8, borderRadius: 8, background: 'color-mix(in oklab, var(--bad) 12%, var(--surface))', fontSize: 11.5, color: 'var(--bad)' }}>⚠ ต้นทุนเกินรายรับ — แนะนำทบทวน scope</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Tax ---------------- */
function Tax() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">ภาษี VAT / WHT</h1>
          <div className="page-sub">งวดเดือน พฤษภาคม 2569 · ยื่น ภ.พ.30 ภายใน 15 มิถุนายน · ยื่น ภ.ง.ด.53 ภายใน 7 มิถุนายน</div>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="export"/>Export ภ.พ.30</button>
          <button className="btn"><Icon name="export"/>Export ภ.ง.ด.53</button>
        </div>
      </div>

      <div className="stat-row" style={{ marginBottom: 20 }}>
        <div className="stat"><div className="lbl"><span className="swatch"/>VAT ขาย</div><div className="val">฿ 89,920</div><div className="sub">18 ใบกำกับภาษี</div></div>
        <div className="stat"><div className="lbl"><span className="swatch"/>VAT ซื้อ</div><div className="val">฿ 42,310</div><div className="sub">14 ใบกำกับภาษี</div></div>
        <div className="stat"><div className="lbl"><span className="swatch"/>VAT ต้องชำระ</div><div className="val" style={{ color: 'var(--warn)' }}>฿ 47,610</div><div className="sub">ยื่นภายใน 15 มิ.ย. 2569</div></div>
        <div className="stat"><div className="lbl"><span className="swatch"/>WHT รวม</div><div className="val">฿ 8,420</div><div className="sub">10 รายการ · 2 ค้างหนังสือรับรอง</div></div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="sec-head"><h3>VAT แยกรายการ</h3></div>
          <table className="table">
            <thead><tr><th>เลขที่</th><th>คู่ค้า</th><th className="num">ฐาน</th><th className="num">VAT</th></tr></thead>
            <tbody>
              {[['TAX-2569-0044','บจก. แม่น้ำดิจิทัล',230000,16100,'ขาย'],
                ['TAX-2569-0043','บจก. กรีนเวฟ',58400,4088,'ขาย'],
                ['INV-CLOUDZONE-089','บจก. คลาวด์โซน',27000,1890,'ซื้อ'],
                ['INV-AWS-2026-05','Amazon Web Services',17214,1206,'ซื้อ'],
              ].map((r,i) => (
                <tr key={i}>
                  <td className="doc-no">{r[0]}</td>
                  <td>{r[1]} <span className="badge" style={{ marginLeft: 6, fontSize: 10 }}>{r[4]}</span></td>
                  <td className="num">฿ {fmtTHB(r[2])}</td>
                  <td className="num" style={{ fontWeight: 600 }}>฿ {fmtTHB(r[3])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="sec-head"><h3>WHT ที่หักไว้</h3></div>
          <table className="table">
            <thead><tr><th>ผู้ถูกหัก</th><th>อัตรา</th><th className="num">ฐาน</th><th className="num">หัก</th><th>หนังสือ</th></tr></thead>
            <tbody>
              {[
                ['นาย ก. ฟรีแลนซ์ออกแบบ','3%',56000,1680,'pending'],
                ['บจก. คอนซัลท์ทิ้ง','3%',45000,1350,'done'],
                ['นาง ข. นักแปล','3%',12000,360,'done'],
                ['บจก. โฆษณาออนไลน์','2%',86000,1720,'pending'],
                ['นาย ค. ขนส่ง','1%',330000,3300,'done'],
              ].map((r,i) => (
                <tr key={i}>
                  <td>{r[0]}</td>
                  <td>{r[1]}</td>
                  <td className="num">฿ {fmtTHB(r[2])}</td>
                  <td className="num" style={{ fontWeight: 600 }}>฿ {fmtTHB(r[3])}</td>
                  <td>{r[4] === 'done' ? <span className="badge accounted dot">ออกแล้ว</span> : <span className="badge review dot">รอออก</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Settings ---------------- */
function Settings() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">ตั้งค่าบริษัท</h1>
          <div className="page-sub">ข้อมูลบริษัท · เทมเพลตเอกสาร · เลขเอกสาร · ผู้ใช้</div>
        </div>
      </div>
      <div className="grid-2">
        <div className="card">
          <div className="sec-head"><h3>ข้อมูลกิจการ</h3></div>
          <div className="field"><label>ชื่อกิจการ (ไทย)</label><div className="control"><input defaultValue={COMPANY.nameTh}/></div></div>
          <div className="field"><label>ชื่อกิจการ (อังกฤษ)</label><div className="control"><input defaultValue={COMPANY.nameEn}/></div></div>
          <div className="field"><label>ที่อยู่สำนักงานใหญ่</label><div className="control"><textarea rows="2" defaultValue={COMPANY.address}/></div></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="field"><label>เลขประจำตัวผู้เสียภาษี</label><div className="control"><input defaultValue={COMPANY.taxId}/></div></div>
            <div className="field"><label>โทรศัพท์</label><div className="control"><input defaultValue={COMPANY.phone}/></div></div>
          </div>
          <div className="field"><label>จดทะเบียนเมื่อวันที่</label><div className="control"><input defaultValue={COMPANY.registeredAtThai + ' ณ สำนักงานทะเบียนหุ้นส่วนบริษัท ' + COMPANY.registrar} readOnly/></div></div>
          <div className="field"><label>หุ้นส่วนผู้จัดการ / ผู้มีอำนาจลงนาม</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {COMPANY.partners.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, var(--grad-from), var(--grad-to))', display: 'grid', placeItems: 'center', color: 'white', fontSize: 11, fontWeight: 600 }}>{p.initial}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>{p.role} · ลงหุ้น ฿ {fmtTHB(p.share)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="field"><label>สถานะ VAT</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div className="switch on"/><span style={{ fontSize: 13 }}>จดทะเบียน VAT (ออกใบกำกับภาษีได้)</span>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="sec-head"><h3>เลขเอกสาร</h3></div>
          <div style={{ fontSize: 12, color: 'var(--text-mute)', marginBottom: 12 }}>รูปแบบ: <code style={{ background: 'var(--surface-3)', padding: '2px 6px', borderRadius: 4 }}>{`{PREFIX}-{ปีพ.ศ.}-{RUNNING}`}</code></div>
          <table className="table">
            <thead><tr><th>เอกสาร</th><th>Prefix</th><th>เลขถัดไป</th><th>Reset</th></tr></thead>
            <tbody>
              {[['ใบเสนอราคา','QT','QT-2569-0234','รายปี'],
                ['ใบส่งของ','DN','DN-2569-0189','รายปี'],
                ['ใบแจ้งหนี้','INV','INV-2569-0125','รายปี'],
                ['ใบเสร็จ','RC','RC-2569-0145','รายปี'],
                ['ใบกำกับภาษี','TAX','TAX-2569-0045','รายปี'],
                ['ใบเสร็จ/ใบกำกับภาษี','RT','RT-2569-0092','รายปี'],
              ].map((r, i) => (
                <tr key={i}>
                  <td>{r[0]}</td>
                  <td><code style={{ fontFamily: 'IBM Plex Mono', fontSize: 12 }}>{r[1]}</code></td>
                  <td className="doc-no">{r[2]}</td>
                  <td><span className="badge">{r[3]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Pages map ---------------- */
window.PAGES = {
  dashboard: { title: 'Dashboard', cmp: Dashboard },
  'ai-inbox': { title: 'AI Inbox', cmp: AIInbox },
  sales:     { title: 'เอกสารขาย', cmp: Sales },
  review:    { title: 'รีวิวเอกสาร AI', cmp: AIInbox },
  pdf:       { title: 'ตัวอย่าง PDF', cmp: PDFPreview },
  expenses:  { title: 'รายจ่าย', cmp: Expenses },
  projects:  { title: 'โครงการ', cmp: Projects },
  tax:       { title: 'ภาษี VAT/WHT', cmp: Tax },
  risks:     { title: 'Risk Center', cmp: RiskCenter },
  closing:   { title: 'ปิดงวดเดือน', cmp: Closing },
  settings:  { title: 'ตั้งค่า', cmp: Settings },
};
})();
