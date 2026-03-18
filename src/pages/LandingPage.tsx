import { Link } from "react-router-dom";
import { ScanText, Zap, Globe, Pencil, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";

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
];

const LandingPage = () => {
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
            <span className="text-xs font-medium text-muted-foreground">Powered by AI Model</span>
          </div>
          <h1 className="mb-4 text-5xl font-bold leading-tight tracking-tight text-foreground font-display">
            Nhận diện văn bản
            <br />
            <span className="text-primary">tiếng Việt</span> bằng AI
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
        </motion.div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="grid gap-6 sm:grid-cols-2">
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
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center">
        <p className="text-xs text-muted-foreground">
          VietOCR — Công cụ OCR tiếng Việt bằng AI
        </p>
      </footer>
    </div>
  );
};

export default LandingPage;
