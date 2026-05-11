// Real company data and helpers for HJ Account AI
// บริษัทจริง: ห้างหุ้นส่วนจำกัด โซลูชั่น เนกซ์เจน (Solutions Nextgen LP)
// เลขทะเบียน/เลขประจำตัวผู้เสียภาษี: 0573567001472
// จดทะเบียน: 9 พฤษภาคม 2567 ณ จังหวัดเชียงราย
// คำขวัญ: นวัตกรรม การศึกษา การรักษา

const COMPANY = {
  nameTh: 'ห้างหุ้นส่วนจำกัด โซลูชั่น เนกซ์เจน',
  nameEn: 'Solutions Nextgen Limited Partnership',
  short: 'หจก. โซลูชั่น เนกซ์เจน',
  brand: 'SN', // initials for logo
  tagline: 'นวัตกรรม การศึกษา การรักษา',
  taxId: '0573567001472',
  registeredAt: '2024-05-09',
  registeredAtThai: '9 พฤษภาคม 2567',
  registrar: 'จังหวัดเชียงราย',
  address: '468/449 หมู่ที่ 3 ตำบลบ้านดู่ อำเภอเมืองเชียงราย จังหวัดเชียงราย 57100',
  addressShort: '468/449 ม.3 ต.บ้านดู่ อ.เมืองเชียงราย จ.เชียงราย 57100',
  phone: '053-152-489',
  email: 'contact@solutionsnextgen.co.th',
  capital: 1000000,
  partners: [
    { name: 'นางสาววุฒิพร สอนนวล', role: 'หุ้นส่วนผู้จัดการ', share: 500000, initial: 'วพ' },
    { name: 'นางสาวสุรีย์ สอนนวล',  role: 'หุ้นส่วน',            share: 500000, initial: 'สส' },
  ],
  vatRegistered: true,
  businessLines: [
    'จำหน่ายสื่อการสอน โปรแกรมและซอฟต์แวร์ทางการศึกษา',
    'รับจ้างผลิตสื่อการสอนและระบบบริหารสถานศึกษา',
    'รับจ้างผลิตสื่อมัลติมีเดีย ภาพนิ่ง ภาพยนตร์ เสียงดนตรี',
    'จำหน่ายวัสดุและอุปกรณ์การเรียนการสอน',
    'จำหน่ายวัสดุและอุปกรณ์ก่อสร้าง',
    'รับเหมาก่อสร้างและงานโยธา',
  ],
};

const fmtTHB = (n) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const formatThaiDate = (d) => new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok'
}).format(new Date(d));
const formatThaiDateShort = (d) => new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  day: 'numeric', month: 'numeric', year: '2-digit', timeZone: 'Asia/Bangkok'
}).format(new Date(d));
const formatThaiDateTime = (d) => new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok'
}).format(new Date(d));

const STATS = [
  { lbl: 'รายรับเดือนนี้', val: '฿ 842,560', delta: '+22.4%', dir: 'up', sub: 'เทียบกับเดือนก่อน' },
  { lbl: 'รายจ่ายเดือนนี้', val: '฿ 421,890', delta: '+8.2%', dir: 'up', sub: '28 รายการ' },
  { lbl: 'ลูกหนี้คงค้าง', val: '฿ 312,400', delta: '-4.1%', dir: 'down', sub: '5 ใบแจ้งหนี้' },
  { lbl: 'กำไรเบื้องต้น', val: '฿ 420,670', delta: '+34.6%', dir: 'up', sub: 'อัตรากำไร 50%' },
];

// Real customers reflect the business focus: schools, training centers, gov institutions
const RECENT_DOCS = [
  { no: 'INV-2569-0124', type: 'ใบแจ้งหนี้', cust: 'โรงเรียนเทศบาล 1 (เชียงราย)', amt: 184500, date: '2026-05-08', status: 'confirmed' },
  { no: 'QT-2569-0233',  type: 'ใบเสนอราคา', cust: 'มหาวิทยาลัยราชภัฏเชียงราย', amt: 92000, date: '2026-05-07', status: 'review' },
  { no: 'RT-2569-0091',  type: 'ใบเสร็จ/ใบกำกับภาษี', cust: 'โรงเรียนสามัคคีวิทยาคม', amt: 58400, date: '2026-05-06', status: 'accounted' },
  { no: 'DN-2569-0188',  type: 'ใบส่งของ', cust: 'อบจ. เชียงราย — ฝ่ายการศึกษา', amt: 412300, date: '2026-05-06', status: 'confirmed' },
  { no: 'INV-2569-0123', type: 'ใบแจ้งหนี้', cust: 'โรงเรียนบ้านดู่ (สหราษฎร์วิทยา)', amt: 76900, date: '2026-05-05', status: 'draft' },
  { no: 'TAX-2569-0044', type: 'ใบกำกับภาษี', cust: 'สพป. เชียงราย เขต 1', amt: 230000, date: '2026-05-04', status: 'locked' },
];

