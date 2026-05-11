'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AuthUser } from '@hj/shared-types';
import { AppSidebar } from '@/components/AppSidebar';
import { ToastProvider } from '@/components/ui/Toast';
import { getUser, getToken } from '@/lib/auth';

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
    <ToastProvider>
      <div className="grid min-h-screen grid-cols-[248px_1fr]">
        <AppSidebar user={user} />
        <main className="flex min-w-0 flex-col">{children}</main>
      </div>
    </ToastProvider>
  );
}
