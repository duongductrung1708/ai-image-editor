import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { createIdempotencyKey } from "@/lib/idempotency";
import { creditsQueryKey } from "@/hooks/useCredits";

export function useCreateVnpayPayment() {
  const { session } = useAuth();

  return useMutation({
    mutationFn: async (packId: string) => {
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("Missing session access token");

      const idempotencyKey = createIdempotencyKey();
      const { data, error } = await supabase.functions.invoke(
        "create-vnpay-payment",
        {
          body: { packId },
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Idempotency-Key": idempotencyKey,
          },
        },
      );
      if (error) throw error;
      return data as { url?: string; txnRef?: string };
    },
  });
}

export function useVerifyVnpayPayment() {
  const { session, user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (vnpayParams: Record<string, string>) => {
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("Missing session access token");

      const idempotencyKey = createIdempotencyKey();
      const { data, error } = await supabase.functions.invoke("vnpay-verify", {
        body: { vnpayParams },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Idempotency-Key": idempotencyKey,
        },
      });
      if (error) throw error;
      return data as
        | { success: true; credits: number; alreadyProcessed?: boolean }
        | { success: false; message?: string };
    },
    onSuccess: async (data) => {
      if (!data?.success) return;
      if (!user?.id) return;

      // Optimistic-ish: immediately reflect credited balance in UI.
      // We still invalidate afterwards to reconcile with DB.
      qc.setQueryData(creditsQueryKey(user.id), (prev: unknown) => {
        const prevNum = typeof prev === "number" ? prev : 0;
        return prevNum + (data.credits ?? 0);
      });

      await qc.invalidateQueries({ queryKey: creditsQueryKey(user.id) });
    },
  });
}

