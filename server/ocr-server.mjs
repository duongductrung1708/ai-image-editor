import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import fs from "node:fs";
import path from "node:path";

function loadDotEnvIfPresent() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (!key) continue;
    if (process.env[key] !== undefined) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnvIfPresent();

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function safeSnippet(s, max = 2000) {
  if (typeof s !== "string") return "";
  return s.length > max
    ? `${s.slice(0, max)}\n...<truncated ${s.length - max} chars>`
    : s;
}

function normalizeImageBase64AndMimeType(imageBase64Input, mimeTypeInput) {
  let mimeType =
    typeof mimeTypeInput === "string" && mimeTypeInput
      ? mimeTypeInput
      : undefined;
  let imageBase64 =
    typeof imageBase64Input === "string" ? imageBase64Input.trim() : "";

  if (!imageBase64)
    return { imageBase64: "", mimeType: mimeType || "image/png" };

  const dataUrlMatch = /^data:([^;]+);base64,(.*)$/i.exec(imageBase64);
  if (dataUrlMatch) {
    if (!mimeType) mimeType = dataUrlMatch[1];
    imageBase64 = dataUrlMatch[2] || "";
  }

  imageBase64 = imageBase64.replace(/\s+/g, "");
  return { imageBase64, mimeType: mimeType || "image/png" };
}

function getEnv(name, fallback = undefined) {
  const v = process.env[name];
  if (typeof v === "string" && v.length > 0) return v;
  return fallback;
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, "");
}

function httpRequestJson(
  urlString,
  { method = "POST", headers = {}, body, timeoutMs },
) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const isHttps = url.protocol === "https:";
    const lib = isHttps ? https : http;

    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port ? Number(url.port) : isHttps ? 443 : 80,
        path: `${url.pathname}${url.search}`,
        method,
        headers,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
            text: data,
          });
        });
      },
    );

    req.on("error", reject);
    if (timeoutMs) {
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error("Request timeout"));
      });
    }

    if (body) req.write(body);
    req.end();
  });
}

const PORT = Number(getEnv("OCR_API_PORT", "8787"));
const OCR_PROVIDER = getEnv("OCR_PROVIDER", "ollama"); // "ollama" | "gemini" | "lmstudio" | "openai"
const OCR_MODE = getEnv("OCR_MODE", "both"); // "both" | "json" | "markdown"
const OCR_MARKDOWN_STYLE = getEnv("OCR_MARKDOWN_STYLE", "raw"); // "raw" | "clean"

// Ollama Config
const OLLAMA_MODEL = getEnv("OLLAMA_MODEL");
const OLLAMA_BASE_URL = normalizeBaseUrl(
  getEnv("OLLAMA_BASE_URL", "http://localhost:11434"),
);
const OLLAMA_TIMEOUT_MS = Number(
  getEnv("OLLAMA_TIMEOUT_MS", String(10 * 60 * 1000)),
);
const OLLAMA_API = getEnv("OLLAMA_API", "native"); // "native" | "openai"
const OLLAMA_OPENAI_BASE_URL = normalizeBaseUrl(
  getEnv("OLLAMA_OPENAI_BASE_URL", `${OLLAMA_BASE_URL}/v1`),
);

// Gemini Config
const GEMINI_API_KEY = getEnv("GEMINI_API_KEY");
const GEMINI_MODEL = getEnv("GEMINI_MODEL", "gemini-2.5-flash");
const GEMINI_TIMEOUT_MS = Number(
  getEnv("GEMINI_TIMEOUT_MS", String(60 * 1000)),
);
const GEMINI_BBOX_JSON = getEnv("GEMINI_BBOX_JSON", "0") === "1";
const GEMINI_SYSTEM_PROMPT = getEnv(
  "GEMINI_SYSTEM_PROMPT",
  [
    "Bạn là một chuyên gia chuyển đổi tài liệu sang Markdown (Vision-to-Markdown).",
    "Hãy trích xuất văn bản từ ảnh này với các quy tắc sau:",
    "",
    "Sử dụng định dạng Table cho tất cả các phần có cấu trúc bảng.",
    "Sử dụng Header (#, ##) cho các tiêu đề lớn như 'THÔNG BÁO', 'TÒA ÁN...'.",
    "Giữ nguyên các định dạng in đậm, in nghiêng.",
    "Trả về Markdown nguyên khối, không thêm lời dẫn giải ở đầu hay cuối.",
  ].join("\n"),
);

