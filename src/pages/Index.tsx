import { useCallback, useState } from "react";
import DropZone from "@/components/DropZone";
import OCRWorkspace from "@/components/OCRWorkspace";
import BatchOCRWorkspace from "@/components/BatchOCRWorkspace";
import { AnimatePresence, motion } from "framer-motion";

const Index = () => {
  const [files, setFiles] = useState<File[] | null>(null);

  const handleFilesSelect = useCallback((picked: File[]) => {
    if (!picked.length) return;
    const sorted = [...picked].sort((a, b) =>
      a.name.localeCompare(b.name, "vi", { numeric: true }),
    );
    setFiles(sorted);
  }, []);

  return (
    <AnimatePresence mode="wait">
      {files && files.length > 1 ? (
        <motion.div
          key="batch"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <BatchOCRWorkspace
            files={files}
            onBack={() => setFiles(null)}
            onPickAnother={() => setFiles(null)}
          />
        </motion.div>
      ) : files?.length === 1 ? (
        <motion.div
          key="workspace"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <OCRWorkspace imageFile={files[0]} onBack={() => setFiles(null)} />
        </motion.div>
      ) : (
        <motion.div
          key="dropzone"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <DropZone onFilesSelect={handleFilesSelect} />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Index;
