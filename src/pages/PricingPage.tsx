import { Check, Sparkles, Coins } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCredits } from "@/hooks/useCredits";
import { CREDIT_PACKS } from "@/lib/creditPacks";

const PricingPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, session } = useAuth();
  const { balance, refresh: refreshCredits } = useCredits();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Handle VNPay return
  useEffect(() => {
    const isReturn = searchParams.get("vnpay_return") === "1";
    if (!isReturn || !session?.access_token) return;

    const vnpayParams: Record<string, string> = {};
    searchParams.forEach((v, k) => {
      if (k.startsWith("vnp_")) vnpayParams[k] = v;
    });

    if (!vnpayParams.vnp_ResponseCode) return;

    setVerifying(true);
    supabase.functions
      .invoke("vnpay-verify", {
        body: { vnpayParams },
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      .then(({ data, error }) => {
        if (error) {
          toast.error("Không thể xác minh thanh toán.");
        } else if (data?.success) {
          toast.success(`Nạp thành công ${data.credits} credits!`);
          refreshCredits();
        } else {
          toast.error(data?.message || "Thanh toán không thành công.");
        }
        // Clean URL
        navigate("/pricing", { replace: true });
      })
      .finally(() => setVerifying(false));
  }, [searchParams, session?.access_token]);

  const handleBuyPack = async (packId: string) => {
    if (!user || !session?.access_token) {
      navigate("/auth");
      return;
    }

    setCheckoutLoading(packId);
    try {
      const { data, error } = await supabase.functions.invoke("create-vnpay-payment", {
        body: { packId },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch {
      toast.error("Không thể tạo phiên thanh toán VNPay.");
    } finally {
      setCheckoutLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="mx-auto max-w-4xl px-6 pb-20 pt-20">
        <section className="mx-auto mb-12 max-w-3xl text-center">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Nạp credit OCR
          </p>
          <h1 className="mb-3 text-4xl font-bold tracking-tight text-foreground font-display">
            Mua credit để sử dụng OCR
          </h1>
          <p className="text-muted-foreground">
            1 credit = 1 lượt OCR (~0.01$). Mỗi ngày bạn được <strong>5 lượt miễn phí</strong>. Nạp thêm credit để dùng không giới hạn.
          </p>
        </section>

        {user && (
          <div className="mb-8 flex items-center justify-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <Coins className="h-5 w-5 text-primary" />
            <span className="text-lg font-semibold text-foreground">
              Số dư hiện tại: <span className="text-primary">{balance.toLocaleString()}</span> credits
            </span>
          </div>
        )}

        {verifying && (
          <div className="mb-8 text-center text-sm text-muted-foreground animate-pulse">
            Đang xác minh thanh toán...
          </div>
        )}

        <section className="grid gap-6 md:grid-cols-3">
          {/* Free tier card */}
          <article className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-foreground font-display">Miễn phí</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Mỗi ngày được 5 lượt OCR miễn phí khi đã đăng nhập.
            </p>
            <div className="mt-5 flex items-end gap-1">
              <span className="text-3xl font-bold text-foreground">0đ</span>
            </div>
            <ul className="mt-6 space-y-3">
              <li className="flex items-start gap-2 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>5 lượt OCR miễn phí mỗi ngày</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>Hỗ trợ tiếng Việt có dấu</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>Xuất Markdown, DOCX, PDF</span>
              </li>
            </ul>
            <Button className="mt-7 w-full" variant="outline" onClick={() => navigate("/app")}>
              Dùng miễn phí
            </Button>
          </article>

          {/* Credit pack cards */}
          {CREDIT_PACKS.map((pack, i) => (
            <article
              key={pack.id}
              className={`rounded-2xl border bg-card p-6 shadow-sm ${
                i === 0 ? "border-primary ring-1 ring-primary/20" : "border-border"
              }`}
            >
              {i === 0 && (
                <span className="mb-4 inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  Phổ biến
                </span>
              )}
              <h2 className="text-xl font-semibold text-foreground font-display">{pack.label}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {pack.credits.toLocaleString()} lượt OCR {pack.description}
              </p>
              <div className="mt-5 flex items-end gap-1">
                <span className="text-3xl font-bold text-foreground">
                  {pack.priceVnd.toLocaleString("vi-VN")}đ
                </span>
              </div>
              <ul className="mt-6 space-y-3">
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{pack.credits.toLocaleString()} credits không hết hạn</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>+ 5 lượt miễn phí mỗi ngày</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>Thanh toán qua VNPay QR</span>
                </li>
              </ul>
              <Button
                className="mt-7 w-full"
                variant={i === 0 ? "default" : "outline"}
                disabled={checkoutLoading === pack.id}
                onClick={() => handleBuyPack(pack.id)}
              >
                {checkoutLoading === pack.id ? "Đang xử lý..." : `Mua ${pack.label}`}
              </Button>
            </article>
          ))}
        </section>

        <div className="mt-10 text-center">
          <Link to="/app">
            <Button variant="ghost">Trở về trang OCR</Button>
          </Link>
        </div>
      </main>
    </div>
  );
};

export default PricingPage;
