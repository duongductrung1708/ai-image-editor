import http from "node:http";
import https from "node:https";
import { URL, fileURLToPath } from "node:url";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

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

function readJson(req, maxBytes = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
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
const OCR_PROVIDER = getEnv("OCR_PROVIDER", "ollama"); // "ollama" | "gemini" | "lmstudio" | "openai" | "paddle"
const OCR_MODE = getEnv("OCR_MODE", "both"); // "both" | "json" | "markdown"
const OCR_MARKDOWN_STYLE = getEnv("OCR_MARKDOWN_STYLE", "raw"); // "raw" | "clean"
const OCR_BATCH_CONCURRENCY = Math.max(
  1,
  Math.min(8, Number(getEnv("OCR_BATCH_CONCURRENCY", "2"))),
);
const OCR_BATCH_MAX_IMAGES = Math.max(
  1,
  Math.min(100, Number(getEnv("OCR_BATCH_MAX_IMAGES", "30"))),
);

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

// PaddleOCR: gọi paddle_worker.py trong repo (venv Python của bạn)
const PADDLE_PYTHON = getEnv(
  "PADDLE_PYTHON",
  process.platform === "win32" ? "python" : "python3",
);
const PADDLE_WORKER_SCRIPT =
  getEnv("PADDLE_WORKER_SCRIPT") ||
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "paddleOCR",
    "paddle_worker.py",
  );
const PADDLE_TIMEOUT_MS = Number(
  getEnv("PADDLE_TIMEOUT_MS", String(15 * 60 * 1000)),
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
if (OCR_PROVIDER === "paddle" && !fs.existsSync(PADDLE_WORKER_SCRIPT)) {
  console.error(
    `[ocr-server] Paddle: không thấy worker: ${PADDLE_WORKER_SCRIPT}`,
  );
  process.exit(1);
}

function buildPrompt(mode) {
  if (OCR_PROVIDER === "lmstudio") {
    // Nếu Front-end cần tọa độ (mode json hoặc both), ta dùng Native Prompt của Qwen
    if (mode === "json" || mode === "both") {
      return (
        "Trích xuất toàn bộ văn bản trong ảnh. BẮT BUỘC định vị vị trí của từng đoạn văn bản.\n" +
        "Hãy trả về kết quả tuân thủ CHÍNH XÁC định dạng sau cho mỗi đoạn văn bản:\n" +
        "[Nội dung văn bản] <box>(ymin, xmin), (ymax, xmax)</box>\n" +
        "Lưu ý: Tọa độ nằm trong khoảng từ 0 đến 1000."
      );
    }
    // Nếu chỉ cần Markdown bình thường
    return (
      "Extract ALL text from this image.\n" +
      "Do not summarize or paraphrase.\n" +
      "Preserve line breaks as best as possible.\n" +
      "Return ONLY the extracted text/Markdown (no extra commentary).\n"
    );
  }

  // ... (phần code baseRaw, baseClean giữ nguyên không đổi)

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

// HÀM HACK: Chuyển đổi định dạng tọa độ gốc của Qwen sang JSON chuẩn cho Front-end
function parseQwenBoundingBoxes(text) {
  const blocks = [];
  let markdown = text;

  const toPercentX = (v) => parseInt(v, 10) / 10;
  const toPercentY = (v) => parseInt(v, 10) / 10;

  // Variant A (Qwen-ish): <box>(x1,y1),(x2,y2)Nội dung</box>
  const boxRegexA = /<box>\((\d+),(\d+)\),\((\d+),(\d+)\)([\s\S]*?)<\/box>/g;
  markdown = markdown.replace(
    boxRegexA,
    (match, x1, y1, x2, y2, textContent, offset, full) => {
      const inner = (textContent ?? "").trim();

      // If the box has no inner text, infer from a bracket token just before the tag.
      let inferredText = inner;
      let returnText = inner;

      if (!inner && typeof offset === "number" && typeof full === "string") {
        const lineStart = full.lastIndexOf("\n", offset);
        const segment = full.slice(lineStart + 1, offset);
        const labelMatch = /\[([^\]]+)\]\s*$/.exec(segment);
        inferredText = labelMatch ? labelMatch[1].trim() : "";
        // Don't duplicate the label in markdown; label token lives outside the box tag.
        returnText = "";
      }

      const px1 = toPercentX(x1);
      const py1 = toPercentY(y1);
      const px2 = toPercentX(x2);
      const py2 = toPercentY(y2);

      blocks.push({
        text: inferredText,
        x: px1,
        y: py1,
        width: px2 - px1,
        height: py2 - py1,
      });

      return returnText;
    },
  );

  // Variant B (lmstudio output): <box(x1,y1),(x2,y2)</box> hoặc <box(x1,y1),(x2,y2)Nội dung</box>
  // Note: lmstudio hay bỏ dấu ">" sau chữ box.
  const boxRegexB = /<box\((\d+),(\d+)\),\((\d+),(\d+)\)([\s\S]*?)<\/box>/g;
  markdown = markdown.replace(
    boxRegexB,
    (match, x1, y1, x2, y2, textContent, offset, full) => {
      const inner = (textContent ?? "").trim();

      let inferredText = inner;
      let returnText = inner;
      if (!inner && typeof offset === "number" && typeof full === "string") {
        const lineStart = full.lastIndexOf("\n", offset);
        const segment = full.slice(lineStart + 1, offset);
        const labelMatch = /\[([^\]]+)\]\s*$/.exec(segment);
        inferredText = labelMatch ? labelMatch[1].trim() : "";
        returnText = "";
      }

      const px1 = toPercentX(x1);
      const py1 = toPercentY(y1);
      const px2 = toPercentX(x2);
      const py2 = toPercentY(y2);

      blocks.push({
        text: inferredText,
        x: px1,
        y: py1,
        width: px2 - px1,
        height: py2 - py1,
      });

      return returnText;
    },
  );

  // Nếu bóc được tọa độ thì trả về JSON chuẩn
  if (blocks.length > 0) {
    const cleaned = markdown.trim();
    return {
      markdown: cleaned,
      full_text: cleaned,
      blocks: blocks,
    };
  }

  return null;
}

