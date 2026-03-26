import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getTierByProductId, type StripeTier } from "@/lib/stripeTiers";

interface SubscriptionState {
  subscribed: boolean;
  tier: StripeTier | "free";
  subscriptionEnd: string | null;
  loading: boolean;
}

export function useSubscription() {
  const { user, session } = useAuth();
  const [state, setState] = useState<SubscriptionState>({
    subscribed: false,
    tier: "free",
    subscriptionEnd: null,
    loading: true,
  });

  const check = useCallback(async () => {
    if (!user) {
      setState({ subscribed: false, tier: "free", subscriptionEnd: null, loading: false });
      return;
    }
    const accessToken = session?.access_token;
    if (!accessToken) {
      setState({ subscribed: false, tier: "free", subscriptionEnd: null, loading: false });
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke("check-subscription", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (error) throw error;
      setState({
        subscribed: data.subscribed,
        tier: getTierByProductId(data.product_id),
        subscriptionEnd: data.subscription_end,
        loading: false,
      });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, [session, user]);

  useEffect(() => {
    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, [check]);

  return { ...state, refresh: check };
}
