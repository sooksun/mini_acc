'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DependencyList,
  type ReactNode,
} from 'react';
import type { AssistantFieldSchema, AssistantOperation } from '@hj/shared-types';
import { api } from '@/lib/api';

// A page (or modal) describes itself to the assistant: the form's field schema
// plus a getter for current values and a setter to fill values in. The assistant
// reads `fields`/`getCurrentValues` and calls `applyValues` — it never submits.
export interface PageDescriptor {
  route: string;
  title: string;
  fields: AssistantFieldSchema[];
  listEmpty?: boolean;
  /** 'edit' = Update → auto-advice reads the screen + values; 'create' = static advice. */
  operation?: AssistantOperation;
  getCurrentValues: () => Record<string, unknown>;
  applyValues: (partial: Record<string, unknown>) => void;
}

interface AssistantContextValue {
  descriptor: PageDescriptor | null;
  register: (d: PageDescriptor) => void;
  unregister: (route: string) => void;
  enabled: boolean;
  autoAdvice: boolean;
  setEnabled: (v: boolean) => void;
  setAutoAdvice: (v: boolean) => void;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

const ENABLED_KEY = 'hj-assistant-enabled';
const AUTOADVICE_KEY = 'hj-assistant-autoadvice';

/** Pure: a localStorage toggle is ON unless explicitly '0' (default ON). */
export function toggleOn(raw: string | null): boolean {
  return raw !== '0';
}

/** Pure: unregister clears the active descriptor only if its route matches —
 *  so a late cleanup from an unmounting page can't wipe a newer page's descriptor. */
export function resolveUnregister(
  current: PageDescriptor | null,
  route: string,
): PageDescriptor | null {
  return current?.route === route ? null : current;
}

/** Capture the visible text of the page's main content (no input values, no
 *  keystrokes) for richer context. Capped; safe to call without a DOM. */
export function captureScreenText(max = 4000): string {
  if (typeof document === 'undefined') return '';
  const main = document.querySelector('main') as HTMLElement | null;
  const text = (main?.innerText ?? '').replace(/\n{3,}/g, '\n\n').trim();
  return text.slice(0, max);
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [descriptor, setDescriptor] = useState<PageDescriptor | null>(null);
  const [enabled, setEnabledState] = useState(true);
  const [autoAdvice, setAutoAdviceState] = useState(true);

  useEffect(() => {
    // 1) localStorage = instant, offline cache.
    try {
      setEnabledState(toggleOn(localStorage.getItem(ENABLED_KEY)));
      setAutoAdviceState(toggleOn(localStorage.getItem(AUTOADVICE_KEY)));
    } catch {
      // ignore unavailable storage
    }
    // 2) server = source of truth (syncs across devices); override + cache.
    api<{ assistantEnabled: boolean; assistantAutoAdvice: boolean }>('/users/me/preferences')
      .then((p) => {
        setEnabledState(p.assistantEnabled);
        setAutoAdviceState(p.assistantAutoAdvice);
        try {
          localStorage.setItem(ENABLED_KEY, p.assistantEnabled ? '1' : '0');
          localStorage.setItem(AUTOADVICE_KEY, p.assistantAutoAdvice ? '1' : '0');
        } catch {
          /* ignore */
        }
      })
      .catch(() => undefined);
  }, []);

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    try {
      localStorage.setItem(ENABLED_KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
    api('/users/me/preferences', { method: 'PATCH', body: JSON.stringify({ assistantEnabled: v }) }).catch(
      () => undefined,
    );
  }, []);

  const setAutoAdvice = useCallback((v: boolean) => {
    setAutoAdviceState(v);
    try {
      localStorage.setItem(AUTOADVICE_KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
    api('/users/me/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ assistantAutoAdvice: v }),
    }).catch(() => undefined);
  }, []);

  const register = useCallback((d: PageDescriptor) => setDescriptor(d), []);
  const unregister = useCallback(
    (route: string) => setDescriptor((cur) => resolveUnregister(cur, route)),
    [],
  );

  const value = useMemo<AssistantContextValue>(
    () => ({ descriptor, register, unregister, enabled, autoAdvice, setEnabled, setAutoAdvice }),
    [descriptor, register, unregister, enabled, autoAdvice, setEnabled, setAutoAdvice],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant(): AssistantContextValue {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error('useAssistant must be used within AssistantProvider');
  return ctx;
}

/** Optional accessor that returns null outside a provider (for components that
 *  may render before the provider, defensive). */
export function useAssistantOptional(): AssistantContextValue | null {
  return useContext(AssistantContext);
}

/**
 * Register the current page's form with the assistant. `make` returns the live
 * descriptor; it's kept in a ref so the panel always reads/writes the latest
 * closures, while registration only re-runs when `deps` (schema-shaping inputs
 * like mode/type) change — so typing in the form does NOT re-register.
 */
export function useRegisterPageDescriptor(
  make: () => PageDescriptor | null,
  deps: DependencyList,
) {
  const ctx = useContext(AssistantContext);
  const makeRef = useRef(make);
  makeRef.current = make;

  useEffect(() => {
    if (!ctx) return;
    const built = makeRef.current();
    if (!built) return; // nothing to register (e.g. a closed modal form)
    const route = built.route;
    ctx.register({
      route,
      title: built.title,
      fields: built.fields,
      listEmpty: built.listEmpty,
      operation: built.operation,
      getCurrentValues: () => makeRef.current()?.getCurrentValues() ?? {},
      applyValues: (p) => makeRef.current()?.applyValues(p),
    });
    return () => ctx.unregister(route);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