function buildOcrPrompt() {
  if (OCR_PROVIDER === "paddle") {
    return "";
  }
  return ["gemini", "lmstudio", "openai"].includes(OCR_PROVIDER)
    ? buildPrompt(
        OCR_MODE === "json" || OCR_MODE === "both" ? "both" : "markdown",
      )
    : buildPrompt(OCR_MODE);
}

function parsePaddleStdoutJson(stdout) {
  const lines = stdout.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith("{")) continue;
    try {
      return JSON.parse(line);
    } catch {
      continue;
    }
  }
  throw new Error(
    "Không đọc được JSON từ paddle_worker (stdout không hợp lệ hoặc rỗng)",
  );
}

async function runPaddleOcr(imageBase64, mimeType) {
  let tmpDir;
  try {
    const ext =
      mimeType.includes("jpeg") || mimeType.includes("jpg")
        ? ".jpg"
        : mimeType.includes("webp")
          ? ".webp"
          : mimeType.includes("gif")
            ? ".gif"
            : ".png";
    tmpDir = await fsp.mkdtemp(path.join(tmpdir(), "ocr-paddle-"));
    const imgPath = path.join(tmpDir, `input${ext}`);
    await fsp.writeFile(imgPath, Buffer.from(imageBase64, "base64"));

    const stdout = await new Promise((resolve, reject) => {
      const proc = spawn(PADDLE_PYTHON, [PADDLE_WORKER_SCRIPT, imgPath], {
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
          PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: getEnv(
            "PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK",
            "True",
          ),
        },
        windowsHide: true,
      });
      let out = "";
      let err = "";
      proc.stdout.setEncoding("utf8");
      proc.stderr.setEncoding("utf8");
      proc.stdout.on("data", (c) => {
        out += c;
      });
      proc.stderr.on("data", (c) => {
        err += c;
      });
      const timer = setTimeout(() => {
        proc.kill("SIGTERM");
        reject(
          new Error(`Paddle worker timeout sau ${PADDLE_TIMEOUT_MS / 1000}s`),
        );
      }, PADDLE_TIMEOUT_MS);
      proc.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      proc.on("close", (code) => {
        clearTimeout(timer);
        if (!out.trim()) {
          reject(
            new Error(
              err.trim() ||
                `paddle_worker thoát mã ${code}; kiểm tra PADDLE_PYTHON và paddle_worker.py`,
            ),
          );
          return;
        }
        resolve(out);
      });
    });

    const parsed = parsePaddleStdoutJson(stdout);
    if (parsed.error) {
      return { ok: false, status: 502, error: String(parsed.error) };
    }
    const fullText =
      typeof parsed.full_text === "string" ? parsed.full_text : "";
    const tables = Array.isArray(parsed.tables_html) ? parsed.tables_html : [];
    let markdown = fullText;
    for (const html of tables) {
      if (html && String(html).trim()) markdown += `\n\n${html}\n\n`;
    }
    markdown = postProcessMarkdown(markdown);
    const content = JSON.stringify({
      markdown,
      full_text: fullText,
      blocks: [],
    });
    return { ok: true, content };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 502, error: msg };
  } finally {
    if (tmpDir) {
      try {
        await fsp.rm(tmpDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

async function fetchProviderRawContent(imageBase64, mimeType, prompt) {
  if (OCR_PROVIDER === "paddle") {
    const paddle = await runPaddleOcr(imageBase64, mimeType);
    if (!paddle.ok) return paddle;
    return { ok: true, content: paddle.content };
  }

  if (OCR_PROVIDER === "gemini") {
    const shouldUseGeminiJson =
      OCR_MODE === "json" || OCR_MODE === "both" || GEMINI_BBOX_JSON;
    const out = await callGemini({
      imageBase64,
      mimeType,
      prompt,
      responseMimeType: shouldUseGeminiJson ? "application/json" : "text/plain",
    });
    if (!out.ok) {
      const err =
        typeof out.raw === "string" ? out.raw : JSON.stringify(out.raw || "");
      return { ok: false, status: out.status, error: err };
    }
    const content = shouldUseGeminiJson
      ? out.contentText
      : JSON.stringify({
          markdown: out.contentText,
          full_text: out.contentText,
          blocks: [],
        });
    return { ok: true, content };
  }

  if (
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
    if (!out.ok) {
      const err =
        typeof out.raw === "string" ? out.raw : JSON.stringify(out.raw || "");
      return { ok: false, status: out.status, error: err };
    }
    return { ok: true, content: out.contentText };
  }

  const doOllama = async () => {
    const payload = {
      model: OLLAMA_MODEL,
      messages: [{ role: "user", content: prompt, images: [imageBase64] }],
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
  } catch {
    r = await doOllama();
  }
  if (!r.ok) {
    return {
      ok: false,
      status: r.status || 502,
      error: r.text || `Ollama error ${r.status}`,
    };
  }
  let data;
  try {
    data = JSON.parse(r.text);
  } catch {
    return { ok: false, status: 502, error: "Invalid JSON from Ollama" };
  }
  const content = data?.message?.content;
  if (typeof content !== "string") {
    return { ok: false, status: 502, error: "Empty response from Ollama" };
  }
  return { ok: true, content };
}

function parseContentIntoOcrPayload(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
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
      return {
        markdown: postProcessMarkdown(
          typeof extracted?.markdown === "string" ? extracted.markdown : "",
        ),
        full_text:
          typeof extracted?.full_text === "string" ? extracted.full_text : "",
        blocks: Array.isArray(extracted?.blocks) ? extracted.blocks : [],
        ...(typeof extracted?.warning === "string"
          ? { warning: extracted.warning }
          : null),
      };
    }

    console.warn(
      "[ocr-server] content not JSON, falling back to markdown/plaintext",
    );
    const cleaned = postProcessMarkdown(asString);
    return {
      markdown: cleaned,
      full_text: cleaned,
      blocks: [],
      warning:
        "Model did not return JSON; returned plain text/markdown instead.",
    };
  }

  return {
    markdown: postProcessMarkdown(
      typeof parsed?.markdown === "string" ? parsed.markdown : "",
    ),
    full_text: typeof parsed?.full_text === "string" ? parsed.full_text : "",
    blocks: Array.isArray(parsed?.blocks) ? parsed.blocks : [],
  };
}

async function runSingleOcr(imageBase64Input, mimeTypeInput) {
  const normalized = normalizeImageBase64AndMimeType(
    imageBase64Input,
    mimeTypeInput,
  );
  const { imageBase64, mimeType } = normalized;
  if (!imageBase64 || typeof imageBase64 !== "string") {
    return { ok: false, status: 400, error: "imageBase64 is required" };
  }

  const prompt = buildOcrPrompt();
  const raw = await fetchProviderRawContent(imageBase64, mimeType, prompt);
  if (!raw.ok) return raw;

  const content = raw.content;
  if (!content) {
    return {
      ok: false,
      status: 502,
      error: "Empty response from OCR provider",
    };
  }

  if (
    OCR_PROVIDER === "lmstudio" &&
    (OCR_MODE === "json" || OCR_MODE === "both")
  ) {
    const qwenData = parseQwenBoundingBoxes(content);
    if (qwenData) {
      return {
        ok: true,
        markdown: postProcessMarkdown(
          typeof qwenData.markdown === "string" ? qwenData.markdown : "",
        ),
        full_text:
          typeof qwenData.full_text === "string" ? qwenData.full_text : "",
        blocks: Array.isArray(qwenData.blocks) ? qwenData.blocks : [],
      };
    }
  }

  const payload = parseContentIntoOcrPayload(content);
  return { ok: true, ...payload };
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    for (;;) {
      const i = nextIndex++;
      if (i >= items.length) break;
      results[i] = await worker(items[i], i);
    }
  }

  const n = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: n }, () => runWorker()));
  return results;
}

