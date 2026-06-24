// Human title + pre-designed Thai guidance per route prefix. Used by the
// assistant panel:
//  - title: label a page that hasn't registered a form, and seed advice context.
//  - advice: shown DIRECTLY for create/read/delete pages (no screen read, no LLM)
//            — instant, free, private. Only Update (edit) pages read the screen
//            and ask the LLM for tailored advice.
// Longest-prefix match (so /sales/invoices beats /sales).

interface RouteEntry {
  prefix: string;
  title: string;
  advice: string;
}

const ROUTES: RouteEntry[] = [
  { prefix: '/dashboard', title: 'ภาพรวม', advice: 'หน้าภาพรวมกิจการ — ดูสรุปรายรับ รายจ่าย กำไรเบื้องต้น และงานที่ค้างอยู่ คลิกการ์ดเพื่อเจาะดูรายละเอียดแต่ละส่วน' },
  { prefix: '/profit-loss', title: 'สรุปกำไรขาดทุน', advice: 'เลือกปี/เดือนเพื่อดูรายรับ–รายจ่าย–กำไร คลิกแท่งกราฟหรือแถวเดือนเพื่อเจาะรายเดือน ตัวเลขคำนวณจากสมุดรายวัน (ก่อน VAT)' },
  { prefix: '/trial-balance', title: 'งบทดลอง', advice: 'งบทดลอง — ยอดสะสมทุกบัญชี ณ สิ้นงวด ตรวจว่าเดบิตรวม = เครดิตรวม (มีป้ายสมดุลด้านบน) เลือกปี/เดือนได้' },
  { prefix: '/balance-sheet', title: 'งบแสดงฐานะการเงิน', advice: 'งบแสดงฐานะการเงิน — สินทรัพย์ทางซ้าย หนี้สิน+ส่วนของผู้ถือหุ้นทางขวา ต้องเท่ากัน กำไรงวดปัจจุบันรวมอยู่ในส่วนของผู้ถือหุ้น' },
  { prefix: '/general-ledger', title: 'บัญชีแยกประเภท', advice: 'เลือกบัญชีจากช่องด้านบนเพื่อดูยอดยกมา รายการเคลื่อนไหว และยอดคงเหลือแบบ Dr/Cr เลือกช่วงเวลาได้' },
  { prefix: '/sales/quotations', title: 'ใบเสนอราคา', advice: 'ออกใบเสนอราคา: กดสร้างใหม่ → เลือกลูกค้า → เพิ่มรายการสินค้า/บริการ → บันทึกเป็นร่าง จากนั้นกดยืนยันเพื่อออกเลขที่จริง พิมพ์คำสั่งให้ผมช่วยกรอกได้' },
  { prefix: '/sales/invoices', title: 'ใบแจ้งหนี้', advice: 'ออกใบแจ้งหนี้: เลือกลูกค้าและรายการ ระบบคำนวณ VAT/หัก ณ ที่จ่ายให้ บันทึกร่างแล้วยืนยันเพื่อลงบัญชี (ตั้งลูกหนี้)' },
  { prefix: '/sales/receipt-tax-invoices', title: 'ใบเสร็จ/ใบกำกับภาษี', advice: 'ออกใบเสร็จ/ใบกำกับภาษี: ลูกค้าต้องมีเลขผู้เสียภาษี 13 หลัก และวันที่ต้องอยู่หลังวันจดทะเบียน VAT จึงจะยืนยันได้' },
  { prefix: '/sales/delivery-notes', title: 'ใบส่งของ', advice: 'ออกใบส่งของ: เลือกลูกค้าและรายการที่จะส่ง บันทึกแล้วใช้เป็นหลักฐานการส่งมอบ' },
  { prefix: '/sales/receipts', title: 'ใบเสร็จรับเงิน', advice: 'ออกใบเสร็จรับเงิน: เลือกลูกค้าและรายการ บันทึกร่างแล้วยืนยัน' },
  { prefix: '/sales/tax-invoices', title: 'ใบกำกับภาษี', advice: 'ออกใบกำกับภาษี: ลูกค้าต้องมีเลขผู้เสียภาษี 13 หลัก และวันที่ต้องอยู่หลังวันจดทะเบียน VAT' },
  { prefix: '/sales', title: 'เอกสารขาย', advice: 'จัดการเอกสารขาย — สร้าง/แก้ไข แล้วยืนยันเพื่อออกเลขที่จริงและลงบัญชี ใช้ตัวกรองด้านบนเพื่อค้นหา' },
  { prefix: '/ai-inbox', title: 'AI Inbox', advice: 'อัปโหลดเอกสารให้ AI อ่านข้อมูลตั้งต้น แล้วตรวจ/แก้ก่อนยืนยันเข้าระบบ — AI อ่านให้ คนยืนยันเสมอ' },
  { prefix: '/expenses', title: 'อัปโหลดใบเสร็จ', advice: 'บันทึกรายจ่าย: อัปโหลดใบเสร็จ → AI อ่านข้อมูล → ตรวจ เลือกผู้ขาย/หมวด/โครงการ → บันทึก (ลงบัญชีให้อัตโนมัติ)' },
  { prefix: '/payments', title: 'รับ/จ่ายเงิน', advice: 'บันทึกรับ/จ่ายเงิน: เลือกทิศทาง (รับ/จ่าย) → เลือกคู่ค้า → ใส่จำนวนเงินและวิธีจ่าย ระบบจะตัดยอดลูกหนี้/เจ้าหนี้ให้' },
  { prefix: '/bank', title: 'กระทบยอดบัญชีธนาคาร', advice: 'นำเข้ารายการเดินบัญชี (CSV/JSON) แล้วจับคู่กับการรับ/จ่ายเงินในระบบ รายการที่ยังไม่จับคู่จะค้างไว้ให้ตรวจ' },
  { prefix: '/tax', title: 'ภาษี VAT/WHT', advice: 'ดูสรุปภาษีขาย/ภาษีซื้อ และหัก ณ ที่จ่ายรายเดือน ใช้สำหรับเตรียมยื่น ภ.พ.30 / ภ.ง.ด.' },
  { prefix: '/wht-certificates', title: 'หนังสือรับรอง 50 ทวิ', advice: 'ออกหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) จากรายการที่หักภาษีไว้' },
  { prefix: '/customers', title: 'ลูกค้า', advice: 'จัดการลูกค้า: กดเพิ่มเพื่อสร้างใหม่ ใส่เลขผู้เสียภาษี 13 หลักด้วยถ้าต้องออกใบกำกับภาษี ค้นหาด้วยช่องด้านบน' },
  { prefix: '/vendors', title: 'ผู้ขาย', advice: 'จัดการผู้ขาย: เพิ่ม/แก้ไขข้อมูลผู้ขายและเลขผู้เสียภาษี (จำเป็นสำหรับการหัก ณ ที่จ่าย)' },
  { prefix: '/products', title: 'สินค้า/บริการ', advice: 'จัดการสินค้า/บริการ: ตั้งชื่อ ราคาขาย หน่วยนับ และระบุว่าคิด VAT 7% หรือไม่ ใช้ในเอกสารขาย' },
  { prefix: '/projects', title: 'โครงการ', advice: 'จัดการโครงการ: ผูกใบแจ้งหนี้และรายจ่ายเข้าโครงการเพื่อดูกำไรจริงต่อโครงการ กดปุ่ม "กำไร" เพื่อดูสรุป' },
  { prefix: '/inventory', title: 'คลังสินค้า', advice: 'ดูยอดคงเหลือและบันทึกการเคลื่อนไหวสินค้า (รับเข้า/ตัดออก/ปรับยอด) การตัดออกจะตรวจสต็อกคงเหลือ' },
  { prefix: '/assets', title: 'ทรัพย์สินถาวร', advice: 'บันทึกทรัพย์สินถาวร อายุการใช้งาน และค่าเสื่อมราคา กดคำนวณค่าเสื่อมเพื่อลงบัญชี' },
  { prefix: '/risks', title: 'ศูนย์ความเสี่ยง', advice: 'AI ตรวจพบความเสี่ยง (เอกสารขาด เลขซ้ำ ภาษีเสี่ยง ฯลฯ) — ตรวจและจัดการก่อนปิดงวด ความเสี่ยง CRITICAL จะปิดงวดไม่ได้' },
  { prefix: '/year-end-closing', title: 'ปิดบัญชีสิ้นปี', advice: 'เลือกปีเพื่อดูยอดรายได้/ค่าใช้จ่ายที่จะโอนไปกำไรสะสม ตรวจตัวเลขแล้วกดปิดบัญชี (สร้างรายการปิดลงวันที่ 31 ธ.ค.)' },
  { prefix: '/closing', title: 'ปิดงวดบัญชี', advice: 'ปิดงวดรายเดือน: ระบบตรวจความเสี่ยง/ความครบถ้วน แล้วล็อกเอกสารของงวดนั้น แก้รายการที่ติดบล็อกก่อนจึงปิดได้' },
  { prefix: '/accountant-pack', title: 'แพ็กสำหรับนักบัญชี', advice: 'ส่งออกชุดข้อมูลทั้งงวด (ZIP) ให้สำนักงานบัญชี — สร้างจากงวดที่ปิดแล้ว ดาวน์โหลดซ้ำได้' },
  { prefix: '/settings/chart-accounts', title: 'ผังบัญชี', advice: 'จัดการผังบัญชี: บัญชีระบบแก้ได้เฉพาะชื่อ เพิ่มบัญชีของคุณเองเพื่อใช้ในรายการสมุดรายวันได้' },
  { prefix: '/settings/users', title: 'ผู้ใช้และสิทธิ์', advice: 'จัดการผู้ใช้และบทบาท (สิทธิ์) เพิ่มผู้ใช้ใหม่หรือแก้บทบาท/ปิดบัญชี — เปลี่ยนรหัสผ่านได้ที่นี่' },
  { prefix: '/settings/document-numbering', title: 'เลขเอกสาร', advice: 'ตั้งค่ารูปแบบเลขเอกสารแต่ละประเภท (คำนำหน้า/การรีเซ็ตเลขรายปี)' },
  { prefix: '/settings/audit-log', title: 'บันทึกการตรวจสอบ', advice: 'ดูประวัติการกระทำสำคัญทั้งหมดในระบบ (ใคร ทำอะไร เมื่อไหร่) กรองตามประเภทได้' },
  { prefix: '/settings/company', title: 'ตั้งค่าบริษัท', advice: 'ตั้งค่าข้อมูลบริษัท ที่อยู่ เลขผู้เสียภาษี และวันจดทะเบียน VAT (มีผลต่อการออกใบกำกับภาษี)' },
  { prefix: '/settings', title: 'ตั้งค่า', advice: 'หน้าตั้งค่าระบบ — เลือกหัวข้อที่ต้องการปรับจากเมนู' },
];

function match(pathname: string): RouteEntry | undefined {
  let best: RouteEntry | undefined;
  for (const r of ROUTES) {
    if (pathname.startsWith(r.prefix) && (!best || r.prefix.length > best.prefix.length)) {
      best = r;
    }
  }
  return best;
}

/** Longest-prefix title for a pathname; 'หน้านี้' if nothing matches. */
export function routeTitle(pathname: string): string {
  return match(pathname)?.title ?? 'หน้านี้';
}

/** Pre-designed Thai guidance for a pathname (for create/read/delete pages). */
export function routeAdvice(pathname: string): string {
  return (
    match(pathname)?.advice ??
    'พิมพ์บอกผมได้เลยว่าต้องการทำอะไรในหน้านี้ เดี๋ยวผมช่วยแนะนำและกรอกฟอร์มให้'
  );
}
