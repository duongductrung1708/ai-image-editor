import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DropZone from "@/components/DropZone";
import OCRWorkspace from "@/components/OCRWorkspace";
import BatchOCRWorkspace from "@/components/BatchOCRWorkspace";
import Navbar from "@/components/Navbar";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
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
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const historyId = useMemo(
    () => searchParams.get("historyId"),
    [searchParams],
  );

  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resumeEntry, setResumeEntry] = useState<{
    id: string;
    image_name: string;
    extracted_text: string;
    image_data: string | null;
    bounding_boxes: Json | null;
    created_at: string;
  } | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeBatchFiles, setResumeBatchFiles] = useState<File[] | null>(null);

  const handleFilesSelect = useCallback((picked: File[]) => {
    if (!picked.length) return;
    const sorted = [...picked].sort((a, b) =>
      a.name.localeCompare(b.name, "vi", { numeric: true }),
    );
    setFiles(sorted);
  }, []);

  useEffect(() => {
    if (!historyId) return;
    // If user navigates between different history items, clear any previously
    // selected files so the history loader always takes precedence.
    if (files && files.length > 0) {
      setFiles(null);
    }
    // Wait for files to be cleared before continuing (prevents stale UI).
    if (files && files.length > 0) return;

    let cancelled = false;
    const run = async () => {
      setResumeLoading(true);
      setResumeError(null);
      setResumeEntry(null);
      setResumeFile(null);
      setResumeBatchFiles(null);
      try {
        const { data, error } = await supabase
          .from("ocr_history")
          .select(
            "id, image_name, extracted_text, image_data, bounding_boxes, created_at",
          )
          .eq("id", historyId)
          .maybeSingle();

        if (error) {
          throw error;
        }
        if (!data) {
          throw new Error(
            "Không tìm thấy bản ghi lịch sử (hoặc bạn không có quyền truy cập).",
          );
        }

        const entry = data as {
          id: string;
          image_name: string;
          extracted_text: string;
          image_data: string | null;
          bounding_boxes: Json | null;
          created_at: string;
        };

        let file: File;
        if (entry.image_data) {
          const res = await fetch(entry.image_data);
          const blob = await res.blob();
          const type = blob.type || "image/png";
          file = new File([blob], entry.image_name || "ocr-history.png", {
            type,
          });
        } else {
          file = new File(
            [new Blob([])],
            entry.image_name || "ocr-history.png",
            {
              type: "image/png",
            },
          );
        }

        if (cancelled) return;
        const bb = entry.bounding_boxes;
        const isBatch =
          bb &&
          typeof bb === "object" &&
          !Array.isArray(bb) &&
          (bb as { batch?: boolean }).batch === true;

        if (isBatch) {
          // Prefer loading pages from ocr_batch_pages (most reliable & includes image_data).
          const batchSessionId =
            typeof (bb as { batch_session_id?: string }).batch_session_id === "string"
              ? (bb as { batch_session_id: string }).batch_session_id
              : null;

          let pages: Array<{ file_name: string; image_data: string | null }> = [];
          if (batchSessionId) {
            const { data: pageRows } = await supabase
              .from("ocr_batch_pages")
              .select("file_name, image_data, page_index")
              .eq("session_id", batchSessionId)
              .order("page_index", { ascending: true });
            pages = (pageRows ?? []).map((p) => ({
              file_name: p.file_name,
              image_data: p.image_data ?? null,
            }));
          }

          // Fallback: bounding_boxes.pages[] (older rows can still contain image_data here).
          if (pages.length === 0) {
            const inlinePages = Array.isArray((bb as { pages?: unknown }).pages)
              ? ((bb as { pages?: Array<{ name?: string; image_data?: string | null }> }).pages ?? [])
              : [];
            pages = inlinePages.map((p, idx) => ({
              file_name: typeof p.name === "string" && p.name.trim() ? p.name : `Trang ${idx + 1}`,
              image_data: p.image_data ?? null,
            }));
          }

          const batchFiles = await Promise.all(
            pages.map(async (p, idx) => {
              if (p.image_data) {
                const res = await fetch(p.image_data);
                const blob = await res.blob();
                const type = blob.type || "image/png";
                return new File([blob], p.file_name || `page-${idx + 1}.png`, { type });
              }
              return new File([new Blob([])], p.file_name || `page-${idx + 1}.png`, {
                type: "image/png",
              });
            }),
          );

          if (cancelled) return;
          setResumeEntry(entry);
          setResumeBatchFiles(batchFiles.length > 0 ? batchFiles : [file]);
          setResumeFile(null);
          return;
        }

        setResumeEntry(entry);
        setResumeFile(file);
      } catch (e: unknown) {
        if (cancelled) return;
        const msg =
          e instanceof Error ? e.message : "Không thể mở bản ghi lịch sử.";
        setResumeError(msg);
      } finally {
        if (!cancelled) setResumeLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [files, historyId]);

  if (historyId && (resumeLoading || resumeEntry || resumeError)) {
    if (resumeLoading) {
      return (
        <div className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-background">
          <Navbar />
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="text-sm text-muted-foreground">
              Đang mở lịch sử OCR...
            </div>
          </div>
        </div>
      );
    }

    if (resumeError) {
      return (
        <div className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-background">
          <Navbar />
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="max-w-md text-center">
              <p className="text-sm text-destructive">{resumeError}</p>
            </div>
          </div>
        </div>
      );
    }

    if (resumeEntry && resumeBatchFiles && resumeBatchFiles.length > 0) {
      return (
        <div className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-background">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <BatchOCRWorkspace
              files={resumeBatchFiles}
              onBack={() => navigate("/app")}
              onPickAnother={() => navigate("/app")}
              initialHistoryEntry={resumeEntry}
            />
          </div>
        </div>
      );
    }

    if (!resumeFile) {
      return (
        <div className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-background">
          <Navbar />
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="text-sm text-muted-foreground">
              Không thể tải ảnh từ lịch sử.
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-background">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <OCRWorkspace
            imageFile={resumeFile}
            onBack={() => navigate("/app")}
            initialHistoryEntry={resumeEntry}
          />
        </div>
      </div>
    );
  }

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
