import { Check, Sparkles } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { STRIPE_TIERS, type StripeTier } from "@/lib/stripeTiers";

const plans = [
  {
    tier: null as StripeTier | null,
    name: "Free",
    price: "0đ",
    period: "/tháng",
    model: "Model OCR Lite",
    outputQuality: "Chuẩn",
    description:
      "Phù hợp để trải nghiệm OCR cơ bản với đầu ra rõ ràng, dễ đọc.",
    features: [
      "Model Lite tối ưu cho tài liệu in rõ, bố cục đơn giản",
      "Đầu ra sạch cho đoạn văn ngắn và biểu mẫu cơ bản",
      "Giữ dấu tiếng Việt tốt trong điều kiện ảnh đủ sáng",
      "Phù hợp kiểm thử chất lượng OCR trước khi nâng cấp",
    ],
    cta: "Dùng miễn phí",
    highlighted: false,
  },
  {
    tier: "pro" as const,
    name: "Pro",
    price: "99.000đ",
    period: "/tháng",
    model: "Model OCR Pro v2",
    outputQuality: "Cao",
    description:
      "Dành cho người dùng cần chất lượng OCR cao trên tài liệu phức tạp và nhiều cột.",
    features: [
      "Model Pro v2 tăng độ chính xác trên ảnh mờ nhẹ và nghiêng nhẹ",
      "Tách cột, nhận diện bảng biểu và giữ ngắt dòng ổn định hơn",
      "Giảm lỗi ký tự dễ nhầm trong tiếng Việt có dấu",
      "Đầu ra phù hợp dùng ngay cho biên tập nội dung chuyên nghiệp",
    ],
    cta: "Chọn gói Pro",
    highlighted: true,
  },
  {
    tier: "business" as const,
    name: "Business",
    price: "499.000đ",
    period: "/tháng",
    model: "Model OCR Enterprise X",
    outputQuality: "Rất cao",
    description:
      "Dành cho doanh nghiệp cần đầu ra OCR ổn định nhất cho tài liệu khó và quy trình lớn.",
    features: [
      "Model Enterprise X ưu tiên tài liệu scan kém, nén và nhiễu cao",
      "Khả năng giữ bố cục nhiều cấp sát bản gốc cho hồ sơ dài",
      "Độ ổn định đầu ra cao giữa nhiều loại mẫu chứng từ khác nhau",
      "Phù hợp hệ thống cần chất lượng OCR nhất quán ở quy mô lớn",
    ],
    cta: "Chọn gói Business",
    highlighted: false,
  },
];

const PricingPage = () => {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const { tier: currentTier, refresh } = useSubscription();
  const [checkoutLoading, setCheckoutLoading] = useState<StripeTier | null>(
    null,
  );

  const accessToken = session?.access_token;

  useEffect(() => {
    // Optional: if you later change `success_url` to point here, this will refresh.
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "true") {
      toast.success("Thanh toán thành công! Đang cập nhật gói...");
      void refresh();
    }
  }, [refresh]);

  const canCheckout = (tier: StripeTier) =>
    Boolean(user && accessToken && STRIPE_TIERS[tier]);

  const handleCheckout = async (tier: StripeTier) => {
    if (!user || !accessToken) {
      navigate("/auth");
      return;
    }

    setCheckoutLoading(tier);
    try {
      const priceId = STRIPE_TIERS[tier].price_id;
      const { data, error } = await supabase.functions.invoke(
        "create-checkout",
        {
          body: { priceId },
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch {
      toast.error("Không thể tạo phiên thanh toán.");
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleSelectFree = () => {
    // Free users can go straight to OCR.
    navigate("/app");
  };

  const sortedPlans = useMemo(() => plans, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="mx-auto max-w-6xl px-6 pb-20 pt-20">
        <section className="mx-auto mb-12 max-w-3xl text-center">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Bảng giá linh hoạt
          </p>
          <h1 className="mb-3 text-4xl font-bold tracking-tight text-foreground font-display">
            Chọn gói phù hợp cho nhu cầu OCR
          </h1>
          <p className="text-muted-foreground">
            Các gói khác nhau chủ yếu ở chất lượng đầu ra OCR và model AI sử
            dụng. Đây là bảng giá tĩnh để tham khảo giao diện billing.
          </p>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          {sortedPlans.map((plan) => {
            const isCurrent = plan.tier && currentTier === plan.tier;
            const isCheckout = Boolean(plan.tier) && !isCurrent;

            const buttonLabel =
              plan.tier === null
                ? plan.cta
                : isCurrent
                  ? "Gói hiện tại"
                  : plan.cta;

            return (
              <article
                key={plan.name}
                className={`rounded-2xl border bg-card p-6 shadow-sm ${
                  plan.highlighted
                    ? "border-primary ring-1 ring-primary/20"
                    : "border-border"
                }`}
              >
                {plan.highlighted ? (
                  <span className="mb-4 inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    Phổ biến
                  </span>
                ) : null}

                <h2 className="text-xl font-semibold text-foreground font-display">
                  {plan.name}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {plan.description}
                </p>
                <div className="mt-4 space-y-2 rounded-lg border border-border bg-background/60 p-3">
                  <p className="text-xs text-muted-foreground">
                    Model:{" "}
                    <span className="font-medium text-foreground">
                      {plan.model}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Chất lượng đầu ra:{" "}
                    <span className="font-medium text-primary">
                      {plan.outputQuality}
                    </span>
                  </p>
                </div>

                <div className="mt-5 flex items-end gap-1">
                  <span className="text-3xl font-bold text-foreground">
                    {plan.price}
                  </span>
                  <span className="pb-1 text-sm text-muted-foreground">
                    {plan.period}
                  </span>
                </div>

                <ul className="mt-6 space-y-3">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className="mt-7 w-full"
                  variant={plan.highlighted ? "default" : "outline"}
                  disabled={
                    plan.tier !== null &&
                    (isCurrent || checkoutLoading === plan.tier)
                  }
                  onClick={() => {
                    if (plan.tier === null) {
                      handleSelectFree();
                      return;
                    }

                    if (!canCheckout(plan.tier)) {
                      navigate("/auth");
                      return;
                    }

                    void handleCheckout(plan.tier);
                  }}
                >
                  {checkoutLoading === plan.tier
                    ? "Đang xử lý..."
                    : buttonLabel}
                </Button>
              </article>
            );
          })}
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
