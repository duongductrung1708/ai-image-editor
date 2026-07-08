import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Loader2, ArrowLeft, Receipt as ReceiptIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface OrderReceipt {
  id: string;
  order_code: number;
  amount: number;
  description: string;
  status: string;
  paid_at: string | null;
  created_at: string;
  pack_id: string | null;
}

export default function ReceiptPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<OrderReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setError("Không tìm thấy mã đơn.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from("orders")
          .select(
            "id, order_code, amount, description, status, paid_at, created_at, pack_id",
          )
          .eq("id", orderId)
          .maybeSingle();
        if (cancelled) return;
        if (err) throw err;
        if (!data) {
          setError("Không tìm thấy đơn hàng này.");
        } else {
          setOrder(data as OrderReceipt);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message ?? "Lỗi tải đơn hàng");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const formatDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("vi-VN", {
          dateStyle: "long",
          timeStyle: "short",
        })
      : "—";

  return (
    <main className="min-h-screen bg-background py-16">
      <div className="mx-auto max-w-lg px-4">
        <div className="mb-6">
          <Button asChild variant="ghost" size="sm">
            <Link to="/app">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Quay lại trang chính
            </Link>
          </Button>
        </div>

        {loading && (
          <div className="flex items-center justify-center rounded-2xl border bg-card p-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
            <h1 className="text-lg font-semibold text-destructive">
              Không thể hiển thị biên lai
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </div>
        )}

        {!loading && order && (
          <article className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <header
              className={`flex flex-col items-center gap-3 p-8 text-center ${
                order.status === "PAID"
                  ? "bg-green-500/5 border-b border-green-500/20"
                  : "bg-muted/40 border-b"
              }`}
            >
              {order.status === "PAID" ? (
                <CheckCircle2 className="h-14 w-14 text-green-500" />
              ) : (
                <ReceiptIcon className="h-14 w-14 text-muted-foreground" />
              )}
              <h1 className="text-2xl font-semibold">
                {order.status === "PAID"
                  ? "Thanh toán thành công"
                  : `Đơn hàng: ${order.status}`}
              </h1>
              <p className="text-sm text-muted-foreground">
                {order.description}
              </p>
            </header>

            <dl className="divide-y">
              <Row label="Số tiền">
                <span className="text-xl font-bold">
                  {order.amount.toLocaleString("vi-VN")} ₫
                </span>
              </Row>
              <Row label="Mã đơn hàng">
                <span className="font-mono text-sm">{order.order_code}</span>
              </Row>
              {order.pack_id && (
                <Row label="Gói">
                  <span className="text-sm">{order.pack_id}</span>
                </Row>
              )}
              <Row label="Trạng thái">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    order.status === "PAID"
                      ? "bg-green-500/10 text-green-600 dark:text-green-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {order.status}
                </span>
              </Row>
              <Row label="Thời gian tạo">
                <span className="text-sm text-muted-foreground">
                  {formatDate(order.created_at)}
                </span>
              </Row>
              {order.paid_at && (
                <Row label="Thời gian thanh toán">
                  <span className="text-sm text-muted-foreground">
                    {formatDate(order.paid_at)}
                  </span>
                </Row>
              )}
            </dl>

            <div className="flex flex-col gap-2 border-t bg-muted/20 p-6 sm:flex-row sm:justify-end">
              <Button asChild variant="outline">
                <Link to="/pricing">Mua thêm credits</Link>
              </Button>
              <Button asChild>
                <Link to="/app">Quay lại trang chính</Link>
              </Button>
            </div>
          </article>
        )}
      </div>
    </main>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
