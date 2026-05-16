import type { Metadata } from 'next';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import './globals.css';
import 'react-toastify/dist/ReactToastify.css';

export const metadata: Metadata = {
  title: 'HJ Account AI',
  description: 'ระบบบัญชี หจก. AI-First',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body>
        <AntdRegistry>
          <div className="ambient" />
          <div className="relative z-[1]">{children}</div>
        </AntdRegistry>
      </body>
    </html>
  );
}
