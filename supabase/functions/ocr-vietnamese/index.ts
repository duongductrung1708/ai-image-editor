/// <reference lib="deno.ns" />

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

type ParsedOcr = {
  markdown?: string;
  full_text?: string;
  blocks?: unknown;
  warning?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalizeImageAndMimeType(
  imageInput: unknown,
  mimeTypeInput: unknown,
): { image: string; mimeType: string } {
  let image = typeof imageInput === "string" ? imageInput.trim() : "";
  let mimeType = typeof mimeTypeInput === "string" && mimeTypeInput.trim()
    ? mimeTypeInput.trim()
    : "image/png";

  const dataUrlMatch = /^data:([^;]+);base64,(.*)$/i.exec(image);
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1] || mimeType;
    image = dataUrlMatch[2] || "";
  }

  image = image.replace(/\s+/g, "");
  return { image, mimeType };
}

function tryParseJsonObject(candidate: string | undefined): ParsedOcr | null {
  if (!candidate || typeof candidate !== "string") return null;
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === "object" ? parsed as ParsedOcr : null;
  } catch {
    return null;
  }
}

function parseJsonFromText(textOut: string): ParsedOcr {
  const direct = tryParseJsonObject(textOut.trim());
  if (direct) return direct;

  const fenceMatch = textOut.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const fromFence = tryParseJsonObject(fenceMatch?.[1]?.trim());
  if (fromFence) return fromFence;

  const firstBrace = textOut.indexOf("{");
  const lastBrace = textOut.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const sub = textOut.slice(firstBrace, lastBrace + 1);
    const fromSub = tryParseJsonObject(sub);
    if (fromSub) return fromSub;
  }

  throw new Error("Model response was not valid JSON");
}

