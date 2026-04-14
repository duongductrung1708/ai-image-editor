export const CREDIT_PACKS = [
  { id: "pack_100", credits: 100, priceVnd: 25_000, label: "100 credits", description: "~$1" },
  { id: "pack_1000", credits: 1000, priceVnd: 250_000, label: "1.000 credits", description: "~$10" },
] as const;

export type CreditPackId = (typeof CREDIT_PACKS)[number]["id"];

export function getPackById(id: string) {
  return CREDIT_PACKS.find((p) => p.id === id) ?? null;
}
