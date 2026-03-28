import { useCallback, useState } from "react";
import DropZone from "@/components/DropZone";
import OCRWorkspace from "@/components/OCRWorkspace";
import BatchOCRWorkspace from "@/components/BatchOCRWorkspace";
import Navbar from "@/components/Navbar";
import { motion } from "framer-motion";
import {
  FileSearch,
  Files,
  FileText,
  Sparkles,
  ListChecks,
  Upload,
  ScanSearch,
  FileOutput,
} from "lucide-react";

const featureItems = [
  {
    title: "Nhận diện tiếng Việt tốt",
    icon: FileSearch,
    description:
      "Tối ưu cho tài liệu có dấu, biểu mẫu và văn bản scan chất lượng trung bình.",
  },
  {
    title: "Xử lý hàng loạt",
    icon: Files,
    description:
      "Tải lên nhiều ảnh cùng lúc, OCR theo thứ tự tên file và xem kết quả theo từng trang.",
  },
  {
    title: "Xuất kết quả linh hoạt",
    icon: FileText,
    description:
      "Gộp nội dung ra Markdown hoặc Word để tiếp tục chỉnh sửa và lưu trữ nhanh hơn.",
  },
];

const quickSteps = [
  {
    text: "Kéo thả ảnh vào vùng tải lên hoặc bấm chọn file từ máy.",
    icon: Upload,
  },
  {
    text: "Kiểm tra nhanh kết quả OCR theo từng ảnh, chỉnh sửa nếu cần.",
    icon: ScanSearch,
  },
  {
    text: "Xuất toàn bộ nội dung sang định dạng phù hợp để chia sẻ.",
    icon: FileOutput,
  },
];

const AppPage = () => {
  const [files, setFiles] = useState<File[] | null>(null);

  const handleFilesSelect = useCallback((picked: File[]) => {
    if (!picked.length) return;
    const sorted = [...picked].sort((a, b) =>
      a.name.localeCompare(b.name, "vi", { numeric: true }),
    );
    setFiles(sorted);
  }, []);

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
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute right-[-120px] top-1/3 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-[-140px] left-1/3 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      </div>
      <Navbar />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center px-6 pb-12 pt-24"
      >
        <h1 className="mb-2 flex items-center gap-2 text-3xl font-bold tracking-tight text-primary font-display">
          <Sparkles className="h-6 w-6" />
          OCR Ảnh Văn Bản
        </h1>
        <p className="mb-8 text-center text-muted-foreground">
          Kéo thả một hoặc nhiều ảnh — OCR từng trang và gộp Markdown / Word
        </p>
        <DropZone onFilesSelect={handleFilesSelect} />

        <section className="mt-10 grid w-full grid-cols-1 gap-4 md:grid-cols-3">
          {featureItems.map((item) => (
            <article
              key={item.title}
              className="rounded-xl border border-border bg-card p-6"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <item.icon className="h-5 w-5 text-primary" />
              </div>
              <h2 className="mb-1 text-base font-semibold text-foreground font-display">
                {item.title}
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </article>
          ))}
        </section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.35, delay: 0.12 }}
          className="mt-8 w-full rounded-xl border border-border bg-card p-6"
        >
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground font-display">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <ListChecks className="h-5 w-5 text-primary" />
            </span>
            Quy trình nhanh
          </h2>
          <ol className="space-y-3">
            {quickSteps.map((step, index) => (
              <motion.li
                key={step.text}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.25, delay: 0.08 * index }}
                className="flex items-start gap-3"
              >
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                <div className="flex items-start gap-2">
                  <step.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary/80" />
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {step.text}
                  </p>
                </div>
              </motion.li>
            ))}
          </ol>
        </motion.section>
      </motion.div>
    </div>
  );
};

export default AppPage;
