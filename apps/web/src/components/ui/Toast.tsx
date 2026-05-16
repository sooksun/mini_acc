'use client';

/**
 * Toast.tsx — thin shim over react-toastify.
 *
 * Keeps the existing `useToast()` API so all callers work without changes.
 * ToastProvider is a no-op wrapper kept for backward compatibility;
 * the actual <ToastContainer> is rendered in (app)/layout.tsx.
 */

import { toast } from 'react-toastify';

export interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

/** Backward-compat wrapper — no longer renders anything meaningful */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/**
 * Returns toast helpers backed by react-toastify.
 * Can be used in any client component (no context required).
 */
export function useToast(): ToastApi {
  return {
    success: (m) => toast.success(m),
    error: (m) => toast.error(m),
    info: (m) => toast.info(m),
  };
}
