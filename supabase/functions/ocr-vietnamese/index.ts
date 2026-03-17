import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { image, mimeType } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content: "You are a professional OCR tool. Extract ALL text from the provided image. Return structured data with text blocks and their approximate bounding box positions as percentages of the image dimensions (0-100). Always respond using the extract_text_blocks tool."
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType || "image/png"};base64,${image}`,
                },
              },
              {
                type: "text",
                text: "Extract all Vietnamese text (and other languages if present) from this image. For each text block, provide its content and approximate bounding box position as percentage coordinates relative to the image dimensions."
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_text_blocks",
              description: "Return extracted text blocks with bounding box positions",
              parameters: {
                type: "object",
                properties: {
                  full_text: {
                    type: "string",
                    description: "The complete extracted text preserving original formatting and line breaks"
                  },
                  blocks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        text: { type: "string", description: "The text content of this block" },
                        x: { type: "number", description: "Left position as percentage (0-100)" },
                        y: { type: "number", description: "Top position as percentage (0-100)" },
                        width: { type: "number", description: "Width as percentage (0-100)" },
                        height: { type: "number", description: "Height as percentage (0-100)" },
                      },
                      required: ["text", "x", "y", "width", "height"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["full_text", "blocks"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_text_blocks" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    
    // Parse tool call response
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify({
        text: parsed.full_text || "",
        blocks: parsed.blocks || [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback to regular message content
    const text = data.choices?.[0]?.message?.content || "";
    return new Response(JSON.stringify({ text, blocks: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("OCR error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
