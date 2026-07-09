import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  CheckCircle2,
  Loader2,
  Copy,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
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
  /** Where to redirect after payment succeeds. Default `/receipt/{orderId}`. */
  redirectTo?: string;
  /** Milliseconds to wait before redirecting on success. Default 1800. */
  redirectDelayMs?: number;
  /** Polling interval as Realtime fallback (ms). Default 5000. */
  pollIntervalMs?: number;
  /** After this many ms without payment, show a timeout + retry UI. Default 5 minutes. */
  timeoutMs?: number;
  /** Called when server confirms the order is PAID. */
  onPaid?: () => void;
  /**
   * Called when the user clicks "Thử lại" from the timeout screen.
   * Typically re-invokes `create-payment-link` and remounts this component
   * with the new orderId / qrCode.
   */
  onRetry?: () => void | Promise<void>;
}

export function PaymentScreen({
  orderId,
  qrCodeUrl,
  amount,
  orderCode,
  checkoutUrl,
  redirectTo,
  redirectDelayMs = 1800,
  pollIntervalMs = 5000,
  timeoutMs = 5 * 60 * 1000,
  onPaid,
  onRetry,
}: PaymentScreenProps) {
  const [status, setStatus] = useState<OrderStatus>("PENDING");
  const [timedOut, setTimedOut] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number>(timeoutMs);
  const startedAtRef = useRef<number>(Date.now());

  const effectiveRedirect = redirectTo ?? `/receipt/${orderId}`;

  // Central status resolver used by both Realtime + polling paths.
  const fetchStatus = useCallback(async (): Promise<OrderStatus | null> => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("status")
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      return (data?.status as OrderStatus | undefined) ?? null;
    } catch (err) {
      console.error("[PaymentScreen] fetch status failed", err);
      return null;
    }
  }, [orderId]);

  // Realtime subscription + initial fetch.
  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;

    startedAtRef.current = Date.now();
    setTimedOut(false);

    (async () => {
      const s = await fetchStatus();
      if (!cancelled && s) setStatus(s);
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
          if (next) setStatus(next);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [orderId, fetchStatus]);

  // Polling fallback — runs while PENDING and not yet timed out.
  useEffect(() => {
    if (status !== "PENDING" || timedOut) return;
    const iv = window.setInterval(async () => {
      const s = await fetchStatus();
      if (s && s !== "PENDING") setStatus(s);
    }, pollIntervalMs);
    return () => window.clearInterval(iv);
  }, [status, timedOut, pollIntervalMs, fetchStatus]);

  // Timeout — if still PENDING after timeoutMs, surface the retry UI.
  useEffect(() => {
    if (status !== "PENDING") return;
    const remaining = Math.max(
      0,
      timeoutMs - (Date.now() - startedAtRef.current),
    );
    const t = window.setTimeout(() => setTimedOut(true), remaining);
    return () => window.clearTimeout(t);
  }, [status, timeoutMs]);

  // Redirect on PAID.
  useEffect(() => {
    if (status !== "PAID") return;
    onPaid?.();
    const t = window.setTimeout(() => {
      window.location.href = effectiveRedirect;
    }, redirectDelayMs);
    return () => window.clearTimeout(t);
  }, [status, onPaid, effectiveRedirect, redirectDelayMs]);

  const handleRetry = useCallback(async () => {
    if (!onRetry) {
      window.location.reload();
      return;
    }
    setRetrying(true);
    try {
      await onRetry();
    } catch (err) {
      console.error("[PaymentScreen] retry failed", err);
      toast.error("Không thể tạo lại đơn thanh toán. Vui lòng thử lại.");
    } finally {
      setRetrying(false);
    }
  }, [onRetry]);

  const handleCheckNow = useCallback(async () => {
    const s = await fetchStatus();
    if (s) {
      setStatus(s);
      if (s === "PENDING") toast.info("Đơn hàng vẫn đang chờ thanh toán.");
    }
  }, [fetchStatus]);

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
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          {onRetry && (
            <Button onClick={handleRetry} disabled={retrying}>
              {retrying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Thử lại
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => (window.location.href = "/pricing")}
          >
            Quay lại trang giá
          </Button>
        </div>
      </div>
    );
  }

  if (timedOut) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-8 text-center">
        <AlertTriangle className="h-14 w-14 text-amber-500" />
        <h2 className="text-xl font-semibold">Chưa nhận được thanh toán</h2>
        <p className="text-sm text-muted-foreground">
          Chúng tôi chưa xác nhận được giao dịch của bạn. Nếu đã chuyển khoản,
          vui lòng bấm "Kiểm tra ngay". Nếu chưa, hãy tạo lại đơn thanh toán mới.
        </p>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="outline" onClick={handleCheckNow}>
            Kiểm tra ngay
          </Button>
          <Button onClick={handleRetry} disabled={retrying}>
            {retrying ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Tạo lại đơn thanh toán
          </Button>
        </div>
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
        <Button variant="ghost" size="sm" onClick={handleCheckNow}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Kiểm tra trạng thái
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
