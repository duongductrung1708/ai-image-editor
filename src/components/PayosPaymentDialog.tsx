import { useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PaymentScreen } from "@/components/PaymentScreen";
import type { PayosPaymentLink } from "@/hooks/usePayos";
import { useCreatePayosPayment } from "@/hooks/usePayos";
import { toast } from "sonner";

interface PayosPaymentDialogProps {
  open: boolean;
  payment: PayosPaymentLink | null;
  packId: string | null;
  onOpenChange: (open: boolean) => void;
  onPaymentUpdated: (payment: PayosPaymentLink) => void;
  onPaid?: () => void;
  redirectTo?: string;
}

export function PayosPaymentDialog({
  open,
  payment,
  packId,
  onOpenChange,
  onPaymentUpdated,
  onPaid,
  redirectTo,
}: PayosPaymentDialogProps) {
  const createPayment = useCreatePayosPayment();

  const handleRetry = useCallback(async () => {
    if (!packId) return;
    try {
      const next = await createPayment.mutateAsync(packId);
      onPaymentUpdated(next);
    } catch (err) {
      console.error("[PayosPaymentDialog] retry failed", err);
      toast.error("Không thể tạo lại đơn thanh toán.");
    }
  }, [packId, createPayment, onPaymentUpdated]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Thanh toán PayOS · VietQR</DialogTitle>
        </DialogHeader>
        <div className="px-2 pb-6 pt-2">
          {payment ? (
            <PaymentScreen
              orderId={payment.orderId}
              qrCodeUrl={payment.qrCode}
              amount={payment.amount}
              orderCode={payment.orderCode}
              checkoutUrl={payment.checkoutUrl}
              redirectTo={redirectTo}
              onPaid={onPaid}
              onRetry={handleRetry}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PayosPaymentDialog;
