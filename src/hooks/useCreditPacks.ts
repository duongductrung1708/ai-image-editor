import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CreditPack = {
  id: string;
  credits: number;
  priceVnd: number;
  label: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
};

const FALLBACK: CreditPack[] = [
  { id: "pack_100", credits: 100, priceVnd: 25_000, label: "100 credits", description: "~$1", sortOrder: 1, active: true },
  { id: "pack_1000", credits: 1000, priceVnd: 250_000, label: "1.000 credits", description: "~$10", sortOrder: 2, active: true },
];

export function useCreditPacks(opts?: { includeInactive?: boolean }) {
  const includeInactive = !!opts?.includeInactive;
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const query = supabase
      .from("credit_packs")
      .select("id,credits,price_vnd,label,description,sort_order,active")
      .order("sort_order", { ascending: true });
    const { data, error } = await query;
    if (error || !data) {
      setPacks(FALLBACK);
    } else {
      const mapped: CreditPack[] = data.map((r: any) => ({
        id: r.id,
        credits: r.credits,
        priceVnd: r.price_vnd,
        label: r.label,
        description: r.description,
        sortOrder: r.sort_order,
        active: r.active,
      }));
      setPacks(includeInactive ? mapped : mapped.filter((p) => p.active));
    }
    setLoading(false);
  }, [includeInactive]);

  useEffect(() => {
    load();
  }, [load]);

  return { packs, loading, refresh: load };
}
