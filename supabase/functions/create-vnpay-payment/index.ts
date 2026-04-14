import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function vnpayDate(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function encodeVnp(value: unknown): string {
  // VNPay canonical query encoding: encodeURIComponent + space as '+'
  return encodeURIComponent(String(value))
    .replace(/%20/g, "+")
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildVnpQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${encodeVnp(k)}=${encodeVnp(params[k])}`)
    .join("&");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const tmnCode = Deno.env.get("VNPAY_TMN_CODE") ?? "";
  const hashSecret = Deno.env.get("VNPAY_HASH_SECRET") ?? "";

  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase config (SUPABASE_URL / SUPABASE_ANON_KEY)" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  if (!serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase service role key (SUPABASE_SERVICE_ROLE_KEY)" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  if (!tmnCode || !hashSecret) {
    return new Response(JSON.stringify({ error: "VNPay not configured (VNPAY_TMN_CODE / VNPAY_HASH_SECRET)" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user) throw new Error("User not authenticated");

    const body = await req.json().catch(() => null);
    const packId = body?.packId as string | undefined;
    if (!packId) {
      return new Response(JSON.stringify({ error: "packId is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    const pack = CREDIT_PACKS[packId];
    if (!pack) {
      return new Response(JSON.stringify({ error: "Invalid packId" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const vnpayUrl = Deno.env.get("VNPAY_URL") || "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
    const origin = req.headers.get("origin") || "https://localhost:3000";
    const returnUrl = `${origin}/pricing?vnpay_return=1`;

    const txnRef = `${user.id.slice(0, 8)}_${Date.now()}`;
    const now = new Date();
    const createDate = vnpayDate(now);

    const params: Record<string, string> = {
      vnp_Version: "2.1.0",
      vnp_Command: "pay",
      vnp_TmnCode: tmnCode,
      vnp_Locale: "vn",
      vnp_CurrCode: "VND",
      vnp_TxnRef: txnRef,
      vnp_OrderInfo: `Nap ${pack.credits} credits cho ${user.email}`,
      vnp_OrderType: "other",
      vnp_Amount: (pack.priceVnd * 100).toString(),
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: "127.0.0.1",
      vnp_CreateDate: createDate,
    };

    const signData = buildVnpQuery(params);
    const secureHash = await hmacSha512(hashSecret, signData);

    const paymentUrl = `${vnpayUrl}?${signData}&vnp_SecureHash=${encodeVnp(secureHash)}`;

    // Store pending transaction in credit_transactions using service role
    const srvClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { error: insertErr } = await srvClient.from("credit_transactions").insert({
      user_id: user.id,
      amount: pack.credits,
      type: "topup",
      description: `Pending: ${pack.credits} credits (${txnRef})`,
      vnpay_txn_ref: txnRef,
    });
    if (insertErr) {
      console.error("create-vnpay-payment insert error:", insertErr);
      throw new Error("Failed to create pending transaction");
    }

    return new Response(JSON.stringify({ url: paymentUrl, txnRef }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("create-vnpay-payment error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
