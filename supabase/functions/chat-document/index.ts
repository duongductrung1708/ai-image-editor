/// <reference lib="deno.ns" />

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type ChatRole = "user" | "assistant";
interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface RequestBody {
  imageBase64?: string;
  mimeType?: string;
  ocrText?: string;
  messages?: ChatMessage[];
}

function badRequest(msg: string) {
  return new Response(JSON.stringify({ error: msg }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function serverError(msg: string, status = 500) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripDataUrl(b64: string): { data: string; mime?: string } {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(b64.trim());
  if (m) return { mime: m[1], data: m[2] };
  return { data: b64.trim() };
}

const SYSTEM_PROMPT =
  "Bạn là trợ lý của VetaOCR. Người dùng vừa OCR một ảnh tài liệu và đang hỏi đáp về nội dung của ảnh đó. " +
  "Bạn nhận được: (1) ảnh tài liệu gốc, (2) văn bản đã được trích xuất từ ảnh, (3) lịch sử hội thoại. " +
  "Hãy trả lời ngắn gọn, chính xác bằng tiếng Việt, dựa trên nội dung tài liệu. " +
  "Nếu thông tin không có trong tài liệu, hãy nói rõ là không tìm thấy trong tài liệu. " +
  "Có thể trả lời bằng Markdown khi cần (danh sách, bảng, in đậm).";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return serverError("Method not allowed", 405);
  }

  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) return serverError("GEMINI_API_KEY is not configured");

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) return badRequest("messages is required");

  const ocrText = (body.ocrText || "").toString().slice(0, 60_000);
  const imageRaw = (body.imageBase64 || "").toString();
  if (!imageRaw) return badRequest("imageBase64 is required");
  const stripped = stripDataUrl(imageRaw);
  const mimeType = body.mimeType || stripped.mime || "image/png";

  const model = (Deno.env.get("GEMINI_CHAT_MODEL") || "gemini-2.5-flash").replace(
    /^models\//,
    "",
  );

  // Build Gemini contents.
  // First user turn carries: ocr text + image. Subsequent turns are pure text.
  const firstUserIdx = messages.findIndex((m) => m.role === "user");
  if (firstUserIdx === -1) return badRequest("No user message");

  const contents: Array<{
    role: "user" | "model";
    parts: Array<
      | { text: string }
      | { inline_data: { mime_type: string; data: string } }
    >;
  }> = [];

  messages.forEach((m, i) => {
    const role = m.role === "assistant" ? "model" : "user";
    const parts: Array<
      | { text: string }
      | { inline_data: { mime_type: string; data: string } }
    > = [];
    if (i === firstUserIdx) {
      const ctxBlock = ocrText
        ? `Văn bản đã OCR từ ảnh:\n"""\n${ocrText}\n"""\n\nCâu hỏi của tôi:\n${m.content}`
        : `Câu hỏi của tôi về tài liệu trong ảnh:\n${m.content}`;
      parts.push({ text: ctxBlock });
      parts.push({ inline_data: { mime_type: mimeType, data: stripped.data } });
    } else {
      parts.push({ text: m.content });
    }
    contents.push({ role, parts });
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: {
          temperature: 0.4,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      console.error("[chat-document] gemini error", r.status, errText);
      return serverError(
        `Gemini error ${r.status}: ${errText.slice(0, 400)}`,
        r.status === 429 ? 429 : 502,
      );
    }

    const data = await r.json();
    const candidate = data?.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const text =
      (candidate?.content?.parts || [])
        .map((p: { text?: string }) => p?.text || "")
        .join("")
        .trim() || "";

    if (!text) {
      if (finishReason === "RECITATION") {
        return new Response(
          JSON.stringify({
            reply:
              "Xin lỗi, tôi không thể trả lời câu hỏi này do giới hạn nội dung của mô hình. Bạn thử hỏi theo cách khác nhé.",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      return serverError("Empty response from model", 502);
    }

    return new Response(JSON.stringify({ reply: text }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[chat-document] fetch failed", e);
    return serverError("Failed to call Gemini API");
  }
});
