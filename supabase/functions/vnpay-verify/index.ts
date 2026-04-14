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

serve(async (req) => {
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, message: "Missing Authorization header" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await srvClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("User not authenticated");
    const userId = userData.user.id;

    const { vnpayParams } = await req.json();
    if (!vnpayParams || typeof vnpayParams !== "object") throw new Error("Missing vnpayParams");

    // Extract and verify hash
    const receivedHash = (vnpayParams.vnp_SecureHash || "").toLowerCase();
    // Remove hash fields before verification
    const verifyParams = { ...vnpayParams };
    delete verifyParams.vnp_SecureHash;
    delete verifyParams.vnp_SecureHashType;

    const sorted = Object.keys(verifyParams).sort();
    const signData = sorted.map((k) => `${k}=${verifyParams[k]}`).join("&");
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
