import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";

const SUPPORT_EMAIL = "support@monkeyocr.com";
const TELEGRAM_URL = "https://t.me/monkeyocr";

const faqs: Array<{ q: string; a: string }> = [
  {
    q: "OCR có chính xác 100% không?",
    a: "Không. OCR phụ thuộc chất lượng ảnh (độ nét, độ nghiêng, ánh sáng) và mô hình AI. Bạn nên kiểm tra lại trước khi dùng cho mục đích quan trọng.",
  },
  {
    q: "Vì sao kết quả không giữ đúng căn lề/màu sắc như file gốc?",
    a: "Một số mô hình ưu tiên trích xuất chữ hơn là định dạng. MonkeyOCR có cơ chế hậu xử lý để hiển thị tốt hơn, nhưng vẫn có trường hợp cần chỉnh tay.",
  },
  {
    q: "Giới hạn file là bao nhiêu?",
    a: "Có giới hạn về số trang, dung lượng ảnh và timeout để đảm bảo hệ thống ổn định. Nếu gặp lỗi 'Image too large' hoặc 'Batch too large', hãy nén/cắt ảnh hoặc chia nhỏ lô.",
  },
  {
    q: "Tôi bị trừ credits nhưng OCR lỗi?",
    a: "Hệ thống cố gắng hoàn credits tự động khi OCR lỗi (best-effort). Nếu bạn vẫn thấy bất thường, hãy liên hệ support và gửi thời gian xảy ra lỗi.",
  },
  {
    q: "Tôi bị lỗi timeout/546?",
    a: "Thường do ảnh lớn hoặc mô hình phản hồi chậm. Hãy thử cắt ảnh, giảm độ phân giải, hoặc chọn mô hình nhanh hơn. Bạn cũng có thể OCR theo từng trang nhỏ.",
  },
  {
    q: "Dữ liệu OCR của tôi có được dùng để train model không?",
    a: "MonkeyOCR không dùng dữ liệu của bạn để huấn luyện. Tuy nhiên, ảnh có thể được gửi tới nhà cung cấp mô hình bạn đang dùng để xử lý OCR theo chính sách của họ.",
  },
];

const SupportPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="mx-auto max-w-3xl px-6 pb-20 pt-20">
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-display">
          Hỗ trợ & FAQ
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Nếu bạn gặp vấn đề về OCR/credits/thanh toán, hãy liên hệ theo các kênh dưới đây.
        </p>

        <section className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm font-semibold text-foreground">Email</p>
            <p className="mt-1 text-sm text-muted-foreground">{SUPPORT_EMAIL}</p>
            <div className="mt-3">
              <a href={`mailto:${SUPPORT_EMAIL}`}>
                <Button variant="outline" size="sm">Gửi email</Button>
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm font-semibold text-foreground">Telegram</p>
            <p className="mt-1 text-sm text-muted-foreground">{TELEGRAM_URL}</p>
            <div className="mt-3">
              <a href={TELEGRAM_URL} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">Mở Telegram</Button>
              </a>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-foreground">Câu hỏi thường gặp</h2>
          <div className="mt-4 space-y-3">
            {faqs.map((f) => (
              <div key={f.q} className="rounded-2xl border border-border bg-card p-5">
                <p className="text-sm font-semibold text-foreground">{f.q}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{f.a}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

export default SupportPage;

