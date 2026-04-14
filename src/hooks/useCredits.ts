import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const creditsQueryKey = (userId: string | null) => ["credits", userId] as const;

export function useCredits() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: creditsQueryKey(user?.id ?? null),
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const userId = user?.id;
      if (!userId) return 0;

      const { data, error } = await supabase
        .from("user_credits")
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;

      // If no row yet (user created before migration), create one
      if (!data) {
        const { error: insertErr } = await supabase
          .from("user_credits")
          .insert({ user_id: userId, balance: 0 });
        if (insertErr) throw insertErr;
        return 0;
      }

      return data.balance ?? 0;
    },
    staleTime: 15_000,
  });

  return {
    balance: q.data ?? 0,
    loading: q.isLoading,
    error: q.error,
    refresh: () =>
      qc.invalidateQueries({ queryKey: creditsQueryKey(user?.id ?? null) }),
  };
}
