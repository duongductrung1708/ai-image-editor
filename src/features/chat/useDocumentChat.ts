import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ChatMessage } from "./types";

interface UseDocumentChatOptions {
  /** URL của ảnh tài liệu đang OCR (blob: hoặc data: hoặc http). */
  imageUrl: string;
  /** Text đã OCR (markdown / plain). */
  ocrText: string;
  /** Reset chat khi key đổi (vd: ảnh khác). */
  sessionKey: string;
}

async function urlToBase64(url: string): Promise<{ base64: string; mime: string }> {
  const res = await fetch(url);
  const blob = await res.blob();
  const mime = blob.type || "image/png";
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + CHUNK)),
    );
  }
  return { base64: btoa(binary), mime };
}

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useDocumentChat({
  imageUrl,
  ocrText,
  sessionKey,
}: UseDocumentChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imgCacheRef = useRef<{ key: string; base64: string; mime: string } | null>(
    null,
  );

  // Reset on session change
  useEffect(() => {
    setMessages([]);
    setError(null);
    setIsSending(false);
    imgCacheRef.current = null;
  }, [sessionKey]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isSending) return;
      if (!imageUrl) {
        setError("Chưa có ảnh để hỏi đáp.");
        return;
      }

      const userMsg: ChatMessage = {
        id: genId(),
        role: "user",
        content: trimmed,
        createdAt: Date.now(),
      };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setIsSending(true);
      setError(null);

      try {
        // Lazy convert image (cache per session).
        if (
          !imgCacheRef.current ||
          imgCacheRef.current.key !== sessionKey
        ) {
          const { base64, mime } = await urlToBase64(imageUrl);
          imgCacheRef.current = { key: sessionKey, base64, mime };
        }
        const { base64, mime } = imgCacheRef.current;

        const { data, error: fnError } = await supabase.functions.invoke(
          "chat-document",
          {
            body: {
              imageBase64: base64,
              mimeType: mime,
              ocrText,
              messages: nextMessages.map((m) => ({
                role: m.role,
                content: m.content,
              })),
            },
          },
        );

        if (fnError) throw fnError;
        const reply = (data as { reply?: string } | null)?.reply;
        if (!reply) throw new Error("Không nhận được phản hồi từ AI.");

        setMessages((prev) => [
          ...prev,
          {
            id: genId(),
            role: "assistant",
            content: reply,
            createdAt: Date.now(),
          },
        ]);
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Có lỗi khi gửi câu hỏi.";
        setError(msg);
      } finally {
        setIsSending(false);
      }
    },
    [imageUrl, isSending, messages, ocrText, sessionKey],
  );

  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, isSending, error, send, reset };
}
