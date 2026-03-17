import { useState } from "react";
import DropZone from "@/components/DropZone";
import OCRWorkspace from "@/components/OCRWorkspace";
import Navbar from "@/components/Navbar";
import { AnimatePresence, motion } from "framer-motion";

const AppPage = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  if (selectedFile) {
    return (
      <OCRWorkspace
        imageFile={selectedFile}
        onBack={() => setSelectedFile(null)}
      />
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
          Kéo thả hình ảnh để nhận diện và chỉnh sửa văn bản tiếng Việt bằng AI
        </p>
        <DropZone onImageSelect={setSelectedFile} />
      </motion.div>
    </div>
  );
};

export default AppPage;
