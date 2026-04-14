import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

function parseAllowedOrigins(): string[] {
  const raw = (Deno.env.get("ALLOWED_ORIGINS") || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
  const first = xff.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip") || "";
}

function getRateLimitWindowSeconds(): number {
  const raw = Deno.env.get("RATE_LIMIT_WINDOW_SECONDS") || "60";
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : 60;
}

function getRateLimitBillingPerWindow(): number {
  const raw = Deno.env.get("RATE_LIMIT_BILLING_PER_WINDOW") || "10";
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : 10;
}

function getIdempotencyTtlSeconds(): number {
  const raw = Deno.env.get("IDEMPOTENCY_TTL_SECONDS") || "600";
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : 600;
}

const CREDIT_PACKS: Record<string, { credits: number; priceVnd: number }> = {
  pack_100: { credits: 100, priceVnd: 25_000 },
  pack_1000: { credits: 1000, priceVnd: 250_000 },
};

function hmacSha512(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  return crypto.subtle
    .importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-512" }, false, ["sign"])
    .then((k) => crypto.subtle.sign("HMAC", k, enc.encode(data)))
    .then((buf) =>
      Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    );
}

function encodeVnp(value: unknown): string {
  // VNPay canonical query encoding: encodeURIComponent + space as '+'
  return encodeURIComponent(String(value))
    .replace(/%20/g, "+")
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildVnpQuery(params: Record<string, unknown>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${encodeVnp(k)}=${encodeVnp(params[k])}`)
    .join("&");
}

serve(async (req) => {
  const corsHeaders = corsHeadersForRequest(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const hashSecret = Deno.env.get("VNPAY_HASH_SECRET") ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ success: false, message: "Missing Supabase config (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  if (!hashSecret) {
    return new Response(JSON.stringify({ success: false, message: "VNPay not configured (VNPAY_HASH_SECRET)" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  const srvClient = createClient(
    supabaseUrl,
    serviceRoleKey,
    { auth: { persistSession: false } },
  );

  try {
    // Authenticate user
    if (corsHeaders["Access-Control-Allow-Origin"] === "null") {
      return new Response(JSON.stringify({ success: false, message: "Origin not allowed" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = getBearerToken(req);
    if (!token) {
      return new Response(JSON.stringify({ success: false, message: "Missing Authorization header" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    const { data: userData, error: userError } = await srvClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("User not authenticated");
    const userId = userData.user.id;

    const { error: rlErr } = await srvClient.rpc("enforce_rate_limit", {
      p_user_id: userId,
      p_ip: getClientIp(req),
      p_scope: "billing",
      p_window_seconds: getRateLimitWindowSeconds(),
      p_max: getRateLimitBillingPerWindow(),
    });
    if (rlErr && String(rlErr.message || "").includes("RATE_LIMIT")) {
      return new Response(JSON.stringify({ success: false, message: "Rate limit exceeded" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const idemKey = (req.headers.get("Idempotency-Key") || "").trim();
    const { error: idemErr } = await srvClient.rpc("consume_idempotency_key", {
      p_user_id: userId,
      p_scope: "vnpay_verify",
      p_key: idemKey,
      p_ttl_seconds: getIdempotencyTtlSeconds(),
    });
    if (idemErr && String(idemErr.message || "").includes("IDEMPOTENCY_REPLAY")) {
      return new Response(JSON.stringify({ success: false, message: "Duplicate request" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { vnpayParams } = await req.json();
    if (!vnpayParams || typeof vnpayParams !== "object") throw new Error("Missing vnpayParams");

    // Extract and verify hash
    const receivedHash = (vnpayParams.vnp_SecureHash || "").toLowerCase();
    // Remove hash fields before verification
    const verifyParams = { ...vnpayParams };
    delete verifyParams.vnp_SecureHash;
    delete verifyParams.vnp_SecureHashType;

    const signData = buildVnpQuery(verifyParams as Record<string, unknown>);
    const computedHash = await hmacSha512(hashSecret, signData);

    if (computedHash.toLowerCase() !== receivedHash) {
      return new Response(JSON.stringify({ success: false, message: "Invalid signature" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const responseCode = vnpayParams.vnp_ResponseCode;
    if (responseCode !== "00") {
      return new Response(JSON.stringify({ success: false, message: `Payment failed: ${responseCode}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const txnRef = vnpayParams.vnp_TxnRef;
    const amountVnd = parseInt(vnpayParams.vnp_Amount) / 100;

    // Find matching pack
    const pack = Object.values(CREDIT_PACKS).find((p) => p.priceVnd === amountVnd);
    if (!pack) {
      return new Response(JSON.stringify({ success: false, message: "Unknown pack amount" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already processed (idempotency)
    const { data: existing } = await srvClient
      .from("credit_transactions")
      .select("id, description")
      .eq("vnpay_txn_ref", txnRef)
      .eq("user_id", userId)
      .single();

    if (existing && !existing.description?.startsWith("Pending:")) {
      // Already processed
      return new Response(JSON.stringify({ success: true, credits: pack.credits, alreadyProcessed: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Credit the user - update balance
    const { data: currentCredits } = await srvClient
      .from("user_credits")
      .select("balance")
      .eq("user_id", userId)
      .single();

    const currentBalance = currentCredits?.balance ?? 0;

    if (currentCredits) {
      await srvClient
        .from("user_credits")
        .update({ balance: currentBalance + pack.credits })
        .eq("user_id", userId);
    } else {
      await srvClient
        .from("user_credits")
        .insert({ user_id: userId, balance: pack.credits });
    }

    // Update transaction record
    if (existing) {
      await srvClient
        .from("credit_transactions")
        .update({ description: `Completed: +${pack.credits} credits (${txnRef})` })
        .eq("id", existing.id);
    } else {
      await srvClient.from("credit_transactions").insert({
        user_id: userId,
        amount: pack.credits,
        type: "topup",
        description: `Completed: +${pack.credits} credits (${txnRef})`,
        vnpay_txn_ref: txnRef,
      });
    }

    return new Response(JSON.stringify({ success: true, credits: pack.credits }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("vnpay-verify error:", error);
    return new Response(
      JSON.stringify({ success: false, message: error instanceof Error ? error.message : String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
