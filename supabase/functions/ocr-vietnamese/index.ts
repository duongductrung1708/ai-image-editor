/// <reference lib="deno.ns" />

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { image, mimeType } = await req.json();
    if (!image || typeof image !== "string")
      throw new Error("image (base64) is required");

    // Local-only OCR via Ollama (expects Ollama running on your machine).
    // When running via `supabase functions serve`, the function is inside Docker,
    // so the host machine is typically reachable at `host.docker.internal`.
    const OLLAMA_BASE_URL = (
      Deno.env.get("OLLAMA_BASE_URL") || "http://localhost:11434"
    ).replace(/\/+$/, "");
    const OLLAMA_MODEL = Deno.env.get("OLLAMA_MODEL");
    if (!OLLAMA_MODEL) throw new Error("OLLAMA_MODEL is not configured");

    const prompt =
      "Extract all Vietnamese text (and other languages if present) from this image.\n" +
      "Return ONLY valid JSON (no markdown, no extra text) with fields:\n" +
      "- full_text: string\n" +
      "- blocks: array of {text, x, y, width, height} using percentage coordinates (0-100)\n" +
      "If bounding boxes are uncertain, still return best-effort approximate values.\n";

    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        images: [image],
        stream: false,
        options: {
          temperature: 0,
        },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            error: "Rate limit exceeded. Please try again later.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const t = await response.text();
      console.error("Ollama API error:", response.status, t);
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json();

    const textOut: string | undefined =
      typeof data?.response === "string" ? data.response : undefined;
    if (!textOut) throw new Error("Ollama returned empty response");

    let parsed: { full_text?: string; blocks?: unknown } | null = null;
    try {
      parsed = JSON.parse(textOut);
    } catch {
      throw new Error("Ollama response was not valid JSON");
    }

    const blocks = Array.isArray(parsed?.blocks) ? parsed?.blocks : [];
    return new Response(
      JSON.stringify({
        text: typeof parsed?.full_text === "string" ? parsed.full_text : "",
        blocks,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("OCR error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
