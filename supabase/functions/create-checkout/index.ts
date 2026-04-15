import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
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
      "authorization, x-client-info, apikey, content-type, idempotency-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

serve(async (req) => {
  const corsHeaders = corsHeadersForRequest(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    if (corsHeaders["Access-Control-Allow-Origin"] === "null") {
      return new Response(JSON.stringify({ error: "Origin not allowed" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = getBearerToken(req);
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated");

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    const srvClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { error: rlErr } = await srvClient.rpc("enforce_rate_limit", {
      p_user_id: user.id,
      p_ip: getClientIp(req),
      p_scope: "billing",
      p_window_seconds: getRateLimitWindowSeconds(),
      p_max: getRateLimitBillingPerWindow(),
    });
    if (rlErr && String(rlErr.message || "").includes("RATE_LIMIT")) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const priceId = body?.priceId;
    const idemKey =
      (req.headers.get("Idempotency-Key") || "").trim() ||
      String(body?.idempotencyKey || "").trim();
    if (!priceId) throw new Error("priceId is required");

    const { error: idemErr } = await srvClient.rpc("consume_idempotency_key", {
      p_user_id: user.id,
      p_scope: "stripe_checkout",
      p_key: idemKey,
      p_ttl_seconds: getIdempotencyTtlSeconds(),
    });
    if (idemErr && String(idemErr.message || "").includes("IDEMPOTENCY_REPLAY")) {
      return new Response(JSON.stringify({ error: "Duplicate request" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2024-11-20.acacia",
    });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${req.headers.get("origin")}/profile?tab=plan&success=true`,
      cancel_url: `${req.headers.get("origin")}/profile?tab=plan`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
