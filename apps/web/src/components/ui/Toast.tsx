'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Math.random().toString(36).slice(2, 10);
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const api: ToastApi = {
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const styles: Record<ToastKind, string> = {
    success: 'border-ok/40 bg-ok/10 text-ok',
    error: 'border-bad/40 bg-bad/10 text-bad',
    info: 'border-info/40 bg-info/10 text-info',
  };
  return (
    <div
      role="status"
      className={`pointer-events-auto min-w-[260px] max-w-[420px] rounded-md border px-4 py-2.5 text-[13px] shadow-md backdrop-blur-md ${styles[toast.kind]}`}
    >
      {toast.message}
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) {
    return {
      success: (m) => console.log('[toast.success]', m),
      error: (m) => console.error('[toast.error]', m),
      info: (m) => console.info('[toast.info]', m),
    };
  }
  return ctx;
}
