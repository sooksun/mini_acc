'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LoginResponse } from '@hj/shared-types';
import { api } from '@/lib/api';
import { saveSession } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('owner@solutionsnextgen.co.th');
  const [password, setPassword] = useState('owner123!');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      saveSession(res);
      router.replace('/dashboard');
    } catch (err: any) {
      setError(err.message ?? 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-7 shadow-lg"
      >
        <div className="mb-5 flex items-center gap-3">
          <img
            src="/logo.png"
            alt="HJ Account AI"
            className="h-10 w-10 rounded-[10px] object-contain"
          />
          <div>
            <div className="text-[15px] font-bold">HJ Account AI</div>
            <div className="text-[11px] text-text-mute">เข้าสู่ระบบ</div>
          </div>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-[12px] text-text-soft">อีเมล</span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[14px] outline-none focus:border-brand"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-[12px] text-text-soft">รหัสผ่าน</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[14px] outline-none focus:border-brand"
          />
        </label>

        {error && (
          <div className="mb-3 rounded-md border border-bad/40 bg-bad/5 px-3 py-2 text-[12.5px] text-bad">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-brand-gradient py-2.5 text-[14px] font-medium text-white shadow-md transition-opacity disabled:opacity-50"
        >
          {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
        </button>
      </form>
    </div>
  );
}
