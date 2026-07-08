// PayOS Webhook receiver — POST /payos-webhook
// Verifies HMAC-SHA256 signature per PayOS spec, then marks order as PAID.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * PayOS webhook signature = HMAC_SHA256(checksumKey, sortedQueryString(data))
 * Rules:
 *  - Sort data keys alphabetically
 *  - Format: key1=value1&key2=value2 (no URL encoding)
 *  - Arrays/objects are JSON.stringify'd
 *  - null/undefined => empty string
 */
function buildSortedQuery(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  return keys
    .map((k) => {
      const v = obj[k];
      let s: string;
      if (v === null || v === undefined) s = "";
      else if (typeof v === "object") s = JSON.stringify(v);
      else s = String(v);
      return `${k}=${s}`;
    })
    .join("&");
}

async function verifyWebhookData(
  data: Record<string, unknown>,
  signature: string,
  checksumKey: string,
): Promise<boolean> {
  const raw = buildSortedQuery(data);
  const expected = await hmacSha256Hex(checksumKey, raw);
  return expected === signature;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const checksumKey = Deno.env.get("PAYOS_CHECKSUM_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!checksumKey) {
      return new Response(JSON.stringify({ error: "not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = await req.json().catch(() => null) as
      | { code?: string; desc?: string; success?: boolean; data?: Record<string, unknown>; signature?: string }
      | null;

    if (!payload || !payload.data || !payload.signature) {
      // PayOS ping test — return 200 so provider verifies the endpoint
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const valid = await verifyWebhookData(
      payload.data,
      payload.signature,
      checksumKey,
    );
    if (!valid) {
      console.warn("PayOS webhook: invalid signature");
      return new Response(JSON.stringify({ error: "invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const orderCode = Number(payload.data.orderCode);
    if (!Number.isFinite(orderCode)) {
      return new Response(JSON.stringify({ error: "missing orderCode" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // code "00" = success per PayOS docs
    if (payload.code === "00" || payload.success === true) {
      // Idempotent: only update pending orders, and credit once
      const { data: order, error: fetchErr } = await admin
        .from("orders")
        .select("id, user_id, status, pack_id, amount")
        .eq("order_code", orderCode)
        .maybeSingle();

      if (fetchErr || !order) {
        console.error("order not found", orderCode, fetchErr);
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (order.status !== "PAID") {
        const { error: updErr } = await admin
          .from("orders")
          .update({ status: "PAID", paid_at: new Date().toISOString() })
          .eq("id", order.id)
          .eq("status", "PENDING"); // guard vs race

        if (updErr) {
          console.error("order update error", updErr);
        } else if (order.user_id && order.pack_id) {
          // Grant credits based on pack
          const CREDIT_PACKS: Record<string, number> = {
            pack_100: 100,
            pack_1000: 1000,
          };
          const credits = CREDIT_PACKS[order.pack_id];
          if (credits) {
            const { error: creditErr } = await admin.rpc("add_credits", {
              p_user_id: order.user_id,
              p_amount: credits,
              p_reason: `PayOS ${order.pack_id}`,
              p_txn_ref: String(orderCode),
            });
            if (creditErr) console.error("add_credits error", creditErr);
          }
        }
      }
    } else {
      // Non-success codes: mark failed if still pending
      await admin
        .from("orders")
        .update({ status: "FAILED" })
        .eq("order_code", orderCode)
        .eq("status", "PENDING");
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("payos-webhook error", e);
    // Still 200 to avoid PayOS retry storms; log for debugging
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
