import { AppTopbar } from '@/components/AppTopbar';

export default function DashboardPage() {
  return (
    <>
      <AppTopbar title="Dashboard" />
      <div className="flex-1 px-7 pb-16 pt-6">
        <h1 className="text-2xl font-bold tracking-tight">สวัสดีครับ</h1>
        <p className="mt-2 text-text-mute">
          Phase 0 พื้นฐานพร้อมแล้ว — Sales documents และ PDF generation จะเริ่มใน Phase 1
        </p>
      </div>
    </>
  );
}
