import { PartnersList } from '@/features/partners/PartnersList';

export default function VendorsPage() {
  return (
    <PartnersList
      mode="VENDOR"
      title="ผู้รับเงิน"
      description="จัดการร้านค้า ผู้รับจ้าง ลูกจ้าง และเจ้าหนี้ที่ หจก. ต้องจ่ายเงินให้"
    />
  );
}
