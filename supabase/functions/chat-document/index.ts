/// <reference lib="deno.ns" />

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

function parseAllowedOrigins(): string[] {
  const raw = (Deno.env.get("ALLOWED_ORIGINS") || "").trim();
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}
function requireAllowedOrigins(): boolean {
  return (Deno.env.get("REQUIRE_ALLOWED_ORIGINS") || "0").trim() === "1";
}
function corsHeadersForRequest(req: Request): Record<string, string> {
  const allowlist = parseAllowedOrigins();
  const origin = req.headers.get("origin") || "";
  const allowOrigin =
    allowlist.length === 0
      ? requireAllowedOrigins()
        ? "null"
        : "*"
      : allowlist.includes(origin)
        ? origin
        : "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, idempotency-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    ...(allowlist.length > 0 ? { Vary: "Origin" } : {}),
  };
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("Authorization") || "";
  const m = /^Bearer\s+(.+)\s*$/i.exec(auth);
  return m?.[1] ? m[1].trim() : null;
}
function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  return xff.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
}

type ChatRole = "user" | "assistant";
interface ChatMessage { role: ChatRole; content: string }
interface RequestBody {
  imageBase64?: string;
  mimeType?: string;
  ocrText?: string;
  messages?: ChatMessage[];
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
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

const MAX_MESSAGES = 30;
const MAX_MESSAGE_LEN = 4000;
const MAX_IMAGE_B64_BYTES = 8_000_000; // ~6MB binary

serve(async (req: Request) => {
  const corsHeaders = corsHeadersForRequest(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, corsHeaders);

  if (corsHeaders["Access-Control-Allow-Origin"] === "null") {
    return json({ error: "Origin not allowed" }, 403, corsHeaders);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!supabaseUrl || !anonKey) return json({ error: "Server misconfigured" }, 500, corsHeaders);
  if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY is not configured" }, 500, corsHeaders);

  // Auth
  const token = getBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401, corsHeaders);

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401, corsHeaders);
  const userId = userData.user.id;

  // Rate limit (reuse existing RPC; piggy-back on the user/IP based limiter)
  const windowSec = Math.floor(Number(Deno.env.get("RATE_LIMIT_WINDOW_SECONDS") || "60")) || 60;
  const maxPerWindow = Math.floor(Number(Deno.env.get("RATE_LIMIT_CHAT_PER_WINDOW") || "30")) || 30;
  const { error: rlErr } = await userClient.rpc("enforce_rate_limit", {
    p_user_id: userId,
    p_ip: getClientIp(req),
    p_scope: "chat_document",
    p_window_seconds: windowSec,
    p_max: maxPerWindow,
  });
  if (rlErr && String(rlErr.message || "").includes("RATE_LIMIT")) {
    return json({ error: "Rate limit exceeded" }, 429, corsHeaders);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json({ error: "Invalid JSON body" }, 400, corsHeaders);
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) return json({ error: "messages is required" }, 400, corsHeaders);
  if (messages.length > MAX_MESSAGES) {
    return json({ error: `Too many messages (max ${MAX_MESSAGES})` }, 400, corsHeaders);
  }
  for (const m of messages) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) {
      return json({ error: "Invalid message role" }, 400, corsHeaders);
    }
    if (typeof m.content !== "string" || m.content.length === 0) {
      return json({ error: "Invalid message content" }, 400, corsHeaders);
    }
    if (m.content.length > MAX_MESSAGE_LEN) {
      return json({ error: `Message too long (max ${MAX_MESSAGE_LEN} chars)` }, 400, corsHeaders);
    }
  }

  const ocrText = (body.ocrText || "").toString().slice(0, 60_000);
  const imageRaw = (body.imageBase64 || "").toString();
  if (!imageRaw) return json({ error: "imageBase64 is required" }, 400, corsHeaders);
  if (imageRaw.length > MAX_IMAGE_B64_BYTES) {
    return json({ error: "Image too large" }, 413, corsHeaders);
  }
  const stripped = stripDataUrl(imageRaw);
  const mimeType = body.mimeType || stripped.mime || "image/png";

  const model = (Deno.env.get("GEMINI_CHAT_MODEL") || "gemini-2.5-flash").replace(/^models\//, "");

  const firstUserIdx = messages.findIndex((m) => m.role === "user");
  if (firstUserIdx === -1) return json({ error: "No user message" }, 400, corsHeaders);

  const contents: Array<{
    role: "user" | "model";
    parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }>;
  }> = [];

  messages.forEach((m, i) => {
    const role = m.role === "assistant" ? "model" : "user";
    const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [];
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { temperature: 0.4, topP: 0.95, maxOutputTokens: 1024 },
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      console.error("[chat-document] gemini error", r.status, errText.slice(0, 200));
      return json({ error: "Upstream AI error" }, r.status === 429 ? 429 : 502, corsHeaders);
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
        return json(
          {
            reply:
              "Xin lỗi, tôi không thể trả lời câu hỏi này do giới hạn nội dung của mô hình. Bạn thử hỏi theo cách khác nhé.",
          },
          200,
          corsHeaders,
        );
      }
      return json({ error: "Empty response from model" }, 502, corsHeaders);
    }

    return json({ reply: text }, 200, corsHeaders);
  } catch (e) {
    console.error("[chat-document] fetch failed", e);
    return json({ error: "Failed to call AI" }, 500, corsHeaders);
  }
});