const INBOX = [
  { id:1, name: 'TAX-INV-202605-0089.pdf', from: 'บจก. คลาวด์โซน เซอร์วิส', date: '2026-05-09', conf: 96, type: 'ใบกำกับภาษี', amt: 28900, status: 'review' },
  { id:2, name: 'receipt-fuel-may09.jpg', from: 'PTT Station สาขาแม่ลาว', date: '2026-05-09', conf: 88, type: 'ใบเสร็จ', amt: 1240, status: 'review' },
  { id:3, name: 'invoice-AWS-04.pdf', from: 'Amazon Web Services', date: '2026-05-08', conf: 94, type: 'ใบแจ้งหนี้', amt: 18420, status: 'review' },
  { id:4, name: 'slip-kbank-2026-05-08.png', from: 'KBank — รับโอนจาก รร.เทศบาล 1', date: '2026-05-08', conf: 99, type: 'สลิปโอน', amt: 184500, status: 'matched' },
  { id:5, name: 'wht-cert-may.pdf', from: 'อบจ. เชียงราย', date: '2026-05-07', conf: 82, type: 'WHT Cert', amt: 1845, status: 'review' },
  { id:6, name: 'IMG_2840.HEIC', from: 'อัปโหลดผ่านมือถือ', date: '2026-05-07', conf: 64, type: 'รอจำแนก', amt: null, status: 'low-conf' },
  { id:7, name: 'po-software-license.pdf', from: 'บจก. ซิกม่าซอฟต์', date: '2026-05-06', conf: 91, type: 'ใบสั่งซื้อ', amt: 56000, status: 'review' },
];

const RISKS = [
  { lvl: 'critical', code: 'EXPENSE_WITHOUT_APPROVAL', title: 'รายจ่าย ฿42,300 ไม่มีเอกสารแนบ', desc: 'ค่าวัสดุการเรียน 3 รายการในเดือนนี้ยังไม่มีใบเสร็จหรือใบกำกับภาษี — ต้องแก้ก่อนปิดงวด' },
  { lvl: 'critical', code: 'UNMATCHED_BANK',           title: 'เงินเข้า ฿184,500 ยังไม่จับคู่กับเอกสารขาย', desc: 'KBank 8 พ.ค. 2569 จาก รร.เทศบาล 1 เชียงราย — แนะนำจับคู่กับ INV-2569-0124' },
  { lvl: 'high',     code: 'VAT_RISK',                 title: 'ใบกำกับภาษีเลขผู้เสียภาษีไม่ชัด',           desc: 'TAX-INV-202604-0067 ของ บจก. คลาวด์โซน อ่านได้บางส่วน — ขอเอกสารใหม่' },
  { lvl: 'high',     code: 'WHT_RISK',                 title: 'รายการนี้อาจเข้าข่าย WHT 3%',                desc: 'ค่าจ้างผลิตสื่อมัลติมีเดีย ฿56,000 — แนะนำหัก ณ ที่จ่าย และออกหนังสือรับรอง' },
  { lvl: 'medium',   code: 'DUPLICATE_DOCUMENT',       title: 'พบใบเสร็จที่อาจซ้ำกัน',                       desc: 'TAX-INV-202605-0089 และ TAX-INV-202605-0091 มีจำนวนเงินเท่ากัน เลขผู้ขายเดียวกัน' },
  { lvl: 'medium',   code: 'TAX_ID_MISSING',           title: 'ลูกค้า 1 รายไม่มีเลขผู้เสียภาษี',              desc: 'โรงเรียนบ้านดู่ — เพิ่มก่อนออกใบกำกับภาษี' },
  { lvl: 'low',      code: 'LOW_PROFIT_PROJECT',       title: 'โครงการกำไรต่ำกว่าเป้า',                       desc: 'PRJ-2569-004 พัฒนา e-Learning — ต้นทุนเกินรายรับ ฿50,000' },
];

const NAV = [
  { group: 'ภาพรวม', items: [
    { id: 'dashboard', label: 'Dashboard', ico: 'home' },
    { id: 'ai-inbox', label: 'AI Inbox', ico: 'inbox', pill: 7 },
  ]},
  { group: 'เอกสาร', items: [
    { id: 'sales',     label: 'เอกสารขาย', ico: 'doc' },
    { id: 'review',    label: 'รีวิวเอกสาร AI', ico: 'magic' },
    { id: 'pdf',       label: 'ตัวอย่าง PDF', ico: 'file' },
    { id: 'expenses',  label: 'รายจ่าย', ico: 'card' },
    { id: 'projects',  label: 'โครงการ', ico: 'layers' },
  ]},
  { group: 'การเงิน & ภาษี', items: [
    { id: 'tax',       label: 'ภาษี VAT / WHT', ico: 'percent' },
    { id: 'risks',     label: 'Risk Center', ico: 'shield', pill: 7 },
    { id: 'closing',   label: 'ปิดงวดเดือน', ico: 'lock' },
  ]},
  { group: 'ตั้งค่า', items: [
    { id: 'settings',  label: 'ตั้งค่าบริษัท', ico: 'gear' },
  ]},
];

// Projects align with real business: education software, training, multimedia, school IT
const PROJECTS = [
  { name: 'ระบบบริหารสถานศึกษา — รร.เทศบาล 1', code: 'PRJ-2569-007', status: 'ดำเนินการ', revenue: 480000, cost: 312000, progress: 72 },
  { name: 'สื่อมัลติมีเดียวิทยาศาสตร์ ม.ต้น', code: 'PRJ-2569-006', status: 'ดำเนินการ', revenue: 220000, cost: 168000, progress: 55 },
  { name: 'ติดตั้งห้องคอมพิวเตอร์ — รร.บ้านดู่', code: 'PRJ-2569-005', status: 'ส่งมอบ', revenue: 98000, cost: 71200, progress: 100 },
  { name: 'แพลตฟอร์ม e-Learning ราชภัฏเชียงราย', code: 'PRJ-2569-004', status: 'ดำเนินการ', revenue: 360000, cost: 410000, progress: 45 },
];

window.HJ = { COMPANY, fmtTHB, formatThaiDate, formatThaiDateShort, formatThaiDateTime, STATS, RECENT_DOCS, INBOX, RISKS, NAV, PROJECTS };
