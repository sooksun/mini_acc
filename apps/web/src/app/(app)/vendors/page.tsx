import { PartnersList } from '@/features/partners/PartnersList';

export default function VendorsPage() {
  return (
    <PartnersList
      mode="VENDOR"
      title="ผู้ขาย"
      description="ผู้ขายที่ใช้บันทึกรายจ่ายและใบกำกับภาษีซื้อ"
    />
  );
}
