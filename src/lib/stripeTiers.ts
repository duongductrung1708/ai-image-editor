export const STRIPE_TIERS = {
  pro: {
    product_id: "prod_UDV9lnVatTu629",
    price_id: "price_1TF496EFLOmzhkN92Pfope8t",
  },
  business: {
    product_id: "prod_UDVAg2cmCxC8t2",
    price_id: "price_1TF49sEFLOmzhkN91E5UcmgL",
  },
} as const;

export type StripeTier = keyof typeof STRIPE_TIERS;

export function getTierByProductId(productId: string | null): StripeTier | "free" {
  if (!productId) return "free";
  for (const [tier, config] of Object.entries(STRIPE_TIERS)) {
    if (config.product_id === productId) return tier as StripeTier;
  }
  return "free";
}
