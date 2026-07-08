import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, Loader2, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type OrderStatus = "PENDING" | "PAID" | "CANCELLED" | "FAILED";

interface PaymentScreenProps {
  orderId: string;
  /** VietQR EMVCo payload string returned by PayOS (`data.qrCode`). */
  qrCodeUrl: string;
  /** Optional amount displayed above QR */
  amount?: number;
  /** Optional order code shown to the user */
  orderCode?: number | string;
  /** Fallback PayOS-hosted checkout URL. */
  checkoutUrl?: string;
  /** Where to redirect after payment succeeds. Default `/app`. */
  redirectTo?: string;
  /** Milliseconds to wait before redirecting on success. Default 1800. */
  redirectDelayMs?: number;
  /** Called when server confirms the order is PAID. */
  onPaid?: () => void;
}

export function PaymentScreen({
  orderId,
  qrCodeUrl,
  amount,
  orderCode,
  checkoutUrl,
  redirectTo = "/app",
  redirectDelayMs = 1800,
  onPaid,
}: PaymentScreenProps) {
  const [status, setStatus] = useState<OrderStatus>("PENDING");

  useEffect(() => {
    if (!orderId) return;

    let cancelled = false;

    // Safety net: fetch current status once on mount in case payment
    // completed before the Realtime channel subscribed.
    (async () => {
      try {
        const { data } = await supabase
          .from("orders")
          .select("status")
          .eq("id", orderId)
          .maybeSingle();
        if (!cancelled && data?.status === "PAID") {
          setStatus("PAID");
        }
      } catch (err) {
        console.error("[PaymentScreen] initial fetch failed", err);
      }
    })();

    const channel = supabase
      .channel(`order-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const next = (payload.new as { status?: OrderStatus })?.status;
          if (!next) return;
          setStatus(next);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  useEffect(() => {
    if (status !== "PAID") return;
    onPaid?.();
    const t = setTimeout(() => {
      window.location.href = redirectTo;
    }, redirectDelayMs);
    return () => clearTimeout(t);
  }, [status, onPaid, redirectTo, redirectDelayMs]);

  if (status === "PAID") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-green-500/30 bg-green-500/5 p-8 text-center">
        <CheckCircle2 className="h-16 w-16 text-green-500" />
        <h2 className="text-2xl font-semibold">Thanh toán thành công</h2>
        <p className="text-sm text-muted-foreground">
          Cảm ơn bạn! Credits đã được cộng vào tài khoản. Đang chuyển hướng…
        </p>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === "CANCELLED" || status === "FAILED") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
        <h2 className="text-xl font-semibold text-destructive">
          Thanh toán không thành công
        </h2>
        <p className="text-sm text-muted-foreground">
          Đơn hàng đã bị huỷ hoặc thất bại. Vui lòng thử lại.
        </p>
        <Button onClick={() => (window.location.href = "/pricing")}>
          Quay lại trang giá
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-5 rounded-2xl border bg-card p-8 shadow-sm">
      <div className="text-center">
        <h2 className="text-xl font-semibold">Quét mã VietQR để thanh toán</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sử dụng app ngân hàng có hỗ trợ VietQR
        </p>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <QRCodeSVG value={qrCodeUrl} size={240} level="M" includeMargin={false} />
      </div>

      {typeof amount === "number" && (
        <div className="text-center">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Số tiền
          </div>
          <div className="text-2xl font-bold">
            {amount.toLocaleString("vi-VN")} ₫
          </div>
          {orderCode !== undefined && (
            <div className="mt-1 text-xs text-muted-foreground">
              Mã đơn: {String(orderCode)}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Đang chờ thanh toán…</span>
      </div>

      <div className="flex w-full flex-col gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(qrCodeUrl);
            toast.success("Đã copy mã VietQR");
          }}
        >
          <Copy className="mr-2 h-4 w-4" />
          Copy mã VietQR
        </Button>
        {checkoutUrl && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.open(checkoutUrl, "_blank", "noopener")}
          >
            Mở trang thanh toán PayOS
          </Button>
        )}
      </div>
    </div>
  );
}

export default PaymentScreen;