// LM Studio Config
const LMSTUDIO_BASE_URL = normalizeBaseUrl(
  getEnv("LMSTUDIO_BASE_URL", "http://127.0.0.1:1234/v1"),
);
const LMSTUDIO_MODEL = getEnv("LMSTUDIO_MODEL", "");
const LMSTUDIO_TIMEOUT_MS = Number(
  getEnv("LMSTUDIO_TIMEOUT_MS", String(10 * 60 * 1000)),
);

// OpenAI (ChatGPT / OpenRouter) Config
const OPENAI_API_KEY = getEnv("OPENAI_API_KEY");
const OPENAI_MODEL = getEnv("OPENAI_MODEL", "gpt-4o");
const OPENAI_BASE_URL = normalizeBaseUrl(
  getEnv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
);
const OPENAI_TIMEOUT_MS = Number(
  getEnv("OPENAI_TIMEOUT_MS", String(60 * 1000)),
);

// Environment Checks
if (OCR_PROVIDER === "ollama" && !OLLAMA_MODEL) {
  console.error("Missing env OLLAMA_MODEL");
  process.exit(1);
}
if (OCR_PROVIDER === "gemini" && !GEMINI_API_KEY) {
  console.error("Missing env GEMINI_API_KEY");
  process.exit(1);
}
if (OCR_PROVIDER === "lmstudio" && !LMSTUDIO_MODEL) {
  console.error("Missing env LMSTUDIO_MODEL");
  process.exit(1);
}
if (OCR_PROVIDER === "openai" && !OPENAI_API_KEY) {
  console.error("Missing env OPENAI_API_KEY");
  process.exit(1);
}

function buildPrompt(mode) {
  if (OCR_PROVIDER === "lmstudio") {
    return (
      "Extract ALL text from this image.\n" +
      "Do not summarize or paraphrase.\n" +
      "Preserve line breaks as best as possible.\n" +
      "Return ONLY the extracted text/Markdown (no extra commentary).\n"
    );
  }

  const baseRaw =
    "Extract all Vietnamese text (and other languages if present) from this image.\n" +
    "Do not omit any text.\n" +
    "Do NOT summarize. Do NOT paraphrase.\n" +
    "Preserve the original reading order, line breaks, and indentation as best as possible.\n";

  const baseClean =
    baseRaw +
    "\nAdditionally, try to format as readable Markdown WITHOUT changing the meaning/content:\n" +
    "- Only transform formatting (headings, emphasis, lists, tables). Do not rewrite sentences.\n" +
    "- Use Markdown headings (#, ##, ###) when you are confident a line is a heading.\n" +
    "- Use bullet/numbered lists when the document clearly uses them.\n" +
    "- Convert bold/italic/underline to Markdown emphasis.\n" +
    "- For tables, use GitHub-flavored Markdown tables when it clearly improves readability.\n";

  const base = OCR_MARKDOWN_STYLE === "clean" ? baseClean : baseRaw;

  if (mode === "markdown")
    return (
      base +
      "Return ONLY Markdown/plain text (no code fences, no extra explanations).\n"
    );

  // Dùng chung cho "json" và "both"
  return (
    base +
    "Return ONLY a single valid JSON object.\n" +
    "The response MUST start with '{' and end with '}'.\n" +
    "No Markdown code fences, no commentary, no extra characters.\n" +
    "JSON must match fields exactly:\n" +
    "- markdown: string\n" +
    "- full_text: string\n" +
    "- blocks: array of {text, x, y, width, height} (each 0-100; can be approximate)\n" +
    "If bounding boxes are uncertain, still return approximate values (do not omit 'blocks').\n"
  );
}