function postProcessMarkdown(markdown: string, style: string): string {
  if (!markdown) return "";
  let lines = markdown.split(/\r?\n/);
  if (style === "clean") {
    lines = lines.filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (
        /^\d+\s*-\s*Text\s*$/i.test(t) ||
        /^\d+\s*-\s*Marginalia\s*$/i.test(t) ||
        /^Marginalia\s*$/i.test(t) ||
        /^Text\s*$/i.test(t) ||
        /^Sheet\s+\d+(\s*\/\s*\d+)?\s*$/i.test(t)
      ) {
        return false;
      }
      return true;
    });
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildPrompt(mode: string, markdownStyle: string, provider: string): string {
  if (provider === "lmstudio") {
    if (mode === "json" || mode === "both") {
      return (
        "Trich xuat toan bo van ban trong anh. BAT BUOC dinh vi vi tri cua tung doan van ban.\n" +
        "Hay tra ve ket qua tuan thu CHINH XAC dinh dang sau cho moi doan van ban:\n" +
        "[Noi dung van ban] <box>(ymin, xmin), (ymax, xmax)</box>\n" +
        "Luu y: Toa do nam trong khoang tu 0 den 1000."
      );
    }
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

  const base = markdownStyle === "clean" ? baseClean : baseRaw;
  if (mode === "markdown") {
    return (
      base +
      "Return ONLY Markdown/plain text (no code fences, no extra explanations).\n"
    );
  }
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

function parseQwenBoundingBoxes(text: string): ParsedOcr | null {
  const blocks: Array<{
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }> = [];
  let markdown = text;
  const toPercent = (v: string): number => Number.parseInt(v, 10) / 10;

  const parseMatch = (
    _: string,
    x1: string,
    y1: string,
    x2: string,
    y2: string,
    textContent: string,
    offset: number,
    full: string,
  ): string => {
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

    const px1 = toPercent(x1);
    const py1 = toPercent(y1);
    const px2 = toPercent(x2);
    const py2 = toPercent(y2);
    blocks.push({
      text: inferredText,
      x: px1,
      y: py1,
      width: px2 - px1,
      height: py2 - py1,
    });
    return returnText;
  };

  const boxRegexA = /<box>\((\d+),(\d+)\),\((\d+),(\d+)\)([\s\S]*?)<\/box>/g;
  markdown = markdown.replace(boxRegexA, parseMatch);

  const boxRegexB = /<box\((\d+),(\d+)\),\((\d+),(\d+)\)([\s\S]*?)<\/box>/g;
  markdown = markdown.replace(boxRegexB, parseMatch);

  if (blocks.length === 0) return null;
  const cleaned = markdown.trim();
  return { markdown: cleaned, full_text: cleaned, blocks };
}

function buildMarkdownFromBlocks(
  blocks: Array<{ text?: string }>,
): string {
  return blocks
    .filter((b) => typeof b?.text === "string" && b.text.trim())
    .map((b) => b.text!.trim())
    .join("\n");
}

function parseOcrPayload(content: string, markdownStyle: string): ParsedOcr {
  try {
    const parsed = parseJsonFromText(content);
    const markdownRaw = typeof parsed?.markdown === "string" ? parsed.markdown.trim() : "";
    const fullTextRaw = typeof parsed?.full_text === "string"
      ? parsed.full_text.trim()
      : "";
    const blocks = Array.isArray(parsed?.blocks) ? parsed.blocks : [];

    // Fallback chain: markdown -> full_text -> joined blocks text
    let bestText = markdownRaw;
    if (!bestText && fullTextRaw) bestText = fullTextRaw;
    if (!bestText && blocks.length > 0) {
      bestText = buildMarkdownFromBlocks(
        blocks as Array<{ text?: string }>,
      );
    }

    const markdown = postProcessMarkdown(bestText, markdownStyle);
    const fullText = fullTextRaw || markdown;

    console.log(
      `[ocr-parse] markdownRaw.len=${markdownRaw.length} fullTextRaw.len=${fullTextRaw.length} blocks=${blocks.length} final.len=${markdown.length}`,
    );

    return {
      markdown,
      full_text: fullText,
      blocks,
      ...(typeof parsed?.warning === "string" ? { warning: parsed.warning } : {}),
    };
  } catch (e) {
    console.error("[ocr-parse] JSON parse failed, using raw text:", e);
    const cleaned = postProcessMarkdown(content, markdownStyle);
    return {
      markdown: cleaned,
      full_text: cleaned,
      blocks: [],
      warning: "Model did not return JSON; returned plain text/markdown instead.",
    };
  }
}

function getSafeBaseUrlFromEnv(name: string, fallback: string): string {
  const baseUrl = (Deno.env.get(name) || fallback).replace(/\/+$/, "");
  const lowered = baseUrl.toLowerCase();
  if (
    lowered.includes("localhost") ||
    lowered.includes("127.0.0.1") ||
    lowered.includes("host.docker.internal")
  ) {
    throw new Error(
      `${name} cannot use localhost/127.0.0.1 on Supabase cloud. Use a public URL.`,
    );
  }
  return baseUrl;
}

type OcrConfig = {
  provider: string;
  mode: string;
  markdownStyle: string;
  ollamaApi: string;
};

function getOcrConfig(): OcrConfig {
  return {
    provider: (Deno.env.get("OCR_PROVIDER") || "gemini").toLowerCase(),
    mode: (Deno.env.get("OCR_MODE") || "both").toLowerCase(),
    markdownStyle: (Deno.env.get("OCR_MARKDOWN_STYLE") || "raw").toLowerCase(),
    ollamaApi: (Deno.env.get("OLLAMA_API") || "native").toLowerCase(),
  };
}

function buildOcrPrompt(cfg: OcrConfig): string {
  const mode = cfg.mode === "json" || cfg.mode === "both" ? "both" : "markdown";
  if (["gemini", "lmstudio", "openai"].includes(cfg.provider)) {
    return buildPrompt(mode, cfg.markdownStyle, cfg.provider);
  }
  return buildPrompt(cfg.mode, cfg.markdownStyle, cfg.provider);
}

async function fetchProviderContent(
  normalized: { image: string; mimeType: string },
  cfg: OcrConfig,
  prompt: string,
): Promise<string> {
  let response: Response;
  if (cfg.provider === "gemini") {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const geminiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

    response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: normalized.mimeType,
                  data: normalized.image,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: cfg.mode === "markdown"
            ? "text/plain"
            : "application/json",
        },
      }),
    });
  } else if (cfg.provider === "ollama") {
    const OLLAMA_BASE_URL = getSafeBaseUrlFromEnv(
      "OLLAMA_BASE_URL",
      "https://example-ollama-server.com",
    );
    const OLLAMA_MODEL = Deno.env.get("OLLAMA_MODEL");
    if (!OLLAMA_MODEL) throw new Error("OLLAMA_MODEL is not configured");

    if (cfg.ollamaApi === "openai") {
      const OLLAMA_OPENAI_BASE_URL = (
        Deno.env.get("OLLAMA_OPENAI_BASE_URL") || `${OLLAMA_BASE_URL}/v1`
      ).replace(/\/+$/, "");
      response = await fetch(`${OLLAMA_OPENAI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer ollama",
        },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
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
                  image_url: {
                    url: `data:${normalized.mimeType};base64,${normalized.image}`,
                  },
                },
              ],
            },
          ],
          temperature: 0,
          max_tokens: 4096,
          ...(cfg.mode !== "markdown"
            ? { response_format: { type: "json_object" } }
            : {}),
        }),
      });
    } else {
      response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: [{ role: "user", content: prompt, images: [normalized.image] }],
          stream: false,
          options: { temperature: 0 },
        }),
      });
    }
  } else if (cfg.provider === "openai" || cfg.provider === "lmstudio") {
    const isLmStudio = cfg.provider === "lmstudio";
    const model = isLmStudio
      ? (Deno.env.get("LMSTUDIO_MODEL") || "")
      : (Deno.env.get("OPENAI_MODEL") || "gpt-4o");
    const baseUrl = (
      isLmStudio
        ? (Deno.env.get("LMSTUDIO_BASE_URL") || "http://127.0.0.1:1234/v1")
        : (Deno.env.get("OPENAI_BASE_URL") || "https://api.openai.com/v1")
    ).replace(/\/+$/, "");
    const apiKey = isLmStudio ? "" : (Deno.env.get("OPENAI_API_KEY") || "");

    if (!model) throw new Error(`${isLmStudio ? "LMSTUDIO_MODEL" : "OPENAI_MODEL"} is not configured`);
    if (!isLmStudio && !apiKey) throw new Error("OPENAI_API_KEY is not configured");
    if (isLmStudio) getSafeBaseUrlFromEnv("LMSTUDIO_BASE_URL", baseUrl);

    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(isLmStudio ? {} : { "Authorization": `Bearer ${apiKey}` }),
      },
      body: JSON.stringify({
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
                image_url: {
                  url: `data:${normalized.mimeType};base64,${normalized.image}`,
                },
              },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 4096,
        ...(cfg.mode !== "markdown"
          ? { response_format: { type: "json_object" } }
          : {}),
      }),
    });
  } else {
    throw new Error(
      "Unsupported OCR_PROVIDER. Use 'gemini', 'openai', 'lmstudio' or 'ollama'.",
    );
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Rate limit exceeded. Please try again later.");
    }
    const t = await response.text();
    console.error("OCR provider error:", response.status, t);
    throw new Error(`OCR provider error: ${response.status}`);
  }

  const data = await response.json();
  if (cfg.provider === "gemini") {
    return data?.candidates?.[0]?.content?.parts?.find((p: { text?: unknown }) =>
      typeof p?.text === "string"
    )?.text || "";
  }
  if (cfg.provider === "openai" || cfg.provider === "lmstudio" || cfg.ollamaApi === "openai") {
    return typeof data?.choices?.[0]?.message?.content === "string"
      ? data.choices[0].message.content
      : "";
  }
  return typeof data?.message?.content === "string" ? data.message.content : "";
}

async function runSingleOcr(
  image: unknown,
  mimeType: unknown,
): Promise<ParsedOcr> {
  const normalized = normalizeImageAndMimeType(image, mimeType);
  if (!normalized.image) throw new Error("imageBase64 is required");

  const cfg = getOcrConfig();
  const prompt = buildOcrPrompt(cfg);
  const textOut = await fetchProviderContent(normalized, cfg, prompt);
  if (!textOut) throw new Error("OCR provider returned empty response");

  if (cfg.provider === "lmstudio" && (cfg.mode === "json" || cfg.mode === "both")) {
    const qwenData = parseQwenBoundingBoxes(textOut);
    if (qwenData) {
      return {
        markdown: postProcessMarkdown(qwenData.markdown || "", cfg.markdownStyle),
        full_text: typeof qwenData.full_text === "string" ? qwenData.full_text : "",
        blocks: Array.isArray(qwenData.blocks) ? qwenData.blocks : [],
      };
    }
  }

  if (cfg.mode === "markdown") {
    const cleaned = postProcessMarkdown(textOut, cfg.markdownStyle);
    return { markdown: cleaned, full_text: cleaned, blocks: [] };
  }
  return parseOcrPayload(textOut, cfg.markdownStyle);
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
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

function mergeBatchMarkdown(
  pages: Array<{ ok: boolean; name: string; markdown: string; full_text: string; error?: string }>,
): string {
  const parts: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const safeLabel = String(p.name || `Trang ${i + 1}`).replace(/\r?\n/g, " ").trim();
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

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const body = await req.json();

    const isBatchPath = url.pathname.endsWith("/ocr-vietnamese/batch") ||
      url.pathname.endsWith("/api/ocr/batch");
    const isSinglePath = url.pathname.endsWith("/ocr-vietnamese") ||
      url.pathname.endsWith("/api/ocr");
    const isBatchRequest = isBatchPath || Array.isArray(body?.images);

    if (isBatchRequest) {
      const images = body?.images;
      if (!Array.isArray(images) || images.length === 0) {
        return new Response(
          JSON.stringify({
            error:
              "images must be a non-empty array of { imageBase64|image, mimeType?, name? }",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const maxImages = Math.max(
        1,
        Math.min(100, Number(Deno.env.get("OCR_BATCH_MAX_IMAGES") || "30")),
      );
      if (images.length > maxImages) {
        return new Response(
          JSON.stringify({ error: `Too many images (max ${maxImages})` }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const maxConcurrency = Math.max(
        1,
        Math.min(8, Number(Deno.env.get("OCR_BATCH_CONCURRENCY") || "2")),
      );
      const requested = Number(body?.concurrency);
      const concurrency = Number.isFinite(requested) && requested > 0
        ? Math.min(maxConcurrency, Math.floor(requested))
        : maxConcurrency;

      const tasks = images.map((entry: Record<string, unknown>, index: number) => ({
        index,
        name: typeof entry?.name === "string" && entry.name
          ? entry.name
          : `Trang ${index + 1}`,
        image: entry?.image ?? entry?.imageBase64,
        mimeType: entry?.mimeType,
      }));

      const pages = await runPool(tasks, concurrency, async (task) => {
        try {
          if (typeof task.image !== "string" || !task.image.trim()) {
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
          const out = await runSingleOcr(task.image, task.mimeType);
          return {
            index: task.index,
            name: task.name,
            ok: true,
            markdown: out.markdown || out.full_text || "",
            full_text: out.full_text || out.markdown || "",
            blocks: Array.isArray(out.blocks) ? out.blocks : [],
            ...(typeof out.warning === "string" ? { warning: out.warning } : {}),
          };
        } catch (err) {
          return {
            index: task.index,
            name: task.name,
            ok: false,
            markdown: "",
            full_text: "",
            blocks: [],
            error: err instanceof Error ? err.message : "Unknown error",
          };
        }
      });

      pages.sort((a, b) => a.index - b.index);
      const mergedMarkdown = mergeBatchMarkdown(pages);
      const mergedFullText = pages
        .filter((p) => p.ok)
        .map((p) => p.full_text || p.markdown)
        .join("\n\n");

      return new Response(
        JSON.stringify({
          markdown: mergedMarkdown,
          full_text: mergedFullText,
          pages,
          pageCount: pages.length,
          concurrency,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!isSinglePath) {
      return new Response(
        JSON.stringify({ error: "Not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const singleImage = body?.image ?? body?.imageBase64;
    const payload = await runSingleOcr(singleImage, body?.mimeType);
    return new Response(
      JSON.stringify({
        markdown: payload.markdown || payload.full_text || "",
        full_text: payload.full_text || "",
        blocks: Array.isArray(payload.blocks) ? payload.blocks : [],
        ...(typeof payload.warning === "string" ? { warning: payload.warning } : {}),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("OCR error:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    if (message.toLowerCase().includes("too large")) {
      return new Response(
        JSON.stringify({ error: "Request body too large" }),
        {
          status: 413,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const status = message.toLowerCase().includes("rate limit") ? 429 : 500;
    return new Response(
      JSON.stringify({
        error: message,
      }),
      {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
