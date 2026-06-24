'use client';

import { useCallback, useState } from 'react';
import type { AssistantChatResponse, AssistantPageContext } from '@hj/shared-types';
import { api } from '@/lib/api';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Holds the chat transcript and drives /assistant/chat. The server is stateless,
 * so the full transcript is sent each turn. Returns the raw response so the
 * caller (panel) can apply a `fill` to the page's form.
 */
export function useAssistantChat() {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (text: string, context: AssistantPageContext): Promise<AssistantChatResponse | null> => {
      const trimmed = text.trim();
      if (!trimmed) return null;
      const history: ChatTurn[] = [...messages, { role: 'user', content: trimmed }];
      setMessages(history);
      setSending(true);
      setError(null);
      try {
        const res = await api<AssistantChatResponse>('/assistant/chat', {
          method: 'POST',
          body: JSON.stringify({ context, messages: history }),
        });
        setMessages((m) => [...m, { role: 'assistant', content: res.message }]);
        return res;
      } catch (e) {
        setError((e as Error).message ?? 'ส่งข้อความไม่สำเร็จ');
        return null;
      } finally {
        setSending(false);
      }
    },
    [messages],
  );

  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, sending, error, send, reset };
}
