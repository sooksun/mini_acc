'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { AssistantPageAdviceResponse, AssistantPageContext } from '@hj/shared-types';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { captureScreenText, useAssistant, type PageDescriptor } from '@/contexts/AssistantContext';
import { routeAdvice, routeTitle } from '@/contexts/route-descriptions';
import { AssistantSettings } from './AssistantSettings';
import { useAssistantChat } from './useAssistantChat';

const ALLOWED_ROLES = ['OWNER', 'ADMIN', 'ACCOUNTANT'];

function buildContext(descriptor: PageDescriptor | null, pathname: string): AssistantPageContext {
  const op = descriptor?.operation;
  // Read the on-screen text ONLY for Update pages — create/read/delete advice is
  // pre-designed and never needs the screen.
  const screenText = op === 'edit' ? captureScreenText() : undefined;
  const staticAdvice = routeAdvice(pathname);
  if (descriptor) {
    return {
      route: descriptor.route,
      title: descriptor.title,
      fields: descriptor.fields,
      currentValues: descriptor.getCurrentValues(),
      listEmpty: descriptor.listEmpty,
      screenText,
      mode: op ?? 'create',
      staticAdvice,
    };
  }
  return {
    route: pathname,
    title: routeTitle(pathname),
    fields: [],
    currentValues: {},
    mode: 'read',
    staticAdvice,
  };
}

