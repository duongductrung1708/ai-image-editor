import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ScanText,
  Zap,
  Globe,
  Pencil,
  ArrowRight,
  ShieldCheck,
  FileOutput,
  Upload,
  ScanSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import DropZone from "@/components/DropZone";
import OCRWorkspace from "@/components/OCRWorkspace";
import BatchOCRWorkspace from "@/components/BatchOCRWorkspace";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const features = [
  {
    icon: ScanText,
    title: "OCR chính xác cao",
    desc: "Sử dụng AI Model hiện đại cho nhận diện văn bản tiếng Việt.",
  },
  {
    icon: Globe,
    title: "Hỗ trợ đa ngôn ngữ",
    desc: "Nhận diện tiếng Việt, tiếng Anh và nhiều ngôn ngữ khác cùng lúc.",
  },
  {
    icon: Pencil,
    title: "Chỉnh sửa trực tiếp",
    desc: "Xem bounding boxes trên ảnh gốc và chỉnh sửa text ngay trên trình duyệt.",
  },
  {
    icon: Zap,
    title: "Nhanh & tiện lợi",
    desc: "Kéo thả, dán từ clipboard — kết quả hiển thị trong vài giây.",
  },
  {
    icon: FileOutput,
    title: "Xuất file linh hoạt",
    desc: "Xuất Markdown hoặc Word để tái sử dụng nội dung nhanh chóng.",
  },
  {
    icon: ShieldCheck,
    title: "An toàn dữ liệu",
    desc: "Phiên làm việc rõ ràng, kiểm soát tốt hơn dữ liệu OCR của bạn.",
  },
];

const steps = [
  {
    icon: Upload,
    title: "Tải ảnh lên",
    desc: "Kéo thả một hoặc nhiều ảnh vào khu vực OCR.",
  },
  {
    icon: ScanSearch,
    title: "AI nhận diện",
    desc: "Hệ thống tự động trích xuất văn bản và giữ cấu trúc hợp lý.",
  },
  {
    icon: FileOutput,
    title: "Xuất kết quả",
    desc: "Tải về dạng Markdown hoặc Word để chỉnh sửa tiếp.",
  },
];

const audiences = [
  "Sinh viên số hóa tài liệu học tập",
  "Nhân sự văn phòng nhập liệu nhanh",
  "Nhóm vận hành xử lý biểu mẫu hàng ngày",
  "Doanh nghiệp cần chuẩn hóa tài liệu scan",
];

const LandingPage = () => {
  const [files, setFiles] = useState<File[] | null>(null);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const handleFilesSelect = useCallback(
    (picked: File[]) => {
      if (!picked.length) return;
      if (authLoading) return;
      if (!user) {
        toast.info("Đăng nhập để sử dụng OCR.");
        navigate(`/auth?redirect=${encodeURIComponent("/")}`);
        return;
      }
      const sorted = [...picked].sort((a, b) =>
        a.name.localeCompare(b.name, "vi", { numeric: true }),
      );
      setFiles(sorted);
    },
    [authLoading, user, navigate],
  );

  if (files && files.length > 1) {
    const clear = () => setFiles(null);
    return (
      <div className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-background">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <BatchOCRWorkspace
            files={files}
            onBack={clear}
            onPickAnother={clear}
          />
        </div>
      </div>
    );
  }

  if (files?.length === 1) {
    return (
      <div className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-background">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <OCRWorkspace imageFile={files[0]} onBack={() => setFiles(null)} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pb-20 pt-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5">
            <div className="h-2 w-2 rounded-full bg-accent" />
            <span className="text-xs font-medium text-muted-foreground">
              Powered by AI Model
            </span>
          </div>
          <h1 className="mb-4 text-5xl font-bold leading-tight tracking-tight text-foreground font-display">
            Nhận diện văn bản
            <br />
            <span className="text-primary">đa ngôn ngữ</span> bằng AI
          </h1>
          <p className="mx-auto mb-8 max-w-xl text-lg text-muted-foreground">
            Kéo thả hình ảnh, AI tự động trích xuất văn bản với bounding boxes.
            Chỉnh sửa trực tiếp trên trình duyệt.
          </p>
          <Link to="/app">
            <Button size="lg" className="gap-2 text-base px-8">
              Bắt đầu OCR miễn phí
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>

          <p className="mx-auto mt-10 max-w-md text-sm text-muted-foreground">
            Kéo thả một hoặc nhiều ảnh — OCR từng trang
          </p>
          <div className="mx-auto mt-4 flex w-full max-w-2xl justify-center">
            <DropZone onFilesSelect={handleFilesSelect} />
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-5xl px-6 pb-14">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Tính năng
          </p>
          <h2 className="mt-2 text-2xl font-bold text-foreground font-display">
            Những gì bạn nhận được
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Bộ công cụ OCR tập trung vào tốc độ, độ chính xác và khả năng chỉnh
            sửa sau khi nhận diện.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 * i }}
              className="rounded-xl border border-border bg-card p-6"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mb-1 text-base font-semibold text-foreground font-display">
                {f.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {f.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-5xl px-6 pb-14">
        <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card p-6 md:p-8">
          <div className="mb-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Quy trình
            </p>
            <h2 className="mt-2 text-2xl font-bold text-foreground font-display">
              Bắt đầu trong 3 bước
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Quy trình tối giản để bạn đi từ ảnh đầu vào đến tài liệu hoàn
              chỉnh.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((step, i) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.3, delay: 0.08 * i }}
                className="relative rounded-xl border border-primary/20 bg-background/90 p-6"
              >
                <span className="absolute -top-3 left-4 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-2 text-xs font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <div className="mb-3 mt-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <step.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mb-1 text-base font-semibold text-foreground font-display">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {step.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="audiences" className="mx-auto max-w-5xl px-6 pb-24">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Đối tượng
          </p>
          <h2 className="mt-2 text-2xl font-bold text-foreground font-display">
            Ai nên dùng MonkeyOCR?
          </h2>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 md:p-8">
          <h2 className="mb-4 text-xl font-semibold text-foreground font-display">
            Phù hợp với ai?
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {audiences.map((item) => (
              <div
                key={item}
                className="rounded-lg border border-border bg-background px-4 py-3 text-sm text-muted-foreground"
              >
                {item}
              </div>
            ))}
          </div>
          <div className="mt-6">
            <Link to="/pricing">
              <Button variant="outline" className="gap-2">
                Xem bảng giá
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card/40">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} MonkeyOCR</p>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 sm:justify-end">
            <Link to="/support" className="hover:text-foreground transition-colors">
              Hỗ trợ & FAQ
            </Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
