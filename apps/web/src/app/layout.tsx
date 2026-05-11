import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HJ Account AI',
  description: 'ระบบบัญชี หจก. AI-First',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body>
        <div className="ambient" />
        <div className="relative z-[1]">{children}</div>
      </body>
    </html>
  );
}
