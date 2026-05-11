import { PartnersList } from '@/features/partners/PartnersList';

export default function CustomersPage() {
  return (
    <PartnersList
      mode="CUSTOMER"
      title="ลูกค้า"
      description="ลูกค้าที่ใช้ออกใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ"
    />
  );
}
