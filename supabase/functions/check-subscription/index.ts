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

/** Stripe may return `product` as id string or expanded object on subscription items. */
function productIdFromPrice(price: { product?: string | { id?: string } } | null | undefined): string | null {
  if (!price?.product) return null;
  const p = price.product;
  if (typeof p === "string") return p;
  if (typeof p === "object" && p !== null && typeof p.id === "string") return p.id;
  return null;
}

serve(async (req) => {
  const corsHeaders = corsHeadersForRequest(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    if (corsHeaders["Access-Control-Allow-Origin"] === "null") {
      return new Response(JSON.stringify({ error: "Origin not allowed" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = getBearerToken(req);
    if (!token) throw new Error("No authorization header");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(userError.message);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");

    const { error: rlErr } = await supabaseClient.rpc("enforce_rate_limit", {
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

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customerId = customers.data[0].id;
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 10,
    });

    const paidStatuses = new Set(["active", "trialing"]);
    const sub = subscriptions.data.find((s: { status: string }) => paidStatuses.has(s.status));

    const hasActiveSub = Boolean(sub);
    let productId: string | null = null;
    let subscriptionEnd: string | null = null;

    if (sub) {
      subscriptionEnd = new Date(sub.current_period_end * 1000).toISOString();
      const firstItem = sub.items.data[0];
      productId = firstItem ? productIdFromPrice(firstItem.price) : null;
    }

    return new Response(JSON.stringify({
      subscribed: hasActiveSub,
      product_id: productId,
      subscription_end: subscriptionEnd,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("check-subscription error:", message, error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
