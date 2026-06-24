'use client';

import { ThemeToggle } from './ThemeToggle';

export function AppTopbar({ title }: { title: string }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3.5 border-b border-border bg-bg/80 px-7 py-3.5 backdrop-blur-md">
      <div className="text-[12.5px] text-text">
        หน้าแรก · <b className="font-semibold">{title}</b>
      </div>
      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </div>
  );
}