export function AssistantPanel() {
  const pathname = usePathname();
  const toast = useToast();
  const { descriptor, enabled, autoAdvice } = useAssistant();
  const chat = useAssistantChat();

  const [mounted, setMounted] = useState(false);
  const [role, setRole] = useState<string | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [advice, setAdvice] = useState<string | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [unread, setUnread] = useState(false);
  const [input, setInput] = useState('');

  // descriptor is read at fire-time so auto-advice/chat see the latest registration
  const descriptorRef = useRef<PageDescriptor | null>(descriptor);
  descriptorRef.current = descriptor;
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    setMounted(true);
    setRole(getUser()?.role);
  }, []);

  const roleAllowed = !!role && ALLOWED_ROLES.includes(role);

  // Auto-advice on page change.
  //  - create / read / delete (and unregistered pages) → pre-designed STATIC
  //    advice: no screen read, no LLM, no network — instant, free, private.
  //  - edit (Update) → read the field values + on-screen data and ask the LLM
  //    for tailored review/fill advice (debounced + abortable).
  useEffect(() => {
    if (!mounted || !roleAllowed || !enabled || !autoAdvice) return;
    const d = descriptorRef.current;

    if (d?.operation !== 'edit') {
      setAdviceLoading(false);
      setAdvice(routeAdvice(pathname));
      if (!openRef.current) setUnread(true);
      return;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      const ctx = buildContext(descriptorRef.current, pathname);
      setAdviceLoading(true);
      setAdvice(null);
      api<AssistantPageAdviceResponse>('/assistant/page-advice', {
        method: 'POST',
        body: JSON.stringify({ context: ctx }),
        signal: ctrl.signal,
      })
        .then((r) => {
          setAdvice(r.message);
          if (!openRef.current) setUnread(true);
        })
        .catch(() => undefined)
        .finally(() => setAdviceLoading(false));
    }, 450);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, mounted, roleAllowed, enabled, autoAdvice, descriptor]);

  if (!mounted || !roleAllowed) return null;

  async function handleSend() {
    const text = input.trim();
    if (!text || chat.sending) return;
    setInput('');
    const ctx = buildContext(descriptorRef.current, pathname);
    const res = await chat.send(text, ctx);
    if (res?.action === 'fill') {
      const d = descriptorRef.current;
      if (d) {
        try {
          d.applyValues(res.values);
          toast.success('กรอกให้แล้ว ตรวจสอบและกดบันทึก');
        } catch {
          toast.error('กรอกฟอร์มอัตโนมัติไม่สำเร็จ');
        }
      } else {
        toast.info('หน้านี้ยังไม่รองรับการกรอกอัตโนมัติ — ดูค่าที่แนะนำในแชต');
      }
    }
  }

  function openPanel() {
    setOpen(true);
    setUnread(false);
  }

  // ---- Collapsed FAB -------------------------------------------------------
  if (!open) {
    return (
      <button
        type="button"
        onClick={openPanel}
        aria-label="ผู้ช่วย AI"
        className={`fixed bottom-5 right-5 z-[9998] grid place-items-center rounded-full text-white shadow-lg transition-transform hover:scale-105 ${
          enabled ? 'bg-brand-gradient' : 'bg-surface-3 text-text-mute'
        }`}
        style={{ height: 52, width: 52 }}
      >
        <SparkIcon />
        {unread && enabled && (
          <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-bg bg-bad" />
        )}
      </button>
    );
  }

  // ---- Expanded panel ------------------------------------------------------
  return (
    <div className="fixed bottom-5 right-5 z-[9998] flex max-h-[70vh] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-2.5">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-brand-gradient text-white">
          <SparkIcon small />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-text">ผู้ช่วย AI</div>
          <div className="truncate text-[11px] text-text-mute">
            {descriptor?.title ?? routeTitle(pathname)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowSettings((s) => !s)}
          aria-label="ตั้งค่า"
          className={`grid h-7 w-7 place-items-center rounded-md hover:bg-surface-3 ${showSettings ? 'text-brand' : 'text-text-mute'}`}
        >
          <GearIcon />
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="ย่อ"
          className="grid h-7 w-7 place-items-center rounded-md text-text-mute hover:bg-surface-3"
        >
          <ChevronDownIcon />
        </button>
      </div>

      {showSettings ? (
        <AssistantSettings />
      ) : (
        <>
          {/* Scrollable body: page tip + chat thread */}
          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {!enabled && (
              <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-[12px] text-text-mute">
                ผู้ช่วยปิดอยู่ — เปิดได้ที่ปุ่มตั้งค่า (เฟือง) ด้านบน
              </div>
            )}

            {enabled && (adviceLoading || advice) && (
              <div className="rounded-md border border-brand/30 bg-brand/5 px-3 py-2 text-[12.5px] text-text-soft">
                <div className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-brand">
                  คำแนะนำหน้านี้
                </div>
                {adviceLoading ? <span className="text-text-mute">กำลังดูหน้านี้…</span> : advice}
              </div>
            )}

            {chat.messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[88%] rounded-lg px-3 py-2 text-[12.5px] ${
                  m.role === 'user'
                    ? 'ml-auto bg-brand-gradient text-white'
                    : 'mr-auto whitespace-pre-wrap bg-surface-2 text-text'
                }`}
              >
                {m.content}
              </div>
            ))}

            {chat.sending && (
              <div className="mr-auto rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-text-mute">
                กำลังคิด…
              </div>
            )}
            {chat.error && (
              <div className="rounded-md border border-bad/30 bg-bad/5 px-3 py-2 text-[12px] text-bad">
                {chat.error}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-border p-2">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                rows={1}
                disabled={!enabled}
                placeholder={enabled ? 'พิมพ์คำสั่ง เช่น "ออกใบแจ้งหนี้ให้ลูกค้า..."' : 'เปิดผู้ช่วยก่อนใช้งาน'}
                className="max-h-24 min-h-[38px] flex-1 resize-none rounded-md border border-border bg-surface-2 px-2.5 py-2 text-[12.5px] outline-none focus:border-brand disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!enabled || chat.sending || !input.trim()}
                className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-md bg-brand-gradient text-white disabled:opacity-50"
                aria-label="ส่ง"
              >
                <SendIcon />
              </button>
            </div>
            <div className="mt-1 px-1 text-[10px] text-text-faint">
              ผู้ช่วยกรอกให้เท่านั้น — คุณเป็นผู้กดบันทึกเอง
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Icons (inline, currentColor) ------------------------------------------
function SparkIcon({ small }: { small?: boolean }) {
  const s = small ? 14 : 22;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" />
      <path d="M19 14l.9 2.3L22 17l-2.1.7L19 20l-.9-2.3L16 17l2.1-.7z" />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function ChevronDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4z" />
    </svg>
  );
}
