import Navbar from "@/components/Navbar";

const TermsPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="mx-auto max-w-3xl px-6 pb-20 pt-20">
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-display">
          Điều khoản sử dụng (Terms of Service)
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Cập nhật lần cuối: 2026-04-15</p>

        <section className="mt-8 space-y-4 text-sm leading-6 text-foreground/90">
          <p>
            Khi sử dụng MonkeyOCR, bạn đồng ý với các điều khoản dưới đây. Nếu bạn không đồng ý, vui lòng
            ngừng sử dụng dịch vụ.
          </p>

          <h2 className="mt-6 text-lg font-semibold text-foreground">1) Mô tả dịch vụ</h2>
          <p>
            MonkeyOCR cung cấp công cụ nhận dạng văn bản (OCR) từ hình ảnh/tài liệu và các tiện ích định
            dạng/xuất dữ liệu. Kết quả OCR có thể sai lệch; bạn cần kiểm tra lại trước khi dùng cho mục đích
            quan trọng.
          </p>

          <h2 className="mt-6 text-lg font-semibold text-foreground">2) Tài khoản & truy cập</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Bạn chịu trách nhiệm bảo mật tài khoản và thiết bị đăng nhập của mình.</li>
            <li>Không được chia sẻ token/khóa truy cập hoặc khai thác API trái phép.</li>
          </ul>

          <h2 className="mt-6 text-lg font-semibold text-foreground">3) Dữ liệu OCR & nội dung nhạy cảm</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Bạn đảm bảo có quyền hợp pháp để tải lên và xử lý tài liệu/ảnh.</li>
            <li>
              Bạn không được dùng dịch vụ để xử lý nội dung bất hợp pháp hoặc vi phạm quyền sở hữu trí tuệ.
            </li>
          </ul>

          <h2 className="mt-6 text-lg font-semibold text-foreground">4) Credits, thanh toán và hoàn tiền</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>OCR có thể tiêu tốn credits theo cấu hình gói/đơn giá tại thời điểm sử dụng.</li>
            <li>
              Chúng tôi có thể hoàn credits theo cơ chế tự động khi OCR lỗi (best-effort) hoặc theo chính
              sách hỗ trợ.
            </li>
            <li>
              Với giao dịch thanh toán, bạn đồng ý tuân thủ điều kiện của cổng thanh toán (VNPay/Stripe).
            </li>
          </ul>

          <h2 className="mt-6 text-lg font-semibold text-foreground">5) Giới hạn trách nhiệm</h2>
          <p>
            Dịch vụ được cung cấp “như hiện có”. Chúng tôi không chịu trách nhiệm cho thiệt hại gián tiếp do
            việc sử dụng kết quả OCR không được kiểm tra/đối soát.
          </p>

          <h2 className="mt-6 text-lg font-semibold text-foreground">6) Tạm ngưng/chấm dứt</h2>
          <p>
            Chúng tôi có thể tạm ngưng hoặc chấm dứt quyền truy cập nếu phát hiện lạm dụng, gian lận, hoặc
            vi phạm điều khoản.
          </p>

          <h2 className="mt-6 text-lg font-semibold text-foreground">7) Thay đổi điều khoản</h2>
          <p>
            Chúng tôi có thể cập nhật điều khoản theo thời gian. Việc bạn tiếp tục sử dụng sau khi cập nhật
            được xem là chấp nhận điều khoản mới.
          </p>

          <h2 className="mt-6 text-lg font-semibold text-foreground">8) Liên hệ</h2>
          <p>
            Hỗ trợ/điều khoản: <strong>support@monkeyocr.com</strong>
          </p>
        </section>
      </main>
    </div>
  );
};

export default TermsPage;