function postProcessMarkdown(markdown) {
  if (typeof markdown !== "string" || markdown.length === 0) return markdown;
  let lines = markdown.split(/\r?\n/);
  if (OCR_MARKDOWN_STYLE === "clean") {
    lines = lines.filter((l) => {
      const t = l.trim();
      if (!t) return true;
      if (
        /^\d+\s*-\s*Text\s*$/i.test(t) ||
        /^\d+\s*-\s*Marginalia\s*$/i.test(t) ||
        /^Marginalia\s*$/i.test(t) ||
        /^Text\s*$/i.test(t) ||
        /^Sheet\s+\d+(\s*\/\s*\d+)?\s*$/i.test(t)
      )
        return false;
      return true;
    });
  }
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// --------------------------------------------------------------------------------------
// HÀM GỘP: Xử lý chung cho tất cả các model dùng chuẩn OpenAI (ChatGPT, OpenRouter, LM Studio, Ollama-v1)
// --------------------------------------------------------------------------------------
async function callOpenAIFormat({
  baseUrl,
  apiKey,
  model,
  imageBase64,
  mimeType,
  prompt,
  timeoutMs,
}) {
  const url = `${baseUrl}/chat/completions`;
  const payload = {
    model,
    messages: [
      {
        role: "system",
        content:
          "You are an expert OCR assistant. Extract text exactly as seen in the image.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${imageBase64}` },
          },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 4096,
  };

  if (prompt.includes("ONLY valid JSON"))
    payload.response_format = { type: "json_object" };

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  try {
    const r = await httpRequestJson(url, {
      headers,
      body: JSON.stringify(payload),
      timeoutMs,
    });
    const raw = r.text;
    if (!r.ok) {
      console.error("[ocr-server] API error", r.status, safeSnippet(raw));
      return { ok: false, status: r.status || 502, raw: raw || "API error" };
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, status: 502, raw: "Invalid JSON from API" };
    }

    const contentText = data?.choices?.[0]?.message?.content;
    if (typeof contentText !== "string" || contentText.length === 0)
      return { ok: false, status: 502, raw: "Empty response from API" };

    return { ok: true, status: 200, contentText };
  } catch (e) {
    return {
      ok: false,
      status: 502,
      raw: e instanceof Error ? e.message : String(e),
    };
  }
}

async function callGemini({ imageBase64, mimeType, prompt, responseMimeType }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

    // FIX XUNG ĐỘT PROMPT Ở ĐÂY
    let systemInstruction = GEMINI_SYSTEM_PROMPT;
    if (responseMimeType === "application/json") {
      systemInstruction = systemInstruction.replace(
        "Trả về Markdown nguyên khối, không thêm lời dẫn giải ở đầu hay cuối.",
        "Trích xuất văn bản và BẮT BUỘC trả về định dạng JSON hợp lệ 100% theo đúng cấu trúc được yêu cầu.",
      );
    }

    const payload = {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0, responseMimeType },
    };

    let r;
    try {
      r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("aborted"))
        return { ok: false, status: 504, raw: `Gemini request timed out` };
      return { ok: false, status: 502, raw: msg };
    }

    const raw = await r.text();
    if (!r.ok) {
      console.error("[ocr-server] gemini error", r.status, safeSnippet(raw));
      return { ok: false, status: r.status, raw };
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, status: 502, raw: "Invalid JSON from Gemini" };
    }

    const contentText = data?.candidates?.[0]?.content?.parts?.find(
      (p) => typeof p?.text === "string",
    )?.text;
    if (!contentText)
      return { ok: false, status: 502, raw: "Empty response from Gemini" };

    return { ok: true, status: 200, contentText };
  } finally {
    clearTimeout(timeout);
  }
}

