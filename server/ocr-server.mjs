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
  return s.length > max ? `${s.slice(0, max)}\n...<truncated ${s.length - max} chars>` : s;
}

function getEnv(name, fallback = undefined) {
  const v = process.env[name];
  if (typeof v === "string" && v.length > 0) return v;
  return fallback;
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, "");
}

function httpRequestJson(urlString, { method = "POST", headers = {}, body, timeoutMs }) {
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
const OCR_PROVIDER = getEnv("OCR_PROVIDER", "ollama"); // "ollama" | "gemini"
const OLLAMA_MODEL = getEnv("OLLAMA_MODEL");
const OLLAMA_BASE_URL = normalizeBaseUrl(getEnv("OLLAMA_BASE_URL", "http://localhost:11434"));
const OLLAMA_TIMEOUT_MS = Number(getEnv("OLLAMA_TIMEOUT_MS", String(10 * 60 * 1000)));
const OCR_MODE = getEnv("OCR_MODE", "both"); // "both" | "json" | "markdown"
const OLLAMA_API = getEnv("OLLAMA_API", "native"); // "native" | "openai"
const OCR_MARKDOWN_STYLE = getEnv("OCR_MARKDOWN_STYLE", "raw"); // "raw" | "clean"

const OLLAMA_OPENAI_BASE_URL = normalizeBaseUrl(getEnv("OLLAMA_OPENAI_BASE_URL", `${OLLAMA_BASE_URL}/v1`));

const GEMINI_API_KEY = getEnv("GEMINI_API_KEY");
const GEMINI_MODEL = getEnv("GEMINI_MODEL", "gemini-2.5-flash");
const GEMINI_TIMEOUT_MS = Number(getEnv("GEMINI_TIMEOUT_MS", String(60 * 1000)));
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

if (OCR_PROVIDER === "ollama" && !OLLAMA_MODEL) {
  console.error("Missing env OLLAMA_MODEL. Set it in your root .env");
  process.exit(1);
}

if (OCR_PROVIDER === "gemini" && !GEMINI_API_KEY) {
  console.error("Missing env GEMINI_API_KEY. Set it in your root .env");
  process.exit(1);
}

function buildPrompt(mode) {
  const baseRaw =
    "Extract all Vietnamese text (and other languages if present) from this image.\n" +
    "Do not omit any text.\n" +
    "Do NOT summarize. Do NOT paraphrase.\n" +
    "Preserve the original reading order, line breaks, and indentation as best as possible.\n";

  const baseClean =
    baseRaw +
    "\n" +
    "Additionally, try to format as readable Markdown WITHOUT changing the meaning/content:\n" +
    "- Only transform formatting (headings, emphasis, lists, tables). Do not rewrite sentences.\n" +
    "- Use Markdown headings (#, ##, ###) when you are confident a line is a heading.\n" +
    "- Use bullet/numbered lists when the document clearly uses them.\n" +
    "- Convert bold/italic/underline to Markdown emphasis.\n" +
    "- For tables, use GitHub-flavored Markdown tables when it clearly improves readability.\n";

  const base = OCR_MARKDOWN_STYLE === "clean" ? baseClean : baseRaw;

  if (mode === "markdown") {
    return (
      base +
      "Return ONLY Markdown/plain text (no code fences, no extra explanations).\n"
    );
  }

  if (mode === "json") {
    return (
      base +
      "Return ONLY valid JSON (no markdown wrappers, no extra text) with fields:\n" +
      '- full_text: string (plain extracted text)\n' +
      '- markdown: string (best-effort Markdown/plain text version)\n' +
      "- blocks: array of {text, x, y, width, height} using percentage coordinates (0-100)\n" +
      "If bounding boxes are uncertain, still return best-effort approximate values.\n"
    );
  }

  return (
    base +
    "Return ONLY valid JSON (no markdown wrappers, no extra text) with fields:\n" +
    '- markdown: string (best-effort document in Markdown, preserve headings/lists/tables if present)\n' +
    '- full_text: string (plain extracted text)\n' +
    "- blocks: array of {text, x, y, width, height} using percentage coordinates (0-100)\n" +
    "If bounding boxes are uncertain, still return best-effort approximate values.\n"
  );
}

function splitTableRow(line) {
  // Minimal Markdown table row splitter; expects leading/trailing pipes are optional.
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

function postProcessMarkdown(markdown) {
  if (typeof markdown !== "string" || markdown.length === 0) return markdown;
  let lines = markdown.split(/\r?\n/);
  if (OCR_MARKDOWN_STYLE === "clean") {
    // Remove common OCR artefact lines (kept conservative).
    lines = lines.filter((l) => {
      const t = l.trim();
      if (!t) return true;
      if (/^\d+\s*-\s*Text\s*$/i.test(t)) return false;
      if (/^\d+\s*-\s*Marginalia\s*$/i.test(t)) return false;
      if (/^Marginalia\s*$/i.test(t)) return false;
      if (/^Text\s*$/i.test(t)) return false;
      if (/^Sheet\s+\d+(\s*\/\s*\d+)?\s*$/i.test(t)) return false;
      return true;
    });
  }
  // No semantic post-processing (e.g., GV/HS conversion). Only light whitespace cleanup.
  // Cleanup: collapse excessive blank lines.
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function callGemini({ imageBase64, mimeType, prompt, responseMimeType }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}` +
      `:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

    const systemInstruction = GEMINI_SYSTEM_PROMPT;

    const payload = {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: imageBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType,
      },
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
      // Node fetch throws "This operation was aborted" on AbortController timeout.
      if (msg.toLowerCase().includes("aborted")) {
        return { ok: false, status: 504, raw: `Gemini request timed out after ${GEMINI_TIMEOUT_MS}ms` };
      }
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
      console.error("[ocr-server] invalid JSON envelope from gemini", safeSnippet(raw));
      return { ok: false, status: 502, raw: "Invalid JSON from Gemini" };
    }

    const contentText =
      data?.candidates?.[0]?.content?.parts?.find((p) => typeof p?.text === "string")?.text;
    if (typeof contentText !== "string" || contentText.length === 0) {
      console.error("[ocr-server] empty content from gemini", safeSnippet(raw));
      return { ok: false, status: 502, raw: "Empty response from Gemini" };
    }

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
      const imageBase64 = body?.imageBase64;
      const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "image/png";

      if (!imageBase64 || typeof imageBase64 !== "string") {
        return sendJson(res, 400, { error: "imageBase64 is required" });
      }

      const prompt = OCR_PROVIDER === "gemini"
        ? buildPrompt(GEMINI_BBOX_JSON ? "both" : "markdown")
        : buildPrompt(OCR_MODE);

      let content;
      if (OCR_PROVIDER === "gemini") {
        const out = await callGemini({
          imageBase64,
          mimeType,
          prompt,
          responseMimeType: GEMINI_BBOX_JSON ? "application/json" : "text/plain",
        });
        if (!out.ok) return sendJson(res, out.status, { error: out.raw });
        // If bbox JSON is enabled, Gemini is expected to return JSON with blocks.
        // Otherwise, wrap plain markdown/text into our JSON shape.
        content = GEMINI_BBOX_JSON
          ? out.contentText
          : JSON.stringify({
            markdown: out.contentText,
            full_text: out.contentText,
            blocks: [],
          });
      } else {
        const doOllama = async () => {
          if (OLLAMA_API === "openai") {
            const payload = {
              model: OLLAMA_MODEL,
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: prompt },
                    { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
                  ],
                },
              ],
              temperature: 0,
              stream: false,
            };

            return await httpRequestJson(`${OLLAMA_OPENAI_BASE_URL}/chat/completions`, {
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer ollama",
              },
              body: JSON.stringify(payload),
              timeoutMs: OLLAMA_TIMEOUT_MS,
            });
          }

          const payload = {
            model: OLLAMA_MODEL,
            messages: [
              {
                role: "user",
                content: prompt,
                images: [imageBase64],
              },
            ],
            stream: false,
            options: {
              temperature: 0,
            },
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
          console.warn("[ocr-server] ollama request failed, retrying once", e instanceof Error ? e.message : String(e));
          r = await doOllama();
        }

        const raw = r.text;
        if (!r.ok) {
          console.error("[ocr-server] ollama error", r.status, safeSnippet(raw));
          return sendJson(res, r.status || 502, { error: raw || `Ollama error ${r.status}` });
        }

        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          console.error("[ocr-server] invalid JSON envelope from ollama", safeSnippet(raw));
          return sendJson(res, 502, { error: "Invalid JSON from Ollama" });
        }

        content =
          OLLAMA_API === "openai"
            ? data?.choices?.[0]?.message?.content
            : data?.message?.content;
      }

      if (typeof content !== "string" || content.length === 0) {
        console.error("[ocr-server] empty content from provider");
        return sendJson(res, 502, { error: "Empty response from OCR provider" });
      }

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        // Fallback: some models ignore JSON-only instruction. Still return useful output.
        console.warn("[ocr-server] content not JSON, falling back to markdown/plaintext");
        const cleaned = postProcessMarkdown(content);
        return sendJson(res, 200, {
          markdown: cleaned,
          full_text: cleaned,
          blocks: [],
          warning: "Model did not return JSON; returned plain text/markdown instead.",
        });
      }

      const markdown = typeof parsed?.markdown === "string" ? parsed.markdown : "";
      const cleanedMarkdown = postProcessMarkdown(markdown);
      return sendJson(res, 200, {
        markdown: cleanedMarkdown,
        full_text: typeof parsed?.full_text === "string" ? parsed.full_text : "",
        blocks: Array.isArray(parsed?.blocks) ? parsed.blocks : [],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      const details =
        err && typeof err === "object" && "cause" in err ? String(err.cause) : undefined;
      console.error("[ocr-server] internal error", msg, details ? `cause=${details}` : "");
      return sendJson(res, 500, { error: msg, details });
    }
  }

  return sendJson(res, 404, { error: "Not found" });
});

async function healthCheck() {
  if (OCR_PROVIDER !== "ollama") return;
  try {
    const r = await fetch(`${OLLAMA_BASE_URL}/api/version`);
    const t = await r.text();
    if (!r.ok) {
      console.warn("[ocr-server] ollama healthcheck failed", r.status, safeSnippet(t));
      return;
    }
    console.log("[ocr-server] ollama healthcheck OK", safeSnippet(t, 200));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[ocr-server] ollama healthcheck fetch failed", msg);
    console.warn('[ocr-server] tip: try OLLAMA_BASE_URL="http://127.0.0.1:11434" and ensure `ollama serve` is running');
  }
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[ocr-server] listening on http://127.0.0.1:${PORT}`);
  console.log(`[ocr-server] provider: ${OCR_PROVIDER}`);
  if (OCR_PROVIDER === "ollama") {
    console.log(`[ocr-server] ollama base: ${OLLAMA_BASE_URL}`);
    console.log(`[ocr-server] model: ${OLLAMA_MODEL}`);
  } else {
    console.log(`[ocr-server] gemini model: ${GEMINI_MODEL}`);
  }
  void healthCheck();
});

