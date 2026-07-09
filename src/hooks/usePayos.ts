import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { createIdempotencyKey } from "@/lib/idempotency";

export interface PayosPaymentLink {
  orderId: string;
  orderCode: number;
  amount: number;
  description: string;
  qrCode: string;
  checkoutUrl: string;
  paymentLinkId?: string;
}

/**
 * Creates a PayOS VietQR payment link for the given credit pack.
 * Returns the order metadata + VietQR payload for rendering.
 */
export function useCreatePayosPayment() {
  const { session } = useAuth();

  return useMutation({
    mutationFn: async (packId: string): Promise<PayosPaymentLink> => {
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("Missing session access token");

      const idempotencyKey = createIdempotencyKey();
      const { data, error } = await supabase.functions.invoke(
        "create-payment-link",
        {
          body: { packId },
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Idempotency-Key": idempotencyKey,
          },
        },
      );
      if (error) throw error;
      if (!data?.orderId || !data?.qrCode) {
        throw new Error("Phản hồi PayOS không hợp lệ");
      }
      return data as PayosPaymentLink;
    },
  });
}