function mergeBatchMarkdown(pages) {
  const parts = [];
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const label = p.name || `Trang ${i + 1}`;
    const safeLabel = String(label).replace(/\r?\n/g, " ").trim();
    if (i > 0) parts.push("\n\n---\n\n");
    if (p.ok) {
      const body = (p.markdown || p.full_text || "").trim();
      parts.push(
        `## ${safeLabel.replace(/^#+\s*/, "")}\n\n${body || "_Không có văn bản._"}`,
      );
    } else {
      const err = (p.error || "Unknown error").replace(/`/g, "'");
      parts.push(`## ${safeLabel.replace(/^#+\s*/, "")} _(lỗi)_\n\n\`${err}\``);
    }
  }
  return parts.join("");
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
      const out = await runSingleOcr(
        normalized.imageBase64,
        normalized.mimeType,
      );
      if (!out.ok) return sendJson(res, out.status, { error: out.error });
      const { ok: _ok, ...payload } = out;
      return sendJson(res, 200, payload);
    } catch (err) {
      console.error("[ocr-server] internal error", err);
      return sendJson(res, 500, {
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  if (req.method === "POST" && req.url === "/api/ocr/batch") {
    try {
      const body = await readJson(req, 120 * 1024 * 1024);
      const images = body?.images;
      if (!Array.isArray(images) || images.length === 0) {
        return sendJson(res, 400, {
          error:
            "images must be a non-empty array of { imageBase64, mimeType?, name? }",
        });
      }
      if (images.length > OCR_BATCH_MAX_IMAGES) {
        return sendJson(res, 400, {
          error: `Too many images (max ${OCR_BATCH_MAX_IMAGES})`,
        });
      }

      const requested = Number(body?.concurrency);
      const conc =
        Number.isFinite(requested) && requested > 0
          ? Math.min(OCR_BATCH_CONCURRENCY, Math.floor(requested))
          : OCR_BATCH_CONCURRENCY;

      const tasks = images.map((entry, index) => ({
        index,
        name:
          typeof entry?.name === "string" && entry.name
            ? entry.name
            : `Trang ${index + 1}`,
        imageBase64: entry?.imageBase64,
        mimeType: entry?.mimeType,
      }));

      const pages = await runPool(tasks, conc, async (task) => {
        if (typeof task.imageBase64 !== "string" || !task.imageBase64.trim()) {
          return {
            index: task.index,
            name: task.name,
            ok: false,
            markdown: "",
            full_text: "",
            blocks: [],
            error: "Missing imageBase64",
          };
        }
        const out = await runSingleOcr(task.imageBase64, task.mimeType);
        if (!out.ok) {
          console.warn(
            `[ocr-server] batch page ${task.index + 1}/${tasks.length} failed:`,
            out.error,
          );
          return {
            index: task.index,
            name: task.name,
            ok: false,
            markdown: "",
            full_text: "",
            blocks: [],
            error: out.error,
          };
        }
        const { ok: _ok, ...payload } = out;
        console.log(
          `[ocr-server] batch page ${task.index + 1}/${tasks.length} ok`,
        );
        return {
          index: task.index,
          name: task.name,
          ok: true,
          markdown: payload.markdown || "",
          full_text: payload.full_text || "",
          blocks: Array.isArray(payload.blocks) ? payload.blocks : [],
          ...(typeof payload.warning === "string"
            ? { warning: payload.warning }
            : null),
        };
      });

      pages.sort((a, b) => a.index - b.index);
      const mergedMarkdown = mergeBatchMarkdown(pages);
      const mergedFullText = pages
        .filter((p) => p.ok)
        .map((p) => p.full_text || p.markdown)
        .join("\n\n");

      return sendJson(res, 200, {
        markdown: mergedMarkdown,
        full_text: mergedFullText,
        pages,
        pageCount: pages.length,
        concurrency: conc,
      });
    } catch (err) {
      console.error("[ocr-server] batch error", err);
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg.includes("too large")) {
        return sendJson(res, 413, { error: "Request body too large" });
      }
      return sendJson(res, 500, { error: msg });
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
  console.log(
    `[ocr-server] batch: max ${OCR_BATCH_MAX_IMAGES} images, concurrency ${OCR_BATCH_CONCURRENCY}`,
  );
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
  else if (OCR_PROVIDER === "paddle")
    console.log(
      `[ocr-server] paddle: python=${PADDLE_PYTHON} | worker=${PADDLE_WORKER_SCRIPT} | timeout=${PADDLE_TIMEOUT_MS}ms`,
    );
});
