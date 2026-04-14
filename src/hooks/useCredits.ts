import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface CreditsState {
  balance: number;
  loading: boolean;
}

export function useCredits() {
  const { user } = useAuth();
  const [state, setState] = useState<CreditsState>({ balance: 0, loading: true });

  const fetch = useCallback(async () => {
    if (!user) {
      setState({ balance: 0, loading: false });
      return;
    }
    const { data, error } = await supabase
      .from("user_credits")
      .select("balance")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    // If no row yet (user created before migration), create one
    if (!data) {
      await supabase.from("user_credits").insert({ user_id: user.id, balance: 0 });
      setState({ balance: 0, loading: false });
      return;
    }

    setState({ balance: data.balance, loading: false });
  }, [user]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ...state, refresh: fetch };
}
