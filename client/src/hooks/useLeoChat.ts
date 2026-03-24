import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpcClient";
import {
  sendMessageToLeo,
  normalizeLeoResponse,
  type LeoChatResponse,
} from "@/services/leoChatService";
import { sanitizePlainTextInput } from "@/lib/security/sanitizePayload";

export type ChatMessage = {
  id: string;
  role: "user" | "leo";
  content: string;
  /** Resposta estruturada do LEO (action, data, context) */
  leoResponse?: LeoChatResponse;
  timestamp: Date;
};

export function useLeoChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trpcAsk = trpc.leo.ask.useMutation({
    onError(err) {
      setError(err.message || "Erro ao falar com o LEO.");
      setLoading(false);
    },
  });

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = sanitizePlainTextInput(text);
      if (!trimmed || loading) return;

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: trimmed,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);
      setError(null);

      try {
        let leoResponse: LeoChatResponse;

        try {
          leoResponse = await sendMessageToLeo(trimmed);
        } catch (restErr: unknown) {
          const is404 =
            restErr instanceof Error && restErr.message === "LEO_CHAT_NOT_AVAILABLE";
          if (is404 || (restErr as { message?: string })?.message?.includes("fetch")) {
            const result = await trpcAsk.mutateAsync({ pergunta: trimmed });
            const raw =
              result && typeof result === "object" && "resposta" in result
                ? (result as { resposta: unknown }).resposta
                : (result as { mensagem?: unknown })?.mensagem ?? result;
            leoResponse = normalizeLeoResponse(raw);
          } else {
            throw restErr;
          }
        }

        const leoMsg: ChatMessage = {
          id: `leo-${Date.now()}`,
          role: "leo",
          content: leoResponse.response,
          leoResponse,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, leoMsg]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao enviar mensagem.";
        setError(msg);
        const fallbackMsg: ChatMessage = {
          id: `leo-err-${Date.now()}`,
          role: "leo",
          content: `Não foi possível obter resposta: ${msg}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, fallbackMsg]);
      } finally {
        setLoading(false);
      }
    },
    [loading, trpcAsk]
  );

  const clearHistory = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    loading,
    error,
    sendMessage,
    clearHistory,
  };
}