const server = http.createServer(async (req, res) => {
  if (!req.url) return sendJson(res, 404, { error: "Not found" });

  if (req.method === "POST" && req.url === "/api/ocr") {
    try {
      const body = await readJson(req);
      const normalized = normalizeImageBase64AndMimeType(
        body?.imageBase64,
        body?.mimeType,
      );
      const { imageBase64, mimeType } = normalized;

      if (!imageBase64 || typeof imageBase64 !== "string")
        return sendJson(res, 400, { error: "imageBase64 is required" });

      // Ưu tiên mode json/both nếu Provider hỗ trợ
      const prompt = ["gemini", "lmstudio", "openai"].includes(OCR_PROVIDER)
        ? buildPrompt(
            OCR_MODE === "json" || OCR_MODE === "both" ? "both" : "markdown",
          )
        : buildPrompt(OCR_MODE);

      let content;

      // 1. Tuyến xử lý Gemini
      if (OCR_PROVIDER === "gemini") {
        // Mặc định bật JSON (để lấy bbox) khi OCR_MODE là both/json.
        // GEMINI_BBOX_JSON vẫn có thể ép bật trong các mode khác.
        const shouldUseGeminiJson =
          OCR_MODE === "json" || OCR_MODE === "both" || GEMINI_BBOX_JSON;

        const out = await callGemini({
          imageBase64,
          mimeType,
          prompt,
          responseMimeType: shouldUseGeminiJson ? "application/json" : "text/plain",
        });
        if (!out.ok) return sendJson(res, out.status, { error: out.raw });

        content = shouldUseGeminiJson
          ? out.contentText
          : JSON.stringify({
              markdown: out.contentText,
              full_text: out.contentText,
              blocks: [],
            });
      }

      // 2. Tuyến xử lý GỘP cho OpenAI / LM Studio / Ollama (chế độ OpenAI)
      else if (
        OCR_PROVIDER === "openai" ||
        OCR_PROVIDER === "lmstudio" ||
        (OCR_PROVIDER === "ollama" && OLLAMA_API === "openai")
      ) {
        let baseUrl, apiKey, model, timeoutMs;

        if (OCR_PROVIDER === "openai") {
          baseUrl = OPENAI_BASE_URL;
          apiKey = OPENAI_API_KEY;
          model = OPENAI_MODEL;
          timeoutMs = OPENAI_TIMEOUT_MS;
        } else if (OCR_PROVIDER === "lmstudio") {
          baseUrl = LMSTUDIO_BASE_URL;
          apiKey = "";
          model = LMSTUDIO_MODEL;
          timeoutMs = LMSTUDIO_TIMEOUT_MS;
        } else {
          baseUrl = OLLAMA_OPENAI_BASE_URL;
          apiKey = "ollama";
          model = OLLAMA_MODEL;
          timeoutMs = OLLAMA_TIMEOUT_MS;
        }

        const out = await callOpenAIFormat({
          baseUrl,
          apiKey,
          model,
          imageBase64,
          mimeType,
          prompt,
          timeoutMs,
        });
        if (!out.ok) return sendJson(res, out.status, { error: out.raw });
        content = out.contentText;
      }

      // 3. Tuyến xử lý cho Ollama (chế độ Native cũ)
      else {
        const doOllama = async () => {
          const payload = {
            model: OLLAMA_MODEL,
            messages: [
              { role: "user", content: prompt, images: [imageBase64] },
            ],
            stream: false,
            options: { temperature: 0 },
          };
          return await httpRequestJson(`${OLLAMA_BASE_URL}/api/chat`, {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            timeoutMs: OLLAMA_TIMEOUT_MS,
          });
        };

        let r;
        try {
          r = await doOllama();
        } catch (e) {
          r = await doOllama();
        } // Retry once
        if (!r.ok)
          return sendJson(res, r.status || 502, {
            error: r.text || `Ollama error ${r.status}`,
          });

        let data;
        try {
          data = JSON.parse(r.text);
        } catch {
          return sendJson(res, 502, { error: "Invalid JSON from Ollama" });
        }
        content = data?.message?.content;
      }

      if (!content)
        return sendJson(res, 502, {
          error: "Empty response from OCR provider",
        });

      // Post-Processing
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (e) {
        // Some providers wrap the JSON in ```json fences or add extra text.
        // Try to extract the first JSON object we can parse.
        const asString = typeof content === "string" ? content : "";

        const tryParseJson = (candidate) => {
          if (!candidate || typeof candidate !== "string") return null;
          try {
            return JSON.parse(candidate);
          } catch {
            return null;
          }
        };

        const fenceMatch = asString.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        const fenced = fenceMatch?.[1];

        const direct = tryParseJson(asString.trim());
        const fromFenced = tryParseJson(fenced?.trim());

        let extracted = direct || fromFenced;

        if (!extracted) {
          const firstBrace = asString.indexOf("{");
          const lastBrace = asString.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const substring = asString.slice(firstBrace, lastBrace + 1);
            extracted = tryParseJson(substring);
          }
        }

        if (extracted && typeof extracted === "object") {
          return sendJson(res, 200, {
            markdown: postProcessMarkdown(
              typeof extracted?.markdown === "string" ? extracted.markdown : "",
            ),
            full_text:
              typeof extracted?.full_text === "string"
                ? extracted.full_text
                : "",
            blocks: Array.isArray(extracted?.blocks) ? extracted.blocks : [],
            ...(typeof extracted?.warning === "string"
              ? { warning: extracted.warning }
              : null),
          });
        }

        console.warn(
          "[ocr-server] content not JSON, falling back to markdown/plaintext",
        );
        const cleaned = postProcessMarkdown(asString);
        return sendJson(res, 200, {
          markdown: cleaned,
          full_text: cleaned,
          blocks: [],
          warning:
            "Model did not return JSON; returned plain text/markdown instead.",
        });
      }

      return sendJson(res, 200, {
        markdown: postProcessMarkdown(
          typeof parsed?.markdown === "string" ? parsed.markdown : "",
        ),
        full_text:
          typeof parsed?.full_text === "string" ? parsed.full_text : "",
        blocks: Array.isArray(parsed?.blocks) ? parsed.blocks : [],
      });
    } catch (err) {
      console.error("[ocr-server] internal error", err);
      return sendJson(res, 500, {
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return sendJson(res, 404, { error: "Not found" });
});

server.on("error", (err) => {
  if (err?.code === "EADDRINUSE") {
    console.error(`[ocr-server] port ${PORT} is already in use (EADDRINUSE)`);
    process.exit(1);
  }
  console.error("[ocr-server] server error", err);
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[ocr-server] listening on http://127.0.0.1:${PORT}`);
  console.log(`[ocr-server] provider: ${OCR_PROVIDER}`);
  if (OCR_PROVIDER === "ollama")
    console.log(
      `[ocr-server] ollama base: ${OLLAMA_BASE_URL} | model: ${OLLAMA_MODEL}`,
    );
  else if (OCR_PROVIDER === "gemini")
    console.log(`[ocr-server] gemini model: ${GEMINI_MODEL}`);
  else if (OCR_PROVIDER === "lmstudio")
    console.log(
      `[ocr-server] lmstudio base: ${LMSTUDIO_BASE_URL} | model: ${LMSTUDIO_MODEL}`,
    );
  else if (OCR_PROVIDER === "openai")
    console.log(
      `[ocr-server] openai base: ${OPENAI_BASE_URL} | model: ${OPENAI_MODEL}`,
    );
});
