'use client';

import { useEffect, useState } from 'react';

const KEY = 'hj-theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const saved = (localStorage.getItem(KEY) as 'light' | 'dark' | null) ?? 'light';
    setTheme(saved);
    document.documentElement.setAttribute('data-theme', saved);
  }, []);

  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(KEY, next);
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="relative h-8 w-[60px] rounded-full border border-border bg-surface px-1 transition-colors"
    >
      <span
        className="absolute top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-brand-gradient text-[10px] font-semibold text-white shadow-md transition-transform duration-300"
        style={{ transform: `translate(${theme === 'dark' ? 28 : 0}px, -50%)` }}
      >
        {theme === 'dark' ? 'D' : 'L'}
      </span>
    </button>
  );
}
