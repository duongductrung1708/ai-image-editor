import { useCallback, useState } from "react";
import DropZone from "@/components/DropZone";
import OCRWorkspace from "@/components/OCRWorkspace";
import BatchOCRWorkspace from "@/components/BatchOCRWorkspace";
import Navbar from "@/components/Navbar";
import { AnimatePresence, motion } from "framer-motion";

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
    <div className="min-h-screen bg-background">
      <Navbar />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center px-6 pt-24"
      >
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-foreground font-display">
          OCR Tiếng Việt
        </h1>
        <p className="mb-8 text-muted-foreground">
          Kéo thả một hoặc nhiều ảnh — OCR từng trang và gộp Markdown / Word
        </p>
        <DropZone onFilesSelect={handleFilesSelect} />
      </motion.div>
    </div>
  );
};

export default AppPage;
