// PayOS: Create Payment Link (VietQR)
// POST /create-payment-link  { packId: string }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

function parseAllowedOrigins(): string[] {
  const raw = (Deno.env.get("ALLOWED_ORIGINS") || "").trim();
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function requireAllowedOrigins(): boolean {
  return (Deno.env.get("REQUIRE_ALLOWED_ORIGINS") || "0").trim() === "1";
}

function corsHeadersForRequest(req: Request): Record<string, string> {
  const allowlist = parseAllowedOrigins();
  const origin = req.headers.get("origin") || "";
  const allowOrigin =
    allowlist.length === 0
      ? requireAllowedOrigins() ? "null" : "*"
      : allowlist.includes(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...(allowlist.length > 0 ? { Vary: "Origin" } : {}),
  };
}

const CREDIT_PACKS: Record<string, { credits: number; priceVnd: number }> = {
  pack_100: { credits: 100, priceVnd: 25_000 },
  pack_1000: { credits: 1000, priceVnd: 250_000 },
};

const PAYOS_BASE = "https://api-merchant.payos.vn";

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
 * PayOS signature for create-payment-link:
 * signData = "amount=<x>&cancelUrl=<x>&description=<x>&orderCode=<x>&returnUrl=<x>"
 * (keys sorted alphabetically, values as-is, NOT URL-encoded)
 */
async function buildCreateSignature(
  checksumKey: string,
  payload: {
    amount: number;
    cancelUrl: string;
    description: string;
    orderCode: number;
    returnUrl: string;
  },
): Promise<string> {
  const raw =
    `amount=${payload.amount}` +
    `&cancelUrl=${payload.cancelUrl}` +
    `&description=${payload.description}` +
    `&orderCode=${payload.orderCode}` +
    `&returnUrl=${payload.returnUrl}`;
  return await hmacSha256Hex(checksumKey, raw);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersForRequest(req) });
  }

  try {
    const clientId = Deno.env.get("PAYOS_CLIENT_ID");
    const apiKey = Deno.env.get("PAYOS_API_KEY");
    const checksumKey = Deno.env.get("PAYOS_CHECKSUM_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!clientId || !apiKey || !checksumKey) {
      return new Response(
        JSON.stringify({ error: "PayOS credentials not configured" }),
        { status: 500, headers: { ...corsHeadersForRequest(req), "Content-Type": "application/json" } },
      );
    }

    // Auth: extract user from JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeadersForRequest(req), "Content-Type": "application/json" },
      });
    }
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeadersForRequest(req), "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const packId = String(body?.packId ?? "");
    const pack = CREDIT_PACKS[packId];
    if (!pack) {
      return new Response(JSON.stringify({ error: "Invalid packId" }), {
        status: 400,
        headers: { ...corsHeadersForRequest(req), "Content-Type": "application/json" },
      });
    }

    // orderCode: unique positive integer (<= 9007199254740991). Use timestamp+rand.
    const orderCode = Number(
      String(Date.now()).slice(-10) +
        String(Math.floor(Math.random() * 900) + 100),
    );
    // PayOS description max ~25 chars
    const description = `Nap ${pack.credits} credits`.slice(0, 25);

    const origin =
      req.headers.get("origin") ??
      req.headers.get("referer")?.replace(/\/$/, "") ??
      "https://example.com";
    const returnUrl = `${origin}/pricing?payos=success`;
    const cancelUrl = `${origin}/pricing?payos=cancel`;

    const signature = await buildCreateSignature(checksumKey, {
      amount: pack.priceVnd,
      cancelUrl,
      description,
      orderCode,
      returnUrl,
    });

    // Insert order (PENDING) via service role
    const admin = createClient(supabaseUrl, serviceKey);
    const { error: insertErr } = await admin.from("orders").insert({
      user_id: user.id,
      order_code: orderCode,
      amount: pack.priceVnd,
      description,
      status: "PENDING",
      pack_id: packId,
    });
    if (insertErr) {
      console.error("orders insert error", insertErr);
      return new Response(JSON.stringify({ error: "DB insert failed" }), {
        status: 500,
        headers: { ...corsHeadersForRequest(req), "Content-Type": "application/json" },
      });
    }

    // Call PayOS
    const payosRes = await fetch(`${PAYOS_BASE}/v2/payment-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-client-id": clientId,
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        orderCode,
        amount: pack.priceVnd,
        description,
        cancelUrl,
        returnUrl,
        signature,
        buyerName: user.email ?? undefined,
        buyerEmail: user.email ?? undefined,
      }),
    });
    const payosJson = await payosRes.json();

    if (!payosRes.ok || payosJson?.code !== "00" || !payosJson?.data) {
      console.error("PayOS create failed", payosJson);
      await admin
        .from("orders")
        .update({ status: "FAILED" })
        .eq("order_code", orderCode);
      return new Response(
        JSON.stringify({ error: "PayOS create failed", detail: payosJson }),
        { status: 502, headers: { ...corsHeadersForRequest(req), "Content-Type": "application/json" } },
      );
    }

    const d = payosJson.data;
    // Save PayOS metadata
    const { data: updated } = await admin
      .from("orders")
      .update({
        payos_payment_link_id: d.paymentLinkId ?? null,
        qr_code: d.qrCode ?? null,
        checkout_url: d.checkoutUrl ?? null,
      })
      .eq("order_code", orderCode)
      .select("id")
      .maybeSingle();

    return new Response(
      JSON.stringify({
        orderId: updated?.id ?? null,
        orderCode,
        amount: pack.priceVnd,
        description,
        qrCode: d.qrCode,
        checkoutUrl: d.checkoutUrl,
        paymentLinkId: d.paymentLinkId,
      }),
      { status: 200, headers: { ...corsHeadersForRequest(req), "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("create-payment-link error", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message ?? "Internal error" }),
      { status: 500, headers: { ...corsHeadersForRequest(req), "Content-Type": "application/json" } },
    );
  }
});
