import Navbar from "@/components/Navbar";

const PrivacyPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="mx-auto max-w-3xl px-6 pb-20 pt-20">
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-display">
          Chính sách quyền riêng tư (Privacy Policy)
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Cập nhật lần cuối: 2026-04-15</p>

        <section className="mt-8 space-y-4 text-sm leading-6 text-foreground/90">
          <p>
            MonkeyOCR (“chúng tôi”) tôn trọng quyền riêng tư của bạn. Tài liệu/ảnh bạn tải lên có thể chứa
            dữ liệu nhạy cảm; vì vậy chính sách này mô tả rõ chúng tôi thu thập gì, dùng như thế nào và
            bạn có quyền gì đối với dữ liệu của mình.
          </p>

          <h2 className="mt-6 text-lg font-semibold text-foreground">1) Dữ liệu chúng tôi thu thập</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Dữ liệu tài khoản</strong>: email, tên hiển thị, ảnh đại diện (nếu bạn đăng nhập).
            </li>
            <li>
              <strong>Dữ liệu OCR</strong>: ảnh/tài liệu bạn gửi và văn bản/bounding boxes được trích xuất.
            </li>
            <li>
              <strong>Dữ liệu thanh toán</strong>: thông tin giao dịch/đối soát (ví dụ mã tham chiếu), không
              lưu thông tin thẻ.
            </li>
            <li>
              <strong>Dữ liệu kỹ thuật</strong>: log lỗi, thời gian xử lý, giới hạn tần suất (rate limit) để
              chống lạm dụng và bảo vệ hệ thống.
            </li>
          </ul>

          <h2 className="mt-6 text-lg font-semibold text-foreground">2) Mục đích sử dụng</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Cung cấp chức năng OCR và hiển thị/định dạng kết quả.</li>
            <li>Quản lý credit, chống gian lận/lạm dụng và đảm bảo an toàn vận hành.</li>
            <li>Hỗ trợ khách hàng, xử lý sự cố và cải thiện chất lượng sản phẩm.</li>
          </ul>

          <h2 className="mt-6 text-lg font-semibold text-foreground">3) Lưu trữ & thời hạn lưu</h2>
          <p>
            Theo mặc định, chúng tôi có thể lưu lịch sử OCR trong tài khoản của bạn để bạn xem lại. Bạn có
            thể xóa lịch sử trong trang hồ sơ (khi có tính năng). Chúng tôi có thể xóa/ẩn dữ liệu khi có yêu
            cầu hợp lệ hoặc theo chính sách lưu trữ nội bộ.
          </p>

          <h2 className="mt-6 text-lg font-semibold text-foreground">4) Chia sẻ dữ liệu với bên thứ ba</h2>
          <p>
            Để thực hiện OCR, dữ liệu ảnh có thể được gửi tới nhà cung cấp mô hình/AI mà bạn đang sử dụng
            (ví dụ Google Gemini hoặc nhà cung cấp OpenAI-compatible). Việc xử lý OCR phụ thuộc vào chính
            sách của nhà cung cấp đó. Chúng tôi chỉ gửi những gì cần thiết để thực hiện OCR.
          </p>

          <h2 className="mt-6 text-lg font-semibold text-foreground">5) Bảo mật</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Yêu cầu xác thực khi gọi API; áp dụng CORS allowlist cho môi trường production.</li>
            <li>Giới hạn tần suất (rate limit) và cơ chế chống gửi trùng (idempotency) cho endpoint thanh toán.</li>
            <li>Giảm thiểu dữ liệu lưu trữ và hạn chế truy cập theo nguyên tắc cần thiết.</li>
          </ul>

          <h2 className="mt-6 text-lg font-semibold text-foreground">6) Quyền của bạn</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Yêu cầu truy cập, chỉnh sửa hoặc xóa dữ liệu liên quan đến tài khoản của bạn.</li>
            <li>Yêu cầu xóa lịch sử OCR (nếu bạn không muốn lưu).</li>
          </ul>

          <h2 className="mt-6 text-lg font-semibold text-foreground">7) Liên hệ</h2>
          <p>
            Nếu có câu hỏi về quyền riêng tư, vui lòng liên hệ: <strong>support@monkeyocr.com</strong>
          </p>
        </section>
      </main>
    </div>
  );
};

export default PrivacyPage;

