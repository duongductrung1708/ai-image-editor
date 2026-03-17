import http from "node:http";
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
const GEMINI_MAX_OUTPUT_TOKENS = Number(getEnv("GEMINI_MAX_OUTPUT_TOKENS", String(8192)));

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
    "Additionally, try to format as readable Markdown:\n" +
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
  const out = [];

  const flushRoleBlock = (role, buf) => {
    const text = buf.join("\n").trim();
    if (!text) return;
    if (role === "GV") {
      out.push(`- **GV:** ${text.replace(/\n+/g, "\n  ")}`);
    } else if (role === "HS") {
      out.push(`  - **HS:** ${text.replace(/\n+/g, "\n    ")}`);
    } else {
      out.push(text);
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = i + 1 < lines.length ? lines[i + 1] : "";

    const isTableHeader = line.includes("|") && /\|\s*-{2,}/.test(next);
    if (!isTableHeader) {
      out.push(line);
      continue;
    }

    const headerCells = splitTableRow(line);
    const isTwoCol = headerCells.length === 2;
    const looksLikeGvHs =
      isTwoCol &&
      /hoạt động.*gv/i.test(headerCells[0]) &&
      /hoạt động.*hs/i.test(headerCells[1]);

    if (!looksLikeGvHs) {
      out.push(line);
      continue;
    }

    // Consume separator line
    const tableRows = [];
    i += 1;

    // Collect table body rows
    while (i + 1 < lines.length) {
      const candidate = lines[i + 1];
      if (!candidate.includes("|")) break;
      // Stop if it's a new markdown section header.
      if (/^\s*#{1,6}\s+/.test(candidate)) break;
      tableRows.push(candidate);
      i += 1;
    }

    // Decide conversion based on how empty the HS column is.
    let emptyHs = 0;
    const pairs = [];
    for (const r of tableRows) {
      const cells = splitTableRow(r);
      if (cells.length < 2) continue;
      const gv = cells[0];
      const hs = cells[1];
      if (!hs) emptyHs += 1;
      if (!gv && !hs) continue;
      pairs.push({ gv, hs });
    }

    const emptyRatio = pairs.length > 0 ? emptyHs / pairs.length : 1;
    if (pairs.length === 0 || emptyRatio < 0.4) {
      // Keep as table if it seems meaningfully paired.
      out.push(line, next, ...tableRows);
      continue;
    }

    // Convert to paired list, much easier to read than a mostly-empty table.
    out.push(`### ${headerCells[0]} / ${headerCells[1]}`);
    for (const p of pairs) {
      if (p.gv) out.push(`- **GV:** ${p.gv}`);
      if (p.hs) out.push(`  - **HS:** ${p.hs}`);
    }
  }

  // Second pass: compact role blocks in already-converted (or model-produced) GV/HS format.
  // Removes empty HS/GV blocks and merges consecutive blocks of the same role.
  const compacted = [];
  let role = null; // "GV" | "HS" | null
  let buf = [];

  const pushCompactedLine = (l) => compacted.push(l);

  for (const l0 of out.join("\n").split(/\r?\n/)) {
    const l = l0.trimEnd();
    const isGvHeader = /^\s*\*\*GV:\*\*\s*$/.test(l);
    const isHsHeader = /^\s*\*\*HS:\*\*\s*$/.test(l);

    if (isGvHeader || isHsHeader) {
      flushRoleBlock(role, buf);
      role = isGvHeader ? "GV" : "HS";
      buf = [];
      continue;
    }

    if (role) {
      // Stop role capture when hitting a new section header (###, ##, etc.)
      if (/^\s*#{1,6}\s+/.test(l)) {
        flushRoleBlock(role, buf);
        role = null;
        buf = [];
        pushCompactedLine(l);
        continue;
      }

      // Skip pure empty lines inside empty role blocks.
      if (!l.trim()) {
        if (buf.length > 0) buf.push("");
        continue;
      }

      // Remove leading list markers, we format later.
      buf.push(l.replace(/^\s*[-*]\s+/, ""));
      continue;
    }

    pushCompactedLine(l);
  }

  flushRoleBlock(role, buf);

  // Cleanup: collapse excessive blank lines.
  return compacted
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function callGemini({ imageBase64, mimeType, prompt }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}` +
      `:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

    const systemInstruction =
      "You are a professional OCR tool. Extract ALL text from the provided image. " +
      "Follow the user instructions precisely.";

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
        responseMimeType: "application/json",
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
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

      const prompt = buildPrompt(OCR_MODE);

      let content;
      if (OCR_PROVIDER === "gemini") {
        const out = await callGemini({ imageBase64, mimeType, prompt });
        if (!out.ok) return sendJson(res, out.status, { error: out.raw });
        content = out.contentText;
      } else {
        const doFetch = async () => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
          try {
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

              return await fetch(`${OLLAMA_OPENAI_BASE_URL}/chat/completions`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: "Bearer ollama",
                },
                body: JSON.stringify(payload),
                signal: controller.signal,
              });
            }

            // Native Ollama API (preferred for vision): images are raw base64 strings.
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

            return await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(payload),
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timeout);
          }
        };

        let r;
        try {
          r = await doFetch();
        } catch (e) {
          // Retry once for transient timeouts during model warm-up.
          console.warn("[ocr-server] ollama fetch failed, retrying once", e instanceof Error ? e.message : String(e));
          r = await doFetch();
        }

        const raw = await r.text();
        if (!r.ok) {
          console.error("[ocr-server] ollama error", r.status, safeSnippet(raw));
          return sendJson(res, r.status, { error: raw || `Ollama error ${r.status}` });
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

