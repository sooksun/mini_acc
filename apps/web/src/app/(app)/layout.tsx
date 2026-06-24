'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AuthUser } from '@hj/shared-types';
import { ConfigProvider, App as AntdApp } from 'antd';
import th from 'antd/locale/th_TH';
import { ToastContainer } from 'react-toastify';
import { AppSidebar } from '@/components/AppSidebar';
import { getUser, getToken } from '@/lib/auth';
import { AssistantProvider } from '@/contexts/AssistantContext';
import { AssistantPanel } from '@/components/assistant/AssistantPanel';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace('/login');
      return;
    }
    setUser(getUser());
    setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <ConfigProvider
      locale={th}
      theme={{
        token: {
          colorPrimary: '#6d4dff',
          colorLink: '#6d4dff',
          borderRadius: 8,
          fontFamily: "'IBM Plex Sans Thai', system-ui, sans-serif",
          fontSize: 13,
        },
        components: {
          DatePicker: {
            activeBorderColor: '#6d4dff',
            hoverBorderColor: '#6d4dff',
          },
        },
      }}
    >
      <AntdApp>
        <ToastContainer
          position="bottom-right"
          autoClose={3500}
          hideProgressBar
          newestOnTop
          closeOnClick
          pauseOnHover
          theme="light"
          style={{ zIndex: 9999 }}
        />
        <AssistantProvider>
          <div className="grid min-h-screen grid-cols-[248px_1fr]">
            <AppSidebar user={user} />
            <main className="flex min-w-0 flex-col">{children}</main>
          </div>
          <AssistantPanel />
        </AssistantProvider>
      </AntdApp>
    </ConfigProvider>
  );
}
