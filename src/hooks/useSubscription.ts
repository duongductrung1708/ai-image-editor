import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getTierByProductId, type StripeTier } from "@/lib/stripeTiers";

interface SubscriptionState {
  subscribed: boolean;
  tier: StripeTier | "free";
  subscriptionEnd: string | null;
  loading: boolean;
}

const subscriptionQueryKey = (userId: string | null) =>
  ["subscription", userId] as const;

export function useSubscription() {
  const { user, session } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: subscriptionQueryKey(user?.id ?? null),
    enabled: Boolean(user?.id && session?.access_token),
    queryFn: async () => {
      const accessToken = session?.access_token;
      if (!user?.id || !accessToken) {
        return {
          subscribed: false,
          tier: "free" as const,
          subscriptionEnd: null,
        };
      }

      const { data, error } = await supabase.functions.invoke(
        "check-subscription",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (error) throw error;

      return {
        subscribed: Boolean(data?.subscribed),
        tier: getTierByProductId(data?.product_id),
        subscriptionEnd: (data?.subscription_end as string | null) ?? null,
      };
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const data: SubscriptionState = {
    subscribed: q.data?.subscribed ?? false,
    tier: q.data?.tier ?? "free",
    subscriptionEnd: q.data?.subscriptionEnd ?? null,
    loading: q.isLoading,
  };

  return {
    ...data,
    error: q.error,
    refresh: () =>
      qc.invalidateQueries({
        queryKey: subscriptionQueryKey(user?.id ?? null),
      }),
  };
}
