import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useCreateVnpayPayment() {
  const { session } = useAuth();

  return useMutation({
    mutationFn: async (packId: string) => {
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("Missing session access token");

      const { data, error } = await supabase.functions.invoke(
        "create-vnpay-payment",
        {
          body: { packId },
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (error) throw error;
      return data as { url?: string; txnRef?: string };
    },
  });
}

export function useVerifyVnpayPayment() {
  const { session } = useAuth();

  return useMutation({
    mutationFn: async (vnpayParams: Record<string, string>) => {
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("Missing session access token");

      const { data, error } = await supabase.functions.invoke("vnpay-verify", {
        body: { vnpayParams },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (error) throw error;
      return data as
        | { success: true; credits: number; alreadyProcessed?: boolean }
        | { success: false; message?: string };
    },
  });
}

